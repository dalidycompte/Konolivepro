import React, { useEffect, useState, useCallback, useRef } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { supabase } from '@/lib/supabase';
import { getAgentStats } from '@/lib/api';
import type { AgentStats } from '@/types/types';
import {
  Wifi, WifiOff, PauseCircle, RefreshCw, Users, Activity,
  Search, Clock, CheckCircle2, XCircle, Timer,
  ChevronUp, ChevronDown, Medal, Zap, BarChart3, Radio,
} from 'lucide-react';

interface AgentRow {
  id: string;
  username: string;
  email: string;
  is_online: boolean;
  is_paused: boolean;
  locality?: string;
}

type AgentStatus  = 'online' | 'paused' | 'offline';
type StatusFilter = 'all' | AgentStatus;
type SortKey = 'rank' | 'username' | 'status' | 'total_processed' | 'today_processed' | 'accepted' | 'rejected' | 'taux' | 'avg_sec';
type SortDir = 'asc' | 'desc';

function statusOf(a: AgentRow): AgentStatus {
  if (!a.is_online) return 'offline';
  if (a.is_paused)  return 'paused';
  return 'online';
}

function fmtDuration(sec: number | null): string {
  if (sec === null || sec === 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const STATUS_META: Record<AgentStatus, {
  label: string; dotClass: string;
  badgeBg: string; badgeText: string; barColor: string; icon: React.ReactNode;
  rowBg: string;
}> = {
  online:  {
    label: 'En ligne',   dotClass: 'bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.5)]',
    badgeBg: 'rgba(74,222,128,0.15)',  badgeText: '#16a34a', barColor: '#22c55e',
    icon: <Wifi size={12} />, rowBg: 'rgba(74,222,128,0.03)',
  },
  paused:  {
    label: 'En pause',   dotClass: 'bg-orange-400 shadow-[0_0_6px_2px_rgba(251,146,60,0.5)]',
    badgeBg: 'rgba(251,146,60,0.15)',  badgeText: '#c2410c', barColor: '#f97316',
    icon: <PauseCircle size={12} />, rowBg: 'rgba(251,146,60,0.03)',
  },
  offline: {
    label: 'Hors ligne', dotClass: 'bg-slate-400/50',
    badgeBg: 'rgba(148,163,184,0.12)', badgeText: '#64748b', barColor: '#94a3b8',
    icon: <WifiOff size={12} />, rowBg: 'transparent',
  },
};

/* ── Médaille de rang ── */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black" style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#fff', boxShadow: '0 2px 8px rgba(251,191,36,0.5)' }}>🥇</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black" style={{ background: 'linear-gradient(135deg,#d1d5db,#9ca3af)', color: '#fff', boxShadow: '0 2px 8px rgba(156,163,175,0.5)' }}>🥈</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black" style={{ background: 'linear-gradient(135deg,#d97706,#b45309)', color: '#fff', boxShadow: '0 2px 8px rgba(217,119,6,0.4)' }}>🥉</span>;
  return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold tabular-nums" style={{ background: 'hsl(var(--border)/0.4)', color: 'var(--neu-muted)' }}>{rank}</span>;
}

/* ── Jauge de taux d'acceptation ── */
function AcceptanceGauge({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : pct > 0 ? '#ef4444' : '#94a3b8';
  return (
    <div className="flex flex-col gap-1 min-w-[72px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct > 0 ? `${pct}%` : '—'}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden w-full" style={{ background: 'hsl(var(--border)/0.4)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
      </div>
    </div>
  );
}

/* ── Barre de volume traitement ── */
function VolumeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums font-bold text-sm min-w-[20px] text-right" style={{ color }}>{value}</span>
      <div className="h-2 w-16 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border)/0.4)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Bouton tri colonne ── */
function SortBtn({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 group select-none whitespace-nowrap hover:opacity-100 transition-opacity"
      style={{ color: active ? 'hsl(var(--primary))' : 'var(--neu-muted)' }}>
      {label}
      <span className={active ? 'opacity-100' : 'opacity-30 group-hover:opacity-70'}>
        {active
          ? (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronDown size={11} />}
      </span>
    </button>
  );
}

export default function AgentStatusPage() {
  const [agents,     setAgents]     = useState<AgentRow[]>([]);
  const [stats,      setStats]      = useState<AgentStats[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<StatusFilter>('all');
  const [search,     setSearch]     = useState('');
  const [sortKey,    setSortKey]    = useState<SortKey>('rank');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [pulse,      setPulse]      = useState(false);
  const pulseTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashPulse = useCallback(() => {
    setLastUpdate(new Date());
    setPulse(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(false), 1200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profileData }, statsData] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, email, is_online, is_paused, locality')
        .eq('role', 'agent')
        .order('username', { ascending: true }),
      getAgentStats(),
    ]);
    setAgents(Array.isArray(profileData) ? (profileData as AgentRow[]) : []);
    setStats(statsData);
    setLoading(false);
    flashPulse();
  }, [flashPulse]);

  useEffect(() => {
    load();
    return () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); };
  }, [load]);

  /* ── Realtime ── */
  useEffect(() => {
    const chProfiles = supabase.channel('agent-status-rt-v4')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, payload => {
        const u = payload.new as AgentRow;
        if (!u?.id) return;
        setAgents(prev => prev.map(a => a.id === u.id ? { ...a, ...u } : a));
        flashPulse();
      })
      .subscribe();
    const chReqs = supabase.channel('agent-status-reqs-rt-v4')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'verification_requests' }, () => {
        getAgentStats().then(s => { setStats(s); flashPulse(); });
      })
      .subscribe();
    return () => { supabase.removeChannel(chProfiles); supabase.removeChannel(chReqs); };
  }, [flashPulse]);

  /* ── Compteurs ── */
  const counts = {
    online:  agents.filter(a => statusOf(a) === 'online').length,
    paused:  agents.filter(a => statusOf(a) === 'paused').length,
    offline: agents.filter(a => statusOf(a) === 'offline').length,
    total:   agents.length,
  };

  /* ── Tri ── */
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'rank' ? 'asc' : 'desc'); }
  };

  /* ── Fusion agents + stats ── */
  const statsMap = Object.fromEntries(stats.map(s => [s.agent.id, s]));

  /* Score de performance : pondération total_processed 40% + taux acceptation 40% + rapidité 20% */
  const maxProcessed = Math.max(...agents.map(a => statsMap[a.id]?.total_processed ?? 0), 1);
  const maxToday     = Math.max(...agents.map(a => statsMap[a.id]?.today_processed ?? 0), 1);

  const enriched = agents.map(a => {
    const s              = statsMap[a.id] ?? null;
    const total          = s?.total_processed ?? 0;
    const accepted       = s?.accepted ?? 0;
    const rejected       = s?.rejected ?? 0;
    const today          = s?.today_processed ?? 0;
    const avg_sec        = s?.avg_processing_seconds ?? null;
    const taux           = total > 0 ? Math.round((accepted / total) * 100) : 0;
    // Score composite (0-100)
    const scoreProd  = Math.round((total / maxProcessed) * 40);
    const scoreTaux  = Math.round((taux / 100) * 40);
    // Rapidité : inverser (plus rapide = meilleur). Cap à 10min = 600s
    const avgCapped  = avg_sec ? Math.min(avg_sec, 600) : 600;
    const scoreSpeed = Math.round(((600 - avgCapped) / 600) * 20);
    const score      = total > 0 ? scoreProd + scoreTaux + scoreSpeed : 0;
    return { ...a, st: statusOf(a), s, total, accepted, rejected, today, avg_sec, taux, score };
  });

  /* Rang calculé sur tous les agents (pas seulement filtrés) */
  const rankedAll = [...enriched].sort((a, b) => b.score - a.score);
  const rankMap   = Object.fromEntries(rankedAll.map((a, i) => [a.id, i + 1]));

  const rows = enriched
    .filter(a =>
      (filter === 'all' || a.st === filter) &&
      (search === '' ||
        a.username.toLowerCase().includes(search.toLowerCase()) ||
        (a.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (a.locality ?? '').toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const ORDER: Record<AgentStatus, number> = { online: 0, paused: 1, offline: 2 };
      switch (sortKey) {
        case 'rank':            return (rankMap[a.id] - rankMap[b.id]) * dir;
        case 'status':          return (ORDER[a.st] - ORDER[b.st]) * dir;
        case 'username':        return a.username.localeCompare(b.username) * dir;
        case 'total_processed': return (a.total - b.total) * dir;
        case 'today_processed': return (a.today - b.today) * dir;
        case 'accepted':        return (a.accepted - b.accepted) * dir;
        case 'rejected':        return (a.rejected - b.rejected) * dir;
        case 'taux':            return (a.taux - b.taux) * dir;
        case 'avg_sec':         return ((a.avg_sec ?? 9999) - (b.avg_sec ?? 9999)) * dir;
        default: return 0;
      }
    });

  /* Totaux ligne de pied */
  const totals = {
    today:    rows.reduce((acc, r) => acc + r.today, 0),
    accepted: rows.reduce((acc, r) => acc + r.accepted, 0),
    rejected: rows.reduce((acc, r) => acc + r.rejected, 0),
    total:    rows.reduce((acc, r) => acc + r.total, 0),
  };
  const totalTaux = totals.total > 0 ? Math.round((totals.accepted / totals.total) * 100) : 0;

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* ── En-tête ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Activity size={22} className="text-primary" />
              Supervision des agents
            </h1>
            <p className="page-subtitle mt-1 flex items-center gap-1.5 flex-wrap">
              {/* Indicateur LIVE */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-widest"
                style={{ background: 'rgba(74,222,128,0.15)', color: '#16a34a' }}>
                <span className={`w-1.5 h-1.5 rounded-full bg-green-400 ${pulse ? 'animate-ping' : ''}`} />
                LIVE
              </span>
              <span style={{ color: 'var(--neu-muted)' }}>{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
              <span className="text-xs opacity-50 flex items-center gap-1">
                <Clock size={11} />
                {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </p>
          </div>
          <button onClick={load}
            className="neu-btn-secondary flex items-center gap-2 px-4 py-2.5 text-sm shrink-0 rounded-xl">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>

        {/* ── Cartes KPI ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            { key: 'online'  as const, icon: <Wifi size={18} />,        count: counts.online,  sub: 'actifs maintenant' },
            { key: 'paused'  as const, icon: <PauseCircle size={18} />, count: counts.paused,  sub: 'en pause' },
            { key: 'offline' as const, icon: <WifiOff size={18} />,     count: counts.offline, sub: 'déconnectés' },
            { key: null,               icon: <Users size={18} />,        count: counts.total,   sub: 'total agents', color: 'hsl(var(--primary))', label: 'Total' },
          ]).map((item, i) => {
            const meta    = item.key ? STATUS_META[item.key] : null;
            const color   = meta?.barColor ?? (item as any).color ?? 'hsl(var(--primary))';
            const label   = meta?.label   ?? (item as any).label ?? '';
            const isActive = item.key && filter === item.key;
            return (
              <button key={i}
                onClick={() => item.key && setFilter(isActive ? 'all' : item.key)}
                className={`neu-card text-left transition-all duration-150 ${item.key ? 'hover:scale-[1.02] active:scale-[0.98] cursor-pointer' : 'cursor-default'}`}
                style={isActive ? { outline: `2px solid ${color}`, outlineOffset: '2px' } : {}}>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl neu-flat flex items-center justify-center" style={{ color }}>
                    {item.icon}
                  </div>
                  <span className="text-3xl font-black tabular-nums" style={{ color }}>
                    {loading ? '–' : item.count}
                  </span>
                </div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--neu-muted)' }}>{item.sub}</p>
                {/* Barre de proportion */}
                <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border)/0.3)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: counts.total > 0 && item.count !== undefined ? `${Math.round((item.count / counts.total) * 100)}%` : '100%', background: color }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Tableau principal ── */}
        <div className="neu-card overflow-hidden">

          {/* En-tête tableau */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))' }}>
                <BarChart3 size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base leading-tight" style={{ color: 'var(--neu-text)' }}>
                  Tableau de performance des agents
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--neu-muted)' }}>
                  Classement par score composite · trié, filtrable, temps réel
                </p>
              </div>
            </div>

            {/* Contrôles */}
            <div className="flex flex-col md:flex-row gap-2 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--neu-muted)' }} />
                <input
                  className="neu-input pl-8 text-sm w-full md:w-48"
                  placeholder="Rechercher..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all', 'online', 'paused', 'offline'] as const).map(f => {
                  const meta  = f !== 'all' ? STATUS_META[f] : null;
                  const c     = meta?.barColor ?? 'hsl(var(--primary))';
                  const label = f === 'all' ? `Tous (${counts.total})` : f === 'online' ? `En ligne (${counts.online})` : f === 'paused' ? `En pause (${counts.paused})` : `Hors ligne (${counts.offline})`;
                  return (
                    <button key={f} onClick={() => setFilter(f)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                      style={filter === f
                        ? { background: c, color: '#fff', boxShadow: `0 2px 8px ${c}55` }
                        : { background: 'hsl(var(--border)/0.3)', color: 'var(--neu-muted)' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tableau */}
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <div key={i} className="neu-flat h-16 rounded-xl animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20">
              <Users size={44} className="mx-auto mb-3 opacity-15" style={{ color: 'var(--neu-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--neu-muted)' }}>Aucun agent trouvé.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-xl neu-pressed">
              <table className="w-full text-sm min-w-[920px]">

                {/* Entête colonnes */}
                <thead>
                  <tr style={{ borderBottom: '2px solid hsl(var(--border))' }}>
                    {[
                      { k: 'rank' as SortKey,            label: 'Rang' },
                      { k: 'username' as SortKey,         label: 'Agent' },
                      { k: 'status' as SortKey,           label: 'Statut' },
                      { k: null,                           label: 'Localité' },
                      { k: 'today_processed' as SortKey,  label: "Aujourd'hui" },
                      { k: 'accepted' as SortKey,         label: 'Acceptés' },
                      { k: 'rejected' as SortKey,         label: 'Rejetés' },
                      { k: 'taux' as SortKey,             label: 'Taux accept.' },
                      { k: 'total_processed' as SortKey,  label: 'Total traités' },
                      { k: 'avg_sec' as SortKey,          label: 'Durée moy.' },
                    ].map(({ k, label }) => (
                      <th key={label}
                        className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                        style={{ color: 'var(--neu-muted)' }}>
                        {k
                          ? <SortBtn label={label} sortKey={k} current={sortKey} dir={sortDir} onSort={handleSort} />
                          : <span className="whitespace-nowrap">{label}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Corps */}
                <tbody>
                  {rows.map((agent) => {
                    const meta  = STATUS_META[agent.st];
                    const rank  = rankMap[agent.id];
                    const isTop = rank <= 3 && agent.total > 0;
                    return (
                      <tr key={agent.id}
                        className="transition-colors group"
                        style={{
                          borderBottom: '1px solid hsl(var(--border)/0.35)',
                          background: isTop
                            ? rank === 1 ? 'rgba(251,191,36,0.04)' : rank === 2 ? 'rgba(209,213,219,0.04)' : 'rgba(217,119,6,0.04)'
                            : agent.st === 'online' ? meta.rowBg : 'transparent',
                        }}>

                        {/* Rang */}
                        <td className="px-4 py-3.5">
                          <RankBadge rank={rank} />
                        </td>

                        {/* Agent */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white"
                                style={{
                                  background: `linear-gradient(135deg, ${meta.barColor}88, ${meta.barColor})`,
                                  boxShadow: `2px 2px 6px var(--neu-dark), -1px -1px 4px var(--neu-light)`,
                                }}>
                                {(agent.username ?? 'A')[0].toUpperCase()}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${meta.dotClass}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold whitespace-nowrap text-sm" style={{ color: 'var(--neu-text)' }}>
                                {agent.username}
                                {isTop && <Medal size={12} className="inline ml-1.5 opacity-60" style={{ color: rank === 1 ? '#f59e0b' : rank === 2 ? '#9ca3af' : '#b45309' }} />}
                              </p>
                              <p className="text-[11px] truncate max-w-[120px] mt-0.5" style={{ color: 'var(--neu-muted)' }}>
                                {agent.email || '—'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Statut */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                            style={{ background: meta.badgeBg, color: meta.badgeText }}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} />
                            {meta.icon}
                            {meta.label}
                          </span>
                        </td>

                        {/* Localité */}
                        <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: 'var(--neu-muted)' }}>
                          {agent.locality || '—'}
                        </td>

                        {/* Aujourd'hui */}
                        <td className="px-4 py-3.5">
                          <VolumeBar value={agent.today} max={maxToday} color="hsl(var(--primary))" />
                        </td>

                        {/* Acceptés */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1.5 tabular-nums font-semibold text-sm"
                            style={{ color: '#16a34a' }}>
                            <CheckCircle2 size={14} />
                            {agent.accepted}
                          </span>
                        </td>

                        {/* Rejetés */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1.5 tabular-nums font-semibold text-sm"
                            style={{ color: '#dc2626' }}>
                            <XCircle size={14} />
                            {agent.rejected}
                          </span>
                        </td>

                        {/* Taux d'acceptation */}
                        <td className="px-4 py-3.5 min-w-[100px]">
                          <AcceptanceGauge pct={agent.taux} />
                        </td>

                        {/* Total traités */}
                        <td className="px-4 py-3.5">
                          <VolumeBar value={agent.total} max={maxProcessed} color={meta.barColor} />
                        </td>

                        {/* Durée moyenne */}
                        <td className="px-4 py-3.5">
                          {agent.avg_sec !== null && agent.total > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap px-2 py-1 rounded-lg"
                              style={{
                                background: agent.avg_sec > 300 ? 'rgba(249,115,22,0.12)' : 'rgba(34,197,94,0.12)',
                                color: agent.avg_sec > 300 ? '#ea580c' : '#16a34a',
                              }}>
                              <Timer size={12} />
                              {fmtDuration(agent.avg_sec)}
                              {agent.avg_sec <= 120 && <Zap size={11} style={{ color: '#f59e0b' }} />}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--neu-muted)', fontSize: '12px' }}>—</span>
                          )}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>

                {/* Ligne totaux */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid hsl(var(--border))' }}>
                    <td className="px-4 py-3.5" />
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--neu-muted)' }}>
                        Totaux · {rows.length} agent{rows.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3.5" />
                    <td className="px-4 py-3.5" />
                    {/* Aujourd'hui */}
                    <td className="px-4 py-3.5">
                      <span className="tabular-nums font-black text-base text-primary">{totals.today}</span>
                    </td>
                    {/* Acceptés */}
                    <td className="px-4 py-3.5">
                      <span className="tabular-nums font-bold text-sm" style={{ color: '#16a34a' }}>{totals.accepted}</span>
                    </td>
                    {/* Rejetés */}
                    <td className="px-4 py-3.5">
                      <span className="tabular-nums font-bold text-sm" style={{ color: '#dc2626' }}>{totals.rejected}</span>
                    </td>
                    {/* Taux global */}
                    <td className="px-4 py-3.5 min-w-[100px]">
                      <AcceptanceGauge pct={totalTaux} />
                    </td>
                    {/* Total */}
                    <td className="px-4 py-3.5">
                      <span className="tabular-nums font-black text-base" style={{ color: 'var(--neu-text)' }}>{totals.total}</span>
                    </td>
                    <td className="px-4 py-3.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Pied de carte */}
          {rows.length > 0 && (
            <div className="mt-4 pt-3 flex items-center justify-between text-xs flex-wrap gap-2"
              style={{ borderTop: '1px solid hsl(var(--border))', color: 'var(--neu-muted)' }}>
              <span className="flex items-center gap-1.5">
                <Radio size={11} />
                {rows.length} agent{rows.length !== 1 ? 's' : ''} affichés
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full bg-green-400 ${pulse ? 'animate-ping' : ''}`} />
                Dernière mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}
              </span>
            </div>
          )}
        </div>

      </div>
    </MainLayout>
  );
}


