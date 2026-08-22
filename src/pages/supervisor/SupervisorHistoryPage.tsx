import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getAllRequests, getActivityLogs } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { VerificationRequest } from '@/types/types';
import type { ActivityLog } from '@/types/types';
import {
  History, CheckCircle2, XCircle, Minus, CalendarDays,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Activity, User, ClipboardList, TrendingUp,
  Download, CheckCircle, RefreshCcw, MoreHorizontal, Clock, ListChecks
} from 'lucide-react';
import {
  format, parseISO, isSameDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameMonth, addMonths, subMonths, isToday,
} from 'date-fns';
import { fr } from 'date-fns/locale';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getDateKey(d: Date) { return format(d, 'yyyy-MM-dd'); }

function reqDate(r: VerificationRequest): Date | null {
  const raw = r.processed_at ?? r.updated_at;
  if (!raw) return null;
  try { return parseISO(raw); } catch { return null; }
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    login:               'Connexion',
    logout:              'Déconnexion',
    request_accepted:    'Demande acceptée',
    request_rejected:    'Demande rejetée',
    request_unchanged:   'Demande inchangée',
    request_submitted:   'Demande soumise',
    request_assigned:    'Demande assignée',
    request_transferred: 'Transfert de demande',
    user_created:        'Utilisateur créé',
    user_updated:        'Utilisateur modifié',
    settings_updated:    'Paramètres modifiés',
    apk_uploaded:        'APK téléversé',
    apk_deleted:         'APK supprimé',
  };
  return map[action] ?? action.replace(/_/g, ' ');
}

