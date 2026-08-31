# Audit temps réel — Konolive Pro

## Résultat

Le site possède des tableaux pour les coaches mobiles, les agents, les superviseurs et les administrateurs. La synchronisation ciblée existait déjà sur plusieurs écrans, mais elle n’était pas homogène : certaines pages rechargeaient leurs données uniquement au montage ou via un bouton manuel.

Une souscription globale Supabase Realtime a été ajoutée dans `MainLayout.tsx`. Elle couvre les tables métier suivantes : `verification_requests`, `request_documents`, `messages`, `internal_messages`, `notifications`, `activity_logs`, `video_calls`, `video_call_states`, `processing_details`, `drafts`, `pause_sessions`, `work_period_history`, `processing_options`, `app_settings`, `api_integrations` et `api_integration_logs`.

Lorsqu’une insertion, modification ou suppression est détectée, le tableau actuellement affiché est rechargé automatiquement après une courte temporisation de regroupement. Les pages qui ont déjà un abonnement ciblé conservent leurs mises à jour fines. La table `profiles` reste gérée par les abonnements de présence et de disponibilité existants, afin d’éviter une boucle de rechargement causée par les écritures de présence elles-mêmes.

## Fonctionnalités auditées

| Domaine | Tables principales | Synchronisation |
|---|---|---|
| Demandes et file superviseur | `verification_requests`, `request_documents` | Globale + abonnements ciblés |
| Disponibilité et présence agents | `profiles` | Abonnements de présence existants |
| Traitement et brouillons | `processing_details`, `drafts`, `processing_options` | Globale |
| Messages et discussion | `messages`, `internal_messages` | Globale + abonnements ciblés |
| Notifications | `notifications` | Globale + abonnements ciblés |
| Appels | `video_calls`, `video_call_states` | Globale + contexte d’appel |
| Historique et journaux | `activity_logs`, `work_period_history`, `pause_sessions` | Globale |
| Configuration et intégrations | `app_settings`, `api_integrations`, `api_integration_logs` | Globale |

## Vérification

Le build de production doit être exécuté avant publication. Après déploiement, une actualisation forcée peut être utile une seule fois pour éliminer un ancien bundle conservé par le navigateur.
