-- =============================================================================
-- Migration 039 — Excise Tax Calculator
-- Adds annual production estimate and YTD paid columns to breweries, then
-- creates the excise_tax_periods table for period-by-period tax tracking.
--
-- NOTE: ttb_filing_frequency already exists on breweries (migration 008).
-- The new excise_tax_periods.period_type column uses the same values
-- ('monthly', 'quarterly') for the same purpose.
-- =============================================================================


-- ── breweries: add excise tax planning columns ────────────────────────────────

-- Estimated total barrels the brewery expects to produce this calendar year.
-- Used to determine which rate tier applies (small vs. large brewer).
ALTER TABLE breweries
  ADD COLUMN IF NOT EXISTS annual_production_estimate numeric DEFAULT 0;

-- Running total of excise tax dollars already remitted this year.
-- Can be entered manually as a starting point or computed from saved periods.
ALTER TABLE breweries
  ADD COLUMN IF NOT EXISTS excise_tax_ytd_paid numeric DEFAULT 0;


-- =============================================================================
-- TABLE: excise_tax_periods
-- One row per filing period (monthly or quarterly) per brewery.
-- Stores the barrel inputs, calculated tax, and filing status for each period.
--
-- The unique constraint on (brewery_id, period_year, period_number, period_type)
-- means a brewery can only have one record per period — upsert-safe.
-- =============================================================================

CREATE TABLE IF NOT EXISTS excise_tax_periods (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which brewery this period belongs to
  brewery_id                  uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,

  -- The calendar year, e.g. 2026
  period_year                 integer     NOT NULL,

  -- Month number 1–12 (if monthly) or quarter number 1–4 (if quarterly)
  period_number               integer     NOT NULL,

  -- Whether this brewery files monthly or quarterly
  period_type                 text        NOT NULL CHECK (period_type IN ('monthly', 'quarterly')),

  -- ── Barrel inputs ────────────────────────────────────────────────────────
  -- Total barrels brewed during this period (informational only, not taxed)
  barrels_produced            numeric     NOT NULL DEFAULT 0,

  -- Barrels removed for consumption or sale — this IS taxed
  barrels_removed_sale        numeric     NOT NULL DEFAULT 0,

  -- Barrels exported — exempt from federal excise tax
  barrels_removed_export      numeric     NOT NULL DEFAULT 0,

  -- Barrels destroyed (e.g. recalled or disposed) — may be exempt
  barrels_removed_destruction numeric     NOT NULL DEFAULT 0,

  -- Barrels transferred to alternating proprietors — typically exempt
  barrels_transferred         numeric     NOT NULL DEFAULT 0,

  -- ── Calculated values (written by the calculator, read-only after save) ──
  -- The primary rate applied this period ($3.50 or $16.00/bbl)
  tax_rate_applied            numeric,

  -- Total excise tax owed for this period in dollars
  tax_owed                    numeric,

  -- Running total of taxable barrels from Jan 1 through the end of this period
  cumulative_barrels_ytd      numeric,

  -- ── Filing status ─────────────────────────────────────────────────────────
  status                      text        NOT NULL DEFAULT 'estimated'
                                CHECK (status IN ('estimated', 'filed', 'paid')),

  filed_date                  date,       -- Date the return was filed with TTB
  payment_date                date,       -- Date the tax was paid

  notes                       text,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate entries for the same period
  UNIQUE (brewery_id, period_year, period_number, period_type)
);

-- Index for fast lookups by year (used by the YTD summary and history table)
CREATE INDEX IF NOT EXISTS excise_tax_periods_brewery_year_idx
  ON excise_tax_periods (brewery_id, period_year);

-- Auto-update updated_at on every edit
CREATE TRIGGER excise_tax_periods_updated_at
  BEFORE UPDATE ON excise_tax_periods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE excise_tax_periods ENABLE ROW LEVEL SECURITY;

-- Each brewery can only see and modify their own period records
CREATE POLICY "excise_tax_periods: crud own brewery"
  ON excise_tax_periods FOR ALL
  USING  (brewery_id = get_my_brewery_id())
  WITH CHECK (brewery_id = get_my_brewery_id());
