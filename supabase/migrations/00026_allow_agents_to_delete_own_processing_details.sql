-- Agents may correct an erroneous Mes GSM row by deleting only the processing
-- details that belong to a request assigned to them. The verification request
-- itself is intentionally preserved.
begin;

drop policy if exists "pd_delete" on public.processing_details;

create policy "pd_delete"
on public.processing_details
for delete
to authenticated
using (
  exists (
    select 1
    from public.verification_requests vr
    where vr.id = processing_details.request_id
      and vr.agent_id = auth.uid()
  )
);

commit;
