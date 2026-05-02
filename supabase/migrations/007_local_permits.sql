-- =============================================================================
-- Migration 007: Local Permit & Municipal License Tracker
-- =============================================================================
-- Creates the local_permits table so brewery owners can track city, county,
-- and municipal permits with expiration dates, renewal fees, and authority
-- contact info. Includes is_active so superseded permits can be archived
-- without losing the record.
--
-- Depends on: set_updated_at() trigger defined in migration 001
--             get_my_brewery_id() helper defined in migration 001
--             brewery_documents table defined in migration 003
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

create table if not exists local_permits (
  id                       uuid         primary key default gen_random_uuid(),
  brewery_id               uuid         not null references breweries(id) on delete cascade,
  permit_name              text         not null,
  permit_type              text         not null check (permit_type in (
    'business_license',
    'zoning',
    'building',
    'sign_permit',
    'outdoor_seating',
    'live_entertainment',
    'noise_variance',
    'parking',
    'fire_safety',
    'food_service',
    'special_event',
    'sidewalk',
    'other'
  )),
  issuing_authority        text         not null,
  authority_contact_name   text,
  authority_contact_email  text,
  authority_contact_phone  text,
  permit_number            text,
  issue_date               date,
  expiration_date          date,
  auto_renews              boolean      not null default false,
  renewal_fee              numeric(10,2),
  renewal_notes            text,
  -- optional link to an uploaded permit document in brewery_documents
  document_id              uuid         references brewery_documents(id) on delete set null,
  notes                    text         check (char_length(notes) <= 500),
  -- false = archived; allows hiding superseded permits without deleting records
  is_active                boolean      not null default true,
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now()
);

create index if not exists local_permits_brewery_id_idx
  on local_permits(brewery_id);

-- Index used by both the dashboard alert and the page's filter/sort
create index if not exists local_permits_expiration_date_idx
  on local_permits(expiration_date);

create trigger local_permits_updated_at
  before update on local_permits
  for each row execute function set_updated_at();

alter table local_permits enable row level security;

-- Each brewery can only see and modify their own local permits
create policy "Breweries manage their own local permits"
  on local_permits for all
  using  (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());
