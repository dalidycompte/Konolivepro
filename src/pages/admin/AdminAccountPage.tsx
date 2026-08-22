import React, { useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { KeyRound, Mail, Lock, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const SECRET_CODE = '3004202623091996';

type Step = 'locked' | 'unlocked';
type Tab  = 'email' | 'password';

export default function AdminAccountPage() {
  const { profile } = useAuth();

  // ── Verrou code secret ────────────────────────────────
  const [step, setStep]       = useState<Step>('locked');
  const [codeInput, setCode]  = useState('');
  const [codeError, setCodeError] = useState('');
  const [showCode, setShowCode]   = useState(false);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (codeInput === SECRET_CODE) {
      setStep('unlocked');
      setCodeError('');
      toast.success('Code validé — vous pouvez modifier vos identifiants.');
    } else {
      setCodeError('Code secret incorrect. Veuillez réessayer.');
    }
  }

  // ── Onglet actif ──────────────────────────────────────
  const [tab, setTab] = useState<Tab>('email');

  // ── Changement email ──────────────────────────────────
  const [newEmail, setNewEmail]       = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailLoading(false);
    if (error) {
      toast.error(`Erreur : ${error.message}`);
    } else {
      toast.success('Un e-mail de confirmation a été envoyé à votre nouvelle adresse.');
      setNewEmail('');
    }
  }

  // ── Changement mot de passe ───────────────────────────
  const [newPwd, setNewPwd]         = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) { toast.error('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (newPwd !== confirmPwd) { toast.error('Les mots de passe ne correspondent pas.'); return; }
    setPwdLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdLoading(false);
    if (error) {
      toast.error(`Erreur : ${error.message}`);
    } else {
      toast.success('Mot de passe mis à jour avec succès.');
      setNewPwd('');
      setConfirmPwd('');
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Mon compte</h1>
          <p className="text-muted-foreground text-sm mt-1">Modifier votre adresse e-mail ou votre mot de passe.</p>
        </div>

        {/* ── Étape 1 : code secret ── */}
        {step === 'locked' && (
          <div className="neu-card space-y-5">
            <div className="flex items-center gap-3">
              <div className="neu-flat w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                <Lock size={22} className="text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Vérification requise</p>
                <p className="text-xs text-muted-foreground">Entrez le code secret pour modifier vos identifiants.</p>
              </div>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Code secret
                </label>
                <div className="relative">
                  <input
                    type={showCode ? 'text' : 'password'}
                    value={codeInput}
                    onChange={e => { setCode(e.target.value); setCodeError(''); }}
                    placeholder="Entrez le code secret"
                    className="neu-pressed w-full rounded-xl px-4 py-3 pr-10 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCode(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {codeError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500 mt-1.5">
                    <AlertTriangle size={12} />{codeError}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                <ShieldCheck size={16} />Valider le code
              </button>
            </form>
          </div>
        )}

        {/* ── Étape 2 : modification ── */}
        {step === 'unlocked' && (
          <>
            {/* Info compte */}
            <div className="neu-card flex items-center gap-3">
              <div className="neu-flat w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Connecté en tant que</p>
                <p className="font-semibold text-foreground truncate">{profile?.username}</p>
              </div>
            </div>

            {/* Onglets */}
            <div className="neu-pressed rounded-2xl p-1 flex gap-1">
              {([['email', <Mail size={15} />, 'Adresse e-mail'], ['password', <KeyRound size={15} />, 'Mot de passe']] as const).map(([t, icon, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all',
                    tab === t
                      ? 'bg-primary text-white shadow-md'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}>
                  {icon}{label}
                </button>
              ))}
            </div>

            {/* ── Formulaire e-mail ── */}
            {tab === 'email' && (
              <div className="neu-card space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Mail size={18} className="text-primary" />
                  <h2 className="font-semibold text-foreground">Changer l'adresse e-mail</h2>
                </div>
                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Nouvelle adresse e-mail
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="exemple@domaine.com"
                      required
                      className="neu-pressed w-full rounded-xl px-4 py-3 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Un e-mail de confirmation sera envoyé à votre nouvelle adresse. La modification sera effective après confirmation.
                  </p>
                  <button
                    type="submit"
                    disabled={emailLoading || !newEmail.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                    {emailLoading ? 'Envoi en cours…' : <><Mail size={15} />Enregistrer la nouvelle adresse</>}
                  </button>
                </form>
              </div>
            )}

            {/* ── Formulaire mot de passe ── */}
            {tab === 'password' && (
              <div className="neu-card space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound size={18} className="text-primary" />
                  <h2 className="font-semibold text-foreground">Changer le mot de passe</h2>
                </div>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Nouveau mot de passe
                    </label>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={newPwd}
                        onChange={e => setNewPwd(e.target.value)}
                        placeholder="Au moins 8 caractères"
                        required
                        className="neu-pressed w-full rounded-xl px-4 py-3 pr-10 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Confirmer le mot de passe
                    </label>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={confirmPwd}
                      onChange={e => setConfirmPwd(e.target.value)}
                      placeholder="Répétez le mot de passe"
                      required
                      className="neu-pressed w-full rounded-xl px-4 py-3 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
                    />
                    {confirmPwd && newPwd !== confirmPwd && (
                      <p className="flex items-center gap-1.5 text-xs text-red-500 mt-1.5">
                        <AlertTriangle size={12} />Les mots de passe ne correspondent pas.
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={pwdLoading || newPwd.length < 8 || newPwd !== confirmPwd}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                    {pwdLoading ? 'Mise à jour…' : <><KeyRound size={15} />Mettre à jour le mot de passe</>}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
