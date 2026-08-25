-- Retire l'exécution anonyme par défaut des fonctions SECURITY DEFINER.
-- Les fonctions d'usage métier restent disponibles uniquement aux sessions authentifiées.
-- Les trois parcours publics nécessaires sont réautorisés explicitement plus bas.

begin;

revoke all on function public.add_processing_option(text, text) from public, anon;
revoke all on function public.assign_next_pending_request(uuid) from public, anon;
revoke all on function public.assign_pending_requests(uuid) from public, anon;
revoke all on function public.auto_assign_after_agent_available() from public, anon;
revoke all on function public.auto_assign_after_request_close() from public, anon;
revoke all on function public.auto_assign_after_request_insert() from public, anon;
revoke all on function public.check_phone_in_progress(text) from public, anon;
revoke all on function public.claim_request(uuid, uuid) from public, anon;
revoke all on function public.create_public_dashboard_link() from public, anon;
revoke all on function public.enforce_profile_role_assignment() from public, anon;
revoke all on function public.get_agent_stats() from public, anon;
revoke all on function public.get_current_work_period() from public, anon;
revoke all on function public.get_daily_performances(uuid) from public, anon;
revoke all on function public.get_internal_cumulative_chart() from public, anon;
revoke all on function public.get_internal_extra_stats() from public, anon;
revoke all on function public.get_internal_locality_daily_stats(date) from public, anon;
revoke all on function public.get_my_role() from public, anon;
revoke all on function public.get_overtime_requests() from public, anon;
revoke all on function public.get_public_dashboard_data(text) from public, anon;
revoke all on function public.get_security_question(text) from public, anon;
revoke all on function public.handle_new_user() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.register_mobile_push_device(text, text, text, text) from public, anon;
revoke all on function public.remove_processing_option(uuid) from public, anon;
revoke all on function public.reset_user_password(text, text, text, text) from public, anon;
revoke all on function public.resolve_login_email(text) from public, anon;
revoke all on function public.respond_to_mobile_video_call(uuid, text) from public, anon;
revoke all on function public.revoke_mobile_push_device(text) from public, anon;
revoke all on function public.transfer_request(uuid, uuid) from public, anon;

grant execute on function public.add_processing_option(text, text) to authenticated;
grant execute on function public.check_phone_in_progress(text) to authenticated;
grant execute on function public.claim_request(uuid, uuid) to authenticated;
grant execute on function public.create_public_dashboard_link() to authenticated;
grant execute on function public.get_agent_stats() to authenticated;
grant execute on function public.get_current_work_period() to authenticated;
grant execute on function public.get_daily_performances(uuid) to authenticated;
grant execute on function public.get_internal_cumulative_chart() to authenticated;
grant execute on function public.get_internal_extra_stats() to authenticated;
grant execute on function public.get_internal_locality_daily_stats(date) to authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_overtime_requests() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.register_mobile_push_device(text, text, text, text) to authenticated;
grant execute on function public.remove_processing_option(uuid) to authenticated;
grant execute on function public.respond_to_mobile_video_call(uuid, text) to authenticated;
grant execute on function public.revoke_mobile_push_device(text) to authenticated;
grant execute on function public.transfer_request(uuid, uuid) to authenticated;

-- Les parcours publics ci-dessous conservent leur contrôle métier interne.
grant execute on function public.get_public_dashboard_data(text) to anon, authenticated;
grant execute on function public.get_security_question(text) to anon, authenticated;
grant execute on function public.reset_user_password(text, text, text, text) to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

commit;
