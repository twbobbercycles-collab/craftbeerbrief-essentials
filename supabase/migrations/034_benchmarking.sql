-- 034_benchmarking.sql
-- Creates the taproom_metrics table for the Full Suite Revenue Benchmarking module.
-- Each row represents one calendar month of taproom performance data for a brewery.
-- Computed KPIs (revenue/sqft, labor %, avg transaction, etc.) are derived in the
-- application layer from these raw fields so they stay queryable over time.

create table if not exists taproom_metrics (
  id                    uuid        primary key default gen_random_uuid(),
  brewery_id            uuid        not null references breweries(id) on delete cascade,

  -- First day of the calendar month this row covers (e.g. 2026-05-01)
  metric_month          date        not null,

  -- Core revenue fields
  taproom_revenue       numeric(12,2) not null default 0,
  food_revenue          numeric(12,2) not null default 0,
  merchandise_revenue   numeric(12,2) not null default 0,
  event_revenue         numeric(12,2) not null default 0,

  -- Space — only needs to be entered once; app carries it forward on the UI
  taproom_sqft          numeric(8,2),

  -- Operational metrics
  total_transactions    integer       not null default 0,
  num_operating_days    integer       not null default 0,

  -- Labor
  labor_hours           numeric(8,2)  not null default 0,
  labor_cost            numeric(12,2) not null default 0,

  -- Misc
  notes                 text,

  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

-- Only one row per brewery per calendar month
create unique index if not exists idx_taproom_metrics_brewery_month
  on taproom_metrics(brewery_id, metric_month);

create index if not exists idx_taproom_metrics_brewery_id
  on taproom_metrics(brewery_id);

-- Auto-update updated_at on every row change
create trigger taproom_metrics_updated_at
  before update on taproom_metrics
  for each row execute function set_updated_at();

alter table taproom_metrics enable row level security;

create policy "brewery members can manage their taproom metrics"
  on taproom_metrics for all
  using (
    brewery_id = (select brewery_id from users where id = auth.uid())
  )
  with check (
    brewery_id = (select brewery_id from users where id = auth.uid())
  );
