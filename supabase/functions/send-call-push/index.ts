// send-call-push/index.ts
// Sends incoming-call and terminal call-state data messages through FCM HTTP v1.
// The service-account JSON is read only from the Supabase secret
// FCM_SERVICE_ACCOUNT_JSON and must never be committed to the repository or APK.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const encoder = new TextEncoder();

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

type Action = 'INVITE' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'ENDED';

type RequestBody = {
  callId: string;
  receiverId: string;
  callerName?: string;
  callerPhoto?: string | null;
  requestId?: string;
  action?: Action;
  expiresAt?: string;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getFcmAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) return cachedAccessToken.value;

  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: serviceAccount.token_uri ?? GOOGLE_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  })));
  const unsignedJwt = `${header}.${claims}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    encoder.encode(unsignedJwt),
  );
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch(serviceAccount.token_uri ?? GOOGLE_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error(`Google OAuth token error: ${tokenBody.error ?? tokenResponse.status}`);
  }
  cachedAccessToken = {
    value: tokenBody.access_token,
    expiresAt: now + Math.min(tokenBody.expires_in ?? 3600, 3600),
  };
  return tokenBody.access_token;
}

async function sendToFcm(
  token: string,
  data: Record<string, string>,
  projectId: string,
  accessToken: string,
  collapseKey: string,
  ttlSeconds: number,
): Promise<{ ok: boolean; unregistered: boolean }> {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token,
        data,
        android: {
          priority: 'HIGH',
          ttl: `${ttlSeconds}s`,
          collapse_key: collapseKey,
          direct_boot_ok: true,
        },
      },
    }),
  });
  const body = await response.json().catch(() => ({})) as {
    error?: { status?: string; details?: Array<{ errorCode?: string }> };
  };
  const fcmErrorCode = body.error?.details?.find((detail) => detail.errorCode)?.errorCode;
  return {
    ok: response.ok,
    unregistered: fcmErrorCode === 'UNREGISTERED',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    );
    if (authErr || !user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
    }

    const body = await req.json() as RequestBody;
    const action: Action = body.action ?? 'INVITE';
    if (!body.callId || !body.receiverId) {
      return Response.json({ error: 'callId et receiverId sont requis' }, { status: 400, headers: CORS });
    }
    if (action === 'INVITE' && !body.callerName) {
      return Response.json({ error: 'callerName est requis pour une invitation' }, { status: 400, headers: CORS });
    }

    const { data: callState } = await supabase
      .from('video_call_states')
      .select('call_id, caller_id, receiver_id, request_id, state, caller_name, caller_photo, expires_at')
      .eq('call_id', body.callId)
      .maybeSingle();

    if (!callState) {
      return Response.json({ error: 'État d’appel introuvable' }, { status: 404, headers: CORS });
    }
    if (callState.receiver_id !== body.receiverId) {
      return Response.json({ error: 'Destinataire incohérent' }, { status: 400, headers: CORS });
    }
    if (action === 'INVITE') {
      if (callState.caller_id !== user.id) {
        return Response.json({ error: 'Interdit' }, { status: 403, headers: CORS });
      }
      if (callState.state !== 'RINGING') {
        return Response.json({ error: 'Appel non en cours' }, { status: 409, headers: CORS });
      }
    } else if (callState.caller_id !== user.id && callState.receiver_id !== user.id) {
      return Response.json({ error: 'Interdit' }, { status: 403, headers: CORS });
    }

    const { data: devices, error: devicesError } = await supabase
      .from('mobile_push_devices')
      .select('device_id, token')
      .eq('user_id', body.receiverId)
      .eq('platform', 'android');
    if (devicesError) throw devicesError;

    const tokens = (devices ?? []).map((device) => device.token).filter(Boolean) as string[];
    if (tokens.length === 0) {
      return Response.json({ sent: false, reason: 'no_android_device' }, { headers: CORS });
    }

    const callerName = body.callerName ?? callState.caller_name ?? 'Konolive';
    const isInvite = action === 'INVITE';
    const data: Record<string, string> = isInvite
      ? {
          type: 'INCOMING_CALL',
          callId: body.callId,
          callerId: callState.caller_id,
          callerName,
          callerPhoto: body.callerPhoto ?? callState.caller_photo ?? '',
          receiverId: body.receiverId,
          requestId: body.requestId ?? callState.request_id ?? '',
          callType: 'video',
          timestamp: new Date().toISOString(),
          expiresAt: body.expiresAt ?? callState.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
        }
      : {
          type: 'CALL_STATE',
          callId: body.callId,
          receiverId: body.receiverId,
          state: action,
          timestamp: new Date().toISOString(),
        };

    const rawServiceAccount = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    if (!rawServiceAccount) {
      return Response.json({ error: 'FCM_SERVICE_ACCOUNT_JSON non configuré' }, { status: 500, headers: CORS });
    }
    let serviceAccount: ServiceAccount;
    try {
      serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
    } catch {
      return Response.json({ error: 'FCM_SERVICE_ACCOUNT_JSON invalide' }, { status: 500, headers: CORS });
    }
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      return Response.json({ error: 'FCM_SERVICE_ACCOUNT_JSON incomplet' }, { status: 500, headers: CORS });
    }

    const accessToken = await getFcmAccessToken(serviceAccount);
    const results = await Promise.all(tokens.map((token) => sendToFcm(
      token,
      data,
      serviceAccount.project_id,
      accessToken,
      isInvite ? `konolive_call_${body.callId}` : `konolive_state_${body.callId}`,
      isInvite ? 60 : 120,
    )));
    const sentCount = results.filter((result) => result.ok).length;
    const staleTokens = tokens.filter((_, index) => results[index].unregistered);
    if (staleTokens.length > 0) {
      await supabase.from('mobile_push_devices').delete().in('token', staleTokens);
    }

    return Response.json({
      sent: sentCount > 0,
      deviceCount: tokens.length,
      sentCount,
      failedCount: tokens.length - sentCount,
      action,
    }, { headers: CORS });
  } catch (err) {
    console.error('send-call-push error:', err);
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
