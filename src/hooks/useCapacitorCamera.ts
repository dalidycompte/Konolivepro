/**
 * useCapacitorCamera.ts
 * Hook caméra unifié : utilise le plugin Capacitor Camera sur Android natif
 * et bascule vers getUserMedia (WebRTC) en environnement web.
 * Retourne toujours un File JPEG utilisable dans les formulaires.
 */
import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

export type CameraFacing = 'environment' | 'user';

export interface CaptureOptions {
  facingMode?: CameraFacing;
  quality?: number; // 0-100
}

export function useCapacitorCamera() {
  /**
   * Ouvre la caméra native (Capacitor) ou WebRTC (web).
   * Résout avec un File JPEG ou null si annulé/erreur.
   */
  const capturePhoto = useCallback(
    async (opts: CaptureOptions = {}): Promise<File | null> => {
      const { facingMode = 'environment', quality = 85 } = opts;
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // ── Chemin natif : plugin Capacitor Camera ────────────────────────
        try {
          const { Camera, CameraResultType, CameraSource, CameraDirection } =
            await import('@capacitor/camera');
          const photo = await Camera.getPhoto({
            quality,
            resultType: CameraResultType.Base64,
            source: CameraSource.Camera,
            direction:
              facingMode === 'user'
                ? CameraDirection.Front
                : CameraDirection.Rear,
            allowEditing: false,
            saveToGallery: false,
          });

          if (!photo.base64String) return null;

          // Convertit base64 → Blob → File
          const byteChars = atob(photo.base64String);
          const byteArr = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteArr[i] = byteChars.charCodeAt(i);
          }
          const blob = new Blob([byteArr], { type: 'image/jpeg' });
          return new File([blob], `capture_${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('cancelled') && !msg.includes('User cancelled')) {
            toast.error('Erreur caméra : ' + msg);
          }
          return null;
        }
      } else {
        // ── Chemin web : getUserMedia ─────────────────────────────────────
        return new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.capture = facingMode === 'user' ? 'user' : 'environment';
          input.onchange = () => {
            const file = input.files?.[0] ?? null;
            resolve(file);
          };
          input.click();
        });
      }
    },
    []
  );

  /**
   * Sélectionne une image depuis la galerie (web ou natif).
   */
  const pickFromGallery = useCallback(async (): Promise<File | null> => {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      try {
        const { Camera, CameraResultType, CameraSource } =
          await import('@capacitor/camera');
        const photo = await Camera.getPhoto({
          quality: 85,
          resultType: CameraResultType.Base64,
          source: CameraSource.Photos,
        });
        if (!photo.base64String) return null;
        const byteChars = atob(photo.base64String);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArr[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArr], { type: 'image/jpeg' });
        return new File([blob], `gallery_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
      } catch {
        return null;
      }
    } else {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
      });
    }
  }, []);

  return { capturePhoto, pickFromGallery };
}
