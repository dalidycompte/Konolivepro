import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getAgentStats } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { AgentStats } from '@/types/types';
import { UserCheck, TrendingUp, Clock, Award } from 'lucide-react';

export default function SupervisorAgentStatsPage() {
  const [stats, setStats] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getAgentStats();
    setStats(data.sort((a, b) => b.total_processed - a.total_processed));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('agent-stats-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  function fmtTime(s: number | null) {
    if (!s) return '—';
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}m ${sec}s`;
  }

  function pct(val: number, total: number) {
    return total > 0 ? Math.round((val / total) * 100) : 0;
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Statistiques des agents</h1>
          <p className="text-muted-foreground text-sm mt-1">Métriques de performance détaillées pour chaque agent.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="neu-flat h-48 rounded-xl animate-pulse" />)}
          </div>
        ) : stats.length === 0 ? (
          <div className="neu-card text-center py-16 text-muted-foreground">Aucun agent trouvé.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.map((s, idx) => (
              <div key={s.agent.id} className="neu-card h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-amber-700' : 'bg-primary/60'}`}>
                    #{idx + 1}
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{s.agent.username}</p>
                    <p className="text-xs text-muted-foreground">{s.agent.locality ?? 'Agent'}</p>
                  </div>
                  {idx === 0 && <Award size={18} className="ml-auto text-amber-500 shrink-0" />}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="neu-pressed rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{s.total_processed}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total traité</p>
                  </div>
                  <div className="neu-pressed rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{s.today_processed}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Aujourd'hui</p>
                  </div>
                </div>

                {/* Progress bars */}
                <div className="space-y-2">
                  {[
                    { label: 'Acceptées', value: s.accepted, color: 'bg-green-500' },
                    { label: 'Rejetées', value: s.rejected, color: 'bg-red-500' },
                    { label: 'Inchangées', value: s.unchanged, color: 'bg-gray-400' },
                  ].map(bar => (
                    <div key={bar.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{bar.label}</span>
                        <span className="font-medium text-foreground">{bar.value} ({pct(bar.value, s.total_processed)}%)</span>
                      </div>
                      <div className="h-2 neu-pressed rounded-full overflow-hidden">
                        <div className={`h-full ${bar.color} rounded-full transition-all`} style={{ width: `${pct(bar.value, s.total_processed)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                  <Clock size={13} />
                  <span>Durée moy. de traitement : <span className="font-semibold text-foreground">{fmtTime(s.avg_processing_seconds)}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
