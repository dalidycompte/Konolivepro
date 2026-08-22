/**
 * webrtc.ts — Configuration et utilitaires WebRTC optimisés
 * Objectifs : faible latence, haute qualité, stabilité réseau, reconnexion automatique
 */

// ── ICE Servers ─────────────────────────────────────────────────────────────
// Plusieurs serveurs STUN publics pour maximiser la disponibilité.
// En production, ajouter des serveurs TURN (coturn) pour les réseaux NAT stricts.
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
];

// ── Configuration RTCPeerConnection optimisée ────────────────────────────────
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  // Regrouper audio/vidéo/data en un seul candidat ICE → réduit la latence
  bundlePolicy: 'max-bundle',
  // Multiplexer RTP+RTCP sur le même port → économie de ports et de ressources
  rtcpMuxPolicy: 'require',
  // Collecte à la fois UDP et TCP pour les réseaux restrictifs
  iceTransportPolicy: 'all',
};

// ── Contraintes media optimisées ─────────────────────────────────────────────
export function getAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,      // Fréquence optimale pour Opus
    channelCount: 1,        // Mono suffisant pour la voix → économie CPU/bande passante
  };
}

export function getVideoConstraints(
  quality: 'low' | 'medium' | 'high' = 'high',
  facingMode: 'user' | 'environment' = 'user',
): MediaTrackConstraints {
  const presets = {
    low:    { width: 320,  height: 240,  frameRate: 15 },
    medium: { width: 640,  height: 480,  frameRate: 24 },
    high:   { width: 1280, height: 720,  frameRate: 30 },
  };
  const p = presets[quality];
  return {
    facingMode,
    width:     { ideal: p.width,     min: 160 },
    height:    { ideal: p.height,    min: 120 },
    frameRate: { ideal: p.frameRate, min: 10  },
  };
}

// ── Préférence de codec vidéo ─────────────────────────────────────────────────
// Ordre de préférence : AV1 → VP9 → H.264 → VP8 (fallback)
const VIDEO_CODEC_PRIORITY = ['AV1', 'VP9', 'H264', 'VP8'];

export function setVideoCodecPreferences(transceiver: RTCRtpTransceiver): void {
  if (!('setCodecPreferences' in transceiver)) return;
  try {
    const codecs = RTCRtpSender.getCapabilities('video')?.codecs ?? [];
    const sorted: RTCRtpCodec[] = [];
    for (const pref of VIDEO_CODEC_PRIORITY) {
      const matches = codecs.filter(c =>
        c.mimeType.toUpperCase().includes(pref)
      );
      sorted.push(...matches);
    }
    const covered = new Set(sorted.map(c => c.mimeType));
    codecs.forEach(c => { if (!covered.has(c.mimeType)) sorted.push(c); });
    if (sorted.length > 0) {
      transceiver.setCodecPreferences(sorted as RTCRtpCodec[]);
    }
  } catch {
    // setCodecPreferences non supporté dans certains navigateurs — ignorer silencieusement
  }
}

// Préférence codec audio : Opus prioritaire
export function setAudioCodecPreferences(transceiver: RTCRtpTransceiver): void {
  if (!('setCodecPreferences' in transceiver)) return;
  try {
    const codecs = RTCRtpSender.getCapabilities('audio')?.codecs ?? [];
    const sorted: RTCRtpCodec[] = [
      ...codecs.filter(c => c.mimeType.toLowerCase().includes('opus')),
      ...codecs.filter(c => !c.mimeType.toLowerCase().includes('opus')),
    ];
    if (sorted.length > 0) transceiver.setCodecPreferences(sorted as RTCRtpCodec[]);
  } catch { /* ignorer */ }
}

// ── Paramètres d'encodage adaptatifs ─────────────────────────────────────────
export interface EncodingParams {
  maxBitrateBps: number;
  maxFramerate:  number;
  scaleResolutionDownBy: number;
}

export const ENCODING_PRESETS: Record<'excellent' | 'good' | 'fair' | 'poor', EncodingParams> = {
  excellent: { maxBitrateBps: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1.0 },
  good:      { maxBitrateBps:   800_000, maxFramerate: 25, scaleResolutionDownBy: 1.0 },
  fair:      { maxBitrateBps:   400_000, maxFramerate: 20, scaleResolutionDownBy: 1.5 },
  poor:      { maxBitrateBps:   150_000, maxFramerate: 15, scaleResolutionDownBy: 2.0 },
};

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

