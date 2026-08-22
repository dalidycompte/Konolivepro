import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getGlobalStats, getAgentStats } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { GlobalStats, AgentStats } from '@/types/types';
import { BarChart2, Clock, Users, TrendingUp } from 'lucide-react';

export default function AdminStatsPage() {
  const [stats, setStats]           = useState<GlobalStats | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    const [g, a] = await Promise.all([getGlobalStats(), getAgentStats()]);
    setStats(g);
    setAgentStats(a.sort((x, y) => y.total_processed - x.total_processed));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('admin-stats-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const totalProcessed = (stats?.accepted ?? 0) + (stats?.rejected ?? 0) + (stats?.unchanged ?? 0);
  const acceptRate = totalProcessed > 0 ? Math.round(((stats?.accepted ?? 0) / totalProcessed) * 100) : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Statistiques</h1>
          <p className="text-muted-foreground text-sm mt-1">Métriques globales de la plateforme et performance.</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total demandes', value: stats?.total_all ?? 0, sub: `${stats?.total_today ?? 0} aujourd'hui`, icon: <BarChart2 size={20} className="text-primary" />, color: 'text-primary' },
            { label: "Taux d'acceptation", value: `${acceptRate}%`, sub: `${stats?.accepted ?? 0} acceptées`, icon: <TrendingUp size={20} className="text-green-600" />, color: 'text-green-600' },
            { label: "File d'attente", value: stats?.pending ?? 0, sub: `${stats?.processing ?? 0} en cours`, icon: <Clock size={20} className="text-orange-500" />, color: 'text-orange-500' },
            { label: 'Agents actifs', value: agentStats.length, sub: 'agents enregistrés', icon: <Users size={20} className="text-purple-500" />, color: 'text-purple-500' },
          ].map(s => (
            <div key={s.label} className="stat-card h-full">
              <div className="flex items-start justify-between mb-2">
                <div className="neu-flat w-10 h-10 rounded-xl flex items-center justify-center">{s.icon}</div>
              </div>
              <p className={`text-3xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mt-1">{s.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Status breakdown */}
        <div className="neu-card">
          <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><BarChart2 size={18} className="text-primary" />Répartition par statut</h2>
          <div className="space-y-3">
            {[
              { label: 'Acceptées',  value: stats?.accepted  ?? 0, total: totalProcessed,     color: 'bg-green-500',  text: 'text-green-600' },
              { label: 'Rejetées',   value: stats?.rejected  ?? 0, total: totalProcessed,     color: 'bg-red-500',    text: 'text-red-500'   },
              { label: 'Inchangées', value: stats?.unchanged ?? 0, total: totalProcessed,     color: 'bg-gray-400',   text: 'text-gray-500'  },
              { label: 'En attente', value: stats?.pending   ?? 0, total: stats?.total_all ?? 1, color: 'bg-orange-400', text: 'text-orange-500' },
              { label: 'En cours',   value: stats?.processing?? 0, total: stats?.total_all ?? 1, color: 'bg-blue-400',   text: 'text-blue-500'  },
            ].map(b => {
              const pct = b.total > 0 ? Math.round((b.value / b.total) * 100) : 0;
              return (
                <div key={b.label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-foreground">{b.label}</span>
                    <span className={`font-bold ${b.text}`}>{loading ? '—' : b.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2.5 neu-pressed rounded-full overflow-hidden">
                    <div className={`h-full ${b.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agent leaderboard */}
        <div className="neu-card">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Users size={18} className="text-primary" />Classement des agents</h2>
          {agentStats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Aucun agent trouvé.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    {['#', 'Agent', 'Total', 'Acceptées', 'Rejetées', 'Inchangées', "Aujourd'hui"].map(h => (
                      <th key={h} className="pb-3 pr-6 whitespace-nowrap font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((s, i) => (
                    <tr key={s.agent.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-6 font-bold text-muted-foreground whitespace-nowrap">{i + 1}</td>
                      <td className="py-3 pr-6 font-semibold text-foreground whitespace-nowrap">{s.agent.username}</td>
                      <td className="py-3 pr-6 text-primary font-bold whitespace-nowrap">{s.total_processed}</td>
                      <td className="py-3 pr-6 text-green-600 font-medium whitespace-nowrap">{s.accepted}</td>
                      <td className="py-3 pr-6 text-red-500 font-medium whitespace-nowrap">{s.rejected}</td>
                      <td className="py-3 pr-6 text-gray-500 font-medium whitespace-nowrap">{s.unchanged}</td>
                      <td className="py-3 text-foreground font-semibold whitespace-nowrap">{s.today_processed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
