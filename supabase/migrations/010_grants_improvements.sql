-- =============================================================================
-- Migration 010: Grants Improvements
-- =============================================================================
-- Adds tracking columns to the grants table and creates the grants_last_sync
-- audit table so each sync run is recorded.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

-- ── New columns on grants ─────────────────────────────────────────────────────

alter table grants
  add column if not exists last_reviewed_at     timestamptz,
  add column if not exists data_source_notes    text,
  add column if not exists is_loan              boolean default false,
  add column if not exists is_manually_curated  boolean default false,
  add column if not exists program_category     text,
  add column if not exists contact_info         text;

-- Valid values for program_category (enforced by check constraint)
alter table grants
  drop constraint if exists grants_program_category_check;

alter table grants
  add constraint grants_program_category_check
  check (
    program_category is null or program_category in (
      'economic_development',
      'agriculture',
      'tourism',
      'manufacturing',
      'rural_development',
      'local_redevelopment',
      'energy_utility',
      'federal_sba',
      'federal_usda',
      'federal_other'
    )
  );

-- ── grants_last_sync audit table ──────────────────────────────────────────────

create table if not exists grants_last_sync (
  id             uuid primary key default uuid_generate_v4(),
  sync_type      text not null,        -- 'grants_gov' | 'manual_review'
  synced_at      timestamptz not null default now(),
  grants_added   integer not null default 0,
  grants_updated integer not null default 0,
  notes          text
);

-- All authenticated users can read sync history (useful for admin dashboard)
alter table grants_last_sync enable row level security;

create policy "grants_last_sync: authenticated users can read"
  on grants_last_sync for select
  to authenticated
  using (true);

-- Service role (used by Edge Functions) bypasses RLS for inserts
