-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 058 — Add excise_tax_rate_per_bbl to recipes
-- Stores the federal excise tax rate per barrel so the recipe cost calculator
-- can display an accurate excise tax estimate without requiring the brewer to
-- re-enter it each session.  Defaults to $3.50 (the reduced rate for small
-- brewers under 2 million barrels annual production).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS excise_tax_rate_per_bbl numeric DEFAULT 3.50;

GRANT SELECT, INSERT, UPDATE, DELETE ON recipes TO authenticated;
