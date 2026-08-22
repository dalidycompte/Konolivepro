import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getAllRequests, getAgentRecentProcessingDetails } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { VerificationRequest } from '@/types/types';
import type { ProcessingDetails } from '@/types/index';
import TableFontControls, { TABLE_FONT_DEFAULT, TABLE_SIZE_DEFAULT } from '@/components/common/TableFontControls';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  History, CheckCircle2, XCircle, Minus,
  ChevronLeft, ChevronRight, CalendarDays, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval,
         getDay, isSameDay, isSameMonth, addMonths, subMonths,
         parseISO, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';

function getDateKey(date: Date): string { return format(date, 'yyyy-MM-dd'); }
function requestDate(r: VerificationRequest): Date | null {
  const raw = r.processed_at ?? r.updated_at;
  if (!raw) return null;
  try { return parseISO(raw); } catch { return null; }
}

// ── Inline filter dropdown (same pattern as ProcessRequestPage) ───────────────
interface FDProps {
  col: string; rows: ProcessingDetails[];
  colFilters: Record<string, Set<string>>; filterOpen: string | null;
  setFilterOpen: (v: string|null) => void;
  toggleFilter: (col: string, val: string) => void;
  clearFilter: (col: string) => void;
}
function FD({ col, rows, colFilters, filterOpen, setFilterOpen, toggleFilter, clearFilter }: FDProps) {
  const vals = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const v = (r[col as keyof ProcessingDetails] as string) ?? ''; s.add(v); });
    return Array.from(s).sort();
  }, [rows, col]);
  const active = colFilters[col];
  const hasFilter = active && active.size > 0;
  const isOpen = filterOpen === col;
  return (
    <Popover open={isOpen} onOpenChange={o => setFilterOpen(o ? col : null)}>
      <PopoverTrigger asChild>
        <button onClick={e => { e.stopPropagation(); setFilterOpen(isOpen ? null : col); }}
          className={`shrink-0 h-4 w-4 flex items-center justify-center rounded text-[9px] transition-colors ${hasFilter ? 'bg-orange-400 text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}>▼</button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-0 z-[9999]" align="start" side="bottom" avoidCollisions>
        <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">{col.replace(/_/g,' ')}</span>
          {hasFilter && <button onClick={() => clearFilter(col)} className="text-[9px] text-orange-600 hover:underline">Effacer</button>}
        </div>
        <ScrollArea className="h-[160px]">
          <div className="p-1">
            {vals.map(val => {
              const checked = !active || active.size === 0 || active.has(val);
              return (
                <label key={val} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggleFilter(col, val)} className="h-3 w-3 accent-blue-600" />
                  <span className="text-xs truncate flex-1">{val || <span className="italic text-gray-400">(vide)</span>}</span>
                </label>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

const DETAIL_COLS: Array<{ key: keyof ProcessingDetails; label: string; w: string }> = [
  { key: 'constat_webcare',       label: 'CONSTAT WEBCARE',    w: '130px' },
  { key: 'type_de_piece',         label: 'TYPE PIÈCE',         w: '80px'  },
  { key: 'verbatim',              label: 'VERBATIM',           w: '130px' },
  { key: 'action_prise_gsm',      label: 'ACTION GSM',         w: '130px' },
  { key: 'statut_final_gsm',      label: 'STATUT GSM',         w: '110px' },
  { key: 'traitement',            label: 'TRAITEMENT',         w: '110px' },
  { key: 'type_d_identification', label: 'TYPE IDENTIFICATION', w: '140px' },
  { key: 'raison_du_retard',      label: 'RAISON RETARD',      w: '90px'  },
];

export default function AgentHistoryPage() {
  const { profile } = useAuth();
  const [requests, setRequests]           = useState<VerificationRequest[]>([]);
  const [detailsByReqId, setDetailsByReqId] = useState<Record<string, ProcessingDetails>>({});
  const [loading, setLoading]             = useState(true);
  const [viewMonth, setViewMonth]         = useState(() => new Date());
  const [selectedDay, setSelectedDay]     = useState<Date>(() => new Date());
  const [showCalendar, setShowCalendar]   = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [colFilters, setColFilters]       = useState<Record<string, Set<string>>>({});
  const [filterOpen, setFilterOpen]       = useState<string | null>(null);
  const [fontFamily, setFontFamily]       = useState(TABLE_FONT_DEFAULT);
  const [fontSize, setFontSize]           = useState(TABLE_SIZE_DEFAULT);

  const load = useCallback(async () => {
    if (!profile) return;
    const data = await getAllRequests(500);
    const filtered = data.filter(r =>
      r.agent_id === profile.id &&
      ['accepted','rejected','unchanged'].includes(r.status)
    );
    setRequests(filtered);

    // Load processing details for today's requests only (performance)
    try {
      const details = await getAgentRecentProcessingDetails(profile.id, 800000);
      const map: Record<string, ProcessingDetails> = {};
      details.forEach((d: any) => { if (d.request_id) map[d.request_id] = d; });
      setDetailsByReqId(map);
    } catch (e) { console.error(e); }

    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    accepted:  requests.filter(r => r.status === 'accepted').length,
    rejected:  requests.filter(r => r.status === 'rejected').length,
    unchanged: requests.filter(r => r.status === 'unchanged').length,
  }), [requests]);

  const byDay = useMemo(() => {
    const map = new Map<string, VerificationRequest[]>();
    for (const r of requests) {
      const d = requestDate(r);
      if (!d) continue;
      const k = getDateKey(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }, [requests]);

  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(viewMonth);
    const lastDay  = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startPad = (getDay(firstDay) + 6) % 7;
    return { days, startPad };
  }, [viewMonth]);

  const displayedRequests = useMemo(() => byDay.get(getDateKey(selectedDay)) ?? [], [byDay, selectedDay]);

  // All detail rows for the selected day (for filter dropdown options)
  const allDetailRows = useMemo(() =>
    displayedRequests.map(r => detailsByReqId[r.id]).filter(Boolean) as ProcessingDetails[],
  [displayedRequests, detailsByReqId]);

  function toggleFilter(col: string, val: string) {
    setColFilters(prev => {
      const n = { ...prev };
      const s = new Set(n[col] ?? []);
      if (s.has(val)) s.delete(val); else s.add(val);
      n[col] = s;
      return n;
    });
  }
  function clearFilter(col: string) { setColFilters(p => { const n = {...p}; delete n[col]; return n; }); }

  function dotColor(count: number) {
    if (count === 0) return '';
    if (count <= 2)  return 'bg-primary/30';
    if (count <= 5)  return 'bg-primary/60';
    return 'bg-primary';
  }

  const DAY_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* En-tête */}
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Mon historique</h1>
          <p className="text-muted-foreground text-sm mt-1">Toutes les demandes que vous avez traitées.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Acceptées',  value: stats.accepted,  icon: <CheckCircle2 size={20} className="text-green-600" />,  color: 'text-green-600' },
            { label: 'Rejetées',   value: stats.rejected,  icon: <XCircle      size={20} className="text-red-500" />,    color: 'text-red-500'   },
            { label: 'Inchangées', value: stats.unchanged, icon: <Minus        size={20} className="text-gray-500" />,   color: 'text-gray-500'  },
          ].map(s => (
            <div key={s.label} className="stat-card h-full p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className="neu-flat w-8 h-8 rounded-xl flex items-center justify-center shrink-0">{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tableau principal */}
        <div className="neu-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2 flex-1 min-w-0">
              <History size={18} className="text-primary shrink-0" />
              <span className="truncate">Demandes du {format(selectedDay, 'd MMMM yyyy', { locale: fr })}</span>
              <span className="neu-flat text-xs font-bold text-primary px-2 py-0.5 rounded-full shrink-0">{displayedRequests.length}</span>
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <TableFontControls
                fontFamily={fontFamily} setFontFamily={setFontFamily}
                fontSize={fontSize} setFontSize={setFontSize}
                variant="light"
              />
              <button onClick={() => setShowCalendar(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${showCalendar ? 'neu-pressed text-primary' : 'neu-flat text-muted-foreground hover:text-primary'}`}>
                <CalendarDays size={15} />
                <span className="hidden md:inline">Calendrier</span>
                {showCalendar ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>

          {/* Calendrier accordéon */}
          {showCalendar && (
            <div className="mb-5 pb-5 border-b border-border/50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold capitalize">{format(viewMonth, 'MMMM yyyy', { locale: fr })}</span>
                <div className="flex gap-1">
                  <button onClick={() => setViewMonth(m => subMonths(m, 1))} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary"><ChevronLeft size={16} /></button>
                  <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary"><ChevronRight size={16} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-2">{DAY_LABELS.map(d => <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: calendarDays.startPad }).map((_, i) => <div key={`p${i}`} />)}
                {calendarDays.days.map(day => {
                  const key = getDateKey(day);
                  const count = byDay.get(key)?.length ?? 0;
                  const isSelected = isSameDay(day, selectedDay);
                  const isCurrent  = isToday(day);
                  return (
                    <button key={key} onClick={() => { setSelectedDay(day); setShowCalendar(false); }}
                      className={`relative flex flex-col items-center justify-center rounded-xl p-1.5 min-h-[52px] transition-all ${isSameMonth(day, viewMonth) ? '' : 'opacity-30'} ${isSelected ? 'neu-pressed ring-2 ring-primary text-primary' : 'neu-flat hover:neu-pressed'}`}>
                      <span className={`text-xs font-semibold ${isCurrent && !isSelected ? 'text-primary' : 'text-foreground'}`}>{format(day,'d')}</span>
                      {count > 0 && <span className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-primary text-white' : `${dotColor(count)} text-primary`}`}>{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Liste des demandes du jour avec détails */}
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="neu-pressed h-14 rounded-xl animate-pulse" />)}</div>
          ) : displayedRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <History size={32} className="mx-auto mb-2 opacity-30" />
              <p>Aucune demande traitée le {format(selectedDay, 'd MMMM', { locale: fr })}.</p>
              <button onClick={() => setShowCalendar(true)} className="mt-3 text-xs text-primary hover:underline flex items-center gap-1 mx-auto"><CalendarDays size={13} />Changer de date</button>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedRequests.map(r => {
                const d = requestDate(r);
                const det = detailsByReqId[r.id];
                const isExpanded = expandedId === r.id;
                const rowBg = det?.row_color || '#ffffff';

                return (
                  <div key={r.id} className="rounded-xl border border-border/60 overflow-hidden">
                    {/* Summary row */}
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                      <div style={{ backgroundColor: rowBg }} className="w-3 h-3 rounded-full border border-gray-300 shrink-0" title="Couleur de ligne" />
                      <span className="text-sm font-medium flex-1 min-w-0 truncate">{r.phone_to_certify}</span>
                      <span className="text-xs text-muted-foreground shrink-0 hidden md:block">{r.applicant?.username ?? '—'}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{d ? format(d, 'd MMM HH:mm', { locale: fr }) : '—'}</span>
                      <StatusBadge status={r.status} />
                      <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Detail sub-table */}
                    {isExpanded && (
                      <div className="border-t border-border/60 bg-white">
                        {det ? (
                          <div className="overflow-x-auto">
                            {/* Filter banner */}
                            <div style={{ backgroundColor: '#FFC000' }} className="flex items-center gap-2 px-3 py-1">
                              <span className="text-[10px] font-bold text-black uppercase">Détails du traitement</span>
                              {Object.values(colFilters).some(s => s.size > 0) && (
                                <button onClick={() => setColFilters({})} className="ml-auto text-[9px] bg-orange-100 text-orange-700 border border-orange-300 rounded px-1.5 py-0.5 hover:bg-orange-200">✕ Effacer filtres</button>
                              )}
                            </div>
                            <Table style={{ borderCollapse: 'collapse', fontFamily, fontSize }}>
                              <TableHeader>
                                <TableRow>
                                  {DETAIL_COLS.map(c => (
                                    <TableHead key={c.key} style={{ backgroundColor: '#4472C4', color: '#fff', width: c.w, minWidth: c.w, maxWidth: c.w }} className="whitespace-nowrap px-2 h-7 text-[10px] font-bold border-r border-white/30">
                                      <div className="flex items-center gap-1">
                                        <span>{c.label}</span>
                                        <FD col={c.key as string} rows={allDetailRows} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                                      </div>
                                    </TableHead>
                                  ))}
                                  <TableHead style={{ backgroundColor: '#4472C4', color: '#fff', minWidth: '130px' }} className="whitespace-nowrap px-2 h-7 text-[10px] font-bold">CAPTURE D'ÉCRAN</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <TableRow style={{ backgroundColor: rowBg }}>
                                  {DETAIL_COLS.map(c => (
                                    <TableCell key={c.key} style={{ width: c.w, minWidth: c.w, maxWidth: c.w, backgroundColor: rowBg, overflow: 'hidden' }} className="px-2 py-1.5 text-xs border-r border-black/20">
                                      <span className="block truncate" title={det[c.key] as string || ''}>{det[c.key] as string || <span className="text-gray-400">—</span>}</span>
                                    </TableCell>
                                  ))}
                                  <TableCell style={{ minWidth: '130px', backgroundColor: rowBg }} className="px-2 py-1.5">
                                    {det.screenshot_urls && det.screenshot_urls.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {det.screenshot_urls.map((url, i) => (
                                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                            <img src={url} alt={`cap ${i+1}`} className="h-10 w-10 object-cover rounded border border-black/20 cursor-zoom-in" />
                                          </a>
                                        ))}
                                      </div>
                                    ) : <span className="text-gray-400 text-[10px]">—</span>}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-4">Aucun détail enregistré pour cette demande.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

