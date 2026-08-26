-- Allow an agent to correct the phone number and Coach mobile label of the
-- request assigned to them, without altering account records or request status.
begin;

alter table public.verification_requests
  add column if not exists coach_mobile text;

create or replace function public.update_assigned_request_identity(
  p_request_id uuid,
  p_phone text default null,
  p_coach_mobile text default null
)
returns table(phone_to_certify text, coach_mobile text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  if p_phone is not null then
    v_phone := regexp_replace(trim(p_phone), '[^0-9]', '', 'g');
    if v_phone = '' then
      raise exception 'Le numéro est obligatoire';
    end if;
  end if;

  return query
  update public.verification_requests vr
  set phone_to_certify = coalesce(v_phone, vr.phone_to_certify),
      coach_mobile = case
        when p_coach_mobile is null then vr.coach_mobile
        else nullif(trim(p_coach_mobile), '')
      end
  where vr.id = p_request_id
    and vr.agent_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'agent'
    )
  returning vr.phone_to_certify, vr.coach_mobile;

  if not found then
    raise exception 'Demande introuvable ou non attribuée à l''agent connecté';
  end if;
end;
$$;

revoke all on function public.update_assigned_request_identity(uuid, text, text) from public, anon;
grant execute on function public.update_assigned_request_identity(uuid, text, text) to authenticated;

commit;
