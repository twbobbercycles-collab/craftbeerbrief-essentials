-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 053 — Inventory Overhaul
-- Adds supplier contact fields to ingredients and packaging_materials,
-- adds material_type / size_spec to packaging_materials,
-- and adds sub_type to ingredients for parts/lab/safety categories.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── packaging_materials: supplier + type columns ──────────────────────────────

ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_name            text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_contact_name    text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_phone           text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_email           text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_website         text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_account_number  text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_lead_time_days  integer;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_minimum_order_quantity numeric;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS supplier_notes           text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS material_category        text DEFAULT 'Packaging';
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS material_type            text;
ALTER TABLE packaging_materials ADD COLUMN IF NOT EXISTS size_spec                text;

-- ── ingredients: flat supplier fields + sub_type ─────────────────────────────

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_name                    text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_contact_name            text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_phone                   text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_email                   text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_website                 text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_account_number          text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_lead_time_days          integer;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_minimum_order_quantity  numeric;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_notes                   text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS sub_type                         text;

-- ── Ensure authenticated users have full DML rights ───────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON packaging_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ingredients TO authenticated;
