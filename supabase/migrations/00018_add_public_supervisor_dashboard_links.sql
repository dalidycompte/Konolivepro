-- Liens temporaires de consultation du tableau de bord superviseur.
create table if not exists public.public_dashboard_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists public_dashboard_links_active_token_idx
  on public.public_dashboard_links (token, expires_at)
  where revoked_at is null;

alter table public.public_dashboard_links enable row level security;

create or replace function public.create_public_dashboard_link()
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id and role in ('admin', 'supervisor')
  ) then
    raise exception 'PUBLIC_DASHBOARD_LINK_FORBIDDEN';
  end if;

  update public.public_dashboard_links
  set revoked_at = now()
  where created_by = v_user_id
    and revoked_at is null
    and expires_at > now();

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.public_dashboard_links (token, created_by, expires_at)
  values (v_token, v_user_id, v_expires_at);

  return query select v_token, v_expires_at;
end;
$$;

create or replace function public.get_public_dashboard_data(link_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link_exists boolean;
  v_kpi jsonb;
  v_hourly jsonb;
  v_chart jsonb;
  v_coach jsonb;
  v_locality jsonb;
begin
  select exists (
    select 1
    from public.public_dashboard_links
    where token = link_id
      and revoked_at is null
      and expires_at > now()
  ) into v_link_exists;

  if not v_link_exists then
    raise exception 'PUBLIC_DASHBOARD_LINK_INVALID';
  end if;

  select jsonb_build_object(
    'totalReceived', count(*),
    'todayReceived', count(*) filter (where (created_at at time zone 'Africa/Brazzaville')::date = (now() at time zone 'Africa/Brazzaville')::date),
    'accepted', count(*) filter (where status = 'accepted'),
    'rejected', count(*) filter (where status = 'rejected'),
    'unchanged', count(*) filter (where status = 'unchanged'),
    'pending', count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing')
  ) into v_kpi
  from public.verification_requests;

  select coalesce(jsonb_agg(row_data order by hour_value), '[]'::jsonb) into v_hourly
  from (
    select hour_value,
      jsonb_build_object(
        'hour', lpad(hour_value::text, 2, '0') || ':00',
        'received', count(vr.id),
        'accepted', count(vr.id) filter (where vr.status = 'accepted'),
        'rejected', count(vr.id) filter (where vr.status = 'rejected'),
        'pending', count(vr.id) filter (where vr.status = 'pending'),
        'other', count(vr.id) filter (where vr.status in ('unchanged', 'other'))
      ) as row_data
    from generate_series(0, 23) as hour_value
    left join public.verification_requests vr
      on extract(hour from vr.created_at at time zone 'Africa/Brazzaville') = hour_value
      and (vr.created_at at time zone 'Africa/Brazzaville')::date = (now() at time zone 'Africa/Brazzaville')::date
    group by hour_value
  ) hourly_rows;

  select coalesce(jsonb_agg(row_data order by day_value), '[]'::jsonb) into v_chart
  from (
    select day_value,
      jsonb_build_object(
        'time', to_char(day_value, 'DD/MM'),
        'total', count(vr.id),
        'pending', count(vr.id) filter (where vr.status = 'pending'),
        'processing', count(vr.id) filter (where vr.status = 'processing'),
        'accepted', count(vr.id) filter (where vr.status = 'accepted'),
        'rejected', count(vr.id) filter (where vr.status = 'rejected'),
        'unchanged', count(vr.id) filter (where vr.status = 'unchanged'),
        'avgTime', 0
      ) as row_data
    from generate_series(
      (now() at time zone 'Africa/Brazzaville')::date - 6,
      (now() at time zone 'Africa/Brazzaville')::date,
      interval '1 day'
    ) as day_value
    left join public.verification_requests vr
      on (vr.created_at at time zone 'Africa/Brazzaville')::date = day_value::date
    group by day_value
  ) chart_rows;

  select jsonb_build_object(
    'total', count(*),
    'online', count(*) filter (where is_online is true),
    'offline', count(*) filter (where coalesce(is_online, false) is false)
  ) into v_coach
  from public.profiles
  where role = 'applicant';

  select coalesce(jsonb_agg(row_data order by locality), '[]'::jsonb) into v_locality
  from (
    select coalesce(p.locality, 'Non renseignée') as locality,
      jsonb_build_object(
        'locality', coalesce(p.locality, 'Non renseignée'),
        'received', count(vr.id),
        'accepted', count(vr.id) filter (where vr.status = 'accepted'),
        'rejected', count(vr.id) filter (where vr.status = 'rejected'),
        'unchanged', count(vr.id) filter (where vr.status = 'unchanged'),
        'autres', count(vr.id) filter (where vr.status = 'other')
      ) as row_data
    from public.profiles p
    left join public.verification_requests vr
      on vr.applicant_id = p.id
      and (vr.created_at at time zone 'Africa/Brazzaville')::date = (now() at time zone 'Africa/Brazzaville')::date
    where p.role = 'applicant'
    group by coalesce(p.locality, 'Non renseignée')
  ) locality_rows;

  return jsonb_build_object(
    'kpi', v_kpi,
    'chart', v_chart,
    'hourly', v_hourly,
    'coach', v_coach,
    'locality', v_locality
  );
end;
$$;

revoke all on table public.public_dashboard_links from anon, authenticated;
revoke all on function public.create_public_dashboard_link() from public;
revoke all on function public.get_public_dashboard_data(text) from public;
grant execute on function public.create_public_dashboard_link() to authenticated;
grant execute on function public.get_public_dashboard_data(text) to anon, authenticated;
