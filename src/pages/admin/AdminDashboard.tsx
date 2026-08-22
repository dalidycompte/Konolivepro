import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getGlobalStats, getAgentStats, getAllRequests } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { GlobalStats, AgentStats, VerificationRequest } from '@/types/types';
import {
  BarChart2, CheckCircle2, XCircle, Minus, Clock, Loader2,
  FileText, Users, Shield, CalendarDays,
} from 'lucide-react';
import { formatDistanceToNow, isToday, parseISO } from 'date-fns';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
  const [stats, setStats]               = useState<GlobalStats | null>(null);
  const [agentStats, setAgentStats]     = useState<AgentStats[]>([]);
  const [recentRequests, setRecentRequests] = useState<VerificationRequest[]>([]);
  const [todayRequests, setTodayRequests]   = useState<VerificationRequest[]>([]);
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    const [g, a, r, all] = await Promise.all([
      getGlobalStats(), getAgentStats(), getAllRequests(5), getAllRequests(500),
    ]);
    setStats(g);
    setAgentStats(a);
    setRecentRequests(r);
    // Filtre uniquement les demandes du jour courant
    setTodayRequests(all.filter(req => {
      try { return isToday(parseISO(req.created_at)); } catch { return false; }
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('admin-dash-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Compteurs du jour calculés localement
  const todayPending    = todayRequests.filter(r => r.status === 'pending').length;
  const todayProcessing = todayRequests.filter(r => r.status === 'processing').length;
  const todayAccepted   = todayRequests.filter(r => r.status === 'accepted').length;
  const todayRejected   = todayRequests.filter(r => r.status === 'rejected').length;
  const todayUnchanged  = todayRequests.filter(r => r.status === 'unchanged').length;

  const statCards = [
    { label: "Total aujourd'hui",   value: todayRequests.length, icon: <CalendarDays size={20} className="text-primary" />,       color: 'text-primary'      },
    { label: 'En attente',          value: todayPending,         icon: <Clock size={20} className="text-orange-500" />,           color: 'text-orange-500'   },
    { label: 'En cours',            value: todayProcessing,      icon: <Loader2 size={20} className="text-blue-500" />,           color: 'text-blue-500'     },
    { label: 'Acceptées',           value: todayAccepted,        icon: <CheckCircle2 size={20} className="text-green-600" />,     color: 'text-green-600'    },
    { label: 'Rejetées',            value: todayRejected,        icon: <XCircle size={20} className="text-red-500" />,            color: 'text-red-500'      },
    { label: 'Inchangées',          value: todayUnchanged,       icon: <Minus size={20} className="text-gray-500" />,             color: 'text-gray-500'     },
    { label: 'Total (global)',       value: stats?.total_all ?? 0,icon: <FileText size={20} className="text-purple-500" />,       color: 'text-purple-500'   },
    { label: 'Agents actifs',       value: agentStats.length,    icon: <Users size={20} className="text-teal-500" />,             color: 'text-teal-500'     },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Tableau de bord Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Chiffres du jour — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map(s => (
            <div key={s.label} className="stat-card p-3 sm:p-4 h-full">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.label}</p>
                  <p className={`text-xl sm:text-3xl font-bold mt-1 ${s.color}`}>{loading ? '—' : s.value}</p>
                </div>
                <div className="neu-flat w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 scale-75 sm:scale-100">{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Gérer les utilisateurs', desc: 'Créer, modifier, désactiver des comptes', path: '/admin/users',    icon: <Users size={22} className="text-primary" /> },
            { label: 'Toutes les demandes',    desc: 'Voir et filtrer toutes les vérifications', path: '/admin/requests', icon: <FileText size={22} className="text-purple-500" /> },
            { label: "Journaux d'activité",    desc: "Piste d'audit de toutes les actions",      path: '/admin/logs',     icon: <Shield size={22} className="text-teal-500" /> },
          ].map(q => (
            <Link key={q.path} to={q.path} className="neu-card flex items-center gap-4 hover:-translate-y-1 transition-all duration-200 cursor-pointer">
              <div className="w-12 h-12 rounded-xl neu-flat flex items-center justify-center shrink-0">{q.icon}</div>
              <div>
                <p className="font-semibold text-foreground">{q.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent requests */}
        <div className="neu-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Demandes récentes</h2>
            <Link to="/admin/requests" className="text-xs text-primary hover:underline">Voir tout</Link>
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="neu-pressed h-12 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="space-y-2">
              {recentRequests.map(r => (
                <div key={r.id} className="flex items-center gap-4 p-3 rounded-xl"
                  style={{ background: 'var(--neu-base)', boxShadow: 'var(--shadow-neu-flat)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">+{r.phone_to_certify} <span className="text-muted-foreground font-normal">· {r.applicant?.username}</span></p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
