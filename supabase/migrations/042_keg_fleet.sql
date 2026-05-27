-- =============================================================================
-- Migration 042 — Keg Fleet Tracker
-- Pool-based keg tracking by type, not individual serial numbers.
--
-- Two tables:
--   keg_fleet           — owned keg counts and deposit rate per size/type
--   keg_deposit_records — manual ledger of deposits held from each account
-- =============================================================================


-- ── keg_fleet ─────────────────────────────────────────────────────────────────
-- One row per keg type per brewery. Tracks total owned and the standard
-- deposit amount the brewery charges per keg of that type.

CREATE TABLE IF NOT EXISTS keg_fleet (
  id             uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id     uuid     NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  keg_type       text     NOT NULL,            -- e.g. 'Half Barrel (15.5 gal)'
  owned_count    integer  DEFAULT 0,           -- total kegs owned of this type
  deposit_amount numeric  DEFAULT 0,           -- deposit charged per keg ($)
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),

  -- Prevent duplicate keg types for the same brewery
  UNIQUE (brewery_id, keg_type)
);

CREATE TRIGGER keg_fleet_updated_at
  BEFORE UPDATE ON keg_fleet
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE keg_fleet ENABLE ROW LEVEL SECURITY;

-- Each brewery can read and write only their own fleet rows
CREATE POLICY "keg_fleet: crud own brewery"
  ON keg_fleet FOR ALL
  USING  (brewery_id = get_my_brewery_id())
  WITH CHECK (brewery_id = get_my_brewery_id());


-- ── keg_deposit_records ────────────────────────────────────────────────────────
-- Manual ledger. Brewery staff log deposits received from accounts when kegs
-- go out, and update/delete records when kegs come back and deposits are refunded.
-- total_deposit_held is computed automatically by the database (kegs_out × deposit_per_keg).

CREATE TABLE IF NOT EXISTS keg_deposit_records (
  id                 uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id         uuid     NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  account_name       text     NOT NULL,        -- which account holds these kegs
  keg_type           text     NOT NULL,        -- must match a keg_fleet.keg_type
  kegs_out           integer  DEFAULT 0,       -- how many kegs this account currently has
  deposit_per_keg    numeric  DEFAULT 0,       -- deposit amount per keg ($)
  total_deposit_held numeric  GENERATED ALWAYS AS (kegs_out * deposit_per_keg) STORED,
  last_updated       date     DEFAULT CURRENT_DATE,
  notes              text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE TRIGGER keg_deposit_records_updated_at
  BEFORE UPDATE ON keg_deposit_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE keg_deposit_records ENABLE ROW LEVEL SECURITY;

-- Each brewery can read and write only their own deposit records
CREATE POLICY "keg_deposit_records: crud own brewery"
  ON keg_deposit_records FOR ALL
  USING  (brewery_id = get_my_brewery_id())
  WITH CHECK (brewery_id = get_my_brewery_id());
