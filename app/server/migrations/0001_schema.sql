-- NOVIA Pilot — schéma initial (P2).
-- PostgreSQL standard (16+), aucune extension propriétaire.
-- Toute donnée métier appartient à UNE entreprise : clé primaire composite (business_id, id)
-- et clés étrangères qui incluent business_id (une référence ne peut pas traverser deux
-- entreprises). L'isolation est en plus imposée par la sécurité au niveau des lignes (0002).

create table businesses (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name text not null default '',
  timezone text not null,
  -- P2 : le pilote ne peut fonctionner QU'EN shadow (aucun envoi réel possible)
  execution_mode text not null default 'shadow' check (execution_mode = 'shadow'),
  -- compteur des identifiants courts du moteur (c12, a34…)
  seq integer not null default 1,
  -- incrémentée à chaque transaction métier : les appareils savent s'ils sont à jour
  revision bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Profil de l'entreprise : document versionné, chaque valeur porte son statut
-- (unknown / demo / verified). Une valeur inconnue BLOQUE les automatisations qui en dépendent.
create table business_profiles (
  business_id text primary key references businesses(id),
  profile jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

-- Réglages choisis par la professionnelle (automatisations, plage d'envoi, canaux, Voice).
create table business_settings (
  business_id text primary key references businesses(id),
  settings jsonb not null,
  voice jsonb not null,
  updated_at timestamptz not null default now()
);

create table customers (
  business_id text not null references businesses(id),
  id text not null,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text not null,
  lead_source text not null,
  lifecycle text not null check (lifecycle in ('prospect', 'client')),
  -- projections du registre de consentement (recalculées par le moteur, jamais saisies)
  consent_transactional boolean not null,
  consent_marketing boolean not null,
  opt_out boolean not null,
  human_takeover boolean not null default false,
  created_at timestamptz not null,
  last_activity_at timestamptz not null,
  anonymized_at timestamptz,
  extra jsonb not null default '{}',
  primary key (business_id, id)
);
create index customers_phone on customers (business_id, phone);
create index customers_email on customers (business_id, lower(email));

-- Registre de consentement : AJOUT SEUL (trigger plus bas). Une nouvelle décision n'efface
-- jamais la précédente ; l'état courant est une projection.
create table consent_records (
  business_id text not null,
  id text not null,
  customer_id text not null,
  position integer not null,
  at timestamptz not null,
  channel text not null check (channel in ('sms', 'email', 'phone', 'instagram', 'all')),
  purpose text not null check (purpose in ('transactional', 'marketing')),
  state text not null check (state in ('granted', 'withdrawn', 'opposed')),
  source text not null check (source in ('booking_form', 'inbound_stop', 'pro_declared', 'explicit_resubscribe', 'import', 'demo')),
  proof_ref text,
  primary key (business_id, id),
  unique (business_id, customer_id, position),
  foreign key (business_id, customer_id) references customers(business_id, id)
);

create table appointments (
  business_id text not null,
  id text not null,
  ref text not null,
  customer_id text not null,
  service_id text not null,
  start_at timestamptz not null,
  duration_min integer not null check (duration_min > 0),
  price numeric(10, 2) not null check (price >= 0),
  deposit numeric(10, 2) not null default 0,
  status text not null check (status in ('booked', 'confirmed', 'showed', 'no_show', 'cancelled', 'rescheduled', 'completed')),
  booking_origin text not null check (booking_origin in ('site', 'pro', 'voice', 'smartfill', 'recovery')),
  -- UNE attribution par RDV : pas de double compte du revenu
  attribution text not null,
  rescheduled_from_id text,
  rescheduled_to_id text,
  booked_at timestamptz,
  version integer not null default 0,
  -- historique des statuts (source, date) : jamais déduit de l'heure
  history jsonb not null default '[]',
  primary key (business_id, id),
  foreign key (business_id, customer_id) references customers(business_id, id)
);
create index appointments_start on appointments (business_id, start_at);
create index appointments_customer on appointments (business_id, customer_id);

-- Paiement : P2 = DÉCLARÉ par la professionnelle uniquement (aucun encaissement par NOVIA).
-- Une seule preuve par RDV : le CA confirmé ne peut pas être compté deux fois.
create table payments (
  business_id text not null,
  appointment_id text not null,
  kind text not null check (kind = 'declared'),
  amount numeric(10, 2) not null check (amount >= 0),
  declared_at timestamptz not null,
  primary key (business_id, appointment_id),
  foreign key (business_id, appointment_id) references appointments(business_id, id)
);

-- Séquences W03 / W04 (« workflow runs ») et leurs actions (ajout seul).
create table sequences (
  business_id text not null,
  id text not null,
  workflow text not null,
  customer_id text not null,
  appointment_id text,
  state text not null check (state in ('active', 'paused', 'stopped', 'completed')),
  step text not null,
  messages_sent integer not null default 0,
  started_at timestamptz not null,
  ended_at timestamptz,
  outcome text,
  primary key (business_id, id),
  foreign key (business_id, customer_id) references customers(business_id, id)
);

create table sequence_actions (
  business_id text not null,
  sequence_id text not null,
  position integer not null,
  at timestamptz not null,
  kind text not null,
  label text not null,
  primary key (business_id, sequence_id, position),
  foreign key (business_id, sequence_id) references sequences(business_id, id)
);

-- Historique de la reprise humaine (qui, quand) ; l'état courant est sur customers.
create table human_takeovers (
  id bigserial primary key,
  business_id text not null,
  customer_id text not null,
  value boolean not null,
  at timestamptz not null,
  actor text not null,
  foreign key (business_id, customer_id) references customers(business_id, id)
);

create table opportunities (
  business_id text not null,
  id text not null,
  kind text not null check (kind in ('smartfill', 'cancellation_recovery', 'noshow_recovery')),
  amount numeric(10, 2) not null,
  status text not null check (status in ('open', 'won', 'lost')),
  created_at timestamptz not null,
  source_appointment_id text,
  slot_start timestamptz,
  slot_duration_min integer,
  result_appointment_id text,
  primary key (business_id, id)
);

create table waitlist_entries (
  business_id text not null,
  id text not null,
  customer_id text not null,
  service_id text not null,
  created_at timestamptz not null,
  preferences jsonb not null,
  primary key (business_id, id),
  foreign key (business_id, customer_id) references customers(business_id, id)
);

create table conversations (
  business_id text not null,
  id text not null,
  customer_id text not null,
  channel text not null,
  needs_human boolean not null,
  needs_human_reason text,
  unread boolean not null,
  primary key (business_id, id),
  foreign key (business_id, customer_id) references customers(business_id, id)
);

-- Messages : ceux des conversations (cliente, NOVIA, pro) et les messages automatiques de
-- NOVIA (confirmation, rappel, relance ; conversation_id nul). Aucun statut « envoyé »
-- n'est possible en P2 : aucun fournisseur réel n'existe.
create table messages (
  business_id text not null,
  id text not null,
  conversation_id text,
  customer_id text,
  appointment_id text,
  at timestamptz not null,
  sender text not null check (sender in ('client', 'novia', 'pro')),
  purpose text,
  body text not null,
  faq_id text,
  idempotency_key text,
  status text check (status in ('pending', 'simulated', 'shadow', 'retrying', 'failed', 'blocked')),
  -- ordre : rang dans la conversation, ou numéro de création pour un message automatique
  position integer not null,
  primary key (business_id, id),
  unique (business_id, idempotency_key),
  foreign key (business_id, conversation_id) references conversations(business_id, id)
);
create index messages_conversation on messages (business_id, conversation_id, at);

create table voice_calls (
  business_id text not null,
  id text not null,
  at timestamptz not null,
  customer_id text,
  call jsonb not null,
  primary key (business_id, id)
);

-- Identifiants chez les fournisseurs (vide en P2 : aucun fournisseur réel).
create table external_refs (
  business_id text not null references businesses(id),
  entity_type text not null,
  entity_id text not null,
  provider text not null,
  external_id text not null,
  primary key (business_id, provider, external_id),
  unique (business_id, entity_type, entity_id, provider)
);

-- Journal d'audit (ajout seul) : QUI, QUOI, QUAND, QUELLE ENTREPRISE, QUELLE ENTITÉ.
-- Jamais le contenu d'un message ni les coordonnées d'une cliente.
create table audit_log (
  id bigserial primary key,
  business_id text not null references businesses(id),
  at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user', 'novia', 'system', 'test')),
  actor_id text,
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb not null default '{}'
);
create index audit_business_at on audit_log (business_id, at desc);

-- Décisions du mode shadow : ce que NOVIA aurait fait, ou ce qui l'en a empêchée.
create table shadow_decisions (
  id bigserial primary key,
  business_id text not null references businesses(id),
  at timestamptz not null,
  customer_id text,
  appointment_id text,
  workflow text,
  action text not null,
  result text not null check (result in ('WOULD_EXECUTE', 'BLOCKED')),
  reason text not null,
  guards jsonb not null default '[]',
  input_type text
);
create index shadow_business_at on shadow_decisions (business_id, at desc);

-- Événements entrants (inbox) : un événement (source, eventId) n'est traité qu'une fois.
create table inbox_events (
  business_id text not null references businesses(id),
  source text not null,
  event_id text not null,
  type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  status text not null check (status in ('received', 'processed', 'rejected', 'failed')),
  processed_at timestamptz,
  error text,
  primary key (business_id, source, event_id)
);

-- File d'envoi (outbox) : une écriture vers un fournisseur, idempotente par clé.
-- P2 : AUCUN transport. Le statut ne peut pas devenir « envoyé » (contrainte ci-dessous).
create table outbox_messages (
  business_id text not null references businesses(id),
  key text not null,
  kind text not null check (kind in ('message', 'conversation_reply', 'crm.upsert', 'crm.optout', 'voice.configure')),
  ref text not null,
  status text not null check (status in ('pending', 'retrying', 'shadow', 'blocked', 'failed')),
  attempts integer not null default 0,
  last_error jsonb,
  payload jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, key)
);
create index outbox_pending on outbox_messages (business_id) where status in ('pending', 'retrying');

-- Échéances du moteur (rappels, étapes de séquence) : survivent à un redémarrage.
create table scheduled_jobs (
  business_id text not null references businesses(id),
  key text not null,
  kind text not null check (kind in ('ReminderDue', 'SequenceStepDue')),
  payload jsonb not null,
  due_at timestamptz not null,
  status text not null check (status in ('pending', 'running', 'done', 'cancelled', 'failed')),
  attempts integer not null default 0,
  last_error text,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, key)
);
create index jobs_due on scheduled_jobs (due_at) where status in ('pending', 'running');

/* ------------------------------------------------------------------ */
/* Ajout seul : registre de consentement, actions de séquence, audit    */
/* ------------------------------------------------------------------ */

create function novia_append_only() returns trigger language plpgsql as $$
begin
  -- seule exception : l'effacement de la preuve textuelle lors d'une anonymisation
  if tg_op = 'UPDATE' and tg_table_name = 'consent_records'
     and current_setting('novia.anonymizing', true) = 'on'
     and new.id = old.id and new.state = old.state and new.at = old.at and new.purpose = old.purpose
     and new.channel = old.channel and new.source = old.source then
    return new;
  end if;
  raise exception 'NOVIA : % est en ajout seul (% interdit)', tg_table_name, tg_op;
end $$;

create trigger consent_records_append_only before update or delete on consent_records
  for each row execute function novia_append_only();
create trigger sequence_actions_append_only before update or delete on sequence_actions
  for each row execute function novia_append_only();
create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function novia_append_only();
create trigger shadow_decisions_append_only before update or delete on shadow_decisions
  for each row execute function novia_append_only();
create trigger human_takeovers_append_only before update or delete on human_takeovers
  for each row execute function novia_append_only();

/* ------------------------------------------------------------------ */
/* Authentification de la professionnelle (passkeys)                    */
/* ------------------------------------------------------------------ */

create table users (
  id uuid primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table memberships (
  user_id uuid not null references users(id),
  business_id text not null references businesses(id),
  role text not null check (role in ('OWNER', 'PRO')),
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

create table webauthn_credentials (
  id text primary key,
  user_id uuid not null references users(id),
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- jeton de session : seul son empreinte SHA-256 est stockée
create table sessions (
  token_hash bytea primary key,
  user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

-- invitation à usage unique (lien remis à la main) pour enregistrer une passkey
create table invitations (
  token_hash bytea primary key,
  business_id text not null references businesses(id),
  role text not null check (role in ('OWNER', 'PRO')),
  label text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references users(id)
);

create table auth_challenges (
  id uuid primary key,
  challenge text not null,
  purpose text not null check (purpose in ('register', 'login')),
  invitation_hash bytea,
  user_id uuid,
  expires_at timestamptz not null
);
