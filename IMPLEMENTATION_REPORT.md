# Rapport d’implémentation Konolivepro

## Application du site réel

L’APK Konolivepro ouvre le site web réel `https://dalidycompte.github.io/Konolivepro/` dans une WebView native. Les utilisateurs utilisent les mêmes pages, routes HashRouter, formulaire de connexion, tableaux de bord et fonctions métier que sur le site, sans être redirigés vers un navigateur externe.

## Appel entrant lorsque l’application est fermée

Le comportement demandé est implémenté. Lorsqu’un message FCM haute priorité arrive alors que l’application est en arrière-plan ou fermée normalement, le service Android reçoit l’invitation, lance une notification d’appel de priorité élevée et ouvre `IncomingCallActivity` en plein écran. Cette page affiche le nom de l’appelant, sa photo si elle est accessible, le compte à rebours, les boutons `Refuser` et `Accepter`, la sonnerie configurée sur le téléphone et un schéma de vibration répétée.

La page d’appel utilise le mode d’usage système `USAGE_NOTIFICATION_RINGTONE` pour respecter la sonnerie du téléphone. Elle demande uniquement les autorisations Android nécessaires : notifications, vibration, réveil de l’écran, caméra et microphone. L’acceptation passe par l’état atomique Supabase puis ouvre l’appel WebRTC. Le refus et l’expiration arrêtent immédiatement la sonnerie, la vibration et la notification. Un événement de fin reçu d’un autre appareil ferme aussi l’écran et arrête l’alerte.

Lorsque l’utilisateur touche le contenu de la notification plutôt qu’un bouton direct, l’application ouvre le site dans la WebView et transmet l’événement d’appel à la page web. Les boutons d’action `Accepter` et `Refuser` de la notification restent reliés à l’écran d’appel natif pour permettre une réponse rapide depuis l’écran verrouillé.

## Conditions Android importantes

Le comportement fonctionne lorsque l’application est en arrière-plan ou fermée par l’utilisateur, à condition que les notifications, l’affichage plein écran et la batterie ne soient pas bloqués par le système. Les appareils Samsung, Xiaomi, Tecno, Infinix et certains autres fabricants peuvent suspendre les notifications en raison de leurs réglages d’économie d’énergie; l’écran Paramètres de l’application contient un accès à la configuration de la batterie.

Android ne permet pas à une application de contourner un arrêt forcé explicite par l’utilisateur, le mode Ne pas déranger ou la désactivation manuelle des notifications. Ces limites sont également applicables aux applications de type WhatsApp.

## Vérifications

Le build Android `assembleDebug` a réussi avec le fichier Firebase officiel fourni. L’APK est signé avec la clé debug et vérifié avec `apksigner`. Le test de réception FCM sur un appareil physique doit encore être réalisé avec le backend `send-call-push` déployé et son secret FCM configuré.

| Élément | Valeur |
|---|---|
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Package Firebase | `com.dalidycompte.konolive` |
| Compatibilité déclarée | Android 8.0 ou supérieur, SDK 26 à 35 |
| Taille | Environ 49 Mo |
| SHA-256 | `4046524687373c85e36c7c07b1e9a2617631f7f77bbfe627397729e0a7aacaf9` |
| Commit source | `c6efc382` |

## Architecture offline-first

L’application Android dispose maintenant d’un cache SQLite local pour les demandes et notifications, d’une file persistante d’actions à rejouer et d’un `OfflineSyncWorker` exécuté lorsque le réseau est disponible. Les synchronisations sont déclenchées au lancement, au retour de la connectivité et périodiquement avec une contrainte réseau. Les opérations sont rejouées dans l’ordre; un échec déclenche un backoff et les entrées trop anciennes sont retirées après plusieurs tentatives.

Lorsque le site est connecté dans la WebView, `RealtimeDataSync` ouvre une souscription Supabase Realtime filtrée sur l’utilisateur courant. Un changement de demande ou de notification déclenche une synchronisation du cache local. En cas de coupure, le client se reconnecte avec un backoff progressif. Si le site ne peut pas être chargé, l’application affiche une page locale indiquant les données en cache et le nombre d’actions en attente.

Cette version est un mode offline-first de l’application Android : les appels entrants restent traités immédiatement par FCM lorsqu’Android peut réveiller l’application, tandis que les données métier et actions hors connexion sont conservées localement puis synchronisées dès le retour du réseau. Comme pour toute application Android, un arrêt forcé explicite, la désactivation des notifications ou un mode d’économie d’énergie agressif peuvent empêcher le système de réveiller les processus en arrière-plan.
