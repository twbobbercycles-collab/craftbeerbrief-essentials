-- =============================================================================
-- Migration 005: Staff Members and Staff Certifications
-- =============================================================================
-- Creates two new tables so brewery owners can track staff roles and
-- certifications (responsible alcohol service, food handler, etc.) with
-- expiration dates and optional links to uploaded documents.
--
-- Depends on: set_updated_at() trigger defined in migration 001
--             get_my_brewery_id() helper defined in migration 001
--             brewery_documents table defined in migration 003
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

-- ── staff_members ─────────────────────────────────────────────────────────────

create table if not exists staff_members (
  id          uuid        primary key default gen_random_uuid(),
  brewery_id  uuid        not null references breweries(id) on delete cascade,
  first_name  text        not null,
  last_name   text        not null,
  role        text        not null check (role in (
    'owner',
    'head_brewer',
    'assistant_brewer',
    'taproom_manager',
    'taproom_staff',
    'sales_representative',
    'operations_manager',
    'other'
  )),
  email       text,
  phone       text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists staff_members_brewery_id_idx
  on staff_members(brewery_id);

create trigger staff_members_updated_at
  before update on staff_members
  for each row execute function set_updated_at();

alter table staff_members enable row level security;

-- Each brewery can only see and modify their own staff members
create policy "Breweries manage their own staff members"
  on staff_members for all
  using  (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());

-- ── staff_certifications ──────────────────────────────────────────────────────

create table if not exists staff_certifications (
  id                    uuid        primary key default gen_random_uuid(),
  brewery_id            uuid        not null references breweries(id) on delete cascade,
  staff_member_id       uuid        not null references staff_members(id) on delete cascade,
  certification_type    text        not null check (certification_type in (
    'responsible_alcohol_service',
    'food_handler',
    'food_manager',
    'cicerone',
    'brewmaster',
    'first_aid',
    'other'
  )),
  certification_name    text        not null,
  issuing_organization  text,
  issue_date            date,
  expiration_date       date,
  certificate_number    text,
  -- optional link to a brewery_documents record (e.g. scanned certificate)
  document_id           uuid        references brewery_documents(id) on delete set null,
  notes                 text        check (char_length(notes) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists staff_certifications_brewery_id_idx
  on staff_certifications(brewery_id);

create index if not exists staff_certifications_staff_member_id_idx
  on staff_certifications(staff_member_id);

-- Index on expiration_date so the dashboard alert query is fast
create index if not exists staff_certifications_expiration_date_idx
  on staff_certifications(expiration_date);

create trigger staff_certifications_updated_at
  before update on staff_certifications
  for each row execute function set_updated_at();

alter table staff_certifications enable row level security;

-- Each brewery can only see and modify their own certification records
create policy "Breweries manage their own staff certifications"
  on staff_certifications for all
  using  (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());
