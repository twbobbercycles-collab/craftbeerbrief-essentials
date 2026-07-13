-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 064 — Analytics Distribution Revenue: Size Spec
-- Re-creates analytics_distribution_revenue (originally from migration 043) to
-- include size_spec in both the SELECT and GROUP BY, so revenue no longer
-- collapses different sizes of the same package_type into one row now that
-- size lives in a separate column (062 backfill) instead of being embedded in
-- package_type. CREATE OR REPLACE VIEW — migration 043 itself is untouched.
--
-- size_spec is appended at the end of the SELECT list rather than placed next
-- to package_type: Postgres's CREATE OR REPLACE VIEW requires existing output
-- columns to keep their exact name/order/type, and only allows new columns to
-- be added at the end — inserting it earlier would fail with "cannot change
-- name of view column ...". GROUP BY column order has no such restriction.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW analytics_distribution_revenue AS
SELECT
  brewery_id,
  DATE_TRUNC('month', delivery_date)          AS month,
  package_type,
  account_name,
  SUM(quantity * sale_price_per_unit)         AS revenue,
  SUM(quantity * ingredient_cost_per_unit)    AS cost,
  SUM(quantity)                               AS units_sold,
  size_spec
FROM distribution_records
WHERE delivery_date IS NOT NULL
GROUP BY brewery_id, DATE_TRUNC('month', delivery_date), package_type, account_name, size_spec;
