
-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ═══════════════════════════════════════════
-- PROFILES
-- ═══════════════════════════════════════════
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  email text,
  phone text,
  locality text,
  role text not null default 'applicant' check (role in ('applicant','agent','supervisor','admin')),
  is_active boolean not null default true,
  is_paused boolean not null default false,
  is_logged_in boolean not null default false,
  login_token text,
  manual_next_request boolean not null default false,
  avatar_url text,
  is_online boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;

create policy "profiles_select_authenticated" on profiles for select to authenticated using (true);
create policy "profiles_select_anon" on profiles for select to anon using (false);
create policy "profiles_insert_own" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on profiles for update to authenticated using (id = auth.uid());
create policy "profiles_update_admin" on profiles for update to authenticated using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

-- ═══════════════════════════════════════════
-- APP SETTINGS
-- ═══════════════════════════════════════════
create table app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
alter table app_settings enable row level security;
create policy "app_settings_select" on app_settings for select to authenticated using (true);
create policy "app_settings_update_admin" on app_settings for update to authenticated using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','supervisor'))
);
create policy "app_settings_insert_admin" on app_settings for insert to authenticated with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','supervisor'))
);

-- seed default settings
insert into app_settings (key, value) values
  ('apk_url', '""'),
  ('rejection_reasons', '["Document illisible","Document expiré","Photo non conforme","Identité non vérifiable","Informations incohérentes"]'),
  ('other_reasons', '["Numéro non reconnu","Demande en doublon","Dossier incomplet","Demande annulée par le client","Autre raison"]');

-- ═══════════════════════════════════════════
-- VERIFICATION REQUESTS
-- ═══════════════════════════════════════════
create table verification_requests (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references profiles(id) on delete cascade,
  agent_id uuid references profiles(id) on delete set null,
  phone_to_certify text not null,
  status text not null default 'pending' check (status in ('pending','processing','accepted','rejected','unchanged','other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_duration_seconds integer,
  processing_started_at timestamptz
);
alter table verification_requests enable row level security;

create trigger trg_vr_updated_at before update on verification_requests
  for each row execute function update_updated_at();

create policy "vr_select_applicant" on verification_requests for select to authenticated
  using (applicant_id = auth.uid() or exists (
    select 1 from profiles p where p.id = auth.uid() and p.role in ('agent','supervisor','admin')
  ));
create policy "vr_insert_applicant" on verification_requests for insert to authenticated
  with check (applicant_id = auth.uid());
create policy "vr_update_agent" on verification_requests for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('agent','supervisor','admin')));

-- ═══════════════════════════════════════════
-- REQUEST DOCUMENTS
-- ═══════════════════════════════════════════
create table request_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references verification_requests(id) on delete cascade,
  doc_front_url text,
  doc_back_url text,
  live_photo_url text,
  created_at timestamptz not null default now()
);
alter table request_documents enable row level security;
create policy "rd_select" on request_documents for select to authenticated using (
  exists (
    select 1 from verification_requests vr
    where vr.id = request_documents.request_id
    and (vr.applicant_id = auth.uid() or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('agent','supervisor','admin')
    ))
  )
);
create policy "rd_insert" on request_documents for insert to authenticated with check (
  exists (
    select 1 from verification_requests vr
    where vr.id = request_documents.request_id and vr.applicant_id = auth.uid()
  )
);
create policy "rd_update" on request_documents for update to authenticated using (
  exists (
    select 1 from verification_requests vr
    where vr.id = request_documents.request_id and vr.applicant_id = auth.uid()
  )
);

-- ═══════════════════════════════════════════
-- MESSAGES
-- ═══════════════════════════════════════════
create table messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table messages enable row level security;
create policy "messages_select" on messages for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin')));
create policy "messages_insert" on messages for insert to authenticated
  with check (sender_id = auth.uid());
create policy "messages_update_read" on messages for update to authenticated
  using (receiver_id = auth.uid());

-- ═══════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  request_id uuid references verification_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table notifications enable row level security;
create policy "notif_select" on notifications for select to authenticated using (user_id = auth.uid());
create policy "notif_insert" on notifications for insert to authenticated with check (true);
create policy "notif_update" on notifications for update to authenticated using (user_id = auth.uid());

