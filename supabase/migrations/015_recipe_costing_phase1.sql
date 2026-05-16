-- 015_recipe_costing_phase1.sql
-- Expands recipe costing from a single overhead % to a full multi-layer model:
-- packaging, direct labor, utilities, and fixed overhead applied to all direct costs.
-- Also adds per-line shipping allocation fields to recipe_ingredients.

-- ── recipes: new costing columns ─────────────────────────────────────────────
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS packaging_container_type    text,
  ADD COLUMN IF NOT EXISTS packaging_cost_per_unit     numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_cost_per_unit         numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carrier_cost_per_unit       numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brew_hours                  numeric(6,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_rate_per_hour         numeric(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utilities_cost_per_barrel   numeric(8,2)  NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cleaning_cost_per_batch     numeric(8,2)  NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS fixed_overhead_percentage   numeric(5,2)  NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS packaging_yield_percentage  numeric(5,2)  NOT NULL DEFAULT 85;

-- Optional check on container type so the DB rejects unknown values at the source
ALTER TABLE recipes
  ADD CONSTRAINT recipes_packaging_container_type_check CHECK (
    packaging_container_type IS NULL OR packaging_container_type IN (
      'Can 12oz','Can 16oz','Can 19.2oz','Can 32oz',
      'Bottle 12oz','Bottle 22oz','Bottle 750ml',
      'Growler 64oz','Crowler 32oz',
      'Keg Half Barrel','Keg Quarter Barrel','Keg Sixth Barrel',
      'Draft Only'
    )
  );

-- ── recipe_ingredients: shipping allocation fields ────────────────────────────
-- These let brewers record the total order shipping cost and total quantity
-- ordered so the app can allocate a per-unit shipping cost to each ingredient.
ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS order_shipping_cost  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_total_quantity numeric(12,4) NOT NULL DEFAULT 0;
