-- =============================================================================
-- Migration 004: Increase brewery-documents storage bucket limit to 25 MB
-- =============================================================================
-- The bucket was created in migration 003 with a 10 MB file_size_limit.
-- This migration raises it to 25 MB to support larger PDF and document files.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

update storage.buckets
set file_size_limit = 26214400  -- 25 MB in bytes (25 * 1024 * 1024)
where id = 'brewery-documents';
