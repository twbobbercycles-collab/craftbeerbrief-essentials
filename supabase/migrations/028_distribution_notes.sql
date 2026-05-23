-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 028 — Distribution Notes & Distribution Cost
-- Adds: notes and distribution_cost_per_unit to distribution_records
-- ─────────────────────────────────────────────────────────────────────────────

alter table distribution_records
  add column if not exists notes                      text,
  add column if not exists distribution_cost_per_unit numeric default 0;
