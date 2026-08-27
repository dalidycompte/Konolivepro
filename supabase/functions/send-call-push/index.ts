// send-call-push/index.ts
// Delivers incoming-call invitations and terminal/acceptance state changes to every
// registered device of the coach. The database RPC remains the source of truth.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    const tokens = (devices ?? []).map((device) => device.token).filter(Boolean);
    if (tokens.length === 0) {
      return Response.json({ sent: false, reason: 'no_android_device' }, { headers: CORS });
    }

    const callerName = body.callerName ?? callState.caller_name ?? 'Konolive';
    const isInvite = action === 'INVITE';
    const data = isInvite
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

    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY');
    if (!fcmServerKey) {
      return Response.json({ error: 'FCM_SERVER_KEY non configurée' }, { status: 500, headers: CORS });
    }

    // Legacy FCM HTTP is used because the project stores FCM_SERVER_KEY.
    // Do not add a notification block: notification messages bypass
    // FirebaseMessagingService while the app is backgrounded. Android creates
    // the CallStyle/full-screen notification locally from this data payload.
    const fcmPayload = {
      registration_ids: tokens,
      priority: 'high',
      time_to_live: isInvite ? 60 : 120,
      collapse_key: isInvite ? `konolive_call_${body.callId}` : `konolive_state_${body.callId}`,
      data,
    };

    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${fcmServerKey}`,
      },
      body: JSON.stringify(fcmPayload),
    });
    const fcmBody = await fcmRes.json() as {
      success?: number;
      failure?: number;
      results?: { error?: string }[];
    };

    for (const [index, result] of (fcmBody.results ?? []).entries()) {
      if (result.error === 'NotRegistered' || result.error === 'InvalidRegistration') {
        await supabase.from('mobile_push_devices').delete().eq('token', tokens[index]);
      }
    }

    if (!fcmRes.ok) {
      return Response.json({ sent: false, fcmError: 'FCM_REQUEST_FAILED' }, { status: 200, headers: CORS });
    }
    return Response.json({ sent: true, deviceCount: tokens.length, action }, { headers: CORS });
  } catch (err) {
    console.error('send-call-push error:', err);
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
