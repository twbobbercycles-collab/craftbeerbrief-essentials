-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 024 — Distribution Accounts: multi-contact support
-- Adds a contacts jsonb array column to distribution_accounts.
-- Each element: { name, title, phone, email, is_primary }
-- ─────────────────────────────────────────────────────────────────────────────

alter table distribution_accounts
  add column if not exists contacts jsonb default '[]'::jsonb;
