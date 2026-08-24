import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createRequest, upsertDocuments, uploadFile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { CheckCircle2, Phone, CreditCard, ScanFace, ShieldAlert } from 'lucide-react';
import CameraCapture from '@/components/common/CameraCapture';

export default function NewRequestPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone]         = useState('');
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile]   = useState<File | null>(null);
  const [liveFile, setLiveFile]   = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Vérifier si la localité est désactivée ──────────
  const [callDisabled, setCallDisabled]     = useState(false);
  const [checkingSettings, setCheckingSettings] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'disabled_localities')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && Array.isArray(data.value) && profile.locality) {
          setCallDisabled((data.value as string[]).includes(profile.locality));
        }
        setCheckingSettings(false);
      });
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim())  { toast.error('Veuillez entrer le numéro de téléphone à certifier'); return; }
    if (!phone.trim().startsWith('06')) { toast.error("Le numéro doit commencer par 06"); return; }
    if (phone.trim().length !== 9) { toast.error('Le numéro de téléphone doit contenir exactement 9 chiffres'); return; }
    if (!frontFile)     { toast.error("Veuillez fournir le recto de votre pièce d'identité"); return; }
    if (!backFile)      { toast.error("Veuillez fournir le verso de votre pièce d'identité"); return; }
    if (!liveFile)      { toast.error('Veuillez fournir une photo en direct'); return; }
    if (!profile) return;

    setSubmitting(true);
    try {
      const { data: reqData, error: reqErr } = await createRequest({ phone_to_certify: phone.trim() });
      if (reqErr || !reqData) {
        if (reqErr?.message?.includes('ACTIVE_DUPLICATE_PHONE')) {
          throw new Error('Ce numéro a déjà une demande en cours. Attendez la clôture du traitement avant de le soumettre à nouveau.');
        }
        throw new Error(reqErr?.message ?? 'Impossible de créer la demande');
      }
      const requestId = (reqData as { id: string }).id;
      const uid = profile.id;

      const [frontUrl, backUrl, liveUrl] = await Promise.all([
        uploadFile('id-documents',  `${uid}/${requestId}_front.jpg`, frontFile),
        uploadFile('id-documents',  `${uid}/${requestId}_back.jpg`,  backFile),
        uploadFile('live-photos',   `${uid}/${requestId}_live.jpg`,  liveFile),
      ]);

      if (!frontUrl || !backUrl || !liveUrl) {
        throw new Error("Échec du téléversement des images. Vérifiez vos permissions de stockage.");
      }

      const { error: docErr } = await upsertDocuments({
        request_id:   requestId,
        doc_front_url: frontUrl,
        doc_back_url:  backUrl,
        live_photo_url: liveUrl,
      });
      if (docErr) throw new Error(docErr.message ?? "Impossible d'enregistrer les documents");

      toast.success('Demande soumise avec succès !');
      navigate('/dashboard/requests');
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de la soumission. Veuillez réessayer.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Nouvelle demande de vérification</h1>
          <p className="text-muted-foreground text-sm mt-1">Soumettre une demande pour certifier votre numéro de téléphone.</p>
        </div>

        {/* Bannière blocage localité */}
        {!checkingSettings && callDisabled && (
          <div className="neu-pressed flex items-start gap-4 px-5 py-4 rounded-xl border-l-4 border-orange-400">
            <ShieldAlert size={22} className="text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Service temporairement indisponible</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les demandes de vérification sont momentanément désactivées pour la localité <strong>{profile?.locality}</strong>.
                Veuillez contacter votre superviseur ou réessayer plus tard.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`space-y-6 ${callDisabled ? 'pointer-events-none opacity-50' : ''}`}>

          {/* ── Numéro à certifier ── */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Phone size={18} className="text-primary" />
              Numéro à certifier
            </h2>
            <input
              className={`neu-input transition-colors ${
                phone.length > 0 && phone.length !== 9 
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20 text-red-500' 
                  : ''
              }`}
              placeholder="Ex : 064081787"
              value={phone}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length <= 9) setPhone(val);
              }}
              type="tel"
              maxLength={9}
              required
            />
            {phone.length > 0 && phone.length !== 9 ? (
              <p className="text-xs text-red-500 mt-1.5 font-medium">Le numéro doit contenir exactement 9 chiffres (actuel : {phone.length}).</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1.5">Entrez le numéro de téléphone (9 chiffres obligatoires).</p>
            )}
          </div>

          {/* ── Documents d'identité ── */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-primary" />
              Documents d'identité
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Utilisez la caméra pour photographier votre pièce d'identité, ou importez depuis la galerie.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CameraCapture
                label="Recto de la pièce d'identité"
                icon={<CreditCard size={15} />}
                file={frontFile}
                onChange={setFrontFile}
                facingMode="environment"
              />
              <CameraCapture
                label="Verso de la pièce d'identité"
                icon={<CreditCard size={15} />}
                file={backFile}
                onChange={setBackFile}
                facingMode="environment"
              />
            </div>
          </div>

          {/* ── Photo en direct (selfie) ── */}
          <div className="neu-card">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <ScanFace size={18} className="text-primary" />
              Photo en direct
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Prenez un selfie avec la caméra frontale ou importez une photo depuis la galerie pour vérifier votre identité.
            </p>
            <CameraCapture
              label="Selfie en direct"
              icon={<ScanFace size={15} />}
              file={liveFile}
              onChange={setLiveFile}
              facingMode="user"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || callDisabled}
            className="neu-btn-primary w-full py-3 flex items-center justify-center gap-2 text-base font-semibold disabled:opacity-50"
          >
            {submitting ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Envoi en cours…</span></>
            ) : (
              <><CheckCircle2 size={20} /><span>Soumettre la demande</span></>
            )}
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
