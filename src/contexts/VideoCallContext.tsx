/**
 * VideoCallContext — Gestionnaire global d'appel vidéo flottant + appels entrants
 *
 * Maintient l'état de l'appel actif en dehors du cycle de vie des pages.
 * Gère également les appels entrants (IncomingCallScreen) reçus via :
 *   - CustomEvent "konolive:incoming_call" (FCM / Capacitor)
 *   - Supabase Realtime broadcast "call_offer" (Web)
 *
 * États synchronisés avec video_call_states :
 *   RINGING → ACCEPTED | REJECTED | TIMEOUT | ENDED
 */
import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { IncomingCallPayload } from '@/hooks/usePushNotifications';
import IncomingCallScreen from '@/components/video/IncomingCallScreen';
import { notifyIncomingCall } from '@/lib/notifications';

export interface ActiveCallParams {
  callId: string;
  remoteUserName: string;
  remoteUserPhoto?: string | null;
  isInitiator: boolean;
  requestId: string;
}

interface VideoCallContextValue {
  activeCall:  ActiveCallParams | null;
  startCall:   (params: ActiveCallParams) => void;
  endCall:     () => void;
  minimized:   boolean;
  setMinimized:(v: boolean) => void;
}

const defaultValue: VideoCallContextValue = {
  activeCall: null,
  startCall:    () => {},
  endCall:      () => {},
  minimized:    false,
  setMinimized: () => {},
};

const VideoCallContext = createContext<VideoCallContextValue>(defaultValue);

// ── Appel Edge Function send-call-push ──────────────────────────────────────
async function sendCallPush(payload: {
  callId: string; receiverId: string; callerName: string;
  callerPhoto?: string | null; requestId?: string;
}) {
  try {
    await supabase.functions.invoke('send-call-push', { body: payload });
  } catch (err) {
    console.warn('send-call-push failed (non-bloquant):', err);
  }
}

// ── Mettre à jour l'état dans video_call_states ─────────────────────────────
async function updateCallState(callId: string, state: string) {
  await supabase
    .from('video_call_states')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('call_id', callId);
}

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeCall,    setActiveCall]    = useState<ActiveCallParams | null>(null);
  const [minimized,     setMinimized]     = useState(false);
  const [incomingCall,  setIncomingCall]  = useState<IncomingCallPayload | null>(null);
  const handledCallIds  = useRef<Set<string>>(new Set());

  // ── Déduplication : ignorer les callId déjà traités ────────────────────
  const handleIncoming = useCallback((payload: IncomingCallPayload) => {
    if (!payload?.callId) return;
    if (handledCallIds.current.has(payload.callId)) return;
    // Vérifier l'expiration
    if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) return;
    // Si un appel est déjà actif, ne pas superposer
    if (activeCall) return;
    handledCallIds.current.add(payload.callId);
    setIncomingCall(payload);
  }, [activeCall]);

  // ── Écouter CustomEvent "konolive:incoming_call" (FCM natif) ────────────
  useEffect(() => {
    const handler = (e: Event) => {
      handleIncoming((e as CustomEvent<IncomingCallPayload>).detail);
    };
    window.addEventListener('konolive:incoming_call', handler);
    return () => window.removeEventListener('konolive:incoming_call', handler);
  }, [handleIncoming]);

  // ── Écouter Realtime broadcast "call_offer" (Web) ───────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel(`user-call-${profile.id}`)
      .on('broadcast', { event: 'call_offer' }, ({ payload }) => {
        if (!payload?.call_id) return;
        // Notification push locale à la réception d'un appel coach mobile
        notifyIncomingCall(payload.agent_name ?? 'Coach Mobile');
        handleIncoming({
          callId:      payload.call_id,
          callerId:    payload.agent_id ?? '',
          callerName:  payload.agent_name ?? 'Konolive',
          callerPhoto: payload.agent_photo ?? '',
          receiverId:  profile.id,
          requestId:   payload.request_id ?? '',
          callType:    'video',
          timestamp:   new Date().toISOString(),
          expiresAt:   new Date(Date.now() + 60_000).toISOString(),
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, handleIncoming]);

  // ── Écouter Realtime postgres_changes sur video_call_states ────────────
  // Si l'état devient REJECTED / TIMEOUT / ENDED depuis un autre appareil,
  // fermer automatiquement la sonnerie / l'appel actif.
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel('video-call-state-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'video_call_states' },
        ({ new: row }) => {
          // Appel entrant annulé par l'appelant ou un autre appareil
          if (incomingCall?.callId === row.call_id &&
              ['REJECTED', 'TIMEOUT', 'ENDED', 'ACCEPTED'].includes(row.state)) {
            setIncomingCall(null);
          }
          // Appel actif terminé depuis un autre appareil
          if (activeCall?.callId === row.call_id && row.state === 'ENDED') {
            setActiveCall(null);
            setMinimized(false);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, incomingCall?.callId, activeCall?.callId]);

  // ── startCall : déclenche l'appel + crée l'état RINGING + envoie FCM ───
  const startCall = useCallback(async (params: ActiveCallParams & {
    receiverId?: string; callerName?: string; callerPhoto?: string | null;
  }) => {
    setActiveCall(params);
    setMinimized(false);

    // Créer l'état RINGING dans video_call_states
    if (profile?.id && params.requestId) {
      await supabase.from('video_call_states').upsert([{
        call_id:      params.callId,
        caller_id:    profile.id,
        receiver_id:  params.receiverId ?? params.callId, // fallback
        state:        'RINGING',
        caller_name:  params.callerName ?? profile.username,
        caller_photo: params.callerPhoto ?? null,
        request_id:   params.requestId,
        expires_at:   new Date(Date.now() + 60_000).toISOString(),
      }], { onConflict: 'call_id' });
    }
  }, [profile]);

  const endCall = useCallback(async () => {
    if (activeCall?.callId) {
      await updateCallState(activeCall.callId, 'ENDED');
    }
    setActiveCall(null);
    setMinimized(false);
  }, [activeCall]);

  // ── Accepter l'appel entrant ─────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (!incomingCall) return;
    await updateCallState(incomingCall.callId, 'ACCEPTED');
    setIncomingCall(null);
    setActiveCall({
      callId:          incomingCall.callId,
      remoteUserName:  incomingCall.callerName,
      remoteUserPhoto: incomingCall.callerPhoto || null,
      isInitiator:     false,
      requestId:       incomingCall.requestId,
    });
    setMinimized(false);
  }, [incomingCall]);

  // ── Refuser l'appel entrant ──────────────────────────────────────────────
  const handleReject = useCallback(async () => {
    if (!incomingCall) return;
    await updateCallState(incomingCall.callId, 'REJECTED');
    setIncomingCall(null);
  }, [incomingCall]);

  return (
    <VideoCallContext.Provider value={{ activeCall, startCall, endCall, minimized, setMinimized }}>
      {children}
      {/* Overlay plein écran affiché uniquement si appel entrant en attente */}
      {incomingCall && !activeCall && (
        <IncomingCallScreen
          call={incomingCall}
          onAccept={handleAccept}
          onReject={handleReject}
          timeoutSeconds={60}
        />
      )}
    </VideoCallContext.Provider>
  );
}

export function useVideoCall(): VideoCallContextValue {
  return useContext(VideoCallContext);
}

/** Utilitaire exporté pour envoyer FCM après createVideoCall */
export { sendCallPush };
