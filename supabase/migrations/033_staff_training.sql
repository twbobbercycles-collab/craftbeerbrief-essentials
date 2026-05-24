-- 033_staff_training.sql
-- Staff Training & Development Tracker — Full Suite module.
-- Tracks internal training programs and each staff member's completion records.

-- ── training_programs ─────────────────────────────────────────────────────────
-- Library of training courses the brewery offers or requires.

create table if not exists training_programs (
  id                      uuid primary key default gen_random_uuid(),
  brewery_id              uuid not null references breweries(id) on delete cascade,

  program_name            text not null,
  program_type            text,           -- Safety | Compliance | Beer Knowledge | Customer Service | Operations | Leadership | Food Safety | Alcohol Awareness | Equipment | Other
  description             text,
  duration_hours          numeric(5,1),

  -- Required-for tracking
  is_required             boolean not null default false,
  required_for_roles      text,           -- free text, e.g. "taproom_staff, taproom_manager"

  -- Renewal cadence
  renewal_required        boolean not null default false,
  renewal_period_months   integer,        -- e.g. 12 = annual renewal

  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table training_programs enable row level security;

create policy "brewery members can manage their training programs"
  on training_programs for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );

create or replace function update_training_programs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_training_programs_updated_at
  before update on training_programs
  for each row execute function update_training_programs_updated_at();

-- ── staff_training_records ────────────────────────────────────────────────────
-- One row per staff member per training completion event.
-- staff_member_id is optional so training can be logged before the staff member
-- is entered into the staff_members table.

create table if not exists staff_training_records (
  id                  uuid primary key default gen_random_uuid(),
  brewery_id          uuid not null references breweries(id) on delete cascade,

  -- Staff identification (name is always stored; id links to staff_members if available)
  staff_member_id     uuid references staff_members(id) on delete set null,
  staff_name          text not null,
  staff_role          text,

  -- Training link (program_name is denormalized so records survive program deletion)
  program_id          uuid references training_programs(id) on delete set null,
  program_name        text not null,
  program_type        text,

  -- Completion details
  completion_date     date,
  expiration_date     date,

  -- Result
  score               numeric(5,2),
  passed              boolean not null default true,

  -- Logistics
  trainer_name        text,
  certificate_number  text,
  notes               text,

  created_at          timestamptz default now()
);

alter table staff_training_records enable row level security;

create policy "brewery members can manage their training records"
  on staff_training_records for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );

-- Index speeds up expiration dashboard queries
create index if not exists idx_training_records_expiration
  on staff_training_records(brewery_id, expiration_date);
