import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createNotification, updateVideoCall } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Phone,
  CameraOff, Volume2, VolumeX, RefreshCw, ShieldAlert, FlipHorizontal2,
  Wifi, WifiOff, Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { showNotification } from '@/lib/notifications';
import {
  RTC_CONFIG, getAudioConstraints, getVideoConstraints,
  setVideoCodecPreferences, setAudioCodecPreferences,
  ENCODING_PRESETS, applyEncodingParams,
  collectNetworkStats, qualityBars, qualityColor,
  type NetworkStats, type NetworkQuality,
} from '@/lib/webrtc';
import { useCallRingtone } from '@/hooks/useCallRingtone';

interface Props {
  callId: string;
  remoteUserName: string;
  remoteUserPhoto?: string | null;
  isInitiator: boolean;
  requestId: string;
  onClose: () => void;
  /** Optionnel : réduit la fenêtre en PiP flottant au lieu de raccrocher */
  onMinimize?: () => void;
}

const VOLUME_SPEAKER  = 1.0;
const VOLUME_EARPIECE = 0.1;
// Délai entre tentatives de reconnexion ICE (ms)
const ICE_RESTART_DELAY_MS = 2000;
// Intervalle de collecte des stats réseau (ms)
const STATS_INTERVAL_MS    = 3000;

async function updateSharedCallState(callId: string, action: 'REJECTED' | 'ENDED'): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_to_mobile_video_call', {
    p_call_id: callId,
    p_action: action,
  });
  if (error) return false;
  const row = Array.isArray(data) ? data[0] : data;
  const receiverId = (row as { receiver_id?: string } | null)?.receiver_id;
  if (receiverId) {
    await supabase.functions.invoke('send-call-push', {
      body: { callId, receiverId, action },
    }).catch(() => {});
  }
  return true;
}

function getPermissionMessage(err: unknown): { title: string; detail: string } {
  const name = (err as DOMException)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return { title: 'Accès refusé', detail: 'Autorisez la caméra et le micro dans les paramètres de votre navigateur, puis réessayez.' };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { title: 'Périphérique introuvable', detail: 'Aucune caméra ou aucun microphone détecté. Branchez un périphérique et réessayez.' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { title: 'Périphérique occupé', detail: 'La caméra ou le micro est déjà utilisé par une autre application. Fermez-la et réessayez.' };
  }
  if (name === 'OverconstrainedError') {
    return { title: 'Résolution non supportée', detail: 'Votre caméra ne supporte pas la résolution demandée. Réessayez.' };
  }
  return { title: "Erreur d'accès", detail: "Impossible d'accéder à la caméra ou au microphone. Vérifiez vos autorisations." };
}

