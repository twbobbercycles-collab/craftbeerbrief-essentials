-- =============================================================================
-- Migration 043 — Analytics Dashboard Views
-- Read-only helper views that make analytics queries efficient.
-- No new tables needed — these aggregate existing operational data.
-- =============================================================================


-- ── analytics_monthly_production ─────────────────────────────────────────────
-- Summarises completed brew days by month and beer style.
-- Used for: monthly barrels chart, batch count by style, efficiency trends.

CREATE OR REPLACE VIEW analytics_monthly_production AS
SELECT
  brewery_id,
  DATE_TRUNC('month', brew_date)                                        AS month,
  COUNT(*)                                                              AS batch_count,
  SUM(COALESCE(actual_batch_size, planned_batch_size))                  AS total_barrels,
  AVG(COALESCE(actual_brewhouse_efficiency, target_brewhouse_efficiency)) AS avg_efficiency,
  beer_style
FROM brew_days
WHERE status = 'complete'
GROUP BY brewery_id, DATE_TRUNC('month', brew_date), beer_style;


-- ── analytics_batch_costs ─────────────────────────────────────────────────────
-- Joins brew days → fermentations → packaging runs to build a per-batch cost row.
-- Filtered to the calling user's brewery via get_my_brewery_id() (RLS helper).
-- Used for: cost per pint, planned vs actual, gross margin charts.

CREATE OR REPLACE VIEW analytics_batch_costs AS
SELECT
  bd.brewery_id,
  bd.batch_number,
  bd.recipe_name                  AS beer_name,
  bd.beer_style,
  bd.brew_date,
  bd.actual_brewhouse_efficiency,
  bd.target_brewhouse_efficiency,
  pr.recipe_cost_per_pint,
  pr.volume_from_fermenter,
  pr.actual_splits
FROM brew_days bd
LEFT JOIN fermentations  f  ON f.brew_day_id      = bd.id
LEFT JOIN packaging_runs pr ON pr.fermentation_id  = f.id
WHERE bd.status = 'complete'
  AND bd.brewery_id = get_my_brewery_id();


-- ── analytics_distribution_revenue ───────────────────────────────────────────
-- Monthly revenue and cost roll-up per package type and account from distribution.
-- Used for: revenue by channel, top accounts, keg return metrics.

CREATE OR REPLACE VIEW analytics_distribution_revenue AS
SELECT
  brewery_id,
  DATE_TRUNC('month', delivery_date)          AS month,
  package_type,
  account_name,
  SUM(quantity * sale_price_per_unit)         AS revenue,
  SUM(quantity * ingredient_cost_per_unit)    AS cost,
  SUM(quantity)                               AS units_sold
FROM distribution_records
WHERE delivery_date IS NOT NULL
GROUP BY brewery_id, DATE_TRUNC('month', delivery_date), package_type, account_name;


-- ── Permissions ───────────────────────────────────────────────────────────────
-- Grant SELECT to authenticated role so Supabase JS client can read these views.

GRANT SELECT ON analytics_monthly_production    TO authenticated;
GRANT SELECT ON analytics_batch_costs           TO authenticated;
GRANT SELECT ON analytics_distribution_revenue  TO authenticated;
