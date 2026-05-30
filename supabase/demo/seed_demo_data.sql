-- =============================================================================
-- Demo Seed Data — Adaptive Brewing Co.
-- =============================================================================
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Before running, create the demo auth user in Supabase Auth dashboard:
--   Email:    demo@thecraftbeerbrief.com
--   Password: AdaptiveBrew2026!
--
-- This script is idempotent — running it again wipes and reseeds all data.
-- =============================================================================

DO $$
DECLARE
  -- Looked up from auth.users
  v_user_id         uuid;
  v_brewery_id      uuid;

  -- Ingredient IDs (pre-generated so recipe_ingredients can reference them)
  v_ing_pale        uuid := gen_random_uuid();
  v_ing_munich      uuid := gen_random_uuid();
  v_ing_crystal     uuid := gen_random_uuid();
  v_ing_oats        uuid := gen_random_uuid();
  v_ing_centennial  uuid := gen_random_uuid();
  v_ing_cascade     uuid := gen_random_uuid();
  v_ing_citra       uuid := gen_random_uuid();
  v_ing_us05        uuid := gen_random_uuid();

  -- Recipe IDs
  v_recipe_hazy     uuid := gen_random_uuid();
  v_recipe_amber    uuid := gen_random_uuid();

  -- Brew day IDs
  v_brew_hazy       uuid := gen_random_uuid();
  v_brew_amber      uuid := gen_random_uuid();

  -- Fermentation vessel IDs
  v_vessel_1        uuid := gen_random_uuid();
  v_vessel_2        uuid := gen_random_uuid();

  -- Fermentation IDs
  v_ferm_hazy       uuid := gen_random_uuid();
  v_ferm_amber      uuid := gen_random_uuid();

  -- Packaging IDs
  v_pkg_hazy        uuid := gen_random_uuid();
  v_bpkg_hazy       uuid := gen_random_uuid();

  -- Distribution IDs
  v_dist_retailer   uuid := gen_random_uuid();
  v_dist_taproom    uuid := gen_random_uuid();

  -- Staff IDs
  v_staff_marcus    uuid := gen_random_uuid();
  v_staff_sarah     uuid := gen_random_uuid();
  v_staff_jamie     uuid := gen_random_uuid();

  -- Training program IDs
  v_prog_ras        uuid := gen_random_uuid();
  v_prog_fh         uuid := gen_random_uuid();

  -- Legislative bill IDs
  v_bill_sb412      uuid := gen_random_uuid();
  v_bill_hb1205     uuid := gen_random_uuid();

