import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  getAllRequests, getAgentProcessingDetailsByDate,
  getAgentDailyTreatmentCounts, saveProcessingDetails, getProcessingOptions,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { ProcessingDetails, ProcessingOption } from '@/types/index';
import type { VerificationRequest } from '@/types/types';
import TableFontControls, { TABLE_FONT_DEFAULT, TABLE_SIZE_DEFAULT } from '@/components/common/TableFontControls';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Smartphone, Search, ClipboardList, ChevronLeft, ChevronRight,
  Image as ImageIcon, Pencil, X, Check, Filter, SlidersHorizontal, CalendarDays,
} from 'lucide-react';
import {
  format, parseISO, isToday, isSameDay, isSameMonth,
  addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

// ── Colonnes de détails ───────────────────────────────────────────────────────
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

// ── Filtre par colonne ────────────────────────────────────────────────────────
interface ColFilterProps {
  col: string; label: string; rows: any[];
  colFilters: Record<string, Set<string>>;
  setColFilters: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
}
function ColFilter({ col, label, rows, colFilters, setColFilters }: ColFilterProps) {
  const vals = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => {
      const v = col === 'phone' ? (r.request?.phone_to_certify ?? '')
              : col === 'coach' ? (r.request?.applicant?.username ?? '')
              : ((r[col] as string) ?? '');
      s.add(v);
    });
    return Array.from(s).sort();
  }, [rows, col]);
  const active = colFilters[col];
  const hasFilter = active && active.size > 0;
  const toggle = (val: string) => setColFilters(prev => {
    const cur = new Set(prev[col] ?? []);
    if (cur.has(val)) cur.delete(val); else cur.add(val);
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

// ── Calendrier popup ──────────────────────────────────────────────────────────
interface MiniCalProps {
  viewMonth: Date; selectedDay: Date; dayCounts: Record<string, number>;
  onSelectDay: (d: Date) => void; onPrevMonth: () => void; onNextMonth: () => void;
}
function MiniCal({ viewMonth, selectedDay, dayCounts, onSelectDay, onPrevMonth, onNextMonth }: MiniCalProps) {
  const days = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end   = endOfMonth(viewMonth);
    const all   = eachDayOfInterval({ start, end });
    const blanks: null[] = Array((getDay(start) + 6) % 7).fill(null);
    return [...blanks, ...all];
  }, [viewMonth]);
  const dowLabels = ['L','M','M','J','V','S','D'];
  const today = new Date();
  return (
    <div className="select-none p-3" style={{ minWidth: 248 }}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrevMonth}
          className="neu-flat w-7 h-7 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-bold text-foreground capitalize">
          {format(viewMonth, 'MMMM yyyy', { locale: fr })}
        </span>
        <button onClick={onNextMonth}
          className="neu-flat w-7 h-7 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {dowLabels.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-muted-foreground py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d, i) => {
          if (!d) return <div key={`b-${i}`} />;
          const key   = dateKey(d);
          const count = dayCounts[key] ?? 0;
          const isSel = isSameDay(d, selectedDay);
          const isT   = isToday(d);
          const isFut = d > today;
          const inMo  = isSameMonth(d, viewMonth);
          return (
            <button key={key} disabled={isFut} onClick={() => onSelectDay(d)}
              className={`relative flex flex-col items-center justify-center rounded-lg transition-all py-0.5
                ${isFut ? 'opacity-25 cursor-default' : 'cursor-pointer'}
                ${isSel ? 'neu-pressed text-primary font-bold' : inMo ? 'hover:bg-accent hover:text-accent-foreground' : 'opacity-40'}
                ${isT && !isSel ? 'ring-1 ring-primary' : ''}`}
              style={{ minHeight: 32 }}>
              <span className="text-[11px] leading-tight">{format(d, 'd')}</span>
              {count > 0 && <span className={`text-[8px] font-bold ${isSel ? 'text-primary' : 'text-green-600'}`}>{count}</span>}
              {count > 0 && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSel ? 'bg-primary' : 'bg-green-500'}`} />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/40">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Jours travaillés
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full ring-1 ring-primary inline-block" />Aujourd'hui
        </span>
      </div>
    </div>
  );
}

// ── Cellule éditable avec options prédéfinies + saisie libre ─────────────────
interface EditableCellProps {
  reqId: string; colKey: keyof ProcessingDetails; val: string; options: string[];
  onSave: (reqId: string, col: keyof ProcessingDetails, val: string) => Promise<void>;
}
function EditableCell({ reqId, colKey, val, options, onSave }: EditableCellProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(val);
  const [busy, setBusy] = useState(false);

  const commit = async (v: string) => {
    setBusy(true);
    try { await onSave(reqId, colKey, v); setOpen(false); }
    finally { setBusy(false); }
  };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o) setText(val); }}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-1 group cursor-pointer min-w-0">
          <span className="flex-1 min-w-0 truncate" title={val}>{val || '—'}</span>
          <Pencil size={9} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[210px] p-0 z-[9999]" align="start" side="bottom" avoidCollisions>
        {/* Saisie libre */}
        <div className="p-2 border-b border-border">
          <div className="flex items-center gap-1">
            <input autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(text); if (e.key === 'Escape') setOpen(false); }}
              placeholder="Saisie libre…"
              className="flex-1 min-w-0 border border-border rounded px-1.5 text-[11px] h-6 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={() => commit(text)} disabled={busy}
              className="shrink-0 w-5 h-5 flex items-center justify-center bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
              <Check size={9} />
            </button>
            <button onClick={() => setOpen(false)}
              className="shrink-0 w-5 h-5 flex items-center justify-center bg-red-400 text-white rounded hover:bg-red-500">
              <X size={9} />
            </button>
          </div>
        </div>
        {/* Options prédéfinies */}
        {options.length > 0 && (
          <ScrollArea className="h-[140px]">
            <div className="p-1">
              {options.map(opt => (
                <button key={opt} onClick={() => commit(opt)}
                  className={`w-full text-left text-[11px] px-2 py-1.5 rounded hover:bg-accent transition-colors
                    ${val === opt ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}>
                  {opt}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function AgentMyGSMPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [allRequests, setAllRequests] = useState<VerificationRequest[]>([]);
  const [dayCounts, setDayCounts]     = useState<Record<string, number>>({});
  const [loadingBase, setLoadingBase] = useState(true);
  const [viewMonth, setViewMonth]     = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [dayDetails, setDayDetails]   = useState<any[]>([]);
  const [loadingDay, setLoadingDay]   = useState(false);
  const [detailSearch, setDetailSearch] = useState('');
  const [colFilters, setColFilters]   = useState<Record<string, Set<string>>>({});
  const [procOptions, setProcOptions] = useState<ProcessingOption[]>([]);
  const [lightbox, setLightbox]       = useState<string | null>(null);
  const [fontFamily, setFontFamily]   = useState(TABLE_FONT_DEFAULT);
  const [fontSize, setFontSize]       = useState(TABLE_SIZE_DEFAULT);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadForRef = useRef<string | null>(null);

  // ── Chargement initial ──────────────────────────────────────────────────────
  const loadBase = useCallback(async () => {
    if (!profile) return;
    setLoadingBase(true);
    try {
      const [reqs, counts, opts] = await Promise.all([
        getAllRequests(5000),
        getAgentDailyTreatmentCounts(profile.id, 90),
        getProcessingOptions(),
      ]);
      setAllRequests(reqs.filter(r =>
        r.agent_id === profile.id &&
        ['accepted', 'rejected', 'unchanged'].includes(r.status)
      ));
      setDayCounts(counts);
      setProcOptions(opts);
    } finally { setLoadingBase(false); }
  }, [profile]);

  useEffect(() => { loadBase(); }, [loadBase]);

  // ── Chargement du jour ─────────────────────────────────────────────────────
  const loadDay = useCallback(async (day: Date) => {
    if (!profile) return;
    setLoadingDay(true);
    try {
      const details = await getAgentProcessingDetailsByDate(profile.id, day);
      setDayDetails(details);
    } finally { setLoadingDay(false); }
  }, [profile]);

  useEffect(() => { if (!loadingBase) loadDay(selectedDay); }, [selectedDay, loadingBase]); // eslint-disable-line

  // ── Realtime : recharge le jour courant à chaque INSERT/UPDATE dans processing_details ──
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('gsm-processing-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processing_details' },
        () => { loadDay(selectedDay); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, selectedDay, loadDay]);

  const handleSelectDay = (d: Date) => {
    setSelectedDay(d);
    setDetailSearch('');
    setColFilters({});
  };

  // Options par colonne
  const optionsFor = useCallback((col: string) =>
    procOptions.filter(o => o.column_name === col).map(o => o.option_value),
  [procOptions]);

  // ── Filtres détails ─────────────────────────────────────────────────────────
  const filteredDetails = useMemo(() => {
    let rows = dayDetails;
    const q = detailSearch.trim().toLowerCase();
    if (q) rows = rows.filter(d => {
      const phone = d.request?.phone_to_certify ?? '';
      const coach = d.request?.applicant?.username ?? '';
      return phone.toLowerCase().includes(q) || coach.toLowerCase().includes(q) ||
        Object.values(d).some(v => typeof v === 'string' && v.toLowerCase().includes(q));
    });
    Object.entries(colFilters).forEach(([col, vals]) => {
      if (!vals || vals.size === 0) return;
      rows = rows.filter(d => {
        const v = col === 'phone' ? (d.request?.phone_to_certify ?? '')
                : col === 'coach' ? (d.request?.applicant?.username ?? '')
                : ((d[col] as string) ?? '');
        return vals.has(v);
      });
    });
    return rows;
  }, [dayDetails, detailSearch, colFilters]);

  const activeFilterCount = Object.values(colFilters).filter(s => s && s.size > 0).length;

  // ── Sauvegarde cellule ──────────────────────────────────────────────────────
  const handleCellSave = async (reqId: string, col: keyof ProcessingDetails, newVal: string) => {
    try {
      await saveProcessingDetails({ request_id: reqId, [col]: newVal } as ProcessingDetails);
      setDayDetails(prev => prev.map(d => d.request_id === reqId ? { ...d, [col]: newVal } : d));
      toast.success('Cellule mise à jour');
    } catch { toast.error('Erreur de mise à jour'); }
  };

  // ── Upload capture ─────────────────────────────────────────────────────────
  const triggerUpload = (reqId: string) => { uploadForRef.current = reqId; fileInputRef.current?.click(); };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file  = e.target.files?.[0];
    const reqId = uploadForRef.current;
    if (!file || !reqId || !profile) return;
    e.target.value = '';
    try {
      const path = `${profile.id}/${reqId}/${Date.now()}_${file.name}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('processing-screenshots').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('processing-screenshots').getPublicUrl(upData.path);
      const urls = [...(dayDetails.find(d => d.request_id === reqId)?.screenshot_urls ?? []), urlData.publicUrl];
      await saveProcessingDetails({ request_id: reqId, screenshot_urls: urls } as ProcessingDetails);
      setDayDetails(prev => prev.map(d => d.request_id === reqId ? { ...d, screenshot_urls: urls } : d));
      toast.success('Capture ajoutée');
    } catch { toast.error("Erreur lors de l'upload"); }
  };

  const selLabel = isToday(selectedDay)
    ? "Aujourd'hui"
    : format(selectedDay, 'EEEE d MMMM yyyy', { locale: fr });
  const selKey = dateKey(selectedDay);

  return (
    <MainLayout hideSidebar>
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[999] bg-black/80 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Capture" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-1.5" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--neu-base)' }}>

        {/* ── Barre de navigation ───────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border" style={{ background: 'var(--neu-base)' }}>
          <button onClick={() => navigate('/agent')}
            className="shrink-0 flex items-center gap-1.5 neu-flat px-3 py-2 rounded-xl text-sm font-medium text-foreground hover:text-primary transition-colors">
            <ChevronLeft size={16} /><span className="hidden md:inline">Retour</span>
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Smartphone size={18} className="text-primary shrink-0" />
            <h1 className="text-sm font-bold text-foreground truncate">Mes GSM</h1>
            <span className="text-xs text-muted-foreground hidden md:block capitalize truncate">— {selLabel}</span>
          </div>

          {/* Stats rapides */}
          <span className="hidden md:inline-flex neu-flat text-[11px] font-bold text-primary px-2 py-1 rounded-lg shrink-0">
            {dayDetails.length} traitement{dayDetails.length !== 1 ? 's' : ''}
          </span>

          {/* Police + Taille */}
          <TableFontControls
            fontFamily={fontFamily} setFontFamily={setFontFamily}
            fontSize={fontSize} setFontSize={setFontSize}
            variant="light"
          />

          {/* Bouton calendrier — Popover en haut à droite */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="shrink-0 flex items-center gap-1.5 neu-flat px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:text-primary transition-colors">
                <CalendarDays size={16} className="text-primary" />
                <span className="hidden md:inline">Calendrier</span>
                {(dayCounts[selKey] ?? 0) > 0 && (
                  <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {dayCounts[selKey]}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[9999] shadow-2xl" align="end" side="bottom" avoidCollisions>
              <MiniCal
                viewMonth={viewMonth} selectedDay={selectedDay} dayCounts={dayCounts}
                onSelectDay={d => { handleSelectDay(d); }}
                onPrevMonth={() => setViewMonth(m => subMonths(m, 1))}
                onNextMonth={() => setViewMonth(m => addMonths(m, 1))}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* ── Sous-barre : date + recherche + filtres ───────────────────────── */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border" style={{ background: 'var(--neu-base)' }}>
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground capitalize">{selLabel}</span>
            {(dayCounts[selKey] ?? 0) > 0 ? (
              <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {dayCounts[selKey]} traitement{dayCounts[selKey] > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">Aucun traitement ce jour</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative" style={{ minWidth: 180 }}>
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher…" value={detailSearch}
                onChange={e => setDetailSearch(e.target.value)} className="pl-8 h-7 text-xs" />
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => setColFilters({})}
                className="flex items-center gap-1 text-[11px] text-orange-600 neu-flat px-2 py-1 rounded-lg shrink-0">
                <SlidersHorizontal size={11} />{activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''} <X size={10} />
              </button>
            )}
            <span className="neu-flat text-[11px] font-bold text-blue-600 px-2 py-1 rounded-lg shrink-0">
              {filteredDetails.length}/{dayDetails.length}
            </span>
          </div>
        </div>

        {/* ── Tableau principal ─────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-auto px-4 pb-6">
          <div className="neu-card mt-3">
            {loadingBase || loadingDay ? (
              <div className="space-y-2">{[1,2,3,4].map(i => (
                <div key={i} className="neu-pressed h-9 rounded-xl animate-pulse" />
              ))}</div>
            ) : filteredDetails.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-20" />
                <p>{detailSearch || activeFilterCount > 0
                  ? 'Aucun résultat pour ces filtres.'
                  : `Aucun détail de traitement le ${format(selectedDay, 'd MMMM', { locale: fr })}.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table style={{ borderCollapse: 'collapse', minWidth: 1050, fontSize, fontFamily, width: '100%' }}>
                  <thead>
                    <tr>
                      <th colSpan={3} style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '3px 6px', textAlign: 'center', border: '1px solid #000' }}>GSM</th>
                      <th style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '3px 6px', textAlign: 'center', border: '1px solid #000' }}>DATE</th>
                      <th colSpan={DETAIL_COLS.length} style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '3px 6px', textAlign: 'center', border: '1px solid #000' }}>CENTRE D'IDENTIFICATION</th>
                      <th style={{ backgroundColor: '#FFC000', color: '#000', fontWeight: 700, padding: '3px 6px', textAlign: 'center', border: '1px solid #000' }}>CAPTURES</th>
                    </tr>
                    <tr>
                      <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', width: 32, textAlign: 'center' }}>#</th>
                      <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 120 }}>
                        <div className="flex items-center gap-1">NUMÉRO <ColFilter col="phone" label="NUMÉRO" rows={dayDetails} colFilters={colFilters} setColFilters={setColFilters} /></div>
                      </th>
                      <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 100 }}>
                        <div className="flex items-center gap-1">COACH <ColFilter col="coach" label="COACH" rows={dayDetails} colFilters={colFilters} setColFilters={setColFilters} /></div>
                      </th>
                      <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 115, whiteSpace: 'nowrap' }}>DATE/HEURE</th>
                      {DETAIL_COLS.map(c => (
                        <th key={c.key} style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: c.w, maxWidth: c.w, width: c.w }}>
                          <div className="flex items-center gap-1">
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                            <ColFilter col={c.key as string} label={c.label} rows={dayDetails} colFilters={colFilters} setColFilters={setColFilters} />
                          </div>
                        </th>
                      ))}
                      <th style={{ backgroundColor: '#4472C4', color: '#fff', fontWeight: 700, padding: '3px 5px', border: '1px solid #000', minWidth: 90, textAlign: 'center' }}>
                        <div className="flex items-center justify-center gap-1"><ImageIcon size={11} />CAPTURES</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetails.map((d, i) => {
                      const bg = d.row_color || '#ffffff';
                      const screenshots: string[] = d.screenshot_urls ?? [];
                      return (
                        <tr key={d.request_id ?? i} style={{ backgroundColor: bg, color: '#000' }}>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {d.request?.phone_to_certify ? `+${d.request.phone_to_certify}` : '—'}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', whiteSpace: 'nowrap' }}>{d.request?.applicant?.username ?? '—'}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 5px', whiteSpace: 'nowrap' }}>{fmtDate(d.created_at)}</td>
                          {DETAIL_COLS.map(c => (
                            <td key={c.key} style={{ border: '1px solid #000', padding: '2px 4px', maxWidth: c.w, minWidth: c.w, width: c.w }}>
                              <EditableCell
                                reqId={d.request_id} colKey={c.key}
                                val={(d[c.key] as string) ?? ''}
                                options={optionsFor(c.key as string)}
                                onSave={handleCellSave}
                              />
                            </td>
                          ))}
                          <td style={{ border: '1px solid #000', padding: '2px 5px', textAlign: 'center', minWidth: 90 }}>
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {screenshots.map((url, si) => (
                                <img key={si} src={url} alt={`capture ${si + 1}`}
                                  onClick={() => setLightbox(url)}
                                  className="w-8 h-8 object-cover rounded cursor-pointer border border-gray-300 hover:scale-110 transition-transform"
                                  title="Cliquer pour agrandir" />
                              ))}
                              <button onClick={() => triggerUpload(d.request_id)}
                                className="w-8 h-8 flex items-center justify-center rounded border border-dashed border-gray-400 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                                title="Ajouter une capture">
                                <ImageIcon size={12} className="text-gray-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Pencil size={10} />
                  Cliquer sur une cellule → choisir une option ou saisir librement → Entrée pour valider
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </MainLayout>
  );
}
