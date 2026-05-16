-- 014_recipe_builder.sql
-- Creates the Recipe Builder & Cost Calculator tables for the Operations tier.
-- Tables: ingredients, ingredient_suppliers, recipes, recipe_ingredients
-- All tables are scoped per brewery via RLS.

-- ── Helper: auto-update updated_at ───────────────────────────────────────────
-- Assumes update_updated_at_column() was created in 001_initial_schema.sql

-- ── 1. ingredients — shared ingredient library per brewery ───────────────────
CREATE TABLE IF NOT EXISTS ingredients (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id            uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  category              text        CHECK (category IN (
                                      'Malt/Grain','Hops','Yeast','Adjunct','Fruit',
                                      'Spice','Water Treatment','Packaging','Other'
                                    )),
  unit                  text,
  current_price_per_unit numeric(10,4),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredients_brewery_name_unique UNIQUE (brewery_id, name)
);

CREATE TRIGGER set_updated_at_ingredients
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredients_select" ON ingredients FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "ingredients_insert" ON ingredients FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "ingredients_update" ON ingredients FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "ingredients_delete" ON ingredients FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

-- ── 2. ingredient_suppliers — supplier records per ingredient ────────────────
CREATE TABLE IF NOT EXISTS ingredient_suppliers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id         uuid        NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  brewery_id            uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  supplier_name         text        NOT NULL,
  contact_name          text,
  contact_email         text,
  contact_phone         text,
  website_url           text,
  account_number        text,
  price_per_unit        numeric(10,4),
  shipping_cost_per_order numeric(10,2),
  minimum_order_quantity  numeric(10,3),
  minimum_order_unit    text,
  lead_time_days        integer,
  last_ordered_date     date,
  last_ordered_price    numeric(10,4),
  origin_source         text,
  quality_rating        smallint    CHECK (quality_rating BETWEEN 1 AND 5),
  is_preferred          boolean     NOT NULL DEFAULT false,
  notes                 text        CHECK (char_length(notes) <= 500),
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Only one preferred supplier per ingredient per brewery
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_suppliers_preferred_unique
  ON ingredient_suppliers (brewery_id, ingredient_id)
  WHERE is_preferred = true;

CREATE TRIGGER set_updated_at_ingredient_suppliers
  BEFORE UPDATE ON ingredient_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ingredient_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_suppliers_select" ON ingredient_suppliers FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "ingredient_suppliers_insert" ON ingredient_suppliers FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "ingredient_suppliers_update" ON ingredient_suppliers FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "ingredient_suppliers_delete" ON ingredient_suppliers FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

-- ── 3. recipes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id              uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  name                    text        NOT NULL,
  style                   text,
  bjcp_category           text,
  base_batch_size         numeric(10,3) NOT NULL,
  base_batch_size_unit    text        NOT NULL DEFAULT 'barrels',
  description             text,
  target_og               numeric(6,4),
  target_fg               numeric(6,4),
  target_abv              numeric(5,2),
  target_ibu              numeric(6,1),
  target_srm              numeric(5,1),
  overhead_percentage     numeric(5,2) NOT NULL DEFAULT 30,
  target_margin_percentage numeric(5,2) NOT NULL DEFAULT 65,
  tax_rate                numeric(5,2) NOT NULL DEFAULT 0,
  is_archived             boolean     NOT NULL DEFAULT false,
  version                 integer     NOT NULL DEFAULT 1,
  parent_recipe_id        uuid        REFERENCES recipes(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_recipes
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS recipes_brewery_id_idx ON recipes (brewery_id);
CREATE INDEX IF NOT EXISTS recipes_updated_at_idx ON recipes (brewery_id, updated_at DESC);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select" ON recipes FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "recipes_insert" ON recipes FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "recipes_update" ON recipes FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "recipes_delete" ON recipes FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

-- ── 4. recipe_ingredients ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       uuid        NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  brewery_id      uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  ingredient_id   uuid        REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name text        NOT NULL DEFAULT '',
  amount          numeric(12,4) NOT NULL DEFAULT 0,
  unit            text        NOT NULL DEFAULT 'lb',
  scale_with_batch boolean    NOT NULL DEFAULT true,
  addition_type   text        CHECK (addition_type IN (
                                'Mash','Boil','Whirlpool','Dry Hop',
                                'Fermentation','Conditioning','Packaging','Other'
                              )),
  addition_time   text,
  notes           text,
  sort_order      integer     NOT NULL DEFAULT 0,
  supplier_id     uuid        REFERENCES ingredient_suppliers(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_id_idx ON recipe_ingredients (recipe_id);

ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_ingredients_select" ON recipe_ingredients FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "recipe_ingredients_insert" ON recipe_ingredients FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "recipe_ingredients_update" ON recipe_ingredients FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "recipe_ingredients_delete" ON recipe_ingredients FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
