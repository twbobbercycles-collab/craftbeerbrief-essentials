-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 055 — Equipment & Assets Register with Maintenance Tracking
-- Creates three tables: equipment_assets, equipment_maintenance,
-- and equipment_maintenance_schedules. Enables RLS on all three.
-- ─────────────────────────────────────────────────────────────────────────────

-- Equipment/Assets table — one row per physical piece of equipment
CREATE TABLE IF NOT EXISTS equipment_assets (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id               uuid REFERENCES breweries(id) NOT NULL,
  asset_name               text NOT NULL,
  asset_type               text NOT NULL,
  asset_category           text NOT NULL,
  manufacturer             text,
  model_number             text,
  serial_number            text,
  purchase_date            date,
  purchase_price           numeric,
  warranty_expiration_date date,
  location                 text,
  capacity_specs           text,
  vendor_name              text,
  vendor_contact_name      text,
  vendor_phone             text,
  vendor_email             text,
  status                   text DEFAULT 'active',
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

-- Maintenance records — one row per completed maintenance event
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id            uuid REFERENCES breweries(id) NOT NULL,
  asset_id              uuid REFERENCES equipment_assets(id) NOT NULL,
  maintenance_type      text NOT NULL,
  maintenance_date      date NOT NULL,
  performed_by          text,
  description           text NOT NULL,
  parts_replaced        text,
  cost                  numeric,
  next_maintenance_date date,
  passed                boolean DEFAULT true,
  notes                 text,
  created_at            timestamptz DEFAULT now()
);

-- Maintenance schedules — one row per recurring service schedule per asset
CREATE TABLE IF NOT EXISTS equipment_maintenance_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id           uuid REFERENCES breweries(id) NOT NULL,
  asset_id             uuid REFERENCES equipment_assets(id) NOT NULL,
  maintenance_type     text NOT NULL,
  frequency            text NOT NULL,
  frequency_days       integer,
  last_performed_date  date,
  next_due_date        date,
  alert_days_before    integer DEFAULT 14,
  is_active            boolean DEFAULT true,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- RLS policies — users can only access their own brewery's data
ALTER TABLE equipment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment_assets_brewery_access" ON equipment_assets
  FOR ALL USING (brewery_id = get_my_brewery_id());

CREATE POLICY "equipment_maintenance_brewery_access" ON equipment_maintenance
  FOR ALL USING (brewery_id = get_my_brewery_id());

CREATE POLICY "equipment_maintenance_schedules_brewery_access" ON equipment_maintenance_schedules
  FOR ALL USING (brewery_id = get_my_brewery_id());

-- Auto-update updated_at on equipment_assets changes
CREATE TRIGGER equipment_assets_updated_at
  BEFORE UPDATE ON equipment_assets
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Auto-update updated_at on schedule changes
CREATE TRIGGER equipment_maintenance_schedules_updated_at
  BEFORE UPDATE ON equipment_maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Grant full DML to the authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_assets               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_maintenance          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_maintenance_schedules TO authenticated;
