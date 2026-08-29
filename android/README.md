# Konolivepro Coach — application Android native

Cette application Kotlin n’est pas une WebView. Elle utilise l’API Supabase partagée, Firebase Cloud Messaging pour le réveil en arrière-plan et WebRTC pour l’audio/vidéo.

## Configuration

1. Installer Android Studio avec le SDK Android 35 et Java 17.
2. Copier `gradle.properties.example` vers `gradle.properties` si nécessaire, puis renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans les propriétés Gradle locales. Ne jamais publier la clé de service Supabase dans l’application.
3. Créer une application Android Firebase dont le package est `com.konolivepro.mobile`, télécharger `google-services.json` et le placer dans `android/app/`. Ce fichier n’est pas inclus dans Git pour éviter d’exposer la configuration Firebase du projet.
4. Appliquer la migration `supabase/migrations/00029_native_android_call_reliability.sql` et déployer la fonction `supabase/functions/send-call-push`.
5. Configurer le secret serveur `FCM_SERVER_KEY` dans l’environnement de la fonction Edge. Le client Android ne doit jamais recevoir cette clé.
6. Configurer un serveur TURN de production. Les serveurs STUN intégrés ne suffisent pas pour tous les réseaux mobiles et NAT stricts; les paramètres TURN devront être ajoutés dans `CallActivity.kt` avant la mise en production.

## Compilation

Depuis ce dossier :

```bash
./gradlew assembleDebug
```

L’APK de test sera généré dans `app/build/outputs/apk/debug/app-debug.apk`. Pour une version de publication, utiliser une clé de signature privée et la tâche `assembleRelease`.

## Fonctionnement des appels

Le serveur crée un état `RINGING` et attribue un `callId`. FCM envoie un message data-only à tous les appareils Android enregistrés pour le coach. Chaque appareil affiche une notification `CallStyle` plein écran avec sonnerie et vibration. L’acceptation, le refus, l’expiration et la fin passent par la fonction RPC atomique `respond_to_mobile_video_call`. Le premier appareil qui accepte gagne; les autres ferment leur écran et annulent leur notification.

L’application demande uniquement les permissions nécessaires : notifications, caméra, microphone, vibration, réveil de l’écran et service au premier plan pendant un appel actif. Elle n’utilise pas la localisation ni l’accès complet à la galerie tant qu’une fonctionnalité correspondante n’est pas ajoutée.

## Vérification avant publication

Tester au minimum l’application ouverte, en arrière-plan, fermée et avec écran verrouillé; l’acceptation et le refus sur deux appareils; l’expiration; le raccrochage par l’agent; la perte de réseau; les permissions refusées; et les appareils Samsung, Xiaomi, Tecno et Infinix. Les réglages d’économie d’énergie de certains fabricants doivent être expliqués à l’utilisateur sans contourner les protections Android.

## Architecture native

L’écran principal est désormais rendu nativement en Kotlin : il ne s’agit pas d’une WebView. L’application utilise directement le client REST Supabase, Firebase Cloud Messaging et le WebSocket Supabase Realtime. La WebView historique n’est plus nécessaire au parcours Android.

Les permissions caméra et microphone sont demandées uniquement au moment d’entrer dans un appel. La localisation est optionnelle et n’est demandée que depuis l’action dédiée de l’écran principal. Les appels entrants utilisent une notification d’appel plein écran et les actions natives Accepter/Refuser; aucune permission de superposition ou d’exemption permanente de batterie n’est requise.

Le package Android de production est `com.konolivepro.mobile`. Le fichier `google-services.json` reste obligatoire pour recevoir les messages FCM et doit être fourni par le projet Firebase correspondant à ce package. La clé Supabase embarquée doit être exclusivement la clé anon publique; aucune clé service ne doit être compilée dans l’APK.

Le navigateur et Android partagent le canal Realtime `call-<callId>` et les événements `ready`, `offer`, `answer`, `ice_candidate` et `call_end`. La machine d’état SQL et la RPC `respond_to_mobile_video_call` restent la source de vérité afin que l’acceptation, le refus, l’expiration et le raccrochage soient atomiques pour les deux plateformes.

Pour la production, renseigner des serveurs TURN authentifiés dans la configuration WebRTC de `CallActivity.kt`. Les serveurs STUN seuls ne garantissent pas la connectivité sur les réseaux mobiles restrictifs.
