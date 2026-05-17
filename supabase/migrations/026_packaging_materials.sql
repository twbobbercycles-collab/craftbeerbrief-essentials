-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 026 — Packaging Materials + Keg Return Date
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add actual keg return date to distribution_records ────────────────────────
-- keg_return_date (already exists) = expected return date
-- keg_returned_date (new)          = actual date kegs were returned

alter table distribution_records
  add column if not exists keg_returned_date date;

-- ── Packaging Materials ───────────────────────────────────────────────────────
-- Tracks packaging supplies (cans, bottles, kegs, labels, carriers, gas, etc.)
-- separately from brewing ingredients.

create table if not exists packaging_materials (
  id                      uuid        primary key default gen_random_uuid(),
  brewery_id              uuid        not null references breweries(id) on delete cascade,
  name                    text        not null,
  category                text,       -- Cans | Bottles | Kegs | Labels | Carriers | Gas | Cleaning | Other
  specification           text,       -- e.g. 16oz, Half Barrel, Front Label
  stock_unit              text        default 'units',
  current_stock_quantity  numeric     default 0,
  reorder_threshold       numeric,
  reorder_quantity        numeric,
  cost_per_unit           numeric,
  supplier                text,
  notes                   text,
  is_active               boolean     default true,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table packaging_materials enable row level security;

create policy "members can select packaging_materials"
  on packaging_materials for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert packaging_materials"
  on packaging_materials for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update packaging_materials"
  on packaging_materials for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete packaging_materials"
  on packaging_materials for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create or replace function update_packaging_materials_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_packaging_materials_updated_at
  before update on packaging_materials
  for each row execute function update_packaging_materials_updated_at();

create index if not exists idx_packaging_materials_brewery  on packaging_materials(brewery_id);
create index if not exists idx_packaging_materials_category on packaging_materials(brewery_id, category);

-- ── Packaging Material Transactions ──────────────────────────────────────────
-- One row per stock movement: received, used_in_packaging, adjustment, waste.

create table if not exists packaging_material_transactions (
  id                uuid        primary key default gen_random_uuid(),
  brewery_id        uuid        not null references breweries(id) on delete cascade,
  material_id       uuid        not null references packaging_materials(id) on delete cascade,
  transaction_type  text        not null, -- received | used_in_packaging | adjustment | waste
  quantity          numeric     not null, -- positive = added, negative = removed
  reference_type    text,                 -- 'packaging_run'
  reference_id      uuid,                 -- packaging_run_id when used_in_packaging
  notes             text,
  transaction_date  date        default current_date,
  created_at        timestamptz default now()
);

alter table packaging_material_transactions enable row level security;

create policy "members can select pkg_material_transactions"
  on packaging_material_transactions for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert pkg_material_transactions"
  on packaging_material_transactions for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create index if not exists idx_pkg_mat_txn_material on packaging_material_transactions(material_id);
create index if not exists idx_pkg_mat_txn_brewery  on packaging_material_transactions(brewery_id);
create index if not exists idx_pkg_mat_txn_ref      on packaging_material_transactions(reference_id);
