# Rapport d’implémentation Konolivepro

## Résultat

L’APK Android Konolivepro est un **conteneur natif du site web réel**. Au lancement, l’application ouvre `https://dalidycompte.github.io/Konolivepro/` dans une WebView Android sécurisée. Les utilisateurs retrouvent donc le site, ses routes HashRouter, son authentification Supabase, ses écrans métier et son identité visuelle directement dans l’application, sans passer par le navigateur externe.

L’application native fournit la couche Android autour du site : navigation interne avec le bouton Retour, conservation du stockage local et de la session, liens du site ouverts dans l’application, liens externes sécurisés dans le navigateur, sélection de fichiers, capture caméra, accès microphone pour WebRTC, notifications FCM et appels entrants plein écran.

## Fonctionnalités prises en charge

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

## Configuration Firebase

Le fichier Firebase officiel fourni a été utilisé localement pour produire l’APK. Il correspond au projet `konolivepro` et au package Android `com.dalidycompte.konolive`. Le fichier `google-services.json` est ignoré par Git et n’est pas publié dans le dépôt.

## Vérifications réalisées

Le build de production du site web a réussi avec `npm run build`. La configuration Gradle Android a réussi avec `./gradlew help`. L’APK WebView actuel a été compilé avec `./gradlew clean assembleDebug`, puis vérifié avec `apksigner` et `aapt`.

| Élément | Valeur |
|---|---|
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Package | `com.dalidycompte.konolive` |
| Taille | Environ 49 Mo |
| Compatibilité déclarée | Android 8.0 ou supérieur, SDK 26 à 35 |
| SHA-256 de l’APK Firebase | `3205a5659035fb31e00de5e3283538cbdb5f05d7f5572fb2a9d9eaf271c41b16` |
| Dernier commit publié | À mettre à jour après publication du package Firebase |

## Backend et synchronisation

La migration `supabase/migrations/00029_native_android_call_reliability.sql` ajoute le registre des appareils, les transitions atomiques et les états `RINGING`, `ACCEPTED`, `CONNECTED`, `REJECTED`, `EXPIRED` et `ENDED`. La fonction `supabase/functions/send-call-push` envoie les événements aux appareils Android du Coach Mobile. Le site crée l’état `RINGING` avant de publier l’invitation et ferme les appels sur les autres appareils lorsqu’un état final est reçu.

## Mise en production

L’APK joint ouvre le site réel et embarque la configuration Firebase officielle du projet fourni. Il reste nécessaire de vérifier dans Firebase que l’API FCM est activée et que le backend Edge possède le secret serveur `FCM_SERVER_KEY`. Il faut aussi appliquer la migration Supabase et ajouter un serveur TURN de production pour les réseaux mobiles stricts. Les clés privées Supabase et FCM ne doivent jamais être intégrées à l’APK.
