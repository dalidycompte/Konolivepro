-- Permet au Coach Mobile de resoumettre une demande classée « Autre ».
-- La demande existante est remise dans la file d'attente afin de conserver ses documents
-- et son historique d'identité tout en déclenchant une nouvelle attribution agent.
create or replace function public.resubmit_verification_request(p_request_id uuid)
returns public.verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.verification_requests;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_request
  from public.verification_requests
  where id = p_request_id
    and applicant_id = auth.uid()
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'other' then
    raise exception 'REQUEST_NOT_RESUBMITTABLE';
  end if;

  update public.verification_requests
  set status = 'pending',
      agent_id = null,
      notes = null,
      processed_at = null,
      processing_duration_seconds = null,
      processing_started_at = null,
      assignment_source = 'manual',
      assigned_at = null,
      updated_at = now()
  where id = p_request_id;

  -- Une mise à jour ne déclenche pas le trigger d'insertion : relancer explicitement
  -- l'algorithme pour attribuer immédiatement la demande si un agent est disponible.
  perform public.assign_pending_requests(null);

  select * into v_request
  from public.verification_requests
  where id = p_request_id;

  return v_request;
end;
$$;

revoke all on function public.resubmit_verification_request(uuid) from public, anon;
grant execute on function public.resubmit_verification_request(uuid) to authenticated;
