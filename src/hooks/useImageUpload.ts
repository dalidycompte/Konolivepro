/**
 * useImageUpload.ts
 * Hook unifié pour capturer + compresser + uploader des images vers Supabase Storage.
 * — Sur Android natif : utilise le plugin Capacitor Camera (caméra native haute qualité)
 * — Sur web          : ouvre un <input type="file"> ou getUserMedia
 * — Compression      : redimensionne à max 1080p et encode en JPEG/WEBP (qualité 0.8)
 * — Upload           : Supabase Storage avec URL publique retournée
 * — Offline          : si hors ligne, stocke en base64 dans offlineQueue pour upload différé
 */
import { useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { enqueue } from '@/lib/offlineQueue';

export interface UploadResult {
  url: string;
  path: string;
  fromQueue: boolean; // true si mis en file d'attente offline
}

export interface UseImageUploadOptions {
  bucket: string;
  /** Chemin dans le bucket, ex: "user123/request456_front.jpg" */
  pathPrefix?: string;
  /** Qualité JPEG 0-1 (défaut: 0.82) */
  quality?: number;
  /** Largeur max en pixels (défaut: 1080) */
  maxWidth?: number;
  /** Hauteur max en pixels (défaut: 1080) */
  maxHeight?: number;
}

export function useImageUpload(opts: UseImageUploadOptions) {
  const {
    bucket,
    pathPrefix = '',
    quality = 0.82,
    maxWidth = 1080,
    maxHeight = 1080,
  } = opts;

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // ── Compression canvas ──────────────────────────────────────────────────────
  const compressImage = useCallback(
    (file: File): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let { width, height } = img;

          // Redimensionne en conservant le ratio
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width  = Math.round(width  * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width  = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas non supporté')); return; }
          ctx.drawImage(img, 0, 0, width, height);

          // Préfère WEBP si supporté, sinon JPEG
          const mimeType = canvas.toDataURL('image/webp').startsWith('data:image/webp')
            ? 'image/webp'
            : 'image/jpeg';

          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('Compression échouée')),
            mimeType,
            quality
          );
        };
        img.onerror = () => reject(new Error('Lecture image impossible'));
        img.src = url;
      });
    },
    [maxWidth, maxHeight, quality]
  );

  // ── Lecture base64 pour le stockage offline ──────────────────────────────────
  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  // ── Sélection de l'image ─────────────────────────────────────────────────────
  const pickImage = useCallback(
    async (facingMode: 'environment' | 'user' = 'environment'): Promise<File | null> => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { Camera, CameraResultType, CameraSource, CameraDirection } =
            await import('@capacitor/camera');
          const photo = await Camera.getPhoto({
            quality: Math.round(quality * 100),
            resultType: CameraResultType.Base64,
            source: CameraSource.Camera,
            direction: facingMode === 'user' ? CameraDirection.Front : CameraDirection.Rear,
            allowEditing: false,
            saveToGallery: false,
          });
          if (!photo.base64String) return null;
          const byteChars = atob(photo.base64String);
          const arr = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) arr[i] = byteChars.charCodeAt(i);
          return new File([arr], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.toLowerCase().includes('cancel')) toast.error('Erreur caméra : ' + msg);
          return null;
        }
      }
      // Fallback web : input file
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = facingMode === 'user' ? 'user' : 'environment';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
      });
    },
    [quality]
  );

  // ── Upload principal ──────────────────────────────────────────────────────────
  const uploadImage = useCallback(
    async (
      file: File,
      subPath: string,
      offlineMeta?: { type: 'front' | 'back' | 'live'; requestId: string; uid: string }
    ): Promise<UploadResult | null> => {
      setUploading(true);
      setProgress(10);

      try {
        // 1. Compression
        const compressed = await compressImage(file);
        setProgress(40);

        const ext  = compressed.type === 'image/webp' ? 'webp' : 'jpg';
        const path = pathPrefix
          ? `${pathPrefix}/${subPath}.${ext}`
          : `${subPath}.${ext}`;

        // 2. Vérification réseau
        if (!navigator.onLine) {
          // Mode hors ligne : stocke en base64 dans la file d'attente
          if (!offlineMeta) {
            toast.warning('Hors ligne — image en file d\'attente');
            return null;
          }
          const base64 = await blobToBase64(compressed);
          setProgress(80);

          await enqueue('UPSERT_DOCUMENTS', {
            request_id: offlineMeta.requestId,
            uid: offlineMeta.uid,
          }, { [offlineMeta.type]: base64 });

          setProgress(100);
          toast.info('Image sauvegardée localement — sera envoyée au retour en ligne.');
          return { url: '', path, fromQueue: true };
        }

        // 3. Upload Supabase Storage
        const uploadFile = new File([compressed], path.split('/').pop() ?? 'image', {
          type: compressed.type,
        });

        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, uploadFile, { upsert: true, contentType: compressed.type });

        setProgress(90);

        if (error || !data) {
          throw new Error(error?.message ?? 'Upload échoué');
        }

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
        setProgress(100);

        toast.success('Image envoyée avec succès !');
        return { url: urlData.publicUrl, path: data.path, fromQueue: false };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur upload';
        toast.error(msg);
        return null;
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(0), 800);
      }
    },
    [bucket, pathPrefix, compressImage]
  );

  // ── Capture + upload en une seule action ────────────────────────────────────
  const captureAndUpload = useCallback(
    async (
      subPath: string,
      facingMode: 'environment' | 'user' = 'environment',
      offlineMeta?: { type: 'front' | 'back' | 'live'; requestId: string; uid: string }
    ): Promise<UploadResult | null> => {
      const file = await pickImage(facingMode);
      if (!file) return null;
      return uploadImage(file, subPath, offlineMeta);
    },
    [pickImage, uploadImage]
  );

  return { uploading, progress, pickImage, uploadImage, captureAndUpload };
}
