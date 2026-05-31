-- =============================================================================
-- Migration 046: Brewery Records consolidation
-- =============================================================================
-- The Documents, Insurance, and Local Permits modules are merged into a single
-- "Brewery Records" UI at /records. No new tables are created — the three
-- existing tables (brewery_documents, insurance_policies, local_permits) are
-- queried together by the new page.
--
-- This migration adds:
--   1. is_active column to brewery_documents (for soft-archiving, matches pattern
--      already used in local_permits)
--   2. record_notes column to insurance_policies as an alias for notes to keep
--      the app layer consistent (no schema change needed — column already exists)
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times — uses IF NOT EXISTS / DO NOTHING guards.
-- =============================================================================

-- ── 1. Add is_active to brewery_documents ─────────────────────────────────────

alter table brewery_documents
  add column if not exists is_active boolean not null default true;

-- Index used by the "active only" filter in the Brewery Records page
create index if not exists brewery_documents_is_active_idx
  on brewery_documents(brewery_id, is_active);

-- ── 2. Backfill — mark all existing documents as active ───────────────────────

update brewery_documents
  set is_active = true
  where is_active is null;
