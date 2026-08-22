/**
 * useNetworkStatus.ts
 * Détecte l'état réseau (en ligne / hors ligne) en temps réel.
 * Utilise les événements natifs du navigateur (online/offline),
 * compatibles avec Capacitor Android via WebView.
 */
import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  /** true juste après le retour en ligne (3 s) — déclenche la synchronisation */
  justCameBack: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [justCameBack, setJustCameBack] = useState(false);

  useEffect(() => {
    let backTimeout: ReturnType<typeof setTimeout>;

    function handleOnline() {
      setIsOnline(true);
      setJustCameBack(true);
      backTimeout = setTimeout(() => setJustCameBack(false), 3000);
    }

    function handleOffline() {
      setIsOnline(false);
      setJustCameBack(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(backTimeout);
    };
  }, []);

  return { isOnline, justCameBack };
}
