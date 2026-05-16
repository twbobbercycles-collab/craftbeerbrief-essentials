-- 017_ingredient_inventory.sql
-- Adds full ingredient inventory management to the Operations tier.
-- Expands the ingredients table, then adds:
--   inventory_transactions — every stock movement (receive, use, adjust, waste)
--   purchase_orders        — orders placed with suppliers
--   purchase_order_items   — line items on each purchase order

-- ── Expand ingredients table ──────────────────────────────────────────────────

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS current_stock_quantity  numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_unit              text,
  ADD COLUMN IF NOT EXISTS reorder_threshold       numeric(14,4),
  ADD COLUMN IF NOT EXISTS reorder_quantity        numeric(14,4),
  ADD COLUMN IF NOT EXISTS lead_time_days          integer,
  ADD COLUMN IF NOT EXISTS storage_location        text,
  ADD COLUMN IF NOT EXISTS lot_number              text,
  ADD COLUMN IF NOT EXISTS expiration_date         date,
  ADD COLUMN IF NOT EXISTS is_active               boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_received_date      date,
  ADD COLUMN IF NOT EXISTS last_received_quantity  numeric(14,4),
  ADD COLUMN IF NOT EXISTS last_received_price     numeric(10,4);

-- stock_unit constraint matches the units available in the UI
ALTER TABLE ingredients
  ADD CONSTRAINT ingredients_stock_unit_check CHECK (
    stock_unit IS NULL OR stock_unit IN (
      'lb','oz','g','kg','L','ml','fl oz','Gallon','Barrel','packet','unit','each'
    )
  );

-- ── inventory_transactions ────────────────────────────────────────────────────
-- Every stock movement — positive quantity means stock was added,
-- negative quantity means stock was removed.

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id       uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  ingredient_id    uuid        NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  transaction_type text        NOT NULL CHECK (transaction_type IN (
                                 'received','used_in_brew','adjustment',
                                 'waste','returned','transferred'
                               )),
  quantity         numeric(14,4) NOT NULL,
  unit             text        NOT NULL,
  unit_cost        numeric(10,4),
  total_cost       numeric(12,2),
  reference_type   text        CHECK (reference_type IN (
                                 'recipe','brew_day','purchase_order','manual'
                               )),
  reference_id     uuid,
  reference_name   text,
  lot_number       text,
  notes            text,
  transaction_date date        NOT NULL DEFAULT CURRENT_DATE,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inv_tx_brewery_idx   ON inventory_transactions (brewery_id);
CREATE INDEX IF NOT EXISTS inv_tx_ingredient_idx ON inventory_transactions (brewery_id, ingredient_id);
CREATE INDEX IF NOT EXISTS inv_tx_date_idx      ON inventory_transactions (brewery_id, transaction_date DESC);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_tx_select" ON inventory_transactions FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "inv_tx_insert" ON inventory_transactions FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "inv_tx_update" ON inventory_transactions FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "inv_tx_delete" ON inventory_transactions FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

-- ── purchase_orders ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id             uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  supplier_name          text        NOT NULL,
  order_date             date        NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  actual_delivery_date   date,
  status                 text        NOT NULL DEFAULT 'draft' CHECK (status IN (
                                       'draft','submitted','confirmed',
                                       'partially_received','received','cancelled'
                                     )),
  total_order_cost       numeric(12,2) NOT NULL DEFAULT 0,
  shipping_cost          numeric(10,2) NOT NULL DEFAULT 0,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_purchase_orders
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS po_brewery_idx ON purchase_orders (brewery_id);
CREATE INDEX IF NOT EXISTS po_status_idx  ON purchase_orders (brewery_id, status);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_select" ON purchase_orders FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "po_insert" ON purchase_orders FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "po_update" ON purchase_orders FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "po_delete" ON purchase_orders FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

-- ── purchase_order_items ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   uuid          NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  brewery_id          uuid          NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  ingredient_id       uuid          REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name     text          NOT NULL,
  quantity_ordered    numeric(14,4) NOT NULL,
  unit                text          NOT NULL,
  unit_cost           numeric(10,4) NOT NULL DEFAULT 0,
  total_cost          numeric(12,2) GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
  quantity_received   numeric(14,4) NOT NULL DEFAULT 0,
  lot_number          text,
  notes               text,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poi_po_idx      ON purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS poi_brewery_idx ON purchase_order_items (brewery_id);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poi_select" ON purchase_order_items FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "poi_insert" ON purchase_order_items FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "poi_update" ON purchase_order_items FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

CREATE POLICY "poi_delete" ON purchase_order_items FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
