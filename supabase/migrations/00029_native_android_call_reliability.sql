-- Native Android call reliability: device registry, strict state machine and atomic responses.

begin;

create table if not exists public.mobile_push_devices (
  device_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'web')),
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists mobile_push_devices_user_idx
  on public.mobile_push_devices (user_id, last_seen_at desc);

alter table public.mobile_push_devices enable row level security;

drop policy if exists mobile_push_devices_select_own on public.mobile_push_devices;
drop policy if exists mobile_push_devices_write_own on public.mobile_push_devices;

create policy mobile_push_devices_select_own
  on public.mobile_push_devices for select to authenticated
  using (user_id = auth.uid());

create policy mobile_push_devices_write_own
  on public.mobile_push_devices for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.register_mobile_push_device(
  p_device_id text,
  p_token text,
  p_platform text,
  p_app_version text default null
)
returns public.mobile_push_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.mobile_push_devices;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if nullif(trim(p_device_id), '') is null or nullif(trim(p_token), '') is null then
    raise exception 'DEVICE_DATA_REQUIRED';
  end if;
  if p_platform not in ('android', 'web') then
    raise exception 'UNSUPPORTED_PLATFORM';
  end if;

  -- A rotated FCM token must move cleanly to the current authenticated user.
  delete from public.mobile_push_devices
    where token = p_token and device_id <> p_device_id;

  insert into public.mobile_push_devices(device_id, user_id, token, platform, app_version, last_seen_at)
  values (p_device_id, auth.uid(), p_token, p_platform, p_app_version, now())
  on conflict (device_id) do update set
    user_id = excluded.user_id,
    token = excluded.token,
    platform = excluded.platform,
    app_version = excluded.app_version,
    last_seen_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.revoke_mobile_push_device(p_device_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  delete from public.mobile_push_devices
    where device_id = p_device_id and user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.register_mobile_push_device(text, text, text, text) from public, anon;
revoke all on function public.revoke_mobile_push_device(text) from public, anon;
grant execute on function public.register_mobile_push_device(text, text, text, text) to authenticated;
grant execute on function public.revoke_mobile_push_device(text) to authenticated;

-- Normalize the old client-side TIMEOUT spelling before constraining the machine.
update public.video_call_states set state = 'EXPIRED' where state = 'TIMEOUT';

alter table public.video_call_states
  add column if not exists accepted_at timestamptz,
  add column if not exists ended_reason text;

alter table public.video_call_states
  drop constraint if exists video_call_states_state_check;
alter table public.video_call_states
  add constraint video_call_states_state_check
  check (state in ('RINGING', 'ACCEPTED', 'CONNECTED', 'REJECTED', 'EXPIRED', 'ENDED'));

-- State changes are performed through the locked RPC below, not arbitrary client updates.
drop policy if exists vcs_update on public.video_call_states;

create or replace function public.respond_to_mobile_video_call(
  p_call_id uuid,
  p_action text
)
returns public.video_call_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.video_call_states;
  v_action text := upper(trim(p_action));
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_action not in ('ACCEPTED', 'REJECTED', 'EXPIRED', 'CONNECTED', 'ENDED') then
    raise exception 'INVALID_CALL_ACTION';
  end if;

  select * into v_row
    from public.video_call_states
    where call_id = p_call_id
    for update;

  if not found then
    raise exception 'CALL_NOT_FOUND';
  end if;

  if v_action in ('ACCEPTED', 'REJECTED', 'EXPIRED') then
    v_allowed := v_row.receiver_id = auth.uid() and v_row.state = 'RINGING';
    if v_allowed and v_action <> 'EXPIRED' and v_row.expires_at is not null and v_row.expires_at <= now() then
      raise exception 'CALL_EXPIRED';
    end if;
  elsif v_action = 'CONNECTED' then
    v_allowed := (v_row.caller_id = auth.uid() or v_row.receiver_id = auth.uid())
                 and v_row.state = 'ACCEPTED';
  elsif v_action = 'ENDED' then
    v_allowed := (v_row.caller_id = auth.uid() or v_row.receiver_id = auth.uid())
                 and v_row.state in ('RINGING', 'ACCEPTED', 'CONNECTED');
  end if;

  if not v_allowed then
    raise exception 'INVALID_CALL_TRANSITION';
  end if;

  update public.video_call_states
    set state = v_action,
        accepted_at = case when v_action = 'ACCEPTED' then now() else accepted_at end,
        ended_reason = case when v_action in ('REJECTED', 'EXPIRED', 'ENDED') then lower(v_action) else ended_reason end,
        updated_at = now()
    where call_id = p_call_id
    returning * into v_row;

  -- Keep the pre-existing video_calls table synchronized for the web modal.
  update public.video_calls
    set status = case v_action
      when 'ACCEPTED' then 'active'
      when 'CONNECTED' then 'active'
      when 'REJECTED' then 'rejected'
      when 'EXPIRED' then 'missed'
      when 'ENDED' then 'ended'
      else status
    end,
    started_at = case when v_action in ('ACCEPTED', 'CONNECTED') and started_at is null then now() else started_at end,
    ended_at = case when v_action in ('REJECTED', 'EXPIRED', 'ENDED') then now() else ended_at end
    where id = p_call_id;

  return v_row;
end;
$$;

revoke all on function public.respond_to_mobile_video_call(uuid, text) from public, anon;
grant execute on function public.respond_to_mobile_video_call(uuid, text) to authenticated;

commit;
