-- 065_fix_batch_profitability_pints_per_barrel.sql
-- Fixes a 2x cost/profit error in batch_profitability_summary: the view multiplied
-- recipe_cost_per_pint x total_volume_packaged (barrels) by 124 to get total packaged
-- pints, but 1 barrel = 31 gal x 128 oz/gal / 16 oz/pint = 248 pints, not 124. This is
-- the same bug found and fixed on the JS side (RecipeDetailPage.jsx, RecipesPage.jsx,
-- BatchProfitabilityPage.jsx all used a stray `124` where recipeUtils.js's
-- PINTS_PER_BARREL = 248 was the correct, already-canonical value).
--
-- Reproduces migration 052's view definition exactly, changing ONLY the two
-- `* 124` occurrences (total_planned_cost, actual_gross_profit) to `* 248`.
-- Nothing else in the view changes.
--
-- SQL cannot import a JS constant, so 248 is a literal here. It MUST stay in sync
-- with PINTS_PER_BARREL in src/pages/recipes/recipeUtils.js by hand -- if that
-- constant ever changes, this view needs a matching migration.
--
-- Effect of this fix: total_planned_cost will roughly DOUBLE (it was understated
-- by half), and actual_gross_profit will DECREASE accordingly (it was subtracting
-- an understated cost from revenue, so it was overstated). This is the correct
-- direction -- the old values were wrong, not this fix.

DROP VIEW IF EXISTS batch_profitability_summary;

CREATE OR REPLACE VIEW batch_profitability_summary AS
SELECT
  bd.id AS brew_day_id,
  bd.brewery_id,
  bd.batch_number,
  bd.recipe_name AS beer_name,
  bd.beer_style,
  bd.brew_date,
  bd.planned_batch_size,
  bd.planned_batch_unit,
  bd.target_og,
  bd.target_fg,
  bd.target_brewhouse_efficiency,
  bd.actual_og,
  bd.actual_brewhouse_efficiency,
  bd.volume_into_fermenter,
  bd.status AS brew_day_status,
  f.id AS fermentation_id,
  f.actual_fg,
  f.actual_abv,
  f.status AS fermentation_status,
  pr.id AS packaging_run_id,
  pr.volume_from_fermenter,
  pr.total_volume_packaged,
  pr.packaging_yield_percentage,
  pr.yield_loss_volume,
  pr.recipe_cost_per_pint,
  pr.actual_cost_per_pint,
  pr.planned_splits,
  pr.actual_splits,
  pr.status AS packaging_status,
  bp.id AS batch_package_id,
  r.target_margin_percentage,
  r.packaging_splits AS recipe_packaging_splits,
  COALESCE(dist.total_revenue, 0) AS actual_revenue,
  COALESCE(dist.total_units_sold, 0) AS total_units_sold,
  COALESCE(dist.delivery_count, 0) AS delivery_count,
  CASE
    WHEN pr.total_volume_packaged > 0 AND pr.recipe_cost_per_pint IS NOT NULL
    -- 248 = pints per barrel (31 gal x 128 oz/gal / 16 oz/pint).
    -- Must match PINTS_PER_BARREL in src/pages/recipes/recipeUtils.js.
    THEN pr.recipe_cost_per_pint * pr.total_volume_packaged * 248
    ELSE NULL
  END AS total_planned_cost,
  CASE
    WHEN COALESCE(dist.total_revenue, 0) > 0 AND pr.recipe_cost_per_pint IS NOT NULL AND pr.total_volume_packaged > 0
    -- 248 = pints per barrel (31 gal x 128 oz/gal / 16 oz/pint).
    -- Must match PINTS_PER_BARREL in src/pages/recipes/recipeUtils.js.
    THEN COALESCE(dist.total_revenue, 0) - (pr.recipe_cost_per_pint * pr.total_volume_packaged * 248)
    ELSE NULL
  END AS actual_gross_profit
FROM brew_days bd
LEFT JOIN fermentations f ON f.brew_day_id = bd.id
LEFT JOIN packaging_runs pr ON pr.fermentation_id = f.id
LEFT JOIN batch_packages bp ON bp.fermentation_id = f.id
LEFT JOIN recipes r ON r.id = bd.recipe_id
LEFT JOIN (
  SELECT
    batch_package_id,
    SUM(quantity::numeric * sale_price_per_unit) AS total_revenue,
    SUM(quantity) AS total_units_sold,
    COUNT(*) AS delivery_count
  FROM distribution_records
  WHERE batch_package_id IS NOT NULL
  GROUP BY batch_package_id
) dist ON dist.batch_package_id = bp.id;

GRANT SELECT ON batch_profitability_summary TO authenticated;
