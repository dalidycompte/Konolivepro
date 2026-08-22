import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Moon, Star, Flame, Cloud,
  Video, Bell, MessageSquare, User, Settings,
  ChevronRight, Check, ArrowLeft, Palette,
} from 'lucide-react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';

// ─────────────────────────────────────────────
// Définition des 5 styles
// ─────────────────────────────────────────────
interface StyleDef {
  id: Theme;
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  preview: {
    bg: string;
    card: string;
    cardBorder: string;
    text: string;
    textMuted: string;
    primary: string;
    primaryText: string;
    accent: string;
    input: string;
    shadow: string;
    badge: string;
  };
}

const STYLES: StyleDef[] = [
  {
    id: 'light',
    name: 'Clair',
    subtitle: 'Propre & Aéré',
    icon: <Sun size={18} />,
    preview: {
      bg: 'linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)',
      card: '#ffffff',
      cardBorder: 'rgba(37,99,235,0.12)',
      text: '#1e293b',
      textMuted: '#64748b',
      primary: '#2563eb',
      primaryText: '#ffffff',
      accent: '#eff6ff',
      input: '#f1f5f9',
      shadow: '0 4px 20px rgba(37,99,235,0.12)',
      badge: '#dbeafe',
    },
  },
  {
    id: 'dark',
    name: 'Sombre',
    subtitle: 'Professionnel & Net',
    icon: <Moon size={18} />,
    preview: {
      bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      card: '#1e293b',
      cardBorder: 'rgba(255,255,255,0.08)',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      primary: '#3b82f6',
      primaryText: '#ffffff',
      accent: '#1e3a5f',
      input: '#0f172a',
      shadow: '0 4px 20px rgba(0,0,0,0.4)',
      badge: '#1e3a5f',
    },
  },
  {
    id: 'midnight',
    name: 'Minuit',
    subtitle: 'Neumorphique & Élégant',
    icon: <Star size={18} />,
    preview: {
      bg: 'linear-gradient(135deg, #0a0a0f 0%, #12121a 100%)',
      card: '#16161f',
      cardBorder: 'transparent',
      text: '#e2e8f0',
      textMuted: '#7c8ba1',
      primary: '#6366f1',
      primaryText: '#ffffff',
      accent: '#1e1e2e',
      input: '#0d0d15',
      shadow: '4px 4px 12px #050508, -3px -3px 8px #1e1e2e',
      badge: '#1e1e2e',
    },
  },
  {
    id: 'warm',
    name: 'Chaud',
    subtitle: 'Doux & Chaleureux',
    icon: <Flame size={18} />,
    preview: {
      bg: 'linear-gradient(135deg, #fdf6f0 0%, #fef3e8 100%)',
      card: '#fffaf5',
      cardBorder: 'rgba(180,83,9,0.1)',
      text: '#431407',
      textMuted: '#92400e',
      primary: '#d97706',
      primaryText: '#ffffff',
      accent: '#fef3c7',
      input: '#fdf4e7',
      shadow: '0 4px 16px rgba(217,119,6,0.15)',
      badge: '#fef3c7',
    },
  },
  {
    id: 'gray',
    name: 'Gris',
    subtitle: 'Neutre & Sobre',
    icon: <Cloud size={18} />,
    preview: {
      bg: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
      card: '#27272a',
      cardBorder: 'rgba(255,255,255,0.06)',
      text: '#fafafa',
      textMuted: '#a1a1aa',
      primary: '#71717a',
      primaryText: '#ffffff',
      accent: '#3f3f46',
      input: '#18181b',
      shadow: '0 4px 20px rgba(0,0,0,0.5)',
      badge: '#3f3f46',
    },
  },
];