-- ═══════════════════════════════════════════
-- VIDEO CALLS
-- ═══════════════════════════════════════════
create table video_calls (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  agent_id uuid not null references profiles(id) on delete cascade,
  applicant_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'initiated' check (status in ('initiated','ringing','active','ended','rejected','missed')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
alter table video_calls enable row level security;
create policy "vc_select" on video_calls for select to authenticated
  using (agent_id = auth.uid() or applicant_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin')));
create policy "vc_insert" on video_calls for insert to authenticated with check (agent_id = auth.uid());
create policy "vc_update" on video_calls for update to authenticated
  using (agent_id = auth.uid() or applicant_id = auth.uid());

-- ─── video_call_states (for WebRTC signalling) ────────────────────────────
create table video_call_states (
  call_id uuid primary key,
  caller_id uuid references profiles(id),
  receiver_id uuid references profiles(id),
  state text not null default 'RINGING',
  caller_name text,
  caller_photo text,
  request_id uuid references verification_requests(id),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table video_call_states enable row level security;
create policy "vcs_select" on video_call_states for select to authenticated using (
  caller_id = auth.uid() or receiver_id = auth.uid() or
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin'))
);
create policy "vcs_insert" on video_call_states for insert to authenticated with check (caller_id = auth.uid());
create policy "vcs_update" on video_call_states for update to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

-- ═══════════════════════════════════════════
-- INTERNAL MESSAGES
-- ═══════════════════════════════════════════
create table internal_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  content text,
  image_url text,
  audio_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table internal_messages enable row level security;
create policy "im_select" on internal_messages for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "im_insert" on internal_messages for insert to authenticated
  with check (sender_id = auth.uid());
create policy "im_update" on internal_messages for update to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "im_delete" on internal_messages for delete to authenticated
  using (sender_id = auth.uid());

-- ═══════════════════════════════════════════
-- INTERNAL CALLS
-- ═══════════════════════════════════════════
create table internal_calls (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references profiles(id) on delete cascade,
  participants uuid[] not null default '{}',
  status text not null default 'initiated' check (status in ('initiated','active','ended')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
alter table internal_calls enable row level security;
create policy "ic_select" on internal_calls for select to authenticated
  using (initiator_id = auth.uid() or auth.uid() = any(participants));
create policy "ic_insert" on internal_calls for insert to authenticated
  with check (initiator_id = auth.uid());
create policy "ic_update" on internal_calls for update to authenticated
  using (initiator_id = auth.uid() or auth.uid() = any(participants));

-- ═══════════════════════════════════════════
-- ACTIVITY LOGS
-- ═══════════════════════════════════════════
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
alter table activity_logs enable row level security;
create policy "al_select_admin" on activity_logs for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','supervisor')));
create policy "al_insert" on activity_logs for insert to authenticated with check (true);

-- ═══════════════════════════════════════════
-- PAUSE SESSIONS
-- ═══════════════════════════════════════════
create table pause_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer
);
alter table pause_sessions enable row level security;
create policy "ps_select" on pause_sessions for select to authenticated
  using (agent_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin')));
create policy "ps_insert" on pause_sessions for insert to authenticated with check (agent_id = auth.uid());
create policy "ps_update" on pause_sessions for update to authenticated using (agent_id = auth.uid());

-- ═══════════════════════════════════════════
-- PROCESSING OPTIONS
-- ═══════════════════════════════════════════
create table processing_options (
  id uuid primary key default gen_random_uuid(),
  column_name text not null,
  option_value text not null,
  created_at timestamptz not null default now(),
  unique (column_name, option_value)
);
alter table processing_options enable row level security;
create policy "po_select" on processing_options for select to authenticated using (true);
create policy "po_insert_supervisor" on processing_options for insert to authenticated with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin'))
);
create policy "po_delete_supervisor" on processing_options for delete to authenticated using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin'))
);

-- seed default processing options
insert into processing_options (column_name, option_value) values
  ('constat_webcare', 'Identité vérifiée'),
  ('constat_webcare', 'Identité non vérifiable'),
  ('constat_webcare', 'Document insuffisant'),
  ('type_de_piece', 'CNI'),
  ('type_de_piece', 'Passeport'),
  ('type_de_piece', 'Permis'),
  ('verbatim', 'Conforme'),
  ('verbatim', 'Non conforme'),
  ('action_prise_gsm', 'Activation SIM'),
  ('action_prise_gsm', 'Réactivation'),
  ('action_prise_gsm', 'Changement SIM'),
  ('statut_final_gsm', 'Actif'),
  ('statut_final_gsm', 'Suspendu'),
  ('statut_final_gsm', 'Résilié'),
  ('traitement', 'Traité'),
  ('traitement', 'En attente'),
  ('traitement', 'Renvoyé'),
  ('type_d_identification', 'Biométrique'),
  ('type_d_identification', 'Visuelle'),
  ('raison_du_retard', 'Connexion lente'),
  ('raison_du_retard', 'Document flou'),
  ('raison_du_retard', 'Applicant injoignable');

-- ═══════════════════════════════════════════
-- PROCESSING DETAILS
-- ═══════════════════════════════════════════
create table processing_details (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references verification_requests(id) on delete cascade,
  constat_webcare text,
  type_de_piece text,
  verbatim text,
  action_prise_gsm text,
  statut_final_gsm text,
  traitement text,
  type_d_identification text,
  raison_du_retard text,
  screenshot_urls text[],
  row_color text,
  created_at timestamptz not null default now()
);
alter table processing_details enable row level security;
create policy "pd_select" on processing_details for select to authenticated using (
  exists (
    select 1 from verification_requests vr
    where vr.id = processing_details.request_id
    and (vr.agent_id = auth.uid() or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin')
    ))
  )
);
create policy "pd_insert" on processing_details for insert to authenticated with check (
  exists (
    select 1 from verification_requests vr
    where vr.id = processing_details.request_id and vr.agent_id = auth.uid()
  )
);
create policy "pd_update" on processing_details for update to authenticated using (
  exists (
    select 1 from verification_requests vr
    where vr.id = processing_details.request_id and vr.agent_id = auth.uid()
  )
);

-- ═══════════════════════════════════════════
-- PROCESSING DETAILS ARCHIVE
-- ═══════════════════════════════════════════
create table processing_details_archive (
  id uuid not null,
  request_id uuid,
  agent_id uuid,
  applicant_id uuid,
  constat_webcare text,
  type_de_piece text,
  verbatim text,
  action_prise_gsm text,
  statut_final_gsm text,
  traitement text,
  type_d_identification text,
  raison_du_retard text,
  screenshot_urls text[],
  row_color text,
  archive_date date not null,
  created_at timestamptz,
  primary key (id, archive_date),
  unique (request_id, archive_date)
);
alter table processing_details_archive enable row level security;
create policy "pda_select" on processing_details_archive for select to authenticated using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('agent','supervisor','admin'))
);
create policy "pda_insert" on processing_details_archive for insert to authenticated with check (true);

-- ═══════════════════════════════════════════
-- AGENT DAILY ARCHIVE
-- ═══════════════════════════════════════════
create table agent_daily_archive (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  total integer not null default 0,
  accepted integer not null default 0,
  rejected integer not null default 0,
  unchanged integer not null default 0,
  other integer not null default 0,
  unique (agent_id, date)
);
alter table agent_daily_archive enable row level security;
create policy "ada_select" on agent_daily_archive for select to authenticated using (
  agent_id = auth.uid() or
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('supervisor','admin'))
);
create policy "ada_insert" on agent_daily_archive for insert to authenticated with check (true);

