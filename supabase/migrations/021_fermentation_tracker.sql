-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 021 — Fermentation Tracker
-- Creates three new tables: fermentation_vessels, fermentations, gravity_readings
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Vessels ──────────────────────────────────────────────────────────────────
-- One row per physical tank, conical, bright tank, barrel, etc.

create table if not exists fermentation_vessels (
  id                      uuid        primary key default gen_random_uuid(),
  brewery_id              uuid        not null references breweries(id) on delete cascade,
  vessel_name             text        not null,
  vessel_type             text        default 'Conical Fermenter',
  capacity                numeric,
  capacity_unit           text        default 'barrels',
  has_temperature_control boolean     default false,
  location                text,
  notes                   text,
  is_active               boolean     default true,
  sort_order              integer     default 0,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table fermentation_vessels enable row level security;

create policy "members can select their vessels"
  on fermentation_vessels for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert vessels"
  on fermentation_vessels for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update vessels"
  on fermentation_vessels for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete vessels"
  on fermentation_vessels for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

-- Auto-update updated_at
create or replace function update_fermentation_vessels_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_fermentation_vessels_updated_at
  before update on fermentation_vessels
  for each row execute function update_fermentation_vessels_updated_at();

-- ── Fermentations ─────────────────────────────────────────────────────────────
-- One row per fermentation batch — created automatically when a brew day is
-- marked complete, or manually from the Fermentation Tracker page.

create table if not exists fermentations (
  id                        uuid        primary key default gen_random_uuid(),
  brewery_id                uuid        not null references breweries(id) on delete cascade,
  brew_day_id               uuid        references brew_days(id) on delete set null,
  recipe_id                 uuid        references recipes(id) on delete set null,
  vessel_id                 uuid        references fermentation_vessels(id) on delete set null,
  batch_number              text,
  beer_name                 text        not null,
  beer_style                text,
  -- status lifecycle: pending_assignment → fermenting → conditioning/lagering → ready_to_package → packaged | dumped
  status                    text        default 'pending_assignment',
  fermentation_type         text        default 'standard',
  volume_in_fermenter       numeric,
  volume_unit               text        default 'barrels',
  target_og                 numeric,
  actual_og                 numeric,
  target_fg                 numeric,
  target_abv                numeric,
  yeast_strain              text,
  yeast_generation          integer     default 1,
  pitch_date                date,
  pitch_temp                numeric,
  fermentation_temp_target  numeric,
  estimated_completion_date date,
  actual_fg                 numeric,
  actual_abv                numeric,
  dry_hop_scheduled         boolean     default false,
  dry_hop_date              date,
  dry_hop_completed         boolean     default false,
  target_packaging_date     date,
  actual_packaging_date     date,
  conditioning_start_date   date,
  lagering_temp_target      numeric,
  lagering_duration_days    integer,
  transfer_notes            text,
  notes                     text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

alter table fermentations enable row level security;

create policy "members can select their fermentations"
  on fermentations for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert fermentations"
  on fermentations for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can update fermentations"
  on fermentations for update
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete fermentations"
  on fermentations for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create or replace function update_fermentations_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_fermentations_updated_at
  before update on fermentations
  for each row execute function update_fermentations_updated_at();

-- ── Gravity Readings ──────────────────────────────────────────────────────────
-- Each row is one measurement taken during fermentation.
-- reading_type allows future extension to pH, DO, turbidity, etc.

create table if not exists gravity_readings (
  id               uuid        primary key default gen_random_uuid(),
  fermentation_id  uuid        not null references fermentations(id) on delete cascade,
  brewery_id       uuid        not null references breweries(id) on delete cascade,
  reading_date     date        not null,
  gravity          numeric     not null,
  temperature      numeric,
  notes            text,
  reading_type     text        default 'gravity',
  created_at       timestamptz default now()
);

alter table gravity_readings enable row level security;

create policy "members can select their gravity readings"
  on gravity_readings for select
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can insert gravity readings"
  on gravity_readings for insert
  with check (brewery_id in (select brewery_id from users where id = auth.uid()));

create policy "members can delete gravity readings"
  on gravity_readings for delete
  using (brewery_id in (select brewery_id from users where id = auth.uid()));

-- Indexes for common query patterns
create index if not exists idx_fermentation_vessels_brewery on fermentation_vessels(brewery_id);
create index if not exists idx_fermentations_brewery on fermentations(brewery_id);
create index if not exists idx_fermentations_vessel on fermentations(vessel_id);
create index if not exists idx_fermentations_brew_day on fermentations(brew_day_id);
create index if not exists idx_gravity_readings_fermentation on gravity_readings(fermentation_id);
