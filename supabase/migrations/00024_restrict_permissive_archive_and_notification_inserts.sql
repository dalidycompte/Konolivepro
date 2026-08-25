-- Remplace les INSERT RLS avec WITH CHECK (true) par des règles liées à
-- l'utilisateur connecté ou à une demande de vérification associée.

begin;

drop policy if exists "al_insert" on public.activity_logs;
create policy "al_insert" on public.activity_logs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "ada_insert" on public.agent_daily_archive;
create policy "ada_insert" on public.agent_daily_archive
  for insert to authenticated
  with check (
    agent_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('supervisor', 'admin')
    )
  );

drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.verification_requests vr
      where vr.id = notifications.request_id
        and (vr.agent_id = auth.uid() or vr.applicant_id = auth.uid())
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('supervisor', 'admin')
    )
  );

-- L'archive de traitements est écrite par la fonction quotidienne avec la
-- service role key, qui contourne RLS. Aucun client web ne l'écrit directement.
drop policy if exists "pda_insert" on public.processing_details_archive;

commit;
