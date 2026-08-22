import React, { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { Settings, Info, Video, Shield, Bell, Smartphone, Upload, CheckCircle2, Trash2, ExternalLink, AlertTriangle, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { uploadApk, getApkUrl, deleteApk } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function AdminConfigPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    app_name: 'Konolive',
    max_requests_per_day: '100',
    call_timeout_seconds: '60',
    require_live_photo: true,
    enable_notifications: true,
    maintenance_mode: false,
  });

  // ── Generic Call Settings ────────────────────────────────
  const [genericCallName, setGenericCallName] = useState('Agent Konolive');
  const [genericCallPhoto, setGenericCallPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadGenericSettings() {
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'generic_call_settings').maybeSingle();
      if (data && data.value) {
        if (data.value.name) setGenericCallName(data.value.name);
        if (data.value.photo_url) setGenericCallPhoto(data.value.photo_url);
      }
    }
    loadGenericSettings();
  }, []);

  async function handleGenericSave() {
    try {
      const value = { name: genericCallName, photo_url: genericCallPhoto };
      await supabase.from('app_settings').upsert({ key: 'generic_call_settings', value, updated_by: user?.id });
      toast.success('Paramètres d\'appel générique enregistrés');
    } catch (e) {
      toast.error('Erreur lors de l\'enregistrement');
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `generic_call_${Date.now()}.${ext}`;
    
    const { data, error } = await supabase.storage.from('live-photos').upload(path, file, { upsert: true });
    
    if (error) {
      toast.error('Erreur lors du téléchargement: ' + error.message);
    } else if (data) {
      const { data: publicUrlData } = supabase.storage.from('live-photos').getPublicUrl(path);
      setGenericCallPhoto(publicUrlData.publicUrl);
    }
    setUploadingPhoto(false);
  }

  // ── APK management ─────────────────────────────────────
  const [apkUrl, setApkUrl]           = useState<string | null>(null);
  const [apkFile, setApkFile]         = useState<File | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const apkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getApkUrl().then(url => setApkUrl(url));
  }, []);

  async function handleApkDelete() {
    setDeleting(true);
    const ok = await deleteApk();
    if (ok) {
      setApkUrl(null);
      toast.success("APK supprimé avec succès");
    } else {
      toast.error("Échec de la suppression de l'APK");
    }
    setDeleting(false);
  }

  async function handleApkUpload() {
    if (!apkFile) return;
    setUploading(true);
    setUploadProgress(0);
    // Simulate progress while uploading
    const interval = setInterval(() => setUploadProgress(p => Math.min(p + 10, 90)), 200);
    const url = await uploadApk(apkFile);
    clearInterval(interval);
    setUploadProgress(100);
    if (url) {
      setApkUrl(url);
      setApkFile(null);
      toast.success('APK hébergé avec succès');
    } else {
      toast.error("Échec de l'hébergement de l'APK");
    }
    setUploading(false);
    setTimeout(() => setUploadProgress(0), 1500);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    toast.success('Configuration enregistrée avec succès');
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Configuration système</h1>
          <p className="text-muted-foreground text-sm mt-1">Gérer les paramètres globaux de la plateforme.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* General */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Settings size={18} className="text-primary" />Paramètres généraux</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-normal text-foreground mb-2">Nom de l'application</label>
                <input className="neu-input" value={settings.app_name} onChange={e => setSettings(s => ({ ...s, app_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-normal text-foreground mb-2">Demandes max. par jour (par coach mobile)</label>
                <input className="neu-input" type="number" min="1" value={settings.max_requests_per_day} onChange={e => setSettings(s => ({ ...s, max_requests_per_day: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Appel Générique */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><UserCircle size={18} className="text-primary" />Appel Entrant (Coach Mobile)</h2>
            <p className="text-sm text-muted-foreground mb-4">Ces informations s'afficheront sur l'écran du Coach Mobile lors d'un appel entrant, masquant ainsi l'identité réelle de l'agent.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-normal text-foreground mb-2">Nom d'appel générique</label>
                <input className="neu-input" value={genericCallName} onChange={e => setGenericCallName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-normal text-foreground mb-2">Photo d'appel générique</label>
                <div className="flex items-center gap-4">
                  {genericCallPhoto ? (
                    <img src={genericCallPhoto} alt="Generic call profile" className="w-16 h-16 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border border-border">
                      <UserCircle size={32} className="text-muted-foreground" />
                    </div>
                  )}
                  <button 
                    type="button" 
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="neu-btn-secondary py-2"
                  >
                    {uploadingPhoto ? 'Téléchargement...' : 'Modifier la photo'}
                  </button>
                  <input type="file" accept="image/*" ref={photoInputRef} className="hidden" onChange={handlePhotoUpload} />
                </div>
              </div>
              <button type="button" onClick={handleGenericSave} className="neu-btn-primary w-full py-2 mt-4">
                Enregistrer les paramètres d'appel
              </button>
            </div>
          </div>

          {/* Video */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Video size={18} className="text-primary" />Paramètres d'appel vidéo</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-normal text-foreground mb-2">Délai de réponse à l'appel (secondes)</label>
                <input className="neu-input" type="number" min="10" value={settings.call_timeout_seconds} onChange={e => setSettings(s => ({ ...s, call_timeout_seconds: e.target.value }))} />
              </div>
              <label className="flex items-center gap-3 min-h-12 cursor-pointer">
                <input type="checkbox" checked={settings.require_live_photo} onChange={e => setSettings(s => ({ ...s, require_live_photo: e.target.checked }))} className="w-4 h-4 accent-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Photo en direct obligatoire à la soumission</p>
                  <p className="text-xs text-muted-foreground">Les coachs mobiles doivent prendre un selfie en direct avant de soumettre</p>
                </div>
              </label>
            </div>
          </div>

          {/* Notifications */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Bell size={18} className="text-primary" />Notifications</h2>
            <label className="flex items-center gap-3 min-h-12 cursor-pointer">
              <input type="checkbox" checked={settings.enable_notifications} onChange={e => setSettings(s => ({ ...s, enable_notifications: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Activer les notifications dans l'application</p>
                <p className="text-xs text-muted-foreground">Les utilisateurs reçoivent des notifications en temps réel pour les changements de statut et les messages</p>
              </div>
            </label>
          </div>

          {/* Maintenance */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-5 flex items-center gap-2"><Shield size={18} className="text-primary" />Maintenance</h2>
            <label className="flex items-center gap-3 min-h-12 cursor-pointer">
              <input type="checkbox" checked={settings.maintenance_mode} onChange={e => setSettings(s => ({ ...s, maintenance_mode: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Mode maintenance</p>
                <p className="text-xs text-muted-foreground">Restreindre temporairement l'accès aux administrateurs uniquement</p>
              </div>
            </label>
            {settings.maintenance_mode && (
              <div className="mt-3 p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-start gap-2">
                <Info size={16} className="text-orange-500 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-700">Le mode maintenance est <strong>activé</strong>. Seuls les administrateurs peuvent accéder à la plateforme.</p>
              </div>
            )}
          </div>

          <button type="submit" className="neu-btn-primary w-full py-3 flex items-center justify-center gap-2">
            <Settings size={18} /><span>Enregistrer la configuration</span>
          </button>
        </form>

        {/* ── APK hébergement ──────────────────────────── */}
        <div className="neu-card space-y-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Smartphone size={18} className="text-primary" />
            Hébergement APK Android
          </h2>

          {/* Statut fichier actuel */}
          {apkUrl ? (
            <div className="flex items-center gap-3 p-3 rounded-xl neu-flat">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">APK hébergé</p>
                <p className="text-xs text-muted-foreground truncate">{apkUrl}</p>
              </div>
              <a href={apkUrl} target="_blank" rel="noopener noreferrer"
                className="shrink-0 p-2 rounded-xl neu-flat hover:text-primary transition-colors">
                <ExternalLink size={15} />
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-dashed border-border">
              <Smartphone size={18} className="text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">Aucun APK hébergé pour l'instant.</p>
            </div>
          )}

          {/* ── Zone de danger : suppression APK ── */}
          {apkUrl && (
            <div className="rounded-2xl border border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900/40 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">Zone de danger</p>
                  <p className="text-xs text-red-600/80 dark:text-red-500 text-pretty mt-0.5">
                    La suppression retirera définitivement l'APK du serveur et désactivera le lien de téléchargement sur la page d'inscription.
                  </p>
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={deleting}
                    className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-medium text-sm
                      bg-red-600 hover:bg-red-700 active:bg-red-800 text-white
                      shadow-[4px_4px_8px_#fca5a5,-2px_-2px_6px_rgba(255,255,255,0.6)]
                      dark:shadow-[4px_4px_8px_rgba(0,0,0,0.4),-2px_-2px_6px_rgba(255,255,255,0.05)]
                      transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
                    {deleting
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Suppression…</span></>
                      : <><Trash2 size={16} /><span>Supprimer l'application hébergée</span></>
                    }
                  </button>
                </AlertDialogTrigger>

                <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle size={20} />
                      Supprimer l'application hébergée ?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-pretty">
                      Cette action est <strong>irréversible</strong>. Le fichier APK sera définitivement supprimé du serveur et le lien de téléchargement sera immédiatement désactivé pour tous les utilisateurs.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleApkDelete}
                      className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-600">
                      Oui, supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Zone de sélection de fichier */}
          <div>
            <input
              ref={apkInputRef}
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              className="hidden"
              onChange={e => setApkFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => apkInputRef.current?.click()}
              className="w-full py-4 rounded-2xl border-2 border-dashed border-border neu-flat hover:border-primary/50 transition-colors flex flex-col items-center gap-2 text-muted-foreground hover:text-primary">
              <Upload size={22} />
              <span className="text-sm font-medium">
                {apkFile ? apkFile.name : 'Cliquer pour sélectionner un fichier .apk'}
              </span>
              {apkFile && (
                <span className="text-xs opacity-70">{(apkFile.size / 1024 / 1024).toFixed(1)} Mo</span>
              )}
            </button>
          </div>

          {/* Barre de progression */}
          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Téléversement en cours…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Bouton héberger */}
          <button
            type="button"
            disabled={!apkFile || uploading}
            onClick={handleApkUpload}
            className="neu-btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50">
            {uploading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Hébergement…</span></>
              : <><Upload size={17} /><span>Héberger l'APK</span></>
            }
          </button>

          <p className="text-xs text-muted-foreground text-pretty">
            L'APK sera accessible publiquement. Le bouton <strong>Télécharger l'APK</strong> sur la page d'inscription pointera automatiquement vers ce fichier.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}

