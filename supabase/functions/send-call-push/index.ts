// send-call-push/index.ts
// Edge Function : envoie une notification push FCM haute priorité
// pour un appel vidéo entrant (style WhatsApp)
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    // ── Auth : vérifier le JWT de l'appelant ────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const supabase   = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
    }

    // ── Payload de la requête ───────────────────────────────────────────────
    const body = await req.json() as {
      callId:      string;
      receiverId:  string;
      callerName:  string;
      callerPhoto?: string | null;
      requestId?:  string;
    };

    const { callId, receiverId, callerName, callerPhoto, requestId } = body;
    if (!callId || !receiverId || !callerName) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400, headers: CORS });
    }

    // ── Vérifier que l'appelant est bien le caller de l'appel ───────────────
    const { data: callState } = await supabase
      .from('video_call_states')
      .select('caller_id, state')
      .eq('call_id', callId)
      .maybeSingle();

    if (!callState) {
      return Response.json({ error: 'État d\'appel introuvable' }, { status: 404, headers: CORS });
    }
    if (callState.caller_id !== user.id) {
      return Response.json({ error: 'Interdit' }, { status: 403, headers: CORS });
    }
    if (callState.state !== 'RINGING') {
      return Response.json({ error: 'Appel non en cours' }, { status: 409, headers: CORS });
    }

    // ── Récupérer le token FCM du destinataire ──────────────────────────────
    const { data: receiver } = await supabase
      .from('profiles')
      .select('fcm_token, username')
      .eq('id', receiverId)
      .maybeSingle();

    if (!receiver?.fcm_token) {
      // Pas de token FCM — le destinataire devra recevoir via Realtime uniquement
      return Response.json({ sent: false, reason: 'no_fcm_token' }, { headers: CORS });
    }

    // ── Construire la notification FCM (API v1) ─────────────────────────────
    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY');
    if (!fcmServerKey) {
      return Response.json({ error: 'FCM_SERVER_KEY non configurée' }, { status: 500, headers: CORS });
    }

    // Données de l'appel envoyées comme data payload (pas notification)
    // → permet au service worker / Capacitor Background de traiter l'appel
    // même quand l'app est fermée
    const fcmPayload = {
      to: receiver.fcm_token,
      priority: 'high',
      // notification : affiché par le système si l'app est fermée
      notification: {
        title: callerName,
        body: 'Appel vidéo entrant',
        android_channel_id: 'konolive_calls',
        sound: 'default',
        click_action: 'INCOMING_CALL',
      },
      // data : disponible dans tous les états (foreground/background/killed)
      data: {
        type: 'INCOMING_CALL',
        callId,
        callerId:    user.id,
        callerName,
        callerPhoto: callerPhoto ?? '',
        receiverId,
        requestId:   requestId ?? '',
        callType:    'video',
        timestamp:   new Date().toISOString(),
        expiresAt:   new Date(Date.now() + 60_000).toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId:           'konolive_calls',
          sound:               'default',
          defaultVibrateTimings: true,
          visibility:          'PUBLIC',
          // Notification d'appel prioritaire (Android 12+)
          notificationPriority: 'PRIORITY_MAX',
        },
        // Permet le réveil de l'écran (Foreground Service) via FCM data
        directBootOk: true,
      },
    };

    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `key=${fcmServerKey}`,
      },
      body: JSON.stringify(fcmPayload),
    });

    const fcmBody = await fcmRes.json() as { success?: number; failure?: number; results?: { error?: string }[] };

    if (!fcmRes.ok || fcmBody.success !== 1) {
      const fcmError = fcmBody.results?.[0]?.error ?? 'unknown';
      console.error('FCM error:', fcmError);
      // NotRegistered → invalider le token
      if (fcmError === 'NotRegistered' || fcmError === 'InvalidRegistration') {
        await supabase.from('profiles').update({ fcm_token: null }).eq('id', receiverId);
      }
      return Response.json(
        { sent: false, fcmError },
        { status: 200, headers: CORS }, // 200 : le call continue même si FCM échoue
      );
    }

    return Response.json({ sent: true }, { headers: CORS });

  } catch (err) {
    console.error('send-call-push error:', err);
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
