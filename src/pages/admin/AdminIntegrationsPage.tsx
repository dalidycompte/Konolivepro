import React, { useState, useEffect, useCallback, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getIntegrations, createIntegration, updateIntegration,
  revokeIntegration, renewIntegrationKey, deleteIntegration,
  getIntegrationLogs,
  type ApiIntegration, type ApiIntegrationLog,
} from '@/lib/api';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Plug, Plus, Key, Eye, EyeOff, RefreshCw, Trash2, Power, PowerOff,
  Copy, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Shield, Clock, Activity, Filter, List, BarChart2, Globe, Loader2,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

// ── Available permissions ────────────────────────────────────────────────
const AVAILABLE_PERMISSIONS = [
  { value: 'stats:read',       label: 'Statistiques',        icon: <BarChart2 size={14} /> },
  { value: 'requests:read',    label: 'Demandes (lecture)',   icon: <List size={14} /> },
  { value: 'users:read',       label: 'Utilisateurs (lecture)', icon: <Globe size={14} /> },
  { value: 'webhook:receive',  label: 'Réception webhook',   icon: <Activity size={14} /> },
];

function fmtDate(iso: string) {
  try { return format(parseISO(iso), 'd MMM yyyy HH:mm', { locale: fr }); }
  catch { return iso; }
}

function StatusBadge({ active, revoked }: { active: boolean; revoked: boolean }) {
  if (revoked) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <XCircle size={11} /> Révoquée
    </span>
  );
  if (active) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 size={11} /> Active
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">
      <PowerOff size={11} /> Désactivée
    </span>
  );
}

