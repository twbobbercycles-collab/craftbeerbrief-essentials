-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 029 — Distribution Records: rename price_per_unit → sale_price_per_unit,
-- add ingredient_cost_per_unit and packaging_cost_per_unit
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the generated column first (its definition references price_per_unit)
alter table distribution_records drop column if exists total_sale_value;

-- Rename the base price column
alter table distribution_records rename column price_per_unit to sale_price_per_unit;

-- Recreate total_sale_value as a generated column using the renamed column
alter table distribution_records
  add column total_sale_value numeric generated always as (
    case
      when sale_price_per_unit is not null
      then quantity * sale_price_per_unit
      else null
    end
  ) stored;

-- Add per-unit cost tracking columns for profit breakdown
alter table distribution_records
  add column if not exists ingredient_cost_per_unit  numeric default 0,
  add column if not exists packaging_cost_per_unit   numeric default 0;
