import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getHourlyProcessingStats } from '@/lib/api';
import type { HourlyProcessingRow } from '@/lib/api';
import { Clock, Users, TrendingUp, CalendarDays } from 'lucide-react';

// Colour heat mapping for percentage cells
function pctColor(value: number): string {
  if (value === 0) return 'text-muted-foreground';
  if (value >= 70) return 'text-green-600 font-semibold';
  if (value >= 40) return 'text-green-500 font-medium';
  if (value >= 10) return 'text-blue-500';
  return 'text-orange-400';
}

function pctBg(value: number): string {
  if (value === 0) return '';
  if (value >= 70) return 'bg-green-100/60';
  if (value >= 40) return 'bg-green-50/60';
  if (value >= 10) return 'bg-blue-50/60';
  return 'bg-orange-50/60';
}

function PctCell({ value }: { value: number }) {
  return (
    <td className={`py-3 px-3 text-sm text-center whitespace-nowrap ${pctBg(value)} ${pctColor(value)}`}>
      {value === 0 ? <span className="text-muted-foreground/50">0%</span> : `${value}%`}
    </td>
  );
}

const COL_HEADERS = [
  { label: 'HEURE',             cls: 'text-left' },
  { label: 'AGENTS CONNECTÉS',  cls: 'text-center' },
  { label: 'TOTAL',             cls: 'text-center' },
  { label: '0-2 MIN',           cls: 'text-center' },
  { label: '2-5 MIN',           cls: 'text-center' },
  { label: '5-10 MIN',          cls: 'text-center' },
  { label: '10-15 MIN',         cls: 'text-center' },
  { label: '15-30 MIN',         cls: 'text-center' },
  { label: '>30 MIN',           cls: 'text-center' },
];

export default function SupervisorProcessingTimePage() {
  const [rows, setRows]       = useState<HourlyProcessingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate]       = useState<string>(new Date().toISOString().split('T')[0]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getHourlyProcessingStats(date);
    setRows(data);
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Summary KPIs
  const totalRequests = rows.reduce((s, r) => s + r.total, 0);
  const peakRow       = rows.reduce<HourlyProcessingRow | null>((best, r) => (!best || r.total > best.total ? r : best), null);
  const avgAgents     = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.agents, 0) / rows.length) : 0;
  const fastPct       = totalRequests > 0
    ? Math.round((rows.reduce((s, r) => s + (r.total * (r.pct_0_2 + r.pct_2_5) / 100), 0) / totalRequests) * 10) / 10
    : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Processing Time par heure</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Répartition du temps de traitement (% du volume traité) par tranche horaire.
            </p>
          </div>
          {/* Date picker */}
          <div className="flex items-center gap-2 neu-card py-2 px-4 w-fit">
            <CalendarDays size={16} className="text-primary shrink-0" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-transparent text-sm text-foreground outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total traités', value: totalRequests, icon: <TrendingUp size={18} className="text-primary" />, color: 'text-primary' },
            { label: 'Heure de pointe', value: peakRow ? `${peakRow.hour} (${peakRow.total})` : '—', icon: <Clock size={18} className="text-orange-500" />, color: 'text-orange-500' },
            { label: 'Agents moy./h', value: avgAgents, icon: <Users size={18} className="text-blue-500" />, color: 'text-blue-500' },
            { label: '% traités < 5 min', value: `${fastPct}%`, icon: <TrendingUp size={18} className="text-green-600" />, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="stat-card h-full">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.color}`}>{loading ? '—' : s.value}</p>
                </div>
                <div className="neu-flat w-9 h-9 rounded-xl flex items-center justify-center shrink-0">{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main table */}
        <div className="neu-card overflow-hidden">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock size={17} className="text-primary" />
            Répartition Processing Time par heure (% du volume traité)
          </h2>

          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="neu-pressed h-10 rounded-xl animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              Aucune donnée de traitement pour cette date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border bg-muted/20">
                    {COL_HEADERS.map(h => (
                      <th key={h.label} className={`py-3 px-3 whitespace-nowrap font-semibold ${h.cls}`}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const isPeak = peakRow?.hour === r.hour;
                    return (
                      <tr
                        key={r.hour}
                        className={`border-b border-border/40 last:border-0 transition-colors ${
                          isPeak ? 'bg-primary/5' : idx % 2 === 0 ? '' : 'bg-muted/10'
                        }`}
                      >
                        {/* HEURE */}
                        <td className="py-3 px-3 font-bold text-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {isPeak && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                            {r.hour}
                          </div>
                        </td>
                        {/* AGENTS */}
                        <td className="py-3 px-3 text-center font-semibold text-primary whitespace-nowrap">{r.agents}</td>
                        {/* TOTAL */}
                        <td className="py-3 px-3 text-center font-bold text-foreground whitespace-nowrap">{r.total}</td>
                        {/* TIME BUCKETS */}
                        <PctCell value={r.pct_0_2} />
                        <PctCell value={r.pct_2_5} />
                        <PctCell value={r.pct_5_10} />
                        <PctCell value={r.pct_10_15} />
                        <PctCell value={r.pct_15_30} />
                        <PctCell value={r.pct_over30} />
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals / averages footer */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                    <td className="py-3 px-3 text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Total / Moy.</td>
                    <td className="py-3 px-3 text-center text-primary">{avgAgents}</td>
                    <td className="py-3 px-3 text-center text-foreground">{totalRequests}</td>
                    {(['pct_0_2','pct_2_5','pct_5_10','pct_10_15','pct_15_30','pct_over30'] as const).map(key => {
                      const avg = rows.length > 0
                        ? Math.round((rows.reduce((s, r) => s + r[key], 0) / rows.length) * 10) / 10
                        : 0;
                      return (
                        <td key={key} className={`py-3 px-3 text-center text-sm whitespace-nowrap ${pctColor(avg)}`}>
                          {avg > 0 ? `${avg}%` : <span className="text-muted-foreground/50">0%</span>}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="neu-card py-3 px-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Légende :</span>
          <span><span className="text-green-600 font-semibold">Vert foncé</span> ≥ 70 %</span>
          <span><span className="text-green-500 font-medium">Vert clair</span> 40–69 %</span>
          <span><span className="text-blue-500">Bleu</span> 10–39 %</span>
          <span><span className="text-orange-400">Orange</span> &lt; 10 %</span>
          <span className="ml-auto flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> Heure de pointe</span>
        </div>
      </div>
    </MainLayout>
  );
}
