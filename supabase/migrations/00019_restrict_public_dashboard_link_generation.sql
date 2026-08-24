-- La génération de lien reste réservée à une session authentifiée ; l’accès public
-- concerne uniquement la consultation via un jeton valide.
revoke all on function public.create_public_dashboard_link() from public;
revoke all on function public.create_public_dashboard_link() from anon;
revoke all on function public.create_public_dashboard_link() from authenticated;
grant execute on function public.create_public_dashboard_link() to authenticated;
