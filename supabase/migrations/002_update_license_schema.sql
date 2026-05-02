-- =============================================================================
-- Migration 002: Replace license_types with structured license fields
-- =============================================================================
-- Replaces the single license_types text[] column with five purpose-specific
-- fields that capture federal confirmation, state production license type,
-- on-premise sales licenses, off-premise sales licenses, and distribution
-- method separately. This supports more accurate compliance deadline matching.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times — all statements use IF EXISTS / IF NOT EXISTS.
-- =============================================================================

alter table breweries
  -- Remove the old catch-all license array
  drop column if exists license_types,

  -- All commercial breweries hold a Brewer's Notice — confirmed via onboarding
  add column if not exists brewers_notice boolean default true,

  -- Single state-issued production/manufacturer license type (one per brewery)
  add column if not exists production_license_type text,

  -- On-premise retail licenses held (taproom, brewpub/restaurant, patio, etc.)
  add column if not exists on_premise_licenses text[] default '{}',

  -- Off-premise retail licenses held (to-go sales, farmers market, etc.)
  add column if not exists off_premise_licenses text[] default '{}',

  -- How the brewery handles wholesale distribution
  add column if not exists distribution_type text[] default '{}';
