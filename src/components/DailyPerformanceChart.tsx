import { useMemo, memo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Cell, ReferenceLine,
} from 'recharts';
import type { DailyPerformance } from '@/lib/api';
import { TrendingUp, TrendingDown, Minus, Award, Target, BarChart2 } from 'lucide-react';

interface Props {
  data: DailyPerformance[];
}

// Tooltip personnalisé
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="neu-card px-4 py-3 text-sm min-w-[130px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      <p className="text-primary font-semibold">{val} traitement{val > 1 ? 's' : ''}</p>
    </div>
  );
}

export const DailyPerformanceChart = memo(function DailyPerformanceChart({ data }: Props) {
  // ── Calcul des KPI ──────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data.length) return null;
    const values = data.map(d => d.value);
    const total  = values.reduce((a, b) => a + b, 0);
    const max    = Math.max(...values);
    const avg    = total / values.length;
    const bestDay = data.find(d => d.value === max);
    // Tendance : compare dernière journée vs avant-dernière
    const last = values[values.length - 1] ?? 0;
    const prev = values[values.length - 2] ?? 0;
    const trend = last > prev ? 'up' : last < prev ? 'down' : 'stable';
    return { total, max, avg: Math.round(avg * 10) / 10, bestDay, trend, last, prev };
  }, [data]);

  // Domaine Y avec marge de 20%
  const maxVal   = data.length ? Math.max(...data.map(d => d.value), 1) : 10;
  const yDomain  = [0, Math.ceil(maxVal * 1.25)];
  const avgLine  = stats ? stats.avg : 0;

  // Couleur de barre : meilleur jour = primary, autres = muted dégradé
  const getBarColor = (entry: DailyPerformance) => {
    if (!stats) return 'hsl(var(--primary) / 0.7)';
    if (entry.value === stats.max && stats.max > 0) return 'hsl(var(--primary))';
    return 'hsl(var(--primary) / 0.45)';
  };

  return (
    <div className="w-full space-y-5">

      {/* ── KPI résumé ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Total semaine */}
        <div className="neu-pressed rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BarChart2 size={14} className="shrink-0" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total semaine</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">{stats?.total ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">traitements</p>
        </div>

        {/* Meilleur jour */}
        <div className="neu-pressed rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Award size={14} className="shrink-0 text-yellow-500" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Meilleur jour</span>
          </div>
          <p className="text-2xl font-bold text-primary tabular-nums">{stats?.max ?? 0}</p>
          <p className="text-[11px] text-muted-foreground truncate">{stats?.bestDay?.day_name ?? '—'}</p>
        </div>

        {/* Moyenne + tendance */}
        <div className="neu-pressed rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target size={14} className="shrink-0" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Moyenne / jour</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-foreground tabular-nums">{stats?.avg ?? 0}</p>
            {stats && (
              <span className={`mb-0.5 text-xs font-semibold flex items-center gap-0.5 ${
                stats.trend === 'up'     ? 'text-green-500'  :
                stats.trend === 'down'   ? 'text-red-500'    : 'text-muted-foreground'
              }`}>
                {stats.trend === 'up'   && <TrendingUp size={13} />}
                {stats.trend === 'down' && <TrendingDown size={13} />}
                {stats.trend === 'stable' && <Minus size={13} />}
                {stats.trend === 'up'   ? '+' : stats.trend === 'down' ? '-' : '='}{Math.abs(stats.last - stats.prev)}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">traitements / jour</p>
        </div>
      </div>

      {/* ── Graphique principal ───────────────────────────── */}
      <div className="neu-pressed rounded-2xl p-4 pt-5">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-2 text-muted-foreground">
            <BarChart2 size={36} className="opacity-30" />
            <p className="text-sm">Aucune donnée disponible</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                stroke="hsl(var(--border))"
                opacity={0.6}
              />

              <XAxis
                dataKey="day_name"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                width={30}
                allowDecimals={false}
              />

              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)', radius: 6 }} />

              {/* Ligne de moyenne */}
              {avgLine > 0 && (
                <ReferenceLine
                  y={avgLine}
                  stroke="hsl(var(--primary) / 0.4)"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{ value: `moy. ${avgLine}`, position: 'right', fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                />
              )}

              {/* Barres */}
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} fill="url(#barGrad)">
                {data.map((entry) => (
                  <Cell key={entry.day_name} fill={getBarColor(entry)} />
                ))}
              </Bar>

              {/* Ligne de tendance */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Légende */}
        {data.length > 0 && (
          <div className="flex items-center justify-center gap-5 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-primary inline-block" />
              Traitements / jour
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-primary/50 inline-block" />
              Moyenne
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-primary inline-block rounded" />
              Tendance
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
