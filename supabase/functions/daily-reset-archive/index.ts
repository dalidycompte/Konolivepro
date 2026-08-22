// Edge Function: daily-reset-archive
// Appelée par pg_cron chaque jour à 22h59 UTC (= 23h59 Africa/Brazzaville UTC+1)
// Archive les traitements du jour dans processing_details_archive puis ne supprime rien
// (les données restent accessibles dans l'historique agent et superviseur)

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    // Calcule la plage du jour courant UTC+1 (Africa/Brazzaville)
    const now = new Date();
    // Début du jour local = aujourd'hui 00:00 UTC+1 = hier 23:00 UTC
    const localMidnightUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) - 60 * 60 * 1000
    );
    const nextMidnightUTC = new Date(localMidnightUTC.getTime() + 24 * 60 * 60 * 1000);

    // Récupère tous les processing_details créés aujourd'hui (join sur verification_requests pour avoir agent_id)
    const { data: rows, error: fetchErr } = await supabase
      .from('processing_details')
      .select(`
        *,
        request:verification_requests!inner(agent_id, applicant_id, phone_to_certify, created_at)
      `)
      .gte('created_at', localMidnightUTC.toISOString())
      .lt('created_at', nextMidnightUTC.toISOString());

    if (fetchErr) throw fetchErr;

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, archived: 0, message: 'Aucun traitement à archiver.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insère dans la table d'archive (upsert idempotent sur request_id + archive_date)
    const archiveDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const archiveRows = rows.map(({ request, ...detail }) => ({
      ...detail,
      agent_id:     request?.agent_id    ?? null,
      applicant_id: request?.applicant_id ?? null,
      archive_date: archiveDate,
    }));

    const { error: insertErr } = await supabase
      .from('processing_details_archive')
      .upsert(archiveRows, { onConflict: 'request_id,archive_date', ignoreDuplicates: true });

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ success: true, archived: archiveRows.length, archive_date: archiveDate }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('daily-reset-archive error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