// ─────────────────────────────────────────────
// Maquette miniature d'écran de connexion
// ─────────────────────────────────────────────
function MiniLoginScreen({ p }: { p: StyleDef['preview'] }) {
  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: p.bg, padding: '14px 12px', gap: 10, minHeight: 220 }}
    >
      {/* Header brand */}
      <div className="flex flex-col items-center gap-1.5" style={{ marginBottom: 4 }}>
        <div
          className="rounded-xl flex items-center justify-center"
          style={{ width: 36, height: 36, background: p.primary, boxShadow: p.shadow }}
        >
          <Video size={16} color={p.primaryText} />
        </div>
        <span style={{ color: p.text, fontWeight: 700, fontSize: 13 }}>Konolive</span>
        <span style={{ color: p.textMuted, fontSize: 9 }}>Vérification d'identité</span>
      </div>

      {/* Card */}
      <div
        className="rounded-xl flex flex-col gap-2"
        style={{
          background: p.card,
          border: `1px solid ${p.cardBorder}`,
          padding: '10px 10px',
          boxShadow: p.shadow,
        }}
      >
        <span style={{ color: p.text, fontWeight: 600, fontSize: 11 }}>Se connecter</span>
        {/* Input fields */}
        {['Identifiant', 'Mot de passe'].map(pl => (
          <div
            key={pl}
            className="rounded-lg px-2 py-1.5"
            style={{ background: p.input, border: `1px solid ${p.cardBorder}`, fontSize: 9, color: p.textMuted }}
          >
            {pl}
          </div>
        ))}
        {/* Button */}
        <div
          className="rounded-lg flex items-center justify-center gap-1 py-1.5"
          style={{ background: p.primary, color: p.primaryText, fontSize: 10, fontWeight: 600 }}
        >
          <User size={9} />
          Connexion
        </div>
      </div>

      {/* Bottom nav mini */}
      <div
        className="rounded-xl flex justify-around items-center py-1.5 px-1 mt-auto"
        style={{ background: p.card, border: `1px solid ${p.cardBorder}` }}
      >
        {[Video, MessageSquare, Bell, Settings].map((Icon, i) => (
          <div
            key={i}
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 24, height: 24,
              background: i === 0 ? p.accent : 'transparent',
              color: i === 0 ? p.primary : p.textMuted,
            }}
          >
            <Icon size={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Maquette miniature du dashboard agent
// ─────────────────────────────────────────────
function MiniDashboard({ p }: { p: StyleDef['preview'] }) {
  const stats = [
    { label: 'En attente', value: '12', color: '#f59e0b' },
    { label: 'Traités', value: '47', color: '#10b981' },
    { label: 'En cours', value: '3', color: p.primary },
  ];
  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: p.bg, padding: '12px 10px', gap: 8, minHeight: 220 }}
    >
      {/* Topbar */}
      <div className="flex items-center justify-between">
        <span style={{ color: p.text, fontWeight: 700, fontSize: 11 }}>Tableau de bord</span>
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: 24, height: 24, background: p.accent }}
        >
          <Bell size={10} color={p.textMuted} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1">
        {stats.map(s => (
          <div
            key={s.label}
            className="rounded-xl flex flex-col items-center py-2"
            style={{ background: p.card, border: `1px solid ${p.cardBorder}`, boxShadow: p.shadow }}
          >
            <span style={{ color: s.color, fontWeight: 800, fontSize: 16 }}>{s.value}</span>
            <span style={{ color: p.textMuted, fontSize: 8, textAlign: 'center', lineHeight: 1.2 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Request list */}
      <div
        className="rounded-xl flex flex-col divide-y overflow-hidden"
        style={{ background: p.card, border: `1px solid ${p.cardBorder}`, boxShadow: p.shadow }}
      >
        {['+225 07 12 34 56', '+225 05 98 76 54'].map((phone, i) => (
          <div key={phone} className="flex items-center gap-2 px-2 py-1.5">
            <div
              className="rounded-full flex items-center justify-center shrink-0"
              style={{ width: 20, height: 20, background: i === 0 ? '#fef9c3' : '#dcfce7' }}
            >
              <User size={9} color={i === 0 ? '#ca8a04' : '#16a34a'} />
            </div>
            <span style={{ color: p.text, fontSize: 9, flex: 1 }}>{phone}</span>
            <div
              className="rounded-full px-1.5 py-0.5"
              style={{ background: p.badge, color: p.textMuted, fontSize: 7 }}
            >
              {i === 0 ? 'En cours' : 'Accepté'}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        className="rounded-xl flex items-center justify-between px-3 py-2 mt-auto"
        style={{ background: p.primary }}
      >
        <span style={{ color: p.primaryText, fontSize: 9, fontWeight: 600 }}>Nouvelle demande</span>
        <ChevronRight size={12} color={p.primaryText} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────
export default function StyleShowcasePage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [preview, setPreview] = useState<'login' | 'dashboard'>('login');
  const [applied, setApplied] = useState<Theme | null>(null);

  function applyTheme(id: Theme) {
    setTheme(id);
    setApplied(id);
    setTimeout(() => setApplied(null), 2000);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground truncate">Styles de design</h1>
          <p className="text-xs text-muted-foreground">Choisissez l'apparence de Konolive</p>
        </div>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
          <Palette size={18} className="text-primary" />
        </div>
      </div>

      <div className="px-4 pt-4 pb-24 space-y-6">

        {/* Thème actif */}
        <div className="rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Check size={18} className="text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Thème actif : <span className="text-primary capitalize">{STYLES.find(s => s.id === theme)?.name ?? theme}</span>
            </p>
            <p className="text-xs text-muted-foreground">{STYLES.find(s => s.id === theme)?.subtitle}</p>
          </div>
        </div>

        {/* Switcher aperçu */}
        <div className="flex rounded-xl bg-muted p-1 gap-1">
          {(['login', 'dashboard'] as const).map(v => (
            <button
              key={v}
              onClick={() => setPreview(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                preview === v
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {v === 'login' ? '🔐 Connexion' : '📊 Dashboard'}
            </button>
          ))}
        </div>

        {/* Grille des styles */}
        <div className="space-y-4">
          {STYLES.map(style => (
            <div
              key={style.id}
              className={`rounded-2xl border-2 transition-all overflow-hidden ${
                theme === style.id
                  ? 'border-primary shadow-lg shadow-primary/20'
                  : 'border-border'
              }`}
            >
              {/* En-tête du style */}
              <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: style.preview.primary, color: style.preview.primaryText }}
                >
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{style.name}</p>
                  <p className="text-xs text-muted-foreground">{style.subtitle}</p>
                </div>
                {theme === style.id && (
                  <div className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-2 py-1 rounded-full">
                    <Check size={12} />
                    Actif
                  </div>
                )}
              </div>

              {/* Aperçu miniature */}
              <div className="p-3 bg-muted/30">
                {preview === 'login'
                  ? <MiniLoginScreen p={style.preview} />
                  : <MiniDashboard p={style.preview} />
                }
              </div>

              {/* Palette de couleurs */}
              <div className="px-4 py-2 flex items-center gap-2 bg-card border-t border-border">
                <span className="text-xs text-muted-foreground mr-1">Palette</span>
                {[
                  style.preview.primary,
                  style.preview.text,
                  style.preview.textMuted,
                  style.preview.card,
                  style.preview.accent,
                ].map((color, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full border border-border"
                    style={{ background: color }}
                    title={color}
                  />
                ))}
                <div className="flex-1" />
                <button
                  onClick={() => applyTheme(style.id)}
                  disabled={theme === style.id}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    theme === style.id
                      ? 'bg-primary/10 text-primary cursor-default'
                      : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95'
                  }`}
                >
                  {applied === style.id ? '✓ Appliqué !' : theme === style.id ? 'Actif' : 'Appliquer'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <p className="text-center text-xs text-muted-foreground px-6">
          Le style choisi est sauvegardé automatiquement et s'applique à toute l'application.
        </p>
      </div>
    </div>
  );
}
