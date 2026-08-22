import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoCall } from '@/contexts/VideoCallContext'; // floating call context
import { sendCallPush } from '@/contexts/VideoCallContext';
import {
  getRequestById, updateRequestStatus, createVideoCall,
  createNotification, sendMessage, getMessages,
  markMessagesRead, resolveDocuments, getRejectionReasons, getOtherReasons,
  getAgentRequests, claimRequest,
  getProcessingOptions, saveProcessingDetails, getAgentRecentProcessingDetails, saveDraft, getDraft, deleteDraft 
} from '@/lib/api';
import { startTimer, getElapsedSeconds, clearTimer } from '@/lib/timerStore';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest } from '@/types/types';
import type { ProcessingOption, ProcessingDetails } from '@/types/index';
import {
  Video, CheckCircle2, XCircle, Minus, MoreHorizontal, Edit2, EyeOff, Eye,
  ArrowLeft, Phone, ZoomIn, X, AlertTriangle, Timer, FileImage, PhoneCall, Copy, Check,
  Camera, Pencil, Palette, ClipboardCopy
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import TableFontControls, { TABLE_FONT_DEFAULT, TABLE_SIZE_DEFAULT } from '@/components/common/TableFontControls';

const WARN_SECONDS  = 300;  // 5 minutes
const ALERT_SECONDS = 600;  // 10 minutes (second alert)

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── FilterDropdown: Excel-style per-column filter ────────────────────────────
interface FilterDropdownProps {
  col: string;
  label: string;
  rows: any[];
  colFilters: Record<string, Set<string>>;
  filterOpen: string | null;
  setFilterOpen: (v: string | null) => void;
  toggleFilter: (col: string, val: string) => void;
  clearFilter: (col: string) => void;
}
function FilterDropdown({ col, rows, colFilters, filterOpen, setFilterOpen, toggleFilter, clearFilter }: FilterDropdownProps) {
  const uniqueVals = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const v = (r[col] as string) ?? ''; s.add(v); });
    return Array.from(s).sort();
  }, [rows, col]);

  const active = colFilters[col];
  const hasFilter = active && active.size > 0;
  const isOpen = filterOpen === col;

  return (
    <Popover open={isOpen} onOpenChange={(o) => setFilterOpen(o ? col : null)}>
      <PopoverTrigger asChild>
        <button
          title="Filtrer"
          onClick={e => { e.stopPropagation(); setFilterOpen(isOpen ? null : col); }}
          className={`shrink-0 flex items-center justify-center h-4 w-4 rounded transition-colors ${hasFilter ? 'bg-orange-400 text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}
          style={{ fontSize: 9 }}>
          ▼
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[190px] p-0 z-[9999]" align="start" side="bottom" avoidCollisions>
        <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">{col.replace(/_/g,' ')}</span>
          {hasFilter && (
            <button onClick={() => clearFilter(col)} className="text-[9px] text-orange-600 hover:underline">Effacer</button>
          )}
        </div>
        <ScrollArea className="h-[180px]">
          <div className="p-1">
            {uniqueVals.map(val => {
              const checked = !active || active.size === 0 || active.has(val);
              return (
                <label key={val} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggleFilter(col, val)} className="h-3 w-3 accent-blue-600" />
                  <span className="text-xs truncate flex-1" title={val || '(vide)'}>{val || <span className="italic text-gray-400">(vide)</span>}</span>
                </label>
              );
            })}
            {uniqueVals.length === 0 && <p className="text-xs text-center text-muted-foreground py-3">Aucune valeur</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default function ProcessRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Processing Details State
  const [processingOptions, setProcessingOptions] = useState<ProcessingOption[]>([]);
  const [processingDetails, setProcessingDetails] = useState<Partial<ProcessingDetails>>({});
  const [showProcessingDetails, setShowProcessingDetails] = useState(false);
  const [recentDetails, setRecentDetails] = useState<any[]>([]);
  const [pendingDecision, setPendingDecision] = useState<'accepted' | 'rejected' | 'unchanged' | 'other' | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  
  const [openSelect, setOpenSelect] = useState<string | null>(null);
  const [customInputValue, setCustomInputValue] = useState('');
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [historyLightMode, setHistoryLightMode] = useState(false);
  const [tableFont, setTableFont]             = useState(TABLE_FONT_DEFAULT);
  const [tableFontSize, setTableFontSize]     = useState(TABLE_SIZE_DEFAULT);
  const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);

  // ── Screenshot upload state
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // ── Row color highlight (per history row index)
  const [rowColors, setRowColors] = useState<Record<number, string>>({});
  const [colorPickerRow, setColorPickerRow] = useState<number | null>(null);

  // ── Excel-style column filters
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [filterOpen, setFilterOpen] = useState<string | null>(null);

  // ── Edit mode: per history row + column (key = `${idx}:${col}`)
  const [editingHistIdx, setEditingHistIdx] = useState<number | null>(null);
  const [histCellEdit, setHistCellEdit] = useState<{ idx: number; col: string } | null>(null);
  const [histCellInput, setHistCellInput] = useState('');

  // ── Copy confirmation flash
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const ROW_COLORS = ['#fff9c4','#c8e6c9','#ffccbc','#bbdefb','#e1bee7','#f8bbd0','#b2dfdb','#ffe0b2'];

  // ── Columns available for filtering
  const FILTERABLE_COLS: Array<{ key: string; label: string }> = [
    { key: 'constat_webcare',       label: 'CONSTAT' },
    { key: 'type_de_piece',         label: 'TYPE PIECE' },
    { key: 'verbatim',              label: 'VERBATIM' },
    { key: 'action_prise_gsm',      label: 'ACTION GSM' },
    { key: 'statut_final_gsm',      label: 'STATUT GSM' },
    { key: 'traitement',            label: 'TRAITEMENT' },
    { key: 'type_d_identification', label: 'TYPE IDENT.' },
    { key: 'raison_du_retard',      label: 'RAISON RETARD' },
  ];

  // ── Filtered history rows (apply active col filters)
  const filteredDetails = useMemo(() => {
    return recentDetails.filter(hist => {
      for (const [col, allowed] of Object.entries(colFilters)) {
        if (allowed.size === 0) continue;
        const val = (hist[col] as string) ?? '';
        if (!allowed.has(val)) return false;
      }
      return true;
    });
  }, [recentDetails, colFilters]);

  // ── Toggle one value in a column filter
  function toggleFilter(col: string, val: string) {
    setColFilters(prev => {
      const next = { ...prev };
      const existing = new Set(next[col] ?? []);
      if (existing.has(val)) existing.delete(val); else existing.add(val);
      next[col] = existing;
      return next;
    });
  }

  // ── Clear one column filter
  function clearFilter(col: string) {
    setColFilters(prev => { const n = { ...prev }; delete n[col]; return n; });
  }

  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem('konolive_agent_table_prefs');
      if (savedPrefs) {
        const { date, hidden, widths, lightMode } = JSON.parse(savedPrefs);
        const today = new Date().toLocaleDateString();
        if (date === today) {
          if (hidden) setHiddenColumns(hidden);
          if (widths) setColumnWidths(widths);
          if (lightMode !== undefined) setHistoryLightMode(lightMode);
        } else {
          localStorage.removeItem('konolive_agent_table_prefs');
        }
      }
    } catch (e) {
      console.error('Error loading table preferences', e);
    }
  }, []);

  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString();
      localStorage.setItem('konolive_agent_table_prefs', JSON.stringify({
        date: today,
        hidden: hiddenColumns,
        widths: columnWidths,
        lightMode: historyLightMode
      }));
    } catch (e) {
      console.error('Error saving table preferences', e);
    }
  }, [hiddenColumns, columnWidths, historyLightMode]);

  const handleResizeStart = (e: React.MouseEvent, col: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest('th');
    const startWidth = th ? th.getBoundingClientRect().width : 180;
    resizingRef.current = { col, startX: e.clientX, startWidth };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { col, startX, startWidth } = resizingRef.current;
      const newWidth = Math.max(80, startWidth + (e.clientX - startX));
      setColumnWidths(prev => ({ ...prev, [col]: newWidth }));
    };
    
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const [pendingReason, setPendingReason] = useState<string>('');

  const { startCall } = useVideoCall();
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  useEffect(() => {
    if (!profile || !request || !showProcessingDetails) return;
    const save = async () => {
      try {
        await saveDraft(profile.id, request!.id, {
          processingDetails,
          columnWidths,
          hiddenColumns,
          historyLightMode
        });
      } catch(err) {
        console.error("Draft save error:", err);
      }
    };
    // Use a small timeout to avoid spamming exactly at the same ms
    const timeout = setTimeout(save, 500);
    return () => clearTimeout(timeout);
  }, [processingDetails, columnWidths, hiddenColumns, historyLightMode, profile, request, showProcessingDetails]);

  const [submitting, setSubmitting] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Rejection reason modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectionPresets, setRejectionPresets] = useState<string[]>([]);

  // Autre modal
  const [showOtherModal, setShowOtherModal] = useState(false);
  const [otherReason, setOtherReason] = useState('');
  const [otherPresets, setOtherPresets] = useState<string[]>([]);

  // Modal de blocage navigation
  const [showBlockModal, setShowBlockModal] = useState(false);

  // ── Multi-requests Logic (Sidebar) ──
  const [agentReqs, setAgentReqs] = useState<VerificationRequest[]>([]);
  const [claiming, setClaiming] = useState(false);

  const loadAgentReqs = useCallback(async () => {
    if (!profile) return;
    const data = await getAgentRequests(profile.id, 50);
    setAgentReqs(data);
  }, [profile]);

  useEffect(() => { loadAgentReqs(); }, [loadAgentReqs]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('process-agent-reqs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => loadAgentReqs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, loadAgentReqs]);

  const pendingList = agentReqs.filter(r => r.status === 'pending');
  const myProcessing = agentReqs.filter(r => r.status === 'processing' && r.agent_id === profile?.id);
  const canTakeAnother = myProcessing.length < 2;

  async function handleTakeAnother(reqId: string) {
    if (claiming || !profile) return;
    setClaiming(true);
    const { error } = await claimRequest(reqId, profile.id);
    setClaiming(false);
    if (!error) {
      toast.success("Nouvelle demande prise en charge.");
      navigate(`/agent/process/${reqId}`);
    } else {
      toast.error("Cette demande n'est plus disponible.");
      loadAgentReqs();
    }
  }
  // ────────────────────────────────────

  // Bloque la navigation (retour navigateur) tant que la demande n'est pas clôturée
  const isActive = !!request && request.status === 'processing' && request.agent_id === profile?.id && !submitting;
  const isActiveRef = useRef(isActive);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // Pousse un état fantôme pour intercepter le bouton "back" du navigateur
  useEffect(() => {
    if (!isActive) return;
    // Pousse un état supplémentaire pour que "back" revienne ici d'abord
    window.history.pushState({ blockedNav: true }, '');

    function handlePopState() {
      if (isActiveRef.current) {
        // Repousse l'état fantôme et affiche la modale
        window.history.pushState({ blockedNav: true }, '');
        setShowBlockModal(true);
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isActive]);

  // Processing timer — persists across navigation via timerStore
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const alerted5Ref  = useRef(false);
  const alerted10Ref = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Start timer on mount (no-op if already running for this request)
  useEffect(() => {
    if (!id) return;
    startTimer(id);
    setElapsedSeconds(getElapsedSeconds(id));
    if (getElapsedSeconds(id) >= WARN_SECONDS)  alerted5Ref.current  = true;
    if (getElapsedSeconds(id) >= ALERT_SECONDS) alerted10Ref.current = true;
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(getElapsedSeconds(id));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [id]);

  // Charge les motifs de rejet et motifs "Autre" configurés par le superviseur
  useEffect(() => {
    getRejectionReasons().then(setRejectionPresets);
    getOtherReasons().then(setOtherPresets);
  }, []);

  // Trigger alerts at thresholds
  useEffect(() => {
    if (elapsedSeconds >= WARN_SECONDS && !alerted5Ref.current) {
      alerted5Ref.current = true;
      toast.warning('⏱ Temps de traitement dépassé', {
        description: 'Cette demande est en traitement depuis plus de 5 minutes. Veuillez la clôturer rapidement.',
        duration: 8000,
      });
    }
    if (elapsedSeconds >= ALERT_SECONDS && !alerted10Ref.current) {
      alerted10Ref.current = true;
      toast.error('⏱ Traitement trop long !', {
        description: 'Cette demande est en traitement depuis plus de 10 minutes.',
        duration: 10000,
      });
    }
  }, [elapsedSeconds]);

  // Vert en dessous de 5 min, rouge au-dessus
  const timerOverdue = elapsedSeconds >= WARN_SECONDS;
  const timerColor   = timerOverdue ? 'text-red-500'   : 'text-green-500';
  const timerBg      = timerOverdue ? 'bg-red-500/10'  : 'bg-green-500/10';
  const timerPulse   = timerOverdue;

  const load = useCallback(async () => {
    if (!id || !profile) return;
    const req = await getRequestById(id);
    
    // Block unauthorized access to pending or assigned-to-other requests
    if (req) {
      if (req.status === 'pending') {
        toast.error('Vous devez utiliser le bouton "Traiter la prochaine demande" ou attendre une assignation automatique.');
        navigate('/agent', { replace: true });
        return;
      }
      if (req.agent_id && req.agent_id !== profile.id) {
        toast.error('Cette demande est déjà traitée par un autre agent.');
        navigate('/agent', { replace: true });
        return;
      }
    }
    
    try {
      const pOptions = await getProcessingOptions();
      setProcessingOptions(pOptions);
      
      const recent = await getAgentRecentProcessingDetails(profile.id, 800000);
      setRecentDetails(recent);
      // Restore row colors saved in DB
      const initialColors: Record<number, string> = {};
      recent.forEach((r: any, i: number) => { if (r.row_color) initialColors[i] = r.row_color; });
      setRowColors(initialColors);

      const draft = await getDraft(profile.id, req!.id);
      if (draft) {
        if (draft.processingDetails) setProcessingDetails(draft.processingDetails);
        if (draft.columnWidths) setColumnWidths(draft.columnWidths);
        if (draft.hiddenColumns) setHiddenColumns(draft.hiddenColumns);
        if (draft.historyLightMode !== undefined) setHistoryLightMode(draft.historyLightMode);
        if (req!.status === 'accepted' || req!.status === 'rejected') {
          setPendingDecision(req!.status);
          setShowProcessingDetails(true);
          saveDraft(profile.id, request!.id, {
            processingDetails, columnWidths, hiddenColumns, historyLightMode
          }).catch(console.error);
        }
      } else if (req!.status === 'accepted' || req!.status === 'rejected') {
        setPendingDecision(req!.status);
        setShowProcessingDetails(true);
        saveDraft(profile.id, request!.id, {
          processingDetails, columnWidths, hiddenColumns, historyLightMode
        }).catch(console.error);
      }
    } catch(err) {
      console.error("Failed to load processing options:", err);
    }
    
    setRequest(req);
  }, [id, profile, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`process-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests', filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  // Realtime: rafraîchit la liste des traitements du jour dès qu'un nouvel enregistrement est inséré/mis à jour
  const refreshRecent = useCallback(async () => {
    if (!profile) return;
    try {
      const recent = await getAgentRecentProcessingDetails(profile.id, 800000);
      setRecentDetails(recent);
    } catch (e) {
      console.error('Realtime refresh error', e);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('realtime-processing-details')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'processing_details' }, () => refreshRecent())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, refreshRecent]);

  async function handleCall() {
    if (!request || !profile) return;
    const call = await createVideoCall({ request_id: request.id, agent_id: profile.id, applicant_id: request.applicant_id });
    if (!call) { toast.error("Impossible de démarrer l'appel"); return; }
    
    // Récupérer les informations d'appel générique
    const { data: genericSettings } = await supabase.from('app_settings').select('value').eq('key', 'generic_call_settings').maybeSingle();
    const callerName = genericSettings?.value?.name || 'Agent Konolive';
    const callerPhoto = genericSettings?.value?.photo_url || null;

    const payload = { call_id: call.id, applicant_id: request.applicant_id, agent_name: callerName, agent_photo: callerPhoto, request_id: request.id };
    const broadcastChannels = [
      supabase.channel(`req-detail-${request.id}`),
      supabase.channel(`user-call-${request.applicant_id}`),
    ];
    broadcastChannels.forEach(channel => {
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: 'call_offer', payload });
          setTimeout(() => supabase.removeChannel(channel), 2000);
        }
      });
    });
    await createNotification({
      user_id: request.applicant_id,
      type: 'call_started',
      title: 'Appel vidéo entrant',
      body: `${callerName} vous appelle pour votre demande de vérification.`,
      request_id: request.id,
    });
    // Envoyer notification push FCM (app fermée / verrouillée)
    await sendCallPush({
      callId:      call.id,
      receiverId:  request.applicant_id,
      callerName,
      callerPhoto,
      requestId:   request.id,
    });
    // Ouvre la fenêtre flottante globale — persistante pendant toute la navigation
    startCall({
      callId:          call.id,
      remoteUserName:  request.applicant?.username ?? 'Coach mobile',
      remoteUserPhoto: null,
      isInitiator:     true,
      requestId:       request.id,
      receiverId:      request.applicant_id,
      callerName,
      callerPhoto,
    } as any);
  }
  const [recallSent, setRecallSent] = useState(false);

  // ── Présence en temps réel du Coach mobile ────────────────────────────────
  const [coachOnline, setCoachOnline] = useState(false);

  useEffect(() => {
    if (!request?.applicant_id) return;

    // Fetch initial state as fallback
    supabase.from('profiles').select('is_online').eq('id', request.applicant_id).single()
      .then(({ data }) => setCoachOnline(data?.is_online ?? false));

    const presenceCh = supabase.channel(`user-presence-${request.applicant_id}`, {
      config: { presence: { key: request.applicant_id } },
    });
    
    presenceCh
      .on('presence', { event: 'sync' }, () => {
        const state = presenceCh.presenceState();
        if (Object.keys(state).length > 0) setCoachOnline(true);
      })
      .on('presence', { event: 'join' }, () => setCoachOnline(true))
      .on('presence', { event: 'leave' }, () => {
        const state = presenceCh.presenceState();
        setCoachOnline(Object.keys(state).length > 0);
      })
      .subscribe();

    const pgCh = supabase.channel(`profile-presence-${request.applicant_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${request.applicant_id}` }, (payload) => {
        if (payload.new.is_online !== undefined) {
          // Fallback sur Postgres si la websocket presence rate
          setCoachOnline(prev => prev || payload.new.is_online);
        }
      })
      .subscribe();
      
    return () => { 
      supabase.removeChannel(presenceCh); 
      supabase.removeChannel(pgCh);
    };
  }, [request?.applicant_id]);

  async function handleRecallRequest() {
    if (!request || !profile || !request.agent_id) return;
    setRecallSent(true);
    await createNotification({
      user_id: request.agent_id,
      type: 'recall_request',
      title: 'Rappel demandé',
      body: `L'agent ${profile.username} vous demande de rappeler le numéro +${request.phone_to_certify}.`,
      request_id: request.id,
    });
    const ch = supabase.channel(`recall-${request.agent_id}`);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'recall_request', payload: { request_id: request.id, phone: request.phone_to_certify, from: profile.username } });
        setTimeout(() => supabase.removeChannel(ch), 2000);
      }
    });
    toast.success("Demande de rappel envoyée à l'agent.");
  }

  const [showNextPrompt, setShowNextPrompt] = useState(false);

  async function handleNextRequest() {
    if (!profile) return;
    const { data: pending } = await supabase
      .from('verification_requests')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!pending) {
      toast.info("Aucune demande en attente.");
      navigate('/agent');
      return;
    }

    const { error } = await claimRequest(pending.id, profile.id);
    if (error) {
      toast.error("Impossible d'attribuer la demande suivante.");
      navigate('/agent');
      return;
    }
    
    setShowNextPrompt(false);
    navigate(`/agent/process/${pending.id}`);
  }

  async function handleDecision(decision: 'accepted' | 'rejected' | 'unchanged' | 'other', reason?: string) {
    if (!request || !profile) return;
    
    // Pour accepté et rejeté, on met à jour IMMÉDIATEMENT le statut et on notifie le Coach Mobile
    if (decision === 'accepted' || decision === 'rejected') {
      // ── Arrêt immédiat du timer dès la décision (exigence doc §8) ──
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (request) clearTimer(request.id);
      alerted5Ref.current  = true;
      alerted10Ref.current = true;

      setSubmitting(decision);
      await updateRequestStatus(request.id, decision, profile.id, reason || undefined);
      
      const decisionLabels: Record<string, string> = {
        accepted: 'acceptée', rejected: 'rejetée', unchanged: 'inchangée', other: 'classée Autre',
      };
      
      const body = decision === 'rejected' && reason
        ? `Votre demande pour +${request.phone_to_certify} a été ${decisionLabels[decision]}. Motif : ${reason}`
        : `Votre demande de vérification pour +${request.phone_to_certify} a été ${decisionLabels[decision] ?? decision}.`;
        
      await createNotification({
        user_id: request.applicant_id,
        type: 'status_changed',
        title: `Demande ${decisionLabels[decision] ?? decision}`,
        body,
        request_id: request.id,
      });
      
      toast.success(`Le Coach Mobile a été notifié (${decisionLabels[decision]}). Veuillez remplir le formulaire.`);
      setSubmitting(null);
      
      setPendingDecision(decision);
      setPendingReason(reason || '');
      setShowProcessingDetails(true);
      // Initial draft creation
      saveDraft(profile.id, request!.id, {
        processingDetails, columnWidths, hiddenColumns, historyLightMode
      }).catch(console.error);
      return;
    }
    
    // Pour inchangé ou autre, on exécute l'ancienne logique
    await executeDecision(decision, reason);
  }

  async function executeDecision(decision: 'accepted' | 'rejected' | 'unchanged' | 'other', reason?: string) {
    if (!request || !profile) return;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    clearTimer(request.id);
    
    // Mettre à jour le statut uniquement si ce n'est pas déjà fait (inchangé, autre)
    if (decision !== 'accepted' && decision !== 'rejected') {
      setSubmitting(decision);
      await updateRequestStatus(request.id, decision, profile.id, reason || undefined);
      const decisionLabels: Record<string, string> = {
        accepted: 'acceptée', rejected: 'rejetée', unchanged: 'inchangée', other: 'classée Autre',
      };
      const body = decision === 'other' && reason
        ? `Votre demande pour +${request.phone_to_certify} a été ${decisionLabels[decision]}. Motif : ${reason}`
        : `Votre demande de vérification pour +${request.phone_to_certify} a été ${decisionLabels[decision] ?? decision}.`;
      await createNotification({
        user_id: request.applicant_id,
        type: 'status_changed',
        title: `Demande ${decisionLabels[decision] ?? decision}`,
        body,
        request_id: request.id,
      });
      toast.success(`Demande marquée comme ${decisionLabels[decision] ?? decision}`);
      setSubmitting(null);
    }
    
    if (profile.manual_next_request) {
      const { count } = await supabase
        .from('verification_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
        
      if ((count || 0) > 0) {
        setShowNextPrompt(true);
      } else {
        navigate('/agent');
      }
    } else {
      setTimeout(() => {
        navigate('/agent');
      }, 500);
    }
  }

  function openRejectModal() { setRejectReason(''); setShowRejectModal(true); }
  async function confirmReject() {
    if (!rejectReason.trim()) { toast.error('Veuillez renseigner le motif du rejet.'); return; }
    setShowRejectModal(false);
    await handleDecision('rejected', rejectReason.trim());
  }

  function openOtherModal() { setOtherReason(''); setShowOtherModal(true); }
  async function confirmOther() {
    if (!otherReason.trim()) { toast.error('Veuillez renseigner le motif.'); return; }
    setShowOtherModal(false);
    await handleDecision('other', otherReason.trim());
  }


  async function confirmProcessingDetails() {
    if (!request || !pendingDecision) return;

    // Capture d'écran obligatoire uniquement pour les numéros acceptés
    const mandatoryColumns = [
      'constat_webcare', 'verbatim', 'action_prise_gsm', 'type_d_identification'
    ];
    const missing = mandatoryColumns.some(c => !processingDetails[c as keyof ProcessingDetails]);
    if (missing) { toast.error("Veuillez remplir les colonnes obligatoires."); return; }

    if (pendingDecision === 'accepted' && (!processingDetails.screenshot_urls || processingDetails.screenshot_urls.length === 0)) {
      toast.error("Une capture d'écran est obligatoire pour les numéros acceptés."); return;
    }

    try {
      // Save main row + all row colors into DB
      await saveProcessingDetails({ ...processingDetails, request_id: request.id });
      // Persist each history row's color
      await Promise.all(
        recentDetails.map((hist, i) => {
          const color = rowColors[i] ?? null;
          if (color !== undefined && hist.request_id) {
            return saveProcessingDetails({ request_id: hist.request_id, row_color: color } as ProcessingDetails).catch(console.error);
          }
        })
      );
      if (profile && request) await deleteDraft(profile.id, request.id);
      setShowProcessingDetails(false);
      await executeDecision(pendingDecision, pendingReason);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'enregistrement des détails de traitement.");
    }
  }

  // ── Upload screenshot files → Supabase Storage
  async function handleScreenshotUpload(files: FileList | null) {
    if (!files || !profile) return;
    setScreenshotUploading(true);
    try {
      const urls: string[] = [...(processingDetails.screenshot_urls || [])];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('processing-screenshots').upload(path, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('processing-screenshots').getPublicUrl(path);
        urls.push(publicUrl);
      }
      setProcessingDetails(prev => ({ ...prev, screenshot_urls: urls }));
      toast.success(`${Array.from(files).length} capture(s) ajoutée(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'upload de la capture.");
    } finally {
      setScreenshotUploading(false);
    }
  }

  function removeScreenshot(url: string) {
    setProcessingDetails(prev => ({
      ...prev,
      screenshot_urls: (prev.screenshot_urls || []).filter(u => u !== url)
    }));
  }

  // ── Copier une ligne historique → pré-remplir la ligne agent
  function handleCopyRow(hist: any, idx: number) {
    const cols = ['constat_webcare','type_de_piece','verbatim','action_prise_gsm',
                  'statut_final_gsm','traitement','type_d_identification','raison_du_retard'];
    const copied: Partial<ProcessingDetails> = {};
    cols.forEach(c => { if (hist[c]) copied[c as keyof ProcessingDetails] = hist[c]; });
    setProcessingDetails(prev => ({ ...prev, ...copied }));
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
    toast.success("Réponses copiées — modifiez si nécessaire puis enregistrez.");
  }

  // ── Modifier une ligne historique → charge ses valeurs dans la ligne agent
  function handleEditRow(hist: any) {
    const cols = ['constat_webcare','type_de_piece','verbatim','action_prise_gsm',
                  'statut_final_gsm','traitement','type_d_identification','raison_du_retard','screenshot_urls'];
    const vals: Partial<ProcessingDetails> = {};
    cols.forEach(c => { if (hist[c] !== undefined) vals[c as keyof ProcessingDetails] = hist[c]; });
    setProcessingDetails(prev => ({ ...prev, ...vals }));
    toast.info("Champs chargés — modifiez puis enregistrez.");
  }

  // ── Modifier une cellule d'historique directement (persist en DB)
  async function commitHistCellEdit(hist: any) {
    if (!histCellEdit) return;
    const { col, idx } = histCellEdit;
    const newVal = histCellInput.trim();
    try {
      // Only pass the clean request_id + the updated column — no nested join fields
      await saveProcessingDetails({
        request_id: hist.request_id,
        [col]: newVal,
      } as ProcessingDetails);
      setRecentDetails(prev => prev.map((r, i) =>
        i === idx ? { ...r, [col]: newVal } : r
      ));
      toast.success("Réponse mise à jour.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la mise à jour.");
    } finally {
      setHistCellEdit(null);
    }
  }

  if (!request) return (
    <MainLayout>
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </MainLayout>
  );

  const docs = resolveDocuments(request);

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
        
        {/* Main Content */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3">
            {/* Bouton retour — désactivé si demande en cours */}
          <button
            onClick={() => { if (isActive) { setShowBlockModal(true); } else { navigate('/agent'); } }}
            title={isActive ? 'Clôturez la demande avant de quitter' : 'Retour'}
            className={`neu-flat w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              isActive ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'hover:text-primary'
            }`}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground text-balance">Traiter la demande</h1>
            <p className="text-xs text-muted-foreground font-mono">{request.id.slice(0, 8)}…</p>
          </div>

          {/* Processing timer */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-mono font-semibold ml-auto shrink-0 neu-flat ${timerBg} ${timerColor} ${timerPulse ? 'animate-pulse' : ''}`}>
            <Timer size={15} className="shrink-0" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>

          <StatusBadge status={request.status} className="shrink-0" />
        </div>

        <div className="max-w-xl mx-auto space-y-6">
          {/* Left: info + documents + actions */}
          <div className="space-y-6">
            {/* Applicant info */}
            <div className="neu-card">
              <div className="flex items-center gap-3 mb-3">
                <Phone size={18} className="text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Numéro à certifier</p>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-xl text-foreground">{request.phone_to_certify}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`+${request.phone_to_certify}`);
                        toast.success('Numéro copié !');
                      }}
                      className="neu-flat p-1.5 rounded-lg hover:text-primary transition-colors ml-2"
                      title="Copier le numéro"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-sm">
                <div><p className="text-xs text-muted-foreground">Coach mobile</p><p className="font-medium">{request.applicant?.username}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Localité</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{request.applicant?.locality ?? '—'}</p>
                    {/* Voyant présence Coach mobile */}
                    <span className="relative flex items-center gap-1.5 shrink-0">
                      <span className="relative flex items-center shrink-0">
                        {coachOnline && (
                          <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75 animate-ping" />
                        )}
                        <span className={[
                          'relative inline-flex h-3 w-3 rounded-full',
                          coachOnline ? 'bg-green-500' : 'bg-gray-400',
                        ].join(' ')} />
                      </span>
                      <span className={[
                        'text-xs font-semibold',
                        coachOnline ? 'text-green-600' : 'text-muted-foreground',
                      ].join(' ')}>
                        {coachOnline ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </span>
                  </div>
                </div>
                <div><p className="text-xs text-muted-foreground">Téléphone</p><p className="font-medium">{request.applicant?.phone ?? '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Soumise le</p><p className="font-medium">{format(new Date(request.created_at), 'dd MMM, HH:mm')}</p></div>
              </div>
            </div>

            {/* Documents & Actions — section unifiée */}
            <div className="neu-card space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <FileImage size={17} className="text-primary" />
                Documents &amp; Actions
              </h2>

              {/* Thumbnails */}
              {docs ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Recto pièce d'id.", url: docs.doc_front_url },
                    { label: "Verso pièce d'id.", url: docs.doc_back_url },
                    { label: 'Photo en direct',   url: docs.live_photo_url },
                  ].map(d => (
                    <div key={d.label} className="space-y-1">
                      <div className="aspect-[4/3] w-full overflow-hidden neu-pressed rounded-xl relative group cursor-pointer" onClick={() => d.url && setLightbox(d.url)}>
                        {d.url
                          ? <><img src={d.url} alt={d.label} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center"><ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-all" /></div></>
                          : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">N/D</div>}
                      </div>
                      <p className="text-xs text-center text-muted-foreground font-medium">{d.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">Aucun document soumis.</p>
              )}

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                {(request.status === 'accepted' || request.status === 'rejected') ? (
                  <button onClick={() => setShowProcessingDetails(true)} className="neu-btn-primary py-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white border-amber-600">
                    <Edit2 size={18} /><span>Reprendre le traitement</span>
                  </button>
                ) : (
                  <>
                    <button onClick={handleCall} className="neu-btn-primary py-3 flex items-center justify-center gap-2">
                  <Video size={18} /><span>Démarrer l'appel vidéo</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleDecision('accepted')} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-green-500 hover:bg-green-600">
                    {submitting === 'accepted'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><CheckCircle2 size={16} /><span>Accepter</span></>}
                  </button>
                  <button onClick={openRejectModal} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-destructive hover:opacity-90">
                    {submitting === 'rejected'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><XCircle size={16} /><span>Rejeter</span></>}
                  </button>
                  <button onClick={() => handleDecision('unchanged')} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-gray-500 hover:bg-gray-600">
                    {submitting === 'unchanged'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Minus size={16} /><span>Inchangé</span></>}
                  </button>
                  <button onClick={openOtherModal} disabled={!!submitting}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 bg-amber-500 hover:bg-amber-600">
                    {submitting === 'other'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><MoreHorizontal size={16} /><span>Autre</span></>}
                  </button>
                </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-[320px] shrink-0 space-y-6">
        {/* Mes demandes en cours */}
        <div className="neu-card space-y-4 border-2 border-primary/20">
          <h3 className="font-bold text-foreground">En cours ({myProcessing.length}/2)</h3>
          <div className="space-y-3">
            {myProcessing.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Aucune demande</p>
            ) : (
              myProcessing.map(r => (
                <div key={r.id} className={`p-3 rounded-xl border ${r.id === id ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-card'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{r.id.slice(0, 8)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 ml-auto">En cours</span>
                  </div>
                  <p className="text-sm font-semibold mb-2">{r.applicant?.phone || r.phone_to_certify}</p>
                  {r.id !== id && (
                    <button 
                      onClick={() => navigate(`/agent/process/${r.id}`)}
                      className="w-full py-1.5 neu-flat text-xs font-medium rounded-lg hover:text-primary transition-colors">
                      Afficher
                    </button>
                  )}
                  {r.id === id && (
                    <div className="w-full py-1.5 bg-primary/10 text-primary text-xs font-semibold rounded-lg text-center">
                      Actuelle
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Demandes en attente */}
        <div className="neu-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">En attente</h3>
            <span className="neu-flat px-2 py-0.5 rounded-md text-xs font-mono">{pendingList.length}</span>
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {pendingList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune demande en attente</p>
            ) : (
              pendingList.map(r => (
                <div key={r.id} className="p-3 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{r.id.slice(0, 8)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-600 ml-auto">En attente</span>
                  </div>
                  <p className="text-sm font-medium mb-3 text-muted-foreground">{r.phone_to_certify}</p>
                  <button
                    onClick={() => handleTakeAnother(r.id)}
                    disabled={!canTakeAnother || claiming}
                    className="w-full py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed neu-btn-primary"
                  >
                    Prendre cette demande
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>

      {/* ── Rejection reason modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowRejectModal(false)}>
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-balance">Motif du rejet</h3>
                  <p className="text-xs text-muted-foreground">Demande {request.phone_to_certify}</p>
                </div>
              </div>
              <button onClick={() => setShowRejectModal(false)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-destructive transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Reason presets */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sélectionner un motif ou saisir librement</p>
              <div className="flex flex-wrap gap-2">
                {rejectionPresets.map(preset => (
                  <button key={preset} type="button"
                    onClick={() => setRejectReason(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      rejectReason === preset
                        ? 'bg-destructive text-white border-destructive'
                        : 'neu-flat text-foreground hover:border-destructive/50'
                    }`}>
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Free text */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Motif personnalisé</label>
              <textarea
                className="neu-input resize-none"
                rows={3}
                placeholder="Précisez le motif du rejet…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowRejectModal(false)} className="neu-btn px-4 py-2 text-sm">
                Annuler
              </button>
              <button onClick={confirmReject} disabled={!rejectReason.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold bg-destructive hover:opacity-90 transition-all disabled:opacity-40">
                <XCircle size={16} />Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Autre modal ── */}
      {showOtherModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowOtherModal(false)}>
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <MoreHorizontal size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Motif — Autre</h3>
                  <p className="text-xs text-muted-foreground">Demande {request.phone_to_certify}</p>
                </div>
              </div>
              <button onClick={() => setShowOtherModal(false)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-amber-500 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sélectionner un motif ou saisir librement</p>
              <div className="flex flex-wrap gap-2">
                {otherPresets.map(preset => (
                  <button key={preset} type="button"
                    onClick={() => setOtherReason(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      otherReason === preset
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'neu-flat text-foreground hover:border-amber-400/60'
                    }`}>
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Motif personnalisé</label>
              <textarea
                className="neu-input resize-none"
                rows={3}
                placeholder="Précisez le motif…"
                value={otherReason}
                onChange={e => setOtherReason(e.target.value)}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowOtherModal(false)} className="neu-btn px-4 py-2 text-sm">Annuler</button>
              <button onClick={confirmOther} disabled={!otherReason.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold bg-amber-500 hover:bg-amber-600 transition-all disabled:opacity-40">
                <MoreHorizontal size={16} />Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Next Prompt ── */}

      {showProcessingDetails && (
        <Dialog open={showProcessingDetails} onOpenChange={(open) => { if (!open) return; setShowProcessingDetails(open); }}>
          <DialogContent style={{ backgroundColor: '#5C3317', color: '#ffffff', border: '3px solid #5C3317', outline: 'none' }} className="max-w-[100vw] w-screen h-screen max-h-[100vh] m-0 rounded-none overflow-hidden flex flex-col [&>button.absolute]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            {/* ── Barre du haut : titre + compteur + bouton Enregistrer ── */}
            <div style={{ backgroundColor: '#5C3317', borderBottom: '2px solid #3d2010' }} className="px-4 py-2 shrink-0 flex items-center justify-between gap-2">
              <DialogTitle style={{ color: '#ffffff' }} className="text-base font-bold flex items-center gap-2 m-0">
                <span>Détails de Traitement</span>
                <span style={{ backgroundColor: '#3d2010', color: '#FFC000' }} className="text-xs font-bold px-2 py-0.5 rounded">
                  {recentDetails.length} numéro{recentDetails.length > 1 ? 's' : ''} traité{recentDetails.length > 1 ? 's' : ''}
                </span>
                {hiddenColumns.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setHiddenColumns([])} className="h-7 text-xs border border-white/40 text-white hover:bg-white/10 flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Colonnes masquées ({hiddenColumns.length})
                  </Button>
                )}
                {/* ── Boutons Police + Taille ── */}
                <TableFontControls
                  fontFamily={tableFont} setFontFamily={setTableFont}
                  fontSize={tableFontSize} setFontSize={setTableFontSize}
                  variant="dark"
                />
              </DialogTitle>
              <Button onClick={confirmProcessingDetails} style={{ backgroundColor: '#22c55e', color: '#ffffff' }} className="h-8 px-5 text-sm font-semibold shrink-0 hover:opacity-90">
                Enregistrer
              </Button>
            </div>
            {/* ── Zone tableau — fond blanc, défilement vertical ── */}
            <div className="flex-1 min-h-0 p-1 overflow-hidden flex flex-col">
              <div style={{ backgroundColor: '#ffffff' }} className="w-full h-full overflow-auto rounded-sm border border-[#3d2010]">
                <Table className="[&>div]:max-w-full relative text-xs" style={{ fontFamily: tableFont, fontSize: tableFontSize }}>
                  <TableHeader className="sticky top-0 z-10 text-[11px] leading-tight">
                    {/* ── Bandeau supérieur jaune/orange — style Excel FICHIER GSM ── */}
                    <TableRow style={{ backgroundColor: '#FFC000' }} className="hover:bg-[#FFC000] border-b border-[#e6a800]">
                      <TableHead
                        colSpan={2}
                        style={{ color: '#000', backgroundColor: '#FFC000' }}
                        className="px-2 h-7 font-black whitespace-nowrap border-r border-[#e6a800] text-[11px]"
                      >
                        GSM
                      </TableHead>
                      <TableHead
                        colSpan={1}
                        style={{ color: '#000', backgroundColor: '#FFC000' }}
                        className="px-2 h-7 font-semibold whitespace-nowrap border-r border-[#e6a800] text-[11px]"
                      >
                        Date de traitement :{' '}
                        {new Date().toLocaleDateString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          timeZone: 'Africa/Brazzaville',
                        })}
                      </TableHead>
                      <TableHead
                        colSpan={8}
                        style={{ color: '#000', backgroundColor: '#FFC000' }}
                        className="px-2 h-7 font-black text-center whitespace-nowrap text-[12px] tracking-wide"
                      >
                        CENTRE D'IDENTIFICATION
                      </TableHead>
                    </TableRow>
                    {/* ── En-têtes colonnes — fond bleu Excel #4472C4 ── */}
                    <TableRow style={{ backgroundColor: '#4472C4' }} className="hover:opacity-95">
                      <TableHead style={{ width: columnWidths["numero"] || "auto", minWidth: columnWidths["numero"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">NUMERO
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              onMouseDown={(e) => handleResizeStart(e, 'numero')}
                            />
</TableHead>
                      {!hiddenColumns.includes('date') && (
                        <TableHead style={{ width: columnWidths["date"] || "auto", minWidth: columnWidths["date"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 group relative">
                          <div className="flex items-center justify-between">
                            <span>DATE DE CREATION</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-white/20" onClick={() => setHiddenColumns(p => [...p, 'date'])} title="Masquer">
                              <EyeOff className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'date')} />
                        </TableHead>
                      )}
                      {!hiddenColumns.includes('coach') && (
                        <TableHead style={{ width: columnWidths["coach"] || "auto", minWidth: columnWidths["coach"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 group relative">
                          <div className="flex items-center justify-between">
                            <span>NOM COACH MOBILE</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-white/20" onClick={() => setHiddenColumns(p => [...p, 'coach'])} title="Masquer">
                              <EyeOff className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'coach')} />
                        </TableHead>
                      )}
                      <TableHead style={{ width: columnWidths["constat_webcare"] || "auto", minWidth: columnWidths["constat_webcare"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>CONSTAT WEBCARE *</span>
                          <FilterDropdown col="constat_webcare" label="CONSTAT" rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'constat_webcare')} />
                      </TableHead>
                      <TableHead style={{ width: columnWidths["type_de_piece"] || '80px', minWidth: '80px', color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>TYPE PIECE</span>
                          <FilterDropdown col="type_de_piece" label="TYPE PIECE" rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'type_de_piece')} />
                      </TableHead>
                      <TableHead style={{ width: columnWidths["verbatim"] || "auto", minWidth: columnWidths["verbatim"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>VERBATIM *</span>
                          <FilterDropdown col="verbatim" label="VERBATIM" rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'verbatim')} />
                      </TableHead>
                      <TableHead style={{ width: columnWidths["action_prise_gsm"] || "auto", minWidth: columnWidths["action_prise_gsm"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>ACTION PRISE GSM *</span>
                          <FilterDropdown col="action_prise_gsm" label="ACTION GSM" rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'action_prise_gsm')} />
                      </TableHead>
                      <TableHead style={{ width: columnWidths["statut_final_gsm"] || "auto", minWidth: columnWidths["statut_final_gsm"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>STATUT FINAL GSM</span>
                          <FilterDropdown col="statut_final_gsm" label="STATUT GSM" rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'statut_final_gsm')} />
                      </TableHead>
                      <TableHead style={{ width: columnWidths["traitement"] || "auto", minWidth: columnWidths["traitement"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>TRAITEMENT</span>
                          <FilterDropdown col="traitement" label="TRAITEMENT" rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'traitement')} />
                      </TableHead>
                      <TableHead style={{ width: columnWidths["type_d_identification"] || "auto", minWidth: columnWidths["type_d_identification"] || "auto", color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>TYPE D'IDENTIFICATION *</span>
                          <FilterDropdown col="type_d_identification" label="TYPE IDENT." rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'type_d_identification')} />
                      </TableHead>
                      <TableHead style={{ width: columnWidths["raison_du_retard"] || "auto", minWidth: '90px', color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30 relative group">
                        <div className="flex items-center gap-1">
                          <span>RAISON RETARD</span>
                          <FilterDropdown col="raison_du_retard" label="RAISON" rows={recentDetails} colFilters={colFilters} filterOpen={filterOpen} setFilterOpen={setFilterOpen} toggleFilter={toggleFilter} clearFilter={clearFilter} />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-10" onMouseDown={(e) => handleResizeStart(e, 'raison_du_retard')} />
                      </TableHead>
                      <TableHead style={{ minWidth: '140px', color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-2 h-8 border-r border-white/30">
                        CAPTURE D'ÉCRAN {pendingDecision === 'accepted' ? '*' : ''}
                      </TableHead>
                      <TableHead style={{ minWidth: '54px', width: '54px', color: '#fff', backgroundColor: '#4472C4' }} className="whitespace-nowrap font-bold px-1 h-8">ACT.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow style={{ backgroundColor: '#22c55e', color: '#ffffff' }} className="border-b border-black">
                      <TableCell style={{ width: columnWidths["numero"] || "auto", minWidth: columnWidths["numero"] || "auto", backgroundColor: '#22c55e', color: '#ffffff' }} className="whitespace-nowrap px-2 py-2 font-medium border-r border-black">{request.phone_to_certify}</TableCell>
                      {!hiddenColumns.includes('date') && (
                        <TableCell style={{ width: columnWidths["date"] || "auto", minWidth: columnWidths["date"] || "auto", backgroundColor: '#22c55e', color: '#ffffff' }} className="whitespace-nowrap px-2 py-2 font-medium border-r border-black">{format(new Date(request.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                      )}
                      {!hiddenColumns.includes('coach') && (
                        <TableCell style={{ width: columnWidths["coach"] || "auto", minWidth: columnWidths["coach"] || "auto", backgroundColor: '#22c55e', color: '#ffffff' }} className="whitespace-nowrap px-2 py-2 font-medium border-r border-black">{request.applicant?.username || 'Inconnu'}</TableCell>
                      )}
                      {[
                        'constat_webcare', 'type_de_piece', 'verbatim', 'action_prise_gsm', 
                        'statut_final_gsm', 'traitement', 'type_d_identification', 'raison_du_retard'
                      ].map(col => {
                        const val = processingDetails[col as keyof ProcessingDetails] as string | undefined;
                        const isEditing = openSelect === col;
                        return (
                          <TableCell key={col} style={{ width: columnWidths[col] || "auto", minWidth: columnWidths[col] || "180px", backgroundColor: '#22c55e', color: '#ffffff' }} className="whitespace-nowrap px-2 py-2 group border-r border-black">
                            {val && !isEditing ? (
                              <div className="flex items-center justify-between w-full h-7">
                                <span className="text-xs truncate font-medium max-w-[130px]" title={val}>{val}</span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setOpenSelect(col)} title="Éditer">
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setProcessingDetails(prev => ({...prev, [col]: ''}))} title="Supprimer la réponse">
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center w-full">
                                <Popover 
                                  open={isEditing} 
                                  onOpenChange={(open) => {
                                    if (!open) {
                                      if (customInputValue.trim() && customInputValue !== val) {
                                        setProcessingDetails(prev => ({...prev, [col]: customInputValue.trim()}));
                                      }
                                      setOpenSelect(null);
                                    } else {
                                      setCustomInputValue(val || '');
                                      setOpenSelect(col);
                                    }
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" className={`w-full h-7 px-2 text-xs justify-start font-normal ${!val ? 'border-dashed text-muted-foreground bg-muted/30 hover:bg-muted/50' : 'bg-background text-foreground'}`}>
                                      {!val ? (
                                        <div className="flex items-center gap-1.5">
                                          <Edit2 className="h-3 w-3" />
                                          <span>Éditer...</span>
                                        </div>
                                      ) : (
                                        <span className="truncate">{val}</span>
                                      )}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[250px] p-0" align="start">
                                    <div className="p-2 border-b">
                                      <Input
                                        value={customInputValue}
                                        onChange={(e) => setCustomInputValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && customInputValue.trim()) {
                                            setProcessingDetails(prev => ({...prev, [col]: customInputValue.trim()}));
                                            setOpenSelect(null);
                                          }
                                        }}
                                        placeholder="Saisir ou sélectionner..."
                                        className="h-8 text-xs"
                                        autoFocus
                                      />
                                    </div>
                                    <ScrollArea className="h-[200px]">
                                      <div className="p-1 flex flex-col gap-1">
                                        {processingOptions.filter(o => o.column_name === col).map(opt => (
                                          <div
                                            key={opt.id}
                                            className="px-2 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                                            onClick={() => {
                                              setProcessingDetails(prev => ({...prev, [col]: opt.option_value}));
                                              setOpenSelect(null);
                                            }}
                                          >
                                            {opt.option_value}
                                          </div>
                                        ))}
                                        {processingOptions.filter(o => o.column_name === col).length === 0 && (
                                          <div className="px-2 py-3 text-xs text-center text-muted-foreground">Aucune option prédéfinie</div>
                                        )}
                                      </div>
                                    </ScrollArea>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      {/* Capture d'écran — obligatoire pour numéros acceptés */}
                      <TableCell style={{ minWidth: '140px', backgroundColor: '#22c55e', color: '#ffffff' }} className="px-2 py-2 border-r border-black align-top">
                        <div className="flex flex-col gap-1">
                          <button onClick={() => screenshotInputRef.current?.click()} disabled={screenshotUploading}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-white/20 hover:bg-white/40 text-white border border-white/50 transition-colors disabled:opacity-50">
                            {screenshotUploading ? <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <Camera className="h-3 w-3" />}
                            {screenshotUploading ? 'Envoi…' : 'Ajouter'}
                          </button>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(processingDetails.screenshot_urls || []).map((url, i) => (
                              <div key={i} className="relative group/img">
                                <img src={url} alt={`cap ${i+1}`} className="h-8 w-8 object-cover rounded border border-white/60" />
                                <button onClick={() => removeScreenshot(url)} className="absolute -top-1 -right-1 hidden group-hover/img:flex h-4 w-4 bg-red-600 text-white rounded-full items-center justify-center text-[9px]">×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                      {/* Colonne Actions — vide pour la ligne de saisie */}
                      <TableCell style={{ minWidth: '110px', backgroundColor: '#22c55e' }} />
                    </TableRow>
                    
                    {/* Historique des traitements en dessous */}
                    {recentDetails.length > 0 && (
                      <TableRow style={{ backgroundColor: '#FFF9E6' }}>
                        <TableCell colSpan={14} className="py-1 px-2 text-[10px] font-semibold text-[#4472C4] uppercase tracking-wider text-center border-r border-black bg-[#FFC000]/20">
                          Historique du jour — {filteredDetails.length}/{recentDetails.length} traitement{recentDetails.length > 1 ? 's' : ''}
                          {Object.values(colFilters).some(s => s.size > 0) && (
                            <button onClick={() => setColFilters({})} className="ml-2 text-[9px] bg-orange-100 text-orange-700 border border-orange-300 rounded px-1.5 py-0.5 hover:bg-orange-200">✕ Effacer filtres</button>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredDetails.map((hist, idx) => {
                      const rowBg = rowColors[idx] || '#ffffff';
                      // Fixed-width cell: text truncates, full value shown via Popover on click
                      const editableCell = (col: string, val: string | undefined, fixedW = '120px') => {
                        const isOpen = histCellEdit?.idx === idx && histCellEdit?.col === col;
                        return (
                          <TableCell key={col} style={{ width: fixedW, minWidth: fixedW, maxWidth: fixedW, backgroundColor: rowBg, color: '#000000', overflow: 'hidden' }} className="px-0 py-1.5 border-r border-black">
                            <div className="flex items-center gap-0.5 group/cell px-2 w-full min-w-0">
                              {/* Truncated text — click to view full + edit */}
                              <Popover open={isOpen} onOpenChange={(open) => {
                                if (open) { setHistCellEdit({ idx, col }); setHistCellInput(val || ''); }
                                else { setHistCellEdit(null); }
                              }}>
                                <PopoverTrigger asChild>
                                  <button className="flex-1 min-w-0 text-left text-xs truncate overflow-hidden cursor-pointer hover:underline" title="Cliquer pour modifier">
                                    {val || <span className="text-gray-400">-</span>}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[260px] p-0 z-[9999]" align="start" side="bottom" avoidCollisions={true}>
                                  <div className="p-2 border-b">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">{col.replace(/_/g,' ')}</p>
                                    {val && <p className="text-[11px] text-foreground mb-2 break-words border rounded px-2 py-1 bg-muted/30">{val}</p>}
                                    <Input
                                      value={histCellInput}
                                      onChange={e => setHistCellInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') commitHistCellEdit(hist); }}
                                      placeholder="Nouvelle valeur…"
                                      className="h-7 text-xs"
                                      autoFocus
                                    />
                                  </div>
                                  <ScrollArea className="h-[150px]">
                                    <div className="p-1 flex flex-col gap-0.5">
                                      {processingOptions.filter(o => o.column_name === col).map(opt => (
                                        <div key={opt.id}
                                          className="px-2 py-1.5 text-xs rounded-sm hover:bg-accent cursor-pointer transition-colors"
                                          onClick={() => {
                                            setHistCellInput(opt.option_value);
                                            // Commit immediately with the chosen option
                                            saveProcessingDetails({ request_id: hist.request_id, [col]: opt.option_value } as ProcessingDetails)
                                              .then(() => {
                                                setRecentDetails(prev => prev.map((r, i) => i === idx ? { ...r, [col]: opt.option_value } : r));
                                                toast.success("Réponse mise à jour.");
                                              })
                                              .catch(() => toast.error("Erreur lors de la mise à jour."))
                                              .finally(() => setHistCellEdit(null));
                                          }}>
                                          {opt.option_value}
                                        </div>
                                      ))}
                                      {processingOptions.filter(o => o.column_name === col).length === 0 && (
                                        <div className="px-2 py-3 text-xs text-center text-muted-foreground">Aucune option prédéfinie</div>
                                      )}
                                    </div>
                                  </ScrollArea>
                                  <div className="p-2 border-t flex justify-end gap-1">
                                    <button onClick={() => setHistCellEdit(null)}
                                      className="px-2 py-1 text-[10px] rounded bg-gray-100 hover:bg-gray-200 border border-gray-300">Annuler</button>
                                    <button onClick={() => commitHistCellEdit(hist)}
                                      className="px-2 py-1 text-[10px] rounded bg-blue-500 hover:bg-blue-600 text-white border border-blue-600">OK</button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </TableCell>
                        );
                      };
                      return (
                        <TableRow key={idx} style={{ backgroundColor: rowBg, color: '#000000' }} className="hover:opacity-90">
                          {/* Fixed-width static cells */}
                          <TableCell style={{ width: columnWidths["numero"] || '110px', minWidth: columnWidths["numero"] || '110px', maxWidth: columnWidths["numero"] || '110px', backgroundColor: rowBg, color: '#000000', overflow: 'hidden' }} className="px-2 py-1.5 border-r border-black">
                            <span className="text-xs truncate block">{hist.request?.phone_to_certify}</span>
                          </TableCell>
                          {!hiddenColumns.includes('date') && (
                            <TableCell style={{ width: columnWidths["date"] || '110px', minWidth: columnWidths["date"] || '110px', maxWidth: columnWidths["date"] || '110px', backgroundColor: rowBg, color: '#000000', overflow: 'hidden' }} className="px-2 py-1.5 border-r border-black">
                              <span className="text-xs truncate block">{hist.request?.created_at ? format(new Date(hist.request.created_at), 'dd/MM HH:mm') : ''}</span>
                            </TableCell>
                          )}
                          {!hiddenColumns.includes('coach') && (
                            <TableCell style={{ width: columnWidths["coach"] || '100px', minWidth: columnWidths["coach"] || '100px', maxWidth: columnWidths["coach"] || '100px', backgroundColor: rowBg, color: '#000000', overflow: 'hidden' }} className="px-2 py-1.5 border-r border-black">
                              <span className="text-xs truncate block">{hist.request?.applicant?.username || 'Inconnu'}</span>
                            </TableCell>
                          )}
                          {editableCell('constat_webcare',       hist.constat_webcare,       columnWidths["constat_webcare"]       ? `${columnWidths["constat_webcare"]}px` : '130px')}
                          {editableCell('type_de_piece',         hist.type_de_piece,         columnWidths["type_de_piece"]         ? `${columnWidths["type_de_piece"]}px` : '80px')}
                          {editableCell('verbatim',              hist.verbatim,              columnWidths["verbatim"]              ? `${columnWidths["verbatim"]}px` : '130px')}
                          {editableCell('action_prise_gsm',      hist.action_prise_gsm,      columnWidths["action_prise_gsm"]      ? `${columnWidths["action_prise_gsm"]}px` : '130px')}
                          {editableCell('statut_final_gsm',      hist.statut_final_gsm,      columnWidths["statut_final_gsm"]      ? `${columnWidths["statut_final_gsm"]}px` : '110px')}
                          {editableCell('traitement',            hist.traitement,            columnWidths["traitement"]            ? `${columnWidths["traitement"]}px` : '110px')}
                          {editableCell('type_d_identification', hist.type_d_identification, columnWidths["type_d_identification"] ? `${columnWidths["type_d_identification"]}px` : '130px')}
                          {editableCell('raison_du_retard',      hist.raison_du_retard,      columnWidths["raison_du_retard"]      ? `${columnWidths["raison_du_retard"]}px` : '90px')}
                          {/* Capture d'écran */}
                          <TableCell style={{ width: '140px', minWidth: '140px', maxWidth: '140px', backgroundColor: rowBg, color: '#000000', overflow: 'hidden' }} className="px-2 py-1.5 border-r border-black">
                            {hist.screenshot_urls && hist.screenshot_urls.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {hist.screenshot_urls.map((url: string, i: number) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt={`cap ${i+1}`} className="h-8 w-8 object-cover rounded border border-black cursor-zoom-in" />
                                  </a>
                                ))}
                              </div>
                            ) : <span className="text-gray-400 text-[10px]">—</span>}
                          </TableCell>
                          {/* Actions : Couleur + Copier — color picker via portal to avoid table layout shifts */}
                          <TableCell style={{ width: '54px', minWidth: '54px', maxWidth: '54px', backgroundColor: rowBg, color: '#000000' }} className="px-1 py-1">
                            <div className="flex items-center gap-1">
                              {/* Couleur — Popover portal so it floats above the table without shifting rows */}
                              <Popover open={colorPickerRow === idx} onOpenChange={(open) => setColorPickerRow(open ? idx : null)}>
                                <PopoverTrigger asChild>
                                  <button title="Couleur de ligne"
                                    className="flex items-center justify-center h-6 w-6 rounded text-[10px] font-semibold border border-yellow-400 transition-colors"
                                    style={{ backgroundColor: rowColors[idx] || '#fde68a' }}>
                                    <Palette className="h-3 w-3 text-yellow-900" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-2 z-[9999]" align="end" side="top" avoidCollisions={true}>
                                  <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase">Couleur de la ligne</p>
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {ROW_COLORS.map(c => (
                                      <button key={c}
                                        onClick={() => {
                                          setRowColors(p => ({...p, [idx]: c}));
                                          setColorPickerRow(null);
                                          // Persist immediately to DB
                                          if (hist.request_id) saveProcessingDetails({ request_id: hist.request_id, row_color: c } as ProcessingDetails).catch(console.error);
                                        }}
                                        style={{ backgroundColor: c }}
                                        className="h-7 w-7 rounded-full border-2 border-white shadow hover:scale-110 transition-transform ring-1 ring-gray-300" />
                                    ))}
                                  </div>
                                  <button onClick={() => {
                                    setRowColors(p => { const n = {...p}; delete n[idx]; return n; });
                                    setColorPickerRow(null);
                                    if (hist.request_id) saveProcessingDetails({ request_id: hist.request_id, row_color: '' } as ProcessingDetails).catch(console.error);
                                  }}
                                    className="mt-2 w-full text-[10px] text-gray-500 hover:text-black py-1 rounded border border-gray-200 hover:bg-gray-50">
                                    Réinitialiser
                                  </button>
                                </PopoverContent>
                              </Popover>
                              {/* Copier */}
                              <button title="Copier les réponses" onClick={() => handleCopyRow(hist, idx)}
                                className="flex items-center justify-center h-6 w-6 rounded text-[10px] font-semibold bg-green-100 hover:bg-green-200 text-green-800 border border-green-300 transition-colors">
                                {copiedIdx === idx ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div style={{ backgroundColor: '#5C3317', height: '4px', flexShrink: 0 }} />
            {/* Hidden screenshot file input */}
            <input ref={screenshotInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => handleScreenshotUpload(e.target.files)} />
          </DialogContent>
        </Dialog>
      )}

      {showNextPrompt && (

        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CheckCircle2 size={24} className="text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-balance">
                  Demande clôturée avec succès
                </h3>
                <p className="text-sm text-muted-foreground mt-1 text-pretty">
                  L'option de passage manuel est activée. Que souhaitez-vous faire ?
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => navigate('/agent')} 
                className="flex-1 px-4 py-2.5 neu-flat text-sm font-semibold rounded-xl hover:text-primary transition-colors">
                Tableau de bord
              </button>
              <button 
                onClick={handleNextRequest} 
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm text-center">
                Passer à une autre demande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal blocage navigation ── */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-orange-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-balance">
                  Demande en cours de traitement
                </h3>
                <p className="text-sm text-muted-foreground mt-1 text-pretty">
                  Vous devez <strong>clôturer cette demande</strong> (Accepter, Rejeter ou Inchangé)
                  avant de pouvoir quitter cette page.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBlockModal(false)}
                className="neu-btn px-5 py-2.5 text-sm font-semibold">
                Rester sur la page
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Document" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </MainLayout>
  );
}
