-- 012_subscription_tiers.sql
-- Adds subscription_tier column to users and creates the tier_features lookup table.
-- Run: supabase db push (or apply via Supabase dashboard SQL editor)

-- ── 1. Add subscription_tier column to users ─────────────────────────────────
-- NOT NULL with DEFAULT so existing rows are backfilled automatically.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'essentials'
  CONSTRAINT users_subscription_tier_check
    CHECK (subscription_tier IN ('essentials', 'operations', 'full_suite'));

-- Defensive backfill — the DEFAULT above handles this, but belts and suspenders.
UPDATE users SET subscription_tier = 'essentials' WHERE subscription_tier IS NULL;

-- ── 2. Create tier_features lookup table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tier_features (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key         text        NOT NULL UNIQUE,
  feature_name        text        NOT NULL,
  feature_description text        NOT NULL,
  required_tier       text        NOT NULL
    CONSTRAINT tier_features_required_tier_check
      CHECK (required_tier IN ('essentials', 'operations', 'full_suite')),
  sort_order          integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Seed Operations tier features ─────────────────────────────────────────
INSERT INTO tier_features (feature_key, feature_name, feature_description, required_tier, sort_order)
VALUES
  (
    'recipe_builder',
    'Recipe Builder & Cost Calculator',
    'Build and store recipes, calculate ingredient costs per batch, and see your cost per barrel and cost per pint in real time. Know exactly what each beer costs to make before you brew it.',
    'operations', 1
  ),
  (
    'ingredient_inventory',
    'Ingredient Inventory & Purchase Tracker',
    'Track current inventory levels for hops, malt, yeast, adjuncts, and packaging. Set reorder alerts and maintain a price history across vendors so you always know when costs are creeping up.',
    'operations', 2
  ),
  (
    'brew_day_scheduler',
    'Brew Day Scheduler & Log',
    'Plan brew days on a calendar, attach recipes, and log actual versus expected numbers for every batch. Build a searchable history of every beer you have ever brewed.',
    'operations', 3
  ),
  (
    'fermentation_tracker',
    'Fermentation Tracker',
    'Log fermentation start dates, temperature readings, and gravity measurements at key intervals. Get alerts when batches approach their packaging window.',
    'operations', 4
  ),
  (
    'batch_to_sale',
    'Batch-to-Sale Tracker',
    'Follow every batch from brew day through fermentation, packaging, taproom release, and wholesale movement. See the true profitability of every beer you make.',
    'operations', 5
  ),
  (
    'vendor_price_tracker',
    'Vendor & Supplier Price Tracker',
    'Log and track ingredient prices across multiple vendors over time. Identify your best source for each ingredient and negotiate from a position of knowledge.',
    'operations', 6
  ),
  (
    'draft_line_tracker',
    'Draft Line Profitability Tracker',
    'Monitor which beers on tap generate the best margin after accounting for pour cost, waste, and retail price. Know which handles are making you money.',
    'operations', 7
  )
ON CONFLICT (feature_key) DO NOTHING;

-- ── 4. Seed Full Suite tier features ─────────────────────────────────────────
INSERT INTO tier_features (feature_key, feature_name, feature_description, required_tier, sort_order)
VALUES
  (
    'taproom_event_planner',
    'Taproom Event Planner & ROI Tracker',
    'Plan events, estimate revenue, track actuals, and build a performance history of what event types generate the best return for your taproom.',
    'full_suite', 8
  ),
  (
    'wholesale_account_manager',
    'Wholesale Account Manager',
    'Track wholesale accounts, order history, payment status, and account profitability in one simple dashboard. A lightweight CRM built specifically for brewery sales.',
    'full_suite', 9
  ),
  (
    'staff_training_tracker',
    'Staff Training & Development Tracker',
    'Track training programs, skill development, and advancement for every staff member. Build a stronger team with better documentation of who knows what.',
    'full_suite', 10
  ),
  (
    'revenue_benchmarking',
    'Taproom Revenue Benchmarking Dashboard',
    'Compare your taproom performance against industry benchmarks. Revenue per square foot, labor as a percentage of revenue, and average ticket — all in one view.',
    'full_suite', 11
  ),
  (
    'regulation_playbook',
    'Regulation, Policy & Advocacy Playbook',
    'The complete Craft Beer Brief Regulation, Policy and Advocacy Playbook included as a downloadable PDF. Everything you need to understand the regulatory landscape for craft breweries in one comprehensive resource.',
    'full_suite', 12
  )
ON CONFLICT (feature_key) DO NOTHING;
