-- Public signup is always an applicant/coach-mobile account.
-- Agent, supervisor and admin roles can only be assigned by the trusted admin flow.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  safe_username text;
  locality_value text;
  phone_value text;
begin
  base_username := coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(coalesce(new.email, new.id::text), '@', 1));
  safe_username := left(regexp_replace(base_username, '[^a-zA-Z0-9_.-]', '', 'g'), 50);
  if safe_username = '' then safe_username := 'user_' || left(new.id::text, 8); end if;
  if exists (select 1 from public.profiles where username = safe_username and id <> new.id) then
    safe_username := left(safe_username, 40) || '_' || left(new.id::text, 8);
  end if;

  locality_value := nullif(new.raw_user_meta_data->>'locality', '');
  phone_value := nullif(new.raw_user_meta_data->>'phone', '');

  insert into public.profiles (id, username, email, phone, locality, role)
  values (new.id, safe_username, new.email, phone_value, locality_value, 'applicant')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.enforce_profile_role_assignment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  caller_role text;
begin
  -- Service-role operations (the admin-create-user Edge Function) are trusted.
  if auth.uid() is null then
    return new;
  end if;

  select role into caller_role from public.profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    if new.id = auth.uid() then
      new.role := 'applicant';
    elsif coalesce(caller_role, '') <> 'admin' then
      raise exception 'Only an administrator may create staff profiles';
    end if;
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role and coalesce(caller_role, '') <> 'admin' then
    raise exception 'Only an administrator may change account roles';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_role_assignment on public.profiles;
create trigger enforce_profile_role_assignment
before insert or update on public.profiles
for each row execute function public.enforce_profile_role_assignment();
