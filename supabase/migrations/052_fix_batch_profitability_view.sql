-- Fix batch_profitability_summary view to use RLS on underlying tables
-- instead of get_my_brewery_id() which caused issues with some user contexts
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
    THEN pr.recipe_cost_per_pint * pr.total_volume_packaged * 124
    ELSE NULL
  END AS total_planned_cost,
  CASE
    WHEN COALESCE(dist.total_revenue, 0) > 0 AND pr.recipe_cost_per_pint IS NOT NULL AND pr.total_volume_packaged > 0
    THEN COALESCE(dist.total_revenue, 0) - (pr.recipe_cost_per_pint * pr.total_volume_packaged * 124)
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
