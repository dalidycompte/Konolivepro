// Force HMR reload v2
import React, { useEffect, useState, useCallback, useRef } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import {
  getDashboardKpi, getProcessingRequests, getPendingRequests,
  getOnlineAgentProfiles, getPausedAgentProfiles,
  getAgentPresence, getOvertimeRequests, transferRequest, getTodayOtherRequests,
  getDailyPerformances,
} from '@/lib/api';
import type { AgentPresence, AgentPresenceStatus, DashboardKpi, HourlyVolumeRow, ProcessingRequest, PendingRequest, OvertimeRequest, DailyPerformance } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  Users, TrendingUp, Timer, Zap, ChevronDown, ChevronUp,
  Clock, AlertCircle, Loader2, X, Activity,
  AlertTriangle, ArrowRightLeft, Check, MoreHorizontal,
  MapPin, UserCircle, BarChart2, CalendarDays } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { format, formatDistanceStrict } from 'date-fns';
import { fr } from 'date-fns/locale';



export interface LocalityStat {
  locality: string;
  received: number;
  accepted: number;
  rejected: number;
  unchanged: number;
  autres: number;
}

export interface CoachStat {
  total: number;
  online: number;
  offline: number;
}

// ── Colour palette ────────────────────────────────────────
const C = {
  received:  '#F59E0B',
  accepted:  '#22C55E',
  rejected:  '#EF4444',
  pending:   '#F97316',
  unchanged: '#8B5CF6',
  processing:'#3B82F6',
  other:     '#F59E0B',
};

