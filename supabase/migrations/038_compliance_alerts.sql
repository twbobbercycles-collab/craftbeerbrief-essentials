-- =============================================================================
-- Migration 038 — Compliance Alert Email Logs
-- Adds an opt-out toggle to the users table so breweries can disable email
-- reminders. Adds a logging table that prevents the cron job from sending
-- duplicate alerts to the same user on the same day.
-- =============================================================================


-- ── Add opt-out toggle to users ───────────────────────────────────────────────
-- Defaults to true so all active subscribers receive alerts automatically.
-- A brewery can set this to false in Account Settings → Notifications.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS compliance_alerts_enabled boolean DEFAULT true;


-- =============================================================================
-- TABLE: compliance_alert_logs
-- One row is written each time we successfully email a compliance alert.
-- The unique constraint on (user_id, alert_date) is the duplicate-send guard:
-- if the cron job runs twice on the same day (e.g. after a redeploy) the
-- second INSERT will hit this constraint and we skip that user gracefully.
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_alert_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which user received the alert
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which brewery the alert was for (for admin reporting)
  brewery_id      uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,

  -- The calendar date this alert was sent (not a timestamp, so we can do
  -- simple date equality checks without worrying about time zones)
  alert_date      date        NOT NULL DEFAULT CURRENT_DATE,

  -- How many deadlines were included in the email (for analytics)
  deadlines_count integer     NOT NULL DEFAULT 0,

  -- How many of those were urgent (due within 7 days)
  urgent_count    integer     NOT NULL DEFAULT 0,

  -- The exact moment the email was dispatched
  sent_at         timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate sends on the same calendar day
  UNIQUE (user_id, alert_date)
);


-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE compliance_alert_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own alert history.
-- Useful if we later add a "Last alert sent on X" line to Account Settings.
CREATE POLICY "compliance_alert_logs: users can read own logs"
  ON compliance_alert_logs FOR SELECT
  USING (user_id = auth.uid());
