import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getAgentRequests, getNotifications, getAgentDrafts, Draft , markNotificationRead, createVideoCall, createNotification, getRequestById, claimRequest } from '@/lib/api';
import { sendCallPush } from '@/contexts/VideoCallContext';
import { StatusBadge } from '@/components/common/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest, Notification } from '@/types/types';
import {
  ClipboardList, CheckCircle2, History, Clock,
  PauseCircle, PlayCircle, Coffee, PhoneCall, Phone, Bell, X,
  CheckCircle, XCircle, Timer, Lock, Loader2, Save,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import VideoCallModal from '@/components/video/VideoCallModal';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';

// Format seconds → "Xmin Ys"
function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}min ${sec}s` : `${sec}s`;
}

export default function AgentDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests]   = useState<VerificationRequest[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showTotalModal, setShowTotalModal] = useState(false);

  // ── Horloge en temps réel ──────────────────────────────
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Rappels ──────────────────────────────────────────
  const [recalls, setRecalls] = useState<Notification[]>([]);
  const [activeCall, setActiveCall] = useState<{ callId: string; requestId: string; remoteName: string } | null>(null);

  // ── Pause state ──────────────────────────────────────
  const [isPaused, setIsPaused]             = useState(false);
  const isPausedRef                         = useRef(false); // miroir ref pour load()
  const [pauseCount, setPauseCount]         = useState(0);
  const [totalPauseSec, setTotalPauseSec]   = useState(0);
  const [currentPauseSec, setCurrentPauseSec] = useState(0);
  const pauseSessionId                      = useRef<string | null>(null);
  const pauseTimerRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  const todayStr = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Brazzaville' }); // "YYYY-MM-DD" heure Brazzaville

  // Synchronise le ref dès que l'état change (toujours frais dans load)
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // Charge les demandes — exclut la file d'attente si l'agent est en pause
  const load = useCallback(async () => {
    if (!profile) return;
    const data = await getAgentRequests(profile.id, 200);
    // Quand l'agent est en pause : on ne lui montre que SES demandes (pas la file publique)
    setRequests(isPausedRef.current ? data.filter(r => r.agent_id === profile.id) : data);
    const draftsData = await getAgentDrafts(profile.id);
    setDrafts(draftsData);
    setLoading(false);
  }, [profile]);
  const loadRecalls = useCallback(async () => {
    if (!profile) return;
    const notifs = await getNotifications(profile.id, 50);
    setRecalls(notifs.filter(n => n.type === 'recall_request' && !n.is_read));
  }, [profile]);

  // ── Load today's pause stats from DB ────────────────
  const loadPauseStats = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('pause_sessions')
      .select('duration_seconds, ended_at')
      .eq('agent_id', profile.id)
      .gte('started_at', todayStr + 'T00:00:00')
      .lte('started_at', todayStr + 'T23:59:59');
    if (!Array.isArray(data)) return;
    setPauseCount(data.length);
    const completedSec = data
      .filter(p => p.ended_at !== null)
      .reduce((acc, p) => acc + (p.duration_seconds ?? 0), 0);
    setTotalPauseSec(completedSec);
  }, [profile, todayStr]);

  useEffect(() => { load(); loadPauseStats(); loadRecalls(); }, [load, loadPauseStats, loadRecalls]);

  // ── Restaure l'état de pause depuis la DB au montage ─────────────────────
  // Garantit que le rafraîchissement de la page préserve l'état en pause
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_paused')
        .eq('id', profile.id)
        .maybeSingle();
      if (data?.is_paused) {
        setIsPaused(true);
        // Cherche une session de pause ouverte (sans ended_at) pour la reprendre
        const { data: openSession } = await supabase
          .from('pause_sessions')
          .select('id')
          .eq('agent_id', profile.id)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openSession) pauseSessionId.current = openSession.id;
        // Recharge en mode paused pour vider la file d'attente
        isPausedRef.current = true;
        load();
      }
    })();
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime — filtres précis pour éviter les rechargements globaux ─────────
  useEffect(() => {
    if (!profile) return;
    // Écoute uniquement les demandes assignées à cet agent
    const chReq = supabase.channel(`agent-requests-${profile.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'verification_requests',
        filter: `agent_id=eq.${profile.id}`,
      }, () => load())
      // Écoute aussi les nouvelles demandes non assignées (agent_id IS NULL)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'verification_requests',
      }, () => load())
      .subscribe();
    // Recharge aussi quand un traitement est enregistré (processing_details)
    const chDetails = supabase.channel(`agent-details-${profile.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'processing_details',
        filter: `request_id=eq.${profile.id}`,
      }, () => load())
      .subscribe();
    // Écoute les nouvelles notifications de rappel
    const chNotifs = supabase.channel(`agent-notifs-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, () => loadRecalls())
      .subscribe();
    return () => {
      supabase.removeChannel(chReq);
      supabase.removeChannel(chDetails);
      supabase.removeChannel(chNotifs);
    };
  }, [profile, load, loadRecalls]);

  // ── Pause live timer ─────────────────────────────────
  useEffect(() => {
    if (isPaused) {
      setCurrentPauseSec(0);
      pauseTimerRef.current = setInterval(() => setCurrentPauseSec(s => s + 1), 1000);
    } else {
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
      setCurrentPauseSec(0);
    }
    return () => { if (pauseTimerRef.current) clearInterval(pauseTimerRef.current); };
  }, [isPaused]);

  // ── Toggle pause ─────────────────────────────────────
  async function togglePause() {
    if (!profile) return;
    if (!isPaused) {
      // Start pause — vide immédiatement la file d'attente
      const { data, error } = await supabase
        .from('pause_sessions')
        .insert({ agent_id: profile.id })
        .select('id')
        .single();
      if (error) { toast.error('Erreur lors de la mise en pause.'); return; }
      pauseSessionId.current = data.id;
      await supabase.from('profiles').update({ is_paused: true }).eq('id', profile.id);
      setIsPaused(true);
      isPausedRef.current = true;
      setPauseCount(c => c + 1);
      // Recharge en mode paused : filtre les demandes en attente
      load();
      toast.info('⏸ Pause activée — vous ne recevrez plus de nouvelles demandes.');
    } else {
      // End pause — réaffiche la file d'attente
      if (pauseSessionId.current) {
        await supabase
          .from('pause_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', pauseSessionId.current);
        pauseSessionId.current = null;
      }
      await supabase.from('profiles').update({ is_paused: false }).eq('id', profile.id);
      setIsPaused(false);
      isPausedRef.current = false;
      setTotalPauseSec(s => s + currentPauseSec);
      // Recharge en mode actif : montre de nouveau la file d'attente
      load();
      toast.success('▶ Pause terminée — vous êtes de nouveau disponible.');
    }
  }

  // ── Dismiss recall ───────────────────────────────────
  async function dismissRecall(id: string) {
    await markNotificationRead(id);
    setRecalls(prev => prev.filter(r => r.id !== id));
  }

  const [claiming, setClaiming] = useState(false);

  // ── Appeler depuis un rappel ─────────────────────────
  async function handleCallRecall(notif: Notification) {
    if (!profile || !notif.request_id) return;
    const req = await getRequestById(notif.request_id);
    if (!req) { toast.error('Demande introuvable.'); return; }
    const call = await createVideoCall({ request_id: req.id, agent_id: profile.id, applicant_id: req.applicant_id });
    if (!call) { toast.error("Impossible de démarrer l'appel."); return; }
    // Créer l'état RINGING avant toute diffusion ou notification.
    const { error: stateError } = await supabase.from('video_call_states').upsert([{
      call_id: call.id,
      caller_id: profile.id,
      receiver_id: req.applicant_id,
      state: 'RINGING',
      caller_name: profile.username,
      request_id: req.id,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }], { onConflict: 'call_id' });
    if (stateError) { toast.error("Impossible de préparer l'appel."); return; }

    // Broadcast + notification vers le coach mobile
    const broadcastPayload = { call_id: call.id, applicant_id: req.applicant_id, agent_name: profile.username, request_id: req.id, expires_at: new Date(Date.now() + 60_000).toISOString() };
    const ch = supabase.channel(`user-call-${req.applicant_id}`);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'call_offer', payload: broadcastPayload });
        setTimeout(() => supabase.removeChannel(ch), 2000);
      }
    });
    await createNotification({
      user_id: req.applicant_id,
      type: 'call_started',
      title: 'Appel vidéo entrant',
      body: `L'agent ${profile.username} vous rappelle pour votre demande.`,
      request_id: req.id,
    });
    // Envoyer notification push FCM (app fermée / verrouillée)
    await sendCallPush({
      callId:     call.id,
      receiverId: req.applicant_id,
            callerName: profile.username ?? 'Agent Konolive',
      requestId:   req.id,
      action:      'INVITE',
      expiresAt:   new Date(Date.now() + 60_000).toISOString(),
    });
    // Marquer la notif rappel comme lue + ouvrir l'appel
    await dismissRecall(notif.id);
    setActiveCall({ callId: call.id, requestId: req.id, remoteName: req.applicant?.username ?? 'Coach mobile' });
  }

  // ── Derived stats — file d'attente = TOUTES les demandes non traitées ──
  const todayBZV = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Brazzaville' }); // "YYYY-MM-DD" heure Brazzaville
  // Toutes les demandes en attente, quelle que soit la date de création
  const pending    = requests.filter(r => r.status === 'pending');
  // Toutes les demandes en cours pour cet agent
  const processing = requests.filter(r => r.status === 'processing' && r.agent_id === profile?.id);

  const myProcessed = requests.filter(r =>
    ['accepted', 'rejected'].includes(r.status) && r.agent_id === profile?.id
  );

  // Convertit un timestamp ISO en date "YYYY-MM-DD" heure Brazzaville (UTC+1)
  function toBZVDate(iso: string | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Africa/Brazzaville' });
  }

  const todayProcessed = myProcessed.filter(r =>
    toBZVDate(r.processed_at ?? r.updated_at) === todayBZV
  );
  const totalProcessed  = todayProcessed.length;
  const todayAccepted   = todayProcessed.filter(r => r.status === 'accepted').length;
  const todayRejected   = todayProcessed.filter(r => r.status === 'rejected').length;

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* ── En-tête ───────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="page-title">Tableau de bord</h1>
            <p className="page-subtitle mt-0.5">Bienvenue, <span className="font-semibold text-foreground">{profile?.username}</span>. Voici votre charge de travail.</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Horloge */}
            <div className="saas-card flex items-center gap-3 px-4 py-2.5">
              <Timer size={15} className="text-primary shrink-0" />
              <div className="tabular-nums text-right">
                <p className="text-base font-bold text-foreground leading-none">
                  {now.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                  {now.toLocaleDateString('fr-FR', { timeZone: 'Africa/Brazzaville', weekday: 'short', day: '2-digit', month: 'short' })}
                </p>
              </div>
            </div>

            {/* Bouton pause */}
            <button
              onClick={togglePause}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 text-white ${
                isPaused
                  ? 'bg-green-500 hover:bg-green-600 shadow-md'
                  : 'bg-orange-500 hover:bg-orange-600 shadow-md'
              }`}
            >
              {isPaused
                ? <><PlayCircle size={16} /> Reprendre</>
                : <><PauseCircle size={16} /> Pause</>}
            </button>
          </div>
        </div>

        {/* ── Bandeau pause ─────────────────────────── */}
        {isPaused && (
          <div className="flex items-center gap-4 px-5 py-3.5 rounded-xl border border-orange-400/30 bg-orange-400/5 animate-in slide-in-from-top-2">
            <Coffee size={18} className="text-orange-500 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm">Pause en cours</p>
              <p className="text-xs text-muted-foreground">
                Durée : <span className="font-bold text-orange-500 tabular-nums">{fmtSec(currentPauseSec)}</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">Total pauses</p>
              <p className="font-bold text-sm text-foreground tabular-nums">{pauseCount} · {fmtSec(totalPauseSec + currentPauseSec)}</p>
            </div>
          </div>
        )}

        {/* ── KPI cards ─────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "File d'attente",      value: pending.length,        icon: <Clock size={18} />,       color: 'text-orange-500',  bg: 'bg-orange-500/10', clickable: false },
            { label: 'En cours de traitement', value: processing.length, icon: <ClipboardList size={18}/>, color: 'text-yellow-600', bg: 'bg-yellow-500/10', clickable: false },
            { label: "Traités aujourd'hui",  value: todayProcessed.length, icon: <CheckCircle2 size={18}/>,  color: 'text-green-500',  bg: 'bg-green-500/10',  clickable: false },
            { label: 'Total traité',         value: totalProcessed,        icon: <History size={18}/>,       color: 'text-violet-500', bg: 'bg-violet-500/10', clickable: true  },
            { label: 'Pauses auj.',          value: pauseCount,            icon: <PauseCircle size={18}/>,   color: 'text-orange-400', bg: 'bg-orange-400/10', clickable: false },
            { label: 'Durée pauses',         value: fmtSec(totalPauseSec + (isPaused ? currentPauseSec : 0)),
              icon: <Coffee size={18}/>, color: 'text-amber-500', bg: 'bg-amber-500/10', isText: true, clickable: false },
          ].map(s => {
            const inner = (
              <div className="flex flex-col h-full gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.bg} ${s.color}`}>
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide leading-tight">{s.label}</p>
                  <p className={`font-bold mt-1 leading-none ${s.color} ${'isText' in s && s.isText ? 'text-sm' : 'text-2xl'}`}>
                    {loading ? <span className="inline-block w-8 h-6 bg-muted rounded animate-pulse" /> : s.value}
                  </p>
                </div>
                {s.clickable && <p className="text-[10px] text-violet-400 font-medium">Voir le détail →</p>}
              </div>
            );
            return s.clickable ? (
              <button key={s.label} type="button" onClick={() => setShowTotalModal(true)}
                className="kpi-card text-left hover:shadow-md transition-all">
                {inner}
              </button>
            ) : (
              <div key={s.label} className="kpi-card">{inner}</div>
            );
          })}
        </div>

        {/* ── Rappels demandés ──────────────────────── */}
        {recalls.length > 0 && (
          <div className="saas-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-destructive animate-bounce" />
              <h2 className="font-semibold text-foreground text-sm">Rappels demandés</h2>
              <span className="ml-1 text-xs font-bold bg-destructive text-destructive-foreground rounded-full px-2 py-0.5">
                {recalls.length}
              </span>
            </div>
            <div className="space-y-2">
              {recalls.map(r => {
                const phoneMatch = r.body.match(/\+[\d]+/);
                const phone = phoneMatch ? phoneMatch[0] : '';
                return (
                  <div key={r.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 border-destructive/60 bg-destructive/5">
                    <PhoneCall size={16} className="text-destructive shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.body}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCallRecall(r)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
                      >
                        <Phone size={13} />Appeler
                      </button>
                      <button
                        onClick={() => dismissRecall(r.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Ignorer"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── File de demandes ──────────────────────── */}
        <div className="saas-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Vos demandes en cours</h2>
              {!loading && processing.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {processing.length}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : isPaused ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-orange-400/10 flex items-center justify-center">
                <Coffee size={22} className="text-orange-400 animate-pulse" />
              </div>
              <p className="font-semibold text-foreground text-sm">Pause active</p>
              <p className="text-xs text-muted-foreground max-w-[220px] text-pretty">
                La file est masquée pendant la pause. Reprenez pour traiter de nouvelles demandes.
              </p>
              <button onClick={togglePause}
                className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors">
                <PlayCircle size={14} />Reprendre maintenant
              </button>
            </div>
          ) : (
            <>
              {/* Demandes assignées */}
              {processing.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-sm bg-muted/30 rounded-xl mb-4 border border-dashed border-border">
                  Aucune demande en cours de traitement.
                </div>
              ) : (
                <div className="space-y-2 mb-5">
                  {processing.map(r => (
                    <Link key={r.id} to={`/agent/process/${r.id}`}
                      className="flex items-center gap-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.phone_to_certify}</p>
                        <p className="text-xs text-primary truncate">
                          {r.assignment_source === 'automatic' ? 'Attribution automatique' : 'Prise manuelle'} · Ouverture automatique du traitement
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  ))}
                </div>
              )}

              {/* Demandes en attente */}
              {pending.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="pending" className="border-none">
                    <AccordionTrigger className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/40 hover:bg-muted/60 hover:no-underline text-sm font-semibold transition-colors">
                      <div className="flex items-center gap-2">
                        <Lock size={14} className="text-muted-foreground" />
                        Demandes en attente
                        <span className="text-xs font-normal text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                          {pending.length}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <div className="space-y-2">
                        {pending.slice(0, 1).map(r => (
                          <div key={r.id} className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-muted/20 border border-border hover:border-primary/30 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <Lock size={14} className="text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{r.phone_to_certify}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock size={10} />En attente d'assignation
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <StatusBadge status={r.status} />
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  if (!profile || claiming) return;
                                  if (processing.length >= 2) {
                                    toast.error("Limite de 2 demandes simultanées atteinte.");
                                    return;
                                  }
                                  setClaiming(true);
                                  const { error } = await claimRequest(r.id, profile.id);
                                  if (error) {
                                    toast.error("Impossible de s'attribuer cette demande.");
                                  } else {
                                    toast.success(`Demande +${r.phone_to_certify} ajoutée.`);
                                    setClaiming(false);
                                    await load();
                                    navigate(`/agent/process/${r.id}`);
                                    return;
                                  }
                                  setClaiming(false);
                                  load();
                                }}
                                disabled={claiming || processing.length >= 2}
                                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                {claiming ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                Prendre
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Appel vidéo depuis rappel ─────────────── */}
      {activeCall && (
        <VideoCallModal
          callId={activeCall.callId}
          remoteUserName={activeCall.remoteName}
          isInitiator={true}
          requestId={activeCall.requestId}
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* ── Modale détail Total traité ────────────── */}
      <Dialog open={showTotalModal} onOpenChange={setShowTotalModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History size={16} className="text-violet-500" />
              Total traité aujourd'hui
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            {[
              { icon: <CheckCircle size={16} className="text-green-500" />, label: 'Numéros acceptés', value: todayAccepted, color: 'text-green-500' },
              { icon: <XCircle size={16} className="text-destructive" />,   label: 'Numéros rejetés',  value: todayRejected, color: 'text-destructive' },
              { icon: <History size={16} className="text-violet-500" />,    label: 'Total traité',     value: totalProcessed, color: 'text-violet-500' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted/30 border border-border">
                <div className="flex items-center gap-2">
                  {row.icon}
                  <span className="text-sm font-medium text-foreground">{row.label}</span>
                </div>
                <span className={`text-2xl font-bold tabular-nums ${row.color}`}>
                  {loading ? '—' : row.value}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
