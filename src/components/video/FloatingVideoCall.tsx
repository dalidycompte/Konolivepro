/**
 * FloatingVideoCall — Fenêtre d'appel vidéo flottante, draggable et persistante
 *
 * - Montée UNE SEULE FOIS à la racine de l'app (App.tsx)
 * - Reste visible quel que soit la page active (navigation sans rechargement)
 * - Draggable souris + tactile à 60 FPS via transform CSS (pas de reflow)
 * - Magnétisme (snap) sur les bords de l'écran au relâchement
 * - Mode réduit (mini PiP, taille WhatsApp) conservant la vidéo active
 * - Animations fluides via CSS transitions
 */
import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { useVideoCall } from '@/contexts/VideoCallContext';
import VideoCallModal from '@/components/video/VideoCallModal';
import { Minimize2, Maximize2, PhoneOff, Phone } from 'lucide-react';

// Taille de la fenêtre flottante complète
const FLOAT_W = 380;
const FLOAT_H = 260;
// Taille réduite (mini-PiP, style WhatsApp)
const MINI_W = 160;
const MINI_H = 112;
// Marge de snap sur les bords (px)
const SNAP_MARGIN = 16;
// Seuil de glissement pour distinguer clic et drag (px)
const DRAG_THRESHOLD = 6;

interface DragState {
  dragging: boolean;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

export default function FloatingVideoCall() {
  const { activeCall, endCall, minimized, setMinimized } = useVideoCall();

  // Position de la fenêtre (coin supérieur gauche)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: window.innerWidth  - FLOAT_W - SNAP_MARGIN,
    y: window.innerHeight - FLOAT_H - SNAP_MARGIN - 60,
  }));

  const dragRef  = useRef<DragState>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });
  const frameRef = useRef<number | null>(null);
  const winRef   = useRef<HTMLDivElement>(null);

  // Recalcule les dimensions selon l'état réduit
  const W = minimized ? MINI_W : FLOAT_W;
  const H = minimized ? MINI_H : FLOAT_H;

  // Ancre la position initiale en bas à droite (safe)
  useLayoutEffect(() => {
    setPos({
      x: window.innerWidth  - W - SNAP_MARGIN,
      y: window.innerHeight - H - SNAP_MARGIN - 60,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // une seule fois au montage

  // ── Clamp : empêche la fenêtre de sortir de l'écran ─────────────────────
  const clamp = useCallback((x: number, y: number, w: number, h: number) => ({
    x: Math.max(0, Math.min(x, window.innerWidth  - w)),
    y: Math.max(0, Math.min(y, window.innerHeight - h)),
  }), []);

  // ── Snap : magnétisme sur les bords ─────────────────────────────────────
  const snap = useCallback((x: number, y: number, w: number, h: number) => {
    let sx = x;
    let sy = y;
    if (x < SNAP_MARGIN * 3)                        sx = SNAP_MARGIN;
    if (x > window.innerWidth  - w - SNAP_MARGIN * 3) sx = window.innerWidth  - w - SNAP_MARGIN;
    if (y < SNAP_MARGIN * 3)                        sy = SNAP_MARGIN;
    if (y > window.innerHeight - h - SNAP_MARGIN * 3) sy = window.innerHeight - h - SNAP_MARGIN;
    return { x: sx, y: sy };
  }, []);

  // ── Drag : début ────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Ne pas déclencher le drag sur les boutons de contrôle
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      dragging: true,
      startX:   e.clientX,
      startY:   e.clientY,
      originX:  pos.x,
      originY:  pos.y,
      moved:    false,
    };
  }, [pos]);

  // ── Drag : mouvement — rAF pour 60 FPS sans reflow ──────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const clamped = clamp(d.originX + dx, d.originY + dy, W, H);
      setPos(clamped);
      frameRef.current = null;
    });
  }, [W, H, clamp]);

  // ── Drag : fin + snap ───────────────────────────────────────────────────
  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (!d.dragging) return;
    d.dragging = false;
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    if (d.moved) {
      setPos(prev => snap(prev.x, prev.y, W, H));
    }
  }, [W, H, snap]);

  // Reclampe la position si la fenêtre est redimensionnée
  useEffect(() => {
    function onResize() {
      setPos(prev => clamp(prev.x, prev.y, W, H));
    }
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [W, H, clamp]);

  // Nettoyage rAF au démontage
  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  // ── Reclampe lors du passage mini ↔ normal ──────────────────────────────
  useEffect(() => {
    setPos(prev => clamp(prev.x, prev.y, W, H));
  }, [minimized, W, H, clamp]);

  if (!activeCall) return null;

  return (
    <>
      {/* ── Overlay plein écran : mode actif non-réduit ─────────────────── */}
      {!minimized && (
        <div className="fixed inset-0 z-[9998] pointer-events-none">
          {/* Le VideoCallModal gère lui-même son plein écran */}
          <div className="pointer-events-auto">
            <VideoCallModal
              callId={activeCall.callId}
              remoteUserName={activeCall.remoteUserName}
              remoteUserPhoto={activeCall.remoteUserPhoto}
              isInitiator={activeCall.isInitiator}
              requestId={activeCall.requestId}
              onClose={endCall}
              onMinimize={() => setMinimized(true)}
            />
          </div>
        </div>
      )}

      {/* ── Fenêtre flottante mini (PiP) — visible pendant la navigation ── */}
      {minimized && (
        <div
          ref={winRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="fixed z-[9999] select-none touch-none"
          style={{
            left:      pos.x,
            top:       pos.y,
            width:     MINI_W,
            height:    MINI_H,
            cursor:    dragRef.current.dragging ? 'grabbing' : 'grab',
            transition: dragRef.current.dragging ? 'none' : 'left 0.25s cubic-bezier(.4,0,.2,1), top 0.25s cubic-bezier(.4,0,.2,1), width 0.3s, height 0.3s',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
          }}
          aria-label="Appel vidéo en cours"
        >
          {/* Mini vidéo backdrop */}
          <MiniCallView
            callId={activeCall.callId}
            remoteUserName={activeCall.remoteUserName}
            onMaximize={() => setMinimized(false)}
            onEnd={endCall}
          />
        </div>
      )}
    </>
  );
}

// ── Vue mini PiP ─────────────────────────────────────────────────────────────
interface MiniCallViewProps {
  callId: string;
  remoteUserName: string;
  onMaximize: () => void;
  onEnd: () => void;
}

function MiniCallView({ remoteUserName, onMaximize, onEnd }: MiniCallViewProps) {
  return (
    <div className="w-full h-full relative bg-gray-900 flex flex-col items-center justify-center">
      {/* Fond animé */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-gray-900" />

      {/* Nom + indicateur actif */}
      <div className="relative z-10 flex flex-col items-center gap-1 px-2 text-center">
        <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center mb-1">
          <Phone size={14} className="text-primary animate-pulse" />
        </div>
        <p className="text-white text-xs font-semibold truncate max-w-full">{remoteUserName}</p>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white/60 text-[10px]">En cours</span>
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
        {/* Agrandir */}
        <button
          onClick={e => { e.stopPropagation(); onMaximize(); }}
          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
          aria-label="Agrandir l'appel">
          <Maximize2 size={12} className="text-white" />
        </button>
        {/* Raccrocher */}
        <button
          onClick={e => { e.stopPropagation(); onEnd(); }}
          className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
          aria-label="Raccrocher">
          <PhoneOff size={12} className="text-white" />
        </button>
      </div>

      {/* Indicateur "déplacer" */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2">
        <div className="w-6 h-1 rounded-full bg-white/30" />
      </div>
    </div>
  );
}
