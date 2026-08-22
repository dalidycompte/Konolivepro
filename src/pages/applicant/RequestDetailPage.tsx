import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoCall } from '@/contexts/VideoCallContext';
import { getRequestById, resolveDocuments, createNotification } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest } from '@/types/types';
import { Phone, FileImage, ArrowLeft, ZoomIn, X, XCircle, MoreHorizontal, PhoneCall, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { startCall, endCall } = useVideoCall();
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // ── Modal "Rappel moi" ────────────────────────────────
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [recallReason, setRecallReason] = useState('');
  const [recallSent, setRecallSent] = useState(false);
  const [recallSending, setRecallSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const req = await getRequestById(id);
    setRequest(req);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Temps réel ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !profile) return;
    const ch = supabase.channel(`req-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests', filter: `id=eq.${id}` }, () => load())
      .on('broadcast', { event: 'call_offer' }, payload => {
        if (payload.payload?.applicant_id === profile.id) {
          // Ouvre la fenêtre flottante globale — survivra à toute navigation
          startCall({
            callId: payload.payload.call_id,
            remoteUserName: payload.payload.agent_name ?? 'Agent',
            isInitiator: false,
            requestId: id,
          });
        }
      })
      // Fermer l'appel entrant si l'agent raccroche avant que la connexion WebRTC soit établie
      .on('broadcast', { event: 'call_end' }, () => {
        endCall();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, profile, load, startCall, endCall]);

  // ── Envoyer la demande de rappel avec raison ──────────
  async function handleSendRecall() {
    if (!request || !profile || !request.agent_id || !recallReason.trim()) return;
    setRecallSending(true);
    await createNotification({
      user_id: request.agent_id,
      type: 'recall_request',
      title: 'Rappel demandé',
      body: `${profile.username} : ${recallReason.trim()} (numéro +${request.phone_to_certify})`,
      request_id: request.id,
    });
    const ch = supabase.channel(`recall-${request.agent_id}`);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({
          type: 'broadcast',
          event: 'recall_request',
          payload: { request_id: request.id, phone: request.phone_to_certify, from: profile.username, reason: recallReason.trim() },
        });
        setTimeout(() => supabase.removeChannel(ch), 2000);
      }
    });
    setRecallSending(false);
    setShowRecallModal(false);
    setRecallReason('');
    setRecallSent(true);
    toast.success("Demande de rappel envoyée à l'agent.");
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
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <Link to="/dashboard/requests" className="neu-flat w-9 h-9 rounded-xl flex items-center justify-center hover:text-primary transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground text-balance">Détails de la demande</h1>
            <p className="text-xs text-muted-foreground font-mono">{request.id}</p>
          </div>
          <StatusBadge status={request.status} className="ml-auto shrink-0" />
        </div>

        {/* Info + action row */}
        <div className="neu-card">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <Phone size={18} className="text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Numéro à certifier</p>
                <p className="font-bold text-lg text-foreground">+{request.phone_to_certify}</p>
              </div>
            </div>
            {/* Bouton Rappel moi — demandes acceptées ou rejetées uniquement */}
            {(['accepted', 'rejected'] as string[]).includes(request.status) && request.agent_id && (
              <button
                type="button"
                onClick={() => { setRecallReason(''); setShowRecallModal(true); }}
                disabled={recallSent}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all neu-btn text-orange-600 border border-orange-400/40 disabled:opacity-60 shrink-0"
              >
                <PhoneCall size={15} />
                <span>{recallSent ? 'Rappel envoyé ✓' : 'Rappel moi'}</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Soumise le</p>
              <p className="text-sm font-medium">{format(new Date(request.created_at), 'dd MMM yyyy HH:mm')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Agent assigné</p>
              <p className="text-sm font-medium">{request.agent?.username ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Documents & Statut — section unifiée */}
        {docs ? (
          <div className="neu-card space-y-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <FileImage size={17} className="text-primary" />
              Documents &amp; Statut
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Recto de la pièce d'identité", url: docs.doc_front_url },
                { label: "Verso de la pièce d'identité", url: docs.doc_back_url },
                { label: 'Photo en direct', url: docs.live_photo_url },
              ].map(d => (
                <div key={d.label} className="neu-pressed rounded-xl overflow-hidden">
                  <div className="aspect-[4/3] w-full overflow-hidden relative group cursor-pointer" onClick={() => d.url && setLightbox(d.url)}>
                    {d.url ? (
                      <>
                        <img src={d.url} alt={d.label} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                          <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">Non téléversé</div>
                    )}
                  </div>
                  <p className="text-xs text-center py-2 text-muted-foreground font-medium">{d.label}</p>
                </div>
              ))}
            </div>

            {/* Divider + statut résumé */}
            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Statut de votre demande</span>
                <StatusBadge status={request.status} />
              </div>
              {request.status === 'rejected' && request.notes && (
                <div className="neu-pressed rounded-xl px-4 py-3 flex items-start gap-3 border-l-4 border-red-400">
                  <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Motif du rejet</p>
                    <p className="text-sm text-foreground mt-0.5">{request.notes}</p>
                  </div>
                </div>
              )}
              {request.status === 'other' && request.notes && (
                <div className="neu-pressed rounded-xl px-4 py-3 flex items-start gap-3 border-l-4 border-amber-400">
                  <MoreHorizontal size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Motif — Autre</p>
                    <p className="text-sm text-foreground mt-0.5">{request.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="neu-card">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-2">
              <FileImage size={17} className="text-primary" />
              Documents &amp; Statut
            </h2>
            <p className="text-sm text-muted-foreground">Aucun document soumis pour cette demande.</p>
            <div className="border-t border-border pt-3 mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Statut de votre demande</span>
                <StatusBadge status={request.status} />
              </div>
              {request.status === 'rejected' && request.notes && (
                <div className="neu-pressed rounded-xl px-4 py-3 flex items-start gap-3 border-l-4 border-red-400">
                  <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Motif du rejet</p>
                    <p className="text-sm text-foreground mt-0.5">{request.notes}</p>
                  </div>
                </div>
              )}
              {request.status === 'other' && request.notes && (
                <div className="neu-pressed rounded-xl px-4 py-3 flex items-start gap-3 border-l-4 border-amber-400">
                  <MoreHorizontal size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Motif — Autre</p>
                    <p className="text-sm text-foreground mt-0.5">{request.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightbox && (
          <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
            <button className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all" onClick={() => setLightbox(null)}>
              <X size={20} />
            </button>
            <img src={lightbox} alt="Document en plein écran" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          </div>
        )}

        {/* ── Modal raison du rappel ── */}
        {showRecallModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowRecallModal(false)}>
            <div className="w-full max-w-[calc(100%-2rem)] md:max-w-md neu-card space-y-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <PhoneCall size={20} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-balance">Demande de rappel</h3>
                    <p className="text-xs text-muted-foreground">Numéro +{request.phone_to_certify}</p>
                  </div>
                </div>
                <button onClick={() => setShowRecallModal(false)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-destructive transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Raison du rappel <span className="text-destructive">*</span>
                </label>
                <textarea
                  className="neu-input resize-none w-full"
                  rows={3}
                  placeholder="Ex : J'ai des questions sur le résultat de ma vérification…"
                  value={recallReason}
                  onChange={e => setRecallReason(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowRecallModal(false)} className="neu-btn px-4 py-2 rounded-xl text-sm font-medium">
                  Annuler
                </button>
                <button
                  onClick={handleSendRecall}
                  disabled={!recallReason.trim() || recallSending}
                  className="neu-btn-primary px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {recallSending
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send size={15} />}
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
