/**
 * VideoCallContext — état global des appels web et événements entrants.
 * Le backend décide toujours de la transition d'état; le client ne fait
 * qu'afficher le résultat et propager les événements aux appareils du coach.
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

export type CallState = 'RINGING' | 'ACCEPTED' | 'CONNECTED' | 'REJECTED' | 'EXPIRED' | 'ENDED';
export type CallAction = Exclude<CallState, 'RINGING'>;

export interface ActiveCallParams {
  callId: string;
  remoteUserName: string;
  remoteUserPhoto?: string | null;
  isInitiator: boolean;
  requestId: string;
  receiverId?: string;
}

interface VideoCallContextValue {
  activeCall: ActiveCallParams | null;
  startCall: (params: ActiveCallParams) => Promise<void>;
  endCall: () => void;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
}

const defaultValue: VideoCallContextValue = {
  activeCall: null,
  startCall: async () => {},
  endCall: () => {},
  minimized: false,
  setMinimized: () => {},
};

const VideoCallContext = createContext<VideoCallContextValue>(defaultValue);

/** Appel Edge Function send-call-push. */
async function sendCallPush(payload: {
  callId: string;
  receiverId: string;
  callerName?: string;
  callerPhoto?: string | null;
  requestId?: string;
  action?: CallAction | 'INVITE';
  expiresAt?: string;
}) {
  try {
    await supabase.functions.invoke('send-call-push', { body: payload });
  } catch (err) {
    console.warn('send-call-push failed (non-bloquant):', err);
  }
}

/** Transition atomique protégée par la machine d'état PostgreSQL. */
async function updateCallState(callId: string, action: CallAction) {
  return supabase.rpc('respond_to_mobile_video_call', {
    p_call_id: callId,
    p_action: action,
  });
}

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeCall, setActiveCall] = useState<ActiveCallParams | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  const handledCallIds = useRef<Set<string>>(new Set());

  const handleIncoming = useCallback((payload: IncomingCallPayload) => {
    if (!payload?.callId || handledCallIds.current.has(payload.callId)) return;
    if (payload.expiresAt && new Date(payload.expiresAt) <= new Date()) return;
    if (activeCall) return;
    handledCallIds.current.add(payload.callId);
    setIncomingCall(payload);
  }, [activeCall]);

  useEffect(() => {
    const handler = (e: Event) => {
      handleIncoming((e as CustomEvent<IncomingCallPayload>).detail);
    };
    window.addEventListener('konolive:incoming_call', handler);
    return () => window.removeEventListener('konolive:incoming_call', handler);
  }, [handleIncoming]);

  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel(`user-call-${profile.id}`)
      .on('broadcast', { event: 'call_offer' }, ({ payload }) => {
        if (!payload?.call_id) return;
        notifyIncomingCall(payload.agent_name ?? 'Coach Mobile');
        handleIncoming({
          callId: payload.call_id,
          callerId: payload.agent_id ?? '',
          callerName: payload.agent_name ?? 'Konolive',
          callerPhoto: payload.agent_photo ?? '',
          receiverId: profile.id,
          requestId: payload.request_id ?? '',
          callType: 'video',
          timestamp: new Date().toISOString(),
          expiresAt: payload.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, handleIncoming]);

  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel('video-call-state-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'video_call_states' },
        ({ new: row }) => {
          const terminalOrClaimed = ['REJECTED', 'EXPIRED', 'ENDED', 'ACCEPTED'].includes(row.state);
          if (incomingCall?.callId === row.call_id && terminalOrClaimed) {
            setIncomingCall(null);
          }
          if (activeCall?.callId === row.call_id && ['REJECTED', 'EXPIRED', 'ENDED'].includes(row.state)) {
            setActiveCall(null);
            setMinimized(false);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, incomingCall?.callId, activeCall?.callId]);

  const startCall = useCallback(async (params: ActiveCallParams & {
    receiverId?: string; callerName?: string; callerPhoto?: string | null;
  }) => {
    if (!profile?.id || !params.requestId || !params.receiverId) return;

    const { error } = await supabase.from('video_call_states').upsert([{
      call_id: params.callId,
      caller_id: profile.id,
      receiver_id: params.receiverId,
      state: 'RINGING',
      caller_name: params.callerName ?? profile.username,
      caller_photo: params.callerPhoto ?? null,
      request_id: params.requestId,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }], { onConflict: 'call_id' });
    if (error) {
      console.error('Impossible de créer l’état RINGING:', error);
      return;
    }
    setActiveCall(params);
    setMinimized(false);
  }, [profile]);

  const endCall = useCallback(async () => {
    if (!activeCall?.callId) return;
    const receiverId = activeCall.receiverId;
    const { error } = await updateCallState(activeCall.callId, 'ENDED');
    if (!error && receiverId) {
      await sendCallPush({ callId: activeCall.callId, receiverId, action: 'ENDED' });
    }
    setActiveCall(null);
    setMinimized(false);
  }, [activeCall]);

  const handleAccept = useCallback(async () => {
    if (!incomingCall) return;
    const { error } = await updateCallState(incomingCall.callId, 'ACCEPTED');
    if (error) {
      setIncomingCall(null);
      handledCallIds.current.delete(incomingCall.callId);
      return;
    }
    await sendCallPush({
      callId: incomingCall.callId,
      receiverId: incomingCall.receiverId,
      action: 'ACCEPTED',
    });
    setIncomingCall(null);
    setActiveCall({
      callId: incomingCall.callId,
      remoteUserName: incomingCall.callerName,
      remoteUserPhoto: incomingCall.callerPhoto || null,
      isInitiator: false,
      requestId: incomingCall.requestId,
      receiverId: incomingCall.receiverId,
    });
    setMinimized(false);
  }, [incomingCall]);

  const handleReject = useCallback(async () => {
    if (!incomingCall) return;
    const call = incomingCall;
    const { error } = await updateCallState(call.callId, 'REJECTED');
    if (!error) await sendCallPush({ callId: call.callId, receiverId: call.receiverId, action: 'REJECTED' });
    setIncomingCall(null);
  }, [incomingCall]);

  const handleExpire = useCallback(async () => {
    if (!incomingCall) return;
    const call = incomingCall;
    const { error } = await updateCallState(call.callId, 'EXPIRED');
    if (!error) await sendCallPush({ callId: call.callId, receiverId: call.receiverId, action: 'EXPIRED' });
    setIncomingCall(null);
  }, [incomingCall]);

  return (
    <VideoCallContext.Provider value={{ activeCall, startCall, endCall, minimized, setMinimized }}>
      {children}
      {incomingCall && !activeCall && (
        <IncomingCallScreen
          call={incomingCall}
          onAccept={handleAccept}
          onReject={handleReject}
          onExpire={handleExpire}
          timeoutSeconds={60}
        />
      )}
    </VideoCallContext.Provider>
  );
}

export function useVideoCall(): VideoCallContextValue {
  return useContext(VideoCallContext);
}

export { sendCallPush };
