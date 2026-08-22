import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { updateInternalCall } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/types';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Phone,
  Users, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  callId: string;
  participants: Profile[];
  isInitiator: boolean;
  onClose: () => void;
}

import {
  RTC_CONFIG, getAudioConstraints, getVideoConstraints,
  setVideoCodecPreferences, setAudioCodecPreferences,
} from '@/lib/webrtc';

// Une connexion WebRTC par participant distant
interface PeerEntry {
  peerId: string;
  pc: RTCPeerConnection;
  remoteStream: MediaStream | null;
  name: string;
}

export default function InternalCallModal({ callId, participants, isInitiator, onClose }: Props) {
  const { profile } = useAuth();
  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const [peers, setPeers]         = useState<PeerEntry[]>([]);
  const peersRef                  = useRef<PeerEntry[]>([]);
  const [micOn, setMicOn]         = useState(true);
  const [camOn, setCamOn]         = useState(true);
  const [connected, setConnected] = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const channelRef                = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mémoriser les IDs pour éviter les re-rendus inutiles et stabiliser useCallback
  const participantIds = React.useMemo(() => participants.map(p => p.id), [participants]);

  // ── helpers ─────────────────────────────────────────────
  function getPeerName(peerId: string) {
    return participants.find(p => p.id === peerId)?.username ?? peerId.slice(0, 8);
  }

  function updatePeerStream(peerId: string, stream: MediaStream) {
    setPeers(prev => prev.map(p => p.peerId === peerId ? { ...p, remoteStream: stream } : p));
    peersRef.current = peersRef.current.map(p => p.peerId === peerId ? { ...p, remoteStream: stream } : p);
  }

  function createPeer(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    localStreamRef.current?.getTracks().forEach(t => {
      pc.addTrack(t, localStreamRef.current!);
    });
    // Appliquer les préférences de codec après addTrack
    pc.getTransceivers().forEach(t => {
      if (t.sender.track?.kind === 'video') setVideoCodecPreferences(t);
      if (t.sender.track?.kind === 'audio') setAudioCodecPreferences(t);
    });

    const remoteStream = new MediaStream();
    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      updatePeerStream(peerId, remoteStream);
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        channelRef.current?.send({
          type: 'broadcast', event: 'ice',
          payload: { from: profile?.id, to: peerId, candidate: e.candidate },
        });
      }
    };

    // Reconnexion automatique ICE pour les appels internes
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        toast.warning(`Connexion perdue avec un participant — reconnexion…`);
      }
    };

    return pc;
  }

  function getOrCreatePeer(peerId: string): PeerEntry {
    let entry = peersRef.current.find(p => p.peerId === peerId);
    if (!entry) {
      const pc = createPeer(peerId);
      entry = { peerId, pc, remoteStream: null, name: getPeerName(peerId) };
      peersRef.current = [...peersRef.current, entry];
      setPeers([...peersRef.current]);
    }
    return entry;
  }

  // ── signalling channel ───────────────────────────────────
  const setupChannel = useCallback(() => {
    const ch = supabase.channel(`internal-call-${callId}`, { config: { broadcast: { ack: false } } });
    channelRef.current = ch;

    ch.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (payload.to !== profile?.id) return;
      const { pc } = getOrCreatePeer(payload.from);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ch.send({ type: 'broadcast', event: 'answer', payload: { from: profile?.id, to: payload.from, sdp: answer } });
    });

    ch.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.to !== profile?.id) return;
      const entry = peersRef.current.find(p => p.peerId === payload.from);
      if (entry) await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });

    ch.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.to !== profile?.id) return;
      const entry = peersRef.current.find(p => p.peerId === payload.from);
      if (entry) {
        try { await entry.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* ignore */ }
      }
    });

    ch.on('broadcast', { event: 'joined' }, async ({ payload }) => {
      // A new participant joined — initiator sends offer to them
      if (!isInitiator || payload.peerId === profile?.id) return;

      // Close any stale peer that was pre-created before the callee connected.
      // If we already sent an offer before the callee subscribed, that peer is
      // stuck in 'have-local-offer' and createOffer() would throw — reset it.
      const existing = peersRef.current.find(p => p.peerId === payload.peerId);
      if (existing) {
        existing.pc.close();
        peersRef.current = peersRef.current.filter(p => p.peerId !== payload.peerId);
        setPeers([...peersRef.current]);
      }

      const { pc } = getOrCreatePeer(payload.peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ch.send({ type: 'broadcast', event: 'offer', payload: { from: profile?.id, to: payload.peerId, sdp: offer } });
      } catch (err) {
        console.error('[WebRTC] offer failed for joined peer:', err);
      }
    });

    ch.on('broadcast', { event: 'call_ended' }, () => {
      toast.info("L'appel a été terminé.");
      handleClose();
    });

    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        // Announce presence — triggers the joined handler on the initiator side,
        // which will create the offer. Do NOT pre-send offers here: the callee
        // may not be subscribed yet, leaving peers stuck in have-local-offer.
        ch.send({ type: 'broadcast', event: 'joined', payload: { peerId: profile?.id } });
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
        updateInternalCall(callId, { status: 'active', started_at: new Date().toISOString() });
      }
    });
  }, [callId, isInitiator, participantIds, profile]);

  // ── mount: get media + setup channel ────────────────────
  useEffect(() => {
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: getVideoConstraints('high', 'user'),
          audio: getAudioConstraints(),
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setupChannel();
      } catch {
        toast.error("Impossible d'accéder à la caméra/microphone");
        onClose();
      }
    }
    init();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(p => p.pc.close());
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    if (isInitiator) {
      channelRef.current?.send({ type: 'broadcast', event: 'call_ended', payload: {} });
    }
    updateInternalCall(callId, { status: 'ended', ended_at: new Date().toISOString() });
    onClose();
  }

  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(m => !m);
  }

  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(c => !c);
  }

  function formatTime(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-background rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '90dvh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm text-balance">Appel en conférence</p>
              <p className="text-xs text-muted-foreground font-mono">
                {connected ? formatTime(elapsed) : 'Connexion…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">
            {participants.length + 1} participants
          </div>
        </div>

        {/* Video grid */}
        <div className="flex-1 overflow-y-auto p-4 grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(peers.length + 1, 3)}, 1fr)` }}>
          {/* Local */}
          <div className="relative aspect-video bg-muted rounded-xl overflow-hidden">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white font-medium">
              Vous {!micOn && '🔇'}
            </div>
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
                <VideoOff size={24} className="text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Remote peers */}
          {peers.map(peer => (
            <RemoteVideo key={peer.peerId} peer={peer} />
          ))}

          {/* Waiting slots */}
          {participants.filter(p => !peers.find(pr => pr.peerId === p.id)).map(p => (
            <div key={p.id} className="relative aspect-video bg-muted/50 rounded-xl overflow-hidden flex items-center justify-center border-2 border-dashed border-border">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-muted-foreground/20 flex items-center justify-center mx-auto mb-2">
                  <Users size={18} className="text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">{p.username}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1 justify-center">
                  <RefreshCw size={9} className="animate-spin" /> En attente…
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-5 py-4 border-t border-border shrink-0">
          <button onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md ${micOn ? 'bg-muted hover:bg-muted/80 text-foreground' : 'bg-red-500 text-white'}`}>
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button onClick={toggleCam}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md ${camOn ? 'bg-muted hover:bg-muted/80 text-foreground' : 'bg-red-500 text-white'}`}>
            {camOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button onClick={handleClose}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all">
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoteVideo({ peer }: { peer: PeerEntry }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && peer.remoteStream) {
      videoRef.current.srcObject = peer.remoteStream;
    }
  }, [peer.remoteStream]);

  return (
    <div className="relative aspect-video bg-muted rounded-xl overflow-hidden">
      {peer.remoteStream
        ? <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Phone size={24} className="text-muted-foreground mx-auto mb-1 animate-pulse" />
              <p className="text-xs text-muted-foreground">Connexion…</p>
            </div>
          </div>
        )}
      <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white font-medium">
        {peer.name}
      </div>
    </div>
  );
}
