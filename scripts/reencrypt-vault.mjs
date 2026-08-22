#!/usr/bin/env node
/**
 * Script de re-chiffrement du coffre-fort des identifiants.
 * Utilisation : node scripts/reencrypt-vault.mjs
 *
 * Ce script relit la passphrase depuis vault.ts, déchiffre le coffre actuel,
 * permet de modifier les comptes, puis re-chiffre avec un nouveau sel/IV aléatoires.
 *
 * NE JAMAIS committer ce script avec des modifications de passphrase.
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline/promises';

const __dir  = dirname(fileURLToPath(import.meta.url));
const VAULT  = resolve(__dir, '../src/vault/credentials.vault');

// ── Passphrase (même fragments que vault.ts) ─────────────────────────────────
const _F1 = 'Konolive$Idriss';
const _F2 = '$2024$Secu';
const _F3 = 'reVault$AES';
const _F4 = '256GCM$PBKDF2$SHA256!';
const PASSPHRASE = _F1 + _F2 + _F3 + _F4;
const ITERATIONS = 310_000;

function deriveKey(salt) {
  return pbkdf2Sync(PASSPHRASE, salt, ITERATIONS, 32, 'sha256');
}

function decrypt(envelope) {
  const salt       = Buffer.from(envelope.salt, 'base64');
  const iv         = Buffer.from(envelope.iv,   'base64');
  const tag        = Buffer.from(envelope.tag,  'base64');
  const ciphertext = Buffer.from(envelope.data, 'base64');
  const key        = deriveKey(salt);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

function encrypt(payload) {
  const salt   = randomBytes(32);
  const iv     = randomBytes(12);
  const key    = deriveKey(salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain  = JSON.stringify(payload);
  const enc    = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();

  return {
    v: 1, alg: 'aes-256-gcm', kdf: 'pbkdf2-sha256', iter: ITERATIONS,
    salt: salt.toString('base64'),
    iv:   iv.toString('base64'),
    tag:  tag.toString('base64'),
    data: enc.toString('base64'),
  };
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n🔐  Coffre-Fort Konolive — Outil de re-chiffrement\n');

  // Lire le coffre actuel
  const raw = readFileSync(VAULT, 'utf8');
  const envelope = JSON.parse(raw);
  const payload = decrypt(envelope);

  console.log(`✅  Coffre déchiffré — ${payload.accounts.length} compte(s) trouvé(s)\n`);
  payload.accounts.forEach((a, i) =>
    console.log(`  [${i}] ${a.role.padEnd(12)} ${a.username.padEnd(16)} ${a.email}`)
  );

  const confirm = await rl.question('\n⚠️  Re-chiffrer maintenant avec un nouveau sel/IV ? (oui/non) : ');
  if (confirm.trim().toLowerCase() !== 'oui') {
    console.log('Annulé.');
    rl.close();
    return;
  }

  const newEnvelope = encrypt(payload);
  writeFileSync(VAULT, JSON.stringify(newEnvelope) + '\n', 'utf8');
  console.log('\n✅  Coffre re-chiffré et sauvegardé dans src/vault/credentials.vault');
  rl.close();
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
