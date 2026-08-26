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
| SHA-256 | `9462196edffc92e62098884e463d364dd7bb9b1525d60cf041fc43e3f663aff9` |
| Commit source | `f28e9bd4` |
