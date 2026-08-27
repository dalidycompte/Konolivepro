# Déploiement sécurisé de FCM HTTP v1

La fonction `supabase/functions/send-call-push/index.ts` utilise désormais **FCM HTTP v1**. Elle envoie des messages Android `data-only` avec une priorité `HIGH`, un TTL court et un identifiant de regroupement par appel. Le fichier de compte de service n’est jamais lu par l’application Android et ne doit pas être ajouté au dépôt GitHub.

## Secret Supabase requis

Le secret attendu par la fonction est `FCM_SERVICE_ACCOUNT_JSON`. Sa valeur doit être le contenu JSON complet du compte de service Firebase fourni séparément. Il ne faut pas créer un fichier de compte de service sous `android/`, `supabase/` ou dans le dépôt.

Depuis un environnement où la CLI Supabase est authentifiée et où le fichier secret est stocké hors du dépôt :

```bash
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat /chemin/vers/compte-service-firebase.json)" --project-ref <PROJECT_REF_SUPABASE>
supabase functions deploy send-call-push --project-ref <PROJECT_REF_SUPABASE>
```

Une autre possibilité consiste à créer le secret dans le tableau de bord Supabase, dans les secrets de la fonction Edge, puis à déployer uniquement la fonction `send-call-push`.

## Vérifications Google Cloud et Firebase

Le projet Google du compte de service doit être `konolivepro`, l’API Firebase Cloud Messaging doit être activée et le compte de service doit disposer des droits nécessaires pour envoyer des messages FCM. Le secret doit être limité à cette fonction serveur et ne doit pas être placé dans une variable accessible au client.

Après le déploiement, un appel de test doit être réalisé avec un compte connecté et un appareil Android ayant enregistré son token dans `mobile_push_devices`. La réponse doit indiquer `sent: true` et un `sentCount` supérieur à zéro. Les erreurs FCM `UNREGISTERED` sont automatiquement supprimées du registre des appareils.

## Sécurité de la clé précédemment téléversée

Le fichier fourni contient une clé privée de compte de service. Cette clé doit être considérée comme exposée : elle doit être révoquée dans Google Cloud, puis remplacée par une nouvelle clé avant un déploiement de production. Aucune clé privée n’est incluse dans ce dépôt, dans l’APK ou dans cette documentation.

## Compatibilité Android 14

Le client Android reste un récepteur FCM `data-only`. À la réception, il démarre le service foreground, publie immédiatement la notification d’appel et lance l’alerte sonore et vibratoire. Pour que le comportement soit visible sur l’appareil, les notifications, le canal « Appels entrants », les notifications plein écran, le volume de sonnerie et l’absence de restriction batterie doivent être activés par l’utilisateur.
