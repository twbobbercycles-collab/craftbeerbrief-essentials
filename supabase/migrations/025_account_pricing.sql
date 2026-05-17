-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 025 — Distribution Accounts: per-account pricing by package type
-- Adds a pricing jsonb array column to distribution_accounts.
-- Each element: { package_type, price_per_unit }
-- ─────────────────────────────────────────────────────────────────────────────

alter table distribution_accounts
  add column if not exists pricing jsonb default '[]'::jsonb;
