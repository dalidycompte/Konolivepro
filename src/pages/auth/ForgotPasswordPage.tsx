import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ShieldQuestion, KeyRound, ArrowLeft, Loader2, User, CheckCircle2, XCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'username' | 'answer' | 'new_password'>('username');
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleCheckUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc('get_security_question', { p_username: username.trim() });
      if (error) throw error;
      
      if (!data) {
        toast.error("Cet utilisateur n'existe pas ou n'a pas configuré de question secrète.");
      } else {
        setQuestion(data);
        setStep('answer');
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de la vérification de l'utilisateur.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    // We don't check the answer against the DB here, we check it when resetting the password
    // to avoid exposing another endpoint, but wait! The user must know if it's correct before entering new password?
    // Actually, we can just proceed to new password, and if the answer was wrong, the final submit fails.
    setStep('new_password');
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('reset_user_password', {
        p_username: username.trim(),
        p_question: question,
        p_answer: answer.trim(),
        p_new_password: newPassword
      });

      if (error) throw error;

      if (data === true) {
        toast.success("Mot de passe réinitialisé avec succès !");
        navigate('/login');
      } else {
        toast.error("La réponse à la question secrète est incorrecte.");
        setStep('answer'); // Go back to answer step
        setAnswer('');
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de la réinitialisation du mot de passe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-secondary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" />
      <div className="absolute bottom-[-10%] left-[20%] w-96 h-96 bg-purple-500/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000" />

      <div className="w-full max-w-md space-y-8 z-10 relative perspective-1000">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 neu-pressed">
            <ShieldQuestion size={40} className="text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Récupération</h1>
          <p className="text-muted-foreground font-medium">Réinitialisez votre mot de passe</p>
        </div>

        <div className="neu-card border-none bg-card/60 backdrop-blur-xl p-8">
          {step === 'username' && (
            <form onSubmit={handleCheckUsername} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 ml-1">Nom d'utilisateur</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User size={18} className="text-muted-foreground" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="neu-input pl-11 w-full"
                    placeholder="Votre nom d'utilisateur"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full neu-flat bg-primary text-primary-foreground hover:bg-primary/90 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 group"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : 'Continuer'}
              </button>
            </form>
          )}

          {step === 'answer' && (
            <form onSubmit={handleCheckAnswer} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 ml-1">Question secrète</label>
                <div className="p-4 rounded-xl bg-muted/50 border border-border font-medium text-foreground text-center">
                  {question}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 ml-1">Votre réponse</label>
                <input
                  type="text"
                  required
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="neu-input w-full"
                  placeholder="Réponse"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('username')}
                  className="neu-flat px-4 py-3.5 rounded-xl text-muted-foreground hover:text-foreground transition-all"
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  type="submit"
                  className="flex-1 neu-flat bg-primary text-primary-foreground hover:bg-primary/90 font-bold py-3.5 rounded-xl transition-all"
                >
                  Continuer
                </button>
              </div>
            </form>
          )}

          {step === 'new_password' && (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 ml-1">Nouveau mot de passe</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <KeyRound size={18} className="text-muted-foreground" />
                  </div>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="neu-input pl-11 w-full"
                    placeholder="Nouveau mot de passe"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 ml-1">Confirmer le mot de passe</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <KeyRound size={18} className="text-muted-foreground" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`neu-input pl-11 w-full ${confirmPassword.length > 0 ? (newPassword === confirmPassword ? '!ring-2 !ring-green-500 !border-transparent' : '!ring-2 !ring-destructive !border-transparent') : ''}`}
                    placeholder="Confirmer"
                  />
                  {confirmPassword.length > 0 && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      {newPassword === confirmPassword ? (
                        <CheckCircle2 size={18} className="text-green-500" />
                      ) : (
                        <XCircle size={18} className="text-destructive" />
                      )}
                    </div>
                  )}
                </div>
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive mt-1.5 font-medium ml-1">
                    Les mots de passe ne correspondent pas
                  </p>
                )}
                {confirmPassword.length > 0 && newPassword === confirmPassword && (
                  <p className="text-xs text-green-500 mt-1.5 font-medium ml-1">
                    Les mots de passe correspondent
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('answer')}
                  className="neu-flat px-4 py-3.5 rounded-xl text-muted-foreground hover:text-foreground transition-all"
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 neu-flat bg-primary text-primary-foreground hover:bg-primary/90 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : 'Réinitialiser'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 text-center">
            <Link to="/login" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1">
              <ArrowLeft size={16} />
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}