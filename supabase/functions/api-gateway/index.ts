/**
 * Edge Function : api-gateway
 * Valide les clés API, applique le rate-limiting, journalise les appels
 * et expose les endpoints accessibles aux applications externes.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Api-Key',
  'Content-Type': 'application/json',
};

// ── Rate limiter en mémoire (par clé API) ─────────────────────────────────
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(key: string, maxReq: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxReq) return false;
  entry.count++;
  return true;
}

// ── Handler principal ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const start = Date.now();
  const url   = new URL(req.url);
  const path  = url.pathname.replace('/api-gateway', '') || '/';

  // ── 1. Authentification API Key ──────────────────────────────────────
  const apiKey =
    req.headers.get('X-Api-Key') ??
    (req.headers.get('Authorization') ?? '').replace('Bearer ', '');

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Clé API manquante.', code: 'MISSING_KEY' }),
      { status: 401, headers: corsHeaders },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: integration, error: intErr } = await supabase
    .from('api_integrations')
    .select('id,name,permissions,is_active,rate_limit,revoked_at')
    .eq('api_key', apiKey)
    .maybeSingle();

  if (intErr || !integration) {
    return new Response(
      JSON.stringify({ error: 'Clé API invalide.', code: 'INVALID_KEY' }),
      { status: 401, headers: corsHeaders },
    );
  }

  if (!integration.is_active || integration.revoked_at) {
    return new Response(
      JSON.stringify({ error: 'Clé API révoquée ou désactivée.', code: 'KEY_DISABLED' }),
      { status: 403, headers: corsHeaders },
    );
  }

  // ── 2. Rate limiting ────────────────────────────────────────────────
  const allowed = checkRateLimit(integration.id, integration.rate_limit ?? 100);
  if (!allowed) {
    await logCall(supabase, integration.id, path, req.method, 429, Date.now() - start, req, null, 'Limite de débit dépassée');
    return new Response(
      JSON.stringify({ error: 'Trop de requêtes. Réessayez dans une minute.', code: 'RATE_LIMIT' }),
      { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } },
    );
  }

  // ── 3. Mise à jour last_used_at ─────────────────────────────────────
  await supabase
    .from('api_integrations')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', integration.id);

  const permissions: string[] = Array.isArray(integration.permissions) ? integration.permissions : [];

  // ── 4. Routage des endpoints ─────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try {
    if (req.method !== 'GET') {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    }
  } catch (_) { /* corps non-JSON, ignorer */ }

  let responseData: unknown = null;
  let statusCode = 200;
  let errorMessage: string | null = null;

  try {
    if (path === '/status' || path === '/') {
      responseData = {
        status: 'ok',
        integration: integration.name,
        permissions,
        timestamp: new Date().toISOString(),
      };
    } else if (path === '/stats' && permissions.includes('stats:read')) {
      const { data } = await supabase
        .from('verification_requests')
        .select('status', { count: 'exact' });
      responseData = { total: data?.length ?? 0, timestamp: new Date().toISOString() };
    } else if (path === '/requests' && permissions.includes('requests:read')) {
      const limit = parseInt(url.searchParams.get('limit') ?? '50');
      const { data } = await supabase
        .from('verification_requests')
        .select('id,status,created_at,locality')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 200));
      responseData = data ?? [];
    } else if (path === '/users/count' && permissions.includes('users:read')) {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      responseData = { active_users: count ?? 0 };
    } else if (path === '/webhook' && permissions.includes('webhook:receive') && req.method === 'POST') {
      // Endpoint de réception de webhook externe
      responseData = { received: true, timestamp: new Date().toISOString() };
    } else if (!permissions.some(p => path.startsWith('/' + p.split(':')[0]))) {
      statusCode = 403;
      errorMessage = 'Permission refusée pour cet endpoint.';
      responseData = { error: errorMessage, code: 'FORBIDDEN' };
    } else {
      statusCode = 404;
      errorMessage = 'Endpoint introuvable.';
      responseData = { error: errorMessage, code: 'NOT_FOUND' };
    }
  } catch (err: unknown) {
    statusCode    = 500;
    errorMessage  = err instanceof Error ? err.message : 'Erreur interne.';
    responseData  = { error: errorMessage, code: 'INTERNAL_ERROR' };
  }

  // ── 5. Journalisation ───────────────────────────────────────────────
  const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'unknown';
  await logCall(
    supabase, integration.id, path, req.method, statusCode,
    Date.now() - start, req, responseData as Record<string, unknown>, errorMessage, ipAddress,
  );

  return new Response(JSON.stringify(responseData), {
    status: statusCode,
    headers: {
      ...corsHeaders,
      'X-RateLimit-Limit':     String(integration.rate_limit),
      'X-Integration-Name':    integration.name,
    },
  });
});

async function logCall(
  supabase: ReturnType<typeof createClient>,
  integrationId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  _req: Request,
  responseBody: unknown,
  errorMessage: string | null,
  ipAddress = 'unknown',
) {
  await supabase.from('api_integration_logs').insert({
    integration_id:   integrationId,
    endpoint,
    method,
    status_code:      statusCode,
    response_time_ms: responseTimeMs,
    ip_address:       ipAddress,
    response_body:    responseBody as Record<string, unknown>,
    error_message:    errorMessage,
  });
}
