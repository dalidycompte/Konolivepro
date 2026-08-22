/**
 * Utilitaires de sécurité côté client
 * — Validation & sanitisation des inputs
 * — Rate-limiting en mémoire (protection brute-force UI)
 * — Indicateur de force de mot de passe
 * — Chiffrement léger des données sensibles en mémoire
 */

/* ── 1. Sanitisation texte ─────────────────────────────────────────────── */

/** Supprime les caractères dangereux d'une chaîne (XSS basic) */
export function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/&/g, '&amp;')
    .trim();
}

/** Nettoie un nom d'utilisateur : lettres, chiffres, underscores */
export function sanitizeUsername(input: string): string {
  return input.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
}

/** Empêche les injections SQL basiques dans les champs libres */
export function sanitizeForSQL(input: string): string {
  return input
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .trim();
}

/* ── 2. Validateurs ────────────────────────────────────────────────────── */

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

export function validateUsername(username: string): ValidationResult {
  const u = username.trim();
  if (!u) return { valid: false, error: "Le nom d'utilisateur est requis." };
  if (u.length < 3) return { valid: false, error: "Minimum 3 caractères." };
  if (u.length > 40) return { valid: false, error: "Maximum 40 caractères." };
  if (!/^[a-zA-Z0-9_]+$/.test(u))
    return { valid: false, error: "Lettres, chiffres et underscores uniquement." };
  return { valid: true, error: null };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) return { valid: false, error: "Le mot de passe est requis." };
  if (password.length < 8) return { valid: false, error: "Minimum 8 caractères." };
  if (password.length > 128) return { valid: false, error: "Maximum 128 caractères." };
  if (!/[A-Z]/.test(password))
    return { valid: false, error: "Au moins une lettre majuscule requise." };
  if (!/[0-9]/.test(password))
    return { valid: false, error: "Au moins un chiffre requis." };
  return { valid: true, error: null };
}

export function validatePhone(phone: string): ValidationResult {
  if (!phone.trim()) return { valid: true, error: null }; // optionnel
  const cleaned = phone.replace(/[\s\-().]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(cleaned))
    return { valid: false, error: "Numéro de téléphone invalide." };
  return { valid: true, error: null };
}

export function validateSecurityAnswer(answer: string): ValidationResult {
  const a = answer.trim();
  if (!a) return { valid: false, error: "La réponse secrète est requise." };
  if (a.length < 2) return { valid: false, error: "Réponse trop courte." };
  if (a.length > 100) return { valid: false, error: "Réponse trop longue (max 100 car.)." };
  return { valid: true, error: null };
}

/* ── 3. Rate-limiter en mémoire (client) ───────────────────────────────── */

interface RateLimitEntry {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

const _store = new Map<string, RateLimitEntry>();

/**
 * Vérifie si une action est autorisée.
 * @param key       Identifiant de l'action (ex : 'login', 'register')
 * @param maxAttempts Nombre max de tentatives dans la fenêtre
 * @param windowMs  Fenêtre de temps (ms) — default 60s
 * @param blockMs   Durée de blocage après dépassement — default 60s
 */
export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 60_000,
  blockMs = 60_000,
): { allowed: boolean; remainingMs: number } {
  const now = Date.now();
  const entry = _store.get(key);

  if (!entry) {
    _store.set(key, { count: 1, firstAttemptAt: now, blockedUntil: null });
    return { allowed: true, remainingMs: 0 };
  }

  /* Encore bloqué ? */
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return { allowed: false, remainingMs: entry.blockedUntil - now };
  }

  /* Réinitialiser après la fenêtre */
  if (now - entry.firstAttemptAt > windowMs) {
    _store.set(key, { count: 1, firstAttemptAt: now, blockedUntil: null });
    return { allowed: true, remainingMs: 0 };
  }

  entry.count += 1;

  if (entry.count > maxAttempts) {
    entry.blockedUntil = now + blockMs;
    return { allowed: false, remainingMs: blockMs };
  }

  return { allowed: true, remainingMs: 0 };
}

