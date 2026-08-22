import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ── En-têtes communs ───────────────────────────────────────────────────── */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const secureHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

/* ── Rate-limiter en mémoire (par IP + caller) ──────────────────────────── */
interface RateEntry { count: number; resetAt: number }
const _rateStore = new Map<string, RateEntry>();

function isRateLimited(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = _rateStore.get(key);
  if (!entry || now > entry.resetAt) {
    _rateStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

/* ── Validation stricte ─────────────────────────────────────────────────── */
const ALLOWED_ROLES = ['agent', 'supervisor', 'admin'] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

function validateCreateUserPayload(body: unknown): {
  ok: boolean; error?: string;
  username?: string; password?: string; role?: AllowedRole;
} {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corps de requête invalide.' };
  const { username, password, role } = body as Record<string, unknown>;

  if (typeof username !== 'string' || !username.trim())
    return { ok: false, error: 'username requis.' };
  if (!/^[a-zA-Z0-9_]{3,40}$/.test(username.trim()))
    return { ok: false, error: 'username invalide (3-40 car. alphanumériques/_).' };

  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    return { ok: false, error: 'Mot de passe : 8 à 128 caractères.' };
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password))
    return { ok: false, error: 'Mot de passe : 1 majuscule et 1 chiffre requis.' };

  if (typeof role !== 'string' || !(ALLOWED_ROLES as readonly string[]).includes(role))
    return { ok: false, error: `Rôle invalide. Valeurs acceptées : ${ALLOWED_ROLES.join(', ')}.` };

  return { ok: true, username: username.trim(), password, role: role as AllowedRole };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Méthode non autorisée.' }), { status: 405, headers: secureHeaders });

  try {
    /* ── Rate-limit par IP ── */
    const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    if (isRateLimited(`admin-create-user:${clientIp}`, 10, 60_000)) {
      return new Response(JSON.stringify({ error: 'Trop de tentatives. Réessayez dans 1 minute.' }), { status: 429, headers: secureHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    /* ── Vérification session appelant ── */
    const authHeader = req.headers.get('authorization') ?? '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken)
      return new Response(JSON.stringify({ error: 'Token manquant.' }), { status: 401, headers: secureHeaders });

    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(callerToken);
    if (callerErr || !caller)
      return new Response(JSON.stringify({ error: 'Non autorisé.' }), { status: 401, headers: secureHeaders });

    /* ── Vérification rôle admin ── */
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || callerProfile.role !== 'admin')
      return new Response(JSON.stringify({ error: 'Accès réservé aux administrateurs.' }), { status: 403, headers: secureHeaders });

    /* ── Rate-limit par caller (quota admin) ── */
    if (isRateLimited(`admin-create-user:caller:${caller.id}`, 20, 3_600_000)) {
      return new Response(JSON.stringify({ error: 'Quota admin dépassé (20 créations/heure).' }), { status: 429, headers: secureHeaders });
    }

    /* ── Validation payload ── */
    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'JSON invalide.' }), { status: 400, headers: secureHeaders });
    }
    const validation = validateCreateUserPayload(body);
    if (!validation.ok)
      return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: secureHeaders });

    const { username, password, role } = validation;
    const email = `${username!.toLowerCase()}@miaoda.com`;

    /* ── Vérifier si l'utilisateur existe déjà ── */
    const { data: existing } = await supabaseAdmin
      .from('profiles').select('id').eq('username', username!).maybeSingle();
    if (existing)
      return new Response(JSON.stringify({ error: `Le nom d'utilisateur "${username}" est déjà pris.` }), { status: 409, headers: secureHeaders });

    /* ── Création ── */
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: password!,
      email_confirm: true,
      user_metadata: { username, role },
    });
    if (error) throw new Error(error.message);

    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: data.user.id, username, email, role, is_active: true,
    }, { onConflict: 'id' });
    if (profileErr) throw new Error(profileErr.message);

    return new Response(
      JSON.stringify({ success: true, userId: data.user.id, username, role }),
      { status: 201, headers: secureHeaders }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: secureHeaders });
  }
});
