import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getMyRequests, getNotifications } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { VerificationRequest, Notification } from '@/types/types';
import { FileText, Clock, CheckCircle2, XCircle, Plus, Bell, Timer, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

// ── Calcul du temps restant avant minuit (Heure de Brazzaville) ──────────────
function msUntilMidnight(): number {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Africa/Brazzaville' });
  const bzvNow = new Date(nowStr);
  const bzvMidnight = new Date(bzvNow);
  bzvMidnight.setHours(24, 0, 0, 0);
  return bzvMidnight.getTime() - bzvNow.getTime();
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ApplicantDashboard() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(msUntilMidnight());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Chargement des données ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!profile) return;
    const [reqs, notifs] = await Promise.all([
      getMyRequests(profile.id, 50),
      getNotifications(profile.id, 5),
    ]);
    setRequests(reqs);
    setNotifications(notifs);
    setLoading(false);
  }, [profile]);

  // ── Mise en place du temps réel Supabase ────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    load();
    const ch = supabase.channel(`applicant-dash-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'verification_requests',
        filter: `applicant_id=eq.${profile.id}`,
      }, () => load())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  // ── Compte à rebours vers minuit (réinitialisation 24h) ─────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      const remaining = msUntilMidnight();
      setCountdown(remaining);
      // À minuit, recharger les stats
      if (remaining < 1000) setTimeout(load, 1500);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  // ── Stats filtrées sur le jour courant ─────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const todayRequests = requests.filter(r => r.created_at >= today + 'T00:00:00');

  const stats = {
    total:     todayRequests.length,
    pending:   todayRequests.filter(r => r.status === 'pending').length,
    accepted:  todayRequests.filter(r => r.status === 'accepted').length,
    rejected:  todayRequests.filter(r => r.status === 'rejected').length,
  };

  // Demandes récentes (toutes, pas seulement 24h — pour l'historique)
  const recent = requests.slice(0, 5);

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* En-tête */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">
              Bienvenue, {profile?.username} 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Voici un aperçu de vos vérifications.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Badge compte à rebours 24h */}
            <div className="neu-flat flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm">
              <Timer size={15} className="text-primary shrink-0" />
              <span className="text-muted-foreground text-xs">Réinitialisation dans</span>
              <span className="font-mono font-bold text-foreground">{formatCountdown(countdown)}</span>
            </div>
            <Link to="/dashboard/new-request">
              <button className="neu-btn-primary flex items-center gap-2 px-5 py-2.5">
                <Plus size={16} /><span>Nouvelle demande</span>
              </button>
            </Link>
          </div>
        </div>

        {/* Indicateur temps réel */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Mise à jour en temps réel
          </span>
          <span className="text-border">•</span>
          <span>Stats du jour uniquement</span>
        </div>

        {/* Cartes de statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Demandes aujourd'hui", value: stats.total,    icon: <FileText    size={22} className="text-primary"      />, color: 'text-primary'      },
            { label: 'En attente',           value: stats.pending,  icon: <Clock       size={22} className="text-orange-500"   />, color: 'text-orange-500'   },
            { label: 'Acceptées',            value: stats.accepted, icon: <CheckCircle2 size={22} className="text-green-600"  />, color: 'text-green-600'    },
            { label: 'Rejetées',             value: stats.rejected, icon: <XCircle     size={22} className="text-red-500"     />, color: 'text-red-500'      },
          ].map(s => (
            <div key={s.label} className="stat-card p-3 sm:p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide leading-tight">{s.label}</p>
                  <p className={`text-xl sm:text-3xl font-bold mt-1 ${s.color}`}>
                    {loading ? '—' : s.value}
                  </p>
                </div>
                <div className="neu-flat w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 scale-75 sm:scale-100">
                  {s.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Demandes récentes */}
          <div className="neu-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Demandes récentes</h2>
              <Link to="/dashboard/requests" className="text-xs text-primary hover:underline">Voir tout</Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="neu-pressed h-14 rounded-xl animate-pulse" />)}
              </div>
            ) : recent.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p>Aucune demande pour l'instant.</p>
                <Link to="/dashboard/new-request" className="text-primary hover:underline mt-1 inline-block">
                  Créer votre première demande
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {recent.map(r => (
                  <li key={r.id}>
                    <Link to={`/dashboard/requests/${r.id}`}
                      className="flex items-center justify-between p-3 rounded-xl transition-all hover:-translate-y-0.5"
                      style={{ background: 'var(--neu-base)', boxShadow: 'var(--shadow-neu-flat)' }}>
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="text-sm font-medium text-foreground truncate">+{r.phone_to_certify}</p>
                        {r.status === 'rejected' && r.notes && (
                          <p className="text-xs text-red-500 font-medium mt-0.5 flex items-center gap-1 truncate">
                            <XCircle size={11} className="shrink-0" />
                            {r.notes}
                          </p>
                        )}
                        {r.status === 'other' && r.notes && (
                          <p className="text-xs text-amber-600 font-medium mt-0.5 flex items-center gap-1 truncate">
                            <MoreHorizontal size={11} className="shrink-0" />
                            {r.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notifications récentes */}
          <div className="neu-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Notifications récentes</h2>
              <Link to="/dashboard/notifications" className="text-xs text-primary hover:underline">Voir tout</Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="neu-pressed h-14 rounded-xl animate-pulse" />)}
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p>Aucune notification pour l'instant.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {notifications.map(n => (
                  <li key={n.id} className={`p-3 rounded-xl ${!n.is_read ? 'neu-pressed' : ''}`}>
                    <div className="flex items-start gap-2">
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 text-pretty">{n.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
