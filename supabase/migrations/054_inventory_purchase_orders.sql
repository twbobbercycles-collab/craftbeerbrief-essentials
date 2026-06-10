-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 054 — Inventory Purchase Orders (multi-type line items)
-- Adds item_type and packaging_material_id to purchase_order_items so that
-- POs can reference ingredients, packaging materials, and parts/supplies.
-- ─────────────────────────────────────────────────────────────────────────────

-- item_type distinguishes which inventory table the line item belongs to:
--   'ingredient'         → ingredients table (brewing ingredients)
--   'packaging_material' → packaging_materials table
--   'part'               → ingredients table (Parts & Consumables / Lab / Safety)
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'ingredient';

-- packaging_material_id links the line item to a packaging_materials row.
-- NULL for ingredient/part lines (which use ingredient_id instead).
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS packaging_material_id uuid
    REFERENCES packaging_materials(id) ON DELETE SET NULL;

-- Ensure the authenticated role has full DML rights on both tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_orders       TO authenticated;
