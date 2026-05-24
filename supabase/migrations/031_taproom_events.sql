-- 031_taproom_events.sql
-- Creates tables for the Full Suite Taproom Event Planner & ROI Tracker module.

-- ── taproom_events ─────────────────────────────────────────────────────────────
-- Stores every event a brewery hosts, with both planning estimates and post-event actuals.

create table if not exists taproom_events (
  id                      uuid primary key default gen_random_uuid(),
  brewery_id              uuid not null references breweries(id) on delete cascade,

  -- Core event info
  event_name              text not null,
  event_type              text,            -- 'Live Music', 'Trivia Night', 'Beer Release', etc.
  event_date              date not null,
  event_start_time        time,
  event_end_time          time,
  status                  text not null default 'planned', -- planned | confirmed | completed | cancelled

  -- Attendance
  expected_attendance     integer,
  actual_attendance       integer,

  -- Ticket revenue (planning)
  ticket_price            numeric(10,2) default 0,
  tickets_sold            integer       default 0,
  ticket_revenue          numeric(10,2) default 0,

  -- Revenue estimates (filled at planning time)
  estimated_beer_revenue  numeric(10,2) default 0,
  estimated_food_revenue  numeric(10,2) default 0,

  -- Revenue actuals (filled after the event)
  actual_beer_revenue     numeric(10,2) default 0,
  actual_food_revenue     numeric(10,2) default 0,
  other_revenue           numeric(10,2) default 0,

  -- Costs (used for both estimated and actual — updated after event as needed)
  entertainment_cost      numeric(10,2) default 0,  -- band, DJ, trivia host, etc.
  marketing_cost          numeric(10,2) default 0,
  staffing_cost           numeric(10,2) default 0,
  supplies_cost           numeric(10,2) default 0,
  other_costs             numeric(10,2) default 0,

  -- Post-event retrospective
  notes                   text,
  lessons_learned         text,
  would_repeat            boolean,
  rating                  smallint check (rating between 1 and 5),

  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table taproom_events enable row level security;

create policy "brewery members can manage their taproom events"
  on taproom_events for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );

-- ── taproom_event_templates ────────────────────────────────────────────────────
-- Reusable event templates so recurring events (e.g. "Friday Trivia") can be
-- scheduled quickly without re-entering the same fields every time.

create table if not exists taproom_event_templates (
  id                          uuid primary key default gen_random_uuid(),
  brewery_id                  uuid not null references breweries(id) on delete cascade,

  template_name               text not null,
  event_type                  text,
  typical_start_time          time,
  typical_duration_hours      numeric(4,1),
  typical_attendance          integer,
  typical_ticket_price        numeric(10,2) default 0,
  typical_entertainment_cost  numeric(10,2) default 0,
  typical_marketing_cost      numeric(10,2) default 0,
  typical_staffing_cost       numeric(10,2) default 0,
  notes                       text,

  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

alter table taproom_event_templates enable row level security;

create policy "brewery members can manage their event templates"
  on taproom_event_templates for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );
