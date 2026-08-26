-- Keep a corrected request closed while excluding it from all agent metrics.
-- The flag is set only through the function below when the agent deletes its
-- own Mes GSM row, and is consumed by the performance/statistics queries.
begin;

alter table public.verification_requests
  add column if not exists exclude_from_agent_metrics boolean not null default false;

create index if not exists verification_requests_agent_metric_idx
  on public.verification_requests (agent_id, processed_at)
  where exclude_from_agent_metrics = false;

create or replace function public.exclude_request_from_agent_metrics(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  update public.verification_requests
  set exclude_from_agent_metrics = true
  where id = p_request_id
    and agent_id = auth.uid();

  if not found then
    raise exception 'Demande introuvable ou non attribuée à l''agent connecté';
  end if;
end;
$$;

revoke all on function public.exclude_request_from_agent_metrics(uuid) from public, anon;
grant execute on function public.exclude_request_from_agent_metrics(uuid) to authenticated;

create or replace function public.get_daily_performances(p_agent_id uuid default null)
returns table(day_name text, day_index integer, value bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    to_char(gs.d, 'Dy') as day_name,
    extract(dow from gs.d)::int as day_index,
    coalesce(count(vr.id), 0) as value
  from generate_series(current_date - interval '6 days', current_date, interval '1 day') gs(d)
  left join public.verification_requests vr
    on date_trunc('day', vr.processed_at at time zone 'Africa/Brazzaville') = gs.d
    and vr.status in ('accepted', 'rejected')
    and coalesce(vr.exclude_from_agent_metrics, false) = false
    and (p_agent_id is null or vr.agent_id = p_agent_id)
  group by gs.d
  order by gs.d;
$function$;

create or replace function public.get_agent_stats()
returns table(
  agent_id uuid, username text, total_processed bigint, accepted bigint,
  rejected bigint, unchanged bigint, other bigint,
  today_processed bigint, avg_processing_seconds numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    p.id as agent_id,
    p.username,
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
  from public.profiles p
  left join public.verification_requests vr
    on vr.agent_id = p.id
   and coalesce(vr.exclude_from_agent_metrics, false) = false
  where p.role = 'agent' and p.is_active = true
  group by p.id, p.username
  order by total_processed desc;
$function$;

revoke all on function public.get_daily_performances(uuid) from public, anon;
grant execute on function public.get_daily_performances(uuid) to authenticated;
revoke all on function public.get_agent_stats() from public, anon;
grant execute on function public.get_agent_stats() to authenticated;

commit;
