import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types/types';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const TYPE_COLORS: Record<string, string> = {
  new_request: 'bg-blue-500',
  request_assigned: 'bg-purple-500',
  status_changed: 'bg-orange-500',
  new_message: 'bg-green-500',
  call_started: 'bg-primary',
  call_ended: 'bg-gray-500',
  missed_call: 'bg-orange-500',
  recall_request: 'bg-red-500',
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const data = await getNotifications(profile.id, 50);
    setNotifications(data);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`notifs-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleMarkAllRead() {
    if (!profile) return;
    await markAllNotificationsRead(profile.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('Toutes les notifications ont été marquées comme lues.');
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const requestPath = profile?.role === 'agent' ? '/agent/process' : '/dashboard/requests';

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground mt-1">{unreadCount} notification{unreadCount !== 1 ? 's' : ''} non lue{unreadCount !== 1 ? 's' : ''}</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="neu-btn flex items-center gap-2 py-2 px-4 text-sm">
              <CheckCheck size={16} /><span>Tout marquer comme lu</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="neu-flat h-20 rounded-xl animate-pulse" />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="neu-card text-center py-16">
            <BellOff size={40} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">Aucune notification pour l'instant.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(n => (
              <div key={n.id}
                className={`neu-card flex items-start gap-4 cursor-pointer transition-all ${!n.is_read ? 'border-l-4 border-primary' : ''}`}
                onClick={() => !n.is_read && handleMarkRead(n.id)}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${TYPE_COLORS[n.type] ?? 'bg-gray-500'}`}>
                  <Bell size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold text-foreground ${!n.is_read ? '' : 'opacity-70'}`}>{n.title}</p>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 text-pretty">{n.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
                {n.request_id && (
                  <Link to={`${requestPath}/${n.request_id}`} onClick={e => e.stopPropagation()}
                    className="text-xs text-primary hover:underline shrink-0 mt-1">Voir</Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
