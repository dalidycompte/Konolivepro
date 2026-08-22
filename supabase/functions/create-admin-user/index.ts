import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Delete existing broken user if present
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const oldUser = existing?.users?.find((u: { email?: string }) => u.email === 'immocongo@idriss.com');
    if (oldUser) {
      await supabaseAdmin.from('profiles').delete().eq('id', oldUser.id);
      await supabaseAdmin.auth.admin.deleteUser(oldUser.id);
    }

    // 2. Create user properly via admin API (GoTrue sets up all internals correctly)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: 'immocongo@idriss.com',
      password: 'Idmozice@1996',
      email_confirm: true,
      user_metadata: { username: 'immocongo', role: 'admin' },
    });

    if (error) throw error;

    // 3. Upsert profile
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: data.user.id,
      username: 'immocongo',
      email: 'immocongo@idriss.com',
      role: 'admin',
      is_active: true,
    }, { onConflict: 'id' });

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ success: true, userId: data.user.id, email: data.user.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
