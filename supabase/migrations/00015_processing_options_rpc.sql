-- Use security-definer RPCs for processing-option administration.
-- This avoids fragile client-side RLS checks while preserving a strict role check.

create or replace function public.add_processing_option(
  p_column_name text,
  p_option_value text
)
returns public.processing_options
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_column text := lower(trim(coalesce(p_column_name, '')));
  v_value text := trim(coalesce(p_option_value, ''));
  v_option public.processing_options;
begin
  select role into v_role
  from public.profiles
  where id = auth.uid()
    and is_active = true
  limit 1;

  if v_role not in ('supervisor', 'admin') then
    raise exception 'Only active supervisors and administrators can manage processing options'
      using errcode = '42501';
  end if;

  if v_column not in (
    'constat_webcare',
    'type_de_piece',
    'verbatim',
    'action_prise_gsm',
    'statut_final_gsm',
    'traitement',
    'type_d_identification',
    'raison_du_retard'
  ) then
    raise exception 'Invalid processing option category'
      using errcode = '22023';
  end if;

  if v_value = '' or length(v_value) > 200 then
    raise exception 'Processing option must contain between 1 and 200 characters'
      using errcode = '22023';
  end if;

  insert into public.processing_options (column_name, option_value)
  values (v_column, v_value)
  returning * into v_option;

  return v_option;
end;
$$;

create or replace function public.remove_processing_option(p_option_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.profiles
  where id = auth.uid()
    and is_active = true
  limit 1;

  if v_role not in ('supervisor', 'admin') then
    raise exception 'Only active supervisors and administrators can manage processing options'
      using errcode = '42501';
  end if;

  delete from public.processing_options where id = p_option_id;
  return found;
end;
$$;

revoke all on function public.add_processing_option(text, text) from public;
revoke all on function public.remove_processing_option(uuid) from public;
grant execute on function public.add_processing_option(text, text) to authenticated;
grant execute on function public.remove_processing_option(uuid) to authenticated;
