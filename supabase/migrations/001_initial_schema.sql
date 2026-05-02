-- =============================================================================
-- The Craft Beer Brief Essentials — Initial Database Schema
-- =============================================================================
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query → Run
-- Every table has Row Level Security (RLS) so each brewery only sees its own data.
-- =============================================================================

-- Enable the UUID extension so we can use uuid_generate_v4() for primary keys
create extension if not exists "uuid-ossp";

-- =============================================================================
-- TABLE: breweries
-- One row per brewery. All other tables reference brewery_id back to this table.
-- =============================================================================
create table if not exists breweries (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  state             text not null,
  license_types     text[] default '{}',       -- Array of license type strings from onboarding
  production_volume text,                       -- e.g. 'under_500', '500_1000', etc.
  staff_count       text,                       -- e.g. '1_3', '4_10', etc.
  created_at        timestamptz default now()
);

-- =============================================================================
-- TABLE: users
-- One row per user. Linked to a brewery. Tracks subscription and trial status.
-- Note: Supabase Auth manages passwords — this table stores profile data only.
-- =============================================================================
create table if not exists users (
  id                        uuid primary key references auth.users(id) on delete cascade,
  brewery_id                uuid references breweries(id) on delete cascade,
  email                     text not null,
  role                      text default 'owner',     -- 'owner' or 'staff'
  beehiiv_subscription_id   text,                     -- Returned by Beehiiv API after subscribe
  stripe_customer_id        text,                     -- Stripe customer ID (cus_xxx)
  stripe_subscription_id    text,                     -- Stripe subscription ID (sub_xxx)
  subscription_status       text,                     -- 'active', 'cancelled', 'past_due', null (trial)
  trial_started_at          timestamptz default now(),
  trial_expires_at          timestamptz default (now() + interval '14 days'),
  created_at                timestamptz default now()
);

-- =============================================================================
-- TABLE: compliance_deadlines
-- Pre-populated master list of state and federal deadlines.
-- Shared across all breweries — not brewery-specific.
-- =============================================================================
create table if not exists compliance_deadlines (
  id             uuid primary key default uuid_generate_v4(),
  state          text,                    -- State abbreviation, e.g. 'CA', or 'FEDERAL' for federal
  license_type   text,                    -- Which license this deadline applies to
  deadline_name  text not null,
  deadline_date  date,                    -- The actual due date (can be null for rolling deadlines)
  category       text,                    -- e.g. 'Licensing', 'Excise Tax', 'Reporting'
  is_federal     boolean default false,
  description    text,
  created_at     timestamptz default now()
);

-- =============================================================================
-- TABLE: brewery_deadlines
-- Each brewery's copy of deadlines — links to compliance_deadlines or is custom.
-- is_custom = true means the brewery added this manually (not from the master list).
-- =============================================================================
create table if not exists brewery_deadlines (
  id                      uuid primary key default uuid_generate_v4(),
  brewery_id              uuid not null references breweries(id) on delete cascade,
  compliance_deadline_id  uuid references compliance_deadlines(id) on delete set null,
  custom_date             date,           -- Can override the standard deadline date
  notes                   text,           -- Brewery-specific notes
  is_complete             boolean default false,
  is_custom               boolean default false,  -- True if this was manually added by the brewery
  created_at              timestamptz default now()
);

-- =============================================================================
-- TABLE: ttb_filings
-- One row per TTB excise tax filing period.
-- Tracks production, removal, tax owed, payment, and confirmation number.
-- =============================================================================
create table if not exists ttb_filings (
  id                   uuid primary key default uuid_generate_v4(),
  brewery_id           uuid not null references breweries(id) on delete cascade,
  period_start         date not null,
  period_end           date not null,
  filing_frequency     text,             -- 'monthly', 'quarterly', 'annual'
  barrels_produced     numeric,
  barrels_removed      numeric,          -- Barrels removed for sale — what tax is calculated on
  tax_owed             numeric,          -- Calculated from barrels_removed × tax rate
  payment_date         date,
  payment_amount       numeric,
  confirmation_number  text,             -- TTB-issued confirmation number after payment
  status               text default 'pending',   -- 'pending', 'filed', 'paid'
  created_at           timestamptz default now()
);

