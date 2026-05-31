-- =============================================================================
-- Migration 049: COLA Submissions — add record_type and metadata columns
-- =============================================================================
-- Extends cola_submissions to support the new COLA registry model.
-- record_type stores the specific approval category (COLA, Exemption, Formula,
-- State Brand Registration). metadata jsonb stores COLA-specific tracking
-- fields (cola_number, beer_style, abv, formula info, etc.) without requiring
-- individual columns for each field.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (IF NOT EXISTS guards).
-- =============================================================================

alter table cola_submissions
  add column if not exists record_type text,
  add column if not exists metadata    jsonb;
