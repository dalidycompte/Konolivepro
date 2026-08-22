/**
 * Système de notifications push in-app
 * — Browser Notification API + toasts Sonner
 * — Abonnement Supabase Realtime pour notifications en base
 */
import { toast } from 'sonner';

/* ── 1. Permissions navigateur ─────────────────────────────────────────── */

export type NotifPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotifPermission(): NotifPermission {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission as NotifPermission;
}

/** Demande la permission de notifications navigateur */
export async function requestNotifPermission(): Promise<NotifPermission> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const result = await Notification.requestPermission();
  return result as NotifPermission;
}

/* ── 2. Affichage notifications ────────────────────────────────────────── */

export interface PushNotifOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;       // déduplique les notifs du même type
  onClick?: () => void;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

/**
 * Affiche une notification :
 *  1. Toast Sonner (toujours visible in-app)
 *  2. Notification système navigateur si permission accordée + app en arrière-plan
 */
export function showNotification(opts: PushNotifOptions): void {
  const { title, body, icon, tag, onClick, type = 'info', duration = 5000 } = opts;

  /* ── Toast in-app ── */
  const toastFn = type === 'success' ? toast.success
                : type === 'warning' ? toast.warning
                : type === 'error'   ? toast.error
                : toast.info;

  toastFn(title, {
    description: body,
    duration,
    action: onClick ? { label: 'Voir', onClick } : undefined,
  });

  /* ── Notification système (arrière-plan uniquement) ── */
  if (
    'Notification' in window &&
    Notification.permission === 'granted' &&
    document.visibilityState === 'hidden'
  ) {
    try {
      const n = new Notification(title, {
        body,
        icon: icon ?? '/favicon.ico',
        tag: tag ?? title,
        requireInteraction: type === 'error' || type === 'warning',
      });
      if (onClick) n.onclick = () => { window.focus(); onClick(); };
    } catch { /* permissions révoquées au runtime */ }
  }
}

/* ── 3. Types de notifications métier ──────────────────────────────────── */

export function notifyNewRequest(count: number): void {
  showNotification({
    title: 'Nouvelle demande',
    body: count > 1
      ? `${count} nouvelles demandes en attente`
      : 'Une nouvelle demande est disponible',
    type: 'info',
    tag: 'new_request',
    duration: 6000,
  });
}

export function notifyStatusChange(status: string, phone: string): void {
  const labels: Record<string, { label: string; type: PushNotifOptions['type'] }> = {
    accepted:  { label: 'acceptée',  type: 'success' },
    rejected:  { label: 'rejetée',   type: 'error'   },
    unchanged: { label: 'inchangée', type: 'warning' },
    other:     { label: 'classée Autre', type: 'warning' },
  };
  const info = labels[status] ?? { label: status, type: 'info' };
  showNotification({
    title: `Demande ${info.label}`,
    body: `La demande pour +${phone} a été ${info.label}.`,
    type: info.type,
    tag: `status_${status}`,
  });
}

export function notifySessionExpiringSoon(minutesLeft: number): void {
  showNotification({
    title: 'Session bientôt expirée',
    body: `Votre session expirera dans ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''} par inactivité.`,
    type: 'warning',
    tag: 'session_expiring',
    duration: 10_000,
  });
}

export function notifyAgentOnline(username: string): void {
  showNotification({
    title: 'Agent connecté',
    body: `${username} vient de se connecter.`,
    type: 'success',
    tag: `online_${username}`,
    duration: 4000,
  });
}

export function notifyIncomingCall(callerName: string): void {
  showNotification({
    title: 'Appel entrant',
    body: `${callerName} vous appelle.`,
    type: 'warning',
    tag: 'incoming_call',
    duration: 30_000,
  });
}

export function notifyInternalMessage(senderName: string, preview: string): void {
  showNotification({
    title: `Message de ${senderName}`,
    body: preview.length > 80 ? preview.slice(0, 80) + '…' : preview,
    type: 'info',
    tag: `msg_${senderName}`,
    duration: 6000,
  });
}