/** Applique les paramètres d'encodage au sender vidéo sans interrompre l'appel */
export async function applyEncodingParams(
  pc: RTCPeerConnection,
  preset: EncodingParams,
): Promise<void> {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate          = preset.maxBitrateBps;
    params.encodings[0].maxFramerate        = preset.maxFramerate;
    params.encodings[0].scaleResolutionDownBy = preset.scaleResolutionDownBy;
    await sender.setParameters(params);
  } catch {
    // setParameters peut échouer si la connexion est en cours de négociation — ignorer
  }
}

// ── Statistiques réseau temps réel ───────────────────────────────────────────
export interface NetworkStats {
  rtt:         number;   // ms
  jitter:      number;   // ms
  packetLoss:  number;   // %
  bitrateKbps: number;   // kbps
  fps:         number;
  quality:     NetworkQuality;
}

const EMPTY_STATS: NetworkStats = {
  rtt: 0, jitter: 0, packetLoss: 0, bitrateKbps: 0, fps: 0, quality: 'unknown',
};

let _prevBytes   = 0;
let _prevStampMs = 0;

/** Collecte les stats depuis getStats() et calcule la qualité réseau */
export async function collectNetworkStats(pc: RTCPeerConnection): Promise<NetworkStats> {
  try {
    const reports = await pc.getStats();
    let rtt         = 0;
    let jitter      = 0;
    let packetsLost = 0;
    let packetsRecv = 0;
    let bytesRecv   = 0;
    let fps         = 0;

    reports.forEach(report => {
      if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
        rtt         = (report.roundTripTime ?? 0) * 1000; // s → ms
        jitter      = (report.jitter          ?? 0) * 1000;
        packetsLost = report.packetsLost ?? 0;
      }
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        packetsRecv = report.packetsReceived ?? 0;
        bytesRecv   = report.bytesReceived   ?? 0;
        fps         = report.framesPerSecond ?? 0;
        // Packet loss depuis inbound si remote-inbound absent
        if (packetsLost === 0) {
          packetsLost = report.packetsLost ?? 0;
        }
      }
    });

    // Calcul du bitrate entrant
    const now = Date.now();
    let bitrateKbps = 0;
    if (_prevStampMs > 0) {
      const dt = (now - _prevStampMs) / 1000;
      bitrateKbps = dt > 0 ? ((bytesRecv - _prevBytes) * 8) / dt / 1000 : 0;
    }
    _prevBytes   = bytesRecv;
    _prevStampMs = now;

    const total      = packetsRecv + packetsLost;
    const packetLoss = total > 0 ? (packetsLost / total) * 100 : 0;
    const quality    = classifyQuality(rtt, jitter, packetLoss);

    return { rtt, jitter, packetLoss, bitrateKbps, fps, quality };
  } catch {
    return EMPTY_STATS;
  }
}

/** Classifie la qualité réseau selon RTT, jitter et packet loss */
export function classifyQuality(rtt: number, jitter: number, packetLoss: number): NetworkQuality {
  if (packetLoss > 10 || rtt > 500 || jitter > 100) return 'poor';
  if (packetLoss > 5  || rtt > 300 || jitter > 50)  return 'fair';
  if (packetLoss > 2  || rtt > 150 || jitter > 25)  return 'good';
  if (rtt > 0)                                        return 'excellent';
  return 'unknown';
}

/** Retourne la couleur Tailwind correspondant à la qualité */
export function qualityColor(q: NetworkQuality): string {
  switch (q) {
    case 'excellent': return 'text-green-400';
    case 'good':      return 'text-green-300';
    case 'fair':      return 'text-yellow-400';
    case 'poor':      return 'text-red-400';
    default:          return 'text-gray-400';
  }
}

/** Retourne le nombre de barres à afficher (0-4) */
export function qualityBars(q: NetworkQuality): number {
  switch (q) {
    case 'excellent': return 4;
    case 'good':      return 3;
    case 'fair':      return 2;
    case 'poor':      return 1;
    default:          return 0;
  }
}
