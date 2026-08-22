-- Automatic assignment metadata.
alter table public.verification_requests
  add column if not exists assignment_source text not null default 'manual',
  add column if not exists assigned_at timestamptz;

alter table public.verification_requests
  drop constraint if exists verification_requests_assignment_source_check;
alter table public.verification_requests
  add constraint verification_requests_assignment_source_check
  check (assignment_source in ('automatic', 'manual'));

alter table public.profiles
  add column if not exists last_auto_assigned_at timestamptz;

create index if not exists verification_requests_pending_created_idx
  on public.verification_requests(status, created_at)
  where status = 'pending';
create index if not exists verification_requests_agent_status_idx
  on public.verification_requests(agent_id, status);

-- Manual assignment: an authenticated agent may take a second request explicitly,
-- but never more than two active requests at once.
create or replace function public.claim_request(p_request_id uuid, p_agent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.verification_requests;
  v_agent public.profiles;
  v_active_count integer;
begin
  if auth.uid() is null or auth.uid() <> p_agent_id then
    raise exception 'AGENT_UNAUTHORIZED: Attribution réservée à l''agent connecté.';
  end if;

  select * into v_row
  from public.verification_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'REQUEST_UNAVAILABLE: Demande introuvable.';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'REQUEST_UNAVAILABLE: Cette demande n''est plus disponible (statut: %).', v_row.status;
  end if;

  select * into v_agent
  from public.profiles
  where id = p_agent_id
    and role = 'agent'
    and is_active = true
    and is_online = true
    and is_logged_in = true
    and is_paused = false
  for update;
  if not found then
    raise exception 'AGENT_UNAVAILABLE: Vous devez être connecté, disponible et hors pause.';
  end if;

  select count(*) into v_active_count
  from public.verification_requests
  where agent_id = p_agent_id and status = 'processing';
  if v_active_count >= 2 then
    raise exception 'AGENT_BUSY: Vous traitez déjà 2 demandes simultanément.';
  end if;

  update public.verification_requests
  set status = 'processing',
      agent_id = p_agent_id,
      assignment_source = 'manual',
      assigned_at = now(),
      processing_started_at = now(),
      updated_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (
    p_agent_id,
    'request_assigned',
    'Demande prise manuellement',
    'Une demande vous a été attribuée manuellement.',
    p_request_id
  );

  return p_request_id;
end;
$$;

-- Assign one pending request to one eligible agent. Row locks make the operation
-- safe when several requests or agents change at the same time.
create or replace function public.assign_next_pending_request(p_preferred_agent_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_agent_id uuid;
begin
  select id into v_request_id
  from public.verification_requests
  where status = 'pending'
  order by created_at asc, id asc
  for update skip locked
  limit 1;

  if v_request_id is null then
    return null;
  end if;

  if p_preferred_agent_id is not null then
    select p.id into v_agent_id
    from public.profiles p
    where p.id = p_preferred_agent_id
      and p.role = 'agent'
      and p.is_active = true
      and p.is_online = true
      and p.is_logged_in = true
      and p.is_paused = false
      and not exists (
        select 1 from public.verification_requests vr
        where vr.agent_id = p.id and vr.status = 'processing'
      )
    for update skip locked;
  end if;

  if v_agent_id is null then
    select p.id into v_agent_id
    from public.profiles p
    where p.role = 'agent'
      and p.is_active = true
      and p.is_online = true
      and p.is_logged_in = true
      and p.is_paused = false
      and not exists (
        select 1 from public.verification_requests vr
        where vr.agent_id = p.id and vr.status = 'processing'
      )
    order by p.last_auto_assigned_at nulls first, p.created_at asc, p.id asc
    for update skip locked
    limit 1;
  end if;

  if v_agent_id is null then
    return null;
  end if;

  update public.verification_requests
  set status = 'processing',
      agent_id = v_agent_id,
      assignment_source = 'automatic',
      assigned_at = now(),
      processing_started_at = now(),
      updated_at = now()
  where id = v_request_id and status = 'pending';

  if not found then
    return null;
  end if;

  update public.profiles
  set last_auto_assigned_at = now()
  where id = v_agent_id;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (
    v_agent_id,
    'request_assigned',
    'Nouvelle demande attribuée',
    'Une nouvelle demande vous a été attribuée automatiquement.',
    v_request_id
  );

  return v_request_id;
end;
$$;

-- Fill every available agent/request slot, stopping when either queue is empty
-- or no eligible agent remains.
create or replace function public.assign_pending_requests(p_preferred_agent_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned uuid;
  v_count integer := 0;
begin
  v_assigned := public.assign_next_pending_request(p_preferred_agent_id);
  while v_assigned is not null loop
    v_count := v_count + 1;
    v_assigned := public.assign_next_pending_request(null);
  end loop;
  return v_count;
end;
$$;

-- New requests immediately enter the assignment loop.
create or replace function public.auto_assign_after_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assign_pending_requests(null);
  return new;
end;
$$;

drop trigger if exists auto_assign_after_request_insert on public.verification_requests;
create trigger auto_assign_after_request_insert
after insert on public.verification_requests
for each row when (new.status = 'pending')
execute function public.auto_assign_after_request_insert();

-- When an agent closes a request, prefer that same agent for the next queued
-- request, provided the agent is still eligible.
create or replace function public.auto_assign_after_request_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'processing'
     and new.status in ('accepted', 'rejected', 'unchanged', 'other') then
    perform public.assign_pending_requests(new.agent_id);
  end if;
  return new;
end;
$$;

drop trigger if exists auto_assign_after_request_close on public.verification_requests;
create trigger auto_assign_after_request_close
after update of status on public.verification_requests
for each row when (
  old.status = 'processing'
  and new.status in ('accepted', 'rejected', 'unchanged', 'other')
)
execute function public.auto_assign_after_request_close();

-- A newly online/unpaused/logged-in agent immediately receives queued work.
create or replace function public.auto_assign_after_agent_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'agent'
     and new.is_active = true
     and new.is_online = true
     and new.is_logged_in = true
     and new.is_paused = false
     and (
       old.role is distinct from new.role
       or old.is_active is distinct from new.is_active
       or old.is_online is distinct from new.is_online
       or old.is_logged_in is distinct from new.is_logged_in
       or old.is_paused is distinct from new.is_paused
     ) then
    perform public.assign_pending_requests(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists auto_assign_after_agent_available on public.profiles;
create trigger auto_assign_after_agent_available
after update of role, is_active, is_online, is_logged_in, is_paused on public.profiles
for each row execute function public.auto_assign_after_agent_available();

revoke all on function public.assign_next_pending_request(uuid) from public;
revoke all on function public.assign_pending_requests(uuid) from public;
revoke all on function public.auto_assign_after_request_insert() from public;
revoke all on function public.auto_assign_after_request_close() from public;
revoke all on function public.auto_assign_after_agent_available() from public;
grant execute on function public.claim_request(uuid, uuid) to authenticated;
