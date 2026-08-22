import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Upload, X, CheckCircle2, RefreshCw, SwitchCamera, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

interface CameraCaptureProps {
  label: string;
  icon?: React.ReactNode;
  file: File | null;
  onChange: (f: File) => void;
  facingMode?: 'environment' | 'user';
}

type Mode = 'idle' | 'camera' | 'preview';

export default function CameraCapture({ label, icon, file, onChange, facingMode = 'environment' }: CameraCaptureProps) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const [mode, setMode]             = useState<Mode>(file ? 'preview' : 'idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    file ? URL.createObjectURL(file) : null
  );
  const [activeFacing, setActiveFacing] = useState<'environment' | 'user'>(facingMode);
  const [flipping, setFlipping]         = useState(false);
  const [videoReady, setVideoReady]     = useState(false);

  // Verrouille le scroll du body pendant la capture
  useEffect(() => {
    if (mode === 'camera') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mode]);

  // Réinitialise videoReady à chaque ouverture
  useEffect(() => {
    if (mode === 'camera') setVideoReady(false);
  }, [mode]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => { t.stop(); });
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (facing: 'environment' | 'user') => {
    const constraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };
    const s = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = s;
    // Attacher le stream après le rendu du composant caméra
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    }, 100);
  }, []);

  async function openCamera() {
    try {
      await startStream(activeFacing);
      setMode('camera');
    } catch {
      toast.error('Accès à la caméra refusé. Vérifiez les permissions.');
    }
  }

  async function flipCamera() {
    if (flipping) return;
    setFlipping(true);
    setVideoReady(false);
    const next: 'environment' | 'user' = activeFacing === 'user' ? 'environment' : 'user';
    try {
      stopStream();
      await startStream(next);
      setActiveFacing(next);
    } catch {
      toast.error('Impossible de basculer la caméra.');
      try { await startStream(activeFacing); } catch { /* abandon */ }
    } finally {
      setFlipping(false);
    }
  }

  // Capture : attend que videoReady soit true (onCanPlay)
  function capture(e: React.MouseEvent) {
    // Empêche absolument toute soumission de formulaire parent
    e.preventDefault();
    e.stopPropagation();

    const video = videoRef.current;
    if (!video) return;

    // Dimensions réelles de la vidéo — fallback 1280×720
    const w = video.videoWidth  > 0 ? video.videoWidth  : 1280;
    const h = video.videoHeight > 0 ? video.videoHeight : 720;

    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Miroir horizontal pour la caméra frontale
    if (activeFacing === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(blob => {
      if (!blob) { toast.error('Échec de la capture, réessayez.'); return; }
      const captured = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(captured);
      stopStream();
      setPreviewUrl(url);
      setMode('preview');
      onChange(captured);
      toast.success('Photo capturée avec succès !');
    }, 'image/jpeg', 0.9);
  }

  function cancelCamera(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    stopStream();
    setActiveFacing(facingMode);
    setVideoReady(false);
    setMode(file ? 'preview' : 'idle');
  }

  function flipCameraClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    flipCamera();
  }

  function retake() {
    setPreviewUrl(null);
    setActiveFacing(facingMode);
    setMode('idle');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setMode('preview');
    onChange(f);
    e.target.value = '';
  }

  // ── Overlay caméra — rendu via Portal sur document.body ──────────────────
  // Le portal échappe à tout formulaire parent ou overflow:hidden
  const cameraOverlay = mode === 'camera' ? createPortal(
    <section
      aria-label="Capture caméra"
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#000', display: 'flex', flexDirection: 'column' }}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}
    >
      {/* Zone vidéo */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onCanPlay={() => setVideoReady(true)}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: activeFacing === 'user' ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* Badge En direct */}
        <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
          En direct
        </div>

        {/* Badge Plein écran */}
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Maximize2 size={13} />
          Plein écran
        </div>

        {/* Bouton inversion caméra */}
        <button
          type="button"
          onClick={flipCameraClick}
          disabled={flipping}
          title={activeFacing === 'user' ? 'Caméra arrière' : 'Caméra avant'}
          style={{ position: 'absolute', top: 16, right: 16, width: 44, height: 44, borderRadius: 12, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: flipping ? 0.5 : 1 }}
        >
          <SwitchCamera size={20} style={{ animation: flipping ? 'spin 1s linear infinite' : 'none' }} />
        </button>

        {/* Viseur central */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ width: '80vw', maxWidth: 520, height: '55vh', maxHeight: 420, border: '2.5px solid rgba(255,255,255,0.65)', borderRadius: 20, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
        </div>

        {/* Indicateur chargement vidéo */}
        {!videoReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ color: '#fff', fontSize: 14 }}>Initialisation caméra…</div>
          </div>
        )}
      </div>

      {/* Barre d'actions */}
      <div style={{ flexShrink: 0, background: 'rgba(0,0,0,0.85)', padding: '24px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>

        {/* Annuler */}
        <button
          type="button"
          onClick={cancelCamera}
          style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={24} />
        </button>

        {/* Déclencheur capture */}
        <button
          type="button"
          onClick={capture}
          disabled={!videoReady}
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: videoReady ? '#fff' : 'rgba(255,255,255,0.4)',
            border: '4px solid rgba(255,255,255,0.8)',
            cursor: videoReady ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 6px rgba(255,255,255,0.2)',
            transition: 'transform 0.1s',
          }}
        >
          <Camera size={30} style={{ color: videoReady ? '#1a1a1a' : '#666' }} />
        </button>

        {/* Équilibre visuel */}
        <div style={{ width: 56, height: 56 }} />
      </div>
    </section>,
    document.body
  ) : null;

  return (
    <div>
      <label className="block text-sm font-normal text-foreground mb-2">
        <span className="inline-flex items-center gap-1.5">
          {icon && <span className="text-primary">{icon}</span>}
          {label}
        </span>
        {' '}<span className="text-destructive">*</span>
      </label>

      {/* ── Mode idle ── */}
      {mode === 'idle' && (
        <div className="neu-pressed rounded-xl p-5 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            Prenez une photo ou téléversez un fichier
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={openCamera}
              className="neu-btn flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium">
              <Camera size={18} className="text-primary" />
              Caméra
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="neu-btn flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium">
              <Upload size={18} className="text-primary" />
              Fichier
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {/* ── Mode preview ── */}
      {mode === 'preview' && previewUrl && (
        <div className="space-y-2">
          <div className="neu-pressed rounded-xl overflow-hidden aspect-[4/3] w-full relative">
            <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 size={12} />
              Capturée
            </div>
          </div>
          <button type="button" onClick={retake}
            className="neu-btn w-full py-2 flex items-center justify-center gap-2 text-sm">
            <RefreshCw size={15} />
            Reprendre
          </button>
        </div>
      )}

      {/* ── Overlay caméra monté sur document.body via portal ── */}
      {cameraOverlay}
    </div>
  );
}