/** Réinitialise le compteur d'une clé (ex : après succès) */
export function resetRateLimit(key: string): void {
  _store.delete(key);
}

/* ── 4. Constantes de sécurité ─────────────────────────────────────────── */

/* ── 5. Indicateur de force de mot de passe ────────────────────────────── */

export type PasswordStrength = 'faible' | 'moyen' | 'fort' | 'très fort';

export interface PasswordStrengthResult {
  score: number;          // 0-4
  label: PasswordStrength;
  color: string;          // Tailwind token
  suggestions: string[];
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  let score = 0;
  const suggestions: string[] = [];

  if (password.length >= 8)  score++;
  else suggestions.push('Au moins 8 caractères');

  if (password.length >= 12) score++;
  else if (password.length >= 8) suggestions.push('12 caractères ou plus recommandés');

  if (/[A-Z]/.test(password)) score++;
  else suggestions.push('Ajouter une majuscule');

  if (/[0-9]/.test(password)) score++;
  else suggestions.push('Ajouter un chiffre');

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else suggestions.push('Ajouter un caractère spécial (!@#$...)');

  // Pénalité motifs faibles
  if (/^(.)\1+$/.test(password)) score = Math.max(0, score - 2);
  if (/^(123|abc|password|azerty|qwerty)/i.test(password)) score = Math.max(0, score - 2);

  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const levels: Record<number, { label: PasswordStrength; color: string }> = {
    0: { label: 'faible',    color: 'text-red-500'    },
    1: { label: 'faible',    color: 'text-red-500'    },
    2: { label: 'moyen',     color: 'text-orange-500' },
    3: { label: 'fort',      color: 'text-yellow-500' },
    4: { label: 'très fort', color: 'text-green-500'  },
  };

  return { score: clamped, ...levels[clamped], suggestions };
}

/* ── 6. Masquage données sensibles ─────────────────────────────────────── */

/** Masque partiellement un identifiant pour affichage (logs, UI) */
export function maskSensitive(value: string, visibleChars = 3): string {
  if (value.length <= visibleChars) return '***';
  return value.slice(0, visibleChars) + '***';
}

/** Nettoie un objet profil des champs sensibles avant log/affichage */
export function stripSensitiveFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const SENSITIVE = ['login_token', 'password', 'fcm_token', 'email'];
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !SENSITIVE.includes(k))
  ) as Partial<T>;
}

/* ── 7. Tokens sécurisés ───────────────────────────────────────────────── */

/** Génère un token de session cryptographiquement aléatoire */
export function generateSecureToken(): string {
  return crypto.randomUUID();
}

export const SECURITY = {
  MAX_INPUT_LENGTH:         256,
  MAX_NOTES_LENGTH:         1000,
  MAX_PHONE_LENGTH:         20,
  SESSION_TIMEOUT_AGENT_MS: 30 * 60 * 1000,  // 30 min inactivité (agent)
  SESSION_TIMEOUT_SUPER_MS: 60 * 60 * 1000,  // 60 min inactivité (superviseur)
  SESSION_TIMEOUT_MS:       30 * 60 * 1000,  // alias legacy
  SESSION_WARN_BEFORE_MS:   5  * 60 * 1000,  // avertissement 5 min avant expiration
  RATE_LIMIT_LOGIN:         { max: 5,  windowMs: 60_000,  blockMs: 120_000 },
  RATE_LIMIT_REGISTER:      { max: 3,  windowMs: 300_000, blockMs: 300_000 },
  RATE_LIMIT_GEOCODE:       { max: 10, windowMs: 60_000,  blockMs: 30_000  },
  PASSWORD_MIN_LENGTH:      8,
  PASSWORD_MAX_LENGTH:      128,
  USERNAME_MIN_LENGTH:      3,
  USERNAME_MAX_LENGTH:      40,
} as const;
