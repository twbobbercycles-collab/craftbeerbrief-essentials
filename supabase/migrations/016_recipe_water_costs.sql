-- 016_recipe_water_costs.sql
-- Adds water and wastewater cost fields to recipes.
-- Also replaces the detailed container type constraint from 015 with a
-- simplified set of container names (size is now entered by the brewer, not encoded in the type).

-- ── New columns ───────────────────────────────────────────────────────────────
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS water_cost_per_barrel      numeric(8,4) NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS wastewater_cost_per_barrel numeric(8,4) NOT NULL DEFAULT 0.30;

-- ── Replace container type check constraint with simplified names ─────────────
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_packaging_container_type_check;

ALTER TABLE recipes
  ADD CONSTRAINT recipes_packaging_container_type_check CHECK (
    packaging_container_type IS NULL OR packaging_container_type IN (
      'Draft Only', 'Can', 'Bottle', 'Growler', 'Crowler',
      'Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel'
    )
  );

-- Migrate any existing rows that used the old size-specific values
-- to their simplified equivalents so existing data stays valid.
UPDATE recipes SET packaging_container_type = 'Can'
  WHERE packaging_container_type IN ('Can 12oz','Can 16oz','Can 19.2oz','Can 32oz');

UPDATE recipes SET packaging_container_type = 'Bottle'
  WHERE packaging_container_type IN ('Bottle 12oz','Bottle 22oz','Bottle 750ml');

UPDATE recipes SET packaging_container_type = 'Growler'
  WHERE packaging_container_type = 'Growler 64oz';

UPDATE recipes SET packaging_container_type = 'Crowler'
  WHERE packaging_container_type = 'Crowler 32oz';
