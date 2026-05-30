-- =============================================================================
-- Migration 045 — Legislative Tracking
-- Manual bill tracking system with optional LegiScan integration.
-- Users own their data entirely — no shared bill database.
-- =============================================================================


-- ── Add LegiScan API key to users ─────────────────────────────────────────────
-- Stored per-user so each brewery uses their own free LegiScan account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS legiscan_api_key text;


-- ── tracked_bills ─────────────────────────────────────────────────────────────
-- One row per piece of legislation the brewery is monitoring.
-- item_id is a human-readable reference auto-generated on insert (e.g. "2026-PA-001").

CREATE TABLE IF NOT EXISTS tracked_bills (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id           uuid          NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,

  -- Identification
  item_id              text,                                         -- e.g. "2026-PA-001"
  jurisdiction         text          NOT NULL DEFAULT 'State',       -- Federal | State | Local
  state                text,                                         -- two-letter code, e.g. 'PA'
  bill_number          text          NOT NULL,                       -- e.g. 'SB 412'
  short_title          text          NOT NULL,                       -- ≤10 words plain English
  full_description     text,                                         -- 2-3 sentence summary
  bill_url             text,                                         -- link to bill text
  date_introduced      date,
  session_deadline     date,                                         -- date session ends / bill expires
  source               text,                                         -- where they learned about it

  -- LegiScan auto-update fields
  legiscan_bill_id     text,                                         -- numeric bill ID on LegiScan
  legiscan_last_synced timestamptz,                                  -- when status was last auto-synced

  -- Classification
  status               text          DEFAULT 'Monitoring',           -- Introduced | In Committee | Passed Committee | Floor Vote | Signed | Dead | Monitoring
  priority             text          DEFAULT 'C',                    -- A | B | C | D
  business_impact      text          DEFAULT 'Unknown',              -- High | Medium | Low | Unknown
  impact_area          text,                                         -- Taproom | Distribution | Excise Tax | Labeling | Franchise Law | Zoning | Events | Other
  impact_notes         text,                                         -- brewer's own impact analysis notes

  -- Tracking / action fields
  next_key_date        date,                                         -- next hearing, vote, or comment deadline
  next_action          text,
  next_action_owner    text,
  guild_aware          text          DEFAULT 'No',                   -- Yes | No | Notified
  guild_notified_date  date,

  -- Resolution
  closed_date          date,
  notes                text,

  created_at           timestamptz   DEFAULT now(),
  updated_at           timestamptz   DEFAULT now()
);

CREATE TRIGGER tracked_bills_updated_at
  BEFORE UPDATE ON tracked_bills
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Index for the most common query patterns
CREATE INDEX IF NOT EXISTS tracked_bills_brewery_id_idx   ON tracked_bills (brewery_id);
CREATE INDEX IF NOT EXISTS tracked_bills_priority_idx      ON tracked_bills (priority);
CREATE INDEX IF NOT EXISTS tracked_bills_next_key_date_idx ON tracked_bills (next_key_date);
CREATE INDEX IF NOT EXISTS tracked_bills_status_idx        ON tracked_bills (status);

ALTER TABLE tracked_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracked_bills: crud own brewery"
  ON tracked_bills FOR ALL
  USING  (brewery_id = get_my_brewery_id())
  WITH CHECK (brewery_id = get_my_brewery_id());


-- ── bill_actions ──────────────────────────────────────────────────────────────
-- Advocacy action log — one row per action taken on a tracked bill.

CREATE TABLE IF NOT EXISTS bill_actions (
  id           uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id   uuid   NOT NULL REFERENCES breweries(id)    ON DELETE CASCADE,
  bill_id      uuid   NOT NULL REFERENCES tracked_bills(id) ON DELETE CASCADE,

  action_date  date   DEFAULT CURRENT_DATE,
  action_type  text   NOT NULL,   -- Contacted Rep | Testified | Sent Action Alert | Met with Lobbyist | Submitted Comment | Attended Hearing | Coordinated with Guild | Other
  description  text   NOT NULL,
  contact_name text,
  outcome      text,

  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bill_actions_bill_id_idx     ON bill_actions (bill_id);
CREATE INDEX IF NOT EXISTS bill_actions_brewery_id_idx  ON bill_actions (brewery_id);
CREATE INDEX IF NOT EXISTS bill_actions_action_date_idx ON bill_actions (action_date DESC);

ALTER TABLE bill_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bill_actions: crud own brewery"
  ON bill_actions FOR ALL
  USING  (brewery_id = get_my_brewery_id())
  WITH CHECK (brewery_id = get_my_brewery_id());
