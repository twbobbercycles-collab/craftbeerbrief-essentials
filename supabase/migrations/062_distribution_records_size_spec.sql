-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 062 — Distribution Records Size Spec
-- Adds a nullable size_spec column to distribution_records so size can be
-- tracked separately from package_type, matching the packaging split shape
-- introduced in Phase 2 Checkpoint 1 (bare package_type + size_spec).
-- Nullable: existing rows keep package_type as the old combined "type+size"
-- string (e.g. "Can 16oz") with size_spec left NULL — no backfill performed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE distribution_records ADD COLUMN IF NOT EXISTS size_spec text;
