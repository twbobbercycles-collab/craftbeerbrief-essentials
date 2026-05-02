-- =============================================================================
-- Migration 006: Insurance Policy Tracker
-- =============================================================================
-- Creates the insurance_policies table so brewery owners can track all their
-- insurance policies, coverage amounts, renewal dates, and agent contacts
-- in one place with expiration reminders.
--
-- Depends on: set_updated_at() trigger defined in migration 001
--             get_my_brewery_id() helper defined in migration 001
--             brewery_documents table defined in migration 003
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

create table if not exists insurance_policies (
  id                uuid         primary key default gen_random_uuid(),
  brewery_id        uuid         not null references breweries(id) on delete cascade,
  policy_name       text         not null,
  insurance_type    text         not null check (insurance_type in (
    'general_liability',
    'liquor_liability',
    'product_liability',
    'property',
    'workers_compensation',
    'commercial_auto',
    'umbrella',
    'event_liability',
    'equipment_breakdown',
    'cyber_liability',
    'other'
  )),
  carrier_name      text         not null,
  agent_name        text,
  agent_email       text,
  agent_phone       text,
  policy_number     text,
  coverage_amount   numeric(15,2),
  deductible        numeric(15,2),
  premium_amount    numeric(15,2),
  premium_frequency text         check (premium_frequency in (
    'monthly',
    'quarterly',
    'semi_annual',
    'annual'
  )),
  effective_date    date,
  expiration_date   date,
  auto_renews       boolean      not null default false,
  renewal_notes     text,
  -- optional link to an uploaded certificate of insurance in brewery_documents
  document_id       uuid         references brewery_documents(id) on delete set null,
  notes             text         check (char_length(notes) <= 500),
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

create index if not exists insurance_policies_brewery_id_idx
  on insurance_policies(brewery_id);

-- Index on expiration_date so the dashboard alert query stays fast
create index if not exists insurance_policies_expiration_date_idx
  on insurance_policies(expiration_date);

create trigger insurance_policies_updated_at
  before update on insurance_policies
  for each row execute function set_updated_at();

alter table insurance_policies enable row level security;

-- Each brewery can only see and modify their own insurance policies
create policy "Breweries manage their own insurance policies"
  on insurance_policies for all
  using  (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());
