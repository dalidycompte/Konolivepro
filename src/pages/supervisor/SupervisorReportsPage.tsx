import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getGlobalStats, getAgentStats, getAllRequests } from '@/lib/api';
import type { GlobalStats, AgentStats, VerificationRequest } from '@/types/types';
import { FileText, Download, CheckCircle2, XCircle, Minus, List } from 'lucide-react';
import { format, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { toast } from 'sonner';

type Period = 'daily' | 'weekly' | 'monthly';
type StatusFilter = 'all' | 'accepted' | 'rejected' | 'unchanged';

const STATUS_FILTERS: { value: StatusFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'all',       label: 'Toutes',    icon: <List size={14} />,         color: 'text-foreground'   },
  { value: 'accepted',  label: 'Acceptées', icon: <CheckCircle2 size={14} />, color: 'text-green-600'    },
  { value: 'rejected',  label: 'Rejetées',  icon: <XCircle size={14} />,      color: 'text-red-500'      },
  { value: 'unchanged', label: 'Inchangées',icon: <Minus size={14} />,        color: 'text-gray-500'     },
];

export default function SupervisorReportsPage() {
  const [period, setPeriod]           = useState<Period>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [agentStats, setAgentStats]   = useState<AgentStats[]>([]);
  const [requests, setRequests]       = useState<VerificationRequest[]>([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    const [g, a, r] = await Promise.all([getGlobalStats(), getAgentStats(), getAllRequests(1000)]);
    setGlobalStats(g);
    setAgentStats(a);
    setRequests(r);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function getStartDate(p: Period): Date {
    const now = new Date();
    if (p === 'weekly') return startOfWeek(now, { weekStartsOn: 1 });
    return startOfMonth(now);
  }

  // Filtrage par date (période)
  const dateFilteredRequests = period === 'daily'
    ? requests.filter(r => format(new Date(r.created_at), 'yyyy-MM-dd') === selectedDate)
    : requests.filter(r => new Date(r.created_at) >= getStartDate(period));

  // Filtrage par agent
  const agentFilteredRequests = selectedAgent === 'all'
    ? dateFilteredRequests
    : dateFilteredRequests.filter(r => r.agent_id === selectedAgent);

  // Filtrage par statut
  const filteredRequests = statusFilter === 'all'
    ? agentFilteredRequests
    : agentFilteredRequests.filter(r => r.status === statusFilter);

  // L'export porte sur les lignes filtrées
  function exportCSV() {
    const headers = ['Agent', 'Numéro certifié', 'Date de création', 'Coach mobile', 'Statut', 'ID', 'Date de traitement'];
    const rows = filteredRequests.map(r => [
      r.agent?.username ?? '',
      r.phone_to_certify,
      format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
      r.applicant?.username ?? '',
      statusLabel(r.status),
      r.id.slice(0, 8),
      r.processed_at ? format(new Date(r.processed_at), 'yyyy-MM-dd HH:mm') : '',
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `konolive-report-${period}-${statusFilter}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Rapport exporté en CSV');
  }

  function exportJSON() {
    const data = {
      period, status_filter: statusFilter, generated_at: new Date().toISOString(),
      global: globalStats,
      agents: agentStats.map(s => ({ agent: s.agent.username, total: s.total_processed, accepted: s.accepted, rejected: s.rejected, unchanged: s.unchanged })),
      requests: filteredRequests.map(r => ({ agent: r.agent?.username, phone: r.phone_to_certify, created: r.created_at, applicant: r.applicant?.username, status: r.status, id: r.id, processed: r.processed_at })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `konolive-report-${period}-${statusFilter}-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Rapport exporté en JSON');
  }

  // Label du statut en français
  function statusLabel(s: string) {
    if (s === 'accepted')  return 'Acceptée';
    if (s === 'rejected')  return 'Rejetée';
    if (s === 'unchanged') return 'Inchangée';
    if (s === 'pending')   return 'En attente';
    if (s === 'processing')return 'En cours';
    return s;
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Rapports</h1>
            <p className="text-muted-foreground text-sm mt-1">Générez et exportez les rapports de vérification.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="neu-btn flex items-center gap-2 py-2.5 px-4 text-sm text-primary">
              <Download size={16} /><span>Exporter CSV</span>
            </button>
            <button onClick={exportJSON} className="neu-btn-primary flex items-center gap-2 py-2.5 px-4 text-sm">
              <Download size={16} /><span>Exporter JSON</span>
            </button>
          </div>
        </div>

        {/* Filtres ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-4">
          
          {/* Période / Date */}
          <div className="neu-card py-3 px-4 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2.5">Période</p>
            <div className="flex gap-2 flex-wrap items-center">
              {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${period === p ? 'neu-btn-primary' : 'neu-btn'}`}>
                  {p === 'daily' ? 'Journalier' : p === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}
                </button>
              ))}
              {period === 'daily' && (
                <div className="ml-2 relative">
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="neu-pressed bg-transparent px-3 py-1.5 rounded-xl text-sm font-medium text-foreground outline-none w-[140px]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Agent */}
          <div className="neu-card py-3 px-4 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2.5">Filtrer par agent</p>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="neu-pressed bg-transparent px-4 py-2 rounded-xl text-sm font-medium text-foreground outline-none w-full appearance-none"
            >
              <option value="all">Tous les agents</option>
              {agentStats.map(s => (
                <option key={s.agent.id} value={s.agent.id}>
                  {s.agent.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtre par statut */}
        <div className="neu-card py-3 px-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2.5">Filtrer par statut</p>
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={[
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  statusFilter === f.value ? 'neu-btn-primary' : 'neu-btn',
                  statusFilter !== f.value ? f.color : '',
                ].join(' ')}
              >
                {f.icon}{f.label}
                <span className={`neu-pressed text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${statusFilter === f.value ? 'bg-white/20 text-white' : 'text-muted-foreground'}`}>
                  {f.value === 'all'
                    ? agentFilteredRequests.length
                    : agentFilteredRequests.filter(r => r.status === f.value).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Cartes résumé */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Demandes', value: filteredRequests.length, color: 'text-primary' },
              { label: 'Acceptées', value: filteredRequests.filter(r => r.status === 'accepted').length, color: 'text-green-600' },
              { label: 'Rejetées', value: filteredRequests.filter(r => r.status === 'rejected').length, color: 'text-red-500' },
              { label: 'Inchangées', value: filteredRequests.filter(r => r.status === 'unchanged').length, color: 'text-gray-500' },
            ].map(s => (
              <div key={s.label} className="neu-card text-center">
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tableau de rapport */}
        <div className="neu-card">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            {period === 'daily' ? 'Rapport journalier' : period === 'weekly' ? 'Rapport hebdomadaire' : 'Rapport mensuel'}
            <span className="text-xs text-muted-foreground font-normal ml-2">
              ({filteredRequests.length} enregistrement{filteredRequests.length !== 1 ? 's' : ''}{statusFilter !== 'all' ? ` · ${STATUS_FILTERS.find(f => f.value === statusFilter)?.label}` : ''})
            </span>
          </h2>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="neu-pressed h-10 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    {['Agent', 'Numéro certifié', 'Date de création', 'Coach mobile', 'Statut'].map(h => (
                      <th key={h} className="pb-3 pr-6 whitespace-nowrap font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                      Aucune donnée pour cette période{statusFilter !== 'all' ? ` avec le filtre "${STATUS_FILTERS.find(f => f.value === statusFilter)?.label}"` : ''}.
                    </td></tr>
                  ) : filteredRequests.map(r => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="py-2.5 pr-6 text-sm whitespace-nowrap">{r.agent?.username ?? '—'}</td>
                      <td className="py-2.5 pr-6 text-sm font-medium whitespace-nowrap">+{r.phone_to_certify}</td>
                      <td className="py-2.5 pr-6 text-sm text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}</td>
                      <td className="py-2.5 pr-6 text-sm text-muted-foreground whitespace-nowrap">{r.applicant?.username ?? '—'}</td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${
                          r.status === 'accepted'   ? 'text-green-600' :
                          r.status === 'rejected'   ? 'text-red-500'   :
                          r.status === 'pending'    ? 'text-orange-500':
                          r.status === 'processing' ? 'text-blue-500'  :
                          'text-gray-500'}`}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
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
