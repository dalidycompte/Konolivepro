-- Fixe le chemin de recherche des fonctions signalées par le Security Advisor.
-- ALTER FUNCTION préserve le corps SQL, la signature et les permissions existantes.

begin;

alter function public.update_updated_at() set search_path to 'public, pg_temp';
alter function public.get_my_role() set search_path to 'public, pg_temp';
alter function public.check_phone_in_progress(text) set search_path to 'public, pg_temp';
alter function public.get_current_work_period() set search_path to 'public, pg_temp';
alter function public.update_api_integration_updated_at() set search_path to 'public, pg_temp';
alter function public.is_admin() set search_path to 'public, pg_temp';
alter function public.get_daily_performances(uuid) set search_path to 'public, pg_temp';
alter function public.get_overtime_requests() set search_path to 'public, pg_temp';
alter function public.transfer_request(uuid, uuid) set search_path to 'public, pg_temp';
alter function public.get_agent_stats() set search_path to 'public, pg_temp';
alter function public.get_internal_cumulative_chart() set search_path to 'public, pg_temp';

commit;
