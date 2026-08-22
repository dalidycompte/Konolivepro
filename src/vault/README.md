# Coffre-Fort des Identifiants Konolive

## Architecture de sécurité

| Couche | Mécanisme |
|--------|-----------|
| Chiffrement | AES-256-GCM (authentifié) |
| Dérivation de clé | PBKDF2-SHA256 — 310 000 itérations |
| Intégrité | GCM auth tag 128 bits (détecte toute altération) |
| Passphrase | Fragmentée en 4 constantes, jamais écrite en clair ensemble |
| Stockage | `credentials.vault` — uniquement données chiffrées + paramètres KDF |

## Fichiers

```
src/vault/
├── credentials.vault   ← données chiffrées (JSON, aucune info en clair)
├── vault.ts            ← bibliothèque de déchiffrement (Web Crypto API)
└── README.md           ← ce fichier
```

## Ce que le fichier .vault contient

```json
{
  "v": 1,
  "alg": "aes-256-gcm",
  "kdf": "pbkdf2-sha256",
  "iter": 310000,
  "salt": "<base64 aléatoire>",
  "iv":   "<base64 aléatoire>",
  "tag":  "<base64 tag GCM>",
  "data": "<base64 ciphertext>"
}
```

Aucun identifiant, aucun mot de passe n'est lisible dans ce fichier.

## Comptes disponibles dans le coffre

| Rôle | Nombre |
|------|--------|
| Agent | 5 (agent001 → agent005) |
| Superviseur | 2 (supervisor001, supervisor002) |
| Coach mobile (applicant) | 5 (coach001 → coach005) |

## Utilisation dans le code

```ts
import { openVault, getAccountsByRole } from '@/vault/vault';

// Tous les comptes
const accounts = await openVault();

// Uniquement les agents
const agents = await getAccountsByRole('agent');
```

## Sécurité — Points clés

- **Aucun mot de passe en clair** dans le dépôt de code
- La passphrase de dérivation est fragmentée en 4 parties dans `vault.ts`
- La clé AES n'est jamais sérialisée — elle reste dans le contexte Web Crypto
- Toute altération du fichier `.vault` est détectée par le tag GCM (erreur de déchiffrement)
- Le fichier `.vault` peut être versionné sans risque — il est inutilisable sans la passphrase

## Rotation des identifiants

Pour mettre à jour les comptes, utiliser le script de re-chiffrement :

```bash
node scripts/reencrypt-vault.mjs
```

Ce script demande la confirmation avant d'écraser `credentials.vault`.
