-- =============================================================================
-- Migration 041 — Water Chemistry Calculator
-- Adds source water profile columns to breweries (entered once, shared across recipes)
-- and water chemistry planning columns to recipes (per-recipe targets and additions).
-- =============================================================================


-- ── breweries: source water profile ──────────────────────────────────────────
-- Entered once and reused across all recipes brewed with this water source.

ALTER TABLE breweries
  ADD COLUMN IF NOT EXISTS source_water_name        text,           -- e.g. "Philadelphia Municipal"
  ADD COLUMN IF NOT EXISTS source_water_calcium     numeric DEFAULT 0,   -- Ca mg/L
  ADD COLUMN IF NOT EXISTS source_water_magnesium   numeric DEFAULT 0,   -- Mg mg/L
  ADD COLUMN IF NOT EXISTS source_water_sodium      numeric DEFAULT 0,   -- Na mg/L
  ADD COLUMN IF NOT EXISTS source_water_chloride    numeric DEFAULT 0,   -- Cl mg/L
  ADD COLUMN IF NOT EXISTS source_water_sulfate     numeric DEFAULT 0,   -- SO4 mg/L
  ADD COLUMN IF NOT EXISTS source_water_bicarbonate numeric DEFAULT 0;   -- HCO3 mg/L


-- ── recipes: water chemistry planning ────────────────────────────────────────
-- Stored per-recipe so each beer style can have its own water profile.
-- water_additions is JSONB: { gypsum, calcium_chloride, epsom_salt, baking_soda, chalk } in grams.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS water_target_profile     text,           -- selected style preset name
  ADD COLUMN IF NOT EXISTS water_calcium_target     numeric,        -- Ca target (mg/L midpoint)
  ADD COLUMN IF NOT EXISTS water_magnesium_target   numeric,        -- Mg target (mg/L midpoint)
  ADD COLUMN IF NOT EXISTS water_sodium_target      numeric,        -- Na target (mg/L midpoint)
  ADD COLUMN IF NOT EXISTS water_chloride_target    numeric,        -- Cl target (mg/L midpoint)
  ADD COLUMN IF NOT EXISTS water_sulfate_target     numeric,        -- SO4 target (mg/L midpoint)
  ADD COLUMN IF NOT EXISTS water_bicarbonate_target numeric,        -- HCO3 target (mg/L midpoint)
  ADD COLUMN IF NOT EXISTS water_additions          jsonb;          -- calculated mineral additions
