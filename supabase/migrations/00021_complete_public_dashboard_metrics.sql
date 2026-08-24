-- Données agrégées du tableau public : aucune donnée personnelle n’est renvoyée.
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
    'todayReceived', count(*) filter (
      where (created_at at time zone 'Africa/Brazzaville')::date = (now() at time zone 'Africa/Brazzaville')::date
    ),
    'accepted', count(*) filter (where status = 'accepted'),
    'rejected', count(*) filter (where status = 'rejected'),
    'unchanged', count(*) filter (where status = 'unchanged'),
    'other', count(*) filter (where status = 'other'),
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
        'other', count(vr.id) filter (where vr.status = 'other')
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
    left join public.verification_requests vr on vr.applicant_id = p.id
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

revoke all on function public.get_public_dashboard_data(text) from public;
grant execute on function public.get_public_dashboard_data(text) to anon, authenticated;
