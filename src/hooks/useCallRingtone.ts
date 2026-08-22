/**
 * useCallRingtone — Son de sonnerie pour les appels vidéo
 *
 * - isInitiator = true  (agent)      → son d'émission d'appel (ring sortant)
 * - isInitiator = false (coach mobile) → sonnerie de téléphone (ring entrant)
 *
 * Utilise Web Audio API pour générer les tons sans fichiers externes.
 * Le son démarre quand callState === 'ringing' et s'arrête dès que l'état change.
 */
import { useEffect, useRef } from 'react';

type CallState = 'ringing' | 'connecting' | 'active' | 'ended' | 'permission_error';

// ── Paramètres du son sortant (agent qui appelle) ─────────────────────────────
// Double bip court espacé d'une pause — pattern standard de retour d'appel
const OUTGOING_BEEP_HZ  = 440;          // La4
const OUTGOING_BEEP_MS  = 400;          // durée d'un bip
const OUTGOING_GAP_MS   = 200;          // silence entre les deux bips
const OUTGOING_PAUSE_MS = 3000;         // pause avant répétition
const OUTGOING_GAIN     = 0.15;

// ── Paramètres du son entrant (coach mobile qui reçoit) ───────────────────────
// Sonnerie à deux tons alternés — pattern téléphone mobile
const INCOMING_FREQ_A   = 480;          // Mi4 approx
const INCOMING_FREQ_B   = 620;          // Ré#5 approx
const INCOMING_RING_MS  = 1500;         // durée d'une sonnerie
const INCOMING_PAUSE_MS = 3000;         // silence entre deux sonneries
const INCOMING_GAIN     = 0.28;

export function useCallRingtone(callState: CallState, isInitiator: boolean) {
  const ctxRef     = useRef<AudioContext | null>(null);
  const activeRef  = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arrête et libère tout
  function stopAll() {
    activeRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }

  // ── Son sortant : beep … beep … (pause) … repeat ─────────────────────────
  function playOutgoing() {
    if (!activeRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    // Fonction pour jouer un seul bip
    function beep(startAt: number) {
      const osc  = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.type = 'sine';
      osc.frequency.value = OUTGOING_BEEP_HZ;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(OUTGOING_GAIN, startAt + 0.01);
      gain.gain.setValueAtTime(OUTGOING_GAIN, startAt + OUTGOING_BEEP_MS / 1000 - 0.02);
      gain.gain.linearRampToValueAtTime(0, startAt + OUTGOING_BEEP_MS / 1000);
      osc.start(startAt);
      osc.stop(startAt + OUTGOING_BEEP_MS / 1000 + 0.02);
    }

    const now = ctx.currentTime;
    beep(now);
    beep(now + (OUTGOING_BEEP_MS + OUTGOING_GAP_MS) / 1000);

    const cycle = OUTGOING_BEEP_MS * 2 + OUTGOING_GAP_MS + OUTGOING_PAUSE_MS;
    timerRef.current = setTimeout(() => {
      if (activeRef.current) playOutgoing();
    }, cycle);
  }

  // ── Son entrant : deux tons alternés (sonnerie téléphone) ─────────────────
  function playIncoming() {
    if (!activeRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const now      = ctx.currentTime;
    const ringDur  = INCOMING_RING_MS / 1000;

    // Deux oscillateurs pour la richesse du son
    [INCOMING_FREQ_A, INCOMING_FREQ_B].forEach((freq, i) => {
      const osc  = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Modulation rapide → texture de sonnerie
      const lfo  = ctx!.createOscillator();
      const lfog = ctx!.createGain();
      lfo.frequency.value = 25 + i * 5;
      lfog.gain.value     = freq * 0.04;
      lfo.connect(lfog);
      lfog.connect(osc.frequency);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(INCOMING_GAIN / 2, now + 0.03);
      gain.gain.setValueAtTime(INCOMING_GAIN / 2, now + ringDur - 0.05);
      gain.gain.linearRampToValueAtTime(0, now + ringDur);

      lfo.start(now);
      lfo.stop(now + ringDur + 0.05);
      osc.start(now);
      osc.stop(now + ringDur + 0.05);
    });

    timerRef.current = setTimeout(() => {
      if (activeRef.current) playIncoming();
    }, INCOMING_RING_MS + INCOMING_PAUSE_MS);
  }

  useEffect(() => {
    if (callState !== 'ringing') {
      stopAll();
      return;
    }

    // Crée un nouveau AudioContext et démarre la sonnerie
    try {
      const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      ctxRef.current  = new AudioCtx();
      activeRef.current = true;

      if (isInitiator) {
        playOutgoing();
      } else {
        playIncoming();
      }
    } catch {
      // AudioContext non supporté ou politique autoplay — silence silencieux
    }

    return () => { stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, isInitiator]);
}
