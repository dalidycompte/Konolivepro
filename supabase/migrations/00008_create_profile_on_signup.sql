-- Keep auth.users and public.profiles in sync for all future registrations.
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
  role_value text;
begin
  base_username := coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(coalesce(new.email, new.id::text), '@', 1));
  safe_username := left(regexp_replace(base_username, '[^a-zA-Z0-9_.-]', '', 'g'), 50);
  if safe_username = '' then safe_username := 'user_' || left(new.id::text, 8); end if;
  if exists (select 1 from public.profiles where username = safe_username and id <> new.id) then
    safe_username := left(safe_username, 40) || '_' || left(new.id::text, 8);
  end if;

  locality_value := nullif(new.raw_user_meta_data->>'locality', '');
  phone_value := nullif(new.raw_user_meta_data->>'phone', '');
  role_value := case when new.raw_user_meta_data->>'role' in ('agent','supervisor','admin') then new.raw_user_meta_data->>'role' else 'applicant' end;

  insert into public.profiles (id, username, email, phone, locality, role)
  values (new.id, safe_username, new.email, phone_value, locality_value, role_value)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill any Auth account created before the trigger existed.
insert into public.profiles (id, username, email, phone, locality, role)
select
  u.id,
  left(regexp_replace(coalesce(nullif(u.raw_user_meta_data->>'username', ''), split_part(coalesce(u.email, u.id::text), '@', 1)), '[^a-zA-Z0-9_.-]', '', 'g'), 50),
  u.email,
  nullif(u.raw_user_meta_data->>'phone', ''),
  nullif(u.raw_user_meta_data->>'locality', ''),
  case when u.raw_user_meta_data->>'role' in ('agent','supervisor','admin') then u.raw_user_meta_data->>'role' else 'applicant' end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
