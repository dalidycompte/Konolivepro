# Rapport d’implémentation Konolivepro

## Résultat

Le dépôt `dalidycompte/Konolivepro` contient maintenant un projet Android natif Kotlin dans `android/`. Il ne s’agit pas d’une WebView. L’application comprend l’authentification coach, l’enregistrement des appareils Android, la réception FCM data-only, la notification d’appel plein écran, la sonnerie, la vibration, l’acceptation, le refus, l’expiration, l’appel WebRTC et l’arrêt propre de la caméra, du microphone et du service au premier plan.

Le site et le backend ont été adaptés pour créer l’état `RINGING` avant l’envoi d’une invitation, utiliser une machine d’état atomique côté PostgreSQL, empêcher l’acceptation après expiration, synchroniser `video_calls`, propager les états aux autres appareils et supprimer l’écouteur web dupliqué.

## Fichiers principaux

| Domaine | Fichier |
|---|---|
| Application Android | `android/app/src/main/java/com/konolivepro/mobile/` |
| Configuration Android | `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml` |
| RPC et registre multi-appareils | `supabase/migrations/00029_native_android_call_reliability.sql` |
| Invitations et annulations FCM | `supabase/functions/send-call-push/index.ts` |
| Synchronisation web | `src/contexts/VideoCallContext.tsx`, `src/components/video/VideoCallModal.tsx` |

## Vérifications réalisées

Le build de production du site web a réussi avec `npm run build` et la vérification `git diff --check` a réussi. La configuration Gradle Android a été validée avec `./gradlew help`.

La génération de l’APK n’a pas pu être exécutée dans l’environnement actuel, car aucun Android SDK n’est installé. Gradle a indiqué qu’il faut définir `ANDROID_HOME` ou `android/local.properties`. La compilation Android nécessite également le fichier privé Firebase `android/app/google-services.json`, à fournir par le propriétaire du projet Firebase.

## Mise en service nécessaire

Avant un test réel, appliquer la migration Supabase, déployer la fonction `send-call-push`, renseigner le secret serveur `FCM_SERVER_KEY`, placer le fichier Firebase correspondant au package `com.konolivepro.mobile`, puis fournir l’URL et la clé publique Supabase dans les propriétés Gradle locales. Un serveur TURN de production doit aussi être ajouté dans `CallActivity.kt` pour garantir les appels sur les réseaux mobiles et les NAT stricts.

Le commit publié est `6f1b1a99` sur la branche `main`.
