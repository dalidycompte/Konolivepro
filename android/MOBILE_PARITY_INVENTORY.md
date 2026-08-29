# Inventaire de parité mobile Konolivepro

## Authentification et rôles

Le site comporte la connexion, l’inscription et la récupération de mot de passe. Le profil détermine quatre parcours : **applicant**, **agent**, **supervisor** et **admin**. L’application mobile doit conserver ce routage par rôle plutôt que de créer une application différente par type d’utilisateur.

## Fonctionnalités communes

| Domaine | Fonctionnalités web à porter |
|---|---|
| Compte | Connexion, inscription, récupération de mot de passe, profil, déconnexion, thème et état de session. |
| Notifications | Liste, détail ou redirection vers une demande, marquage individuel et global comme lu, push FCM. |
| Discussions | Discussions liées aux demandes, messages internes agent-superviseur, pièces jointes image/audio si utilisées par le backend. |
| Appels | Appel audio/vidéo, sonnerie en arrière-plan, accepter/refuser, expiration, fin distante, WebRTC, caméra/microphone, reconnexion ICE. |

## Applicant / coach mobile

Le parcours applicant comprend le tableau de bord, la création d’une demande de vérification de numéro, l’historique des demandes, le détail d’une demande avec documents et statut, les messages et les notifications.

## Agent

Le parcours agent comprend le tableau de bord et les demandes attribuées ou en attente, la prise en charge d’une demande, le traitement complet avec documents et résultat, l’historique, les messages, le suivi mensuel, les performances, les paramètres, la gestion de son GSM et l’évolution journalière.

## Superviseur

Le parcours superviseur comprend le tableau de bord KPI, la présence des agents, les statistiques agents, l’historique, la gestion des demandes, les rapports/exportations, les paramètres, les options de traitement, le temps de traitement, l’ajout brut et le tableau public de suivi.

## Admin

Le parcours administrateur comprend le tableau de bord, les utilisateurs, le compte administrateur, les demandes, les statistiques, les logs, la configuration, l’historique et les intégrations/API.

## Backend à réutiliser

Les tables principales sont `profiles`, `verification_requests`, `request_documents`, `messages`, `notifications`, `video_calls`, `video_call_states`, `internal_messages` et les tables de configuration/statistiques. Les opérations existantes sont centralisées dans `src/lib/api.ts` et les migrations Supabase. Pour éviter une divergence de sécurité, l’application native doit appeler les RPC et les politiques RLS existantes; elle ne doit jamais embarquer de clé service.

## État de l’APK actuel

L’APK précédent couvre surtout la connexion simple, l’enregistrement FCM et le flux d’appel. Il ne constitue pas encore une parité fonctionnelle complète. La prochaine implémentation doit donc ajouter une navigation native multi-écrans et les modules métier par rôle, au lieu de se limiter à l’écran d’appel.
