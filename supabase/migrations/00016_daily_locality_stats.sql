-- Daily request statistics grouped by the applicant locality.
-- The date is interpreted in the application's Congo timezone.
create or replace function public.get_internal_locality_daily_stats(p_date date default current_date)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'locality', s.locality,
        'received', s.received,
        'accepted', s.accepted,
        'rejected', s.rejected,
        'unchanged', s.unchanged,
        'autres', s.autres
      )
      order by s.locality
    ),
    '[]'::json
  )
  from (
    select
      coalesce(p.locality, 'Non renseignée') as locality,
      count(vr.id) as received,
      count(vr.id) filter (where vr.status = 'accepted') as accepted,
      count(vr.id) filter (where vr.status = 'rejected') as rejected,
      count(vr.id) filter (where vr.status = 'unchanged') as unchanged,
      count(vr.id) filter (where vr.status = 'other') as autres
    from public.verification_requests vr
    join public.profiles p on p.id = vr.applicant_id
    where (vr.created_at at time zone 'Africa/Brazzaville')::date = coalesce(p_date, current_date)
    group by coalesce(p.locality, 'Non renseignée')
  ) s;
$$;

revoke all on function public.get_internal_locality_daily_stats(date) from public;
grant execute on function public.get_internal_locality_daily_stats(date) to authenticated;