function actionColor(action: string): string {
  if (action.includes('accept'))    return 'text-green-600 bg-green-50 dark:bg-green-950/30';
  if (action.includes('reject'))    return 'text-red-500 bg-red-50 dark:bg-red-950/30';
  if (action.includes('login'))     return 'text-blue-500 bg-blue-50 dark:bg-blue-950/30';
  if (action.includes('logout'))    return 'text-gray-500 bg-gray-100 dark:bg-gray-800/40';
  if (action.includes('transfer'))  return 'text-purple-600 bg-purple-50 dark:bg-purple-950/30';
  if (action.includes('unchanged')) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30';
  return 'text-primary bg-primary/10';
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ── Composant principal ─────────────────────────────────────────────────────

export default function SupervisorHistoryPage() {
  const [requests,  setRequests]  = useState<VerificationRequest[]>([]);
  const [logs,      setLogs]      = useState<ActivityLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [viewMonth,   setViewMonth]   = useState(() => new Date());
  const [showCalendar, setShowCalendar] = useState(false);

  const load = useCallback(async () => {
    const [reqs, acts] = await Promise.all([
      getAllRequests(1000),
      getActivityLogs(500),
    ]);
    setRequests(reqs.filter(r => ['accepted', 'rejected', 'unchanged'].includes(r.status)));
    setLogs(acts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtrage par jour sélectionné ────────────────────────────────────────
  const dayRequests = useMemo(() =>
    requests.filter(r => { const d = reqDate(r); return d && isSameDay(d, selectedDay); }),
    [requests, selectedDay]);

  const dayLogs = useMemo(() =>
    logs.filter(l => { try { return isSameDay(parseISO(l.created_at), selectedDay); } catch { return false; } }),
    [logs, selectedDay]);

  // ── Stats du jour ────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     dayRequests.length,
    accepted:  dayRequests.filter(r => r.status === 'accepted').length,
    rejected:  dayRequests.filter(r => r.status === 'rejected').length,
    unchanged: dayRequests.filter(r => r.status === 'unchanged').length,
  }), [dayRequests]);

  // ── Stats Horaires ────────────────────────────────────────────────────────
  const hourlyStats = useMemo(() => {
    const createMetric = () => ({ count: 0, totalSeconds: 0, countWithTime: 0 });
    const rows = Array.from({ length: 24 }).map((_, i) => ({
      hour: i,
      received: createMetric(),
      accepted: createMetric(),
      rejected: createMetric(),
      unchanged: createMetric(),
      autres: createMetric(),
      total: createMetric()
    }));

    for (const r of dayRequests) {
      const d = reqDate(r);
      if (!d) continue;
      const h = d.getHours();
      const dur = r.processing_duration_seconds || 0;
      
      const addMetric = (m: { count: number; totalSeconds: number; countWithTime: number }) => {
        m.count++;
        if (dur > 0) {
          m.totalSeconds += dur;
          m.countWithTime++;
        }
      };

      addMetric(rows[h].received);
      
      if (r.status === 'accepted') addMetric(rows[h].accepted);
      else if (r.status === 'rejected') addMetric(rows[h].rejected);
      else if (r.status === 'unchanged') addMetric(rows[h].unchanged);
      else addMetric(rows[h].autres);
    }

    // Calculer le total (somme des traités ou total général)
    for (const r of rows) {
      r.total.count = r.accepted.count + r.rejected.count + r.unchanged.count + r.autres.count;
      r.total.totalSeconds = r.accepted.totalSeconds + r.rejected.totalSeconds + r.unchanged.totalSeconds + r.autres.totalSeconds;
      r.total.countWithTime = r.accepted.countWithTime + r.rejected.countWithTime + r.unchanged.countWithTime + r.autres.countWithTime;
    }

    return rows;
  }, [dayRequests]);

  const totalGeneral = useMemo(() => {
    const createMetric = () => ({ count: 0, totalSeconds: 0, countWithTime: 0 });
    return hourlyStats.reduce((acc, row) => ({
      received: {
        count: acc.received.count + row.received.count,
        totalSeconds: acc.received.totalSeconds + row.received.totalSeconds,
        countWithTime: acc.received.countWithTime + row.received.countWithTime
      },
      accepted: {
        count: acc.accepted.count + row.accepted.count,
        totalSeconds: acc.accepted.totalSeconds + row.accepted.totalSeconds,
        countWithTime: acc.accepted.countWithTime + row.accepted.countWithTime
      },
      rejected: {
        count: acc.rejected.count + row.rejected.count,
        totalSeconds: acc.rejected.totalSeconds + row.rejected.totalSeconds,
        countWithTime: acc.rejected.countWithTime + row.rejected.countWithTime
      },
      unchanged: {
        count: acc.unchanged.count + row.unchanged.count,
        totalSeconds: acc.unchanged.totalSeconds + row.unchanged.totalSeconds,
        countWithTime: acc.unchanged.countWithTime + row.unchanged.countWithTime
      },
      autres: {
        count: acc.autres.count + row.autres.count,
        totalSeconds: acc.autres.totalSeconds + row.autres.totalSeconds,
        countWithTime: acc.autres.countWithTime + row.autres.countWithTime
      },
      total: {
        count: acc.total.count + row.total.count,
        totalSeconds: acc.total.totalSeconds + row.total.totalSeconds,
        countWithTime: acc.total.countWithTime + row.total.countWithTime
      },
    }), {
      received: createMetric(), accepted: createMetric(), rejected: createMetric(),
      unchanged: createMetric(), autres: createMetric(), total: createMetric()
    });
  }, [hourlyStats]);

  const getAvg = (m: { count: number; totalSeconds: number; countWithTime: number }) => 
    m.countWithTime > 0 ? Math.round(m.totalSeconds / m.countWithTime) : 0;

  // ── Regroupement des traitements par agent (pour le résumé) ───────────────
  type AgentGroup = { name: string; items: VerificationRequest[] };
  const byAgent = useMemo(() => {
    const map = new Map<string, AgentGroup>();
    for (const r of dayRequests) {
      const key  = r.agent_id ?? 'unknown';
      const name = r.agent?.username ?? 'Agent inconnu';
      if (!map.has(key)) map.set(key, { name, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [dayRequests]);

  // ── Calendrier heatmap ───────────────────────────────────────────────────
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) {
      const d = reqDate(r);
      if (!d) continue;
      const k = getDateKey(d);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [requests]);

  const calDays = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const last  = endOfMonth(viewMonth);
    return {
      days: eachDayOfInterval({ start: first, end: last }),
      startPad: (getDay(first) + 6) % 7,
    };
  }, [viewMonth]);

  function dotColor(n: number) {
    if (n <= 2) return 'bg-primary/30';
    if (n <= 5) return 'bg-primary/60';
    return 'bg-primary';
  }

  const isToday_ = isSameDay(selectedDay, new Date());
  const dateLabel = isToday_
    ? "Aujourd'hui"
    : format(selectedDay, 'EEEE d MMMM yyyy', { locale: fr });

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">
              Historique superviseur
            </h1>
            <p className="text-muted-foreground text-sm mt-1 capitalize">
              {dateLabel}
            </p>
          </div>
          {/* Bouton toggle calendrier */}
          <button
            onClick={() => setShowCalendar(v => !v)}
            className={[
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0',
              showCalendar ? 'neu-pressed text-primary' : 'neu-flat text-muted-foreground hover:text-primary',
            ].join(' ')}
          >
            <CalendarDays size={16} />
            Changer de date
            {showCalendar ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* ── Calendrier accordéon ─────────────────────────────────────────── */}
        {showCalendar && (
          <div className="neu-card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-foreground capitalize">
                {format(viewMonth, 'MMMM yyyy', { locale: fr })}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setViewMonth(m => subMonths(m, 1))}
                  className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setViewMonth(m => addMonths(m, 1))}
                  className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {DAY_LABELS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calDays.startPad }).map((_, i) => <div key={`p${i}`} />)}
              {calDays.days.map(day => {
                const key   = getDateKey(day);
                const count = byDay.get(key) ?? 0;
                const isSel = isSameDay(day, selectedDay);
                return (
                  <button
                    key={key}
                    onClick={() => { setSelectedDay(day); setShowCalendar(false); }}
                    className={[
                      'relative flex flex-col items-center justify-center rounded-xl p-1.5 min-h-[52px] transition-all',
                      isSameMonth(day, viewMonth) ? '' : 'opacity-30',
                      isSel ? 'neu-pressed ring-2 ring-primary' : 'neu-flat hover:neu-pressed cursor-pointer',
                    ].join(' ')}
                  >
                    <span className={['text-xs font-semibold leading-none',
                      isToday(day) && !isSel ? 'text-primary' : 'text-foreground'].join(' ')}>
                      {format(day, 'd')}
                    </span>
                    {count > 0 && (
                      <span className={['mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                        isSel ? 'bg-primary text-white' : `${dotColor(count)} text-primary`].join(' ')}>
                        {count}
                      </span>
                    )}
                    {isToday(day) && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
              {[{l:'1–2',c:'bg-primary/30'},{l:'3–5',c:'bg-primary/60'},{l:'6+',c:'bg-primary'}].map(x => (
                <div key={x.l} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full ${x.c}`} />
                  <span className="text-xs text-muted-foreground">{x.l} traitement{x.l==='1–2'?'':'s'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: 'Total traitements', value: stats.total,     icon: <ClipboardList size={20} className="text-primary" />,      color: 'text-primary' },
            { label: 'Acceptées',         value: stats.accepted,  icon: <CheckCircle2  size={20} className="text-green-600" />,    color: 'text-green-600' },
            { label: 'Rejetées',          value: stats.rejected,  icon: <XCircle       size={20} className="text-red-500" />,      color: 'text-red-500' },
            { label: 'Inchangées',        value: stats.unchanged, icon: <Minus         size={20} className="text-yellow-600" />,   color: 'text-yellow-600' },
          ].map(s => (
            <div key={s.label} className="stat-card h-full p-3 sm:p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">{s.label}</p>
                  <p className={`text-xl sm:text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className="neu-flat w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 scale-75 sm:scale-100">
                  {s.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Évolution des données par heure ──────────────────────────────── */}
        <div className="neu-card overflow-hidden">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-5">
            <TrendingUp size={18} className="text-primary" />
            Évolution des données par heure
            <span className="neu-flat text-xs font-bold text-primary px-2 py-0.5 rounded-full">
              {format(selectedDay, 'd MMMM yyyy', { locale: fr })}
            </span>
          </h2>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="neu-pressed h-12 rounded-xl animate-pulse" />)}</div>
          ) : hourlyStats.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
              <p>Aucun traitement ce jour.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse rounded-xl overflow-hidden shadow-sm">
                <thead>
                  <tr>
                    {/* HEURE */}
                    <th rowSpan={2} className="bg-[#1e293b] text-white text-center py-4 px-2 border-r border-white/20 align-middle w-32">
                      <div className="flex flex-col items-center gap-1.5">
                        <Clock size={18} />
                        <span className="font-bold text-xs">HEURE</span>
                      </div>
                    </th>
                    {/* DEMANDES REÇUES */}
                    <th colSpan={2} className="bg-[#0284c7] text-white text-center py-3 px-2 border-r border-white/20">
                      <div className="flex flex-col items-center gap-1">
                        <Download size={16} />
                        <span className="font-bold text-[11px] uppercase tracking-wide leading-tight">Demandes<br/>Reçues</span>
                      </div>
                    </th>
                    {/* ACCEPTÉES */}
                    <th colSpan={2} className="bg-[#16a34a] text-white text-center py-3 px-2 border-r border-white/20">
                      <div className="flex flex-col items-center gap-1">
                        <CheckCircle size={16} />
                        <span className="font-bold text-[11px] uppercase tracking-wide">Acceptées</span>
                      </div>
                    </th>
                    {/* REJETÉES */}
                    <th colSpan={2} className="bg-[#dc2626] text-white text-center py-3 px-2 border-r border-white/20">
                      <div className="flex flex-col items-center gap-1">
                        <XCircle size={16} />
                        <span className="font-bold text-[11px] uppercase tracking-wide">Rejetées</span>
                      </div>
                    </th>
                    {/* INCHANGÉES */}
                    <th colSpan={2} className="bg-[#f59e0b] text-white text-center py-3 px-2 border-r border-white/20">
                      <div className="flex flex-col items-center gap-1">
                        <RefreshCcw size={16} />
                        <span className="font-bold text-[11px] uppercase tracking-wide">Inchangées</span>
                      </div>
                    </th>
                    {/* AUTRES */}
                    <th colSpan={2} className="bg-[#9333ea] text-white text-center py-3 px-2 border-r border-white/20">
                      <div className="flex flex-col items-center gap-1">
                        <MoreHorizontal size={16} />
                        <span className="font-bold text-[11px] uppercase tracking-wide">Autres</span>
                      </div>
                    </th>
                    {/* TOTAL TRAITÉS */}
                    <th colSpan={2} className="bg-[#1e293b] text-white text-center py-3 px-2">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-bold text-[11px] uppercase tracking-wide leading-tight text-center">Total Traitées<br/><span className="font-normal opacity-80">(Acceptées + Rejetées +<br/>Inchangées + Autres)</span></span>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    {/* DEMANDES REÇUES sub */}
                    <th className="bg-[#0369a1] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20">NOMBRE</th>
                    <th className="bg-[#0369a1] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20 leading-tight">TEMPS MOYEN<br/>(TEMPS RÉEL)</th>
                    {/* ACCEPTÉES sub */}
                    <th className="bg-[#15803d] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20">NOMBRE</th>
                    <th className="bg-[#15803d] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20 leading-tight">TEMPS MOYEN<br/>(TEMPS RÉEL)</th>
                    {/* REJETÉES sub */}
                    <th className="bg-[#b91c1c] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20">NOMBRE</th>
                    <th className="bg-[#b91c1c] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20 leading-tight">TEMPS MOYEN<br/>(TEMPS RÉEL)</th>
                    {/* INCHANGÉES sub */}
                    <th className="bg-[#d97706] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20">NOMBRE</th>
                    <th className="bg-[#d97706] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20 leading-tight">TEMPS MOYEN<br/>(TEMPS RÉEL)</th>
                    {/* AUTRES sub */}
                    <th className="bg-[#7e22ce] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20">NOMBRE</th>
                    <th className="bg-[#7e22ce] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20 leading-tight">TEMPS MOYEN<br/>(TEMPS RÉEL)</th>
                    {/* TOTAL TRAITÉS sub */}
                    <th className="bg-[#0f172a] text-white text-center py-2 px-2 text-[10px] font-semibold border-r border-white/20">NOMBRE</th>
                    <th className="bg-[#0f172a] text-white text-center py-2 px-2 text-[10px] font-semibold leading-tight">TEMPS MOYEN<br/>(TEMPS RÉEL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-xs">
                  {hourlyStats.map((row, idx) => (
                    <tr key={row.hour} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                      <td className="py-2.5 px-3 font-bold text-center border-r border-border/50 text-foreground">
                        {String(row.hour).padStart(2, '0')}:00 - {String(row.hour + 1).padStart(2, '0')}:00
                      </td>
                      <td className="py-2.5 px-3 text-center border-r border-border/50 font-medium">{row.received.count}</td>
                      <td className="py-2.5 px-3 text-center border-r border-border/50">{formatTime(getAvg(row.received))}</td>
                      
                      <td className="py-2.5 px-3 text-center border-r border-border/50 font-medium">{row.accepted.count}</td>
                      <td className="py-2.5 px-3 text-center border-r border-border/50">{formatTime(getAvg(row.accepted))}</td>
                      
                      <td className="py-2.5 px-3 text-center border-r border-border/50 font-medium">{row.rejected.count}</td>
                      <td className="py-2.5 px-3 text-center border-r border-border/50">{formatTime(getAvg(row.rejected))}</td>
                      
                      <td className="py-2.5 px-3 text-center border-r border-border/50 font-medium">{row.unchanged.count}</td>
                      <td className="py-2.5 px-3 text-center border-r border-border/50">{formatTime(getAvg(row.unchanged))}</td>
                      
                      <td className="py-2.5 px-3 text-center border-r border-border/50 font-medium">{row.autres.count}</td>
                      <td className="py-2.5 px-3 text-center border-r border-border/50">{formatTime(getAvg(row.autres))}</td>
                      
                      <td className="py-2.5 px-3 text-center font-bold border-r border-border/50">{row.total.count}</td>
                      <td className="py-2.5 px-3 text-center font-bold">{formatTime(getAvg(row.total))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-sm font-bold text-white">
                  <tr>
                    <td className="bg-[#1e293b] py-4 px-2 text-center uppercase border-r border-white/20">TOTAL</td>
                    
                    <td className="bg-[#0284c7] py-4 px-2 text-center border-r border-white/20 text-lg">{totalGeneral.received.count}</td>
                    <td className="bg-[#0284c7] py-4 px-2 text-center border-r border-white/20">{formatTime(getAvg(totalGeneral.received))}</td>
                    
                    <td className="bg-[#16a34a] py-4 px-2 text-center border-r border-white/20 text-lg">{totalGeneral.accepted.count}</td>
                    <td className="bg-[#16a34a] py-4 px-2 text-center border-r border-white/20">{formatTime(getAvg(totalGeneral.accepted))}</td>
                    
                    <td className="bg-[#dc2626] py-4 px-2 text-center border-r border-white/20 text-lg">{totalGeneral.rejected.count}</td>
                    <td className="bg-[#dc2626] py-4 px-2 text-center border-r border-white/20">{formatTime(getAvg(totalGeneral.rejected))}</td>
                    
                    <td className="bg-[#f59e0b] py-4 px-2 text-center border-r border-white/20 text-lg">{totalGeneral.unchanged.count}</td>
                    <td className="bg-[#f59e0b] py-4 px-2 text-center border-r border-white/20">{formatTime(getAvg(totalGeneral.unchanged))}</td>
                    
                    <td className="bg-[#9333ea] py-4 px-2 text-center border-r border-white/20 text-lg">{totalGeneral.autres.count}</td>
                    <td className="bg-[#9333ea] py-4 px-2 text-center border-r border-white/20">{formatTime(getAvg(totalGeneral.autres))}</td>
                    
                    <td className="bg-[#1e293b] py-4 px-2 text-center border-r border-white/20 text-lg">{totalGeneral.total.count}</td>
                    <td className="bg-[#1e293b] py-4 px-2 text-center">{formatTime(getAvg(totalGeneral.total))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Legend ──────────────────────────────────────────────────────── */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-6 px-4">
              <div className="flex items-center gap-3">
                <div className="text-[#0284c7]">
                  <Download size={28} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Demandes Reçues</p>
                  <p className="font-bold text-xl text-[#0284c7]">{totalGeneral.received.count}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[#16a34a]">
                  <CheckCircle size={28} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Acceptées</p>
                  <p className="font-bold text-xl text-[#16a34a]">
                    {totalGeneral.accepted.count} <span className="text-sm font-semibold opacity-80">({(totalGeneral.accepted.count / 100).toFixed(1)}%)</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[#dc2626]">
                  <XCircle size={28} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Rejetées</p>
                  <p className="font-bold text-xl text-[#dc2626]">
                    {totalGeneral.rejected.count} <span className="text-sm font-semibold opacity-80">({(totalGeneral.rejected.count / 100).toFixed(1)}%)</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[#f59e0b]">
                  <RefreshCcw size={28} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Inchangées</p>
                  <p className="font-bold text-xl text-[#f59e0b]">
                    {totalGeneral.unchanged.count} <span className="text-sm font-semibold opacity-80">({(totalGeneral.unchanged.count / 100).toFixed(1)}%)</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[#9333ea]">
                  <MoreHorizontal size={28} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Autres</p>
                  <p className="font-bold text-xl text-[#9333ea]">
                    {totalGeneral.autres.count} <span className="text-sm font-semibold opacity-80">({(totalGeneral.autres.count / 100).toFixed(1)}%)</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[#1e293b] dark:text-slate-300">
                  <Clock size={28} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Temps Moyen Global</p>
                  <p className="font-bold text-xl text-[#1e293b] dark:text-slate-300">{formatTime(getAvg(totalGeneral.total))}</p>
                </div>
              </div>
            </div>
            
            <p className="text-center text-xs text-muted-foreground mt-6 font-medium">
              Les temps sont exprimés en heures:minutes:secondes (hh:mm:ss)
            </p>
            </div>
          )}
        </div>

        {/* ── Journal d'activité du jour ───────────────────────────────────── */}
        <div className="neu-card">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-5">
            <Activity size={18} className="text-primary" />
            Journal d'activité
            <span className="neu-flat text-xs font-bold text-primary px-2 py-0.5 rounded-full">
              {dayLogs.length}
            </span>
          </h2>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="neu-pressed h-12 rounded-xl animate-pulse" />)}</div>
          ) : dayLogs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Activity size={32} className="mx-auto mb-2 opacity-30" />
              <p>Aucune activité enregistrée ce jour.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dayLogs.map(log => {
                const color = actionColor(log.action);
                return (
                  <div key={log.id}
                    className="flex items-start gap-3 p-3 rounded-xl neu-flat">
                    {/* Badge action */}
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${color}`}>
                      {actionLabel(log.action)}
                    </span>

                    {/* Auteur */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <User size={12} className="text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">
                          {log.user?.username ?? 'Système'}
                        </span>
                        {log.user?.role && (
                          <span className="text-xs text-muted-foreground capitalize">
                            ({log.user.role === 'applicant' ? 'Coach mobile' : log.user.role})
                          </span>
                        )}
                      </div>
                      {/* Détails si présents */}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {Object.entries(log.details)
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Heure */}
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {format(parseISO(log.created_at), 'HH:mm', { locale: fr })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Résumé de performance ────────────────────────────────────────── */}
        {stats.total > 0 && (
          <div className="neu-card">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
              <History size={18} className="text-primary" />
              Résumé de performance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Taux d'acceptation */}
              <div className="neu-flat p-4 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Taux d'acceptation</p>
                <p className="text-2xl font-bold text-green-600">
                  {(stats.accepted / 100).toFixed(1)}%
                </p>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(stats.accepted / 100).toFixed(1)}%` }} />
                </div>
              </div>

              {/* Taux de rejet */}
              <div className="neu-flat p-4 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Taux de rejet</p>
                <p className="text-2xl font-bold text-red-500">
                  {(stats.rejected / 100).toFixed(1)}%
                </p>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${(stats.rejected / 100).toFixed(1)}%` }} />
                </div>
              </div>

              {/* Agents actifs */}
              <div className="neu-flat p-4 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Agents actifs</p>
                <p className="text-2xl font-bold text-primary">{byAgent.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {byAgent.length > 0
                    ? `Meilleur : ${byAgent[0].name} (${byAgent[0].items.length})`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </MainLayout>
  );
}
