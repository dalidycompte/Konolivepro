# Rapport d’implémentation Konolivepro

## Résultat

L’APK Android Konolivepro est maintenant un **conteneur natif du site web réel**. Au lancement, l’application ouvre `https://dalidycompte.github.io/Konolivepro/` dans une WebView Android sécurisée. Les utilisateurs retrouvent donc le site, ses routes HashRouter, son authentification Supabase, ses écrans métier et son identité visuelle directement dans l’application, sans passer par le navigateur externe.

L’application native fournit la couche Android autour du site : navigation interne avec le bouton Retour, conservation du stockage local et de la session, liens du site ouverts dans l’application, liens externes sécurisés dans le navigateur, sélection de fichiers, capture caméra, accès microphone pour WebRTC, notifications FCM et appels entrants plein écran.

## Fonctionnalités prises en charge par le conteneur

| Fonction du site | Prise en charge Android |
|---|---|
| Navigation `#/login`, `#/dashboard`, `#/dashboard/new-request` et autres routes | Oui, la WebView conserve la navigation HashRouter du site. |
| Authentification et session Supabase | Oui, DOM Storage et stockage local sont activés. |
| Upload des documents et selfie | Oui, le sélecteur de fichiers Android accepte plusieurs images. |
| Capture caméra et microphone | Oui, les permissions Android sont demandées lorsque le site les utilise. |
| Appels WebRTC du site | Oui, les demandes média du domaine Konolive sont autorisées. |
| Notifications d’appel en arrière-plan | Oui, FCM data-only réveille le service Android. |
| Ouverture d’une notification d’appel | Oui, elle ouvre l’application sur le site et transmet l’événement d’appel à la WebView. |
| Bouton Retour Android | Retourne dans l’historique WebView avant de fermer l’application. |
| Liens externes et `mailto:`/`tel:` | Ouvrent le navigateur ou l’application système correspondante. |

## Architecture

Le point d’entrée est `android/app/src/main/java/com/konolivepro/mobile/MainActivity.kt`. Il configure la WebView, active JavaScript et DOM Storage uniquement pour le site, limite les permissions média au domaine `dalidycompte.github.io`, gère les fichiers et relie les événements FCM aux événements JavaScript `konolive:incoming_call` et `konolive:call_state` déjà consommés par le site.

Le service `KonoliveMessagingService` conserve la réception en arrière-plan. `CallNotifications` affiche les notifications d’appel plein écran et transmet l’ouverture vers `MainActivity`. Le backend partagé conserve la machine d’état atomique et l’annulation multi-appareils.

## Vérifications réalisées

Le build de production du site web a réussi avec `npm run build`. La configuration Gradle Android a réussi avec `./gradlew help`. L’APK WebView actuel a été compilé avec `./gradlew assembleDebug`, puis vérifié avec `apksigner` et `aapt`.

| Élément | Valeur |
|---|---|
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Package | `com.konolivepro.mobile` |
| Taille | Environ 49 Mo |
| Compatibilité déclarée | Android 8.0 ou supérieur, SDK 26 à 35 |
| SHA-256 de l’APK WebView | `e86cec6f5067de18aec0f97cdccc4d490a0632eac70dcd11d03b535f58ace94b` |
| Dernier commit publié | `b5c4836f` |

## Configuration à finaliser pour la production

L’APK livré est compilé avec une configuration Firebase temporaire de debug afin de produire l’artefact dans l’environnement disponible. Il ouvre bien le site réel et contient la configuration publique Supabase du site. Pour recevoir les notifications FCM réelles, remplacer localement `android/app/google-services.json` par le fichier officiel Firebase correspondant au package `com.konolivepro.mobile`, puis reconstruire l’APK.

Avant un test complet, appliquer également la migration Supabase, déployer `send-call-push`, configurer `FCM_SERVER_KEY` et ajouter un serveur TURN de production pour les réseaux mobiles stricts. Les clés privées Supabase et FCM ne doivent jamais être intégrées à l’APK.
