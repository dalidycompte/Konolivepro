import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getAllProfiles, updateProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/types';
import { toast } from 'sonner';
import { Users, Plus, Search, Shield, UserCheck, Eye, UserX, MoreVertical, RefreshCw, LogOut } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  applicant: <Users size={14} />,
  agent: <UserCheck size={14} />,
  supervisor: <Eye size={14} />,
  admin: <Shield size={14} />,
};

const ROLE_COLORS: Record<UserRole, string> = {
  applicant: 'bg-blue-100 text-blue-700',
  agent: 'bg-green-100 text-green-700',
  supervisor: 'bg-purple-100 text-purple-700',
  admin: 'bg-red-100 text-red-700',
};

interface CreateUserForm {
  username: string;
  password: string;
  role: UserRole;
}

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole>('agent');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateUserForm>({ username: '', password: '', role: 'agent' });

  const load = useCallback(async () => {
    const data = await getAllProfiles(500);
    setProfiles(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = profiles.filter(p => {
    if (p.role !== roleFilter) return false;
    if (search && !p.username.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username || !form.password) return;
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ username: form.username.trim(), password: form.password, role: form.role }),
    });
    const result = await res.json();
    setCreating(false);
    if (!res.ok || result.error) {
      toast.error('Échec de la création', { description: result.error ?? 'Erreur inconnue' });
    } else {
      toast.success(`Utilisateur "${form.username}" créé avec succès`);
      setShowCreate(false);
      setForm({ username: '', password: '', role: 'agent' });
      load();
    }
  }

  async function handleToggleActive(profile: Profile) {
    const newVal = !profile.is_active;
    await updateProfile(profile.id, { is_active: newVal });
    toast.success(`${profile.username} ${newVal ? 'activé' : 'désactivé'}`);
    load();
  }

  async function handleResetPassword(profile: Profile) {
    const newPw = prompt(`Nouveau mot de passe pour ${profile.username} :`);
    if (!newPw || newPw.length < 8) { toast.error('Le mot de passe doit contenir au moins 8 caractères'); return; }
    const { error } = await supabase.auth.admin.updateUserById(profile.id, { password: newPw });
    if (error) toast.error('Échec de la réinitialisation');
    else toast.success(`Mot de passe réinitialisé pour ${profile.username}`);
  }

  async function handleDelete(profile: Profile) {
    if (!confirm(`Supprimer l'utilisateur "${profile.username}" ? Cette action est irréversible.`)) return;
    const { error } = await supabase.rpc('admin_delete_user', { target_user_id: profile.id });
    if (error) {
      toast.error('Échec de la suppression', { description: error.message });
      return;
    }
    toast.success(`Utilisateur "${profile.username}" supprimé`);
    load();
  }

  async function handleForceLogout(profile: Profile) {
    const { error } = await supabase.from('profiles').update({ is_logged_in: false, login_token: null }).eq('id', profile.id);
    if (error) {
      toast.error('Échec', { description: error.message });
    } else {
      toast.success(`Déconnexion forcée pour "${profile.username}"`);
      load();
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Gestion des utilisateurs</h1>
            <p className="text-muted-foreground text-sm mt-1">{profiles.length} utilisateur(s) au total.</p>
          </div>
          <button onClick={() => { setForm(prev => ({ ...prev, role: roleFilter })); setShowCreate(true); }} className="neu-btn-primary flex items-center gap-2 py-2.5 px-5">
            <Plus size={16} /><span>Créer {roleFilter === 'applicant' ? 'un coach' : 'un agent'}</span>
          </button>
        </div>

        {/* Filters */}
        <div className="neu-card py-4 px-5 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="neu-input pl-10" placeholder="Rechercher par nom d'utilisateur…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['agent', 'applicant', 'supervisor', 'admin'] as const).map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${roleFilter === r ? 'neu-btn-primary' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                {r === 'applicant' ? 'Coachs mobiles' : r === 'agent' ? 'Agents' : r === 'supervisor' ? 'Superviseurs' : 'Admins'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="neu-card overflow-hidden">
          {loading ? (
            <div className="space-y-2 p-2">{[1,2,3].map(i => <div key={i} className="neu-pressed h-12 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    {['Nom d\'utilisateur', 'Rôle', 'Localité', 'Téléphone', 'Statut', 'Créé le', 'Actions'].map(h => (
                      <th key={h} className="py-3 px-4 whitespace-nowrap font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">Aucun utilisateur trouvé.</td></tr>
                  ) : filtered.map(p => (
                    <tr key={p.id} className={`border-b border-border/50 last:border-0 ${!p.is_active ? 'opacity-50' : ''}`}>
                      <td className="py-3 px-4 font-semibold text-foreground whitespace-nowrap">{p.username}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[p.role]}`}>
                          {ROLE_ICONS[p.role]}{p.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">{p.locality ?? '—'}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">{p.phone ?? '—'}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                          {p.is_active ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">{format(new Date(p.created_at), 'dd MMM yyyy')}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary transition-colors">
                              <MoreVertical size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleToggleActive(p)}>
                              <UserX size={14} className="mr-2" />{p.is_active ? 'Désactiver' : 'Activer'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(p)}>
                              <RefreshCw size={14} className="mr-2" />Réinitialiser le mot de passe
                            </DropdownMenuItem>
                            {p.login_token && (
                              <DropdownMenuItem onClick={() => handleForceLogout(p)} className="text-orange-600 focus:text-orange-600">
                                <LogOut size={14} className="mr-2" />Forcer la déconnexion
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDelete(p)} className="text-destructive focus:text-destructive">
                              <UserX size={14} className="mr-2" />Supprimer l'utilisateur
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Créer un compte {form.role === 'applicant' ? 'Coach mobile' : form.role === 'agent' ? 'Agent' : form.role === 'supervisor' ? 'Superviseur' : 'Admin'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">Nom d'utilisateur *</label>
              <input className="neu-input" placeholder="ex. agent2" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required autoComplete="off" />
            </div>
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">Mot de passe *</label>
              <input className="neu-input" type="password" placeholder="Min. 8 caractères" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">Rôle *</label>
              <select className="neu-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                <option value="agent">Agent</option>
                <option value="supervisor">Superviseur</option>
                <option value="admin">Admin</option>
                <option value="applicant">Coach mobile</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="neu-btn flex-1 py-2.5">Annuler</button>
              <button type="submit" disabled={creating} className="neu-btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
                {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus size={16} />}
                Créer
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