// ── Donut helper (pure CSS) ───────────────────────────────
function buildConicGradient(slices: { color: string; value: number }[]): string {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return `conic-gradient(#e5e7eb 0deg 360deg)`;
  let cursor = 0;
  return `conic-gradient(${slices.map(d => {
    const start = (cursor / total) * 360;
    cursor += d.value;
    const end = (cursor / total) * 360;
    return `${d.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  }).join(', ')})`;
}

type OnlineAgent = { id: string; username: string };
type Panel       = 'processing' | 'online' | 'paused' | 'pending' | null;

const AGENT_STATUS_ORDER: AgentPresenceStatus[] = ['available', 'processing', 'paused', 'disconnected', 'offline'];
const AGENT_STATUS_META: Record<AgentPresenceStatus, { label: string; dot: string; text: string; bg: string }> = {
  available:    { label: 'En ligne et disponible', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-500/10' },
  processing:   { label: 'En cours de traitement',  dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-500/10' },
  paused:       { label: 'En pause',                dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-500/10' },
  disconnected: { label: 'Déconnecté',              dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-500/10' },
  offline:      { label: 'Hors ligne',              dot: 'bg-slate-400',   text: 'text-slate-600',   bg: 'bg-slate-500/10' },
};

function getAgentPresenceStatus(agent: AgentPresence): AgentPresenceStatus {
  if (!agent.is_active) return 'offline';
  if (!agent.is_logged_in) return 'disconnected';
  if (!agent.is_online) return 'offline';
  if (agent.is_paused) return 'paused';
  if (agent.active_requests > 0) return 'processing';
  return 'available';
}

interface TransferTarget { requestId: string; applicantLabel: string; agentLabel: string }

// ── Duration helper ───────────────────────────────────────
function elapsed(startedAt: string | null): string {
  if (!startedAt) return '—';
  try {
    return formatDistanceStrict(new Date(startedAt), new Date(), { locale: fr });
  } catch {
    return '—';
  }
}

// ── Compte à rebours vers minuit ─────────────────────────
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getCongoDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatLocalityDateLabel(dateKey: string): string {
  if (dateKey === getCongoDateKey()) return "Aujourd'hui";
  try {
    return format(new Date(`${dateKey}T12:00:00`), 'dd/MM/yyyy', { locale: fr });
  } catch {
    return dateKey;
  }
}

function TimeElapsed({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startTime).getTime();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const isOvertime = elapsed > 300; // > 5 minutes
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${isOvertime ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
      <Clock size={12} className={isOvertime ? 'animate-pulse' : ''} />
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </div>
  );
}

export default function SupervisorDashboard() {
  const [kpi, setKpi]                     = useState<DashboardKpi | null>(null);
  const [hourly, setHourly]               = useState<HourlyVolumeRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [extraStats, setExtraStats]       = useState<{ coach: CoachStat, locality: LocalityStat[] } | null>(null);
  const [localityDate, setLocalityDate]   = useState(() => getCongoDateKey());
  const [localityStats, setLocalityStats] = useState<LocalityStat[]>([]);
  const [localityLoading, setLocalityLoading] = useState(false);
  const [now, setNow]                     = useState(new Date());
  const [countdown, setCountdown]         = useState(msUntilMidnight());
  const countdownRef                      = useRef<ReturnType<typeof setInterval> | null>(null);
  const [liveChartData, setLiveChartData] = useState<any[]>([]);

  // Expandable panels
  const [openPanel, setOpenPanel]         = useState<Panel>(null);
  const [processingReqs, setProcessingReqs] = useState<ProcessingRequest[]>([]);
  const [pendingReqs, setPendingReqs]       = useState<PendingRequest[]>([]);
  const [onlineAgents, setOnlineAgents]   = useState<OnlineAgent[]>([]);
  const [pausedAgents, setPausedAgents]   = useState<OnlineAgent[]>([]);
  const [panelLoading, setPanelLoading]   = useState(false);

  // Présence détaillée : mise à jour silencieuse, sans skeleton ni remontée de page.
  const [agentPresence, setAgentPresence] = useState<AgentPresence[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [presenceUpdatedAt, setPresenceUpdatedAt] = useState<Date | null>(null);
  const [showAgentPresence, setShowAgentPresence] = useState(false);
  const presenceRequestRef = useRef(false);

  // Alertes dépassement 7 min
  const [overtimeReqs, setOvertimeReqs]   = useState<OvertimeRequest[]>([]);

  // Performances journalières
  const [dailyPerf, setDailyPerf]         = useState<DailyPerformance[]>([]);

  // Modal "Autre" du jour
  const [showOtherModal, setShowOtherModal]   = useState(false);
  const showOtherModalRef                     = useRef(showOtherModal);
  const [otherRequests, setOtherRequests]     = useState<{ id: string; phone_to_certify: string; notes: string | null; processed_at: string | null }[]>([]);
  const [otherLoading, setOtherLoading]       = useState(false);

  useEffect(() => { showOtherModalRef.current = showOtherModal; }, [showOtherModal]);

  async function openOtherModal() {
    setShowOtherModal(true);
    setOtherLoading(true);
    const data = await getTodayOtherRequests();
    setOtherRequests(data);
    setOtherLoading(false);
  }

  // Modal de transfert
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);
  const [transferAgents, setTransferAgents] = useState<OnlineAgent[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferring, setTransferring]   = useState(false);

  const load = useCallback(async () => {
    const [{ kpi: k, hourlyVolume }, { data: chartData }, { data: extra }, dp] = await Promise.all([
      getDashboardKpi(),
      supabase.rpc('get_internal_cumulative_chart'), supabase.rpc('get_internal_extra_stats'),
      getDailyPerformances()
    ]);
    setKpi(k);
    setHourly(hourlyVolume);
    setLoading(false);
    
    setLiveChartData(chartData || []);
    if (extra) setExtraStats(extra as any);
    setDailyPerf(dp);
  }, []);

  // Charge les alertes dépassement + actualisation toutes les 1s
  const loadOvertime = useCallback(async () => {
    const data = await getOvertimeRequests();
    setOvertimeReqs(data);
  }, []);

  const loadLocalityStats = useCallback(async () => {
    setLocalityLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_internal_locality_daily_stats', {
        p_date: localityDate,
      });
      if (error) throw error;
      setLocalityStats(Array.isArray(data) ? data as LocalityStat[] : []);
    } catch (error) {
      console.error('Erreur statistiques quotidiennes par localité:', error);
      setLocalityStats([]);
    } finally {
      setLocalityLoading(false);
    }
  }, [localityDate]);

  const loadPresence = useCallback(async () => {
    if (presenceRequestRef.current) return;
    presenceRequestRef.current = true;
    try {
      const data = await getAgentPresence();
      setAgentPresence(data);
      setPresenceUpdatedAt(new Date());
    } catch (error) {
      console.error('Erreur de présence agents:', error);
    } finally {
      presenceRequestRef.current = false;
      setPresenceLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadOvertime(); loadPresence(); }, [load, loadOvertime, loadPresence]);
  useEffect(() => { loadLocalityStats(); }, [loadLocalityStats]);

  // Filet de sécurité à 1 seconde : le temps réel reste instantané, le polling
  // garantit la convergence même si un événement WebSocket est manqué.
  useEffect(() => {
    const timer = window.setInterval(loadPresence, 1000);
    return () => window.clearInterval(timer);
  }, [loadPresence]);

  // Ref pour éviter les dépendances instables dans le useEffect realtime
  const openPanelRef = useRef<Panel>(null);
  useEffect(() => { openPanelRef.current = openPanel; }, [openPanel]);

  // Temps réel Supabase — canaux stables, jamais re-souscrits
  useEffect(() => {
    // Canal 1 : verification_requests → recharge les KPI et la présence.
    const chReq = supabase.channel('supervisor-kpi-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => {
        load();
        loadOvertime();
        loadPresence();
        loadLocalityStats();
        if (openPanelRef.current === 'processing') loadProcessing();
        if (openPanelRef.current === 'online')     loadOnline();
        if (showOtherModalRef.current) openOtherModal();
      })
      .subscribe();

    // Canal 2 : profiles → patch DIRECT des listes en mémoire + KPI instantané
    const chProfiles = supabase.channel('supervisor-profiles-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' },
        payload => {
           const inserted = payload.new as any;
           if (inserted?.role === 'applicant') {
              supabase.rpc('get_internal_extra_stats').then(({ data }) => {
                 if (data) setExtraStats(data as any);
              });
           }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },
        payload => {
          loadPresence();
          if (payload.eventType !== 'UPDATE') return;
          const updated = payload.new as {
            id: string; username: string; is_online: boolean; is_paused: boolean; role: string;
          };
          if (!updated?.id) return;

          if (updated.role === 'applicant') {
            supabase.rpc('get_internal_extra_stats').then(({ data }) => {
               if (data) setExtraStats(data as any);
            });
            return;
          }

          if (updated.role !== 'agent') return;

          // Mise à jour instantanée des KPI sans attendre un re-fetch
          setKpi(prev => {
            if (!prev) return prev;
            // Recalcul delta par rapport à l'ancien snapshot si dispo
            const old = payload.old as { is_online?: boolean; is_paused?: boolean } | null;
            const wasOnline  = old?.is_online  ?? false;
            const wasPaused  = old?.is_paused  ?? false;
            const nowOnline  = updated.is_online;
            const nowPaused  = updated.is_paused;
            const deltaOnline = (nowOnline && !nowPaused ? 1 : 0) - (wasOnline && !wasPaused ? 1 : 0);
            const deltaPaused = (nowOnline && nowPaused  ? 1 : 0) - (wasOnline && wasPaused  ? 1 : 0);
            return {
              ...prev,
              agents_online: Math.max(0, prev.agents_online + deltaOnline),
              agents_paused: Math.max(0, prev.agents_paused + deltaPaused),
            };
          });

          // Mise à jour instantanée des panneaux ouverts
          const panel = openPanelRef.current;
          if (panel === 'online') loadOnline();
          if (panel === 'paused') loadPaused();

          // Re-fetch complet en arrière-plan pour rester cohérent
          load();
        })
      .subscribe();

    return () => {
      supabase.removeChannel(chReq);
      supabase.removeChannel(chProfiles);
    };
  }, [load, loadPresence, loadLocalityStats]); // openPanel retiré des deps → canal stable

  // ── Compte à rebours + réinitialisation à minuit ─────
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setNow(new Date());
      const remaining = msUntilMidnight();
      setCountdown(remaining);
      if (remaining < 1000) {
        // Minuit atteint : recharger les stats
        setTimeout(() => load(), 1500);
      }
    }, 1000);
    
    // Refresh des overtime pour attraper les dépassements (pas de trigger DB)
    const overtimeInterval = setInterval(() => {
      loadOvertime();
    }, 30000);

    return () => { 
      if (countdownRef.current) clearInterval(countdownRef.current); 
      clearInterval(overtimeInterval);
    };
  }, [load, loadOvertime]);

  // ── Panel loaders ─────────────────────────────────────
  async function loadProcessing() {
    setPanelLoading(true);
    const data = await getProcessingRequests();
    setProcessingReqs(data);
    setPanelLoading(false);
  }

  async function loadPending() {
    setPanelLoading(true);
    const data = await getPendingRequests();
    setPendingReqs(data);
    setPanelLoading(false);
  }

  async function loadOnline() {
    setPanelLoading(true);
    const data = await getOnlineAgentProfiles();
    setOnlineAgents(data);
    setPanelLoading(false);
  }

  async function loadPaused() {
    setPanelLoading(true);
    const data = await getPausedAgentProfiles();
    setPausedAgents(data);
    setPanelLoading(false);
  }

  function togglePanel(panel: Panel) {
    if (openPanel === panel) { setOpenPanel(null); return; }
    setOpenPanel(panel);
    if (panel === 'processing') loadProcessing();
    if (panel === 'pending')    loadPending();
    if (panel === 'online')     loadOnline();
    if (panel === 'paused')     loadPaused();
  }

  // ── Ouvrir le modal de transfert ──────────────────────
  async function openTransfer(req: { id: string; applicant_phone?: string | null; applicant_username?: string | null; applicant_id: string; agent_id?: string | null; agent_username?: string | null; }) {
    setTransferLoading(true);
    setTransferTarget({
      requestId:     req.id,
      applicantLabel: req.applicant_phone ?? req.applicant_username ?? req.applicant_id.slice(0, 8),
      agentLabel:    req.agent_username ?? '—',
    });
    const agents = await getOnlineAgentProfiles();
    // Exclure l'agent déjà assigné
    setTransferAgents(agents.filter(a => a.id !== req.agent_id));
    setTransferLoading(false);
  }

  async function confirmTransfer(newAgentId: string) {
    if (!transferTarget) return;
    setTransferring(true);
    const ok = await transferRequest(transferTarget.requestId, newAgentId);
    setTransferring(false);
    if (ok) {
      setTransferTarget(null);
      loadOvertime();
      load();
      if (openPanel === 'pending') loadPending();
      if (openPanel === 'processing') loadProcessing();
    }
  }

  // ── Donut data ────────────────────────────────────────
  const donutData = kpi ? [
    { name: 'Acceptés',   value: kpi.accepted,   color: C.accepted  },
    { name: 'Rejetés',    value: kpi.rejected,   color: C.rejected  },
    { name: 'Autre',      value: kpi.other,      color: C.other     },
    { name: 'En cours',   value: kpi.processing, color: C.processing },
    { name: 'En attente', value: kpi.pending,    color: C.pending   },
    { name: 'Inchangé',   value: kpi.unchanged,  color: C.unchanged  },
  ].filter(d => d.value > 0) : [];

  // ── KPI cards ─────────────────────────────────────────
  const kpiCards = kpi ? [
    { label: 'TOTAL\nDOSSIERS',               value: kpi.total,              color: 'text-yellow-500',  highlight: true },
    { label: 'ACCEPTÉS',                      value: kpi.accepted,           color: 'text-green-500'   },
    { label: 'REJETÉS',                       value: kpi.rejected,           color: 'text-red-500'     },
    { label: 'INCHANGÉ',                      value: kpi.unchanged,          color: 'text-purple-500'  },
    { label: 'AUTRE',                         value: kpi.other,              color: 'text-amber-500'   },
    { label: 'WAITING\nTIME (MIN)',           value: kpi.avg_waiting_min,    color: 'text-foreground'  },
    { label: 'PROCESSING\nTIME (MIN)',        value: kpi.avg_processing_min, color: 'text-foreground'  },
    { label: 'PERF.\nHORAIRE\n(DOSSIERS/H)', value: kpi.hourly_rate,        color: 'text-yellow-500',  highlight: true },
  ] : [];

  const processingCount = kpi?.processing ?? 0;
  const onlineCount     = kpi?.agents_online ?? 0;
  const pendingCount    = kpi?.pending ?? 0;
  const pendingAlert    = pendingCount > 10;

  const presenceRows = agentPresence.map(agent => ({
    ...agent,
    status: getAgentPresenceStatus(agent),
  }));
  const presenceCounts = AGENT_STATUS_ORDER.reduce<Record<AgentPresenceStatus, number>>((acc, status) => {
    acc[status] = presenceRows.filter(agent => agent.status === status).length;
    return acc;
  }, { available: 0, processing: 0, paused: 0, disconnected: 0, offline: 0 });

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* ── Titre + horloge + countdown ───────────────── */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Tableau de bord Superviseur</h1>
            <p className="text-muted-foreground text-sm mt-1">Vue d'ensemble en temps réel de toutes les opérations de vérification.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            {/* Horloge */}
            <div className="neu-card flex flex-col items-center justify-center px-6 py-3 min-w-[160px]">
              <div className="flex items-center gap-2 mb-0.5">
                <Clock size={15} className="text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Heure locale</span>
              </div>
              <p className="text-3xl font-bold tabular-nums text-foreground leading-none tracking-tight">
                {format(now, 'HH:mm:ss')}
              </p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">
                {format(now, 'EEEE dd MMM yyyy', { locale: fr })}
              </p>
            </div>
            {/* Compte à rebours 24h */}
            <div className="neu-card flex flex-col items-center justify-center px-5 py-3 min-w-[160px]">
              <div className="flex items-center gap-2 mb-0.5">
                <Timer size={15} className="text-orange-500" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Réinitialisation</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-orange-500 leading-none tracking-tight">
                {formatCountdown(countdown)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Remise à zéro à minuit</p>
            </div>
          </div>
        </div>

        {/* ── Alertes dépassement 7 min ─────────────────── */}
        {overtimeReqs.length > 0 && (
          <div className="space-y-3">
            {/* Bandeau d'en-tête */}
            <div className="flex items-center gap-2 px-1">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <h2 className="text-sm font-bold text-red-600 uppercase tracking-wide">
                Alertes — {overtimeReqs.length} demande{overtimeReqs.length > 1 ? 's' : ''} en cours depuis +7 min
              </h2>
            </div>

            {/* Une carte de notification par demande en dépassement */}
            {overtimeReqs.map(req => (
              <div key={req.id}
                className="relative overflow-hidden rounded-2xl border border-red-400/50 bg-card shadow-sm animate-in slide-in-from-top-2">
                {/* Barre gauche rouge */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />

                <div className="pl-5 pr-4 py-4 flex flex-wrap items-center gap-3">
                  {/* Icône alerte */}
                  <div className="neu-flat w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-red-500" />
                  </div>

                  {/* Infos demande */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {req.applicant_phone ?? req.applicant_username ?? req.applicant_id.slice(0, 8)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold shrink-0 animate-pulse">
                        ⏱ {req.elapsed_minutes} min
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Agent en cours :&nbsp;
                      <span className="font-semibold text-foreground">{req.agent_username ?? '—'}</span>
                    </p>
                  </div>

                  {/* Bouton Transférer — très visible */}
                  <button
                    onClick={() => openTransfer(req)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-md hover:opacity-90 active:scale-95 transition-all shrink-0">
                    <ArrowRightLeft size={14} />
                    Transférer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Bande statut agents ────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 neu-card py-3 px-5">

          {/* En ligne — cliquable */}
          <button onClick={() => togglePanel('online')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${openPanel === 'online' ? 'neu-pressed text-green-600' : 'hover:bg-muted/30 text-foreground'}`}>
            <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm font-semibold">{loading ? '—' : onlineCount} En ligne</span>
            {openPanel === 'online' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* En pause — cliquable */}
          <button onClick={() => togglePanel('paused')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${openPanel === 'paused' ? 'neu-pressed text-red-500' : 'hover:bg-muted/30 text-foreground'}`}>
            <span className="w-3 h-3 rounded-full bg-red-400 shrink-0" />
            <span className="text-sm font-semibold">{loading ? '—' : (kpi?.agents_paused ?? 0)} En pause</span>
            {openPanel === 'paused' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* En cours de traitement — cliquable */}
          <button onClick={() => togglePanel('processing')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${openPanel === 'processing' ? 'neu-pressed text-blue-500' : 'hover:bg-muted/30 text-foreground'}`}>
            <Activity size={14} className={openPanel === 'processing' ? 'text-blue-500' : 'text-muted-foreground'} />
            <span className="text-sm font-semibold">
              {loading ? '—' : processingCount} En cours de traitement
            </span>
            {openPanel === 'processing' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* Demandes en attente — clignote en rouge si >10, cliquable */}
          <button onClick={() => togglePanel('pending')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ml-0 md:ml-auto transition-all ${openPanel === 'pending' ? 'neu-pressed' : 'neu-pressed hover:bg-muted/30'} ${pendingAlert ? 'animate-pulse' : ''}`}>
            <AlertCircle size={15} className={pendingAlert ? 'text-red-500 shrink-0' : 'text-orange-500 shrink-0'} />
            <span className={`text-sm font-semibold ${pendingAlert ? 'text-red-600' : 'text-foreground'}`}>Demandes en attente :</span>
            {loading
              ? <span className="w-8 h-5 rounded bg-muted animate-pulse inline-block" />
              : <span className={`text-lg font-bold tabular-nums ${pendingAlert ? 'text-red-600' : (pendingCount > 0 ? 'text-orange-500' : 'text-muted-foreground')}`}>
                  {pendingCount}
                </span>}
            {openPanel === 'pending' ? <ChevronUp size={13} className="ml-1" /> : <ChevronDown size={13} className="ml-1" />}
          </button>

          <button
            type="button"
            onClick={() => setShowAgentPresence(value => !value)}
            aria-expanded={showAgentPresence}
            className={`flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-1.5 transition-colors ${showAgentPresence ? 'neu-pressed text-primary' : 'hover:bg-muted/40 text-muted-foreground'}`}
          >
            <Users size={13} className="text-primary" />
            {showAgentPresence ? 'Masquer la présence' : 'Afficher la présence des agents'}
            {showAgentPresence ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {showAgentPresence && (
        /* ── Présence détaillée des agents ─────────────── */
        <div className="neu-card overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-base text-foreground flex items-center gap-2">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                Présence des agents
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Synchronisation temps réel · vérification automatique chaque seconde
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {presenceUpdatedAt ? `Dernière mise à jour ${presenceUpdatedAt.toLocaleTimeString('fr-FR')}` : 'Connexion en cours…'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4" aria-label="Légende des statuts agents">
            {AGENT_STATUS_ORDER.map(status => {
              const meta = AGENT_STATUS_META[status];
              return (
                <span key={status} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
                  <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                  {meta.label}
                  <span className="tabular-nums opacity-75">{presenceCounts[status]}</span>
                </span>
              );
            })}
          </div>

          {presenceLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" aria-label="Chargement de la présence">
              {[1, 2, 3].map(i => <div key={i} className="h-[76px] rounded-xl bg-muted/40" />)}
            </div>
          ) : presenceRows.length === 0 ? (
            <div className="min-h-[76px] flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              Aucun agent enregistré.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {presenceRows.map(agent => {
                const meta = AGENT_STATUS_META[agent.status];
                return (
                  <div key={agent.id} className="min-h-[76px] rounded-xl border border-border/70 px-3 py-2.5 flex items-center gap-3 transition-colors duration-150" style={{ background: agent.status === 'offline' ? undefined : 'hsl(var(--muted)/0.16)' }}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.bg}`}>
                      <span className={`w-3 h-3 rounded-full ${meta.dot} ${agent.status === 'available' || agent.status === 'processing' ? 'shadow-[0_0_7px_2px_rgba(16,185,129,0.35)]' : ''}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{agent.username}</p>
                        <span className={`shrink-0 text-[10px] font-bold ${meta.text}`}>{meta.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {agent.locality ?? 'Localité non renseignée'}
                        {agent.active_requests > 0 && ` · ${agent.active_requests} demande${agent.active_requests > 1 ? 's' : ''} en cours`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* ── Panel : Demandes en attente ─────────── */}
        {openPanel === 'pending' && (
          <div className="neu-card space-y-3 animate-in slide-in-from-top-2 border border-orange-100/50">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <AlertCircle size={17} className="text-orange-500" />
                Demandes en attente
                {!panelLoading && (
                  <span className="text-xs font-normal text-muted-foreground">({pendingReqs.length})</span>
                )}
              </h2>
              <button onClick={() => setOpenPanel(null)} className="neu-flat w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
            </div>
            {panelLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <Loader2 size={16} className="animate-spin" /> Chargement…
              </div>
            ) : pendingReqs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">Aucune demande en attente.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pendingReqs.map(req => (
                  <div key={req.id} className="p-3 rounded-xl bg-orange-50/50 border border-orange-100 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                          <UserCircle size={16} className="text-orange-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
                            {req.applicant_phone ?? req.applicant_username ?? req.applicant_id.slice(0,8)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock size={10} /> En attente
                          </p>
                        </div>
                      </div>
                      <TimeElapsed startTime={req.created_at} />
                    </div>
                    <button
                      onClick={() => openTransfer(req)}
                      className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-white border border-gray-200 shadow-sm rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowRightLeft size={12} />
                      Transférer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Panel : En cours de traitement ─────────── */}
        {openPanel === 'processing' && (
          <div className="neu-card space-y-3 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Activity size={17} className="text-blue-500" />
                Demandes en cours de traitement
                {!panelLoading && (
                  <span className="text-xs font-normal text-muted-foreground">({processingReqs.length})</span>
                )}
              </h2>
              <button onClick={() => setOpenPanel(null)} className="neu-flat w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
            </div>
            {panelLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <Loader2 size={16} className="animate-spin" /> Chargement…
              </div>
            ) : processingReqs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">Aucune demande en cours de traitement.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                      {['N° Dossier', 'Coach mobile', 'Agent traitant', 'Début traitement', 'Durée en cours'].map(h => (
                        <th key={h} className="pb-3 pr-6 whitespace-nowrap font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {processingReqs.map(r => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 pr-6 font-mono text-xs text-muted-foreground whitespace-nowrap">{r.id.slice(0, 8).toUpperCase()}</td>
                        <td className="py-3 pr-6 text-sm font-semibold text-foreground whitespace-nowrap">
                          {r.applicant_phone ?? r.applicant_username ?? r.applicant_id.slice(0, 8)}
                        </td>
                        <td className="py-3 pr-6 whitespace-nowrap">
                          {r.agent_username
                            ? <span className="flex items-center gap-1.5 text-sm font-medium text-blue-600">
                                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                {r.agent_username}
                              </span>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 pr-6 text-xs text-muted-foreground whitespace-nowrap">
                          {r.processing_started_at
                            ? format(new Date(r.processing_started_at), 'HH:mm:ss', { locale: fr })
                            : '—'}
                        </td>
                        <td className="py-3 text-sm font-bold whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            r.processing_started_at && (Date.now() - new Date(r.processing_started_at).getTime()) > 600000
                              ? 'bg-red-100 text-red-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}>
                            {elapsed(r.processing_started_at)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Panel : En ligne ────────────────────────── */}
        {openPanel === 'online' && (
          <div className="neu-card space-y-3 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                Agents en ligne
                {!panelLoading && (
                  <span className="text-xs font-normal text-muted-foreground">({onlineAgents.length})</span>
                )}
              </h2>
              <button onClick={() => setOpenPanel(null)} className="neu-flat w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
            </div>
            {panelLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <Loader2 size={16} className="animate-spin" /> Chargement…
              </div>
            ) : onlineAgents.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">Aucun agent en ligne actuellement.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {onlineAgents.map(a => (
                  <div key={a.id} className="neu-flat flex items-center gap-2 px-4 py-2.5 rounded-xl">
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                    <span className="text-sm font-semibold text-foreground">{a.username}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Panel : En pause ────────────────────────── */}
        {openPanel === 'paused' && (
          <div className="neu-card space-y-3 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-400 shrink-0" />
                Agents en pause
                {!panelLoading && (
                  <span className="text-xs font-normal text-muted-foreground">({pausedAgents.length})</span>
                )}
              </h2>
              <button onClick={() => setOpenPanel(null)} className="neu-flat w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
            </div>
            {panelLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <Loader2 size={16} className="animate-spin" /> Chargement…
              </div>
            ) : pausedAgents.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">Aucun agent en pause actuellement.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {pausedAgents.map(a => (
                  <div key={a.id} className="neu-flat flex items-center gap-2 px-4 py-2.5 rounded-xl">
                    <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{a.username}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── KPI cards ─────────────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="neu-flat h-20 sm:h-24 rounded-xl animate-pulse" />)
            : kpiCards.map(c => (
              <div key={c.label} className={`neu-card flex flex-col items-center justify-center text-center py-2 px-1 sm:py-4 sm:px-2 ${c.highlight ? 'ring-1 ring-yellow-400/50' : ''}`}>
                <p className={`text-xl sm:text-2xl md:text-3xl font-bold leading-none ${c.color}`}>{c.value}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide mt-1 sm:mt-2 whitespace-pre-line leading-tight font-medium">{c.label}</p>
              </div>
            ))}
        </div>

        {/* ── Charts row ────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ══════════════════════════════════════════
              VOLUME PAR HEURE — Graphique professionnel
              ══════════════════════════════════════════ */}
          <div className="neu-card overflow-hidden md:col-span-2 lg:col-span-1">
            {/* En-tête */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-bold text-foreground flex items-center gap-2 text-base">
                  <BarChart2 size={18} className="text-primary" />
                  Volume par heure
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Activité journalière heure par heure</p>
              </div>
              {/* Mini-légende */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end">
                {[
                  { label: 'Reçus',      color: C.received  },
                  { label: 'Acceptés',   color: C.accepted  },
                  { label: 'Rejetés',    color: C.rejected  },
                  { label: 'Attente',    color: C.pending   },
                  { label: 'Autre',      color: C.unchanged },
                ].map(l => (
                  <span key={l.label} className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>

            {loading || hourly.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[340px] gap-2 text-muted-foreground">
                {loading
                  ? <Loader2 size={28} className="animate-spin text-primary" />
                  : <><BarChart2 size={32} className="opacity-25" /><p className="text-sm">Aucune donnée pour aujourd'hui.</p></>
                }
              </div>
            ) : (
              <>
                {/* KPI ligne rapide */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {(() => {
                    const totalRec  = hourly.reduce((s, r) => s + (r.received  ?? 0), 0);
                    const totalAcc  = hourly.reduce((s, r) => s + (r.accepted  ?? 0), 0);
                    const totalRej  = hourly.reduce((s, r) => s + (r.rejected  ?? 0), 0);
                    const peakHour  = hourly.reduce((best, r) => (r.received ?? 0) > (best.received ?? 0) ? r : best, hourly[0]);
                    return [
                      { label: 'Total reçus',    value: totalRec,          color: 'text-yellow-500' },
                      { label: 'Traités',         value: totalAcc + totalRej, color: 'text-green-500'  },
                      { label: `Pic — ${peakHour?.hour ?? '—'}`, value: peakHour?.received ?? 0, color: 'text-primary' },
                    ].map(s => (
                      <div key={s.label} className="neu-pressed rounded-xl px-3 py-2 text-center">
                        <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.label}</p>
                      </div>
                    ));
                  })()}
                </div>

                {/* Graphique */}
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
                      <defs>
                        {[
                          { id: 'gRec', color: C.received  },
                          { id: 'gAcc', color: C.accepted  },
                          { id: 'gRej', color: C.rejected  },
                          { id: 'gPen', color: C.pending   },
                          { id: 'gOth', color: C.unchanged },
                        ].map(g => (
                          <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={g.color} stopOpacity={1}   />
                            <stop offset="100%" stopColor={g.color} stopOpacity={0.55}/>
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis
                        dataKey="hour"
                        axisLine={false} tickLine={false}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 }}
                        dy={6}
                      />
                      <YAxis
                        axisLine={false} tickLine={false}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        width={26} allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}
                        labelStyle={{ fontWeight: 700, fontSize: 13, color: 'hsl(var(--foreground))', marginBottom: 6 }}
                        itemStyle={{ fontSize: 12, color: 'hsl(var(--foreground))', padding: '2px 0' }}
                        cursor={{ fill: 'hsl(var(--muted) / 0.4)', radius: 4 } as any}
                      />
                      <Bar dataKey="received"  name="Reçus"      fill={`url(#gRec)`} radius={[4,4,0,0]} maxBarSize={14} />
                      <Bar dataKey="accepted"  name="Acceptés"   fill={`url(#gAcc)`} radius={[4,4,0,0]} maxBarSize={14} />
                      <Bar dataKey="rejected"  name="Rejetés"    fill={`url(#gRej)`} radius={[4,4,0,0]} maxBarSize={14} />
                      <Bar dataKey="pending"   name="En attente" fill={`url(#gPen)`} radius={[4,4,0,0]} maxBarSize={14} />
                      <Bar dataKey="other"     name="Autre"      fill={`url(#gOth)`} radius={[4,4,0,0]} maxBarSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {/* ── Donut chart: résultats du jour (pure CSS) ── */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Timer size={17} className="text-primary" />
              Résultats du jour
            </h2>
            {loading || donutData.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-muted-foreground text-sm">{loading ? 'Chargement...' : "Aucune donnée aujourd'hui."}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-6">
                  {/* CSS conic-gradient donut */}
                  <div className="shrink-0 relative" style={{ width: 140, height: 140 }}>
                    <div className="w-full h-full rounded-full" style={{ background: buildConicGradient(donutData) }} />
                    {/* Hole */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full flex items-center justify-center" style={{ width: 76, height: 76, background: 'var(--neu-base)' }}>
                        <span className="text-2xl font-bold text-foreground">{kpi?.total ?? 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {donutData.map(d => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                        <span className="text-foreground truncate">{d.name}</span>
                        <span className="font-bold text-foreground ml-auto pl-2 shrink-0">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Total numéros traités (acceptés + rejetés) ── */}
                <div className="neu-pressed rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm shrink-0 bg-gradient-to-br from-green-500 to-red-500" />
                    <span className="text-sm font-semibold text-foreground">Total numéros traités</span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      (acceptés + rejetés)
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-primary tabular-nums shrink-0">
                    {(kpi?.accepted ?? 0) + (kpi?.rejected ?? 0)}
                  </span>
                </div>

                {/* ── Autre — cliquable pour voir les motifs ── */}
                {(kpi?.other ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={openOtherModal}
                    className="w-full neu-pressed rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-amber-400/50 transition-all group">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: C.other }} />
                      <span className="text-sm font-semibold text-foreground">Autre</span>
                      <span className="text-[10px] text-muted-foreground font-medium">voir les motifs →</span>
                    </div>
                    <span className="text-2xl font-bold text-amber-500 tabular-nums shrink-0 group-hover:scale-110 transition-transform">
                      {kpi?.other ?? 0}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

            {/* ══════════════════════════════════════════════
                ÉVOLUTION PAR SEMAINE — Graphique professionnel
                ══════════════════════════════════════════════ */}
            <div className="neu-card">
              {/* En-tête */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="font-bold text-foreground flex items-center gap-2 text-base">
                    <TrendingUp size={18} className="text-primary" />
                    Évolution par semaine
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Performances journalières de tous les agents</p>
                </div>
                {/* Badge total semaine */}
                {!loading && dailyPerf.length > 0 && (
                  <div className="neu-pressed rounded-xl px-3 py-1.5 text-right shrink-0">
                    <p className="text-base font-bold text-primary tabular-nums leading-none">
                      {dailyPerf.reduce((s, d) => s + d.value, 0)}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">total semaine</p>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-[260px]">
                  <Loader2 size={28} className="animate-spin text-primary" />
                </div>
              ) : dailyPerf.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[260px] gap-2 text-muted-foreground">
                  <Activity size={32} className="opacity-25" />
                  <p className="text-sm">Aucune donnée cette semaine.</p>
                </div>
              ) : (
                <>
                  {/* Graphique Area + Line */}
                  <div className="h-[230px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyPerf} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="weekGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis
                          dataKey="day_name"
                          axisLine={false} tickLine={false}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                          dy={6}
                        />
                        <YAxis
                          axisLine={false} tickLine={false}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          width={28} allowDecimals={false}
                          domain={[0, (max: number) => Math.ceil(max * 1.2)]}
                        />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}
                          labelStyle={{ fontWeight: 700, fontSize: 13, color: 'hsl(var(--foreground))', marginBottom: 4 }}
                          itemStyle={{ fontSize: 12, color: 'hsl(var(--foreground))' }}
                          formatter={(v: number) => [`${v} traitement${v > 1 ? 's' : ''}`, 'Volume']}
                          cursor={{ stroke: 'hsl(var(--primary) / 0.3)', strokeWidth: 1 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          fill="url(#weekGrad)"
                          dot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                          activeDot={{ r: 7 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Barre de jours avec valeur */}
                  <div className="grid mt-3" style={{ gridTemplateColumns: `repeat(${dailyPerf.length}, 1fr)` }}>
                    {dailyPerf.map((d) => {
                      const maxVal = Math.max(...dailyPerf.map(x => x.value), 1);
                      const isBest = d.value === maxVal && maxVal > 0;
                      return (
                        <div key={d.day_name} className="flex flex-col items-center gap-0.5 px-0.5">
                          <span className={`text-xs font-bold tabular-nums ${isBest ? 'text-primary' : 'text-muted-foreground'}`}>
                            {d.value}
                          </span>
                          {isBest && <span className="text-[8px] text-primary font-bold leading-none">↑</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Légende */}
                  <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-primary rounded inline-block" />
                      Traitements / jour
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full border-2 border-primary bg-background inline-block" />
                      Meilleur jour
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        
        {/* ── Tableau Coaches mobiles 3D (remplace les 3 KPI cards) ── */}
        <div className="neu-card mt-6 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--neu-text)' }}>
              <UserCircle size={18} className="text-primary" />
              Coaches mobiles — Présence en temps réel
            </h2>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--neu-muted)' }}>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Mise à jour automatique
            </span>
          </div>

          {/* 3 colonnes 3D */}
          {(() => {
            const total   = extraStats?.coach?.total   ?? 0;
            const online  = extraStats?.coach?.online  ?? 0;
            const offline = extraStats?.coach?.offline ?? 0;
            const maxVal  = Math.max(total, online, offline, 1);
            const cols = [
              { label: 'Inscrits',    value: total,   color: '#e53935', glow: 'rgba(229,57,53,0.35)',   bar: '#e53935' },
              { label: 'Connectés',   value: online,  color: '#22c55e', glow: 'rgba(34,197,94,0.35)',   bar: '#22c55e' },
              { label: 'Hors ligne',  value: offline, color: '#94a3b8', glow: 'rgba(148,163,184,0.2)',  bar: '#94a3b8' },
            ];
            return (
              <div className="grid grid-cols-3 gap-4 mb-5">
                {cols.map(col => {
                  const pct = Math.round((col.value / maxVal) * 100);
                  return (
                    <div key={col.label} className="neu-card text-center">
                      {/* Valeur */}
                      <p className="text-4xl font-black tabular-nums mb-1"
                        style={{ color: col.color, textShadow: `0 2px 8px ${col.glow}` }}>
                        {col.value}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--neu-muted)' }}>
                        {col.label}
                      </p>
                      {/* Barre 3D verticale simulée */}
                      <div className="relative h-2 w-full rounded-full overflow-hidden"
                        style={{ boxShadow: 'inset 2px 2px 4px var(--neu-dark), inset -2px -2px 4px var(--neu-light)' }}>
                        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${col.bar}99, ${col.bar})`,
                            boxShadow: `0 0 6px ${col.bar}88`,
                          }} />
                      </div>
                      <p className="text-[10px] mt-1.5 text-right tabular-nums" style={{ color: 'var(--neu-muted)' }}>
                        {total > 0 ? Math.round((col.value / total) * 100) : 0}%
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Tableau détaillé coaches par localité */}
          {extraStats?.locality && extraStats.locality.length > 0 && (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs min-w-[400px]">
                <thead>
                  <tr>
                    {['Localité','Coaches inscrits'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-bold uppercase tracking-wider whitespace-nowrap"
                        style={{ color: 'var(--neu-muted)', borderBottom: '2px solid hsl(var(--border))' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(extraStats?.locality ?? []).map((loc, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
                      <td className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: 'var(--neu-text)' }}>
                        <span className="inline-flex items-center gap-2">
                          <MapPin size={12} className="text-primary shrink-0" />
                          {loc.locality}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-bold" style={{ color: '#e53935' }}>
                        {loc.received}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Tableau Statistiques par localité — professionnel ── */}
        <div className="neu-card mt-6 mb-6 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--neu-text)' }}>
              <MapPin size={18} className="text-primary" />
              Statistiques par localité
              <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))' }}>
                {formatLocalityDateLabel(localityDate)}
              </span>
              <label className="inline-flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--neu-muted)' }}>
                <CalendarDays size={15} className="text-primary" />
                <span className="sr-only">Date des statistiques par localité</span>
                <input
                  type="date"
                  value={localityDate}
                  max={getCongoDateKey()}
                  onChange={e => setLocalityDate(e.target.value || getCongoDateKey())}
                  className="h-8 rounded-lg border px-2 text-xs font-semibold bg-background"
                  style={{ borderColor: 'hsl(var(--border))', color: 'var(--neu-text)' }}
                />
              </label>
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { label: 'Reçues',    color: '#f59e0b' },
                { label: 'Acceptées', color: '#22c55e' },
                { label: 'Rejetées',  color: '#ef4444' },
                { label: 'Inchangées',color: '#8b5cf6' },
                { label: 'Autres',    color: '#94a3b8' },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--neu-muted)' }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr>
                  {[
                    { label: '#',           align: 'text-left'   },
                    { label: 'Localité',    align: 'text-left'   },
                    { label: 'Reçues',      align: 'text-center' },
                    { label: 'Acceptées',   align: 'text-center' },
                    { label: 'Rejetées',    align: 'text-center' },
                    { label: 'Inchangées',  align: 'text-center' },
                    { label: 'Autres',      align: 'text-center' },
                    { label: 'Taux accept.', align: 'text-right' },
                  ].map(h => (
                    <th key={h.label}
                      className={`px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${h.align}`}
                      style={{ color: 'var(--neu-muted)', borderBottom: '2px solid hsl(var(--border))' }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {localityLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--neu-muted)' }}>
                      Chargement des résultats du {formatLocalityDateLabel(localityDate).toLowerCase()}…
                    </td>
                  </tr>
                ) : localityStats.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--neu-muted)' }}>
                      Aucune donnée de localité pour le {formatLocalityDateLabel(localityDate).toLowerCase()}.
                    </td>
                  </tr>
                ) : (
                  localityStats.map((loc, idx) => {
                    const treated = loc.accepted + loc.rejected;
                    const rate    = treated > 0 ? Math.round((loc.accepted / treated) * 100) : null;
                    const isEven  = idx % 2 === 0;
                    return (
                      <tr key={idx}
                        className="transition-colors duration-100 hover:bg-primary/5"
                        style={{
                          background: isEven ? 'transparent' : 'hsl(var(--muted)/0.3)',
                          borderBottom: '1px solid hsl(var(--border)/0.4)',
                        }}>
                        {/* # */}
                        <td className="px-3 py-3 text-xs tabular-nums" style={{ color: 'var(--neu-muted)' }}>
                          {String(idx + 1).padStart(2,'0')}
                        </td>
                        {/* Localité */}
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-2 font-semibold whitespace-nowrap" style={{ color: 'var(--neu-text)' }}>
                            <span className="w-1 h-5 rounded-full shrink-0" style={{ background: 'var(--neu-accent)' }} />
                            {loc.locality}
                          </span>
                        </td>
                        {/* Reçues */}
                        <td className="px-3 py-3 text-center tabular-nums font-semibold" style={{ color: '#f59e0b' }}>
                          {loc.received}
                        </td>
                        {/* Acceptées */}
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>
                            {loc.accepted}
                          </span>
                        </td>
                        {/* Rejetées */}
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#dc2626' }}>
                            {loc.rejected}
                          </span>
                        </td>
                        {/* Inchangées */}
                        <td className="px-3 py-3 text-center tabular-nums text-xs" style={{ color: '#8b5cf6' }}>
                          {loc.unchanged}
                        </td>
                        {/* Autres */}
                        <td className="px-3 py-3 text-center tabular-nums text-xs" style={{ color: 'var(--neu-muted)' }}>
                          {loc.autres}
                        </td>
                        {/* Taux acceptation avec mini barre */}
                        <td className="px-3 py-3 text-right">
                          {rate !== null ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-bold tabular-nums" style={{ color: rate >= 70 ? '#16a34a' : rate >= 40 ? '#f59e0b' : '#dc2626' }}>
                                {rate}%
                              </span>
                              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                                <div className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${rate}%`,
                                    background: rate >= 70 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444',
                                  }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--neu-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {/* Pied de tableau — totaux */}
              {localityStats.length > 0 && (() => {
                const totRec  = localityStats.reduce((s,l) => s + l.received,  0);
                const totAcc  = localityStats.reduce((s,l) => s + l.accepted,  0);
                const totRej  = localityStats.reduce((s,l) => s + l.rejected,  0);
                const totUnch = localityStats.reduce((s,l) => s + l.unchanged, 0);
                const totAut  = localityStats.reduce((s,l) => s + l.autres,    0);
                const totRate = (totAcc + totRej) > 0 ? Math.round((totAcc / (totAcc + totRej)) * 100) : null;
                return (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid hsl(var(--border))' }}>
                      <td colSpan={2} className="px-3 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--neu-text)' }}>
                        Total
                      </td>
                      <td className="px-3 py-3 text-center font-bold tabular-nums" style={{ color: '#f59e0b' }}>{totRec}</td>
                      <td className="px-3 py-3 text-center font-bold tabular-nums" style={{ color: '#16a34a' }}>{totAcc}</td>
                      <td className="px-3 py-3 text-center font-bold tabular-nums" style={{ color: '#dc2626' }}>{totRej}</td>
                      <td className="px-3 py-3 text-center font-bold tabular-nums" style={{ color: '#8b5cf6' }}>{totUnch}</td>
                      <td className="px-3 py-3 text-center font-bold tabular-nums" style={{ color: 'var(--neu-muted)' }}>{totAut}</td>
                      <td className="px-3 py-3 text-right">
                        {totRate !== null ? (
                          <span className="text-xs font-black" style={{ color: totRate >= 70 ? '#16a34a' : totRate >= 40 ? '#f59e0b' : '#dc2626' }}>
                            {totRate}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>

        
      </div>

      {/* ── Modal "Autre" du jour ─────────────────────────── */}
      {showOtherModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowOtherModal(false)}>
          <div className="neu-card w-full max-w-[calc(100%-2rem)] md:max-w-lg space-y-5 max-h-[80dvh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <MoreHorizontal size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Demandes « Autre » — aujourd'hui</h3>
                  <p className="text-xs text-muted-foreground">{otherRequests.length} demande{otherRequests.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button onClick={() => setShowOtherModal(false)}
                className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-amber-500 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto min-h-0 space-y-3">
              {otherLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-amber-500" />
                </div>
              ) : otherRequests.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">Aucune demande « Autre » aujourd'hui.</p>
              ) : otherRequests.map(r => (
                <div key={r.id} className="neu-pressed rounded-xl px-4 py-3 flex items-start gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm">+{r.phone_to_certify}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
                      {r.notes ?? <span className="italic">Aucun motif renseigné</span>}
                    </p>
                    {r.processed_at && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(r.processed_at), 'HH:mm', { locale: fr })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal transfert ───────────────────────────────── */}
      {transferTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !transferring && setTransferTarget(null)}>
          <div className="neu-card w-full max-w-[calc(100%-2rem)] md:max-w-md space-y-5"
            onClick={e => e.stopPropagation()}>
            {/* En-tête */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-foreground flex items-center gap-2">
                  <ArrowRightLeft size={16} className="text-primary shrink-0" />
                  Transférer la demande
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Coach mobile : <span className="font-semibold text-foreground">{transferTarget.applicantLabel}</span>
                  {' · '}Agent actuel : <span className="font-semibold text-foreground">{transferTarget.agentLabel}</span>
                </p>
              </div>
              <button onClick={() => setTransferTarget(null)}
                className="neu-flat w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Liste des agents en ligne */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">
                Sélectionner un agent disponible
              </p>
              {transferLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                  <Loader2 size={16} className="animate-spin" /> Chargement des agents…
                </div>
              ) : transferAgents.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Aucun agent disponible en ligne.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {transferAgents.map(agent => (
                    <button key={agent.id}
                      disabled={transferring}
                      onClick={() => confirmTransfer(agent.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl neu-flat hover:ring-1 hover:ring-primary/40 transition-all group disabled:opacity-50">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full neu-pressed flex items-center justify-center shrink-0 relative">
                        <span className="text-sm font-bold text-primary">
                          {(agent.username ?? 'A')[0].toUpperCase()}
                        </span>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-card" />
                      </div>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-foreground text-left truncate">
                        {agent.username}
                      </span>
                      <span className="text-xs text-green-600 font-medium shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        En ligne
                      </span>
                      {transferring
                        ? <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />
                        : <Check size={14} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