-- ═══════════════════════════════════════════
-- DRAFTS
-- ═══════════════════════════════════════════
create table drafts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references profiles(id) on delete cascade,
  request_id uuid not null references verification_requests(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, request_id)
);
alter table drafts enable row level security;
create trigger trg_drafts_updated_at before update on drafts
  for each row execute function update_updated_at();
create policy "drafts_select" on drafts for select to authenticated using (agent_id = auth.uid());
create policy "drafts_insert" on drafts for insert to authenticated with check (agent_id = auth.uid());
create policy "drafts_update" on drafts for update to authenticated using (agent_id = auth.uid());
create policy "drafts_delete" on drafts for delete to authenticated using (agent_id = auth.uid());

-- ═══════════════════════════════════════════
-- RPC FUNCTIONS
-- ═══════════════════════════════════════════

-- Helper: get role without touching profiles table RLS
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

-- Atomic claim request
create or replace function claim_request(p_request_id uuid, p_agent_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_row verification_requests;
  v_active_count integer;
begin
  -- Lock the row
  select * into v_row from verification_requests where id = p_request_id for update;
  if not found then
    raise exception 'REQUEST_UNAVAILABLE: Demande introuvable.';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'REQUEST_UNAVAILABLE: Cette demande n''est plus disponible (statut: %).', v_row.status;
  end if;
  -- Check agent load
  select count(*) into v_active_count from verification_requests
    where agent_id = p_agent_id and status = 'processing';
  if v_active_count >= 2 then
    raise exception 'AGENT_BUSY: Vous traitez déjà 2 demandes simultanément.';
  end if;
  -- Assign
  update verification_requests
    set status = 'processing', agent_id = p_agent_id,
        processing_started_at = now(), updated_at = now()
    where id = p_request_id;
  return p_request_id;
end; $$;

-- Atomic transfer request
create or replace function transfer_request(p_request_id uuid, p_new_agent_id uuid)
returns boolean language plpgsql security definer as $$
declare v_row verification_requests;
begin
  select * into v_row from verification_requests where id = p_request_id for update;
  if not found then return false; end if;
  update verification_requests
    set agent_id = p_new_agent_id, updated_at = now()
    where id = p_request_id;
  return true;
end; $$;

-- Get overtime requests (> 7 minutes)
create or replace function get_overtime_requests()
returns table(
  id uuid, applicant_id uuid, agent_id uuid, processing_started_at timestamptz,
  elapsed_minutes numeric, applicant_username text, applicant_phone text, agent_username text
) language sql security definer stable as $$
  select
    vr.id, vr.applicant_id, vr.agent_id, vr.processing_started_at,
    round(extract(epoch from (now() - vr.processing_started_at)) / 60, 1) as elapsed_minutes,
    ap.username as applicant_username, ap.phone as applicant_phone,
    ag.username as agent_username
  from verification_requests vr
  left join profiles ap on ap.id = vr.applicant_id
  left join profiles ag on ag.id = vr.agent_id
  where vr.status = 'processing'
    and vr.processing_started_at is not null
    and now() - vr.processing_started_at > interval '7 minutes'
  order by vr.processing_started_at asc;
$$;

-- Check phone in progress
create or replace function check_phone_in_progress(p_phone text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from verification_requests
    where phone_to_certify = p_phone and status in ('pending','processing')
  );
$$;

-- Get extra stats (coaches, localities)
create or replace function get_internal_extra_stats()
returns json language sql security definer stable as $$
  select json_build_object(
    'total_coaches', (select count(*) from profiles where role = 'applicant' and is_active = true),
    'total_localities', (select count(distinct locality) from profiles where role = 'applicant' and locality is not null),
    'localities', (select coalesce(json_agg(distinct locality order by locality), '[]'::json) from profiles where role = 'applicant' and locality is not null)
  );
$$;

-- Get daily performances (last 7 days)
create or replace function get_daily_performances(p_agent_id uuid default null)
returns table(day_name text, day_index int, value bigint) language sql security definer stable as $$
  select
    to_char(gs.d, 'Dy') as day_name,
    extract(dow from gs.d)::int as day_index,
    coalesce(count(vr.id), 0) as value
  from generate_series(current_date - interval '6 days', current_date, interval '1 day') gs(d)
  left join verification_requests vr
    on date_trunc('day', vr.processed_at at time zone 'Africa/Brazzaville') = gs.d
    and vr.status in ('accepted','rejected','unchanged','other')
    and (p_agent_id is null or vr.agent_id = p_agent_id)
  group by gs.d
  order by gs.d;
$$;

-- Get agent stats
create or replace function get_agent_stats()
returns table(
  agent_id uuid, username text, total_processed bigint, accepted bigint,
  rejected bigint, unchanged bigint, other bigint,
  today_processed bigint, avg_processing_seconds numeric
) language sql security definer stable as $$
  select
    p.id as agent_id, p.username,
    count(vr.id) filter (where vr.status in ('accepted','rejected','unchanged','other')) as total_processed,
    count(vr.id) filter (where vr.status = 'accepted') as accepted,
    count(vr.id) filter (where vr.status = 'rejected') as rejected,
    count(vr.id) filter (where vr.status = 'unchanged') as unchanged,
    count(vr.id) filter (where vr.status = 'other') as other,
    count(vr.id) filter (
      where vr.status in ('accepted','rejected','unchanged','other')
      and date_trunc('day', vr.processed_at at time zone 'Africa/Brazzaville') = current_date
    ) as today_processed,
    avg(vr.processing_duration_seconds) filter (where vr.processing_duration_seconds > 0) as avg_processing_seconds
  from profiles p
  left join verification_requests vr on vr.agent_id = p.id
  where p.role = 'agent' and p.is_active = true
  group by p.id, p.username
  order by total_processed desc;
$$;
