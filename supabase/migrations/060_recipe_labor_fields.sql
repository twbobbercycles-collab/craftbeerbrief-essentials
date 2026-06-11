-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 060 — Per-recipe labor fields
-- Stores brew and packaging labor inputs on the recipe row so they persist
-- across tab switches and browser sessions without requiring re-entry.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS brewers_count         integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS brew_hours_per_brewer numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS packaging_hours       numeric DEFAULT 4,
  ADD COLUMN IF NOT EXISTS packaging_labor_rate  numeric DEFAULT 16;

GRANT SELECT, INSERT, UPDATE, DELETE ON recipes TO authenticated;
