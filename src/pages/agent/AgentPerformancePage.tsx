import React, { useEffect, useState, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDailyPerformances, getAgentDailyTreatmentCounts, getCurrentWorkPeriod,
  type DailyPerformance, type WorkPeriodCurrent,
} from '@/lib/api';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  Award, TrendingUp, TrendingDown, Minus, Loader2, CalendarDays,
  Target, Zap, BarChart2, CheckCircle2, Calendar,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';

// ── Helpers ────────────────────────────────────────────────
function fmtDate(iso: string) {
  try { return format(parseISO(iso), 'd MMM yyyy', { locale: fr }); }
  catch { return iso; }
}

function ordinalDay(n: number): string {
  if (n === 1) return '1er';
  return `${n}`;
}

// ── Composant KPI card ─────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color = 'text-foreground', accent = false,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color?: string; accent?: boolean;
}) {
  return (
    <div className={`neu-card flex items-center gap-4 p-4 ${accent ? 'border border-primary/20' : ''}`}>
      <div className={`neu-flat w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${accent ? 'bg-primary/10' : ''}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{label}</p>
        <p className={`text-2xl font-black tabular-nums leading-tight ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function AgentPerformancePage() {
  const { profile } = useAuth();

  const [weekData, setWeekData]       = useState<DailyPerformance[]>([]);
  const [monthData, setMonthData]     = useState<Record<string, number>>({});
  const [currentPeriod, setCurrentPeriod] = useState<WorkPeriodCurrent | null>(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!profile) return;
    async function load() {
      setLoading(true);
      const [week, month, period] = await Promise.all([
        getDailyPerformances(profile!.id),
        getAgentDailyTreatmentCounts(profile!.id, 30),
        getCurrentWorkPeriod(),
      ]);
      setWeekData(week);
      setMonthData(month);
      setCurrentPeriod(period);
      setLoading(false);
    }
    load();
  }, [profile]);

  // ── Données du graphique mensuel (30 derniers jours) ────
  const monthChartData = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const d = subDays(today, 29 - i);
      const key = format(d, 'yyyy-MM-dd');
      return {
        date: format(d, 'dd/MM'),
        full: format(d, 'd MMM', { locale: fr }),
        value: monthData[key] ?? 0,
      };
    });
  }, [monthData]);

  // ── Données de la période de paie ───────────────────────
  const periodChartData = useMemo(() => {
    if (!currentPeriod?.configured || !currentPeriod.period_start || !currentPeriod.period_end) return [];
    const start = parseISO(currentPeriod.period_start);
    const end   = parseISO(currentPeriod.period_end);
    const result: { date: string; full: string; value: number }[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const key = format(cur, 'yyyy-MM-dd');
      result.push({
        date: format(cur, 'dd/MM'),
        full: format(cur, 'd MMM', { locale: fr }),
        value: monthData[key] ?? 0,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [currentPeriod, monthData]);

  // ── KPI calculés ────────────────────────────────────────
  const weekTotal = useMemo(() => weekData.reduce((s, d) => s + d.value, 0), [weekData]);
  const weekMax   = useMemo(() => Math.max(...weekData.map(d => d.value), 0), [weekData]);
  const weekBest  = useMemo(() => weekData.find(d => d.value === weekMax), [weekData, weekMax]);
  const weekAvg   = useMemo(() => weekData.length > 0 ? Math.round(weekTotal / weekData.length) : 0, [weekTotal, weekData]);

  const periodTotal = useMemo(() => periodChartData.reduce((s, d) => s + d.value, 0), [periodChartData]);
  const periodAvg   = useMemo(() => periodChartData.length > 0 ? Math.round(periodTotal / periodChartData.length) : 0, [periodTotal, periodChartData]);
  const periodMax   = useMemo(() => Math.max(...periodChartData.map(d => d.value), 0), [periodChartData]);

  const monthTotal  = useMemo(() => monthChartData.reduce((s, d) => s + d.value, 0), [monthChartData]);

  // Tendance semaine
  const trend = useMemo(() => {
    if (weekData.length < 2) return 'stable';
    const half = Math.floor(weekData.length / 2);
    const first = weekData.slice(0, half).reduce((s, d) => s + d.value, 0);
    const second = weekData.slice(half).reduce((s, d) => s + d.value, 0);
    if (second > first * 1.05) return 'up';
    if (second < first * 0.95) return 'down';
    return 'stable';
  }, [weekData]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 size={36} className="animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── En-tête ───────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance flex items-center gap-2">
            <Award size={24} className="text-primary" />
            Mes performances
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Suivi de votre activité — semaine, période de paie et 30 derniers jours.
          </p>
        </div>

        {/* ── KPI cards ─────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<Zap size={20} className="text-yellow-500" />}
            label="Total semaine"
            value={weekTotal}
            color="text-yellow-500"
            accent
          />
          <KpiCard
            icon={<Award size={20} className="text-primary" />}
            label="Meilleur jour"
            value={weekMax}
            sub={weekBest?.day_name ?? '—'}
            color="text-primary"
          />
          <KpiCard
            icon={<Target size={20} className="text-green-500" />}
            label="Moy. / jour"
            value={weekAvg}
            sub={trend === 'up' ? '↑ En progression' : trend === 'down' ? '↓ En baisse' : '→ Stable'}
            color="text-green-500"
          />
          <KpiCard
            icon={<BarChart2 size={20} className="text-blue-500" />}
            label="30 derniers jours"
            value={monthTotal}
            color="text-blue-500"
          />
        </div>

        {/* ── Graphique évolution semaine ───────────── */}
        <div className="neu-card space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-foreground flex items-center gap-2 text-base">
                <TrendingUp size={17} className="text-primary" />
                Évolution cette semaine
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Traitements par jour sur les 7 derniers jours</p>
            </div>
            <div className="flex items-center gap-1.5 neu-pressed rounded-xl px-3 py-1.5 shrink-0">
              {trend === 'up' && <TrendingUp size={14} className="text-green-500" />}
              {trend === 'down' && <TrendingDown size={14} className="text-red-500" />}
              {trend === 'stable' && <Minus size={14} className="text-muted-foreground" />}
              <span className={`text-xs font-bold ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
                {trend === 'up' ? 'Progression' : trend === 'down' ? 'En baisse' : 'Stable'}
              </span>
            </div>
          </div>

          {weekData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground gap-2">
              <BarChart2 size={32} className="opacity-25" />
              <p className="text-sm">Aucune donnée cette semaine.</p>
            </div>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap="35%">
                  <defs>
                    <linearGradient id="perfBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="perfBarBest" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#22C55E" stopOpacity={1} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="day_name" axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} dy={6} />
                  <YAxis axisLine={false} tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={26} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}
                    labelStyle={{ fontWeight: 700, fontSize: 13, color: 'hsl(var(--foreground))', marginBottom: 4 }}
                    itemStyle={{ fontSize: 12, color: 'hsl(var(--foreground))' }}
                    formatter={(v: number) => [`${v} traitement${v > 1 ? 's' : ''}`, 'Volume']}
                    cursor={{ fill: 'hsl(var(--muted) / 0.4)', radius: 4 } as any}
                  />
                  {weekAvg > 0 && (
                    <ReferenceLine y={weekAvg} stroke="hsl(var(--primary))" strokeDasharray="5 3" strokeOpacity={0.5}
                      label={{ value: `Moy. ${weekAvg}`, position: 'right', fontSize: 10, fill: 'hsl(var(--primary))' }} />
                  )}
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {weekData.map((entry, index) => (
                      <Cell key={`cell-${index}`}
                        fill={entry.value === weekMax && weekMax > 0 ? 'url(#perfBarBest)' : 'url(#perfBarGrad)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Période de paie courante ──────────────── */}
        {currentPeriod?.configured && periodChartData.length > 0 && (
          <div className="neu-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-foreground flex items-center gap-2 text-base">
                  <CalendarDays size={17} className="text-primary" />
                  Période de paie en cours
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Du {fmtDate(currentPeriod.period_start!)} au {fmtDate(currentPeriod.period_end!)}
                </p>
              </div>
              <div className="neu-pressed rounded-xl px-3 py-2 text-right shrink-0">
                <p className="text-xl font-black text-primary tabular-nums leading-none">{periodTotal}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">traitements</p>
              </div>
            </div>

            {/* KPI période */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total période',  value: periodTotal, color: 'text-primary' },
                { label: 'Pic / jour',     value: periodMax,   color: 'text-green-500' },
                { label: 'Moy. / jour',    value: periodAvg,   color: 'text-foreground' },
              ].map(k => (
                <div key={k.label} className="neu-pressed rounded-xl px-3 py-2.5 text-center">
                  <p className={`text-lg font-black tabular-nums ${k.color}`}>{k.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={periodChartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="periodAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false}
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} dy={4}
                    interval={Math.floor(periodChartData.length / 6)} />
                  <YAxis axisLine={false} tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={26} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}
                    labelFormatter={(l) => {
                      const item = periodChartData.find(d => d.date === l);
                      return item?.full ?? l;
                    }}
                    formatter={(v: number) => [`${v} traitement${v > 1 ? 's' : ''}`, 'Volume']}
                  />
                  {periodAvg > 0 && (
                    <ReferenceLine y={periodAvg} stroke="hsl(var(--primary))" strokeDasharray="5 3" strokeOpacity={0.5} />
                  )}
                  <Area type="monotone" dataKey="value"
                    stroke="hsl(var(--primary))" strokeWidth={2}
                    fill="url(#periodAreaGrad)"
                    dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Graphique 30 derniers jours ───────────── */}
        <div className="neu-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-foreground flex items-center gap-2 text-base">
                <Calendar size={17} className="text-primary" />
                Activité sur 30 jours
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Vue complète de votre activité récente</p>
            </div>
            <div className="neu-pressed rounded-xl px-3 py-1.5 shrink-0 text-right">
              <p className="text-base font-bold text-primary tabular-nums leading-none">{monthTotal}</p>
              <p className="text-[9px] text-muted-foreground">total</p>
            </div>
          </div>

          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthChartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="monthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" axisLine={false} tickLine={false}
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} dy={4} interval={4} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={26} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}
                  labelFormatter={(l) => {
                    const item = monthChartData.find(d => d.date === l);
                    return item?.full ?? l;
                  }}
                  formatter={(v: number) => [`${v} traitement${v > 1 ? 's' : ''}`, 'Volume']}
                />
                <Area type="monotone" dataKey="value"
                  stroke="hsl(var(--primary))" strokeWidth={2}
                  fill="url(#monthAreaGrad)"
                  dot={false} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Mini-grille des jours */}
          <div className="grid grid-cols-7 gap-1 pt-1">
            {monthChartData.slice(-14).map((d) => {
              const intensity = d.value === 0 ? 0 : Math.min(1, d.value / (Math.max(...monthChartData.map(x => x.value)) || 1));
              return (
                <div key={d.date} title={`${d.full} : ${d.value}`}
                  className="aspect-square rounded-md transition-all cursor-default"
                  style={{ background: d.value === 0 ? 'hsl(var(--muted))' : `hsl(var(--primary) / ${0.2 + intensity * 0.8})` }}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Moins actif</span>
            <div className="flex gap-1">
              {[0.2, 0.4, 0.6, 0.8, 1].map(o => (
                <span key={o} className="w-3 h-3 rounded-sm inline-block"
                  style={{ background: `hsl(var(--primary) / ${o})` }} />
              ))}
            </div>
            <span>Plus actif</span>
          </div>
        </div>

        {/* ── Récapitulatif semaine ─────────────────── */}
        {weekData.length > 0 && (
          <div className="neu-card space-y-3">
            <h2 className="font-bold text-foreground flex items-center gap-2 text-base">
              <CheckCircle2 size={17} className="text-green-500" />
              Détail de la semaine
            </h2>
            <div className="space-y-2">
              {weekData.map((d) => {
                const pct = weekMax > 0 ? (d.value / weekMax) * 100 : 0;
                const isBest = d.value === weekMax && weekMax > 0;
                return (
                  <div key={d.day_name} className="flex items-center gap-3">
                    <span className={`text-xs font-semibold w-24 shrink-0 truncate ${isBest ? 'text-primary' : 'text-muted-foreground'}`}>
                      {d.day_name}
                    </span>
                    <div className="flex-1 neu-pressed rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: isBest
                            ? 'linear-gradient(90deg, #22C55E, #16A34A)'
                            : 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))',
                        }}
                      />
                    </div>
                    <span className={`text-xs font-bold tabular-nums w-8 text-right shrink-0 ${isBest ? 'text-primary' : 'text-foreground'}`}>
                      {d.value}
                    </span>
                    {isBest && <Award size={13} className="text-primary shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </MainLayout>
  );
}
