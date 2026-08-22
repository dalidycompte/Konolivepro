import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPath } from '@/components/common/RouteGuard';
import { toast } from 'sonner';
import { Video, Eye, EyeOff, LogIn, Download, Smartphone } from 'lucide-react';
import { getApkUrl } from '@/lib/api';
import { checkRateLimit, resetRateLimit, SECURITY } from '@/lib/security';

export default function LoginPage() {
  const navigate = useNavigate();
  const { role, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);

  useEffect(() => {
    getApkUrl().then(url => setApkUrl(url));
    if (window.location.search.includes('timeout=1')) {
      toast.error('Session expirée', { description: 'Vous avez été déconnecté pour inactivité.' });
      window.history.replaceState({}, document.title, '/login');
    }
  }, []);

  // Si déjà connecté (retour sur la page login), rediriger
  React.useEffect(() => {
    if (role && !loading) navigate(getDashboardPath(role), { replace: true });
  }, [role, loading, navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    /* ── Rate-limit connexion (5 essais / 60s, blocage 2min) ── */
    const rlKey = `login:${username.trim().toLowerCase()}`;
    const rl = checkRateLimit(rlKey, SECURITY.RATE_LIMIT_LOGIN.max, SECURITY.RATE_LIMIT_LOGIN.windowMs, SECURITY.RATE_LIMIT_LOGIN.blockMs);
    if (!rl.allowed) {
      const secs = Math.ceil(rl.remainingMs / 1000);
      toast.error('Trop de tentatives', { description: `Réessayez dans ${secs}s.` });
      return;
    }

    setLoading(true);

    // Supporte email direct (contient @) ou nom d'utilisateur@miaoda.com
    const email = username.trim().includes('@') ? username.trim() : `${username.trim()}@miaoda.com`;

    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      toast.error('Connexion échouée', { description: 'Identifiant ou mot de passe invalide.' });
      return;
    }

    if (authData?.user) {
      resetRateLimit(rlKey);

      /* Écrase toute session précédente — connexion directe sans confirmation */
      const newToken = crypto.randomUUID();
      localStorage.setItem('session_login_token', newToken);
      await supabase
        .from('profiles')
        .update({ login_token: newToken, is_logged_in: true })
        .eq('id', authData.user.id);

      /* Récupère le profil pour connaître le rôle, puis redirige immédiatement */
      await refreshProfile();
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      toast.success('Bienvenue !');
      setLoading(false);
      navigate(getDashboardPath((profileData?.role as any) ?? 'applicant'), { replace: true });
    } else {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--neu-bg)' }}>
      <div className="w-full max-w-[420px]">

        {/* ── Logo sculpt ─────────────────────────── */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{
              background: 'var(--neu-bg)',
              boxShadow: 'var(--neu-shadow-raised)',
            }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--neu-shadow-primary)' }}>
              <Video size={20} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--neu-text)' }}>
            Konolive
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--neu-muted)' }}>
            Plateforme de vérification d'identité
          </p>
        </div>

        {/* ── Carte principale (surélevée) ─────────── */}
        <div className="neu-card">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--neu-text)' }}>
            Se connecter
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Identifiant */}
            <div className="space-y-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                Nom d'utilisateur ou e-mail
              </label>
              <input
                className="neu-input"
                placeholder="Entrez votre identifiant"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            {/* Mot de passe */}
            <div className="space-y-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                Mot de passe
              </label>
              <div className="relative">
                <input
                  className="neu-input pr-12"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Entrez votre mot de passe"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--neu-muted)' }}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex justify-end">
                <Link to="/forgot-password"
                  className="text-xs font-medium hover:underline"
                  style={{ color: 'var(--neu-accent)' }}>
                  Mot de passe oublié ?
                </Link>
              </div>
            </div>

            {/* Bouton connexion */}
            <button type="submit" disabled={loading}
              className="neu-btn-primary w-full py-3.5 mt-2">
              {loading
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><LogIn size={18} /><span>Se connecter</span></>
              }
            </button>
          </form>

          {/* Inscription */}
          <p className="text-center text-sm mt-6" style={{ color: 'var(--neu-muted)' }}>
            Nouveau coach mobile ?{' '}
            <Link to="/register" className="font-semibold hover:underline"
              style={{ color: 'var(--neu-accent)' }}>
              Créer un compte
            </Link>
          </p>
        </div>

        {/* ── APK ─────────────────────────────────── */}
        {apkUrl && (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1" style={{ background: 'hsl(var(--border))' }} />
              <span className="text-xs flex items-center gap-1 shrink-0" style={{ color: 'var(--neu-muted)' }}>
                <Smartphone size={11} />Application mobile
              </span>
              <div className="h-px flex-1" style={{ background: 'hsl(var(--border))' }} />
            </div>
            <a href={apkUrl} download className="neu-btn-secondary w-full py-3">
              <Download size={16} style={{ color: 'var(--neu-accent)' }} />
              <span>Télécharger l'APK Android</span>
            </a>
          </div>
        )}

        {/* ── Légal ───────────────────────────────── */}
        <p className="text-center text-xs mt-5 leading-relaxed px-2" style={{ color: 'var(--neu-muted)' }}>
          En vous connectant, vous acceptez nos{' '}
          <span className="hover:underline cursor-pointer" style={{ color: 'var(--neu-accent)' }}>
            Conditions d'utilisation
          </span>{' '}
          et notre{' '}
          <span className="hover:underline cursor-pointer" style={{ color: 'var(--neu-accent)' }}>
            Politique de confidentialité
          </span>.
        </p>
      </div>
    </div>
  );
}
