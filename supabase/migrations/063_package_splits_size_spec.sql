-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 063 — Package Splits Size Spec
-- Adds a nullable size_spec column to package_splits, matching the same
-- pattern as migration 062 for distribution_records: size tracked separately
-- from package_type, per the packaging split shape introduced in Phase 2
-- Checkpoint 1 (bare package_type + size_spec).
-- Nullable: existing rows keep package_type as the old combined "type+size"
-- string (e.g. "16oz Cans") with size_spec left NULL — no backfill performed
-- in this migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE package_splits ADD COLUMN IF NOT EXISTS size_spec text;
