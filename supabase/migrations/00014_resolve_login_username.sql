-- Resolve a public username to the actual Auth email used by the account.
-- This keeps login compatible with legacy email domains without exposing
-- profiles or auth.users through ordinary table access.

create or replace function public.resolve_login_email(p_username text)
returns text
language sql
security definer
stable
set search_path = public, auth
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
    and u.deleted_at is null
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
