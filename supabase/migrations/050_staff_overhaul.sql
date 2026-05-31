-- =============================================================================
-- Migration 050: Staff & Certifications Overhaul
-- =============================================================================
-- Extends staff_members with employment type, status, dates, emergency contact,
-- and notes. Extends staff_certifications with provider, completion date,
-- renewal tracking, and per-record status.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (IF NOT EXISTS guards).
-- =============================================================================

-- ── staff_members: new columns ────────────────────────────────────────────────

ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'full_time';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS notes text;

-- Sync old is_active boolean into the new status column for existing rows.
-- Rows where is_active = false get status = 'inactive'.
-- New rows default to 'active' via the column default above.
UPDATE staff_members
   SET status = 'inactive'
 WHERE is_active = false
   AND (status = 'active' OR status IS NULL);

-- ── staff_certifications: new columns ────────────────────────────────────────

ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS certification_provider text;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS certificate_number text;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS completion_date date;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS expiration_date date;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS renewal_required boolean DEFAULT false;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS renewal_period_months integer;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
