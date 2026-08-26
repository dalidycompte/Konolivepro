/**
 * IncomingCallScreen — Overlay plein écran pour les appels vidéo entrants
 *
 * Affiché par VideoCallContext dès qu'un appel INCOMING_CALL est reçu.
 * - Style WhatsApp / neumorphique
 * - Sonnerie via useCallRingtone (isInitiator = false → ton entrant)
 * - Timeout automatique après 60 secondes
 * - Vibration Android via @capacitor/haptics
 * - Boutons ACCEPTER (vert) et REFUSER (rouge)
 */
import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { IncomingCallPayload } from '@/hooks/usePushNotifications';
import { useCallRingtone } from '@/hooks/useCallRingtone';

interface Props {
  call:     IncomingCallPayload;
  onAccept: () => void;
  onReject: () => void;
  onExpire?: () => void;
  timeoutSeconds?: number;
}

export default function IncomingCallScreen({
  call,
  onAccept,
  onReject,
  onExpire,
  timeoutSeconds = 60,
}: Props) {
  const [remaining, setRemaining] = useState(timeoutSeconds);

  // Sonnerie entrant
  useCallRingtone('ringing', false);

  // Vibration Android (boucle)
  useEffect(() => {
    let vibrateInterval: ReturnType<typeof setInterval> | null = null;
    if (Capacitor.isNativePlatform()) {
      (async () => {
        try {
          const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
          vibrateInterval = setInterval(() => {
            Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
          }, 1200);
        } catch { /* web — pas de haptics */ }
      })();
    }
    return () => {
      if (vibrateInterval) clearInterval(vibrateInterval);
    };
  }, []);

  // Compte à rebours + expiration automatique
  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(tick);
          (onExpire ?? onReject)();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [onReject, onExpire]);

  const pct = (remaining / timeoutSeconds) * 100;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between
                    bg-gradient-to-b from-[hsl(var(--background))] to-[hsl(var(--card))]
                    overflow-hidden select-none">

      {/* ── Cercles décoratifs animés ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[1, 2, 3].map(i => (
          <div key={i}
            className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full
                       border border-primary/20 animate-ping"
            style={{
              width:  `${180 + i * 100}px`,
              height: `${180 + i * 100}px`,
              animationDelay:    `${i * 0.4}s`,
              animationDuration: '2.5s',
              opacity: 0.4 / i,
            }}
          />
        ))}
      </div>

      {/* ── Header info ── */}
      <div className="relative z-10 flex flex-col items-center pt-16 px-6 text-center gap-1">
        <div className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-6">
          <Video size={14} className="text-primary" />
          Appel vidéo entrant
        </div>

        {/* Avatar de l'appelant */}
        <div className="relative mb-4">
          <div className="w-28 h-28 rounded-full
                          shadow-[8px_8px_20px_hsl(var(--background)/0.8),-8px_-8px_20px_hsl(var(--card)/0.8)]
                          overflow-hidden border-4 border-primary/20">
            {call.callerPhoto ? (
              <img
                src={call.callerPhoto}
                alt={call.callerName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                <span className="text-4xl font-black text-primary">
                  {call.callerName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          {/* Badge vert pulsant */}
          <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full
                           bg-green-500 border-2 border-background animate-pulse" />
        </div>

        <h1 className="text-2xl font-black text-foreground text-balance">{call.callerName}</h1>
        <p className="text-muted-foreground text-sm">Centre de certification Konolive</p>
      </div>

      {/* ── Barre de timeout ── */}
      <div className="relative z-10 w-full px-8">
        <div className="neu-pressed h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 bg-primary/70"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground mt-1.5">
          Expire dans {remaining}s
        </p>
      </div>

      {/* ── Boutons Accepter / Refuser ── */}
      <div className="relative z-10 flex items-center justify-center gap-16 pb-20">
        {/* REFUSER */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onReject}
            className="w-20 h-20 rounded-full flex items-center justify-center
                       bg-red-500/90 text-white
                       shadow-[6px_6px_16px_rgba(239,68,68,0.5),-4px_-4px_12px_hsl(var(--card)/0.6)]
                       active:scale-95 transition-all duration-150">
            <PhoneOff size={30} />
          </button>
          <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Refuser</span>
        </div>

        {/* ACCEPTER */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onAccept}
            className="w-20 h-20 rounded-full flex items-center justify-center
                       bg-green-500/90 text-white
                       shadow-[6px_6px_16px_rgba(34,197,94,0.5),-4px_-4px_12px_hsl(var(--card)/0.6)]
                       active:scale-95 transition-all duration-150 animate-bounce">
            <Phone size={30} />
          </button>
          <span className="text-xs font-bold text-green-400 uppercase tracking-widest">Accepter</span>
        </div>
      </div>

    </div>
  );
}