export default function VideoCallModal({ callId, remoteUserName, remoteUserPhoto, isInitiator, requestId, onClose, onMinimize }: Props) {
  const { profile } = useAuth();
  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const remoteVideoRef  = useRef<HTMLVideoElement>(null);
  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingICERef   = useRef<RTCIceCandidateInit[]>([]);
  const startTimeRef    = useRef<number>(0);
  const statsTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceRestartRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [callState, setCallState]   = useState<'ringing' | 'connecting' | 'active' | 'ended' | 'permission_error'>('ringing');
  const [permError, setPermError]   = useState<{ title: string; detail: string } | null>(null);
  const [micOn,       setMicOn]     = useState(true);
  const [camOn,       setCamOn]     = useState(true);
  const [speakerOn,   setSpeakerOn] = useState(true);
  const [facingMode,  setFacingMode]  = useState<'user' | 'environment'>('user');
  const [flipping,    setFlipping]    = useState(false);
  const [elapsed,     setElapsed]     = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [netStats,    setNetStats]    = useState<NetworkStats | null>(null);
  const [showStats,   setShowStats]   = useState(false);

  // ── Sonnerie : son sortant (agent) ou entrant (coach mobile) ─────────────
  useCallRingtone(callState, isInitiator);

  // Attache le flux distant dès qu'il est disponible
  useEffect(() => {
    const vid = remoteVideoRef.current;
    if (vid && remoteStream) {
      vid.srcObject = remoteStream;
      vid.volume = speakerOn ? VOLUME_SPEAKER : VOLUME_EARPIECE;
      vid.play().catch(() => {});
    }
  }, [remoteStream, callState]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState]);

  // Libère toutes les ressources WebRTC et Supabase
  const cleanup = useCallback(() => {
    if (statsTimerRef.current) { clearInterval(statsTimerRef.current); statsTimerRef.current = null; }
    if (iceRestartRef.current)  { clearTimeout(iceRestartRef.current);  iceRestartRef.current  = null; }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  async function flushPendingICE(pc: RTCPeerConnection) {
    const pending = pendingICERef.current.splice(0);
    for (const c of pending) {
      await pc.addIceCandidate(c).catch(() => {});
    }
  }

  // L’appelant ne doit pas rester bloqué si aucun appareil du coach ne répond.
  useEffect(() => {
    if (!isInitiator || callState !== 'ringing') return;
    const timeout = window.setTimeout(async () => {
      const stateUpdated = await updateSharedCallState(callId, 'ENDED');
      if (stateUpdated) {
        await updateVideoCall(callId, {
          status: 'missed',
          ended_at: new Date().toISOString(),
        });
      }
      if (stateUpdated && profile?.id) {
        const title = 'Appel manqué';
        const body = `Le Coach Mobile ${remoteUserName} n'a pas répondu à votre appel vidéo.`;
        await createNotification({
          user_id: profile.id,
          type: 'missed_call',
          title,
          body,
          request_id: requestId,
        }).catch(() => {});
        showNotification({ title, body, type: 'warning', tag: `missed_call_${callId}`, duration: 8000 });
      }
      cleanup();
      setCallState('ended');
      setTimeout(onClose, 1200);
    }, 60_000);
    return () => window.clearTimeout(timeout);
  }, [callId, callState, cleanup, isInitiator, onClose, profile?.id, remoteUserName, requestId]);

  const endCall = useCallback(async () => {
    const duration = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : 0;
    channelRef.current?.send({ type: 'broadcast', event: 'call_end', payload: { call_id: callId } });
    // Diffuser aussi sur le canal req-detail pour garantir la réception côté coach mobile
    const reqChannel = supabase.channel(`req-detail-${requestId}`);
    reqChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        reqChannel.send({ type: 'broadcast', event: 'call_end', payload: { call_id: callId } });
        setTimeout(() => supabase.removeChannel(reqChannel), 2000);
      }
    });
    await updateSharedCallState(callId, 'ENDED');
    cleanup();
    setCallState('ended');
    await updateVideoCall(callId, {
      status: 'ended',
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
    });
    setTimeout(onClose, 1800);
  }, [callId, requestId, cleanup, onClose]);

  // Synchronisation stricte de l'état de l'appel via la base de données
  useEffect(() => {
    const ch = supabase.channel(`call-status-${callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'video_calls', filter: `id=eq.${callId}` },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === 'ended' || newStatus === 'rejected' || newStatus === 'missed' || newStatus === 'cancelled') {
            if (callState !== 'ended') {
              cleanup();
              setCallState('ended');
              toast.info("L'appel a été terminé.");
              setTimeout(onClose, 1500);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [callId, callState, cleanup, onClose]);

  /** Démarre la surveillance des stats réseau et adapte le bitrate vidéo */
  const startStatsMonitor = useCallback((pc: RTCPeerConnection) => {
    if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    statsTimerRef.current = setInterval(async () => {
      const stats = await collectNetworkStats(pc);
      setNetStats(stats);
      // Adaptation automatique de la qualité selon l'état du réseau
      const preset = ENCODING_PRESETS[stats.quality === 'unknown' ? 'good' : stats.quality];
      await applyEncodingParams(pc, preset);
    }, STATS_INTERVAL_MS);
  }, []);

  const setupPeerConnection = useCallback(async (facing: 'user' | 'environment' = 'user') => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints('high', facing),
        audio: getAudioConstraints(),
      });
    } catch (err) {
      const msg = getPermissionMessage(err);
      setPermError(msg);
      setCallState('permission_error');
      throw err;
    }

    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Ajouter les tracks via addTrack (comportement standard WebRTC)
    // Le receveur utilisera les m-lines de l'offer pour ses transceivers —
    // utiliser addTransceiver des deux côtés duplique les m-lines et
    // empêche le receveur de voir l'initiateur.
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // Appliquer les préférences de codec sur les transceivers créés par addTrack
    pc.getTransceivers().forEach(t => {
      if (t.sender.track?.kind === 'video') setVideoCodecPreferences(t);
      if (t.sender.track?.kind === 'audio') setAudioCodecPreferences(t);
    });

    pc.ontrack = e => {
      const rs = e.streams[0] ?? new MediaStream([e.track]);
      remoteStreamRef.current = rs;
      setRemoteStream(rs);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.volume = speakerOn ? VOLUME_SPEAKER : VOLUME_EARPIECE;
      }
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'ice_candidate',
          payload: { candidate: e.candidate.toJSON(), from: profile?.id },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setCallState('active');
        if (!startTimeRef.current) {
          startTimeRef.current = Date.now();
          updateVideoCall(callId, { status: 'active', started_at: new Date().toISOString() });
        }
        startStatsMonitor(pc);
      }
      // Reconnexion automatique : ICE restart au lieu de raccrocher
      if (state === 'disconnected' || state === 'failed') {
        toast.warning('Connexion instable — tentative de reconnexion…');
        iceRestartRef.current = setTimeout(async () => {
          if (!pcRef.current || pcRef.current.connectionState === 'closed') return;
          try {
            if (isInitiator) {
              // Déclencher un ICE restart côté initiateur
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              channelRef.current?.send({
                type: 'broadcast',
                event: 'offer',
                payload: { sdp: offer, from: profile?.id, iceRestart: true },
              });
            }
          } catch {
            // ICE restart échoué — terminer l'appel proprement
            toast.error('Reconnexion impossible. Appel terminé.');
            endCall();
          }
        }, ICE_RESTART_DELAY_MS);
      }
    };

    const channel = channelRef.current ?? supabase.channel(`call-${callId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (payload.from === profile?.id) return;
        const pc_ = pcRef.current;
        if (!pc_) return;
        if (pc_.remoteDescription) {
          await pc_.addIceCandidate(payload.candidate).catch(() => {});
        } else {
          pendingICERef.current.push(payload.candidate);
        }
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        const pc_ = pcRef.current;
        if (!pc_ || isInitiator) return;
        // Accepter aussi les offres ICE restart (signalingState peut être 'have-local-offer')
        if (pc_.signalingState !== 'stable' && !payload.iceRestart) return;
        try {
          await pc_.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingICE(pc_);
          const answer = await pc_.createAnswer();
          await pc_.setLocalDescription(answer);
          channel.send({
            type: 'broadcast',
            event: 'answer',
            payload: { sdp: answer, from: profile?.id },
          });
        } catch (err) {
          console.error('offer handling error', err);
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const pc_ = pcRef.current;
        if (!pc_ || !isInitiator) return;
        if (pc_.signalingState !== 'have-local-offer') return;
        try {
          await pc_.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingICE(pc_);
        } catch (err) {
          console.error('answer handling error', err);
        }
      })
      .on('broadcast', { event: 'ready' }, async () => {
        const pc_ = pcRef.current;
        if (!pc_ || !isInitiator || pc_.signalingState !== 'stable') return;
        try {
          const offer = await pc_.createOffer();
          await pc_.setLocalDescription(offer);
          channel.send({
            type: 'broadcast',
            event: 'offer',
            payload: { sdp: offer, from: profile?.id },
          });
        } catch (err) {
          console.error('offer creation error', err);
        }
      })
      .on('broadcast', { event: 'call_end' }, () => {
        cleanup();
        setCallState('ended');
        setTimeout(onClose, 1800);
      });

    return channel;
  }, [callId, isInitiator, profile, cleanup, endCall, speakerOn, startStatsMonitor]);

  // Initiateur : souscrire puis configurer la connexion
  useEffect(() => {
    if (!isInitiator) return;
    const channel = supabase.channel(`call-${callId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        try {
          await setupPeerConnection(facingMode);
          setCallState('connecting');
        } catch { /* permission_error géré dans setupPeerConnection */ }
      }
    });
    return () => { cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptCall() {
    try {
      setCallState('connecting');
      const channel = await setupPeerConnection(facingMode);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: 'ready', payload: { from: profile?.id } });
        }
      });
    } catch {
      setCallState(prev => prev === 'permission_error' ? 'permission_error' : 'ringing');
    }
  }

  async function retryAccess() {
    setPermError(null);
    pendingICERef.current = [];
    if (isInitiator) {
      setCallState('connecting');
      try { await setupPeerConnection(facingMode); } catch { /* géré */ }
    } else {
      setCallState('ringing');
    }
  }

  async function rejectCall() {
    channelRef.current?.send({ type: 'broadcast', event: 'call_end', payload: { call_id: callId } });
    // Diffuser aussi sur le canal req-detail pour garantir la réception si le canal d'appel n'est pas encore établi
    const reqChannel = supabase.channel(`req-detail-${requestId}`);
    reqChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        reqChannel.send({ type: 'broadcast', event: 'call_end', payload: { call_id: callId } });
        setTimeout(() => supabase.removeChannel(reqChannel), 2000);
      }
    });
    await updateSharedCallState(callId, isInitiator ? 'ENDED' : 'REJECTED');
    await updateVideoCall(callId, { status: 'rejected' }).catch(console.error);
    cleanup();
    onClose();
  }

  async function flipCamera() {
    if (flipping || !pcRef.current) return;
    setFlipping(true);
    const newFacing: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user';
    try {
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints('high', newFacing),
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      const updatedStream = audioTrack
        ? new MediaStream([newVideoTrack, audioTrack])
        : new MediaStream([newVideoTrack]);
      localStreamRef.current = updatedStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = updatedStream;
      setFacingMode(newFacing);
    } catch (err) {
      console.error('flip camera error', err);
      toast.error("Impossible d'inverser la caméra.");
    } finally {
      setFlipping(false);
    }
  }

  async function toggleSpeaker() {
    const next = !speakerOn;
    setSpeakerOn(next);
    const vid = remoteVideoRef.current;
    if (!vid) return;
    vid.volume = next ? VOLUME_SPEAKER : VOLUME_EARPIECE;
    vid.muted  = false;
    if ('setSinkId' in vid) {
      try {
        if (!next) {
          const devices  = await navigator.mediaDevices.enumerateDevices();
          const earpiece = devices.find(d =>
            d.kind === 'audiooutput' &&
            (d.label.toLowerCase().includes('earpiece') ||
             d.label.toLowerCase().includes('écouteur') ||
             d.label.toLowerCase().includes('communications'))
          );
          if (earpiece) {
            await (vid as HTMLVideoElement & { setSinkId(id: string): Promise<void> }).setSinkId(earpiece.deviceId);
          }
        } else {
          await (vid as HTMLVideoElement & { setSinkId(id: string): Promise<void> }).setSinkId('default');
        }
      } catch { /* setSinkId non supporté — fallback volume déjà appliqué */ }
    }
  }

  // Chronomètre d'appel
  useEffect(() => {
    if (callState !== 'active') return;
    const iv = setInterval(() => {
      setElapsed(startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0);
    }, 1000);
    return () => clearInterval(iv);
  }, [callState]);

  function toggleMic() {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  }
  function toggleCam() {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  }
  function fmt(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none">

      {/* ── APPEL TERMINÉ ── */}
      {callState === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
            <PhoneOff size={36} className="text-red-400" />
          </div>
          <p className="text-xl font-semibold">Appel terminé</p>
          <p className="text-white/60 text-sm">Durée : {fmt(elapsed)}</p>
        </div>
      )}

      {/* ── ERREUR PERMISSIONS ── */}
      {callState === 'permission_error' && permError && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 bg-gray-950">
          <div className="w-20 h-20 rounded-full bg-red-500/10 ring-2 ring-red-500/30 flex items-center justify-center">
            <ShieldAlert size={36} className="text-red-400" />
          </div>
          <div className="text-center max-w-sm">
            <p className="text-white text-xl font-bold mb-2">{permError.title}</p>
            <p className="text-white/60 text-sm leading-relaxed">{permError.detail}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 max-w-sm w-full text-sm text-white/50 leading-relaxed text-center">
            💡 Dans Chrome : cliquez sur l'icône 🔒 → <strong className="text-white/70">Caméra</strong> et <strong className="text-white/70">Microphone</strong> → <strong className="text-white/70">Autoriser</strong>, puis rechargez.
          </div>
          <div className="flex gap-4">
            <button onClick={retryAccess}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-white font-semibold hover:brightness-110 transition-all active:scale-95 shadow-lg">
              <RefreshCw size={18} />Réessayer
            </button>
            <button onClick={() => { cleanup(); onClose(); }}
              className="px-6 py-3 rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-all active:scale-95">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── SONNERIE — côté coach mobile ── */}
      {callState === 'ringing' && !isInitiator && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-gray-900 to-black">
          <div className="w-28 h-28 rounded-full bg-primary/20 ring-4 ring-primary/30 flex items-center justify-center animate-pulse overflow-hidden">
            {remoteUserPhoto ? (
              <img src={remoteUserPhoto} alt="Caller" className="w-full h-full object-cover" />
            ) : (
              <Phone size={48} className="text-primary" />
            )}
          </div>
          <div className="text-center">
            <p className="text-white text-2xl font-bold">{remoteUserName}</p>
            <p className="text-white/60 mt-2 text-base">Appel vidéo entrant…</p>
          </div>
          <div className="flex gap-12 mt-4">
            <div className="flex flex-col items-center gap-2">
              <button onClick={rejectCall}
                className="w-[72px] h-[72px] rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-xl transition-all active:scale-95">
                <PhoneOff size={30} />
              </button>
              <span className="text-white/60 text-sm">Refuser</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button onClick={acceptCall}
                className="w-[72px] h-[72px] rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-xl transition-all active:scale-95">
                <Phone size={30} />
              </button>
              <span className="text-white/60 text-sm">Accepter</span>
            </div>
          </div>
        </div>
      )}

      {/* ── CONNEXION / ACTIF ── */}
      {(callState === 'connecting' || callState === 'active') && (
        <div className="flex-1 relative overflow-hidden bg-black">

          {/* Vidéo distante plein écran */}
          <video ref={remoteVideoRef} autoPlay playsInline
            className="absolute inset-0 w-full h-full object-cover" />

          {/* Overlay d'attente */}
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-4">
              <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                {remoteUserPhoto ? (
                  <img src={remoteUserPhoto} alt="Caller" className="w-full h-full object-cover opacity-60" />
                ) : (
                  <CameraOff size={40} className="text-white/40" />
                )}
              </div>
              <p className="text-white/60 text-lg font-medium">{remoteUserName}</p>
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <div className="w-2 h-2 rounded-full bg-white/40 animate-pulse" />
                {isInitiator ? 'En attente de connexion…' : 'Connexion en cours…'}
              </div>
            </div>
          )}

          {/* ── Barre supérieure : nom + chrono + qualité réseau + minimiser ── */}
          <div className="absolute top-0 left-0 right-0 px-4 pt-safe-top pt-4 flex items-center justify-between">
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white text-sm font-semibold">{remoteUserName}</span>
              {callState === 'active' && (
                <span className="text-white/70 text-xs font-mono ml-1">{fmt(elapsed)}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Bouton réduire en PiP flottant */}
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  className="bg-black/50 backdrop-blur-sm rounded-2xl p-2 flex items-center justify-center hover:bg-white/20 transition-colors"
                  aria-label="Réduire en fenêtre flottante">
                  <Minimize2 size={16} className="text-white" />
                </button>
              )}
              {/* Indicateur qualité réseau */}
              <button
                onClick={() => setShowStats(s => !s)}
                className="bg-black/50 backdrop-blur-sm rounded-2xl px-3 py-2 flex items-center gap-2">
                <NetworkQualityBars stats={netStats} />
              </button>
            </div>
          </div>

          {/* ── Panneau stats réseau (optionnel) ── */}
          {showStats && netStats && (
            <div className="absolute top-16 right-4 bg-black/80 backdrop-blur-md rounded-2xl px-4 py-3 text-xs text-white/80 space-y-1 min-w-[160px]">
              <p className="font-bold text-white mb-1">Statistiques réseau</p>
              <p>RTT : <span className="font-mono">{netStats.rtt.toFixed(0)} ms</span></p>
              <p>Jitter : <span className="font-mono">{netStats.jitter.toFixed(0)} ms</span></p>
              <p>Perte paquets : <span className="font-mono">{netStats.packetLoss.toFixed(1)} %</span></p>
              <p>Débit : <span className="font-mono">{netStats.bitrateKbps.toFixed(0)} kbps</span></p>
              <p>FPS : <span className="font-mono">{netStats.fps.toFixed(0)}</span></p>
            </div>
          )}

          {/* ── PiP local + bouton flip ── */}
          <div className="absolute bottom-24 right-4 w-32 h-44 md:w-40 md:h-56 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-gray-800 group">
            <video ref={localVideoRef} autoPlay playsInline muted
              className={`w-full h-full object-cover transition-transform duration-300 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <VideoOff size={24} className="text-white/40" />
              </div>
            )}
            <button
              onClick={flipCamera}
              disabled={flipping}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all active:scale-90 disabled:opacity-40">
              <FlipHorizontal2 size={14} className={flipping ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* ── Barre de contrôles ── */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-safe-bottom pb-8">
            <div className="flex items-center justify-center gap-4">
              {/* Micro */}
              <button onClick={toggleMic}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${micOn ? 'bg-white/20 hover:bg-white/30' : 'bg-red-500 hover:bg-red-600'}`}>
                {micOn ? <Mic size={22} className="text-white" /> : <MicOff size={22} className="text-white" />}
              </button>
              {/* Caméra */}
              <button onClick={toggleCam}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${camOn ? 'bg-white/20 hover:bg-white/30' : 'bg-red-500 hover:bg-red-600'}`}>
                {camOn ? <Video size={22} className="text-white" /> : <VideoOff size={22} className="text-white" />}
              </button>
              {/* Raccrocher */}
              <button onClick={endCall}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-2xl transition-all active:scale-90">
                <PhoneOff size={26} />
              </button>
              {/* Haut-parleur */}
              <button onClick={toggleSpeaker}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${speakerOn ? 'bg-white/20 hover:bg-white/30' : 'bg-orange-500 hover:bg-orange-600'}`}>
                {speakerOn ? <Volume2 size={22} className="text-white" /> : <VolumeX size={22} className="text-white" />}
              </button>
              {/* Réseau */}
              <button onClick={() => setShowStats(s => !s)}
                className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shadow-lg transition-all active:scale-90">
                <Wifi size={22} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant indicateur qualité réseau ─────────────────────────────────────
function NetworkQualityBars({ stats }: { stats: NetworkStats | null }) {
  if (!stats || stats.quality === 'unknown') {
    return <WifiOff size={16} className="text-white/40" />;
  }
  const bars  = qualityBars(stats.quality);
  const color = qualityColor(stats.quality);
  return (
    <div className="flex items-end gap-[2px]">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-all ${i <= bars ? color.replace('text-', 'bg-') : 'bg-white/20'}`}
          style={{ height: `${4 + i * 3}px` }}
        />
      ))}
    </div>
  );
}