-- =============================================================================
-- TABLE: cola_submissions
-- Certificate of Label Approval tracking — one row per beer label submission.
-- =============================================================================
create table if not exists cola_submissions (
  id               uuid primary key default uuid_generate_v4(),
  brewery_id       uuid not null references breweries(id) on delete cascade,
  beer_name        text not null,
  submission_date  date,
  status           text default 'pending',    -- 'pending', 'approved', 'rejected'
  approval_number  text,
  notes            text,
  created_at       timestamptz default now()
);

-- =============================================================================
-- TABLE: ttb_rates
-- Federal excise tax rates per barrel — updated when Congress changes rates.
-- Reference this table when calculating tax_owed in ttb_filings.
-- =============================================================================
create table if not exists ttb_rates (
  id             uuid primary key default uuid_generate_v4(),
  rate_name      text not null,          -- e.g. 'Reduced Rate (first 60k bbl)', 'Standard Rate'
  rate_per_barrel numeric not null,      -- Tax in dollars per barrel
  effective_date  date not null,
  notes           text,
  created_at      timestamptz default now()
);

-- Insert the 2024 federal excise tax rates so they're available immediately
insert into ttb_rates (rate_name, rate_per_barrel, effective_date, notes) values
  ('Reduced Rate — first 60,000 barrels (domestic brewers producing ≤ 2M bbl)', 3.50, '2018-01-01',
   'Applies to domestic brewers producing no more than 2 million barrels annually, on the first 60,000 barrels removed for consumption or sale.'),
  ('Standard Rate — over 60,000 barrels', 18.00, '2018-01-01',
   'Standard rate for all barrels above the reduced rate threshold, or for large brewers.');

