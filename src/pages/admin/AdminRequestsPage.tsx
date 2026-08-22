import React, { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getAllRequests } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest, RequestStatus } from '@/types/types';
import { Search, Phone } from 'lucide-react';
import { format } from 'date-fns';

const FILTERS: { value: RequestStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'pending', label: 'En attente' },
  { value: 'processing', label: 'En cours' },
  { value: 'accepted', label: 'Acceptées' },
  { value: 'rejected', label: 'Rejetées' },
  { value: 'unchanged', label: 'Inchangées' },
];

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getAllRequests(500);
    setRequests(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('admin-requests-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const filtered = requests.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search && !r.phone_to_certify.includes(search) &&
      !r.applicant?.username?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Toutes les demandes</h1>
          <p className="text-muted-foreground text-sm mt-1">{requests.length} demande(s) de vérification au total.</p>
        </div>

        <div className="neu-card py-4 px-5 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="neu-input pl-10" placeholder="Rechercher par téléphone ou coach mobile…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(s => (
              <button key={s.value} onClick={() => setFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === s.value ? 'neu-btn-primary' : 'neu-btn py-1.5 px-3'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="neu-card overflow-hidden">
          {loading ? (
            <div className="space-y-2 p-2">{[1,2,3].map(i => <div key={i} className="neu-pressed h-12 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    {['Téléphone', 'Coach mobile', 'Agent', 'Soumise le', 'Traitée le', 'Statut'].map(h => (
                      <th key={h} className="py-3 px-4 whitespace-nowrap font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">Aucune demande trouvée.</td></tr>
                  ) : filtered.map(r => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 text-sm font-medium whitespace-nowrap">
                        <span className="flex items-center gap-1.5"><Phone size={13} className="text-primary" />+{r.phone_to_certify}</span>
                      </td>
                      <td className="py-3 px-4 text-sm whitespace-nowrap">{r.applicant?.username ?? '—'}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">{r.agent?.username ?? '—'}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), 'dd MMM, HH:mm')}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">{r.processed_at ? format(new Date(r.processed_at), 'dd MMM, HH:mm') : '—'}</td>
                      <td className="py-3 px-4 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
