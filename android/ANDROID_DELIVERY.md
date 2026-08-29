# Livraison Android native — Konolivepro

## Résumé

Le dépôt contient maintenant une application Android native Kotlin dans `android/`. L’écran principal n’est plus une WebView : il utilise directement l’API REST Supabase, Firebase Cloud Messaging et Supabase Realtime. L’application web et l’APK restent donc connectés au même backend, à la même base de données et au même contrat d’appel.

Le flux d’appel entrant repose sur FCM data-only, une notification de catégorie appel avec `CallStyle`, un écran plein écran visible sur écran verrouillé, la sonnerie, le vibreur et les actions **Accepter**/**Refuser**. La communication acceptée utilise WebRTC natif Android. Le protocole partagé est le canal Realtime `call-<callId>` avec `ready`, `offer`, `answer`, `ice_candidate` et `call_end`.

## Changements appliqués

| Domaine | Réalisation |
|---|---|
| Interface | Remplacement du conteneur WebView de `MainActivity` par une interface native de connexion et de statut. |
| Authentification | Connexion Supabase par e-mail/mot de passe et stockage de session local existant. |
| Notifications | Enregistrement du token FCM auprès de `register_mobile_push_device`. |
| Appels entrants | Écran natif plein écran, écran verrouillé, réveil, sonnerie, vibration, expiration et notifications d’appel manqué. |
| Réponse d’appel | Appel de `respond_to_mobile_video_call` pour `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONNECTED` et `ENDED`. |
| WebRTC | Ajout de la gestion native du message `answer`, en plus de `offer`, `ice_candidate` et `call_end`. |
| Service actif | Utilisation des types foreground `camera|microphone` pendant un appel actif et `remoteMessaging` pour le réveil d’un appel entrant. |
| Permissions | Suppression de la superposition système, de l’exemption obligatoire de batterie et de `MANAGE_OWN_CALLS`; la caméra et le microphone sont demandés à l’entrée dans l’appel, la localisation depuis une action dédiée. |
| Identité Android | Alignement de `applicationId` sur `com.konolivepro.mobile`. |

Les restrictions Android récentes réservent les notifications plein écran aux cas d’appel ou d’alarme justifiés, ce qui correspond ici au flux d’appel entrant [1]. FCM doit utiliser une priorité élevée pour tenter une livraison immédiate et réveiller un appareil endormi dans les limites du système [2]. Les types de services au premier plan doivent être déclarés et cohérents avec l’usage de la caméra et du microphone [3].

## Configuration obligatoire avant compilation de production

Depuis Android Studio, installer le SDK Android 35 et Java 17. Dans `android/gradle.properties`, renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY`, cette dernière étant uniquement la clé publique anon. Ajouter le fichier Firebase `android/app/google-services.json` correspondant exactement au package `com.konolivepro.mobile`; ce fichier n’est pas inclus dans Git.

Appliquer la migration `supabase/migrations/00029_native_android_call_reliability.sql` et déployer `supabase/functions/send-call-push`. La fonction serveur doit utiliser une authentification FCM côté serveur et ne doit jamais exposer de clé privée dans l’APK. Un serveur TURN authentifié doit également être ajouté à la configuration `PeerConnection` de `CallActivity.kt`; STUN seul ne couvre pas tous les réseaux mobiles et NAT restrictifs.

## Compilation et validation

La commande prévue est :

```bash
cd android
./gradlew assembleDebug
```

Dans l’environnement de travail utilisé pour cette livraison, Gradle a bien démarré mais n’a pas pu compiler, car aucun SDK Android n’était installé : `SDK location not found`. Aucun APK n’est donc joint comme artefact compilé. La validation finale doit être réalisée sur une machine Android Studio configurée, avec `google-services.json` et les propriétés Supabase.

Le test d’acceptation doit couvrir l’application ouverte, en arrière-plan, terminée, avec écran verrouillé, deux appareils recevant le même appel, acceptation concurrente, refus, expiration, raccrochage web, perte réseau, permissions refusées et les appareils Samsung, Xiaomi, Tecno et Infinix. Il faut aussi vérifier la conformité de la fiche Google Play pour l’usage de `USE_FULL_SCREEN_INTENT`, car cette permission est contrôlée selon la nature réelle de l’application [1].

## Références

[1]: https://source.android.com/docs/core/permissions/fsi-limits "Android Open Source Project — Full-screen intent limits"
[2]: https://firebase.google.com/docs/cloud-messaging/android-message-priority "Firebase — Set and manage Android message priority"
[3]: https://developer.android.com/about/versions/14/changes/fgs-types-required "Android Developers — Foreground service types are required"
