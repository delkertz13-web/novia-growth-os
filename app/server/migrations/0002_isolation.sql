-- Isolation des entreprises imposée PAR LA BASE (sécurité au niveau des lignes).
-- Chaque transaction métier déclare son entreprise :
--   select set_config('novia.business_id', $1, true)
-- Sans cette déclaration, une table métier ne renvoie AUCUNE ligne et refuse toute écriture.
-- FORCE : la règle s'applique aussi au propriétaire des tables (seul un superutilisateur
-- d'exploitation y échappe, jamais l'application).

do $$
declare t text;
begin
  foreach t in array array[
    'business_profiles', 'business_settings', 'customers', 'consent_records', 'appointments', 'payments',
    'sequences', 'sequence_actions', 'human_takeovers', 'opportunities', 'waitlist_entries', 'conversations',
    'messages', 'voice_calls', 'external_refs', 'audit_log', 'shadow_decisions', 'inbox_events',
    'outbox_messages', 'scheduled_jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy business_isolation on %I using (business_id = current_setting(''novia.business_id'', true)) with check (business_id = current_setting(''novia.business_id'', true))',
      t
    );
  end loop;
end $$;

-- L'ordonnanceur doit savoir QUELLES entreprises ont une échéance due, sans lire leurs
-- données : lecture seule de (business_id, key, due_at) quand il se déclare comme tel.
create policy scheduler_scan on scheduled_jobs for select
  using (current_setting('novia.scope', true) = 'scheduler');
create policy scheduler_scan on outbox_messages for select
  using (current_setting('novia.scope', true) = 'scheduler');

-- Rôle applicatif : droits sur les données, AUCUN droit sur le schéma.
do $$
begin
  if not exists (select from pg_roles where rolname = 'novia_app') then
    create role novia_app nologin;
  end if;
end $$;
grant usage on schema public to novia_app;
grant select, insert, update on all tables in schema public to novia_app;
grant delete on sessions, auth_challenges, waitlist_entries, scheduled_jobs to novia_app;
grant usage, select on all sequences in schema public to novia_app;
revoke all on novia_schema_migrations from novia_app;
