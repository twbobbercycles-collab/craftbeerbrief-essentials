-- 033b_training_assignments.sql
-- Adds training_assignments table to the Staff Training & Development module.
-- An assignment records which staff members are expected to complete a given
-- training program, providing a source of truth for compliance reporting.

create table if not exists training_assignments (
  id                        uuid primary key default gen_random_uuid(),
  brewery_id                uuid not null references breweries(id) on delete cascade,
  program_id                uuid not null references training_programs(id) on delete cascade,

  staff_name                text not null,
  staff_role                text,
  assigned_date             date not null default current_date,
  required_completion_date  date,

  -- Lifecycle: assigned → completed (when a matching record exists) | excused | no_show
  status                    text not null default 'assigned', -- assigned | completed | excused | no_show

  notes                     text,
  created_at                timestamptz default now()
);

alter table training_assignments enable row level security;

create policy "brewery members can manage their training assignments"
  on training_assignments for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );

-- Unique constraint prevents double-assigning the same staff to the same program
create unique index if not exists idx_training_assignments_unique
  on training_assignments(brewery_id, program_id, staff_name);
