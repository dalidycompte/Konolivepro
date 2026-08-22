import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getAllRequests, resolveDocuments } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest } from '@/types/types';
import {
  ClipboardList, Search, Phone, ChevronDown, ChevronUp,
  CreditCard, ScanFace, ImageOff, ZoomIn, X,
  FileDown, ArrowDownUp, ArrowUp, ArrowDown,
  CalendarDays,
} from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';

const FILTERS: { value: 'all' | 'accepted' | 'rejected' | 'unchanged'; label: string }[] = [
  { value: 'all',       label: 'Toutes'     },
  { value: 'accepted',  label: 'Acceptées'  },
  { value: 'rejected',  label: 'Rejetées'   },
  { value: 'unchanged', label: 'Inchangées' },
];

const DOC_LABELS = ["Recto pièce d'id.", "Verso pièce d'id.", 'Photo en direct'];
const DOC_ICONS  = [
  <CreditCard size={13} className="text-primary shrink-0" />,
  <CreditCard size={13} className="text-primary shrink-0" />,
  <ScanFace   size={13} className="text-primary shrink-0" />,
];

type SortDir = 'desc' | 'asc';

export default function SupervisorRequestsPage() {
  const [requests, setRequests]         = useState<VerificationRequest[]>([]);
  const [filter, setFilter]             = useState<'all' | 'accepted' | 'rejected' | 'unchanged'>('all');
  const [search, setSearch]             = useState('');
  const [loading, setLoading]           = useState(true);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [lightbox, setLightbox]         = useState<string | null>(null);
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  // Native date string "yyyy-MM-dd" — par défaut : aujourd'hui
  const [dateStr, setDateStr]           = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  const load = useCallback(async () => {
    const data = await getAllRequests(500);
    setRequests(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('sup-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const actioned = requests.filter(r =>
    ['accepted', 'rejected', 'unchanged'].includes(r.status)
  );

  const filtered = actioned
    .filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (search && !r.phone_to_certify.includes(search) &&
        !r.applicant?.username?.toLowerCase().includes(search.toLowerCase())) return false;
      if (dateStr && !isSameDay(new Date(r.created_at), new Date(dateStr))) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });

  // ── Groupement par jour ───────────────────────────────────────────────────
  type DayGroup = { dayLabel: string; items: VerificationRequest[] };
  const groups: DayGroup[] = [];
  for (const r of filtered) {
    const dayLabel = format(new Date(r.created_at), 'EEEE d MMMM yyyy', { locale: fr });
    const last = groups[groups.length - 1];
    if (last && last.dayLabel === dayLabel) {
      last.items.push(r);
    } else {
      groups.push({ dayLabel, items: [r] });
    }
  }

  // ── CSV export (no external dependency) ─────────────────────────────────
  function exportExcel() {
    const headers = ['N° Téléphone', 'Coach mobile', 'Agent', 'Statut', 'Date soumission', 'Date traitement', 'Durée traitement(s)', 'Notes'];
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = filtered.map(r => [
      escape(r.phone_to_certify),
      escape(r.applicant?.username ?? '—'),
      escape(r.agent?.username ?? '—'),
      escape(r.status),
      escape(format(new Date(r.created_at), 'dd/MM/yyyy HH:mm', { locale: fr })),
      escape(r.processed_at ? format(new Date(r.processed_at), 'dd/MM/yyyy HH:mm', { locale: fr }) : '—'),
      escape(r.processing_duration_seconds ?? '—'),
      escape(r.notes ?? ''),
    ].join(','));
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demandes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* ── En-tête ──────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Toutes les demandes</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {filtered.length} / {actioned.length} demande(s) traitée(s)
              {dateStr && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  <CalendarDays size={11} />
                  {format(new Date(dateStr), 'd MMM yyyy', { locale: fr })}
                  <button onClick={() => setDateStr('')} className="ml-1 hover:text-red-500 transition-colors">
                    <X size={10} />
                  </button>
                </span>
              )}
            </p>
          </div>
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-all shrink-0 shadow-sm">
            <FileDown size={16} />
            Exporter Excel
          </button>
        </div>

        {/* ── Barre de filtres ─────────────────────── */}
        <div className="neu-card py-4 px-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Recherche */}
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="neu-input pl-10 w-full" placeholder="Rechercher par téléphone ou coach mobile…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Native date picker — no external dependency */}
            <div className="relative flex items-center shrink-0">
              <CalendarDays size={15} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="neu-input pl-9 pr-3 text-sm"
                title="Filtrer par jour"
              />
              {dateStr && (
                <button onClick={() => setDateStr('')}
                  className="absolute right-2 text-muted-foreground hover:text-red-500 transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Tri par date */}
            <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl neu-flat text-sm font-medium text-foreground hover:text-primary transition-colors shrink-0">
              <ArrowDownUp size={15} className="text-muted-foreground" />
              Tri date
              {sortDir === 'desc'
                ? <ArrowDown size={13} className="text-primary" />
                : <ArrowUp   size={13} className="text-primary" />}
            </button>
          </div>

          {/* Filtres statut */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(s => (
              <button key={s.value} onClick={() => setFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter === s.value ? 'neu-btn-primary' : 'neu-btn text-sm py-1.5 px-3'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Liste groupée par jour ────────────────── */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="neu-flat h-20 rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="neu-card text-center py-16">
            <CalendarDays size={40} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground text-sm">
              {dateStr
                ? `Aucune demande le ${format(new Date(dateStr), 'd MMMM yyyy', { locale: fr })}.`
                : 'Aucune demande trouvée.'}
            </p>
            {dateStr && (
              <button onClick={() => setDateStr('')}
                className="mt-3 text-xs text-primary hover:underline">
                Afficher toutes les dates
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.dayLabel}>
                {/* En-tête du groupe jour */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl neu-flat">
                    <CalendarDays size={14} className="text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground capitalize">
                      {group.dayLabel}
                    </span>
                    <span className="ml-1 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Demandes du jour */}
                <div className="space-y-3">
                  {group.items.map(r => {
                    const docs    = resolveDocuments(r);
                    const imgUrls = docs ? [docs.doc_front_url, docs.doc_back_url, docs.live_photo_url] : [];
                    const isOpen  = expanded.has(r.id);
                    return (
                      <div key={r.id} className="neu-card">
                        <button onClick={() => toggleExpand(r.id)} className="w-full flex flex-wrap items-center gap-3 group text-left">
                          <Phone size={14} className="text-primary shrink-0" />
                          <span className="font-semibold text-foreground text-sm whitespace-nowrap">+{r.phone_to_certify}</span>
                          <span className="text-sm text-muted-foreground truncate">{r.applicant?.username ?? '—'}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">
                            Agent : {r.agent?.username ?? '—'}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">
                            {format(new Date(r.created_at), 'HH:mm', { locale: fr })}
                          </span>
                          <StatusBadge status={r.status} />
                          <div className="ml-auto neu-flat w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </button>

                        {isOpen && (
                          <div className="mt-4 pt-4 border-t border-border space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div><p className="text-xs text-muted-foreground">Coach mobile</p><p className="font-medium">{r.applicant?.username ?? '—'}</p></div>
                              <div><p className="text-xs text-muted-foreground">Agent</p><p className="font-medium">{r.agent?.username ?? '—'}</p></div>
                              <div><p className="text-xs text-muted-foreground">Soumise le</p><p className="font-medium">{format(new Date(r.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}</p></div>
                              <div><p className="text-xs text-muted-foreground">Traitée le</p><p className="font-medium">{r.processed_at ? format(new Date(r.processed_at), 'dd MMM yyyy, HH:mm', { locale: fr }) : '—'}</p></div>
                              {r.notes && <div className="col-span-2 md:col-span-4"><p className="text-xs text-muted-foreground">Motif / Notes</p><p className="font-medium text-foreground">{r.notes}</p></div>}
                            </div>

                            {docs ? (
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Documents</p>
                                <div className="grid grid-cols-3 gap-3">
                                  {imgUrls.map((url, i) => (
                                    <div key={i} className="space-y-1">
                                      <div className={`aspect-[4/3] w-full overflow-hidden neu-pressed rounded-xl relative ${url ? 'cursor-pointer group' : 'flex items-center justify-center'}`}
                                        onClick={() => url && setLightbox(url)}>
                                        {url ? (
                                          <>
                                            <img src={url} alt={DOC_LABELS[i]} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                              <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                                            </div>
                                          </>
                                        ) : (
                                          <ImageOff size={20} className="text-muted-foreground opacity-30" />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {DOC_ICONS[i]}
                                        <p className="text-xs text-muted-foreground truncate">{DOC_LABELS[i]}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Aucun document soumis.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all">
            <X size={20} />
          </button>
          <img src={lightbox} alt="Document" className="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </MainLayout>
  );
}
