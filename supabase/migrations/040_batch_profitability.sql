-- =============================================================================
-- Migration 040 — Batch Profitability Summary
-- Creates a VIEW joining brew_days → fermentations → packaging_runs → recipes.
-- No new tables — this is a read-only reporting layer over existing data.
--
-- The WHERE clause filters to the current user's brewery via get_my_brewery_id(),
-- which is the same RLS pattern used throughout the app.
-- =============================================================================

CREATE OR REPLACE VIEW batch_profitability_summary AS
SELECT
  -- Brew day identification
  bd.id                           AS brew_day_id,
  bd.brewery_id,
  bd.batch_number,
  bd.recipe_name                  AS beer_name,
  bd.beer_style,
  bd.brew_date,

  -- Planned targets from the brew day
  bd.planned_batch_size,
  bd.planned_batch_unit,
  bd.target_og,
  bd.target_fg,
  bd.target_brewhouse_efficiency,

  -- Post-brew actuals recorded at the end of brew day
  bd.actual_og,
  bd.actual_brewhouse_efficiency,
  bd.volume_into_fermenter,
  bd.status                       AS brew_day_status,

  -- Fermentation linkage and actuals
  f.id                            AS fermentation_id,
  f.actual_fg,
  f.actual_abv,
  f.status                        AS fermentation_status,

  -- Packaging run production and cost data
  pr.id                           AS packaging_run_id,
  pr.volume_from_fermenter,
  pr.total_volume_packaged,
  pr.packaging_yield_percentage,
  pr.yield_loss_volume,
  pr.recipe_cost_per_pint,        -- estimated cost from recipe builder at time of packaging
  pr.actual_cost_per_pint,        -- recalculated from recipe cost / actual yield in pints
  pr.planned_splits,              -- recipe packaging splits captured when the run was created
  pr.actual_splits,               -- splits actually recorded during the run
  pr.status                       AS packaging_status,

  -- Recipe targets (current recipe values — may differ from original brew targets)
  r.target_margin_percentage,
  r.packaging_splits              AS recipe_packaging_splits

FROM brew_days bd
LEFT JOIN fermentations f   ON f.brew_day_id    = bd.id
LEFT JOIN packaging_runs pr ON pr.fermentation_id = f.id
LEFT JOIN recipes r         ON r.id              = bd.recipe_id
WHERE bd.brewery_id = get_my_brewery_id();

-- Grant read access to authenticated users (Supabase convention for views)
GRANT SELECT ON batch_profitability_summary TO authenticated;
