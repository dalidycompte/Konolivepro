import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Video, Eye, EyeOff, UserPlus, ChevronDown, Download, Smartphone, CheckCircle2, XCircle, MapPin, MapPinOff, Loader2, RefreshCw } from 'lucide-react';
import { getApkUrl } from '@/lib/api';
import { checkRateLimit, resetRateLimit, sanitizeUsername, sanitizeText, validateUsername, validatePassword, validatePhone, validateSecurityAnswer, SECURITY } from '@/lib/security';
import PasswordStrengthBar from '@/components/common/PasswordStrengthBar';

const LOCALITIES = [
  'Brazzaville',
  'Pointe-Noire',
  'Bouenza',
  'Congo-Oubangui',
  'Cuvette',
  'Cuvette-Ouest',
  'Djoué-Léfini',
  'Kouilou',
  'Lékoumou',
  'Likouala',
  'Niari',
  'Nkéni-Alima',
  'Plateaux',
  'Pool',
  'Sangha',
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ 
    username: '', 
    locality: '', 
    phone: '', 
    password: '', 
    confirm: '',
    security_question: 'Quel est le nom de votre père ?',
    security_answer: ''
  });
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  
  const [detectingLocality, setDetectingLocality] = useState(true);
  const [localityError, setLocalityError] = useState<string | null>(null);
  const [localityDetected, setLocalityDetected] = useState(false);

  const detectLocality = () => {
    setDetectingLocality(true);
    setLocalityError(null);
    setLocalityDetected(false);
    setForm(prev => ({ ...prev, locality: '' }));

    if (!('geolocation' in navigator)) {
      setDetectingLocality(false);
      setLocalityError("La géolocalisation n'est pas supportée par votre appareil.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            { headers: { 'Accept-Language': 'fr' } }
          );
          if (!res.ok) throw new Error('API request failed');
          const data = await res.json();
          const address = data.address || {};
          const cityName =
            address.city || address.town || address.village ||
            address.municipality || address.county || address.state || '';
          if (cityName) {
            setForm(prev => ({ ...prev, locality: cityName }));
            setLocalityDetected(true);
            setLocalityError(null);
          } else {
            setLocalityError('Impossible de déterminer votre ville à partir de votre position.');
          }
        } catch {
          setLocalityError('Erreur de connexion au service de localisation.');
        } finally {
          setDetectingLocality(false);
        }
      },
      () => {
        setDetectingLocality(false);
        setLocalityError("Permission de localisation refusée. Autorisez l'accès à votre position puis réessayez.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    getApkUrl().then(url => setApkUrl(url));
    detectLocality();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { toast.error("Veuillez accepter les Conditions d'utilisation"); return; }
    if (!localityDetected || !form.locality) { toast.error("La localisation est requise pour s'inscrire"); return; }

    /* ── Rate-limit inscription ── */
    const rl = checkRateLimit('register', SECURITY.RATE_LIMIT_REGISTER.max, SECURITY.RATE_LIMIT_REGISTER.windowMs, SECURITY.RATE_LIMIT_REGISTER.blockMs);
    if (!rl.allowed) {
      const secs = Math.ceil(rl.remainingMs / 1000);
      toast.error(`Trop de tentatives`, { description: `Réessayez dans ${secs}s.` });
      return;
    }

    /* ── Validation ── */
    const uv = validateUsername(form.username);
    if (!uv.valid) { toast.error(uv.error!); return; }

    const pv = validatePassword(form.password);
    if (!pv.valid) { toast.error(pv.error!); return; }

    if (form.password !== form.confirm) { toast.error('Les mots de passe ne correspondent pas'); return; }

    const phv = validatePhone(form.phone);
    if (!phv.valid) { toast.error(phv.error!); return; }

    const sav = validateSecurityAnswer(form.security_answer);
    if (!sav.valid) { toast.error(sav.error!); return; }

    setLoading(true);
    const cleanUsername = sanitizeUsername(form.username.trim());
    const email = `${cleanUsername}@miaoda.com`;
    const { error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: {
          username: cleanUsername,
          locality: sanitizeText(form.locality.trim()) || null,
          phone: form.phone.trim() || null,
          security_question: form.security_question,
          security_answer: sanitizeText(form.security_answer.trim()),
          role: 'applicant',
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Échec de l'inscription", { description: error.message });
    } else {
      resetRateLimit('register');
      toast.success('Compte créé ! Veuillez vous connecter.');
      navigate('/login');
    }
  }

  return (
    <div className="auth-page min-h-screen flex items-center justify-center p-4 py-8"
      style={{ background: 'var(--neu-bg)' }}>
      <div className="w-full max-w-[420px]">

        {/* ── Logo sculpt ─────────────────────────── */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'var(--neu-bg)', boxShadow: 'var(--neu-shadow-raised)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--neu-shadow-primary)' }}>
              <Video size={20} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--neu-text)' }}>
            Konolive
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--neu-muted)' }}>
            Créer votre compte coach mobile
          </p>
        </div>

        {/* ── Carte principale (surélevée) ─────────── */}
        <div className="neu-card">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--neu-text)' }}>
            S'inscrire
          </h2>

          <form onSubmit={handleRegister} className="space-y-4">

            {/* Nom d'utilisateur */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                Nom d'utilisateur <span className="text-destructive">*</span>
              </label>
              <input className="neu-input" placeholder="Ex : Axel, Youb, Dolic…"
                value={form.username} onChange={e => set('username', e.target.value)} required />
              <p className="text-xs" style={{ color: 'var(--neu-muted)' }}>
                Lettres, chiffres et underscores uniquement.
              </p>
            </div>

            {/* Localité — GPS */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                Localité
              </label>
              {detectingLocality ? (
                <div className="neu-pressed rounded-xl px-4 py-3 flex items-center gap-2"
                  style={{ color: 'var(--neu-muted)' }}>
                  <Loader2 size={15} className="animate-spin shrink-0" />
                  <span className="text-sm">Détection de votre position...</span>
                </div>
              ) : localityError ? (
                <div className="space-y-2">
                  <div className="neu-pressed rounded-xl px-4 py-3 flex items-start gap-2"
                    style={{ color: 'hsl(var(--destructive))' }}>
                    <MapPinOff size={15} className="shrink-0 mt-0.5" />
                    <span className="text-sm text-pretty">{localityError}</span>
                  </div>
                  {/* Bouton Actualiser */}
                  <button
                    type="button"
                    onClick={detectLocality}
                    className="neu-btn-secondary w-full py-2.5 text-sm flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Actualiser la localisation
                  </button>
                </div>
              ) : (
                <div className="neu-pressed rounded-xl px-4 py-3 flex items-center gap-2"
                  style={{ color: 'var(--neu-text)' }}>
                  <MapPin size={15} className="shrink-0" style={{ color: 'var(--neu-accent)' }} />
                  <span className="text-sm flex-1 min-w-0 truncate">{form.locality}</span>
                  {/* Bouton re-détecter si déjà détecté */}
                  <button
                    type="button"
                    onClick={detectLocality}
                    title="Re-détecter la localité"
                    className="shrink-0 p-1 rounded-lg transition-colors"
                    style={{ color: 'var(--neu-muted)' }}
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              )}
              <p className="text-xs" style={{ color: 'var(--neu-muted)' }}>
                Votre localité est automatiquement détectée via GPS.
              </p>
            </div>

            {/* Téléphone */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                Numéro de téléphone
              </label>
              <input className="neu-input" placeholder="Ex : 064081787"
                value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" />
            </div>

            {/* Mot de passe */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                Mot de passe <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input className="neu-input pr-12"
                  type={showPw ? 'text' : 'password'} placeholder="Au moins 8 caractères"
                  value={form.password} onChange={e => set('password', e.target.value)} required />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--neu-muted)' }}>
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <PasswordStrengthBar password={form.password} />
            </div>

            {/* Confirmer MDP */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                Confirmer le mot de passe <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  className="neu-input pr-10"
                  type={showPw ? 'text' : 'password'} placeholder="Répéter le mot de passe"
                  value={form.confirm} onChange={e => set('confirm', e.target.value)} required
                  style={form.confirm.length > 0 ? {
                    outline: '2px solid',
                    outlineOffset: '-2px',
                    outlineColor: form.password === form.confirm ? 'hsl(142 55% 45%)' : 'hsl(0 72% 58%)',
                  } : {}}
                />
                {form.confirm.length > 0 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    {form.password === form.confirm
                      ? <CheckCircle2 size={17} className="text-green-500" />
                      : <XCircle size={17} className="text-destructive" />}
                  </div>
                )}
              </div>
              {form.confirm.length > 0 && (
                <p className={`text-xs font-medium ml-1 ${form.password === form.confirm ? 'text-green-500' : 'text-destructive'}`}>
                  {form.password === form.confirm ? 'Les mots de passe correspondent' : 'Les mots de passe ne correspondent pas'}
                </p>
              )}
            </div>

            {/* Code secret */}
            <div className="pt-1 space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
                Code secret de récupération
              </h3>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                  Question de sécurité
                </label>
                <div className="relative">
                  <select className="neu-input appearance-none pr-10 w-full"
                    value={form.security_question} onChange={e => set('security_question', e.target.value)} required>
                    <option value="Quel est le nom de votre père ?">Quel est le nom de votre père ?</option>
                    <option value="Quel est le nom de votre mère ?">Quel est le nom de votre mère ?</option>
                    <option value="Quelle est votre date de naissance ?">Quelle est votre date de naissance ?</option>
                    <option value="Quelle est votre date d'anniversaire ?">Quelle est votre date d'anniversaire ?</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4"
                    style={{ color: 'var(--neu-muted)' }}>
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
                  Réponse secrète
                </label>
                <input className="neu-input" type="text" placeholder="Votre réponse..."
                  value={form.security_answer} onChange={e => set('security_answer', e.target.value)} required />
              </div>
            </div>

            {/* Accord CGU */}
            <label className="flex items-start gap-3 cursor-pointer min-h-12 pt-1">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary" />
              <span className="text-sm" style={{ color: 'var(--neu-muted)' }}>
                J'accepte les{' '}
                <span className="font-medium hover:underline cursor-pointer" style={{ color: 'var(--neu-accent)' }}>
                  Conditions d'utilisation
                </span>{' '}
                et la{' '}
                <span className="font-medium hover:underline cursor-pointer" style={{ color: 'var(--neu-accent)' }}>
                  Politique de confidentialité
                </span>
              </span>
            </label>

            {/* Bouton inscription */}
            <button type="submit" disabled={loading || !agreed || !localityDetected}
              className="neu-btn-primary w-full py-3.5 mt-1">
              {loading
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><UserPlus size={18} /><span>Créer un compte</span></>
              }
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--neu-muted)' }}>
            Vous avez déjà un compte ?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--neu-accent)' }}>
              Se connecter
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

      </div>
    </div>
  );
}

