-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 059 — Brewery overhead profile columns
-- Stores labor and overhead defaults on the brewery row so the recipe cost
-- calculator can pre-populate inputs without requiring re-entry each session.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE breweries
  ADD COLUMN IF NOT EXISTS monthly_fixed_overhead    numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS batches_per_month         integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS variable_overhead_per_bbl numeric DEFAULT 15;

GRANT SELECT, INSERT, UPDATE, DELETE ON breweries TO authenticated;
