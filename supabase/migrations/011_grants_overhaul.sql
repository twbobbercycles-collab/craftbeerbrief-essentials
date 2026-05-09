-- =============================================================================
-- Migration 011: Grants Overhaul
-- =============================================================================
-- Wipes existing grant data, adds new metadata columns, updates the
-- program_category check constraint to support the new curated dataset,
-- and adds a unique constraint on external_program_id for future CSV imports.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

-- ── 1. Clear all existing data ────────────────────────────────────────────────

DELETE FROM grants;
DELETE FROM grants_last_sync;

-- ── 2. New metadata columns ───────────────────────────────────────────────────

ALTER TABLE grants
  ADD COLUMN IF NOT EXISTS external_program_id        text,
  ADD COLUMN IF NOT EXISTS brewery_relevance_score    smallint,
  ADD COLUMN IF NOT EXISTS confidence_level           text,
  ADD COLUMN IF NOT EXISTS program_priority_tier      text,
  ADD COLUMN IF NOT EXISTS funding_agency             text,
  ADD COLUMN IF NOT EXISTS government_level           text,
  ADD COLUMN IF NOT EXISTS program_acronym            text,
  ADD COLUMN IF NOT EXISTS acronym_definition         text,
  ADD COLUMN IF NOT EXISTS matching_requirement       text,
  ADD COLUMN IF NOT EXISTS forgivable_loan_eligible   boolean,
  ADD COLUMN IF NOT EXISTS stackable                  boolean,
  ADD COLUMN IF NOT EXISTS application_cycle          text,
  ADD COLUMN IF NOT EXISTS rural_eligible             boolean,
  ADD COLUMN IF NOT EXISTS opportunity_zone_eligible  boolean,
  ADD COLUMN IF NOT EXISTS industry_focus             text,
  ADD COLUMN IF NOT EXISTS business_stage             text,
  ADD COLUMN IF NOT EXISTS maintenance_priority       text,
  ADD COLUMN IF NOT EXISTS next_verification_date     date,
  ADD COLUMN IF NOT EXISTS data_quality_notes         text,
  ADD COLUMN IF NOT EXISTS municipality               text,
  ADD COLUMN IF NOT EXISTS county                     text;

-- ── 3. Unique constraint on external_program_id ───────────────────────────────
-- Allows future CSV imports to use ON CONFLICT (external_program_id) DO UPDATE.
-- NULLs are treated as distinct by PostgreSQL so rows without an ID are allowed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grants_external_program_id_key'
      AND conrelid = 'grants'::regclass
  ) THEN
    ALTER TABLE grants
      ADD CONSTRAINT grants_external_program_id_key UNIQUE (external_program_id);
  END IF;
END $$;

-- ── 4. Updated program_category check constraint ──────────────────────────────
-- Replaces the 10-value snake_case constraint from migration 010 with a broader
-- set that supports the new human-readable curated dataset categories while
-- keeping the old snake_case values for any legacy rows.

ALTER TABLE grants DROP CONSTRAINT IF EXISTS grants_program_category_check;

ALTER TABLE grants
  ADD CONSTRAINT grants_program_category_check
  CHECK (
    program_category IS NULL OR program_category IN (
      -- New curated dataset categories (human-readable)
      'Access to Capital',
      'Brownfield Redevelopment',
      'Building Improvement / Commercial Corridor',
      'Building Reuse / Rural Development',
      'Business Assistance / Redevelopment',
      'Business Expansion / Manufacturing',
      'Commercial Revitalization',
      'Community Development Finance',
      'Economic Development / Infrastructure',
      'Economic Development / Manufacturing',
      'Energy Efficiency / Sustainability',
      'Energy Efficiency / Utility Incentives',
      'Export Assistance',
      'Facade Improvement',
      'Fixed Asset Financing',
      'Historic Preservation',
      'Infrastructure / Economic Development',
      'Redevelopment / Small Business Financing',
      'Rural Business Development',
      'Rural Business Financing',
      'Small Business / Commercial Corridor',
      'Small Business / Creative & Commercial Districts',
      'Small Business / Downtown Development',
      'Small Business / Neighborhood Business',
      'Small Business / Redevelopment',
      'Small Business / Storefront',
      'Small Business Financing',
      'Small Business Support',
      'Startup / Access to Capital',
      'Urban Redevelopment / Small Business Financing',
      -- Legacy snake_case values kept for backwards compatibility
      'federal_sba',
      'federal_usda',
      'federal_other',
      'economic_development',
      'agriculture',
      'tourism',
      'manufacturing',
      'rural_development',
      'local_redevelopment',
      'energy_utility'
    )
  );
