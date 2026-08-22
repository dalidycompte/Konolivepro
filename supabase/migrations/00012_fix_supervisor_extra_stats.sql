-- Return the shape consumed by SupervisorDashboard.
-- The previous function returned total_coaches/localities while the UI expects
-- coach and locality, which caused a runtime error on the supervisor route.
create or replace function public.get_internal_extra_stats()
returns json
language sql
security definer
stable
set search_path = public
as $$
select json_build_object(
  'coach', json_build_object(
    'total', (select count(*) from public.profiles where role = 'applicant' and is_active = true),
    'online', (select count(*) from public.profiles where role = 'applicant' and is_active = true and is_online = true),
    'offline', (select count(*) from public.profiles where role = 'applicant' and is_active = true and is_online = false)
  ),
  'locality', coalesce((
    select json_agg(
      json_build_object(
        'locality', s.locality,
        'received', s.received,
        'accepted', s.accepted,
        'rejected', s.rejected,
        'unchanged', s.unchanged,
        'autres', s.autres
      )
      order by s.locality
    )
    from (
      select
        coalesce(p.locality, 'Non renseignée') as locality,
        count(vr.id) as received,
        count(vr.id) filter (where vr.status = 'accepted') as accepted,
        count(vr.id) filter (where vr.status = 'rejected') as rejected,
        count(vr.id) filter (where vr.status = 'unchanged') as unchanged,
        count(vr.id) filter (where vr.status = 'other') as autres
      from public.profiles p
      left join public.verification_requests vr on vr.applicant_id = p.id
      where p.role = 'applicant' and p.is_active = true
      group by coalesce(p.locality, 'Non renseignée')
    ) s
  ), '[]'::json)
);
$$;
