-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 027 — Fermentation Stage Settings
-- Adds conditioning and lagering capture fields to the fermentations table.
-- ─────────────────────────────────────────────────────────────────────────────

alter table fermentations
  add column if not exists conditioning_temp_target   numeric,
  add column if not exists conditioning_duration_days integer,
  add column if not exists conditioning_notes         text,
  add column if not exists lagering_temp_target       numeric,
  add column if not exists lagering_duration_days     integer,
  add column if not exists lagering_notes             text,
  add column if not exists lagering_start_date        date;
