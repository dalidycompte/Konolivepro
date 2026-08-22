/**
 * Hook : expiration automatique de session par inactivité
 * — Agent    : 30 min
 * — Superviseur : 60 min
 * — Avertissement 5 min avant expiration
 */
import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { SECURITY } from '@/lib/security';
import { toast } from 'sonner';
import type { UserRole } from '@/types/types';

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'scroll', 'click',
] as const;

export function useSessionTimeout(role: UserRole | null) {
  const navigate = useNavigate();
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedRef      = useRef(false);
  const expiredRef     = useRef(false);

  /* Délai selon le rôle */
  const timeoutMs = role === 'supervisor' || role === 'admin'
    ? SECURITY.SESSION_TIMEOUT_SUPER_MS
    : SECURITY.SESSION_TIMEOUT_AGENT_MS;

  const signOutAndRedirect = useCallback(async () => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    /* Nettoyer le token de session côté Supabase */
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles')
          .update({ login_token: null, is_logged_in: false })
          .eq('id', user.id);
      }
    } catch { /* silencieux */ }
    await supabase.auth.signOut();
    navigate('/login?timeout=1', { replace: true });
  }, [navigate]);

  const resetTimers = useCallback(() => {
    if (expiredRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warnRef.current)    clearTimeout(warnRef.current);
    warnedRef.current = false;

    /* Avertissement 5 min avant */
    warnRef.current = setTimeout(() => {
      if (!warnedRef.current && !expiredRef.current) {
        warnedRef.current = true;
        toast.warning('Session sur le point d\'expirer', {
          description: 'Votre session expirera dans 5 minutes par inactivité. Interagissez pour la prolonger.',
          duration: 10_000,
        });
      }
    }, timeoutMs - SECURITY.SESSION_WARN_BEFORE_MS);

    /* Déconnexion effective */
    timeoutRef.current = setTimeout(signOutAndRedirect, timeoutMs);
  }, [timeoutMs, signOutAndRedirect]);

  useEffect(() => {
    if (!role) return;
    expiredRef.current = false;
    resetTimers();

    const onActivity = () => resetTimers();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warnRef.current)    clearTimeout(warnRef.current);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity));
    };
  }, [role, resetTimers]);
}
