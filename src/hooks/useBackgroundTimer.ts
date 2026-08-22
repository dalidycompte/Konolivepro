/**
 * useBackgroundTimer.ts
 * Contrôle le TimerForegroundService Android depuis JavaScript.
 * Sur web, le minuteur reste en mémoire (pas de service natif).
 */
import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export interface BackgroundTimerOptions {
  /** Callback appelé chaque seconde avec le temps restant */
  onTick?: (remaining: number) => void;
  /** Callback appelé quand le minuteur expire */
  onExpire?: () => void;
}

export function useBackgroundTimer(opts: BackgroundTimerOptions = {}) {
  const { onTick, onExpire } = opts;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(0);
  const onTickRef = useRef(onTick);
  const onExpireRef = useRef(onExpire);

  // Garde les callbacks à jour sans recréer l'effet
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  /** Lance le minuteur (durée en secondes) */
  const start = useCallback((durationSeconds: number) => {
    // Arrête tout minuteur précédent
    if (intervalRef.current) clearInterval(intervalRef.current);
    remainingRef.current = durationSeconds;

    if (Capacitor.isNativePlatform()) {
      // ── Android : délègue au service de premier plan ─────────────────
      (async () => {
        try {
          // Démarre TimerForegroundService via Capacitor's App plugin ou un Intent custom
          // On passe par un broadcast capturé par la MainActivity
          const { CapacitorHttp } = await import('@capacitor/core');
          // Alternative : utiliser un plugin local personnalisé. Ici on utilise un
          // message postMessage vers la WebView qui sera intercepté par MainActivity.
          window.dispatchEvent(
            new CustomEvent('konolive:timer:start', {
              detail: { duration: durationSeconds },
            })
          );
        } catch { /* Web fallback ci-dessous */ }
      })();

      // Écoute les ticks broadcastés depuis le service Android via WebView
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ remaining: number }>).detail;
        remainingRef.current = detail.remaining;
        onTickRef.current?.(detail.remaining);
        if (detail.remaining <= 0) onExpireRef.current?.();
      };
      window.addEventListener('konolive:timer:tick', handler);
      // Nettoie au prochain appel de start/stop
      intervalRef.current = setInterval(() => {/* géré via events */}, 60_000) as unknown as ReturnType<typeof setInterval>;
      window.addEventListener('konolive:timer:tick', handler, { once: false });
      return;
    }

    // ── Web / fallback JS ─────────────────────────────────────────────
    intervalRef.current = setInterval(() => {
      remainingRef.current -= 1;
      onTickRef.current?.(remainingRef.current);
      if (remainingRef.current <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onExpireRef.current?.();
      }
    }, 1000);
  }, []);

  /** Arrête le minuteur */
  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (Capacitor.isNativePlatform()) {
      window.dispatchEvent(new CustomEvent('konolive:timer:stop'));
    }
    remainingRef.current = 0;
  }, []);

  // Nettoyage au démontage du composant
  useEffect(() => () => { stop(); }, [stop]);

  return { start, stop };
}
