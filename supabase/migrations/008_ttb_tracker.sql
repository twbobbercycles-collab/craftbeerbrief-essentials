-- =============================================================================
-- Migration 008 — TTB Filing & Excise Tax Tracker
-- Adds filing frequency to breweries, fills in missing columns on existing TTB
-- tables, and creates two new tables for filing period tracking and monthly
-- production reports.
-- =============================================================================

-- ── breweries: add filing frequency preference ────────────────────────────────
alter table breweries
  add column if not exists ttb_filing_frequency text
    check (ttb_filing_frequency in ('monthly', 'quarterly', 'annual'));


-- ── ttb_filings: add columns that the original schema was missing ─────────────

-- Tax rate per barrel that was used when this payment was calculated
alter table ttb_filings
  add column if not exists tax_rate numeric default 3.50;

-- How the payment was remitted to the TTB
alter table ttb_filings
  add column if not exists payment_method text;  -- 'eft_ach', 'check', 'other'

-- Human-readable period label, e.g. "Q2 2026" or "June 2026"
alter table ttb_filings
  add column if not exists period_label text;

-- Optional notes the brewery wants to attach to this payment record
alter table ttb_filings
  add column if not exists notes text;


-- ── cola_submissions: add columns that the original schema was missing ────────

-- The brand name as it appears on the label (may differ from the beer name)
alter table cola_submissions
  add column if not exists brand_name text;

-- Container format, e.g. '12oz Can', 'Draft/Keg'
alter table cola_submissions
  add column if not exists container_size text;

-- Date the TTB issued the approval (populated when status = 'approved')
alter table cola_submissions
  add column if not exists approval_date date;

-- Reason the TTB rejected the label (populated when status = 'rejected')
alter table cola_submissions
  add column if not exists rejection_reason text;


-- ── ttb_filing_periods: tracks whether each period has been marked as filed ───
-- One row is created (or upserted) when the brewery clicks "Mark as Filed"
-- on the Filing Dashboard. The unique constraint on (brewery_id, period_start,
-- period_end) prevents duplicate rows for the same period.
create table if not exists ttb_filing_periods (
  id               uuid primary key default uuid_generate_v4(),
  brewery_id       uuid not null references breweries(id) on delete cascade,
  period_label     text not null,
  period_start     date not null,
  period_end       date not null,
  filing_frequency text not null,            -- 'monthly', 'quarterly', 'annual'
  status           text not null default 'open',  -- 'open', 'filed'
  filed_date       date,                     -- Date the brewery marked it filed
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (brewery_id, period_start, period_end)
);

alter table ttb_filing_periods enable row level security;

create policy "ttb_filing_periods: crud own brewery"
  on ttb_filing_periods for all
  using  (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());


-- ── brewers_report_logs: monthly production reports required by the TTB ───────
-- report_month is stored as the first day of the month (YYYY-MM-01).
create table if not exists brewers_report_logs (
  id               uuid primary key default uuid_generate_v4(),
  brewery_id       uuid not null references breweries(id) on delete cascade,
  report_month     date not null,            -- Always stored as YYYY-MM-01
  barrels_brewed   numeric,
  barrels_packaged numeric,
  barrels_on_hand  numeric,
  barrels_removed  numeric,
  submission_date  date,
  status           text not null default 'draft',  -- 'draft', 'submitted', 'overdue'
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (brewery_id, report_month)
);

alter table brewers_report_logs enable row level security;

create policy "brewers_report_logs: crud own brewery"
  on brewers_report_logs for all
  using  (brewery_id = get_my_brewery_id())
  with check (brewery_id = get_my_brewery_id());
