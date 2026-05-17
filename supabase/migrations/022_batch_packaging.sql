-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 022 — Batch Packaging & Distribution Log
-- Tables: batch_packages, package_splits, distribution_records, distribution_accounts
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Distribution Accounts ─────────────────────────────────────────────────────
-- Reusable account/customer records for distribution

create table if not exists distribution_accounts (
  id                      uuid        primary key default gen_random_uuid(),
  brewery_id              uuid        not null references breweries(id) on delete cascade,
  account_name            text        not null,
  account_type            text        default 'retailer', -- retailer | restaurant | bar | distributor | taproom | other
  contact_name            text,
  contact_email           text,
  contact_phone           text,
  address                 text,
  preferred_package_types text[],     -- e.g. ['1/2 barrel keg', 'cans 16oz 4-pack']
  payment_terms           text,
  notes                   text,
  is_active               boolean     default true,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table distribution_accounts enable row level security;

create policy "members can select their accounts"
  on distribution_accounts for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert accounts"
  on distribution_accounts for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update accounts"
  on distribution_accounts for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete accounts"
  on distribution_accounts for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create or replace function update_distribution_accounts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_distribution_accounts_updated_at
  before update on distribution_accounts
  for each row execute function update_distribution_accounts_updated_at();

-- ── Batch Packages ────────────────────────────────────────────────────────────
-- One row per packaged batch. Auto-created when fermentation status → 'packaged'.

create table if not exists batch_packages (
  id                          uuid        primary key default gen_random_uuid(),
  brewery_id                  uuid        not null references breweries(id) on delete cascade,
  fermentation_id             uuid        references fermentations(id) on delete set null,
  brew_day_id                 uuid        references brew_days(id) on delete set null,
  batch_number                text        not null,
  beer_name                   text,
  beer_style                  text,
  packaging_date              date,
  total_volume_packaged       numeric,    -- in volume_unit
  volume_unit                 text        default 'barrels',
  total_volume_fermented      numeric,    -- copy of fermentation volume_in_fermenter
  packaging_yield_percentage  numeric     generated always as (
    case
      when total_volume_fermented > 0 and total_volume_packaged is not null
      then round((total_volume_packaged / total_volume_fermented) * 100, 1)
      else null
    end
  ) stored,
  status                      text        default 'draft', -- draft | complete
  packaging_notes             text,
  quality_notes               text,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

alter table batch_packages enable row level security;

create policy "members can select their batch_packages"
  on batch_packages for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert batch_packages"
  on batch_packages for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update batch_packages"
  on batch_packages for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete batch_packages"
  on batch_packages for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create or replace function update_batch_packages_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_batch_packages_updated_at
  before update on batch_packages
  for each row execute function update_batch_packages_updated_at();

-- ── Package Splits ────────────────────────────────────────────────────────────
-- How a batch was split across different container types (kegs, cans, bottles, etc.)

create table if not exists package_splits (
  id                    uuid        primary key default gen_random_uuid(),
  batch_package_id      uuid        not null references batch_packages(id) on delete cascade,
  brewery_id            uuid        not null references breweries(id) on delete cascade,
  package_type          text        not null, -- '1/2 barrel keg' | '1/4 barrel keg' | '1/6 barrel keg' | 'cans 16oz' | 'bottles 22oz' | 'growler' | 'other'
  container_size        numeric,    -- size per unit in the volume_unit of the parent batch
  units_packaged        integer     not null default 0,
  cases_or_bundles      integer,
  units_per_case        integer,
  volume_per_unit       numeric,    -- e.g. 0.5 for a 1/2 bbl keg
  total_volume          numeric,    -- computed: units_packaged * volume_per_unit
  unit_cost             numeric,    -- packaging cost per unit
  total_packaging_cost  numeric,    -- computed: units_packaged * unit_cost
  destination           text,       -- 'taproom' | 'distribution' | 'storage'
  notes                 text,
  created_at            timestamptz default now()
);

alter table package_splits enable row level security;

create policy "members can select their package_splits"
  on package_splits for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert package_splits"
  on package_splits for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update package_splits"
  on package_splits for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete package_splits"
  on package_splits for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

-- ── Distribution Records ──────────────────────────────────────────────────────
-- Each delivery or sale to an account — one row per line item / delivery event

create table if not exists distribution_records (
  id                  uuid        primary key default gen_random_uuid(),
  brewery_id          uuid        not null references breweries(id) on delete cascade,
  batch_package_id    uuid        references batch_packages(id) on delete set null,
  package_split_id    uuid        references package_splits(id) on delete set null,
  account_id          uuid        references distribution_accounts(id) on delete set null,
  account_name        text        not null, -- denormalized so records survive account deletion
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  account_type        text,
  package_type        text,
  quantity            integer     not null default 1,
  delivery_date       date,
  price_per_unit      numeric,
  total_sale_value    numeric     generated always as (
    case
      when price_per_unit is not null then quantity * price_per_unit
      else null
    end
  ) stored,
  returnable_kegs     boolean     default false,
  keg_return_date     date,
  kegs_returned       boolean     default false,
  agreement_notes     text,
  delivery_notes      text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table distribution_records enable row level security;

create policy "members can select their distribution_records"
  on distribution_records for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert distribution_records"
  on distribution_records for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update distribution_records"
  on distribution_records for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete distribution_records"
  on distribution_records for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create or replace function update_distribution_records_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_distribution_records_updated_at
  before update on distribution_records
  for each row execute function update_distribution_records_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists idx_distribution_accounts_brewery on distribution_accounts(brewery_id);
create index if not exists idx_batch_packages_brewery        on batch_packages(brewery_id);
create index if not exists idx_batch_packages_fermentation   on batch_packages(fermentation_id);
create index if not exists idx_package_splits_batch          on package_splits(batch_package_id);
create index if not exists idx_distribution_records_brewery  on distribution_records(brewery_id);
create index if not exists idx_distribution_records_batch    on distribution_records(batch_package_id);
create index if not exists idx_distribution_records_account  on distribution_records(account_id);
