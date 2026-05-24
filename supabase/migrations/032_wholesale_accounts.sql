-- 032_wholesale_accounts.sql
-- Wholesale Account Manager — Full Suite module.
-- Lightweight CRM that sits alongside the Distribution module.
-- Order history is pulled from distribution_records rather than duplicated here.

create table if not exists wholesale_accounts (
  id                      uuid primary key default gen_random_uuid(),
  brewery_id              uuid not null references breweries(id) on delete cascade,

  -- Core identity
  account_name            text not null,
  account_type            text,            -- Restaurant | Bar | Hotel | Grocery Store | Bottle Shop | Distributor | Chain Account | Event Venue | Other
  status                  text not null default 'active', -- active | inactive | prospect | lost

  -- Contacts — array of { name, email, phone, role, is_primary }
  contacts                jsonb not null default '[]'::jsonb,

  -- Address
  address                 text,
  city                    text,
  state                   text,
  zip                     text,

  -- Sales management
  territory               text,
  assigned_rep            text,
  account_since           date,
  payment_terms           text,            -- Net 15 | Net 30 | Net 45 | COD | Prepaid
  credit_limit            numeric(10,2),

  -- Preferences
  preferred_brands        text,
  delivery_day            text,            -- Monday–Sunday | Multiple | Flexible
  delivery_frequency      text,            -- Weekly | Bi-weekly | Monthly | As needed
  pricing_notes           text,

  -- Relationship
  relationship_notes      text,
  last_contact_date       date,
  next_followup_date      date,

  -- Optional link to distribution_accounts for order history join
  distribution_account_id uuid references distribution_accounts(id) on delete set null,

  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table wholesale_accounts enable row level security;

create policy "brewery members can manage their wholesale accounts"
  on wholesale_accounts for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );

-- ── Contact interaction log ────────────────────────────────────────────────────
-- Each row is one logged touchpoint: a call, visit, email, meeting, etc.

create table if not exists wholesale_contact_log (
  id                  uuid primary key default gen_random_uuid(),
  brewery_id          uuid not null references breweries(id) on delete cascade,
  wholesale_account_id uuid not null references wholesale_accounts(id) on delete cascade,

  contact_date        date not null default current_date,
  contact_person      text,   -- which of the account's contacts was reached
  logged_by           text,   -- brewery rep who made the contact
  notes               text,
  next_followup_date  date,   -- if set, updates the parent account's next_followup_date

  created_at          timestamptz default now()
);

alter table wholesale_contact_log enable row level security;

create policy "brewery members can manage their contact log"
  on wholesale_contact_log for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );

-- Auto-update updated_at on wholesale_accounts
create or replace function update_wholesale_accounts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_wholesale_accounts_updated_at
  before update on wholesale_accounts
  for each row execute function update_wholesale_accounts_updated_at();
