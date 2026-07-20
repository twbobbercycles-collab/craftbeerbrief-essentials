-- 066_batch_profitability_actual_cost.sql
-- Fixes batch_profitability_summary.actual_gross_profit, which was costing against the
-- PLANNING baseline (recipe_cost_per_pint) despite its name. That was a reasonable
-- approximation under the pre-Option-A design, where recipe_cost_per_pint was overwritten
-- with a run-specific figure at Mark Complete (so it happened to approximate realized cost).
-- Now that recipe_cost_per_pint is restored to a stable, run-independent planning baseline
-- and actual_cost_per_pint holds the run's realized cost (see PackagingRunDetailPage.jsx's
-- handleMarkComplete and FermentationPage.jsx's ready_to_package handler), this view must
-- switch actual_gross_profit to cost against actual_cost_per_pint — otherwise it silently
-- ignores fermentation/packaging yield loss and overstates profit.
--
-- Two changes from 065, nothing else:
--   1. actual_gross_profit now costs against pr.actual_cost_per_pint instead of
--      pr.recipe_cost_per_pint. NULL propagates (not COALESCEd to the planning baseline) —
--      see rationale below.
--   2. total_actual_cost is a new column, added for symmetry with total_planned_cost and
--      because it's the same expression actual_gross_profit needs internally — exposing it
--      costs nothing and lets the page show "total realized cost" as its own figure later
--      without another migration.
--
-- total_planned_cost is UNCHANGED — it stays on recipe_cost_per_pint, which is correct:
-- it's explicitly the planned figure (recipe_cost_per_pint × packaged pints), used only to
-- derive plannedGrossProfit in BatchProfitabilityPage.jsx. That's a "what would this have
-- cost at the recipe's plan" number and should keep using the plan, not actual.
--
-- NULL handling for actual_gross_profit / total_actual_cost: return NULL when
-- pr.actual_cost_per_pint IS NULL (legacy rows completed before this fix, or a run whose
-- costModelBase couldn't resolve at completion — no recipe link, a query error), rather than
-- COALESCE-ing to recipe_cost_per_pint. Falling back to the planning baseline would silently
-- reintroduce the exact overstatement this migration fixes, just for a smaller set of rows —
-- worse, it would do so invisibly, with no signal that the number is an approximation.
-- BatchProfitabilityPage.jsx already renders NULL as "—" everywhere (fmt$/fmtCurrency) and
-- excludes NULL-cost batches from portfolio aggregates (avgGrossMarginPct, bestBatch) rather
-- than fabricating a number — NULL is the correct signal to send it.
--
-- Reproduces 065's view definition exactly otherwise — every other column, join, and CASE
-- guard is byte-for-byte the same.

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
  -- New in 066: realized cost, costed against actual_cost_per_pint (run-specific, yield-loss
  -- inclusive) rather than recipe_cost_per_pint (planning baseline). NULL when
  -- actual_cost_per_pint hasn't been resolved for this run — see migration header.
  CASE
    WHEN pr.total_volume_packaged > 0 AND pr.actual_cost_per_pint IS NOT NULL
    -- 248 = pints per barrel (31 gal x 128 oz/gal / 16 oz/pint).
    -- Must match PINTS_PER_BARREL in src/pages/recipes/recipeUtils.js.
    THEN pr.actual_cost_per_pint * pr.total_volume_packaged * 248
    ELSE NULL
  END AS total_actual_cost,
  CASE
    WHEN COALESCE(dist.total_revenue, 0) > 0 AND pr.actual_cost_per_pint IS NOT NULL AND pr.total_volume_packaged > 0
    -- 248 = pints per barrel (31 gal x 128 oz/gal / 16 oz/pint).
    -- Must match PINTS_PER_BARREL in src/pages/recipes/recipeUtils.js.
    -- Changed in 066: was pr.recipe_cost_per_pint (planning baseline, wrong for a column
    -- named "actual") — now pr.actual_cost_per_pint (this run's realized cost).
    THEN COALESCE(dist.total_revenue, 0) - (pr.actual_cost_per_pint * pr.total_volume_packaged * 248)
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
