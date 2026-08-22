/**
 * offlineSync.ts
 * Traite la file d'attente offline dès que la connexion revient.
 * Rejoue automatiquement les mutations en attente dans l'ordre.
 */
import { getAll, remove, incrementRetry } from './offlineQueue';
import type { QueueItem } from './offlineQueue';
import { supabase } from './supabase';
import { uploadFile } from './api';

let syncInProgress = false;

/**
 * Convertit une data URL base64 en File
 */
function dataURLtoFile(dataUrl: string, filename: string): File {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const byteStr = atob(data);
  const arr = new Uint8Array(byteStr.length);
  for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/**
 * Exécute un élément de la file selon son type
 */
async function executeItem(item: QueueItem): Promise<void> {
  switch (item.type) {
    case 'CREATE_REQUEST': {
      const { error } = await supabase.from('requests').insert(item.payload);
      if (error) throw error;
      break;
    }

    case 'UPSERT_DOCUMENTS': {
      const { request_id, uid } = item.payload as {
        request_id: string;
        uid: string;
        doc_front_url?: string;
        doc_back_url?: string;
        live_photo_url?: string;
      };

      // Si des fichiers sont stockés en base64, les uploader d'abord
      const urls: Record<string, string> = {};
      if (item.files) {
        for (const [key, dataUrl] of Object.entries(item.files)) {
          const file = dataURLtoFile(dataUrl, `${key}_${Date.now()}.jpg`);
          const bucket = key === 'live' ? 'live-photos' : 'id-documents';
          const path = `${uid}/${request_id}_${key}.jpg`;
          const url = await uploadFile(bucket, path, file);
          if (!url) throw new Error(`Upload échoué pour ${key}`);
          urls[`${key}_url`] = url;
        }
      }

      const docPayload = {
        request_id,
        doc_front_url: urls['front_url'] ?? (item.payload as Record<string, string>).doc_front_url,
        doc_back_url: urls['back_url'] ?? (item.payload as Record<string, string>).doc_back_url,
        live_photo_url: urls['live_url'] ?? (item.payload as Record<string, string>).live_photo_url,
      };

      const { error } = await supabase
        .from('request_documents')
        .upsert(docPayload, { onConflict: 'request_id' });
      if (error) throw error;
      break;
    }

    case 'UPDATE_REQUEST_STATUS': {
      const { id, status, ...rest } = item.payload as {
        id: string;
        status: string;
        [k: string]: unknown;
      };
      const { error } = await supabase
        .from('requests')
        .update({ status, ...rest })
        .eq('id', id);
      if (error) throw error;
      break;
    }

    case 'CREATE_NOTIFICATION': {
      const { error } = await supabase.from('notifications').insert(item.payload);
      if (error) throw error;
      break;
    }

    default:
      console.warn('Type de file inconnu :', (item as QueueItem).type);
  }
}

/**
 * Synchronise toute la file d'attente.
 * Appeler cette fonction dès que `isOnline` redevient true.
 */
export async function syncOfflineQueue(
  onProgress?: (processed: number, total: number) => void
): Promise<{ processed: number; failed: number }> {
  if (syncInProgress) return { processed: 0, failed: 0 };
  syncInProgress = true;

  let processed = 0;
  let failed = 0;

  try {
    const items = await getAll();
    const total = items.length;

    for (const item of items) {
      try {
        await executeItem(item);
        await remove(item.id);
        processed++;
        onProgress?.(processed, total);
      } catch (err) {
        console.error(`Échec sync item ${item.id}:`, err);
        if (item.retries >= item.maxRetries) {
          // Abandon après maxRetries tentatives
          await remove(item.id);
          failed++;
        } else {
          await incrementRetry(item.id);
          failed++;
        }
      }
    }
  } finally {
    syncInProgress = false;
  }

  return { processed, failed };
}
