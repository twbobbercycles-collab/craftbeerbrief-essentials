-- 018_packaging_splits.sql
-- Adds a packaging_splits JSONB column to recipes so breweries can split
-- one batch across multiple container types (e.g. 60% cans, 40% draft).
--
-- Each entry in the array is an object:
--   {
--     container_type:          text   (e.g. "Can", "Draft/Taproom")
--     percentage:              number (0-100, share of this batch)
--     container_size:          text   (free text, e.g. "16oz")
--     packaging_cost_per_unit: number
--     label_cost_per_unit:     number
--     carrier_cost_per_unit:   number
--     packaging_yield:         number (%, defaults to recipe packaging_yield_percentage)
--   }
--
-- The old packaging_container_type column and its single-value cost columns
-- remain for backward compatibility. When packaging_splits is non-null and
-- non-empty the app uses splits for all cost calculations.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS packaging_splits jsonb;
