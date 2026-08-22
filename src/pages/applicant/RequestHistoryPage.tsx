import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getMyRequests } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest, RequestStatus } from '@/types/types';
import { FileText, Search, Phone, CalendarDays } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUSES: { value: RequestStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'pending', label: 'En attente' },
  { value: 'processing', label: 'En cours' },
  { value: 'accepted', label: 'Acceptées' },
  { value: 'rejected', label: 'Rejetées' },
  { value: 'unchanged', label: 'Inchangées' },
];

export default function RequestHistoryPage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const load = useCallback(async () => {
    if (!profile) return;
    const data = await getMyRequests(profile.id, 100);
    setRequests(data);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // Realtime updates
  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('my-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests', filter: `applicant_id=eq.${profile.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  // Uniquement les demandes du jour
  const todayRequests = requests.filter(r => r.created_at.startsWith(todayStr));

  const filtered = todayRequests.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search && !r.phone_to_certify.includes(search)) return false;
    return true;
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">Mes demandes</h1>
            <p className="text-muted-foreground text-sm mt-1">Demandes soumises aujourd'hui.</p>
          </div>
          {/* Badge date du jour */}
          <div className="neu-flat flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm shrink-0">
            <CalendarDays size={15} className="text-primary" />
            <span className="font-medium text-foreground capitalize">
              {format(new Date(), 'EEEE dd MMMM yyyy', { locale: fr })}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="neu-card py-4 px-5 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="neu-input pl-10"
              placeholder="Rechercher par numéro de téléphone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => (
              <button
                key={s.value}
                onClick={() => setFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  filter === s.value ? 'neu-btn-primary' : 'neu-btn text-sm py-1.5 px-3'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Compteur résultats */}
        {!loading && (
          <p className="text-xs text-muted-foreground px-1">
            {filtered.length} demande{filtered.length !== 1 ? 's' : ''} aujourd'hui
          </p>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="neu-flat h-20 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="neu-card text-center py-16">
            <FileText size={40} className="mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">Aucune demande pour aujourd'hui.</p>
            <Link to="/dashboard/new-request" className="text-primary hover:underline text-sm mt-2 inline-block">
              Créer une nouvelle demande
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <Link key={r.id} to={`/dashboard/requests/${r.id}`}
                className="neu-card flex items-center gap-4 py-4 cursor-pointer hover:-translate-y-1 transition-all duration-200">
                <div className="w-11 h-11 rounded-xl neu-pressed flex items-center justify-center shrink-0">
                  <Phone size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">+{r.phone_to_certify}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Soumise à {format(new Date(r.created_at), 'HH:mm')} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: fr })}
                  </p>
                </div>
                <StatusBadge status={r.status} className="shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
