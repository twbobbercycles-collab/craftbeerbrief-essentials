-- =============================================================================
-- Migration 048: Brewery Records — add metadata jsonb column
-- =============================================================================
-- Adds a metadata jsonb column to brewery_documents so each record can store
-- type-specific details (policy numbers, license numbers, bond info, etc.)
-- as key-value pairs without requiring additional columns per document type.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (IF NOT EXISTS guard).
-- =============================================================================

alter table brewery_documents
  add column if not exists metadata jsonb;
