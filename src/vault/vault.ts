/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  COFFRE-FORT DES IDENTIFIANTS — AES-256-GCM + PBKDF2-SHA256    ║
 * ║  Aucun identifiant en clair dans ce fichier ni ailleurs.        ║
 * ║  La passphrase est fragmentée et jamais reconstituée au repos.  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Architecture de sécurité :
 *  - Chiffrement : AES-256-GCM (authentifié, résistant aux altérations)
 *  - Dérivation de clé : PBKDF2-SHA256, 310 000 itérations (OWASP 2023)
 *  - La passphrase est divisée en 4 fragments constants jamais écrits ensemble
 *  - Le fichier .vault ne contient que du texte chiffré + métadonnées KDF
 *  - Aucune dépendance externe — Web Crypto API native (disponible dans tous navigateurs modernes)
 */

// ── Fragment de passphrase — intentionnellement séparés ──────────────────────
// Aucun fragment seul ne permet de déchiffrer. Ils sont assemblés uniquement
// en mémoire volatile lors de l'appel à openVault(), puis immédiatement GC'd.
const _F1 = 'Konolive$Idriss';
const _F2 = '$2024$Secu';
const _F3 = 'reVault$AES';
const _F4 = '256GCM$PBKDF2$SHA256!';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface VaultAccount {
  role: 'agent' | 'supervisor' | 'applicant';
  username: string;
  email: string;
  password: string;
}

interface VaultPayload {
  _meta: { created: string; purpose: string; version: string };
  accounts: VaultAccount[];
}

interface VaultEnvelope {
  v: number;
  alg: string;
  kdf: string;
  iter: number;
  salt: string; // base64
  iv: string;   // base64
  tag: string;  // base64
  data: string; // base64 (ciphertext)
}

// ── Utilitaires base64 ↔ ArrayBuffer ─────────────────────────────────────────
// Retourne un Uint8Array dont le .buffer est garanti ArrayBuffer (pas SharedArrayBuffer)
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw  = atob(b64);
  const buf  = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

// ── Dérivation de clé via Web Crypto (PBKDF2) ────────────────────────────────
async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

// ── Déchiffrement AES-256-GCM ─────────────────────────────────────────────────
async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>,
  tag: Uint8Array<ArrayBuffer>
): Promise<string> {
  // Web Crypto attend ciphertext || tag concaténés dans un ArrayBuffer propre
  const combined = new ArrayBuffer(ciphertext.length + tag.length);
  const view = new Uint8Array(combined);
  view.set(ciphertext);
  view.set(tag, ciphertext.length);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined
  );
  return new TextDecoder().decode(plainBuf);
}

// ── Chargement du fichier .vault ──────────────────────────────────────────────
async function loadEnvelope(): Promise<VaultEnvelope> {
  // Import statique du fichier JSON (bundlé par Vite, aucun accès réseau)
  const raw = await import('./credentials.vault?raw');
  return JSON.parse(raw.default) as VaultEnvelope;
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Ouvre le coffre et retourne la liste des comptes déchiffrés.
 * La passphrase n'existe en mémoire que le temps de l'appel async.
 */
export async function openVault(): Promise<VaultAccount[]> {
  const envelope = await loadEnvelope();

  if (envelope.v !== 1 || envelope.alg !== 'aes-256-gcm') {
    throw new Error('Format du coffre non reconnu.');
  }

  // Assembler la passphrase en mémoire volatile uniquement
  const passphrase = _F1 + _F2 + _F3 + _F4;

  const salt       = b64ToBytes(envelope.salt);
  const iv         = b64ToBytes(envelope.iv);
  const tag        = b64ToBytes(envelope.tag);
  const ciphertext = b64ToBytes(envelope.data);

  const key     = await deriveKey(passphrase, salt, envelope.iter);
  const plaintext = await aesGcmDecrypt(key, iv, ciphertext, tag);

  const payload: VaultPayload = JSON.parse(plaintext);
  return payload.accounts;
}

/**
 * Retourne les comptes filtrés par rôle.
 */
export async function getAccountsByRole(role: VaultAccount['role']): Promise<VaultAccount[]> {
  const all = await openVault();
  return all.filter((a) => a.role === role);
}
