import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  getRejectionReasons, saveRejectionReasons, getOtherReasons, saveOtherReasons,
  getWorkPeriodConfig, saveWorkPeriodConfig, getCurrentWorkPeriod,
  getWorkPeriodHistory,
  type WorkPeriodConfig, type WorkPeriodCurrent, type WorkPeriodHistoryRow,
} from '@/lib/api';
import {
  Settings, MapPin, ShieldAlert, CheckCircle2, Save, RotateCcw,
  XCircle, Plus, Trash2, GripVertical, Pencil, Check, X, MoreHorizontal, Link as LinkIcon, Copy, RefreshCw, Loader2,
  CalendarDays, ChevronRight, Info, History, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const ALL_LOCALITIES = [
  'Brazzaville',
  'Pointe-Noire',
  'Bouenza',
  'Congo-Oubangui',
  'Cuvette',
  'Cuvette-Ouest',
  'Djoué-Léfini',
  'Kouilou',
  'Lékoumou',
  'Likouala',
  'Niari',
  'Nkéni-Alima',
  'Plateaux',
  'Pool',
  'Sangha',
];

export default function SupervisorSettingsPage() {
  const { profile } = useAuth();
  const [disabledLocalities, setDisabledLocalities] = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  // ── Motifs de rejet ──────────────────────────────────
  const [reasons, setReasons]               = useState<string[]>([]);
  const [reasonsDirty, setReasonsDirty]     = useState(false);
  const [reasonsSaving, setReasonsSaving]   = useState(false);
  const [newReason, setNewReason]           = useState('');
  const [editIdx, setEditIdx]               = useState<number | null>(null);
  const [editValue, setEditValue]           = useState('');

  // ── Motifs "Autre" ───────────────────────────────────
  const [otherReasons, setOtherReasons]             = useState<string[]>([]);
  const [otherReasonsDirty, setOtherReasonsDirty]   = useState(false);
  const [otherReasonsSaving, setOtherReasonsSaving] = useState(false);
  const [newOtherReason, setNewOtherReason]         = useState('');
  const [otherEditIdx, setOtherEditIdx]             = useState<number | null>(null);
  const [otherEditValue, setOtherEditValue]         = useState('');

  // ── Lien public ──────────────────────────────────────
  const [publicLinkToken, setPublicLinkToken]       = useState<string | null>(null);
  const [loadingLink, setLoadingLink]               = useState(false);

  // ── Période de travail / Paie ─────────────────────
  const [workPeriod, setWorkPeriod]                 = useState<WorkPeriodConfig | null>(null);
  const [currentPeriod, setCurrentPeriod]           = useState<WorkPeriodCurrent | null>(null);
  const [periodHistory, setPeriodHistory]           = useState<WorkPeriodHistoryRow[]>([]);
  const [periodStartDay, setPeriodStartDay]         = useState<string>('15');
  const [periodSaving, setPeriodSaving]             = useState(false);
  const [periodDirty, setPeriodDirty]               = useState(false);
  const [periodLoading, setPeriodLoading]           = useState(false);
  const [showHistory, setShowHistory]               = useState(false);
  const [periodSaveConfirmed, setPeriodSaveConfirmed] = useState(false);

  // ── Charger les paramètres depuis la DB ──────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [localData, reasonData, otherData] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'disabled_localities').maybeSingle(),
      getRejectionReasons(),
      getOtherReasons(),
    ]);
    if (localData.data?.value && Array.isArray(localData.data.value)) {
      setDisabledLocalities(localData.data.value as string[]);
    } else {
      setDisabledLocalities([]);
    }
    setReasons(reasonData);
    setOtherReasons(otherData);
    setPublicLinkToken(null);
    setLoading(false);
    setDirty(false);
    setReasonsDirty(false);
    setOtherReasonsDirty(false);
  }, []);

  // ── Charger la configuration période de travail ───────
  const loadWorkPeriod = useCallback(async () => {
    setPeriodLoading(true);
    const [cfg, current, history] = await Promise.all([
      getWorkPeriodConfig(),
      getCurrentWorkPeriod(),
      getWorkPeriodHistory(),
    ]);
    setWorkPeriod(cfg);
    setCurrentPeriod(current);
    setPeriodHistory(history);
    if (cfg) setPeriodStartDay(String(cfg.start_day));
    setPeriodDirty(false);
    setPeriodLoading(false);
  }, []);

  useEffect(() => { load(); loadWorkPeriod(); }, [load, loadWorkPeriod]);

  // ── Sauvegarder la période de travail ─────────────────
  async function saveWorkPeriod() {
    if (!profile) {
      toast.error('Votre session a expiré. Reconnectez-vous avant de sauvegarder.');
      return;
    }
    const startDay = parseInt(periodStartDay, 10);
    if (isNaN(startDay) || startDay < 1 || startDay > 28) {
      toast.error('Le jour de début doit être entre 1 et 28.');
      return;
    }
    setPeriodSaving(true);
    try {
      const ok = await saveWorkPeriodConfig({ start_day: startDay }, profile.id);
      if (!ok) {
        toast.error('Échec de la sauvegarde de la période.');
        return;
      }
      await loadWorkPeriod();
      setPeriodSaveConfirmed(true);
      toast.success('Cycle sauvegardé avec succès.');
    } catch (error) {
      console.error('Erreur sauvegarde cycle:', error);
      toast.error('Échec de la sauvegarde de la période. Réessayez dans quelques instants.');
    } finally {
      setPeriodSaving(false);
    }
  }

  function fmtDate(iso?: string) {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'd MMMM yyyy', { locale: fr }); }
    catch { return iso; }
  }

  function computeEndDay(startDay: number): number {
    return startDay <= 1 ? 28 : startDay - 1;
  }

  // ── Toggle localité ──────────────────────────────────
  function toggleLocality(loc: string) {
    setDisabledLocalities(prev => {
      const next = prev.includes(loc)
        ? prev.filter(l => l !== loc)
        : [...prev, loc];
      setDirty(true);
      return next;
    });
  }

  function selectAll() {
    setDisabledLocalities([...ALL_LOCALITIES]);
    setDirty(true);
  }

  function clearAll() {
    setDisabledLocalities([]);
    setDirty(true);
  }

  // ── Sauvegarder localités ────────────────────────────
  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .update({ value: disabledLocalities, updated_at: new Date().toISOString(), updated_by: profile.id })
      .eq('key', 'disabled_localities');
    setSaving(false);
    if (error) {
      toast.error('Échec de la sauvegarde.', { description: error.message });
    } else {
      toast.success('Paramètres sauvegardés.');
      setDirty(false);
    }
  }

  // ── Motifs de rejet — CRUD ───────────────────────────
  function addReason() {
    const trimmed = newReason.trim();
    if (!trimmed || reasons.includes(trimmed)) return;
    setReasons(prev => [...prev, trimmed]);
    setNewReason('');
    setReasonsDirty(true);
  }

  function removeReason(idx: number) {
    setReasons(prev => prev.filter((_, i) => i !== idx));
    setReasonsDirty(true);
  }

  function startEdit(idx: number) {
    setEditIdx(idx);
    setEditValue(reasons[idx]);
  }

  function confirmEdit() {
    if (editIdx === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) { cancelEdit(); return; }
    setReasons(prev => prev.map((r, i) => (i === editIdx ? trimmed : r)));
    setReasonsDirty(true);
    cancelEdit();
  }

  function cancelEdit() {
    setEditIdx(null);
    setEditValue('');
  }

  async function saveReasons() {
    if (!profile) return;
    setReasonsSaving(true);
    const ok = await saveRejectionReasons(reasons, profile.id);
    setReasonsSaving(false);
    if (ok) {
      toast.success('Motifs de rejet sauvegardés.');
      setReasonsDirty(false);
    } else {
      toast.error('Échec de la sauvegarde des motifs.');
    }
  }

  // ── Motifs "Autre" — CRUD ────────────────────────────
  function addOtherReason() {
    const trimmed = newOtherReason.trim();
    if (!trimmed || otherReasons.includes(trimmed)) return;
    setOtherReasons(prev => [...prev, trimmed]);
    setNewOtherReason('');
    setOtherReasonsDirty(true);
  }

  function removeOtherReason(idx: number) {
    setOtherReasons(prev => prev.filter((_, i) => i !== idx));
    setOtherReasonsDirty(true);
  }

  function startOtherEdit(idx: number) {
    setOtherEditIdx(idx);
    setOtherEditValue(otherReasons[idx]);
  }

  function confirmOtherEdit() {
    if (otherEditIdx === null) return;
    const trimmed = otherEditValue.trim();
    if (!trimmed) { cancelOtherEdit(); return; }
    setOtherReasons(prev => prev.map((r, i) => (i === otherEditIdx ? trimmed : r)));
    setOtherReasonsDirty(true);
    cancelOtherEdit();
  }

  function cancelOtherEdit() {
    setOtherEditIdx(null);
    setOtherEditValue('');
  }

  async function saveOtherReasonsHandler() {
    if (!profile) return;
    setOtherReasonsSaving(true);
    const ok = await saveOtherReasons(otherReasons, profile.id);
    setOtherReasonsSaving(false);
    if (ok) {
      toast.success('Motifs « Autre » sauvegardés.');
      setOtherReasonsDirty(false);
    } else {
      toast.error('Échec de la sauvegarde des motifs « Autre ».');
    }
  }

  // ── Gestion lien public ──────────────────────────────
  async function generatePublicLink() {
    if (!profile) return;
    setLoadingLink(true);
    try {
      const { data, error } = await supabase
        .rpc('create_public_dashboard_link');
      
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.token) throw new Error('Lien public non généré.');
      setPublicLinkToken(result.token);
      const url = `${window.location.origin}${window.location.pathname}#/public/dashboard/${result.token}`;
      try {
        await navigator.clipboard?.writeText(url);
        toast.success('Lien public généré et copié. Valable 30 jours.');
      } catch {
        toast.success('Lien public généré. Utilisez le bouton Copier.');
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '';
      if (message.includes('PUBLIC_DASHBOARD_LINK_FORBIDDEN')) {
        toast.error('Votre compte ne peut pas générer de lien public.');
      } else if (message.includes('AUTHENTICATION_REQUIRED')) {
        toast.error('Votre session a expiré. Reconnectez-vous puis réessayez.');
      } else {
        toast.error('Erreur lors de la génération du lien.', {
          description: message || 'Réessayez dans quelques instants.',
        });
      }
    } finally {
      setLoadingLink(false);
    }
  }

  function copyPublicLink() {
    if (!publicLinkToken) return;
    const url = `${window.location.origin}${window.location.pathname}#/public/dashboard/${publicLinkToken}`;
    navigator.clipboard?.writeText(url)
      .then(() => toast.success('Lien copié dans le presse-papiers.'))
      .catch(() => toast.error('Copiez le lien affiché manuellement.'));
  }

  const enabledCount  = ALL_LOCALITIES.length - disabledLocalities.length;
  const disabledCount = disabledLocalities.length;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* En-tête */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance flex items-center gap-2">
              <Settings size={24} className="text-primary" />
              Paramètres
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configurez les règles globales de l'application.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={load}
              disabled={loading}
              className="neu-btn flex items-center gap-2 px-4 py-2 text-sm"
            >
              <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
              Réinitialiser
            </button>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="neu-btn-primary flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save size={15} />}
              Sauvegarder
            </button>
          </div>
        </div>

        {/* Section : Demandes d'appel par localité */}
        <div className="neu-card space-y-5">
          <div className="flex items-start gap-3">
            <div className="neu-flat w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
              <ShieldAlert size={20} className="text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-foreground">Désactiver le bouton "Demande d'appel"</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Les coachs mobiles des localités désactivées ne pourront plus soumettre de nouvelles demandes de vérification.
              </p>
            </div>
          </div>

          {/* Compteurs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="neu-pressed rounded-xl px-4 py-3 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Activées</p>
                <p className="text-2xl font-bold text-green-600">{enabledCount}</p>
              </div>
            </div>
            <div className="neu-pressed rounded-xl px-4 py-3 flex items-center gap-3">
              <ShieldAlert size={18} className="text-orange-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Désactivées</p>
                <p className="text-2xl font-bold text-orange-500">{disabledCount}</p>
              </div>
            </div>
          </div>

          {/* Actions rapides */}
          <div className="flex gap-3 flex-wrap">
            <button onClick={selectAll} className="neu-btn text-xs px-3 py-1.5 text-orange-500 hover:text-orange-600">
              Tout désactiver
            </button>
            <button onClick={clearAll} className="neu-btn text-xs px-3 py-1.5 text-green-600 hover:text-green-700">
              Tout activer
            </button>
          </div>

          {/* Grille localités */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1,2,3,4,5,6].map(i => <div key={i} className="neu-flat h-14 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ALL_LOCALITIES.map(loc => {
                const isDisabled = disabledLocalities.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => toggleLocality(loc)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                      isDisabled
                        ? 'neu-pressed border border-orange-400/40'
                        : 'neu-flat hover:-translate-y-0.5'
                    }`}
                  >
                    <MapPin size={16} className={isDisabled ? 'text-orange-500' : 'text-green-600'} />
                    <span className={`flex-1 text-sm font-medium ${isDisabled ? 'text-orange-600' : 'text-foreground'}`}>
                      {loc}
                    </span>
                    {/* Toggle visuel */}
                    <span className={`w-10 h-5 rounded-full relative transition-colors duration-200 shrink-0 ${
                      isDisabled ? 'bg-orange-400' : 'bg-green-400'
                    }`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        isDisabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Notice */}
          {dirty && (
            <div className="neu-pressed flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 border-orange-400 animate-in slide-in-from-top-2">
              <ShieldAlert size={16} className="text-orange-500 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Modifications non sauvegardées — cliquez sur <strong>Sauvegarder</strong> pour appliquer.
              </p>
            </div>
          )}
        </div>

        {/* ── Section : Motifs de rejet ─────────────────── */}
        <div className="neu-card space-y-5">
          {/* En-tête section */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="neu-flat w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                <XCircle size={20} className="text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Motifs de rejet</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ces motifs apparaîtront comme suggestions dans la modale de rejet de l'agent.
                </p>
              </div>
            </div>
            <button
              onClick={saveReasons}
              disabled={reasonsSaving || !reasonsDirty}
              className="neu-btn-primary flex items-center gap-2 px-4 py-2 text-sm shrink-0 disabled:opacity-50">
              {reasonsSaving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save size={14} />}
              Sauvegarder
            </button>
          </div>

          {/* Liste des motifs */}
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="neu-flat h-12 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {reasons.map((reason, idx) => (
                <div key={idx} className="flex items-center gap-3 neu-flat px-4 py-3 rounded-xl">
                  <GripVertical size={15} className="text-muted-foreground/40 shrink-0" />

                  {editIdx === idx ? (
                    /* Mode édition inline */
                    <>
                      <input
                        autoFocus
                        className="neu-input flex-1 text-sm py-1.5 px-3 h-9"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <button onClick={confirmEdit} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-green-600 hover:text-green-700 shrink-0">
                        <Check size={14} />
                      </button>
                      <button onClick={cancelEdit} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    /* Mode affichage */
                    <>
                      <span className="flex-1 text-sm text-foreground font-medium">{reason}</span>
                      <button onClick={() => startEdit(idx)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shrink-0">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => removeReason(idx)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}

              {reasons.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground neu-pressed rounded-xl">
                  Aucun motif configuré. Ajoutez-en un ci-dessous.
                </div>
              )}
            </div>
          )}

          {/* Ajouter un nouveau motif */}
          <div className="flex gap-2">
            <input
              className="neu-input flex-1 text-sm"
              placeholder="Nouveau motif de rejet…"
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addReason(); }}
            />
            <button
              onClick={addReason}
              disabled={!newReason.trim()}
              className="neu-btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-40 shrink-0">
              <Plus size={15} />
              Ajouter
            </button>
          </div>

          {reasonsDirty && (
            <div className="neu-pressed flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 border-destructive/60 animate-in slide-in-from-top-2">
              <XCircle size={16} className="text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">
                Modifications non sauvegardées — cliquez sur <strong>Sauvegarder</strong> pour appliquer.
              </p>
            </div>
          )}
        </div>

        {/* ── Section : Motifs "Autre" ──────────────────── */}
        <div className="neu-card space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="neu-flat w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                <MoreHorizontal size={20} className="text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Motifs « Autre »</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ces motifs apparaîtront comme suggestions dans la modale « Autre » de l'agent vérificateur.
                </p>
              </div>
            </div>
            <button
              onClick={saveOtherReasonsHandler}
              disabled={otherReasonsSaving || !otherReasonsDirty}
              className="neu-btn-primary flex items-center gap-2 px-4 py-2 text-sm shrink-0 disabled:opacity-50">
              {otherReasonsSaving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save size={14} />}
              Sauvegarder
            </button>
          </div>

          {/* Liste des motifs "Autre" */}
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="neu-flat h-12 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {otherReasons.map((reason, idx) => (
                <div key={idx} className="flex items-center gap-3 neu-flat px-4 py-3 rounded-xl">
                  <GripVertical size={15} className="text-muted-foreground/40 shrink-0" />
                  {otherEditIdx === idx ? (
                    <>
                      <input
                        autoFocus
                        className="neu-input flex-1 text-sm py-1.5 px-3 h-9"
                        value={otherEditValue}
                        onChange={e => setOtherEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmOtherEdit(); if (e.key === 'Escape') cancelOtherEdit(); }}
                      />
                      <button onClick={confirmOtherEdit} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-green-600 hover:text-green-700 shrink-0">
                        <Check size={14} />
                      </button>
                      <button onClick={cancelOtherEdit} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-foreground font-medium">{reason}</span>
                      <button onClick={() => startOtherEdit(idx)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shrink-0">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => removeOtherReason(idx)} className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {otherReasons.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground neu-pressed rounded-xl">
                  Aucun motif configuré. Ajoutez-en un ci-dessous.
                </div>
              )}
            </div>
          )}

          {/* Ajouter un nouveau motif "Autre" */}
          <div className="flex gap-2">
            <input
              className="neu-input flex-1 text-sm"
              placeholder="Nouveau motif « Autre »…"
              value={newOtherReason}
              onChange={e => setNewOtherReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addOtherReason(); }}
            />
            <button
              onClick={addOtherReason}
              disabled={!newOtherReason.trim()}
              className="neu-btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-40 shrink-0">
              <Plus size={15} />Ajouter
            </button>
          </div>

          {otherReasonsDirty && (
            <div className="neu-pressed flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 border-amber-400 animate-in slide-in-from-top-2">
              <MoreHorizontal size={16} className="text-amber-500 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Modifications non sauvegardées — cliquez sur <strong>Sauvegarder</strong> pour appliquer.
              </p>
            </div>
          )}
        </div>

        {/* ── Section : Lien public du tableau de bord ── */}
        <div className="neu-card space-y-5">
          <div className="flex items-start gap-3">
            <div className="neu-flat w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
              <LinkIcon size={20} className="text-blue-500" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Lien public du tableau de bord</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Générez un lien pour permettre à un visiteur de voir uniquement le tableau de bord en lecture seule, sans nécessiter de connexion.
              </p>
            </div>
          </div>

          <div className="neu-pressed rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
            {publicLinkToken ? (
              <>
                <div className="flex-1 min-w-0 bg-background border border-border/50 rounded-lg px-3 py-2 text-sm text-muted-foreground truncate w-full select-all">
                  {`${window.location.origin}${window.location.pathname}#/public/dashboard/${publicLinkToken}`}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={copyPublicLink} className="neu-flat p-2 rounded-lg text-primary hover:text-primary/80 transition-colors" title="Copier le lien">
                    <Copy size={18} />
                  </button>
                  <button onClick={generatePublicLink} disabled={loadingLink} className="neu-flat p-2 rounded-lg text-orange-500 hover:text-orange-600 transition-colors" title="Révoquer et générer un nouveau lien">
                    <RefreshCw size={18} className={loadingLink ? "animate-spin" : ""} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-4">
                <p className="text-sm text-muted-foreground mb-4">Aucun lien public actif n'a été généré.</p>
                <button 
                  onClick={generatePublicLink}
                  disabled={loadingLink}
                  className="neu-btn-primary flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50"
                >
                  {loadingLink ? <Loader2 size={16} className="animate-spin" /> : <LinkIcon size={16} />}
                  Générer le lien
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            SECTION : PÉRIODE DE TRAVAIL / PAIE
            ══════════════════════════════════════════════ */}
        <div className="neu-card space-y-5">
          {/* En-tête section */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="neu-flat w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                <CalendarDays size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Période de travail / Paie</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Définissez le jour de début du cycle mensuel de paie. Le système basculera automatiquement chaque mois.
                </p>
              </div>
            </div>
            <button
              onClick={saveWorkPeriod}
              disabled={periodSaving || !periodDirty}
              className="neu-btn-primary flex items-center gap-2 px-4 py-2 text-sm shrink-0 disabled:opacity-50">
              {periodSaving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save size={14} />}
              Sauvegarder
            </button>
          </div>

          {periodLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={26} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* ── Sélecteur du jour de début ── */}
              <div className="neu-pressed rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={15} className="text-primary shrink-0" />
                  <span className="text-sm font-semibold text-foreground">Configuration du cycle</span>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {/* Début */}
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">
                      Jour de début de période
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground shrink-0">Le</span>
                      <select
                        value={periodStartDay}
                        onChange={e => {
                          const nextDay = e.target.value;
                          setPeriodStartDay(nextDay);
                          setPeriodDirty(nextDay !== String(workPeriod?.start_day ?? '15'));
                          setPeriodSaveConfirmed(false);
                        }}
                        className="neu-input text-sm w-24 px-3 py-2 font-semibold"
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <span className="text-sm text-muted-foreground">de chaque mois</span>
                    </div>
                  </div>

                  {/* Flèche */}
                  <ChevronRight size={18} className="text-muted-foreground/40 shrink-0 hidden sm:block" />

                  {/* Fin calculée automatiquement */}
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">
                      Fin automatique (calculée)
                    </label>
                    <div className="flex items-center gap-2 neu-flat rounded-xl px-3 py-2">
                      <span className="text-sm text-muted-foreground shrink-0">Le</span>
                      <span className="text-lg font-bold text-foreground tabular-nums">
                        {computeEndDay(parseInt(periodStartDay || '15', 10))}
                      </span>
                      <span className="text-sm text-muted-foreground">du mois suivant</span>
                    </div>
                  </div>
                </div>

                {/* Exemple visuel du cycle */}
                <div className="flex items-start gap-2 bg-primary/5 rounded-xl px-3 py-2.5">
                  <Info size={13} className="text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Exemple de cycle :</strong>{' '}
                    {(() => {
                      const sd = parseInt(periodStartDay || '15', 10);
                      const ed = computeEndDay(sd);
                      return `Du ${sd} août au ${ed} septembre → mois 1 · Du ${sd} septembre au ${ed} octobre → mois 2 · etc.`;
                    })()}
                  </p>
                </div>
              </div>

              {/* ── Période active actuelle ── */}
              {currentPeriod?.configured && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Période active actuellement</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="neu-pressed rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 animate-pulse" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Début</p>
                        <p className="text-sm font-bold text-foreground truncate">{fmtDate(currentPeriod.period_start)}</p>
                      </div>
                    </div>
                    <div className="neu-pressed rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fin</p>
                        <p className="text-sm font-bold text-foreground truncate">{fmtDate(currentPeriod.period_end)}</p>
                      </div>
                    </div>
                    <div className="neu-pressed rounded-xl px-4 py-3 flex items-center gap-3">
                      <CalendarDays size={16} className="text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Prochain cycle</p>
                        <p className="text-sm font-bold text-foreground truncate">
                          {currentPeriod.start_day} du mois prochain
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Info réinitialisation automatique ── */}
              <div className="flex items-start gap-3 neu-flat rounded-xl px-4 py-3">
                <Info size={15} className="text-blue-500 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground leading-relaxed space-y-0.5">
                  <p><strong className="text-foreground">Réinitialisation automatique</strong> — chaque jour de début configuré, le système démarre automatiquement une nouvelle période de calcul.</p>
                  <p>Les données des périodes précédentes sont conservées dans l'historique et restent consultables.</p>
                </div>
              </div>

              {/* ── Historique des périodes ── */}
              {periodHistory.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowHistory(h => !h)}
                    className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                    <History size={13} />
                    {showHistory ? 'Masquer' : 'Afficher'} l'historique des périodes ({periodHistory.length})
                  </button>

                  {showHistory && (
                    <div className="space-y-2 animate-in slide-in-from-top-2">
                      {periodHistory.map((h) => (
                        <div key={h.id} className="neu-pressed rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Calendar size={13} className="text-primary" />
                            </div>
                            <span className="text-sm font-medium text-foreground truncate">{h.period_label}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {fmtDate(h.period_start)} → {fmtDate(h.period_end)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {periodDirty && (
                <div className="neu-pressed flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border-l-4 border-primary/60 animate-in slide-in-from-top-2">
                  <CalendarDays size={16} className="text-primary shrink-0" />
                  <p className="text-sm text-muted-foreground flex-1">
                    Modifications non sauvegardées. Sauvegardez maintenant pour appliquer le nouveau cycle.
                  </p>
                  <button
                    type="button"
                    onClick={saveWorkPeriod}
                    disabled={periodSaving}
                    className="neu-btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm shrink-0 disabled:opacity-50"
                  >
                    {periodSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Sauvegarder maintenant
                  </button>
                </div>
              )}

              {periodSaveConfirmed && !periodDirty && (
                <div role="status" className="flex items-start gap-3 px-4 py-3 rounded-xl bg-green-500/10 border-l-4 border-green-500 animate-in slide-in-from-top-2">
                  <CheckCircle2 size={17} className="text-green-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    <strong>Cycle enregistré.</strong> La période commence le {periodStartDay} de chaque mois et se termine automatiquement le {computeEndDay(parseInt(periodStartDay, 10))} du mois suivant.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </MainLayout>
  );
}
