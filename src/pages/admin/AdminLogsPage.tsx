import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getActivityLogs } from '@/lib/api';
import type { ActivityLog } from '@/types/types';
import { Shield, Search, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getActivityLogs(200);
    setLogs(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter(l => {
    if (!search) return true;
    return l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.user as { username?: string })?.username?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Journaux d'activité</h1>
          <p className="text-muted-foreground text-sm mt-1">Piste d'audit complète de toutes les activités système.</p>
        </div>

        <div className="neu-card py-4 px-5">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="neu-input pl-10" placeholder="Rechercher par action ou utilisateur…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="neu-card overflow-hidden">
          {loading ? (
            <div className="space-y-2 p-2">{[1,2,3].map(i => <div key={i} className="neu-pressed h-12 rounded-xl animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Shield size={32} className="mx-auto mb-2 opacity-30" />
              <p>Aucun journal d'activité trouvé.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    {['Heure', 'Utilisateur', 'Rôle', 'Action', 'Détails'].map(h => (
                      <th key={h} className="py-3 px-4 whitespace-nowrap font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(log => {
                    const u = log.user as { username?: string; role?: string } | undefined;
                    return (
                      <tr key={log.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1"><Clock size={12} />{format(new Date(log.created_at), 'dd MMM, HH:mm:ss')}</span>
                        </td>
                        <td className="py-3 px-4 text-sm font-medium whitespace-nowrap">{u?.username ?? '—'}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{u?.role ?? '—'}</span>
                        </td>
                        <td className="py-3 px-4 text-sm whitespace-nowrap">{log.action}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground max-w-xs truncate">
                          {log.details ? JSON.stringify(log.details).slice(0, 80) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
