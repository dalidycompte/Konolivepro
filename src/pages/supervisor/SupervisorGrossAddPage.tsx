import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getAllAgentsProcessingDetailsByDate, getProcessingOptions } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { ProcessingDetails, ProcessingOption } from '@/types/index';
import TableFontControls, { TABLE_FONT_DEFAULT, TABLE_SIZE_DEFAULT } from '@/components/common/TableFontControls';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronLeft, ChevronRight, CalendarDays, Search,
  Filter, SlidersHorizontal, X, Download,
  ClipboardList,
} from 'lucide-react';
import {
  format, parseISO, isToday, isSameDay, isSameMonth,
  addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// ── Colonnes détails ──────────────────────────────────────────────────────────
const DETAIL_COLS: Array<{ key: keyof ProcessingDetails; label: string; w: string }> = [
  { key: 'constat_webcare',       label: 'CONSTAT WEBCARE', w: '130px' },
  { key: 'type_de_piece',         label: 'TYPE PIÈCE',      w: '80px'  },
  { key: 'verbatim',              label: 'VERBATIM',        w: '130px' },
  { key: 'action_prise_gsm',      label: 'ACTION GSM',      w: '130px' },
  { key: 'statut_final_gsm',      label: 'STATUT GSM',      w: '110px' },
  { key: 'traitement',            label: 'TRAITEMENT',      w: '110px' },
  { key: 'type_d_identification', label: 'TYPE ID',         w: '110px' },
  { key: 'raison_du_retard',      label: 'RAISON RETARD',   w: '90px'  },
];

// ── Utilitaires ───────────────────────────────────────────────────────────────
function fmtDate(raw?: string | null, withTime = true) {
  if (!raw) return '—';
  try { return format(parseISO(raw), withTime ? 'd MMM yyyy HH:mm' : 'd MMM yyyy', { locale: fr }); }
  catch { return '—'; }
}
function dateKey(d: Date) { return format(d, 'yyyy-MM-dd'); }

// ── Filtre colonne ────────────────────────────────────────────────────────────
interface ColFilterProps {
  col: string; label: string; rows: any[];
  colFilters: Record<string, Set<string>>;
  setColFilters: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
}
function ColFilter({ col, label, rows, colFilters, setColFilters }: ColFilterProps) {
  const vals = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => {
      const v = col === 'phone'  ? (r.request?.phone_to_certify ?? '')
              : col === 'agent'  ? (r.request?.agent?.username ?? '')
              : col === 'coach'  ? (r.request?.applicant?.username ?? '')
              : ((r[col] as string) ?? '');
      s.add(v);
    });
    return Array.from(s).sort();
  }, [rows, col]);
  const active    = colFilters[col];
  const hasFilter = active && active.size > 0;
  const toggle    = (val: string) => setColFilters(prev => {
    const cur = new Set(prev[col] ?? []);
    cur.has(val) ? cur.delete(val) : cur.add(val);
    return { ...prev, [col]: cur };
  });
  const clear = () => setColFilters(prev => { const n = { ...prev }; delete n[col]; return n; });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button title={`Filtrer ${label}`}
          className={`shrink-0 h-4 w-4 flex items-center justify-center rounded transition-colors
            ${hasFilter ? 'bg-orange-400 text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}>
          <Filter size={9} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-0 z-[9999]" align="start" side="bottom" avoidCollisions>
        <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
          {hasFilter && <button onClick={clear} className="text-[9px] text-orange-600 hover:underline">Effacer</button>}
        </div>
        <ScrollArea className="h-[150px]">
          <div className="p-1">
            {vals.map(val => {
              const checked = !active || active.size === 0 || active.has(val);
              return (
                <label key={val} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggle(val)} className="h-3 w-3 accent-blue-600" />
                  <span className="text-xs truncate flex-1">{val || <span className="italic text-muted-foreground">(vide)</span>}</span>
                </label>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ── Mini calendrier popup ─────────────────────────────────────────────────────
interface MiniCalProps {
  viewMonth: Date; selectedDay: Date; activeDays: Set<string>;
  onSelectDay: (d: Date) => void; onPrevMonth: () => void; onNextMonth: () => void;
}
function MiniCal({ viewMonth, selectedDay, activeDays, onSelectDay, onPrevMonth, onNextMonth }: MiniCalProps) {
  const days = useMemo(() => {
    const start  = startOfMonth(viewMonth);
    const end    = endOfMonth(viewMonth);
    const all    = eachDayOfInterval({ start, end });
    const blanks: null[] = Array((getDay(start) + 6) % 7).fill(null);
    return [...blanks, ...all];
  }, [viewMonth]);
  const dowLabels = ['L','M','M','J','V','S','D'];
  const today = new Date();
  return (
    <div className="select-none p-3" style={{ minWidth: 248 }}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrevMonth} className="neu-flat w-7 h-7 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-bold capitalize">{format(viewMonth, 'MMMM yyyy', { locale: fr })}</span>
        <button onClick={onNextMonth} className="neu-flat w-7 h-7 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {dowLabels.map((d, i) => <div key={i} className="text-center text-[10px] font-bold text-muted-foreground py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d, i) => {
          if (!d) return <div key={`b-${i}`} />;
          const key    = dateKey(d);
          const isSel  = isSameDay(d, selectedDay);
          const isT    = isToday(d);
          const isFut  = d > today;
          const inMo   = isSameMonth(d, viewMonth);
          const hasData = activeDays.has(key);
          return (
            <button key={key} disabled={isFut} onClick={() => onSelectDay(d)}
              className={`relative flex flex-col items-center justify-center rounded-lg transition-all py-0.5
                ${isFut ? 'opacity-25 cursor-default' : 'cursor-pointer'}
                ${isSel ? 'neu-pressed text-primary font-bold' : inMo ? 'hover:bg-accent hover:text-accent-foreground' : 'opacity-40'}
                ${isT && !isSel ? 'ring-1 ring-primary' : ''}`}
              style={{ minHeight: 32 }}>
              <span className="text-[11px] leading-tight">{format(d, 'd')}</span>
              {hasData && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSel ? 'bg-primary' : 'bg-green-500'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function SupervisorGrossAddPage() {
  const [selectedDay, setSelectedDay]     = useState(() => new Date());
  const [viewMonth, setViewMonth]         = useState(() => new Date());
  const [rows, setRows]                   = useState<any[]>([]);
  const [loading, setLoading]             = useState(false);
  const [procOptions, setProcOptions]     = useState<ProcessingOption[]>([]);
  const [search, setSearch]               = useState('');
  const [colFilters, setColFilters]       = useState<Record<string, Set<string>>>({});
  const [activeDays, setActiveDays]       = useState<Set<string>>(new Set());

  // Personnalisation police / taille
  const [fontFamily, setFontFamily]       = useState(TABLE_FONT_DEFAULT);
  const [fontSize, setFontSize]           = useState(TABLE_SIZE_DEFAULT);

  // ── Chargement ─────────────────────────────────────────────────────────────
  const loadDay = useCallback(async (day: Date) => {
    setLoading(true);
    try {
      const [details, opts] = await Promise.all([
        getAllAgentsProcessingDetailsByDate(day),
        getProcessingOptions(),
      ]);
      setRows(details);
      setProcOptions(opts);
      // Marquer ce jour comme actif si des données existent
      if (details.length > 0) {
        setActiveDays(prev => new Set([...prev, dateKey(day)]));
      }
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDay(selectedDay); }, [selectedDay]); // eslint-disable-line

  // ── Realtime : recharge à chaque INSERT/UPDATE dans processing_details ──
  useEffect(() => {
    const channel = supabase
      .channel('gross-add-processing-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processing_details' },
        () => { loadDay(selectedDay); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDay, loadDay]);

  // ── Tri par agent ───────────────────────────────────────────────────────────
  const sortedRows = useMemo(() =>
    [...rows].sort((a, b) => {
      const na = (a.request?.agent?.username ?? '').toLowerCase();
      const nb = (b.request?.agent?.username ?? '').toLowerCase();
      return na.localeCompare(nb, 'fr');
    }),
  [rows]);

  // ── Filtres ─────────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let r = sortedRows;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(d => {
      const agent = d.request?.agent?.username ?? '';
      const phone = d.request?.phone_to_certify ?? '';
      const coach = d.request?.applicant?.username ?? '';
      return agent.toLowerCase().includes(q) || phone.toLowerCase().includes(q) ||
        coach.toLowerCase().includes(q) ||
        Object.values(d).some(v => typeof v === 'string' && v.toLowerCase().includes(q));
    });
    Object.entries(colFilters).forEach(([col, vals]) => {
      if (!vals || vals.size === 0) return;
      r = r.filter(d => {
        const v = col === 'phone' ? (d.request?.phone_to_certify ?? '')
                : col === 'agent' ? (d.request?.agent?.username ?? '')
                : col === 'coach' ? (d.request?.applicant?.username ?? '')
                : ((d[col] as string) ?? '');
        return vals.has(v);
      });
    });
    return r;
  }, [sortedRows, search, colFilters]);

  const activeFilterCount = Object.values(colFilters).filter(s => s && s.size > 0).length;

  const selLabel = isToday(selectedDay)
    ? "Aujourd'hui"
    : format(selectedDay, 'EEEE d MMMM yyyy', { locale: fr });

  // ── Export Excel ────────────────────────────────────────────────────────────
  const exportExcel = () => {
    if (filteredRows.length === 0) { toast.error('Aucune donnée à exporter'); return; }
    const headers = ['#', 'AGENT', 'NUMÉRO', 'COACH', 'DATE/HEURE', ...DETAIL_COLS.map(c => c.label)];
    const data = filteredRows.map((d, i) => [
      i + 1,
      d.request?.agent?.username ?? '—',
      d.request?.phone_to_certify ?? '—',
      d.request?.applicant?.username ?? '—',
      fmtDate(d.created_at),
      ...DETAIL_COLS.map(c => (d[c.key] as string) ?? ''),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    // Style largeurs colonnes
    ws['!cols'] = [{ wch: 4 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
      ...DETAIL_COLS.map(() => ({ wch: 18 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gross Add GSM');
    XLSX.writeFile(wb, `gross-add-gsm_${dateKey(selectedDay)}.xlsx`);
    toast.success('Fichier Excel exporté');
  };

  // ── Regroupement par agent (pour comptage) ──────────────────────────────────
  const agentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    filteredRows.forEach(d => {
      const name = d.request?.agent?.username ?? '—';
      map[name] = (map[name] ?? 0) + 1;
    });
    return map;
  }, [filteredRows]);

  const tableStyle: React.CSSProperties = {
    fontFamily,
    fontSize,
    borderCollapse: 'collapse',
    minWidth: 1200,
    width: '100%',
  };

  return (
    <MainLayout hideSidebar>
      <div className="space-y-4 px-2 md:px-0">

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div className="neu-card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="neu-pressed w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <ClipboardList size={20} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground">GROSS ADD GSM</h1>
              <p className="text-xs text-muted-foreground capitalize truncate">{selLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <span className="neu-flat text-[11px] font-bold text-primary px-2 py-1 rounded-lg">
              {filteredRows.length} traitement{filteredRows.length !== 1 ? 's' : ''}
            </span>
            <span className="neu-flat text-[11px] font-bold text-purple-600 px-2 py-1 rounded-lg">
              {Object.keys(agentCounts).length} agent{Object.keys(agentCounts).length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Barre d'outils ──────────────────────────────────────────────── */}
        <div className="neu-card flex flex-wrap items-center gap-2">
          {/* Recherche */}
          <div className="relative flex-1 min-w-0" style={{ minWidth: 180 }}>
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher agent, numéro, coach…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>

          {/* Police + Taille */}
          <TableFontControls
            fontFamily={fontFamily} setFontFamily={setFontFamily}
            fontSize={fontSize} setFontSize={setFontSize}
            variant="light"
          />

          {/* Calendrier */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="shrink-0 flex items-center gap-1.5 neu-flat px-2.5 py-1.5 rounded-xl text-xs font-medium hover:text-primary transition-colors">
                <CalendarDays size={14} className="text-primary" />
                <span className="hidden md:inline">Calendrier</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[9999] shadow-2xl" align="end" side="bottom" avoidCollisions>
              <MiniCal
                viewMonth={viewMonth} selectedDay={selectedDay} activeDays={activeDays}
                onSelectDay={d => { setSelectedDay(d); setSearch(''); setColFilters({}); }}
                onPrevMonth={() => setViewMonth(m => subMonths(m, 1))}
                onNextMonth={() => setViewMonth(m => addMonths(m, 1))}
              />
            </PopoverContent>
          </Popover>

          {/* Filtres actifs */}
          {activeFilterCount > 0 && (
            <button onClick={() => setColFilters({})}
              className="shrink-0 flex items-center gap-1 text-[11px] text-orange-600 neu-flat px-2 py-1.5 rounded-xl">
              <SlidersHorizontal size={12} />{activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''} <X size={10} />
            </button>
          )}

          {/* Export Excel */}
          <button onClick={exportExcel}
            className="shrink-0 flex items-center gap-1.5 neu-flat px-2.5 py-1.5 rounded-xl text-xs font-semibold text-green-700 hover:text-green-800 transition-colors">
            <Download size={14} />
            <span className="hidden md:inline">Extraire Excel</span>
          </button>
        </div>

        {/* ── Tableau ─────────────────────────────────────────────────────── */}
        <div className="neu-card">
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => (
              <div key={i} className="neu-pressed h-9 rounded-xl animate-pulse" />
            ))}</div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground text-sm">
              <ClipboardList size={34} className="mx-auto mb-3 opacity-20" />
              <p>{search || activeFilterCount > 0
                ? 'Aucun résultat pour ces filtres.'
                : `Aucun traitement le ${format(selectedDay, 'd MMMM yyyy', { locale: fr })}.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table style={tableStyle}>
                <thead>
                  {/* Bandeau jaune — avec boutons Police et Taille */}
                  <tr>
                    <th colSpan={4} style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '3px 6px', textAlign: 'center', border: '1px solid #000' }}>
                      GSM
                    </th>
                    <th style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '3px 6px', textAlign: 'center', border: '1px solid #000' }}>DATE</th>
                    <th colSpan={DETAIL_COLS.length} style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '3px 6px', textAlign: 'center', border: '1px solid #000' }}>
                      CENTRE D'IDENTIFICATION
                    </th>
                  </tr>
                  {/* En-têtes bleus */}
                  <tr>
                    <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', width: 32, textAlign: 'center' }}>#</th>
                    <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 120 }}>
                      <div className="flex items-center gap-1">
                        AGENT
                        <ColFilter col="agent" label="AGENT" rows={rows} colFilters={colFilters} setColFilters={setColFilters} />
                      </div>
                    </th>
                    <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 120 }}>
                      <div className="flex items-center gap-1">
                        NUMÉRO
                        <ColFilter col="phone" label="NUMÉRO" rows={rows} colFilters={colFilters} setColFilters={setColFilters} />
                      </div>
                    </th>
                    <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 100 }}>
                      <div className="flex items-center gap-1">
                        COACH
                        <ColFilter col="coach" label="COACH" rows={rows} colFilters={colFilters} setColFilters={setColFilters} />
                      </div>
                    </th>
                    <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 130, whiteSpace: 'nowrap' }}>DATE/HEURE</th>
                    {DETAIL_COLS.map(c => (
                      <th key={c.key} style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: c.w, maxWidth: c.w, width: c.w }}>
                        <div className="flex items-center gap-1">
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                          <ColFilter col={c.key as string} label={c.label} rows={rows} colFilters={colFilters} setColFilters={setColFilters} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((d, i) => {
                    // Séparateur visuel entre agents
                    const prevAgent = i > 0 ? (filteredRows[i - 1].request?.agent?.username ?? '') : null;
                    const curAgent  = d.request?.agent?.username ?? '—';
                    const isNewAgent = curAgent !== prevAgent;
                    return (
                      <React.Fragment key={d.request_id ?? i}>
                        {/* Ligne de groupe agent */}
                        {isNewAgent && (
                          <tr>
                            <td colSpan={5 + DETAIL_COLS.length}
                              style={{ backgroundColor: '#D9E1F2', color: '#1F3864', fontWeight: 700, padding: '2px 8px', border: '1px solid #000', fontSize: fontSize + 1 }}>
                              👤 {curAgent} — {agentCounts[curAgent]} traitement{agentCounts[curAgent] !== 1 ? 's' : ''}
                            </td>
                          </tr>
                        )}
                        <tr style={{ backgroundColor: d.row_color || '#ffffff', color: '#000' }}>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', fontWeight: 600, whiteSpace: 'nowrap' }}>{curAgent}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {d.request?.phone_to_certify ?? '—'}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', whiteSpace: 'nowrap' }}>{d.request?.applicant?.username ?? '—'}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', whiteSpace: 'nowrap' }}>{fmtDate(d.created_at)}</td>
                          {DETAIL_COLS.map(c => (
                            <td key={c.key} style={{ border: '1px solid #000', padding: '2px 5px', maxWidth: c.w, minWidth: c.w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={(d[c.key] as string) ?? ''}>
                              {(d[c.key] as string) || '—'}
                            </td>
                          ))}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
                {/* Pied de tableau — totaux par agent */}
                <tfoot>
                  <tr>
                    <td colSpan={5 + DETAIL_COLS.length}
                      style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '4px 8px', border: '1px solid #000', textAlign: 'right' }}>
                      TOTAL GÉNÉRAL : {filteredRows.length} traitement{filteredRows.length !== 1 ? 's' : ''} —{' '}
                      {Object.entries(agentCounts).sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([name, count]) => `${name}: ${count}`).join(' | ')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>
    </MainLayout>
  );
}
