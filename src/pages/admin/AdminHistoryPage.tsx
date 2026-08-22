import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getAllRequests } from '@/lib/api';
import { StatusBadge } from '@/components/common/StatusBadge';
import DayCalendar from '@/components/common/DayCalendar';
import type { VerificationRequest } from '@/types/types';
import { History, X } from 'lucide-react';
import { format, parseISO, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';

function requestDate(r: VerificationRequest): Date | null {
  const raw = r.processed_at ?? r.updated_at;
  if (!raw) return null;
  try { return parseISO(raw); } catch { return null; }
}

export default function AdminHistoryPage() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const data = await getAllRequests(1000);
    setRequests(data.filter(r => ['accepted','rejected','unchanged'].includes(r.status)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = useMemo(() => {
    if (!selectedDay) return requests;
    return requests.filter(r => {
      const d = requestDate(r);
      return d && isSameDay(d, selectedDay);
    });
  }, [requests, selectedDay]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Historique global</h1>
          <p className="text-muted-foreground text-sm mt-1">Toutes les demandes traitées sur la plateforme.</p>
        </div>

        {/* Calendrier */}
        <DayCalendar
          requests={requests}
          selectedDay={selectedDay}
          onDayClick={setSelectedDay}
          title="Traitements par jour"
        />

        {/* Tableau filtré */}
        <div className="neu-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <History size={18} className="text-primary" />
              {selectedDay
                ? `Demandes du ${format(selectedDay, 'd MMMM yyyy', { locale: fr })}`
                : 'Toutes les demandes traitées'}
              <span className="neu-flat text-xs font-bold text-primary px-2 py-0.5 rounded-full">
                {displayed.length}
              </span>
            </h2>
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="neu-flat flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary px-3 py-1.5 rounded-lg transition-colors">
                <X size={13} />Tout afficher
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="neu-pressed h-14 rounded-xl animate-pulse" />)}</div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <History size={32} className="mx-auto mb-2 opacity-30" />
              <p>{selectedDay
                ? `Aucune demande traitée le ${format(selectedDay, 'd MMMM', { locale: fr })}.`
                : 'Aucune demande traitée pour l\'instant.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    {['Téléphone','Coach mobile','Agent','Traitée le','Statut'].map(h => (
                      <th key={h} className="pb-3 pr-4 whitespace-nowrap font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(r => {
                    const d = requestDate(r);
                    return (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-4 text-sm font-medium whitespace-nowrap">+{r.phone_to_certify}</td>
                        <td className="py-3 pr-4 text-sm whitespace-nowrap">{r.applicant?.username ?? '—'}</td>
                        <td className="py-3 pr-4 text-sm whitespace-nowrap">{r.agent?.username ?? '—'}</td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground whitespace-nowrap">
                          {d ? format(d, 'd MMM yyyy, HH:mm', { locale: fr }) : '—'}
                        </td>
                        <td className="py-3 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
