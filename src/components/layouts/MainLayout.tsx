import React, { memo, useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPath } from '@/components/common/RouteGuard';
import ThemeToggle from '@/components/common/ThemeToggle';
import {
  LayoutDashboard, FileText, History, MessageSquare, Bell,
  Users, Settings, BarChart2, ClipboardList, LogOut,
  Menu, Shield, UserCheck, Eye, Video, Clock, Wifi, AlertTriangle, KeyRound, CalendarDays, TrendingUp, Settings2, Smartphone, Award, Phone,
  Table as TableIcon, Plug, ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import InternalCallModal from '@/components/discussion/InternalCallModal';
import { countUnreadInternalMessages } from '@/lib/api';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { requestNotifPermission } from '@/lib/notifications';
import type { Profile, UserRole } from '@/types/types';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

function getNavItems(role: UserRole | null): NavItem[] {
  switch (role) {
    case 'applicant':
      return [
        { label: 'Tableau de bord', path: '/dashboard', icon: <LayoutDashboard size={18} /> },
        { label: 'Nouvelle demande', path: '/dashboard/new-request', icon: <FileText size={18} /> },
        { label: 'Mes demandes', path: '/dashboard/requests', icon: <History size={18} /> },
        { label: 'Messages', path: '/dashboard/messages', icon: <MessageSquare size={18} /> },
        { label: 'Notifications', path: '/dashboard/notifications', icon: <Bell size={18} /> },
      ];
    case 'agent':
      return [
        { label: 'Tableau de bord', path: '/agent', icon: <LayoutDashboard size={18} /> },
        { label: 'Évolution quotidienne', path: '/agent/daily-evolution', icon: <TrendingUp size={18} /> },
        { label: 'Mes performances',       path: '/agent/performances',    icon: <Award size={18} /> },
        { label: 'Mes GSM',          path: '/agent/my-gsm',         icon: <Smartphone size={18} /> },
        { label: 'Discussion', path: '/discussion', icon: <MessageSquare size={18} /> },
        { label: 'Mon historique', path: '/agent/history', icon: <History size={18} /> },
        { label: 'Suivi mensuel', path: '/agent/monthly-tracking', icon: <CalendarDays size={18} /> },
        { label: 'Notifications', path: '/agent/notifications', icon: <Bell size={18} /> },
        { label: 'Paramètres', path: '/agent/settings', icon: <Settings size={18} /> },
      ];
    case 'supervisor':
      return [
        { label: 'Tableau de bord',    path: '/supervisor',                icon: <LayoutDashboard size={18} /> },
        { label: 'Stats des agents',   path: '/supervisor/agents',         icon: <UserCheck size={18} /> },
        { label: 'Fil d’attente',       path: '/supervisor/queue',          icon: <ListTodo size={18} /> },
        { label: 'Statut des agents',  path: '/supervisor/agent-status',  icon: <Wifi size={18} /> },
        { label: 'Toutes les demandes',path: '/supervisor/requests',       icon: <ClipboardList size={18} /> },
        { label: 'GROSS ADD GSM',      path: '/supervisor/gross-add',      icon: <TableIcon size={18} /> },
        { label: 'Options Traitement', path: '/supervisor/processing-options', icon: <Settings2 size={18} /> },
        { label: 'Historique',         path: '/supervisor/history',        icon: <History size={18} /> },
        { label: 'Processing Time',    path: '/supervisor/processing-time',icon: <Clock size={18} /> },
        { label: 'Rapports',           path: '/supervisor/reports',        icon: <FileText size={18} /> },
        { label: 'Paramètres',         path: '/supervisor/settings',       icon: <Settings size={18} /> },
        { label: 'Discussion',         path: '/discussion',                icon: <MessageSquare size={18} /> },
      ];
    case 'admin':
      return [
        { label: 'Tableau de bord',    path: '/admin',              icon: <LayoutDashboard size={18} /> },
        { label: 'Utilisateurs',       path: '/admin/users',        icon: <Users size={18} /> },
        { label: 'Toutes les demandes',path: '/admin/requests',     icon: <ClipboardList size={18} /> },
        { label: 'Statistiques',       path: '/admin/stats',        icon: <BarChart2 size={18} /> },
        { label: 'Historique',         path: '/admin/history',      icon: <History size={18} /> },
        { label: "Journaux d'activité",path: '/admin/logs',         icon: <Eye size={18} /> },
        { label: 'Intégrations & API', path: '/admin/integrations', icon: <Plug size={18} /> },
        { label: 'Configuration',      path: '/admin/config',       icon: <Settings size={18} /> },
        { label: 'Mon compte',         path: '/admin/account',      icon: <KeyRound size={18} /> },
      ];
    default:
      return [];
  }
}

function getRoleLabel(role: UserRole | null) {
  switch (role) {
    case 'applicant': return { label: 'Coach mobile', color: 'bg-blue-500', icon: <FileText size={14} /> };
    case 'agent': return { label: 'Agent', color: 'bg-green-500', icon: <UserCheck size={14} /> };
    case 'supervisor': return { label: 'Superviseur', color: 'bg-purple-500', icon: <Eye size={14} /> };
    case 'admin': return { label: 'Administrateur', color: 'bg-red-500', icon: <Shield size={14} /> };
    default: return { label: 'Utilisateur', color: 'bg-gray-500', icon: null };
  }
}

const SidebarContent = memo(function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = getNavItems(role);
  const roleInfo = getRoleLabel(role);

  const [unreadDiscussionCount, setUnreadDiscussionCount] = useState(0);
  const [isProcessingLocked, setIsProcessingLocked] = useState(false);

  useEffect(() => {
    // Demande permission notifications navigateur (agent + superviseur)
    if ((role === 'agent' || role === 'supervisor') && 'Notification' in window) {
      if (Notification.permission === 'default') {
        requestNotifPermission();
      }
    }
  }, [role]);

  useEffect(() => {
    if (role !== 'agent' || !profile) return;

    let disposed = false;
    const checkProcessing = async () => {
      const { count } = await supabase
        .from('verification_requests')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', profile.id)
        .eq('status', 'processing');
      if (!disposed) setIsProcessingLocked((count || 0) > 0);
    };

    const openActiveRequest = async () => {
      if (disposed || profile.is_paused) return;
      const { data } = await supabase
        .from('verification_requests')
        .select('id')
        .eq('agent_id', profile.id)
        .eq('status', 'processing')
        .order('assigned_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (disposed || !data?.id || profile.is_paused) return;
      const currentId = location.pathname.match(/^\/agent\/process\/([^/]+)/)?.[1] ?? null;
      if (currentId !== data.id) {
        navigate(`/agent/process/${data.id}`);
      }
    };

    // Rattrape une attribution effectuée avant le montage de l’abonnement realtime.
    checkProcessing();
    openActiveRequest();
    const recoveryTimer = window.setInterval(openActiveRequest, 2000);

    const channel = supabase.channel(`main-layout-req-${profile.id}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'verification_requests', filter: `agent_id=eq.${profile.id}` },
        (payload: any) => {
          checkProcessing();
          if ((payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') && payload.new.status === 'processing') {
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('Nouvelle demande Konolive', {
                body: 'Une nouvelle demande vous a été attribuée.',
                icon: '/favicon.png',
              });
            }
            openActiveRequest();
          }
        }
      )
      .subscribe();

    return () => {
      disposed = true;
      window.clearInterval(recoveryTimer);
      supabase.removeChannel(channel).catch(err => console.warn('Erreur lors du nettoyage du canal:', err));
    };
  }, [profile, role, navigate, location.pathname]);

  useEffect(() => {
    if (!profile || (role !== 'agent' && role !== 'supervisor' && role !== 'admin')) return;
    const fetchUnread = async () => {
      const count = await countUnreadInternalMessages(profile.id);
      setUnreadDiscussionCount(count);
    };
    fetchUnread();

    const channel = supabase.channel(`main-layout-unread-${profile.id}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_messages', filter: `receiver_id=eq.${profile.id}` },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(err => console.warn('Erreur lors du nettoyage du canal:', err));
    };
  }, [profile, role]);

  // Bloc déconnexion agent avec demande en cours
  const [blockLogout, setBlockLogout] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const handleSignOut = async () => {
    // Pour les agents : vérifier s'il y a une demande en cours avant de déconnecter
    if (role === 'agent' && profile?.id) {
      const { data } = await supabase
        .from('verification_requests')
        .select('id')
        .eq('agent_id', profile.id)
        .eq('status', 'processing')
        .maybeSingle();

      if (data) {
        setActiveRequestId(data.id);
        setBlockLogout(true);
        return;
      }
    }
    // Marquer explicitement la session comme déconnectée avant de quitter,
    // afin que le superviseur voie « Déconnecté » et non seulement « Hors ligne ».
    await supabase.from('profiles').update({
      is_logged_in: false,
      login_token: null,
      is_online: false,
      is_paused: false,
    }).eq('id', profile?.id ?? '');
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--gradient-sidebar)' }}>
      {/* ── Logo ──────────────────────────────────── */}
      <div className="px-5 py-5 flex items-center gap-3">
        <Link to={getDashboardPath(role)} className="flex items-center gap-3 group" onClick={onNavigate}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
            style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-primary)' }}>
            <Video size={16} className="text-white" />
          </div>
          <span className="text-[15px] font-bold text-white tracking-tight">Konolive</span>
        </Link>
      </div>

      {/* ── Profil ────────────────────────────────── */}
      <div className="mx-3 mb-3 rounded-xl p-3 flex items-center gap-3"
        style={{ background: 'hsl(var(--sidebar-accent))' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: 'var(--gradient-primary)' }}>
          {profile?.username?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{profile?.username}</p>
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] text-white font-medium mt-0.5', roleInfo.color)}>
            {roleInfo.icon}<span>{roleInfo.label}</span>
          </span>
        </div>
      </div>

      {/* ── Navigation ────────────────────────────── */}
      <nav className={cn('flex-1 overflow-y-auto px-3 py-1 space-y-0.5',
        isProcessingLocked && 'opacity-40 pointer-events-none select-none')}>
        {navItems.map(item => {
          const isActive = location.pathname === item.path ||
            (item.path !== getDashboardPath(role) && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-100',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-sidebar-foreground hover:bg-white/5 hover:text-white'
              )}
            >
              <span className={cn('shrink-0 transition-colors', isActive ? 'text-white' : 'text-sidebar-foreground')}>
                {item.icon}
              </span>
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {item.path === '/discussion' && unreadDiscussionCount > 0 && (
                <Badge variant="destructive" className="ml-auto rounded-full px-1.5 min-w-[18px] h-4 text-[9px]">
                  {unreadDiscussionCount > 99 ? '99+' : unreadDiscussionCount}
                </Badge>
              )}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Bas de sidebar ────────────────────────── */}
      <div className="px-3 pb-4 pt-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 flex-1 px-3 py-2 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-white/5 hover:text-white transition-colors duration-100"
          >
            <LogOut size={16} />
            <span>Se déconnecter</span>
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Modale blocage déconnexion ── */}
      <Dialog open={blockLogout} onOpenChange={setBlockLogout}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <DialogTitle className="text-balance">Déconnexion impossible</DialogTitle>
            </div>
            <DialogDescription className="text-pretty">
              Vous avez une <strong>demande en cours de traitement</strong>. Veuillez la clôturer avant de vous déconnecter.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setBlockLogout(false)} className="w-full sm:w-auto">Annuler</Button>
            <Button className="w-full sm:w-auto" onClick={() => {
              setBlockLogout(false);
              navigate(activeRequestId ? `/agent/process/${activeRequestId}` : '/agent');
              onNavigate?.();
            }}>Aller à la demande</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default function MainLayout({ children, hideSidebar }: { children: React.ReactNode; hideSidebar?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, role } = useAuth();
  const roleInfo = getRoleLabel(role);

  // ── Expiration automatique de session par inactivité ──────────────────
  useSessionTimeout(role);

  // ── Synchronisation globale des tableaux métier ───────────────────────────
  // Les pages conservent leurs abonnements ciblés pour les mises à jour fines ;
  // ce canal garantit qu’une mutation sur une autre vue recharge aussi le tableau
  // actuellement affiché, sans nécessiter de bouton Actualiser.
  useEffect(() => {
    if (!profile) return;
    const tables = [
      'verification_requests', 'request_documents', 'messages', 'internal_messages',
      'notifications', 'activity_logs', 'video_calls', 'video_call_states',
      'processing_details', 'drafts', 'pause_sessions', 'work_period_history',
      'processing_options', 'app_settings', 'api_integrations', 'api_integration_logs',
    ] as const;
    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => window.location.reload(), 650);
    };
    const channel = supabase.channel(`global-table-sync-${profile.id}-${Math.random()}`);
    tables.forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
    });
    channel.subscribe();
    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel).catch(err => console.warn('Erreur de synchronisation globale:', err));
    };
  }, [profile?.id]);

  // ── Global incoming INTERNAL call listener (agent & supervisor) ──────────
  // Runs on every page — receives call_invite regardless of current route
  const [globalInternalCall, setGlobalInternalCall] = useState<{
    callId: string; initiatorName: string; participants: Profile[];
  } | null>(null);
  const [activeInternalCall, setActiveInternalCall] = useState<{
    callId: string; participants: Profile[];
  } | null>(null);

  // ── Global presence tracking (all authenticated users) ───────────────────
  useEffect(() => {
    if (!profile) return;

    // 1. Supabase Presence (WebSocket) - Ultra-rapide et gère les coupures réseau
    const presenceCh = supabase.channel(`user-presence-${profile.id}`, {
      config: { presence: { key: profile.id } },
    });
    presenceCh.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        presenceCh.track({ user_id: profile.id, online_at: new Date().toISOString() });
      }
    });

    // 2. Database is_online (REST/PATCH) - Pour les requêtes SQL (stats)
    const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const setOnline  = () => supabase.from('profiles').update({ is_logged_in: true, is_online: true,  is_paused: false }).eq('id', profile.id);
    const setOffline = () => supabase.from('profiles').update({ is_online: false, is_paused: false }).eq('id', profile.id);

    // fetch keepalive → garantit le PATCH à la fermeture
    const sendOfflineBeacon = () => {
      const url = `${supabaseUrl}/rest/v1/profiles?id=eq.${profile.id}`;
      fetch(url, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ is_online: false, is_paused: false }),
      }).catch(() => {});
    };

    setOnline().then(() => {});

    const handleUnload = () => sendOfflineBeacon();
    window.addEventListener('beforeunload', handleUnload);

    const handleVisibility = () => {
      if (document.hidden) setOffline().then(() => {});
      else setOnline().then(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      sendOfflineBeacon();
      supabase.removeChannel(presenceCh).catch(err => console.warn('Erreur lors du nettoyage du canal presence:', err));
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || (role !== 'agent' && role !== 'supervisor')) return;
    const ch = supabase.channel(`internal-call-invite-${profile.id}-${Math.random()}`)
      .on('broadcast', { event: 'call_invite' }, ({ payload }) => {
        if (payload.to !== profile.id) return;
        // Éviter de rouvrir si un appel interne est déjà actif
        setGlobalInternalCall(prev => prev ? prev : {
          callId: payload.callId,
          initiatorName: payload.initiatorName ?? 'Collègue',
          participants: payload.participants ?? [],
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch).catch(err => console.warn('Erreur lors du nettoyage du canal:', err)); };
  }, [profile, role]);

  return (
    <div className="flex min-h-[100dvh] w-full min-w-0 bg-background">
      {/* ── Sidebar desktop ───────────────────────── */}
      {!hideSidebar && (
        <aside className="hidden md:flex flex-col w-60 shrink-0 fixed inset-y-0 left-0 z-30">
          <SidebarContent />
        </aside>
      )}

      {/* ── Contenu principal ─────────────────────── */}
      <div className={cn('flex-1 min-w-0 flex flex-col', !hideSidebar && 'md:ml-60')}>

        {/* Header sticky */}
        {!hideSidebar && (
          <header className="sticky top-0 z-20 flex items-center gap-3 px-4 md:px-6 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            {/* Burger mobile */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden shrink-0 -ml-1">
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-60 max-w-[calc(100vw-2rem)] p-0" aria-describedby={undefined}>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* Logo mobile */}
            <div className="md:hidden flex items-center gap-2 flex-1 min-w-0">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'var(--gradient-primary)' }}>
                <Video size={12} className="text-white" />
              </div>
              <span className="font-bold text-foreground text-sm">Konolive</span>
            </div>

            {/* Spacer desktop */}
            <div className="hidden md:block flex-1" />

            {/* Profil pill */}
            <div className="flex items-center gap-2 shrink-0">
              <div className={cn('hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white', roleInfo.color)}>
                {roleInfo.icon}
                <span>{roleInfo.label}</span>
                <span className="opacity-70">·</span>
                <span>{profile?.username}</span>
              </div>
              {/* Avatar mobile */}
              <div className="md:hidden w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: 'var(--gradient-primary)' }}>
                {profile?.username?.[0]?.toUpperCase() ?? 'U'}
              </div>
            </div>
          </header>
        )}

        <main className={cn('flex-1 min-w-0 max-w-full', hideSidebar ? 'p-0' : 'p-4 md:p-6')}>
          {children}
        </main>
      </div>

      {/* ── Bannière appel interne entrant ─────────── */}
      {globalInternalCall && !activeInternalCall && (
        <div className="fixed inset-x-4 bottom-4 z-50 max-w-none saas-card p-4 border border-primary/20 animate-in slide-in-from-bottom-4 shadow-lg md:inset-x-auto md:bottom-6 md:right-6 md:w-80">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Phone size={16} className="text-primary animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm">Appel entrant</p>
              <p className="text-xs text-muted-foreground truncate">
                De : <span className="font-medium text-foreground">{globalInternalCall.initiatorName}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
              onClick={() => { setActiveInternalCall({ callId: globalInternalCall.callId, participants: globalInternalCall.participants }); setGlobalInternalCall(null); }}>
              Répondre
            </button>
            <button className="flex-1 py-2 rounded-xl bg-destructive hover:opacity-90 text-destructive-foreground text-xs font-semibold transition-colors"
              onClick={() => setGlobalInternalCall(null)}>
              Refuser
            </button>
          </div>
        </div>
      )}

      {/* ── Modal appel interne actif ─────────────── */}
      {activeInternalCall && profile && (
        <InternalCallModal
          callId={activeInternalCall.callId}
          participants={activeInternalCall.participants.filter(p => p.id !== profile.id)}
          isInitiator={false}
          onClose={() => setActiveInternalCall(null)}
        />
      )}
    </div>
  );
}
