-- 019_cleanup_recipe_ingredients.sql
-- Removes procurement tracking columns from recipe_ingredients.
-- Ingredient shipping and receiving costs are now tracked exclusively through
-- inventory_transactions and purchase_orders (see migration 017).

ALTER TABLE recipe_ingredients
  DROP COLUMN IF EXISTS order_shipping_cost,
  DROP COLUMN IF EXISTS order_total_quantity;