// ── Create integration modal ─────────────────────────────────────────────
function CreateIntegrationModal({ onCreated, userId }: { onCreated: (int: ApiIntegration & { fullKey: string }) => void; userId: string }) {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');
  const [perms, setPerms]     = useState<string[]>([]);
  const [limit, setLimit]     = useState(100);
  const [loading, setLoading] = useState(false);

  function togglePerm(v: string) {
    setPerms(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  }

  async function handleCreate() {
    if (!name.trim()) { toast.error('Le nom est requis.'); return; }
    if (!perms.length) { toast.error('Sélectionnez au moins une permission.'); return; }
    setLoading(true);
    const result = await createIntegration({ name: name.trim(), description: desc.trim() || undefined, permissions: perms, rate_limit: limit, created_by: userId });
    setLoading(false);
    if (!result) { toast.error('Erreur lors de la création.'); return; }
    onCreated({ ...result, fullKey: result.api_key });
    setOpen(false);
    setName(''); setDesc(''); setPerms([]); setLimit(100);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="neu-btn-primary py-2 px-4 flex items-center gap-2 text-sm">
        <Plus size={16} /> Nouvelle intégration
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="neu-card w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-foreground flex items-center gap-2">
                <Plug size={18} className="text-primary" /> Nouvelle intégration
              </h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Nom de l'application *</label>
                <input className="neu-input w-full" placeholder="Ex: Mon CRM, Tableau de bord BI…" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Description</label>
                <textarea className="neu-input w-full resize-none" rows={2} placeholder="Usage de cette intégration…" value={desc} onChange={e => setDesc(e.target.value)} maxLength={255} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">Permissions *</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p.value}
                      className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer border transition-all text-xs font-medium
                        ${perms.includes(p.value)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50'}`}>
                      <input type="checkbox" className="sr-only" checked={perms.includes(p.value)} onChange={() => togglePerm(p.value)} />
                      {p.icon}{p.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Limite de débit (req/min)</label>
                <input className="neu-input w-full" type="number" min={1} max={10000} value={limit} onChange={e => setLimit(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 neu-btn-secondary py-2 text-sm">Annuler</button>
              <button onClick={handleCreate} disabled={loading} className="flex-1 neu-btn-primary py-2 text-sm flex items-center justify-center gap-2">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Key size={15} />}
                Générer la clé
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── New Key Reveal Modal ─────────────────────────────────────────────────
function NewKeyModal({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="neu-card w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <Key size={20} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Clé API générée</h2>
            <p className="text-xs text-muted-foreground">Copiez-la maintenant — elle ne sera plus affichée.</p>
          </div>
        </div>

        <div className="neu-pressed rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Clé API secrète</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-foreground break-all">{apiKey}</code>
            <button onClick={copy} className="shrink-0 p-2 neu-flat rounded-xl hover:text-primary transition-colors">
              {copied ? <CheckCircle2 size={15} className="text-green-500" /> : <Copy size={15} />}
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <AlertTriangle size={15} className="text-orange-500 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700 dark:text-orange-400 text-pretty">
            Stockez cette clé en lieu sûr. Pour des raisons de sécurité, elle ne sera plus visible après fermeture de cette fenêtre.
          </p>
        </div>

        <button onClick={onClose} className="neu-btn-primary w-full py-2.5 text-sm">J'ai copié ma clé</button>
      </div>
    </div>
  );
}

// ── Integration Card ─────────────────────────────────────────────────────
function IntegrationCard({
  integration, onRefresh,
}: { integration: ApiIntegration; onRefresh: () => void }) {
  const { user } = useAuth();
  const [showLogs, setShowLogs]   = useState(false);
  const [logs, setLogs]           = useState<ApiIntegrationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newKey, setNewKey]       = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function loadLogs() {
    if (logsLoading) return;
    setLogsLoading(true);
    const data = await getIntegrationLogs(integration.id, 50);
    setLogs(data);
    setLogsLoading(false);
  }

  function toggleLogs() {
    if (!showLogs) loadLogs();
    setShowLogs(v => !v);
  }

  async function handleToggle() {
    setActionLoading('toggle');
    try {
      await updateIntegration(integration.id, { is_active: !integration.is_active });
      toast.success(integration.is_active ? 'Intégration désactivée' : 'Intégration activée');
      onRefresh();
    } catch { toast.error('Erreur.'); }
    setActionLoading(null);
  }

  async function handleRevoke() {
    setActionLoading('revoke');
    try {
      await revokeIntegration(integration.id);
      toast.success('Clé révoquée avec succès.');
      onRefresh();
    } catch { toast.error('Erreur lors de la révocation.'); }
    setActionLoading(null);
  }

  async function handleRenew() {
    if (!user) return;
    setActionLoading('renew');
    const key = await renewIntegrationKey(integration.id, user.id);
    setActionLoading(null);
    if (!key) { toast.error('Erreur lors du renouvellement.'); return; }
    setNewKey(key);
    toast.success('Nouvelle clé générée.');
    onRefresh();
  }

  async function handleDelete() {
    setActionLoading('delete');
    try {
      await deleteIntegration(integration.id);
      toast.success('Intégration supprimée.');
      onRefresh();
    } catch { toast.error('Erreur lors de la suppression.'); }
    setActionLoading(null);
  }

  const isRevoked = !!integration.revoked_at;

  return (
    <>
      {newKey && <NewKeyModal apiKey={newKey} onClose={() => setNewKey(null)} />}

      <div className={`neu-card space-y-4 transition-all ${!integration.is_active ? 'opacity-75' : ''}`}>
        {/* ── En-tête ── */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl neu-flat flex items-center justify-center shrink-0">
            <Plug size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-foreground text-sm truncate">{integration.name}</h3>
              <StatusBadge active={integration.is_active} revoked={isRevoked} />
            </div>
            {integration.description && (
              <p className="text-xs text-muted-foreground mt-0.5 text-pretty">{integration.description}</p>
            )}
          </div>
        </div>

        {/* ── Infos clé ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="neu-pressed rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Préfixe clé</p>
            <code className="text-xs font-mono text-foreground">{integration.api_key_prefix}…</code>
          </div>
          <div className="neu-pressed rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Débit max</p>
            <p className="text-xs font-bold text-foreground">{integration.rate_limit} req/min</p>
          </div>
        </div>

        {/* ── Permissions ── */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">Permissions</p>
          <div className="flex flex-wrap gap-1.5">
            {(integration.permissions as string[]).map(p => {
              const def = AVAILABLE_PERMISSIONS.find(x => x.value === p);
              return (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[11px] font-medium">
                  {def?.icon}{def?.label ?? p}
                </span>
              );
            })}
            {!(integration.permissions as string[]).length && (
              <span className="text-xs text-muted-foreground italic">Aucune permission</span>
            )}
          </div>
        </div>

        {/* ── Dates ── */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><Clock size={11} />Créée {fmtDate(integration.created_at)}</span>
          {integration.last_used_at && (
            <span className="flex items-center gap-1"><Activity size={11} />Dernier appel {fmtDate(integration.last_used_at)}</span>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
          {/* Activer / Désactiver */}
          <button
            onClick={handleToggle}
            disabled={actionLoading !== null || isRevoked}
            className="flex-1 min-w-[100px] neu-btn-secondary py-2 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
            {actionLoading === 'toggle'
              ? <Loader2 size={13} className="animate-spin" />
              : integration.is_active ? <PowerOff size={13} /> : <Power size={13} />
            }
            {integration.is_active ? 'Désactiver' : 'Activer'}
          </button>

          {/* Renouveler */}
          <button
            onClick={handleRenew}
            disabled={actionLoading !== null}
            className="flex-1 min-w-[100px] neu-btn-secondary py-2 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
            {actionLoading === 'renew' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Renouveler clé
          </button>

          {/* Révoquer */}
          {!isRevoked && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={actionLoading !== null}
                  className="flex-1 min-w-[100px] py-2 text-xs flex items-center justify-center gap-1.5 rounded-2xl font-medium
                    border border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50">
                  {actionLoading === 'revoke' ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                  Révoquer
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-orange-600"><Shield size={18} />Révoquer cette intégration ?</AlertDialogTitle>
                  <AlertDialogDescription className="text-pretty">
                    La clé API sera immédiatement invalidée. L'application externe ne pourra plus appeler l'API. Vous pourrez renouveler la clé plus tard.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevoke} className="bg-orange-600 hover:bg-orange-700 text-white">Révoquer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Supprimer */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={actionLoading !== null}
                className="py-2 px-3 text-xs flex items-center justify-center gap-1 rounded-2xl font-medium
                  border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50">
                <Trash2 size={13} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle size={18} />Supprimer définitivement ?</AlertDialogTitle>
                <AlertDialogDescription className="text-pretty">
                  Cette action est irréversible. L'intégration, sa clé API et tous ses journaux seront supprimés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* ── Journaux ── */}
        <div>
          <button
            onClick={toggleLogs}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground py-2 border-t border-border hover:text-foreground transition-colors">
            <span className="flex items-center gap-1.5"><Filter size={12} />Journaux d'appels</span>
            {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showLogs && (
            <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto min-h-0">
              {logsLoading ? (
                <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-primary" /></div>
              ) : logs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 italic">Aucun appel enregistré.</p>
              ) : logs.map(log => (
                <div key={log.id} className="neu-pressed rounded-xl px-3 py-2 flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md font-mono
                    ${(log.status_code ?? 0) < 300 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : (log.status_code ?? 0) < 500 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {log.status_code ?? '—'}
                  </span>
                  <span className="font-mono text-xs text-foreground truncate flex-1">{log.method} {log.endpoint}</span>
                  {log.response_time_ms != null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{log.response_time_ms}ms</span>
                  )}
                  <span className="shrink-0 text-[10px] text-muted-foreground hidden md:block">
                    {fmtDate(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AdminIntegrationsPage() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [loading, setLoading]           = useState(true);
  const [newKeyData, setNewKeyData]     = useState<{ key: string; name: string } | null>(null);
  const [filter, setFilter]             = useState<'all' | 'active' | 'disabled' | 'revoked'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getIntegrations();
    setIntegrations(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'active')   return integrations.filter(i => i.is_active && !i.revoked_at);
    if (filter === 'disabled') return integrations.filter(i => !i.is_active && !i.revoked_at);
    if (filter === 'revoked')  return integrations.filter(i => !!i.revoked_at);
    return integrations;
  }, [integrations, filter]);

  const stats = useMemo(() => ({
    total:    integrations.length,
    active:   integrations.filter(i => i.is_active && !i.revoked_at).length,
    revoked:  integrations.filter(i => !!i.revoked_at).length,
    disabled: integrations.filter(i => !i.is_active && !i.revoked_at).length,
  }), [integrations]);

  function handleCreated(int: ApiIntegration & { fullKey: string }) {
    setNewKeyData({ key: int.fullKey, name: int.name });
    load();
  }

  const gatewayUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway`;

  return (
    <MainLayout>
      {newKeyData && (
        <NewKeyModal apiKey={newKeyData.key} onClose={() => setNewKeyData(null)} />
      )}

      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── En-tête ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance flex items-center gap-2">
              <Plug size={24} className="text-primary" />
              Intégrations & API
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Connectez des applications externes à Konolive via des clés API sécurisées.
            </p>
          </div>
          {user && <CreateIntegrationModal onCreated={handleCreated} userId={user.id} />}
        </div>

        {/* ── URL Gateway ── */}
        <div className="neu-card">
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">URL de base de l'API Gateway</p>
          <div className="flex items-center gap-2 neu-pressed rounded-xl px-3 py-2">
            <Globe size={14} className="text-primary shrink-0" />
            <code className="text-xs font-mono text-foreground flex-1 truncate">{gatewayUrl}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(gatewayUrl); toast.success('URL copiée'); }}
              className="shrink-0 p-1.5 rounded-lg neu-flat hover:text-primary transition-colors">
              <Copy size={13} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-pretty">
            Ajoutez l'en-tête <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">X-Api-Key: votre_clé</code> à toutes vos requêtes.
          </p>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total',      value: stats.total,    color: 'text-foreground' },
            { label: 'Actives',    value: stats.active,   color: 'text-green-500' },
            { label: 'Désactivées',value: stats.disabled, color: 'text-muted-foreground' },
            { label: 'Révoquées',  value: stats.revoked,  color: 'text-red-500' },
          ].map(k => (
            <div key={k.label} className="neu-pressed rounded-2xl p-3 text-center">
              <p className={`text-2xl font-black tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-widest">{k.label}</p>
            </div>
          ))}
        </div>

        {/* ── Filtres ── */}
        <div className="flex gap-2 flex-wrap">
          {([['all','Toutes'], ['active','Actives'], ['disabled','Désactivées'], ['revoked','Révoquées']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                ${filter === v ? 'bg-primary text-primary-foreground shadow-md' : 'neu-flat text-muted-foreground hover:text-foreground'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* ── Liste intégrations ── */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="neu-card flex flex-col items-center justify-center py-12 gap-3">
            <Plug size={36} className="text-muted-foreground opacity-25" />
            <p className="text-muted-foreground text-sm">
              {filter === 'all' ? 'Aucune intégration créée.' : 'Aucune intégration dans cette catégorie.'}
            </p>
            {filter === 'all' && user && (
              <CreateIntegrationModal onCreated={handleCreated} userId={user.id} />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(int => (
              <IntegrationCard key={int.id} integration={int} onRefresh={load} />
            ))}
          </div>
        )}

        {/* ── Guide d'utilisation ── */}
        <div className="neu-card space-y-4">
          <h2 className="font-bold text-foreground flex items-center gap-2 text-base">
            <Shield size={17} className="text-primary" />
            Guide d'utilisation de l'API
          </h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            {[
              { title: 'Authentification', content: 'Ajoutez votre clé API dans l\'en-tête HTTP : X-Api-Key: kl_live_XXXXX' },
              { title: 'Endpoints disponibles', content: 'GET /status · GET /stats · GET /requests · GET /users/count · POST /webhook' },
              { title: 'Rate limiting', content: 'Les requêtes dépassant la limite retournent un code 429 avec l\'en-tête Retry-After: 60' },
              { title: 'Sécurité', content: 'Toutes les communications doivent passer par HTTPS. Ne partagez jamais votre clé API.' },
            ].map(item => (
              <div key={item.title} className="neu-pressed rounded-xl p-3">
                <p className="font-semibold text-foreground text-xs mb-1">{item.title}</p>
                <p className="text-xs leading-relaxed">{item.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
