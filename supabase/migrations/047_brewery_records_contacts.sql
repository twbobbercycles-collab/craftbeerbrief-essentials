-- =============================================================================
-- Migration 047: Brewery Records — drop type constraint + add contacts column
-- =============================================================================
-- The Brewery Records page now uses human-readable document_type values
-- (e.g. 'Federal License', 'COLA & Label Approval') instead of the original
-- snake_case enum. Dropping the CHECK constraint lets both old and new values
-- coexist while the page filters handle both naming conventions.
--
-- Also adds a contacts jsonb column so each record can store an array of
-- contacts: [{name, title, phone, email}].
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (IF EXISTS / IF NOT EXISTS guards).
-- =============================================================================

-- ── 1. Drop the restrictive CHECK constraint ──────────────────────────────────

alter table brewery_documents
  drop constraint if exists brewery_documents_document_type_check;

-- ── 2. Add contacts jsonb column ─────────────────────────────────────────────

alter table brewery_documents
  add column if not exists contacts jsonb not null default '[]'::jsonb;
