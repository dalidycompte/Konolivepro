-- Password recovery for public coach accounts.
-- The RPCs are security-definer because anonymous users cannot read profiles/auth.users
-- directly. They expose only the configured question and a boolean result.

create or replace function public.get_security_question(p_username text)
returns text
language sql
security definer
stable
set search_path = public, auth
as $$
  select nullif(u.raw_user_meta_data ->> 'security_question', '')
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

create or replace function public.reset_user_password(
  p_username text,
  p_question text,
  p_answer text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_question text;
  v_answer text;
begin
  if length(coalesce(p_new_password, '')) < 8
     or length(coalesce(p_new_password, '')) > 128 then
    raise exception 'Password length must be between 8 and 128 characters';
  end if;

  select
    u.id,
    u.raw_user_meta_data ->> 'security_question',
    u.raw_user_meta_data ->> 'security_answer'
  into v_user_id, v_question, v_answer
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
    and u.deleted_at is null
  limit 1;

  if v_user_id is null
     or v_question is null
     or v_answer is null
     or lower(trim(v_question)) <> lower(trim(coalesce(p_question, '')))
     or lower(trim(v_answer)) <> lower(trim(coalesce(p_answer, ''))) then
    return false;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;

  return found;
end;
$$;

revoke all on function public.get_security_question(text) from public;
revoke all on function public.reset_user_password(text, text, text, text) from public;
grant execute on function public.get_security_question(text) to anon, authenticated;
grant execute on function public.reset_user_password(text, text, text, text) to anon, authenticated;
