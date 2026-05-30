/**
 * reset-demo-data — Edge Function
 * Admin-only endpoint. Wipes all data for the demo brewery account and
 * re-inserts fresh seed data so the demo always shows a clean, realistic state.
 *
 * Deploy with:
 *   supabase functions deploy reset-demo-data --no-verify-jwt
 *
 * Required secrets:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Optional secret (falls back to hardcoded admin email):
 *   ADMIN_EMAIL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEMO_EMAIL      = 'demo@thecraftbeerbrief.com'
const DEMO_BREWERY    = 'Adaptive Brewing Co.'
const DEMO_STATE      = 'CO'

// ── Helper: JSON response with CORS headers ───────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// ── Helper: throw if a Supabase operation returned an error ───────────────────

function check(error: unknown, context: string) {
  if (error) {
    const msg = (error as { message?: string }).message ?? String(error)
    throw new Error(`${context}: ${msg}`)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // ── 1. Verify the caller is the admin ──────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized', message: 'Missing authorization header.' }, 401)
  }

  const token = authHeader.replace('Bearer ', '')

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !caller) {
    return json({ error: 'unauthorized', message: 'Invalid or expired session.' }, 401)
  }

  const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'twbobbercycles@gmail.com'
  if (caller.email !== adminEmail) {
    return json({ error: 'forbidden', message: 'Admin access required.' }, 403)
  }

  // ── 2. Build service role client (bypasses RLS for all operations) ─────────

  const svc = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // ── 3. Find the demo auth user ─────────────────────────────────────────────

  const { data: { users: authUsers }, error: listError } =
    await svc.auth.admin.listUsers({ perPage: 1000 })

  if (listError) {
    console.error('reset-demo-data: listUsers', listError.message)
    return json({ error: 'server_error', message: 'Could not list auth users.' }, 500)
  }

  const demoAuthUser = authUsers.find(u => u.email === DEMO_EMAIL)
  if (!demoAuthUser) {
    return json({
      error:   'not_found',
      message: `Demo auth user ${DEMO_EMAIL} not found. Create it in Supabase Auth first.`,
    }, 404)
  }

  const userId = demoAuthUser.id

  // ── 4. Get or create brewery + user profile ────────────────────────────────

  const { data: profile } = await svc
    .from('users')
    .select('brewery_id')
    .eq('id', userId)
    .single()

  let breweryId: string

  if (!profile?.brewery_id) {
    const { data: brewery, error: bErr } = await svc
      .from('breweries')
      .insert({ name: DEMO_BREWERY, state: DEMO_STATE, production_volume: '500_1000', staff_count: '4_10' })
      .select('id')
      .single()
    check(bErr, 'create brewery')
    breweryId = brewery!.id

    const { error: uErr } = await svc.from('users').upsert({
      id:                  userId,
      brewery_id:          breweryId,
      email:               DEMO_EMAIL,
      role:                'owner',
      subscription_status: 'active',
      subscription_tier:   'full_suite',
      trial_expires_at:    new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    })
    check(uErr, 'create user profile')
  } else {
    breweryId = profile.brewery_id
    await svc.from('users').update({
      subscription_status: 'active',
      subscription_tier:   'full_suite',
    }).eq('id', userId)
    await svc.from('breweries').update({
      name: DEMO_BREWERY, state: DEMO_STATE,
    }).eq('id', breweryId)
  }

  // ── 5. Wipe all existing demo data (reverse FK order) ─────────────────────

  const tablesWithBreweryId = [
    'bill_actions',
    'tracked_bills',
    'keg_deposit_records',
    'keg_fleet',
    'excise_tax_periods',
    'taproom_metrics',
    'staff_training_records',
    'training_programs',
    'staff_certifications',
    'staff_members',
    'wholesale_accounts',
    'taproom_events',
    'distribution_records',
    'package_splits',
    'batch_packages',
    'packaging_runs',
    'distribution_accounts',
    'local_permits',
    'insurance_policies',
  ] as const

  for (const table of tablesWithBreweryId) {
    const { error } = await svc.from(table).delete().eq('brewery_id', breweryId)
    if (error) console.warn(`reset-demo-data: delete ${table}:`, error.message)
  }

  // gravity_readings: no brewery_id — delete via fermentation_id
  const { data: fermsToDelete } = await svc
    .from('fermentations')
    .select('id')
    .eq('brewery_id', breweryId)

  if (fermsToDelete?.length) {
    await svc.from('gravity_readings')
      .delete()
      .in('fermentation_id', fermsToDelete.map(f => f.id))
  }
  await svc.from('fermentations').delete().eq('brewery_id', breweryId)
  await svc.from('fermentation_vessels').delete().eq('brewery_id', breweryId)

  // recipe_ingredients: no brewery_id — delete via recipe_id
  const { data: recsToDelete } = await svc
    .from('recipes')
    .select('id')
    .eq('brewery_id', breweryId)

  if (recsToDelete?.length) {
    await svc.from('recipe_ingredients')
      .delete()
      .in('recipe_id', recsToDelete.map(r => r.id))
  }
  await svc.from('brew_days').delete().eq('brewery_id', breweryId)
  await svc.from('recipes').delete().eq('brewery_id', breweryId)
  await svc.from('ingredients').delete().eq('brewery_id', breweryId)

  // ── 6. Generate all UUIDs upfront ─────────────────────────────────────────
  // Pre-generating lets us reference parent IDs in child inserts below.

  const ids = {
    ingPale:       crypto.randomUUID(),
    ingMunich:     crypto.randomUUID(),
    ingCrystal:    crypto.randomUUID(),
    ingOats:       crypto.randomUUID(),
    ingCentennial: crypto.randomUUID(),
    ingCascade:    crypto.randomUUID(),
    ingCitra:      crypto.randomUUID(),
    ingUs05:       crypto.randomUUID(),
    recipeHazy:    crypto.randomUUID(),
    recipeAmber:   crypto.randomUUID(),
    brewHazy:      crypto.randomUUID(),
    brewAmber:     crypto.randomUUID(),
    vessel1:       crypto.randomUUID(),
    vessel2:       crypto.randomUUID(),
    fermHazy:      crypto.randomUUID(),
    fermAmber:     crypto.randomUUID(),
    pkgHazy:       crypto.randomUUID(),
    bpkgHazy:      crypto.randomUUID(),
    distRetailer:  crypto.randomUUID(),
    distTaproom:   crypto.randomUUID(),
    staffMarcus:   crypto.randomUUID(),
    staffSarah:    crypto.randomUUID(),
    staffJamie:    crypto.randomUUID(),
    progRas:       crypto.randomUUID(),
    progFh:        crypto.randomUUID(),
    billSb412:     crypto.randomUUID(),
    billHb1205:    crypto.randomUUID(),
  }

  const b = breweryId  // shorthand for readability below

  try {
    // ── Ingredients ──────────────────────────────────────────────────────────
    const { error: ingErr } = await svc.from('ingredients').insert([
      { id: ids.ingPale,       brewery_id: b, name: 'Pale Malt 2-Row',  category: 'Malt/Grain', unit: 'lb',     current_price_per_unit: 0.65, current_stock_quantity: 200, stock_unit: 'lb',     reorder_threshold: 50, is_active: true },
      { id: ids.ingMunich,     brewery_id: b, name: 'Munich Malt',       category: 'Malt/Grain', unit: 'lb',     current_price_per_unit: 0.80, current_stock_quantity: 80,  stock_unit: 'lb',     reorder_threshold: 25, is_active: true },
      { id: ids.ingCrystal,    brewery_id: b, name: 'Crystal 60L',       category: 'Malt/Grain', unit: 'lb',     current_price_per_unit: 0.75, current_stock_quantity: 60,  stock_unit: 'lb',     reorder_threshold: 20, is_active: true },
      { id: ids.ingOats,       brewery_id: b, name: 'Flaked Oats',       category: 'Adjunct',    unit: 'lb',     current_price_per_unit: 0.70, current_stock_quantity: 40,  stock_unit: 'lb',     reorder_threshold: 15, is_active: true },
      { id: ids.ingCentennial, brewery_id: b, name: 'Centennial Hops',   category: 'Hops',       unit: 'oz',     current_price_per_unit: 2.10, current_stock_quantity: 32,  stock_unit: 'oz',     reorder_threshold: 8,  is_active: true },
      { id: ids.ingCascade,    brewery_id: b, name: 'Cascade Hops',      category: 'Hops',       unit: 'oz',     current_price_per_unit: 1.85, current_stock_quantity: 24,  stock_unit: 'oz',     reorder_threshold: 8,  is_active: true },
      { id: ids.ingCitra,      brewery_id: b, name: 'Citra Hops',        category: 'Hops',       unit: 'oz',     current_price_per_unit: 2.75, current_stock_quantity: 48,  stock_unit: 'oz',     reorder_threshold: 12, is_active: true },
      { id: ids.ingUs05,       brewery_id: b, name: 'US-05 Dry Yeast',   category: 'Yeast',      unit: 'packet', current_price_per_unit: 4.50, current_stock_quantity: 12,  stock_unit: 'packet', reorder_threshold: 4,  is_active: true },
    ])
    check(ingErr, 'insert ingredients')

    // ── Recipes ───────────────────────────────────────────────────────────────
    const { error: recErr } = await svc.from('recipes').insert([
      { id: ids.recipeHazy,  brewery_id: b, name: 'Adaptive Hazy IPA', style: 'New England IPA',     base_batch_size: 5, base_batch_size_unit: 'barrels', target_og: 1.068, target_fg: 1.012, target_abv: 7.4, target_ibu: 45, target_margin_percentage: 62, version: 1 },
      { id: ids.recipeAmber, brewery_id: b, name: 'Front Range Amber',  style: 'American Amber Ale', base_batch_size: 5, base_batch_size_unit: 'barrels', target_og: 1.055, target_fg: 1.010, target_abv: 5.9, target_ibu: 28, target_margin_percentage: 58, version: 1 },
    ])
    check(recErr, 'insert recipes')

    // ── Recipe Ingredients ────────────────────────────────────────────────────
    const { error: riErr } = await svc.from('recipe_ingredients').insert([
      { brewery_id: b, recipe_id: ids.recipeHazy,  ingredient_id: ids.ingPale,       ingredient_name: 'Pale Malt 2-Row',  amount: 120, unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeHazy,  ingredient_id: ids.ingOats,       ingredient_name: 'Flaked Oats',      amount: 30,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeHazy,  ingredient_id: ids.ingCitra,      ingredient_name: 'Citra Hops',       amount: 16,  unit: 'oz',     addition_type: 'Whirlpool' },
      { brewery_id: b, recipe_id: ids.recipeHazy,  ingredient_id: ids.ingCitra,      ingredient_name: 'Citra Hops',       amount: 12,  unit: 'oz',     addition_type: 'Dry Hop' },
      { brewery_id: b, recipe_id: ids.recipeHazy,  ingredient_id: ids.ingUs05,       ingredient_name: 'US-05 Dry Yeast',  amount: 2,   unit: 'packet', addition_type: 'Fermentation' },
      { brewery_id: b, recipe_id: ids.recipeAmber, ingredient_id: ids.ingPale,       ingredient_name: 'Pale Malt 2-Row',  amount: 100, unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeAmber, ingredient_id: ids.ingMunich,     ingredient_name: 'Munich Malt',      amount: 20,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeAmber, ingredient_id: ids.ingCrystal,    ingredient_name: 'Crystal 60L',      amount: 15,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeAmber, ingredient_id: ids.ingCentennial, ingredient_name: 'Centennial Hops',  amount: 8,   unit: 'oz',     addition_type: 'Boil' },
      { brewery_id: b, recipe_id: ids.recipeAmber, ingredient_id: ids.ingCascade,    ingredient_name: 'Cascade Hops',     amount: 6,   unit: 'oz',     addition_type: 'Boil' },
      { brewery_id: b, recipe_id: ids.recipeAmber, ingredient_id: ids.ingUs05,       ingredient_name: 'US-05 Dry Yeast',  amount: 2,   unit: 'packet', addition_type: 'Fermentation' },
    ])
    check(riErr, 'insert recipe_ingredients')

    // ── Brew Days ─────────────────────────────────────────────────────────────
    const { error: bdErr } = await svc.from('brew_days').insert([
      { id: ids.brewHazy,  brewery_id: b, batch_number: 'ADP-2026-001', recipe_id: ids.recipeHazy,  recipe_name: 'Adaptive Hazy IPA', beer_style: 'New England IPA',     status: 'completed', brew_date: '2026-03-10', planned_batch_size: 5, planned_batch_unit: 'barrels', target_og: 1.068, target_brewhouse_efficiency: 75, actual_og: 1.067, actual_brewhouse_efficiency: 74, volume_into_fermenter: 4.8, yeast_strain: 'US-05', brewer_name: 'Marcus Reed' },
      { id: ids.brewAmber, brewery_id: b, batch_number: 'ADP-2026-002', recipe_id: ids.recipeAmber, recipe_name: 'Front Range Amber',  beer_style: 'American Amber Ale', status: 'completed', brew_date: '2026-04-07', planned_batch_size: 5, planned_batch_unit: 'barrels', target_og: 1.055, target_brewhouse_efficiency: 75, actual_og: 1.056, actual_brewhouse_efficiency: 76, volume_into_fermenter: 4.9, yeast_strain: 'US-05', brewer_name: 'Marcus Reed' },
    ])
    check(bdErr, 'insert brew_days')

    // ── Fermentation Vessels ──────────────────────────────────────────────────
    const { error: vErr } = await svc.from('fermentation_vessels').insert([
      { id: ids.vessel1, brewery_id: b, vessel_name: 'Conical A', vessel_type: 'Conical Fermenter', capacity: 7, capacity_unit: 'barrels', has_temperature_control: true },
      { id: ids.vessel2, brewery_id: b, vessel_name: 'Conical B', vessel_type: 'Conical Fermenter', capacity: 7, capacity_unit: 'barrels', has_temperature_control: true },
    ])
    check(vErr, 'insert fermentation_vessels')

    // ── Fermentations ─────────────────────────────────────────────────────────
    const { error: fErr } = await svc.from('fermentations').insert([
      { id: ids.fermHazy,  brewery_id: b, brew_day_id: ids.brewHazy,  vessel_id: ids.vessel1, batch_number: 'ADP-2026-001', beer_name: 'Adaptive Hazy IPA', status: 'packaged',     volume_in_fermenter: 4.8, actual_og: 1.067, actual_fg: 1.012, pitch_date: '2026-03-10' },
      { id: ids.fermAmber, brewery_id: b, brew_day_id: ids.brewAmber, vessel_id: ids.vessel2, batch_number: 'ADP-2026-002', beer_name: 'Front Range Amber',  status: 'conditioning', volume_in_fermenter: 4.9, actual_og: 1.056, actual_fg: 1.014, pitch_date: '2026-04-07' },
    ])
    check(fErr, 'insert fermentations')

    // ── Gravity Readings ──────────────────────────────────────────────────────
    const { error: grErr } = await svc.from('gravity_readings').insert([
      { fermentation_id: ids.fermHazy,  reading_date: '2026-03-11', gravity: 1.056, temperature: 68 },
      { fermentation_id: ids.fermHazy,  reading_date: '2026-03-13', gravity: 1.032, temperature: 69 },
      { fermentation_id: ids.fermHazy,  reading_date: '2026-03-16', gravity: 1.018, temperature: 70 },
      { fermentation_id: ids.fermHazy,  reading_date: '2026-03-19', gravity: 1.012, temperature: 70 },
      { fermentation_id: ids.fermAmber, reading_date: '2026-04-08', gravity: 1.046, temperature: 66 },
      { fermentation_id: ids.fermAmber, reading_date: '2026-04-11', gravity: 1.028, temperature: 68 },
      { fermentation_id: ids.fermAmber, reading_date: '2026-04-15', gravity: 1.014, temperature: 68 },
    ])
    check(grErr, 'insert gravity_readings')

    // ── Batch Package ─────────────────────────────────────────────────────────
    // Insert batch_package before packaging_run because packaging_run.batch_package_id references it
    const { error: bpErr } = await svc.from('batch_packages').insert([
      { id: ids.bpkgHazy, brewery_id: b, fermentation_id: ids.fermHazy, brew_day_id: ids.brewHazy, batch_number: 'ADP-2026-001', beer_name: 'Adaptive Hazy IPA', beer_style: 'New England IPA', packaging_date: '2026-03-24', total_volume_packaged: 4.6, total_volume_fermented: 4.8, volume_unit: 'barrels', status: 'complete' },
    ])
    check(bpErr, 'insert batch_packages')

    // ── Packaging Run ─────────────────────────────────────────────────────────
    const { error: prErr } = await svc.from('packaging_runs').insert([
      { id: ids.pkgHazy, brewery_id: b, fermentation_id: ids.fermHazy, batch_package_id: ids.bpkgHazy, batch_number: 'ADP-2026-001', beer_name: 'Adaptive Hazy IPA', beer_style: 'New England IPA', packaging_date: '2026-03-24', status: 'complete', volume_from_fermenter: 4.8, total_volume_packaged: 4.6, packaging_yield_percentage: 95.8, recipe_cost_per_pint: 0.52, actual_splits: [{ type: '1/2 barrel keg', units: 8 }, { type: '1/6 barrel keg', units: 6 }], planned_splits: [{ type: '1/2 barrel keg', units: 8 }, { type: '1/6 barrel keg', units: 6 }] },
    ])
    check(prErr, 'insert packaging_runs')

    // ── Package Splits ────────────────────────────────────────────────────────
    const { error: psErr } = await svc.from('package_splits').insert([
      { batch_package_id: ids.bpkgHazy, brewery_id: b, package_type: '1/2 barrel keg', units_packaged: 8, volume_per_unit: 0.5,    total_volume: 4.0, destination: 'distribution' },
      { batch_package_id: ids.bpkgHazy, brewery_id: b, package_type: '1/6 barrel keg', units_packaged: 6, volume_per_unit: 0.1667, total_volume: 1.0, destination: 'taproom' },
    ])
    check(psErr, 'insert package_splits')

    // ── Distribution Accounts ─────────────────────────────────────────────────
    const { error: daErr } = await svc.from('distribution_accounts').insert([
      { id: ids.distRetailer, brewery_id: b, account_name: 'Denver Natural Grocers',      account_type: 'retailer', contact_name: 'Jill Harmon', contact_email: 'jill@example-dng.com', payment_terms: 'net_30', is_active: true },
      { id: ids.distTaproom,  brewery_id: b, account_name: 'Adaptive Taproom (in-house)', account_type: 'taproom',  is_active: true },
    ])
    check(daErr, 'insert distribution_accounts')

    // ── Distribution Records ──────────────────────────────────────────────────
    const { error: drErr } = await svc.from('distribution_records').insert([
      { brewery_id: b, batch_package_id: ids.bpkgHazy, account_id: ids.distRetailer, account_name: 'Denver Natural Grocers', account_type: 'retailer', package_type: '1/2 barrel keg', quantity: 8, delivery_date: '2026-03-26', price_per_unit: 175.00, returnable_kegs: true },
    ])
    check(drErr, 'insert distribution_records')

    // ── Taproom Events ────────────────────────────────────────────────────────
    const { error: teErr } = await svc.from('taproom_events').insert([
      { brewery_id: b, event_name: 'Spring Brew Fest',    event_type: 'beer_festival', event_date: '2026-04-19', status: 'completed', expected_attendance: 200, actual_attendance: 187, estimated_beer_revenue: 4800, actual_beer_revenue: 4250, entertainment_cost: 500, marketing_cost: 200, staffing_cost: 600, notes: 'Great turnout; ran out of Hazy IPA by 4pm' },
      { brewery_id: b, event_name: 'Trivia Night — May', event_type: 'recurring',     event_date: '2026-05-14', status: 'confirmed', expected_attendance: 60,  estimated_beer_revenue: 900, entertainment_cost: 100, marketing_cost: 50, staffing_cost: 300 },
    ])
    check(teErr, 'insert taproom_events')

    // ── Wholesale Accounts ────────────────────────────────────────────────────
    const { error: waErr } = await svc.from('wholesale_accounts').insert([
      { brewery_id: b, account_name: 'Mountain West Distributors', account_type: 'distributor', status: 'active', contacts: [{ name: 'Tom Vasquez', phone: '303-555-0198', email: 'tom@mwdist.example' }], last_contact_date: '2026-05-01', next_followup_date: '2026-06-01' },
      { brewery_id: b, account_name: 'Denver Natural Grocers',     account_type: 'retailer',    status: 'active', contacts: [{ name: 'Jill Harmon', phone: '303-555-0102', email: 'jill@example-dng.com' }],    last_contact_date: '2026-04-28', next_followup_date: '2026-05-28' },
    ])
    check(waErr, 'insert wholesale_accounts')

    // ── Staff Members ─────────────────────────────────────────────────────────
    const { error: smErr } = await svc.from('staff_members').insert([
      { id: ids.staffMarcus, brewery_id: b, first_name: 'Marcus', last_name: 'Reed',   role: 'head_brewer',    email: 'marcus@adaptivebrewing.example', is_active: true },
      { id: ids.staffSarah,  brewery_id: b, first_name: 'Sarah',  last_name: 'Kim',    role: 'taproom_manager', email: 'sarah@adaptivebrewing.example',  is_active: true },
      { id: ids.staffJamie,  brewery_id: b, first_name: 'Jamie',  last_name: 'Torres', role: 'taproom_staff',   is_active: true },
    ])
    check(smErr, 'insert staff_members')

    // ── Staff Certifications ──────────────────────────────────────────────────
    const { error: scErr } = await svc.from('staff_certifications').insert([
      { brewery_id: b, staff_member_id: ids.staffMarcus, certification_type: 'cicerone',                     certification_name: 'Certified Cicerone',  issuing_organization: 'Cicerone Certification Program', issue_date: '2024-09-15', expiration_date: '2027-09-15' },
      { brewery_id: b, staff_member_id: ids.staffSarah,  certification_type: 'responsible_alcohol_service', certification_name: 'TIPS Certification',  issuing_organization: 'TIPS',                           issue_date: '2025-03-01', expiration_date: '2027-03-01' },
    ])
    check(scErr, 'insert staff_certifications')

    // ── Training Programs ─────────────────────────────────────────────────────
    const { error: tpErr } = await svc.from('training_programs').insert([
      { id: ids.progRas, brewery_id: b, program_name: 'Responsible Alcohol Service', program_type: 'compliance', is_required: true, renewal_required: true, renewal_period_months: 24 },
      { id: ids.progFh,  brewery_id: b, program_name: 'Food Handler Certification',   program_type: 'safety',    is_required: true, renewal_required: true, renewal_period_months: 36 },
    ])
    check(tpErr, 'insert training_programs')

    // ── Staff Training Records ────────────────────────────────────────────────
    const { error: strErr } = await svc.from('staff_training_records').insert([
      { brewery_id: b, staff_member_id: ids.staffMarcus, staff_name: 'Marcus Reed',  staff_role: 'head_brewer',    program_id: ids.progRas, program_name: 'Responsible Alcohol Service', completion_date: '2025-01-15', expiration_date: '2027-01-15', passed: true },
      { brewery_id: b, staff_member_id: ids.staffSarah,  staff_name: 'Sarah Kim',    staff_role: 'taproom_manager', program_id: ids.progRas, program_name: 'Responsible Alcohol Service', completion_date: '2025-03-01', expiration_date: '2027-03-01', passed: true },
      { brewery_id: b, staff_member_id: ids.staffJamie,  staff_name: 'Jamie Torres', staff_role: 'taproom_staff',   program_id: ids.progRas, program_name: 'Responsible Alcohol Service', completion_date: '2025-06-10', expiration_date: '2027-06-10', passed: true },
    ])
    check(strErr, 'insert staff_training_records')

    // ── Insurance Policies ────────────────────────────────────────────────────
    const { error: ipErr } = await svc.from('insurance_policies').insert([
      { brewery_id: b, policy_name: 'General Liability Policy', insurance_type: 'general_liability', carrier_name: "Brewer's Insurance Group", agent_name: 'Dana Cho', policy_number: 'GL-2025-84201', coverage_amount: 1000000, premium_amount: 2400, premium_frequency: 'annual', effective_date: '2025-07-01', expiration_date: '2026-06-30', auto_renews: true },
      { brewery_id: b, policy_name: 'Liquor Liability Policy',  insurance_type: 'liquor_liability',  carrier_name: "Brewer's Insurance Group", agent_name: 'Dana Cho', policy_number: 'LL-2025-84202', coverage_amount: 1000000, premium_amount: 1800, premium_frequency: 'annual', effective_date: '2025-07-01', expiration_date: '2026-06-30', auto_renews: true },
    ])
    check(ipErr, 'insert insurance_policies')

    // ── Local Permits ─────────────────────────────────────────────────────────
    const { error: lpErr } = await svc.from('local_permits').insert([
      { brewery_id: b, permit_name: 'City of Denver Business License', permit_type: 'business_license', issuing_authority: 'City and County of Denver', authority_contact_name: 'Revenue Division',   permit_number: 'BL-2025-003847', issue_date: '2025-01-01', expiration_date: '2026-12-31', renewal_fee: 75,  auto_renews: true,  is_active: true },
      { brewery_id: b, permit_name: 'Outdoor Patio Permit',            permit_type: 'outdoor_seating', issuing_authority: 'Denver Community Planning',  authority_contact_name: 'Permits Office',     permit_number: 'OP-2025-00912',  issue_date: '2025-04-01', expiration_date: '2025-10-31', renewal_fee: 150, auto_renews: false, is_active: true },
    ])
    check(lpErr, 'insert local_permits')

    // ── Taproom Metrics ───────────────────────────────────────────────────────
    const { error: tmErr } = await svc.from('taproom_metrics').insert([
      { brewery_id: b, metric_month: '2026-03-01', taproom_revenue: 28400, total_transactions: 1120, num_operating_days: 26, labor_cost: 8200, labor_hours: 312 },
      { brewery_id: b, metric_month: '2026-04-01', taproom_revenue: 31200, total_transactions: 1290, num_operating_days: 25, labor_cost: 8800, labor_hours: 336 },
      { brewery_id: b, metric_month: '2026-05-01', taproom_revenue: 34100, total_transactions: 1380, num_operating_days: 26, labor_cost: 9100, labor_hours: 348 },
    ])
    check(tmErr, 'insert taproom_metrics')

    // ── Excise Tax Periods ────────────────────────────────────────────────────
    const { error: etErr } = await svc.from('excise_tax_periods').insert([
      { brewery_id: b, period_year: 2026, period_number: 1, period_type: 'quarterly', barrels_removed_sale: 14.6, tax_rate_applied: 3.50, tax_owed: 51.10, status: 'paid',      filed_date: '2026-04-12', payment_date: '2026-04-12' },
      { brewery_id: b, period_year: 2026, period_number: 2, period_type: 'quarterly', barrels_removed_sale: 18.2, tax_rate_applied: 3.50, tax_owed: 63.70, status: 'estimated' },
    ])
    check(etErr, 'insert excise_tax_periods')

    // ── Keg Fleet ─────────────────────────────────────────────────────────────
    const { error: kfErr } = await svc.from('keg_fleet').insert([
      { brewery_id: b, keg_type: '1/2 BBL Sanke',  owned_count: 20, deposit_amount: 30.00 },
      { brewery_id: b, keg_type: '1/6 BBL Sixtel', owned_count: 30, deposit_amount: 20.00 },
    ])
    check(kfErr, 'insert keg_fleet')

    // ── Keg Deposit Records ───────────────────────────────────────────────────
    // total_deposit_held is a generated column — do not insert it
    const { error: kdErr } = await svc.from('keg_deposit_records').insert([
      { brewery_id: b, account_name: 'Denver Natural Grocers', keg_type: '1/2 BBL Sanke', kegs_out: 8, deposit_per_keg: 30.00 },
    ])
    check(kdErr, 'insert keg_deposit_records')

    // ── Tracked Bills ─────────────────────────────────────────────────────────
    const { error: tbErr } = await svc.from('tracked_bills').insert([
      { id: ids.billSb412,  brewery_id: b, jurisdiction: 'State', state: 'CO', bill_number: 'SB 412',  short_title: 'Self-Distribution Rights Expansion',    full_description: 'SB 412 would allow Colorado breweries producing under 60,000 barrels annually to self-distribute to retailers without a wholesale distributor.', bill_url: 'https://leg.colorado.gov', date_introduced: '2026-01-15', status: 'In Committee', priority: 'A', business_impact: 'High',   impact_area: 'Distribution', impact_notes: 'Passage would save an estimated $18K/yr in distributor fees and open 12 new retail accounts.', next_key_date: '2026-06-10', next_action: 'Contact Sen. Williams office before committee hearing', guild_aware: 'Yes' },
      { id: ids.billHb1205, brewery_id: b, jurisdiction: 'State', state: 'CO', bill_number: 'HB 1205', short_title: 'Taproom Direct-to-Consumer Expansion', full_description: 'HB 1205 proposes raising the taproom retail cap from 8 to 16 oz per pour and allowing Sunday sales before noon.', bill_url: 'https://leg.colorado.gov', date_introduced: '2026-02-03', status: 'Floor Vote',    priority: 'B', business_impact: 'Medium', impact_area: 'Taproom',      impact_notes: 'Sunday morning sales could add $200–400/month in additional revenue.',                                             next_key_date: '2026-06-18', next_action: 'Monitor floor vote date', guild_aware: 'Notified' },
    ])
    check(tbErr, 'insert tracked_bills')

    // ── Bill Actions ──────────────────────────────────────────────────────────
    const { error: baErr } = await svc.from('bill_actions').insert([
      { brewery_id: b, bill_id: ids.billSb412,  action_date: '2026-02-20', action_type: 'Contacted Rep',   description: "Called and emailed Sen. Williams' office to express support for SB 412. Shared economic impact data from the CO Brewers Guild.", contact_name: "Sen. Williams' Legislative Aide", outcome: 'Staffer confirmed committee hearing scheduled for June 10.' },
      { brewery_id: b, bill_id: ids.billHb1205, action_date: '2026-03-05', action_type: 'Attended Hearing', description: 'Attended the House Business Affairs Committee hearing on HB 1205. Provided written testimony in support.', outcome: 'Bill passed committee 7-4, now heading to full House floor vote.' },
    ])
    check(baErr, 'insert bill_actions')

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during seed'
    console.error('reset-demo-data: seed error:', message)
    return json({ error: 'seed_failed', message }, 500)
  }

  console.log(`reset-demo-data: successfully reset demo data for brewery ${breweryId}`)

  return json({
    success:     true,
    brewery_id:  breweryId,
    message:     `Demo data for ${DEMO_BREWERY} has been reset successfully.`,
  })
})
