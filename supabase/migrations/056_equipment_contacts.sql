-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 056 — Add contacts jsonb column to equipment_assets
-- Replaces the four flat vendor contact columns with a flexible jsonb array
-- so users can store multiple contacts per asset (primary, service rep, etc.).
-- The old vendor_name column is kept as the company name field.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE equipment_assets
  ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]'::jsonb;

-- Re-grant to ensure authenticated role has full DML on the updated table
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_assets TO authenticated;
