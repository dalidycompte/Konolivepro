import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, CloudOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { syncOfflineQueue } from '@/lib/offlineSync';
import { count } from '@/lib/offlineQueue';
import { toast } from 'sonner';

/**
 * OfflineBanner
 * Bandeau fixe en haut de l'écran indiquant l'état réseau.
 * — Hors ligne : bandeau rouge avec icône WifiOff + nombre d'actions en attente.
 * — Retour en ligne : bandeau vert pendant la synchronisation.
 * — Après sync : confirmation discrète puis disparition.
 */
export default function OfflineBanner() {
  const { isOnline, justCameBack } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  // Charge le nombre d'éléments en attente
  useEffect(() => {
    count().then(setPendingCount);
  }, [isOnline]);

  // Synchronisation automatique au retour de connexion
  useEffect(() => {
    if (!justCameBack) return;
    (async () => {
      const n = await count();
      if (n === 0) return;

      setSyncing(true);
      try {
        const { processed, failed } = await syncOfflineQueue((done, total) => {
          setPendingCount(total - done);
        });
        setSyncDone(true);
        setPendingCount(0);
        if (processed > 0) {
          toast.success(`${processed} action(s) synchronisée(s) avec succès.`);
        }
        if (failed > 0) {
          toast.error(`${failed} action(s) n'ont pas pu être synchronisée(s).`);
        }
      } catch {
        toast.error('Erreur lors de la synchronisation.');
      } finally {
        setSyncing(false);
        setTimeout(() => setSyncDone(false), 3000);
      }
    })();
  }, [justCameBack]);

  // Pas d'affichage si en ligne, pas de sync, pas de données en attente
  if (isOnline && !syncing && !syncDone) return null;

  // ── Bandeau de synchronisation ─────────────────────────────────────
  if ((isOnline && syncing) || syncDone) {
    return (
      <div
        role="status"
        className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium transition-all duration-300 ${
          syncDone
            ? 'bg-green-600 text-white'
            : 'bg-blue-600 text-white'
        }`}
      >
        {syncDone ? (
          <>
            <CheckCircle2 size={15} className="shrink-0" />
            <span>Synchronisation terminée</span>
          </>
        ) : (
          <>
            <RefreshCw size={15} className="shrink-0 animate-spin" />
            <span>
              Synchronisation en cours
              {pendingCount > 0 ? ` (${pendingCount} restant${pendingCount > 1 ? 's' : ''})` : '…'}
            </span>
          </>
        )}
      </div>
    );
  }

  // ── Bandeau hors ligne ─────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div
        role="alert"
        className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium bg-destructive text-destructive-foreground"
      >
        <WifiOff size={15} className="shrink-0" />
        <span>
          Hors ligne
          {pendingCount > 0
            ? ` — ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`
            : ''}
        </span>
        <CloudOff size={14} className="shrink-0 ml-1 opacity-70" />
      </div>
    );
  }

  return null;
}
