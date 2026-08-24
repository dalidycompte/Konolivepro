-- Un Coach Mobile ne peut conserver qu'une demande active par numéro.
-- Les demandes sont de nouveau autorisées dès que le traitement est clôturé.
create unique index if not exists verification_requests_one_active_phone_per_coach_idx
  on public.verification_requests (applicant_id, phone_to_certify)
  where status in ('pending', 'processing');

create or replace function public.create_mobile_verification_request(p_phone text)
returns public.verification_requests
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phone text := regexp_replace(trim(coalesce(p_phone, '')), '\D', '', 'g');
  v_request public.verification_requests;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if v_phone !~ '^06[0-9]{7}$' then
    raise exception 'INVALID_PHONE_NUMBER' using errcode = '22023';
  end if;

  insert into public.verification_requests (applicant_id, phone_to_certify, status)
  values (auth.uid(), v_phone, 'pending')
  returning * into v_request;

  return v_request;
exception
  when unique_violation then
    raise exception 'ACTIVE_DUPLICATE_PHONE' using errcode = 'P0001';
end;
$$;

grant execute on function public.create_mobile_verification_request(text) to authenticated;
