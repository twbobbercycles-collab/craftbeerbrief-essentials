-- =============================================================================
-- Migration 009 — Compliance Calendar
-- Adds new columns to brewery_deadlines for custom deadlines, recurrence,
-- completion tracking, and document linking. Seeds the compliance_deadlines
-- table with federal deadlines that apply to all breweries.
-- =============================================================================

-- ── brewery_deadlines: add missing columns ────────────────────────────────────

-- Name for custom deadlines (pre-populated ones get their name from compliance_deadlines)
alter table brewery_deadlines
  add column if not exists deadline_name text;

-- Category for custom deadlines
alter table brewery_deadlines
  add column if not exists category text;

-- Description for custom deadlines
alter table brewery_deadlines
  add column if not exists description text;

-- Whether and how this deadline repeats
alter table brewery_deadlines
  add column if not exists recurrence text default 'none';

-- Points back to the parent row for recurring copies
alter table brewery_deadlines
  add column if not exists recurrence_parent_id uuid references brewery_deadlines(id) on delete cascade;

-- The original due date before the user edited it (lets Reset work correctly)
alter table brewery_deadlines
  add column if not exists original_date date;

-- Timestamp recorded when the user marks the deadline complete
alter table brewery_deadlines
  add column if not exists completion_date timestamptz;

-- Optional link to a file in brewery_documents
alter table brewery_deadlines
  add column if not exists document_id uuid references brewery_documents(id) on delete set null;

-- Add check constraint so only valid recurrence values are stored
alter table brewery_deadlines
  drop constraint if exists brewery_deadlines_recurrence_check;

alter table brewery_deadlines
  add constraint brewery_deadlines_recurrence_check
  check (recurrence in ('none', 'annually', 'quarterly', 'monthly'));


-- ── compliance_deadlines: seed federal deadlines ──────────────────────────────
-- These rows act as templates. When a brewery first visits the Compliance Calendar
-- the app reads these and inserts year-adjusted rows into brewery_deadlines.
-- state = NULL means "applies to all states".
-- Safe to run again — wrapped in a DO block that checks for existing rows.

do $$
begin
  if not exists (
    select 1 from compliance_deadlines where is_federal = true limit 1
  ) then

    insert into compliance_deadlines
      (state, deadline_name, deadline_date, category, is_federal, description)
    values
      -- ── TTB Excise Tax Returns (quarterly) ────────────────────────────────
      (null, 'TTB Excise Tax Return — Q1',
       '2024-04-14', 'Tax Filing', true,
       'Quarterly federal excise tax return for Q1 (January–March). Due April 14. File at ttb.gov/beer.'),

      (null, 'TTB Excise Tax Return — Q2',
       '2024-07-14', 'Tax Filing', true,
       'Quarterly federal excise tax return for Q2 (April–June). Due July 14. File at ttb.gov/beer.'),

      (null, 'TTB Excise Tax Return — Q3',
       '2024-10-14', 'Tax Filing', true,
       'Quarterly federal excise tax return for Q3 (July–September). Due October 14. File at ttb.gov/beer.'),

      (null, 'TTB Excise Tax Return — Q4',
       '2025-01-14', 'Tax Filing', true,
       'Quarterly federal excise tax return for Q4 (October–December). Due January 14. File at ttb.gov/beer.'),

      -- ── TTB Brewer's Report of Operations (quarterly) ─────────────────────
      (null, 'TTB Brewer''s Report of Operations — Q1',
       '2024-04-15', 'Reporting Requirement', true,
       'Quarterly Brewer''s Report of Operations for Q1 (January–March). Due April 15. Submit via Permits Online at ttb.gov.'),

      (null, 'TTB Brewer''s Report of Operations — Q2',
       '2024-07-15', 'Reporting Requirement', true,
       'Quarterly Brewer''s Report of Operations for Q2 (April–June). Due July 15.'),

      (null, 'TTB Brewer''s Report of Operations — Q3',
       '2024-10-15', 'Reporting Requirement', true,
       'Quarterly Brewer''s Report of Operations for Q3 (July–September). Due October 15.'),

      (null, 'TTB Brewer''s Report of Operations — Q4',
       '2025-01-15', 'Reporting Requirement', true,
       'Quarterly Brewer''s Report of Operations for Q4 (October–December). Due January 15.'),

      -- ── Annual federal deadlines ───────────────────────────────────────────
      (null, 'Federal Business Income Tax Return',
       '2024-04-15', 'Tax Filing', true,
       'Annual federal income tax return. Form 1120 for C-corps, 1120-S for S-corps, or Schedule C for sole proprietors. Due April 15 (extension available).'),

      (null, 'Brewer''s Notice Annual Update',
       '2024-01-31', 'Federal Deadline', true,
       'Review and confirm your Brewer''s Notice information with the TTB is current and accurate. Due January 31 each year. Update at ttb.gov/permits-online.');

  end if;
end;
$$;
