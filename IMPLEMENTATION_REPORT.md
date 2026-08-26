# Rapport d’implémentation Konolivepro

## Résultat

Le dépôt `dalidycompte/Konolivepro` contient une application Android native Kotlin dans `android/`. Elle n’est pas une WebView. Son interface reprend le système visuel du site Konolivepro : fond gris-bleu neumorphique, accent rouge, cartes en relief, identité « Konolive », connexion Coach Mobile, tableau de bord, statistiques, demandes, notifications, messages, paramètres et navigation inférieure.

L’application conserve les fonctions natives d’appel entrant : FCM data-only, notification plein écran, sonnerie, vibration, acceptation, refus, expiration, WebRTC, caméra, microphone, service au premier plan et synchronisation multi-appareils.

## Équivalence avec le site web

| Parcours web | Équivalent Android natif |
|---|---|
| Connexion | Formulaire identifiant ou e-mail et mot de passe avec la même convention de compte. |
| Tableau de bord | Bienvenue, disponibilité, nouvelle demande, statistiques du jour, demandes récentes et notifications récentes. |
| Nouvelle demande | Saisie du numéro à certifier et création via le RPC Supabase partagé. |
| Historique des demandes | Liste native des demandes avec numéro, date et statut. |
| Notifications | Liste native des notifications Supabase. |
| Messages | Écran natif réservé aux échanges Coach Mobile. |
| Paramètres | Profil, configuration batterie et déconnexion. |
| Appel entrant | Écran Android plein écran prioritaire, indépendant du cycle de vie de l’application. |

## Backend et synchronisation

La migration `supabase/migrations/00029_native_android_call_reliability.sql` ajoute le registre des appareils, les transitions atomiques et les états `RINGING`, `ACCEPTED`, `CONNECTED`, `REJECTED`, `EXPIRED` et `ENDED`. La fonction `supabase/functions/send-call-push` envoie les événements à tous les appareils Android du Coach Mobile. Le site crée maintenant l’état `RINGING` avant de publier l’invitation et ferme les appels sur les autres appareils lorsqu’un état final est reçu.

## Vérifications réalisées

Le build de production du site web a réussi avec `npm run build`, la configuration Gradle Android a réussi avec `./gradlew help`, et l’APK a été compilé avec `./gradlew assembleDebug`. Le fichier produit est signé avec la clé debug et vérifié par `apksigner`.

| Élément | Valeur |
|---|---|
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Package | `com.konolivepro.mobile` |
| Taille | Environ 49 Mo |
| Compatibilité déclarée | Android 8.0 ou supérieur, SDK 26 à 35 |
| SHA-256 de l’APK actuel | `37f1a3b4b3a39941fe6cb66fab725c3dd3d3815274b53222cc9ce4587db2d302` |

## Configuration production à remplacer

L’APK livré est compilé avec une configuration Firebase temporaire de debug afin de permettre la génération de l’artefact. Il s’installe et contient la configuration publique Supabase du site, mais les notifications FCM réelles nécessitent le fichier Firebase privé `android/app/google-services.json` du projet Konolivepro, placé localement puis suivi d’une nouvelle compilation.

Avant le premier test réel, appliquer la migration Supabase, déployer la fonction `send-call-push`, configurer le secret serveur `FCM_SERVER_KEY`, renseigner les paramètres Supabase locaux et ajouter un serveur TURN de production dans `CallActivity.kt`. La clé de service Supabase et la clé FCM ne doivent jamais être intégrées à l’APK.

Le dernier commit publié est `e0783405` sur la branche `main`.
