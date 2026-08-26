/**
 * usePushNotifications.ts
 *
 * Gère l'enregistrement FCM et la réception des notifications push.
 * Sur Android (Capacitor), utilise @capacitor-firebase/messaging pour :
 *   - enregistrer le token FCM dans la table profiles
 *   - recevoir les data payloads INCOMING_CALL en foreground / background / app fermée
 *   - émettre un événement CustomEvent "incoming_call" consommé par VideoCallContext
 *
 * Sur Web, utilise l'API Notification standard + Service Worker (best-effort).
 */
import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface IncomingCallPayload {
  callId:      string;
  callerId:    string;
  callerName:  string;
  callerPhoto: string;
  receiverId:  string;
  requestId:   string;
  callType:    string;
  timestamp:   string;
  expiresAt:   string;
}

async function registerDeviceToken(token: string) {
  const key = 'konolive_device_id';
  const deviceId = localStorage.getItem(key) ?? crypto.randomUUID();
  localStorage.setItem(key, deviceId);
  await supabase.rpc('register_mobile_push_device', {
    p_device_id: deviceId,
    p_token: token,
    p_platform: Capacitor.isNativePlatform() ? 'android' : 'web',
    p_app_version: import.meta.env.VITE_APP_VERSION ?? 'web',
  });
}

/** Émet un CustomEvent global pour notifier VideoCallContext */
export function dispatchIncomingCall(payload: IncomingCallPayload) {
  window.dispatchEvent(new CustomEvent('konolive:incoming_call', { detail: payload }));
}

export function usePushNotifications() {
  const { profile } = useAuth();

  const requestPermissionAndRegister = useCallback(async () => {
    if (!profile?.id) return;

    if (Capacitor.isNativePlatform()) {
      // ── Android natif : @capacitor-firebase/messaging ──────────────────
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

        // Vérifier et demander les permissions
        const { receive } = await FirebaseMessaging.requestPermissions();
        if (receive !== 'granted') {
          toast.warning('Notifications refusées. Activez-les dans les paramètres.');
          return;
        }

        // Obtenir le token FCM
        const { token } = await FirebaseMessaging.getToken();
        if (token) {
          await registerDeviceToken(token);
        }

        // Écoute le rafraîchissement du token
        await FirebaseMessaging.addListener('tokenReceived', async ({ token: newToken }) => {
          await registerDeviceToken(newToken);
        });

        // ── Notification reçue en FOREGROUND ────────────────────────────
        await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
          const data = notification.data as Record<string, string> | undefined;
          if (data?.type === 'INCOMING_CALL') {
            dispatchIncomingCall(data as unknown as IncomingCallPayload);
          }
        });

        // ── Clic sur la notification (app en background/fermée) ─────────
        await FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
          const data = notification.data as Record<string, string> | undefined;
          if (data?.type === 'INCOMING_CALL') {
            dispatchIncomingCall(data as unknown as IncomingCallPayload);
          } else if (data?.route) {
            window.location.hash = data.route;
          }
        });

      } catch (err) {
        console.error('Firebase Messaging non disponible :', err);
        // Fallback : @capacitor/push-notifications
        await _fallbackCapacitorPush(profile.id);
      }
    } else {
      // ── Web (navigateur) ────────────────────────────────────────────────
      if (!('Notification' in window)) return;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.warning('Notifications navigateur refusées.');
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      requestPermissionAndRegister();
    }
    return () => {
      (async () => {
        try {
          const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
          await FirebaseMessaging.removeAllListeners();
        } catch {
          try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            await PushNotifications.removeAllListeners();
          } catch { /* web */ }
        }
      })();
    };
  }, [profile?.id, requestPermissionAndRegister]);

  return { requestPermissionAndRegister };
}

/** Fallback sur @capacitor/push-notifications si Firebase Messaging échoue */
async function _fallbackCapacitorPush(_userId: string) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;
    await PushNotifications.register();

    await PushNotifications.addListener('registration', async (token) => {
      await registerDeviceToken(token.value);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification.data as Record<string, string> | undefined;
      if (data?.type === 'INCOMING_CALL') {
        dispatchIncomingCall(data as unknown as IncomingCallPayload);
      } else {
        toast.info(notification.title ?? 'Notification', { description: notification.body });
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as Record<string, string> | undefined;
      if (data?.type === 'INCOMING_CALL') {
        dispatchIncomingCall(data as unknown as IncomingCallPayload);
      }
    });
  } catch (err) {
    console.error('Fallback push non disponible :', err);
  }
}