-- =============================================================================
-- TABLE: grants
-- Both federal (auto-synced from Grants.gov) and user-submitted state/local grants.
-- approved = true means visible to all users. approved = false = pending review.
-- =============================================================================
create table if not exists grants (
  id                   uuid primary key default uuid_generate_v4(),
  title                text not null,
  description          text,
  eligibility_summary  text,
  funding_type         text,             -- e.g. 'Grant', 'Loan', 'Tax Credit'
  amount_min           numeric,
  amount_max           numeric,
  states_eligible      text[],           -- Array of states, or '{"All States"}'
  status               text default 'open',    -- 'open', 'closed', 'archived'
  application_deadline date,
  application_url      text,
  is_federal           boolean default false,
  source_url           text,
  grant_source         text default 'grants_gov',  -- 'grants_gov' or 'user_submitted'
  external_id          text,             -- Grants.gov opportunity ID — used to detect duplicates
  last_synced_at       timestamptz,
  submitted_by_user_id uuid references users(id) on delete set null,
  approved             boolean default false,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- Index on external_id to make duplicate checking fast
create index if not exists grants_external_id_idx on grants(external_id);
create index if not exists grants_approved_status_idx on grants(approved, status);

-- =============================================================================
-- TABLE: brewery_saved_grants
-- Tracks which grants a brewery has bookmarked.
-- =============================================================================
create table if not exists brewery_saved_grants (
  id             uuid primary key default uuid_generate_v4(),
  brewery_id     uuid not null references breweries(id) on delete cascade,
  grant_id       uuid not null references grants(id) on delete cascade,
  alert_enabled  boolean default false,
  created_at     timestamptz default now(),
  unique(brewery_id, grant_id)            -- Can't save the same grant twice
);


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- This is the security layer that prevents brewery A from reading brewery B's data.
-- Every table that contains brewery data has RLS enabled and a policy.
-- =============================================================================

-- Helper function: returns the brewery_id for the currently logged-in user.
-- We use this in RLS policies so we don't have to repeat the subquery everywhere.
create or replace function get_my_brewery_id()
returns uuid
language sql
security definer    -- Runs as the function creator, not the calling user
stable              -- Result doesn't change within a single query
as $$
  select brewery_id from users where id = auth.uid();
$$;

-- Helper function: returns true if the current user is the admin
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select email = current_setting('app.admin_email', true)
  from users
  where id = auth.uid();
$$;


-- ── breweries ──────────────────────────────────────────────────────────────────
alter table breweries enable row level security;

create policy "breweries: users can read their own brewery"
  on breweries for select
  using (id = get_my_brewery_id());

create policy "breweries: users can update their own brewery"
  on breweries for update
  using (id = get_my_brewery_id());


-- ── users ─────────────────────────────────────────────────────────────────────
alter table users enable row level security;

create policy "users: can read own profile"
  on users for select
  using (id = auth.uid() or brewery_id = get_my_brewery_id());

create policy "users: can update own profile"
  on users for update
  using (id = auth.uid());

-- Allow user rows to be inserted by authenticated users (needed for signup trigger)
create policy "users: insert own profile"
  on users for insert
  with check (id = auth.uid());


-- ── compliance_deadlines ──────────────────────────────────────────────────────
-- This is a shared reference table — all authenticated users can read it.
alter table compliance_deadlines enable row level security;

create policy "compliance_deadlines: authenticated users can read"
  on compliance_deadlines for select
  to authenticated
  using (true);


-- ── brewery_deadlines ─────────────────────────────────────────────────────────
alter table brewery_deadlines enable row level security;

create policy "brewery_deadlines: crud own brewery"
  on brewery_deadlines for all
  using (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());


-- ── ttb_filings ───────────────────────────────────────────────────────────────
alter table ttb_filings enable row level security;

create policy "ttb_filings: crud own brewery"
  on ttb_filings for all
  using (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());


-- ── cola_submissions ──────────────────────────────────────────────────────────
alter table cola_submissions enable row level security;

create policy "cola_submissions: crud own brewery"
  on cola_submissions for all
  using (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());


-- ── ttb_rates ─────────────────────────────────────────────────────────────────
-- Shared reference table — all authenticated users can read
alter table ttb_rates enable row level security;

create policy "ttb_rates: authenticated users can read"
  on ttb_rates for select
  to authenticated
  using (true);


-- ── grants ────────────────────────────────────────────────────────────────────
alter table grants enable row level security;

-- All authenticated users can read approved grants
create policy "grants: read approved grants"
  on grants for select
  to authenticated
  using (approved = true);

-- Users can read their own unapproved submitted grants
create policy "grants: read own pending submissions"
  on grants for select
  using (submitted_by_user_id = auth.uid());

-- Any authenticated user can submit a grant (sets approved=false, goes to queue)
create policy "grants: insert user submission"
  on grants for insert
  to authenticated
  with check (grant_source = 'user_submitted' and approved = false);

-- Admin can do everything on grants (read, insert approved federal grants, approve/reject)
-- We identify admin by checking their email against VITE_ADMIN_EMAIL via the service role
-- The Edge Functions that run syncs and approvals use the service role key, bypassing RLS entirely.


-- ── brewery_saved_grants ──────────────────────────────────────────────────────
alter table brewery_saved_grants enable row level security;

create policy "brewery_saved_grants: crud own brewery"
  on brewery_saved_grants for all
  using (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());


-- =============================================================================
-- DATABASE TRIGGER: auto-create brewery and user profile on signup
-- When a new user signs up via Supabase Auth, this trigger fires and:
--   1. Creates a row in the breweries table using the brewery_name and state they provided
--   2. Creates a row in the users table linked to that brewery with a 14-day trial
-- =============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_brewery_id uuid;
begin
  -- Create the brewery first
  insert into public.breweries (name, state)
  values (
    coalesce(new.raw_user_meta_data->>'brewery_name', 'My Brewery'),
    coalesce(new.raw_user_meta_data->>'state', 'Unknown')
  )
  returning id into new_brewery_id;

  -- Then create the user profile linked to that brewery
  insert into public.users (id, brewery_id, email, role, trial_started_at, trial_expires_at)
  values (
    new.id,
    new_brewery_id,
    new.email,
    'owner',
    now(),
    now() + interval '14 days'
  );

  return new;
end;
$$;

-- Attach the function to fire after every new auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();


-- =============================================================================
-- DATABASE TRIGGER: auto-update grants.updated_at on change
-- =============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger grants_updated_at
  before update on grants
  for each row execute function set_updated_at();
