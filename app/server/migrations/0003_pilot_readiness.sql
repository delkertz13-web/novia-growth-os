-- P3 : préparation de PILOT-001 (aucune donnée inventée : ces tables commencent vides).

-- Provenance des données importantes (posée par le serveur, jamais par le navigateur).
alter table customers add column provenance text
  check (provenance in ('PRO_MANUAL', 'OWNER_MANUAL', 'PLANITY_EXPORT', 'PLANITY_NOTIFICATION', 'NOVIA_BOOKING', 'VOICE', 'GHL', 'IMPORT'));
alter table appointments add column provenance text
  check (provenance in ('PRO_MANUAL', 'OWNER_MANUAL', 'PLANITY_EXPORT', 'PLANITY_NOTIFICATION', 'NOVIA_BOOKING', 'VOICE', 'GHL', 'IMPORT'));

-- Fiche de préparation (faits recueillis à la rencontre : Planity, objectifs, paiement…),
-- chaque fait avec son statut UNKNOWN / ESTIMATED / VERIFIED. Enregistrée au fil de l'eau
-- (brouillon) : on peut quitter et reprendre.
create table business_onboarding (
  business_id text primary key references businesses(id),
  facts jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text not null
);

-- Modèles de messages : versionnés, DRAFT → APPROVED → ARCHIVED. Seul un modèle APPROUVÉ
-- de CETTE entreprise alimente le moteur ; un texte de démonstration n'y entre jamais.
create table message_templates (
  business_id text not null references businesses(id),
  template_key text not null check (template_key in ('W02.confirmation', 'W02.reschedule', 'W02.reminder', 'W03.recovery', 'W04.recovery')),
  version integer not null check (version > 0),
  workflow text not null,
  channel text not null check (channel in ('sms')),
  purpose text not null check (purpose in ('transactional', 'marketing')),
  body text not null check (length(body) between 1 and 640),
  status text not null check (status in ('DRAFT', 'APPROVED', 'ARCHIVED')),
  author text not null,
  created_at timestamptz not null,
  approved_by text,
  approved_at timestamptz,
  primary key (business_id, template_key, version)
);
-- au plus UN modèle approuvé par message
create unique index message_templates_one_approved on message_templates (business_id, template_key) where status = 'APPROVED';

-- FAQ : seule une réponse APPROUVÉE peut être donnée par NOVIA ; sinon « besoin humain ».
create table faq_entries (
  business_id text not null references businesses(id),
  id text not null,
  intent text not null check (length(intent) between 1 and 120),
  keywords jsonb not null default '[]',
  answer text not null check (length(answer) between 1 and 640),
  status text not null check (status in ('DRAFT', 'APPROVED', 'ARCHIVED')),
  author text not null,
  created_at timestamptz not null,
  approved_by text,
  approved_at timestamptz,
  primary key (business_id, id)
);

-- Avis de la pro / OWNER sur une décision shadow (sert à apprendre, ne change aucune règle).
create table shadow_feedback (
  business_id text not null references businesses(id),
  decision_id bigint not null references shadow_decisions(id),
  user_id text not null,
  verdict text not null check (verdict in ('AGREE', 'DISAGREE', 'UNSURE')),
  comment text check (length(comment) <= 500),
  at timestamptz not null,
  primary key (business_id, decision_id, user_id)
);

do $$
declare t text;
begin
  foreach t in array array['business_onboarding', 'message_templates', 'faq_entries', 'shadow_feedback'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy business_isolation on %I using (business_id = current_setting(''novia.business_id'', true)) with check (business_id = current_setting(''novia.business_id'', true))',
      t
    );
    execute format('grant select, insert, update on %I to novia_app', t);
  end loop;
end $$;
