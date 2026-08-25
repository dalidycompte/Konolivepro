-- Sécurise une table de sonde créée hors des flux métier KonolivePro.
-- Elle ne doit être accessible ni par les visiteurs anonymes ni par les utilisateurs connectés.

begin;

alter table if exists public.__konolive_probe enable row level security;
revoke all on table public.__konolive_probe from anon, authenticated;

commit;
