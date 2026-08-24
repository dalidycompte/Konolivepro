-- Évite la collision entre le paramètre de sortie expires_at et la colonne
-- public_dashboard_links.expires_at lors de la révocation de l’ancien lien.
create or replace function public.create_public_dashboard_link()
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id and role in ('admin', 'supervisor')
  ) then
    raise exception 'PUBLIC_DASHBOARD_LINK_FORBIDDEN';
  end if;

  update public.public_dashboard_links as link
  set revoked_at = now()
  where link.created_by = v_user_id
    and link.revoked_at is null
    and link.expires_at > now();

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.public_dashboard_links (token, created_by, expires_at)
  values (v_token, v_user_id, v_expires_at);

  return query select v_token, v_expires_at;
end;
$$;

revoke all on function public.create_public_dashboard_link() from public;
revoke all on function public.create_public_dashboard_link() from anon;
revoke all on function public.create_public_dashboard_link() from authenticated;
grant execute on function public.create_public_dashboard_link() to authenticated;
