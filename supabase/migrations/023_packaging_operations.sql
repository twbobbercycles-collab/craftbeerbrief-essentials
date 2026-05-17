-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 023 — Packaging Operations
-- Tables: packaging_runs, packaging_quality_checks
-- Adds: packaging_run_id column to batch_packages
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Packaging Runs ────────────────────────────────────────────────────────────
-- One row per physical packaging run (a session of canning, kegging, or bottling).
-- Auto-created when a fermentation is marked 'ready_to_package'.
-- Marked complete from the Packaging module, which then auto-creates a batch_packages record.

create table if not exists packaging_runs (
  id                          uuid        primary key default gen_random_uuid(),
  brewery_id                  uuid        not null references breweries(id) on delete cascade,
  fermentation_id             uuid        references fermentations(id) on delete set null,
  batch_package_id            uuid,       -- set when marked complete; references batch_packages
  batch_number                text        not null,
  beer_name                   text        not null,
  beer_style                  text,
  packaging_date              date        not null,
  -- status lifecycle: planned → in_progress → complete | cancelled
  status                      text        default 'planned',
  volume_from_fermenter       numeric,    -- actual volume transferred (in volume_unit)
  volume_unit                 text        default 'barrels',
  transfer_date               date,
  transfer_notes              text,
  total_volume_packaged       numeric,    -- sum of actual splits
  packaging_yield_percentage  numeric,    -- (total_volume_packaged / volume_from_fermenter) * 100
  yield_loss_volume           numeric,    -- volume_from_fermenter - total_volume_packaged
  yield_loss_notes            text,       -- free text: trub, spillage, line fill, sampling, etc.
  planned_splits              jsonb,      -- packaging splits pulled from linked recipe at creation time
  actual_splits               jsonb,      -- actual packaging splits recorded during the run
  recipe_cost_per_pint        numeric,    -- estimated cost from recipe builder
  actual_cost_per_pint        numeric,    -- recalculated from recipe cost / actual yield in pints
  notes                       text,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

alter table packaging_runs enable row level security;

create policy "members can select their packaging_runs"
  on packaging_runs for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert packaging_runs"
  on packaging_runs for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update packaging_runs"
  on packaging_runs for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete packaging_runs"
  on packaging_runs for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create or replace function update_packaging_runs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_packaging_runs_updated_at
  before update on packaging_runs
  for each row execute function update_packaging_runs_updated_at();

-- ── Packaging Quality Checks ──────────────────────────────────────────────────
-- One row per QC check performed on a packaging run.
-- Multiple checks can be recorded per run (e.g. start, middle, end of run).

create table if not exists packaging_quality_checks (
  id                  uuid        primary key default gen_random_uuid(),
  packaging_run_id    uuid        not null references packaging_runs(id) on delete cascade,
  brewery_id          uuid        not null references breweries(id) on delete cascade,
  check_date          date        not null,
  checked_by          text,
  -- Appearance
  clarity             text,       -- Bright | Slightly Hazy | Hazy | Very Hazy
  clarity_notes       text,
  appearance_notes    text,
  -- Carbonation
  carbonation_level   text,       -- Under Carbonated | Correct | Over Carbonated
  carbonation_notes   text,
  -- Sensory
  aroma_notes         text,
  flavor_notes        text,
  -- Measurements
  abv_measured        numeric,
  abv_method          text,       -- Refractometer | Hydrometer | Lab Test
  ph_measured         numeric,
  -- Result
  passed_qc           boolean     default true,
  qc_notes            text,
  created_at          timestamptz default now()
);

alter table packaging_quality_checks enable row level security;

create policy "members can select their quality_checks"
  on packaging_quality_checks for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert quality_checks"
  on packaging_quality_checks for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update quality_checks"
  on packaging_quality_checks for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete quality_checks"
  on packaging_quality_checks for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

-- ── Add packaging_run_id to batch_packages ────────────────────────────────────
-- Lets distribution records know which packaging run produced them.

alter table batch_packages
  add column if not exists packaging_run_id uuid references packaging_runs(id) on delete set null;

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists idx_packaging_runs_brewery       on packaging_runs(brewery_id);
create index if not exists idx_packaging_runs_fermentation  on packaging_runs(fermentation_id);
create index if not exists idx_packaging_runs_status        on packaging_runs(brewery_id, status);
create index if not exists idx_quality_checks_run           on packaging_quality_checks(packaging_run_id);
create index if not exists idx_batch_packages_run           on batch_packages(packaging_run_id);