BEGIN
  -- ── 1. Find the demo auth user ─────────────────────────────────────────────
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'demo@thecraftbeerbrief.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Demo auth user not found. Create an auth user with email demo@thecraftbeerbrief.com first.';
  END IF;

  -- ── 2. Get or create the brewery ──────────────────────────────────────────
  SELECT brewery_id INTO v_brewery_id
  FROM public.users
  WHERE id = v_user_id;

  IF v_brewery_id IS NULL THEN
    INSERT INTO public.breweries (name, state, production_volume, staff_count)
    VALUES ('Adaptive Brewing Co.', 'CO', '500_1000', '4_10')
    RETURNING id INTO v_brewery_id;

    INSERT INTO public.users
      (id, brewery_id, email, role, subscription_status, subscription_tier,
       trial_started_at, trial_expires_at)
    VALUES
      (v_user_id, v_brewery_id, 'demo@thecraftbeerbrief.com', 'owner',
       'active', 'full_suite', now(), now() + interval '10 years')
    ON CONFLICT (id) DO UPDATE SET
      subscription_status = 'active',
      subscription_tier   = 'full_suite',
      brewery_id          = EXCLUDED.brewery_id;
  ELSE
    UPDATE public.breweries
       SET name = 'Adaptive Brewing Co.', state = 'CO'
     WHERE id = v_brewery_id;

    UPDATE public.users
       SET subscription_status = 'active',
           subscription_tier   = 'full_suite',
           trial_expires_at    = now() + interval '10 years'
     WHERE id = v_user_id;
  END IF;

  -- ── 3. Wipe existing demo data (reverse FK order) ─────────────────────────
  DELETE FROM bill_actions           WHERE brewery_id = v_brewery_id;
  DELETE FROM tracked_bills          WHERE brewery_id = v_brewery_id;
  DELETE FROM keg_deposit_records    WHERE brewery_id = v_brewery_id;
  DELETE FROM keg_fleet              WHERE brewery_id = v_brewery_id;
  DELETE FROM excise_tax_periods     WHERE brewery_id = v_brewery_id;
  DELETE FROM taproom_metrics        WHERE brewery_id = v_brewery_id;
  DELETE FROM staff_training_records WHERE brewery_id = v_brewery_id;
  DELETE FROM training_programs      WHERE brewery_id = v_brewery_id;
  DELETE FROM staff_certifications   WHERE brewery_id = v_brewery_id;
  DELETE FROM staff_members          WHERE brewery_id = v_brewery_id;
  DELETE FROM wholesale_accounts     WHERE brewery_id = v_brewery_id;
  DELETE FROM taproom_events         WHERE brewery_id = v_brewery_id;
  DELETE FROM distribution_records   WHERE brewery_id = v_brewery_id;
  DELETE FROM package_splits         WHERE brewery_id = v_brewery_id;
  DELETE FROM batch_packages         WHERE brewery_id = v_brewery_id;
  DELETE FROM packaging_runs         WHERE brewery_id = v_brewery_id;
  DELETE FROM distribution_accounts  WHERE brewery_id = v_brewery_id;
  DELETE FROM local_permits          WHERE brewery_id = v_brewery_id;
  DELETE FROM insurance_policies     WHERE brewery_id = v_brewery_id;

  -- gravity_readings has no brewery_id — delete via fermentation_id
  DELETE FROM gravity_readings
  WHERE fermentation_id IN (
    SELECT id FROM fermentations WHERE brewery_id = v_brewery_id
  );
  DELETE FROM fermentations          WHERE brewery_id = v_brewery_id;
  DELETE FROM fermentation_vessels   WHERE brewery_id = v_brewery_id;
  DELETE FROM brew_days              WHERE brewery_id = v_brewery_id;

  -- recipe_ingredients has no brewery_id — delete via recipe_id
  DELETE FROM recipe_ingredients
  WHERE recipe_id IN (
    SELECT id FROM recipes WHERE brewery_id = v_brewery_id
  );
  DELETE FROM recipes    WHERE brewery_id = v_brewery_id;
  DELETE FROM ingredients WHERE brewery_id = v_brewery_id;

  -- ── 4. Ingredients ────────────────────────────────────────────────────────
  INSERT INTO ingredients
    (id, brewery_id, name, category, unit, current_price_per_unit,
     current_stock_quantity, stock_unit, reorder_threshold, is_active)
  VALUES
    (v_ing_pale,       v_brewery_id, 'Pale Malt 2-Row',  'Malt/Grain', 'lb',     0.65, 200, 'lb',     50, true),
    (v_ing_munich,     v_brewery_id, 'Munich Malt',       'Malt/Grain', 'lb',     0.80,  80, 'lb',     25, true),
    (v_ing_crystal,    v_brewery_id, 'Crystal 60L',       'Malt/Grain', 'lb',     0.75,  60, 'lb',     20, true),
    (v_ing_oats,       v_brewery_id, 'Flaked Oats',       'Adjunct',    'lb',     0.70,  40, 'lb',     15, true),
    (v_ing_centennial, v_brewery_id, 'Centennial Hops',   'Hops',       'oz',     2.10,  32, 'oz',      8, true),
    (v_ing_cascade,    v_brewery_id, 'Cascade Hops',      'Hops',       'oz',     1.85,  24, 'oz',      8, true),
    (v_ing_citra,      v_brewery_id, 'Citra Hops',        'Hops',       'oz',     2.75,  48, 'oz',     12, true),
    (v_ing_us05,       v_brewery_id, 'US-05 Dry Yeast',   'Yeast',      'packet', 4.50,  12, 'packet',  4, true);

  -- ── 5. Recipes ────────────────────────────────────────────────────────────
  INSERT INTO recipes
    (id, brewery_id, name, style, base_batch_size, base_batch_size_unit,
     target_og, target_fg, target_abv, target_ibu, target_margin_percentage, version)
  VALUES
    (v_recipe_hazy,  v_brewery_id, 'Adaptive Hazy IPA', 'New England IPA',     5, 'barrels', 1.068, 1.012, 7.4, 45, 62, 1),
    (v_recipe_amber, v_brewery_id, 'Front Range Amber',  'American Amber Ale', 5, 'barrels', 1.055, 1.010, 5.9, 28, 58, 1);

  -- ── 6. Recipe Ingredients — Hazy IPA ──────────────────────────────────────
  INSERT INTO recipe_ingredients
    (brewery_id, recipe_id, ingredient_id, ingredient_name, amount, unit, addition_type)
  VALUES
    (v_brewery_id, v_recipe_hazy, v_ing_pale,  'Pale Malt 2-Row', 120, 'lb',     'Mash'),
    (v_brewery_id, v_recipe_hazy, v_ing_oats,  'Flaked Oats',      30, 'lb',     'Mash'),
    (v_brewery_id, v_recipe_hazy, v_ing_citra, 'Citra Hops',       16, 'oz',     'Whirlpool'),
    (v_brewery_id, v_recipe_hazy, v_ing_citra, 'Citra Hops',       12, 'oz',     'Dry Hop'),
    (v_brewery_id, v_recipe_hazy, v_ing_us05,  'US-05 Dry Yeast',   2, 'packet', 'Fermentation');

  -- ── 7. Recipe Ingredients — Amber Ale ────────────────────────────────────
  INSERT INTO recipe_ingredients
    (brewery_id, recipe_id, ingredient_id, ingredient_name, amount, unit, addition_type)
  VALUES
    (v_brewery_id, v_recipe_amber, v_ing_pale,       'Pale Malt 2-Row',  100, 'lb',     'Mash'),
    (v_brewery_id, v_recipe_amber, v_ing_munich,     'Munich Malt',        20, 'lb',     'Mash'),
    (v_brewery_id, v_recipe_amber, v_ing_crystal,    'Crystal 60L',        15, 'lb',     'Mash'),
    (v_brewery_id, v_recipe_amber, v_ing_centennial, 'Centennial Hops',     8, 'oz',     'Boil'),
    (v_brewery_id, v_recipe_amber, v_ing_cascade,    'Cascade Hops',        6, 'oz',     'Boil'),
    (v_brewery_id, v_recipe_amber, v_ing_us05,       'US-05 Dry Yeast',     2, 'packet', 'Fermentation');

  -- ── 8. Brew Days ──────────────────────────────────────────────────────────
  INSERT INTO brew_days
    (id, brewery_id, batch_number, recipe_id, recipe_name, beer_style, status,
     brew_date, planned_batch_size, planned_batch_unit,
     target_og, target_brewhouse_efficiency,
     actual_og, actual_brewhouse_efficiency, volume_into_fermenter,
     yeast_strain, brewer_name)
  VALUES
    (v_brew_hazy, v_brewery_id, 'ADP-2026-001', v_recipe_hazy,
     'Adaptive Hazy IPA', 'New England IPA', 'completed',
     '2026-03-10', 5, 'barrels', 1.068, 75,
     1.067, 74, 4.8, 'US-05', 'Marcus Reed'),
    (v_brew_amber, v_brewery_id, 'ADP-2026-002', v_recipe_amber,
     'Front Range Amber', 'American Amber Ale', 'completed',
     '2026-04-07', 5, 'barrels', 1.055, 75,
     1.056, 76, 4.9, 'US-05', 'Marcus Reed');

  -- ── 9. Fermentation Vessels ───────────────────────────────────────────────
  INSERT INTO fermentation_vessels
    (id, brewery_id, vessel_name, vessel_type, capacity, capacity_unit, has_temperature_control)
  VALUES
    (v_vessel_1, v_brewery_id, 'Conical A', 'Conical Fermenter', 7, 'barrels', true),
    (v_vessel_2, v_brewery_id, 'Conical B', 'Conical Fermenter', 7, 'barrels', true);

  -- ── 10. Fermentations ─────────────────────────────────────────────────────
  INSERT INTO fermentations
    (id, brewery_id, brew_day_id, vessel_id, batch_number, beer_name,
     status, volume_in_fermenter, actual_og, actual_fg, pitch_date)
  VALUES
    (v_ferm_hazy,  v_brewery_id, v_brew_hazy,  v_vessel_1,
     'ADP-2026-001', 'Adaptive Hazy IPA',
     'packaged', 4.8, 1.067, 1.012, '2026-03-10'),
    (v_ferm_amber, v_brewery_id, v_brew_amber, v_vessel_2,
     'ADP-2026-002', 'Front Range Amber',
     'conditioning', 4.9, 1.056, 1.014, '2026-04-07');

  -- ── 11. Gravity Readings ──────────────────────────────────────────────────
  INSERT INTO gravity_readings (fermentation_id, reading_date, gravity, temperature)
  VALUES
    (v_ferm_hazy,  '2026-03-11', 1.056, 68),
    (v_ferm_hazy,  '2026-03-13', 1.032, 69),
    (v_ferm_hazy,  '2026-03-16', 1.018, 70),
    (v_ferm_hazy,  '2026-03-19', 1.012, 70),
    (v_ferm_amber, '2026-04-08', 1.046, 66),
    (v_ferm_amber, '2026-04-11', 1.028, 68),
    (v_ferm_amber, '2026-04-15', 1.014, 68);

  -- ── 12. Packaging Run — Hazy IPA ──────────────────────────────────────────
  INSERT INTO packaging_runs
    (id, brewery_id, fermentation_id, batch_package_id,
     batch_number, beer_name, beer_style, packaging_date, status,
     volume_from_fermenter, total_volume_packaged, packaging_yield_percentage,
     recipe_cost_per_pint, actual_splits, planned_splits)
  VALUES
    (v_pkg_hazy, v_brewery_id, v_ferm_hazy, v_bpkg_hazy,
     'ADP-2026-001', 'Adaptive Hazy IPA', 'New England IPA',
     '2026-03-24', 'complete',
     4.8, 4.6, 95.8, 0.52,
     '[{"type":"1/2 barrel keg","units":8},{"type":"1/6 barrel keg","units":6}]',
     '[{"type":"1/2 barrel keg","units":8},{"type":"1/6 barrel keg","units":6}]');

  -- ── 13. Batch Package — Hazy IPA ──────────────────────────────────────────
  INSERT INTO batch_packages
    (id, brewery_id, fermentation_id, brew_day_id, batch_number, beer_name,
     beer_style, packaging_date, total_volume_packaged, total_volume_fermented,
     volume_unit, status)
  VALUES
    (v_bpkg_hazy, v_brewery_id, v_ferm_hazy, v_brew_hazy,
     'ADP-2026-001', 'Adaptive Hazy IPA', 'New England IPA',
     '2026-03-24', 4.6, 4.8, 'barrels', 'complete');

  -- ── 14. Package Splits ────────────────────────────────────────────────────
  INSERT INTO package_splits
    (batch_package_id, brewery_id, package_type, units_packaged,
     volume_per_unit, total_volume, destination)
  VALUES
    (v_bpkg_hazy, v_brewery_id, '1/2 barrel keg', 8, 0.5000, 4.0, 'distribution'),
    (v_bpkg_hazy, v_brewery_id, '1/6 barrel keg', 6, 0.1667, 1.0, 'taproom');

  -- ── 15. Distribution Accounts ─────────────────────────────────────────────
  INSERT INTO distribution_accounts
    (id, brewery_id, account_name, account_type, contact_name,
     contact_email, payment_terms, is_active)
  VALUES
    (v_dist_retailer, v_brewery_id, 'Denver Natural Grocers', 'retailer',
     'Jill Harmon', 'jill@example-dng.com', 'net_30', true),
    (v_dist_taproom,  v_brewery_id, 'Adaptive Taproom (in-house)', 'taproom',
     NULL, NULL, NULL, true);

  -- ── 16. Distribution Records ──────────────────────────────────────────────
  INSERT INTO distribution_records
    (brewery_id, batch_package_id, account_id, account_name, account_type,
     package_type, quantity, delivery_date, price_per_unit, returnable_kegs)
  VALUES
    (v_brewery_id, v_bpkg_hazy, v_dist_retailer,
     'Denver Natural Grocers', 'retailer',
     '1/2 barrel keg', 8, '2026-03-26', 175.00, true);

  -- ── 17. Taproom Events ────────────────────────────────────────────────────
  INSERT INTO taproom_events
    (brewery_id, event_name, event_type, event_date, status,
     expected_attendance, actual_attendance,
     estimated_beer_revenue, actual_beer_revenue,
     entertainment_cost, marketing_cost, staffing_cost, notes)
  VALUES
    (v_brewery_id, 'Spring Brew Fest', 'beer_festival', '2026-04-19', 'completed',
     200, 187, 4800, 4250, 500, 200, 600,
     'Great turnout; ran out of Hazy IPA by 4pm'),
    (v_brewery_id, 'Trivia Night — May', 'recurring', '2026-05-14', 'confirmed',
     60, NULL, 900, NULL, 100, 50, 300, NULL);

  -- ── 18. Wholesale Accounts ────────────────────────────────────────────────
  INSERT INTO wholesale_accounts
    (brewery_id, account_name, account_type, status,
     contacts, last_contact_date, next_followup_date)
  VALUES
    (v_brewery_id, 'Mountain West Distributors', 'distributor', 'active',
     '[{"name":"Tom Vasquez","phone":"303-555-0198","email":"tom@mwdist.example"}]',
     '2026-05-01', '2026-06-01'),
    (v_brewery_id, 'Denver Natural Grocers', 'retailer', 'active',
     '[{"name":"Jill Harmon","phone":"303-555-0102","email":"jill@example-dng.com"}]',
     '2026-04-28', '2026-05-28');

  -- ── 19. Staff Members ─────────────────────────────────────────────────────
  INSERT INTO staff_members
    (id, brewery_id, first_name, last_name, role, email, is_active)
  VALUES
    (v_staff_marcus, v_brewery_id, 'Marcus', 'Reed',   'head_brewer',    'marcus@adaptivebrewing.example', true),
    (v_staff_sarah,  v_brewery_id, 'Sarah',  'Kim',    'taproom_manager', 'sarah@adaptivebrewing.example',  true),
    (v_staff_jamie,  v_brewery_id, 'Jamie',  'Torres', 'taproom_staff',   NULL, true);

  -- ── 20. Staff Certifications ──────────────────────────────────────────────
  INSERT INTO staff_certifications
    (brewery_id, staff_member_id, certification_type, certification_name,
     issuing_organization, issue_date, expiration_date)
  VALUES
    (v_brewery_id, v_staff_marcus, 'cicerone',
     'Certified Cicerone', 'Cicerone Certification Program',
     '2024-09-15', '2027-09-15'),
    (v_brewery_id, v_staff_sarah, 'responsible_alcohol_service',
     'TIPS Certification', 'TIPS',
     '2025-03-01', '2027-03-01');

  -- ── 21. Training Programs ─────────────────────────────────────────────────
  INSERT INTO training_programs
    (id, brewery_id, program_name, program_type, is_required,
     renewal_required, renewal_period_months)
  VALUES
    (v_prog_ras, v_brewery_id, 'Responsible Alcohol Service', 'compliance', true, true, 24),
    (v_prog_fh,  v_brewery_id, 'Food Handler Certification',   'safety',    true, true, 36);

  -- ── 22. Staff Training Records ────────────────────────────────────────────
  INSERT INTO staff_training_records
    (brewery_id, staff_member_id, staff_name, staff_role,
     program_id, program_name, completion_date, expiration_date, passed)
  VALUES
    (v_brewery_id, v_staff_marcus, 'Marcus Reed',  'head_brewer',
     v_prog_ras, 'Responsible Alcohol Service', '2025-01-15', '2027-01-15', true),
    (v_brewery_id, v_staff_sarah,  'Sarah Kim',    'taproom_manager',
     v_prog_ras, 'Responsible Alcohol Service', '2025-03-01', '2027-03-01', true),
    (v_brewery_id, v_staff_jamie,  'Jamie Torres', 'taproom_staff',
     v_prog_ras, 'Responsible Alcohol Service', '2025-06-10', '2027-06-10', true);

  -- ── 23. Insurance Policies ────────────────────────────────────────────────
  INSERT INTO insurance_policies
    (brewery_id, policy_name, insurance_type, carrier_name, agent_name,
     policy_number, coverage_amount, premium_amount, premium_frequency,
     effective_date, expiration_date, auto_renews)
  VALUES
    (v_brewery_id, 'General Liability Policy', 'general_liability',
     'Brewer''s Insurance Group', 'Dana Cho',
     'GL-2025-84201', 1000000, 2400, 'annual',
     '2025-07-01', '2026-06-30', true),
    (v_brewery_id, 'Liquor Liability Policy', 'liquor_liability',
     'Brewer''s Insurance Group', 'Dana Cho',
     'LL-2025-84202', 1000000, 1800, 'annual',
     '2025-07-01', '2026-06-30', true);

  -- ── 24. Local Permits ─────────────────────────────────────────────────────
  INSERT INTO local_permits
    (brewery_id, permit_name, permit_type, issuing_authority,
     authority_contact_name, permit_number,
     issue_date, expiration_date, renewal_fee, auto_renews, is_active)
  VALUES
    (v_brewery_id, 'City of Denver Business License', 'business_license',
     'City and County of Denver', 'Revenue Division',
     'BL-2025-003847', '2025-01-01', '2026-12-31', 75.00, true, true),
    (v_brewery_id, 'Outdoor Patio Permit', 'outdoor_seating',
     'Denver Community Planning', 'Permits Office',
     'OP-2025-00912', '2025-04-01', '2025-10-31', 150.00, false, true);

  -- ── 25. Taproom Metrics ───────────────────────────────────────────────────
  INSERT INTO taproom_metrics
    (brewery_id, metric_month, taproom_revenue, total_transactions,
     num_operating_days, labor_cost, labor_hours)
  VALUES
    (v_brewery_id, '2026-03-01', 28400, 1120, 26, 8200, 312),
    (v_brewery_id, '2026-04-01', 31200, 1290, 25, 8800, 336),
    (v_brewery_id, '2026-05-01', 34100, 1380, 26, 9100, 348);

  -- ── 26. Excise Tax Periods ────────────────────────────────────────────────
  INSERT INTO excise_tax_periods
    (brewery_id, period_year, period_number, period_type,
     barrels_removed_sale, tax_rate_applied, tax_owed,
     status, filed_date, payment_date)
  VALUES
    (v_brewery_id, 2026, 1, 'quarterly', 14.6, 3.50, 51.10,
     'paid', '2026-04-12', '2026-04-12'),
    (v_brewery_id, 2026, 2, 'quarterly', 18.2, 3.50, 63.70,
     'estimated', NULL, NULL);

  -- ── 27. Keg Fleet ─────────────────────────────────────────────────────────
  INSERT INTO keg_fleet (brewery_id, keg_type, owned_count, deposit_amount)
  VALUES
    (v_brewery_id, '1/2 BBL Sanke',  20, 30.00),
    (v_brewery_id, '1/6 BBL Sixtel', 30, 20.00);

  -- ── 28. Keg Deposit Records ───────────────────────────────────────────────
  -- total_deposit_held is a generated column — do not insert it
  INSERT INTO keg_deposit_records
    (brewery_id, account_name, keg_type, kegs_out, deposit_per_keg)
  VALUES
    (v_brewery_id, 'Denver Natural Grocers', '1/2 BBL Sanke', 8, 30.00);

  -- ── 29. Tracked Bills ─────────────────────────────────────────────────────
  INSERT INTO tracked_bills
    (id, brewery_id, jurisdiction, state, bill_number, short_title,
     full_description, bill_url, date_introduced,
     status, priority, business_impact, impact_area, impact_notes,
     next_key_date, next_action, guild_aware)
  VALUES
    (v_bill_sb412, v_brewery_id, 'State', 'CO',
     'SB 412', 'Self-Distribution Rights Expansion',
     'SB 412 would allow Colorado breweries producing under 60,000 barrels annually to self-distribute to retailers without a wholesale distributor. Current law caps self-distribution at 10,000 barrels.',
     'https://leg.colorado.gov',
     '2026-01-15', 'In Committee', 'A', 'High', 'Distribution',
     'Passage would save an estimated $18K/yr in distributor fees and open 12 new retail accounts directly.',
     '2026-06-10', 'Contact Sen. Williams office before committee hearing', 'Yes'),
    (v_bill_hb1205, v_brewery_id, 'State', 'CO',
     'HB 1205', 'Taproom Direct-to-Consumer Expansion',
     'HB 1205 proposes raising the taproom retail cap from 8 to 16 oz per pour and allowing Sunday sales before noon. Currently breweries may not open before noon on Sundays.',
     'https://leg.colorado.gov',
     '2026-02-03', 'Floor Vote', 'B', 'Medium', 'Taproom',
     'Sunday morning brunch sales could add $200–400/month in additional taproom revenue.',
     '2026-06-18', 'Monitor floor vote date', 'Notified');

  -- ── 30. Bill Actions ──────────────────────────────────────────────────────
  INSERT INTO bill_actions
    (brewery_id, bill_id, action_date, action_type, description,
     contact_name, outcome)
  VALUES
    (v_brewery_id, v_bill_sb412,
     '2026-02-20', 'Contacted Rep',
     'Called and emailed Sen. Williams'' office to express support for SB 412. Shared economic impact data from the CO Brewers Guild showing $22M in annual savings for small breweries statewide.',
     'Sen. Williams'' Legislative Aide',
     'Staffer took notes, confirmed committee hearing scheduled for June 10.'),
    (v_brewery_id, v_bill_hb1205,
     '2026-03-05', 'Attended Hearing',
     'Attended the House Business Affairs Committee hearing on HB 1205. Provided written testimony and spoke for 3 minutes in support of the Sunday hour expansion.',
     NULL,
     'Bill passed committee 7-4 and is now heading to the full House floor vote.');

  RAISE NOTICE 'Adaptive Brewing Co. demo data seeded successfully (brewery_id = %)', v_brewery_id;
END;
$$;
