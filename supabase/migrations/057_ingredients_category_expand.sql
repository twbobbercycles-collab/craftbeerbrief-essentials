-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 057 — Expand ingredients.category CHECK constraint
--
-- Migration 014 created the ingredients table with a CHECK constraint limited
-- to the original 9 recipe-builder categories. Migration 053 (inventory
-- overhaul) updated the frontend to use new ingredient categories and added
-- sub_type for parts/lab/safety items, but never updated this constraint.
-- Any insert with a new category (Water Chemistry, Fining Agent, Nutrient,
-- Flavoring/Additive, Other Ingredient, Parts & Consumables, Lab & QC
-- Supplies, Safety Supplies) silently fails the constraint check.
--
-- This migration drops the old constraint and replaces it with one covering
-- all categories the app currently uses, plus legacy values for any existing
-- rows.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ingredients
  DROP CONSTRAINT IF EXISTS ingredients_category_check;

ALTER TABLE ingredients
  ADD CONSTRAINT ingredients_category_check
  CHECK (category IN (
    -- Legacy values from 014 (kept for any existing rows)
    'Malt/Grain', 'Hops', 'Yeast', 'Adjunct', 'Fruit',
    'Spice', 'Water Treatment', 'Packaging', 'Other',
    -- Updated ingredient categories from 053 inventory overhaul
    'Water Chemistry', 'Fining Agent', 'Nutrient', 'Flavoring/Additive', 'Other Ingredient',
    -- Parts & Supplies categories added in 053 (sub_type column)
    'Parts & Consumables', 'Lab & QC Supplies', 'Safety Supplies'
  ));
