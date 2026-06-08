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
const DEMO_STATE      = 'IL'

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
    // Ingredients
    ingPale:        crypto.randomUUID(),
    ingMunich:      crypto.randomUUID(),
    ingCrystal:     crypto.randomUUID(),
    ingOats:        crypto.randomUUID(),
    ingRoasted:     crypto.randomUUID(),
    ingCentennial:  crypto.randomUUID(),
    ingCascade:     crypto.randomUUID(),
    ingCitra:       crypto.randomUUID(),
    ingMosaic:      crypto.randomUUID(),
    ingUs05:        crypto.randomUUID(),
    // Recipes
    recipeHazy:     crypto.randomUUID(),
    recipeHazyV2:   crypto.randomUUID(),
    recipePivot:    crypto.randomUUID(),
    recipeStout:    crypto.randomUUID(),
    recipeBaseline: crypto.randomUUID(),
    // Brew Days
    brewHazy:       crypto.randomUUID(),
    brewPivot:      crypto.randomUUID(),
    brewStout:      crypto.randomUUID(),
    brewBaseline:   crypto.randomUUID(),
    // Vessels
    vessel1:        crypto.randomUUID(),
    vessel2:        crypto.randomUUID(),
    vessel3:        crypto.randomUUID(),
    vessel4:        crypto.randomUUID(),
    // Fermentations
    fermHazy:       crypto.randomUUID(),
    fermPivot:      crypto.randomUUID(),
    fermStout:      crypto.randomUUID(),
    // Packaging
    pkgHazy:        crypto.randomUUID(),
    bpkgHazy:       crypto.randomUUID(),
    pkgPivot:       crypto.randomUUID(),
    bpkgPivot:      crypto.randomUUID(),
    // Distribution accounts
    distRetailer1:  crypto.randomUUID(),
    distRetailer2:  crypto.randomUUID(),
    distBar1:       crypto.randomUUID(),
    distTaproom:    crypto.randomUUID(),
    // Staff
    staffAlex:      crypto.randomUUID(),
    staffJordan:    crypto.randomUUID(),
    staffSam:       crypto.randomUUID(),
    staffCasey:     crypto.randomUUID(),
    staffRiley:     crypto.randomUUID(),
    // Training
    progRas:        crypto.randomUUID(),
    progFh:         crypto.randomUUID(),
    // Bills
    billSb412:      crypto.randomUUID(),
    billHb1205:     crypto.randomUUID(),
  }

  const b = breweryId

  const _today = new Date()
  const _expiringSoon45 = new Date(_today); _expiringSoon45.setDate(_today.getDate() + 45)
  const expiringSoon45Str = _expiringSoon45.toISOString().split('T')[0]
  const _expiringSoon40 = new Date(_today); _expiringSoon40.setDate(_today.getDate() + 40)
  const expiringSoon40Str = _expiringSoon40.toISOString().split('T')[0]
  const _expired30 = new Date(_today); _expired30.setDate(_today.getDate() - 30)
  const expiredStr = _expired30.toISOString().split('T')[0]

  // Scheduled brew date 7 days from now
  const _scheduledBrew = new Date(_today); _scheduledBrew.setDate(_today.getDate() + 7)
  const scheduledBrewStr = _scheduledBrew.toISOString().split('T')[0]

  console.log('Demo brewery ID:', breweryId)

  try {
    // ── Ingredients (10) ──────────────────────────────────────────────────────
    const { error: ingErr } = await svc.from('ingredients').insert([
      { id: ids.ingPale,       brewery_id: b, name: 'Pale Malt 2-Row',  category: 'Malt/Grain', unit: 'lb',     current_price_per_unit: 0.65, current_stock_quantity: 2000, stock_unit: 'lb',     reorder_threshold: 500, is_active: true },
      { id: ids.ingMunich,     brewery_id: b, name: 'Munich Malt',       category: 'Malt/Grain', unit: 'lb',     current_price_per_unit: 0.85, current_stock_quantity: 500,  stock_unit: 'lb',     reorder_threshold: 200, is_active: true },
      { id: ids.ingCrystal,    brewery_id: b, name: 'Crystal 60L',       category: 'Malt/Grain', unit: 'lb',     current_price_per_unit: 0.95, current_stock_quantity: 200,  stock_unit: 'lb',     reorder_threshold: 100, is_active: true },
      { id: ids.ingRoasted,    brewery_id: b, name: 'Roasted Barley',    category: 'Malt/Grain', unit: 'lb',     current_price_per_unit: 1.10, current_stock_quantity: 150,  stock_unit: 'lb',     reorder_threshold: 75,  is_active: true },
      { id: ids.ingOats,       brewery_id: b, name: 'Flaked Oats',       category: 'Adjunct',    unit: 'lb',     current_price_per_unit: 0.70, current_stock_quantity: 300,  stock_unit: 'lb',     reorder_threshold: 100, is_active: true },
      { id: ids.ingCentennial, brewery_id: b, name: 'Centennial Hops',   category: 'Hops',       unit: 'oz',     current_price_per_unit: 2.10, current_stock_quantity: 32,   stock_unit: 'oz',     reorder_threshold: 16,  is_active: true },
      { id: ids.ingCascade,    brewery_id: b, name: 'Cascade Hops',      category: 'Hops',       unit: 'oz',     current_price_per_unit: 1.85, current_stock_quantity: 25,   stock_unit: 'oz',     reorder_threshold: 30,  is_active: true },
      { id: ids.ingCitra,      brewery_id: b, name: 'Citra Hops',        category: 'Hops',       unit: 'oz',     current_price_per_unit: 2.75, current_stock_quantity: 20,   stock_unit: 'oz',     reorder_threshold: 25,  is_active: true },
      { id: ids.ingMosaic,     brewery_id: b, name: 'Mosaic Hops',       category: 'Hops',       unit: 'oz',     current_price_per_unit: 3.00, current_stock_quantity: 30,   stock_unit: 'oz',     reorder_threshold: 20,  is_active: true },
      { id: ids.ingUs05,       brewery_id: b, name: 'US-05 Dry Yeast',   category: 'Yeast',      unit: 'packet', current_price_per_unit: 4.50, current_stock_quantity: 12,   stock_unit: 'packet', reorder_threshold: 4,   is_active: true },
    ])
    check(ingErr, 'insert ingredients')

    // ── Recipes (4 + version 2 of Hazy IPA) ──────────────────────────────────
    const { error: recErr } = await svc.from('recipes').insert([
      { id: ids.recipeHazy,     brewery_id: b, name: 'Adaptive Hazy IPA', style: 'New England IPA',  base_batch_size: 15, base_batch_size_unit: 'barrels', target_og: 1.065, target_fg: 1.012, target_abv: 6.8, target_ibu: 45, target_margin_percentage: 65, version: 1, is_current_version: false },
      { id: ids.recipeHazyV2,   brewery_id: b, name: 'Adaptive Hazy IPA', style: 'New England IPA',  base_batch_size: 15, base_batch_size_unit: 'barrels', target_og: 1.065, target_fg: 1.012, target_abv: 6.8, target_ibu: 45, target_margin_percentage: 65, version: 2, is_current_version: true,  parent_recipe_id: ids.recipeHazy, version_notes: 'Increased Citra dry hop rate by 20% — responding to customer feedback on aroma. Added Mosaic dry hop.' },
      { id: ids.recipePivot,    brewery_id: b, name: 'Pivot Pale Ale',     style: 'American Pale Ale', base_batch_size: 15, base_batch_size_unit: 'barrels', target_og: 1.052, target_fg: 1.010, target_abv: 5.5, target_ibu: 35, target_margin_percentage: 60, version: 1, is_current_version: true },
      { id: ids.recipeStout,    brewery_id: b, name: 'Margin Stout',       style: 'American Stout',   base_batch_size: 10, base_batch_size_unit: 'barrels', target_og: 1.072, target_fg: 1.016, target_abv: 7.3, target_ibu: 40, target_margin_percentage: 62, version: 1, is_current_version: true },
      { id: ids.recipeBaseline, brewery_id: b, name: 'Baseline Lager',     style: 'American Lager',   base_batch_size: 20, base_batch_size_unit: 'barrels', target_og: 1.048, target_fg: 1.008, target_abv: 5.2, target_ibu: 18, target_margin_percentage: 55, version: 1, is_current_version: true },
    ])
    check(recErr, 'insert recipes')

    // ── Recipe Ingredients ────────────────────────────────────────────────────
    const { error: riErr } = await svc.from('recipe_ingredients').insert([
      // Adaptive Hazy IPA v2
      { brewery_id: b, recipe_id: ids.recipeHazyV2,   ingredient_id: ids.ingPale,       ingredient_name: 'Pale Malt 2-Row', amount: 650,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeHazyV2,   ingredient_id: ids.ingOats,       ingredient_name: 'Flaked Oats',     amount: 250,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeHazyV2,   ingredient_id: ids.ingCitra,      ingredient_name: 'Citra Hops',      amount: 60,   unit: 'oz',     addition_type: 'Dry Hop' },
      { brewery_id: b, recipe_id: ids.recipeHazyV2,   ingredient_id: ids.ingMosaic,     ingredient_name: 'Mosaic Hops',     amount: 30,   unit: 'oz',     addition_type: 'Dry Hop' },
      { brewery_id: b, recipe_id: ids.recipeHazyV2,   ingredient_id: ids.ingUs05,       ingredient_name: 'US-05 Dry Yeast', amount: 4,    unit: 'packet', addition_type: 'Fermentation' },
      // Pivot Pale Ale
      { brewery_id: b, recipe_id: ids.recipePivot,    ingredient_id: ids.ingPale,       ingredient_name: 'Pale Malt 2-Row', amount: 900,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipePivot,    ingredient_id: ids.ingCrystal,    ingredient_name: 'Crystal 60L',     amount: 100,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipePivot,    ingredient_id: ids.ingMunich,     ingredient_name: 'Munich Malt',     amount: 100,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipePivot,    ingredient_id: ids.ingCascade,    ingredient_name: 'Cascade Hops',    amount: 45,   unit: 'oz',     addition_type: 'Boil' },
      { brewery_id: b, recipe_id: ids.recipePivot,    ingredient_id: ids.ingUs05,       ingredient_name: 'US-05 Dry Yeast', amount: 4,    unit: 'packet', addition_type: 'Fermentation' },
      // Margin Stout
      { brewery_id: b, recipe_id: ids.recipeStout,    ingredient_id: ids.ingPale,       ingredient_name: 'Pale Malt 2-Row', amount: 500,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeStout,    ingredient_id: ids.ingMunich,     ingredient_name: 'Munich Malt',     amount: 100,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeStout,    ingredient_id: ids.ingRoasted,    ingredient_name: 'Roasted Barley',  amount: 75,   unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeStout,    ingredient_id: ids.ingCrystal,    ingredient_name: 'Crystal 60L',     amount: 50,   unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeStout,    ingredient_id: ids.ingCascade,    ingredient_name: 'Cascade Hops',    amount: 20,   unit: 'oz',     addition_type: 'Boil' },
      { brewery_id: b, recipe_id: ids.recipeStout,    ingredient_id: ids.ingUs05,       ingredient_name: 'US-05 Dry Yeast', amount: 3,    unit: 'packet', addition_type: 'Fermentation' },
      // Baseline Lager
      { brewery_id: b, recipe_id: ids.recipeBaseline, ingredient_id: ids.ingPale,       ingredient_name: 'Pale Malt 2-Row', amount: 1200, unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeBaseline, ingredient_id: ids.ingMunich,     ingredient_name: 'Munich Malt',     amount: 200,  unit: 'lb',     addition_type: 'Mash' },
      { brewery_id: b, recipe_id: ids.recipeBaseline, ingredient_id: ids.ingCascade,    ingredient_name: 'Cascade Hops',    amount: 20,   unit: 'oz',     addition_type: 'Boil' },
      { brewery_id: b, recipe_id: ids.recipeBaseline, ingredient_id: ids.ingUs05,       ingredient_name: 'US-05 Dry Yeast', amount: 5,    unit: 'packet', addition_type: 'Fermentation' },
    ])
    check(riErr, 'insert recipe_ingredients')

    // ── Brew Days (3 completed + 1 scheduled) ─────────────────────────────────
    const { error: bdErr } = await svc.from('brew_days').insert([
      { id: ids.brewHazy,  brewery_id: b, batch_number: 'ADP-2026-001', recipe_id: ids.recipeHazyV2,  recipe_name: 'Adaptive Hazy IPA', beer_style: 'New England IPA',   status: 'completed', brew_date: '2026-03-10', planned_batch_size: 15, planned_batch_unit: 'barrels', target_og: 1.065, target_brewhouse_efficiency: 75, actual_og: 1.066, actual_brewhouse_efficiency: 74, volume_into_fermenter: 14.8, yeast_strain: 'US-05', brewer_name: 'Alex Rivera' },
      { id: ids.brewPivot, brewery_id: b, batch_number: 'ADP-2026-002', recipe_id: ids.recipePivot,   recipe_name: 'Pivot Pale Ale',    beer_style: 'American Pale Ale', status: 'completed', brew_date: '2026-04-07', planned_batch_size: 15, planned_batch_unit: 'barrels', target_og: 1.052, target_brewhouse_efficiency: 75, actual_og: 1.053, actual_brewhouse_efficiency: 72, volume_into_fermenter: 14.5, yeast_strain: 'US-05', brewer_name: 'Alex Rivera' },
      { id: ids.brewStout, brewery_id: b, batch_number: 'ADP-2026-003', recipe_id: ids.recipeStout,   recipe_name: 'Margin Stout',      beer_style: 'American Stout',    status: 'completed', brew_date: '2026-05-01', planned_batch_size: 10, planned_batch_unit: 'barrels', target_og: 1.072, target_brewhouse_efficiency: 73, actual_og: 1.071, actual_brewhouse_efficiency: 71, volume_into_fermenter: 9.8,  yeast_strain: 'US-05', brewer_name: 'Sam Patel' },
      { id: ids.brewBaseline, brewery_id: b, batch_number: 'ADP-2026-004', recipe_id: ids.recipeBaseline, recipe_name: 'Baseline Lager',    beer_style: 'American Lager',    status: 'scheduled', brew_date: scheduledBrewStr, planned_batch_size: 20, planned_batch_unit: 'barrels', target_og: 1.048, target_brewhouse_efficiency: 75, yeast_strain: 'US-05', brewer_name: 'Alex Rivera' },
    ])
    check(bdErr, 'insert brew_days')

    // ── Fermentation Vessels (4) ──────────────────────────────────────────────
    const { error: vErr } = await svc.from('fermentation_vessels').insert([
      { id: ids.vessel1, brewery_id: b, vessel_name: 'Primary Conical 1', vessel_type: 'Conical Fermenter', capacity: 15, capacity_unit: 'barrels', has_temperature_control: true },
      { id: ids.vessel2, brewery_id: b, vessel_name: 'Primary Conical 2', vessel_type: 'Conical Fermenter', capacity: 15, capacity_unit: 'barrels', has_temperature_control: true },
      { id: ids.vessel3, brewery_id: b, vessel_name: 'Uni-Tank A',        vessel_type: 'Unitank',           capacity: 30, capacity_unit: 'barrels', has_temperature_control: true },
      { id: ids.vessel4, brewery_id: b, vessel_name: 'Bright Tank 1',     vessel_type: 'Bright Tank',       capacity: 10, capacity_unit: 'barrels', has_temperature_control: true },
    ])
    check(vErr, 'insert fermentation_vessels')

    // ── Fermentations (1 conditioning + 1 ready to package + 1 fermenting) ───
    const { error: fErr } = await svc.from('fermentations').insert([
      { id: ids.fermHazy,  brewery_id: b, brew_day_id: ids.brewHazy,  vessel_id: ids.vessel1, batch_number: 'ADP-2026-001', beer_name: 'Adaptive Hazy IPA', status: 'conditioning',     volume_in_fermenter: 14.8, actual_og: 1.066, actual_fg: 1.013, pitch_date: '2026-03-10' },
      { id: ids.fermPivot, brewery_id: b, brew_day_id: ids.brewPivot, vessel_id: ids.vessel2, batch_number: 'ADP-2026-002', beer_name: 'Pivot Pale Ale',    status: 'ready_to_package', volume_in_fermenter: 14.5, actual_og: 1.053, actual_fg: 1.010, pitch_date: '2026-04-07' },
      { id: ids.fermStout, brewery_id: b, brew_day_id: ids.brewStout, vessel_id: ids.vessel3, batch_number: 'ADP-2026-003', beer_name: 'Margin Stout',      status: 'fermenting',       volume_in_fermenter: 9.8,  actual_og: 1.071,                   pitch_date: '2026-05-01' },
    ])
    check(fErr, 'insert fermentations')

    // ── Gravity Readings ──────────────────────────────────────────────────────
    const { error: grErr } = await svc.from('gravity_readings').insert([
      // Adaptive Hazy IPA — complete fermentation curve
      { brewery_id: b, fermentation_id: ids.fermHazy,  reading_date: '2026-03-11', gravity: 1.056, temperature: 68 },
      { brewery_id: b, fermentation_id: ids.fermHazy,  reading_date: '2026-03-13', gravity: 1.032, temperature: 69 },
      { brewery_id: b, fermentation_id: ids.fermHazy,  reading_date: '2026-03-16', gravity: 1.018, temperature: 70 },
      { brewery_id: b, fermentation_id: ids.fermHazy,  reading_date: '2026-03-19', gravity: 1.013, temperature: 70 },
      { brewery_id: b, fermentation_id: ids.fermHazy,  reading_date: '2026-03-22', gravity: 1.013, temperature: 68 },
      // Pivot Pale Ale — complete curve showing ready to package
      { brewery_id: b, fermentation_id: ids.fermPivot, reading_date: '2026-04-08', gravity: 1.042, temperature: 66 },
      { brewery_id: b, fermentation_id: ids.fermPivot, reading_date: '2026-04-11', gravity: 1.025, temperature: 68 },
      { brewery_id: b, fermentation_id: ids.fermPivot, reading_date: '2026-04-15', gravity: 1.012, temperature: 68 },
      { brewery_id: b, fermentation_id: ids.fermPivot, reading_date: '2026-04-18', gravity: 1.010, temperature: 68 },
      // Margin Stout — in progress, FG not reached
      { brewery_id: b, fermentation_id: ids.fermStout, reading_date: '2026-05-02', gravity: 1.058, temperature: 68 },
      { brewery_id: b, fermentation_id: ids.fermStout, reading_date: '2026-05-05', gravity: 1.038, temperature: 69 },
      { brewery_id: b, fermentation_id: ids.fermStout, reading_date: '2026-05-08', gravity: 1.025, temperature: 69 },
    ])
    check(grErr, 'insert gravity_readings')

    // ── Batch Package ─────────────────────────────────────────────────────────
    const { error: bpErr } = await svc.from('batch_packages').insert([
      { id: ids.bpkgHazy, brewery_id: b, fermentation_id: ids.fermHazy, brew_day_id: ids.brewHazy, batch_number: 'ADP-2026-001', beer_name: 'Adaptive Hazy IPA', beer_style: 'New England IPA', packaging_date: '2026-03-28', total_volume_packaged: 14.2, total_volume_fermented: 14.8, volume_unit: 'barrels', status: 'complete' },
    ])
    check(bpErr, 'insert batch_packages')

    // ── Packaging Runs ────────────────────────────────────────────────────────
    const { error: prErr } = await svc.from('packaging_runs').insert([
      { id: ids.pkgHazy,  brewery_id: b, fermentation_id: ids.fermHazy,  batch_package_id: ids.bpkgHazy, batch_number: 'ADP-2026-001', beer_name: 'Adaptive Hazy IPA', beer_style: 'New England IPA',   packaging_date: '2026-03-28',                              status: 'complete', volume_from_fermenter: 14.8, total_volume_packaged: 14.2, packaging_yield_percentage: 95.9, recipe_cost_per_pint: 0.95, actual_splits: [{ type: '16oz Cans', units: 1820 }, { type: '1/6 barrel keg', units: 24 }, { type: 'Taproom Draft 16oz', units: 185 }], planned_splits: [{ type: '16oz Cans', units: 1860 }, { type: '1/6 barrel keg', units: 24 }, { type: 'Taproom Draft 16oz', units: 185 }] },
      // Pivot Pale Ale — planned packaging run (ready to package)
      { id: ids.pkgPivot, brewery_id: b, fermentation_id: ids.fermPivot,                                  batch_number: 'ADP-2026-002', beer_name: 'Pivot Pale Ale',    beer_style: 'American Pale Ale', packaging_date: new Date().toISOString().split('T')[0], status: 'planned',  volume_from_fermenter: 14.5,                                                   recipe_cost_per_pint: 0.82,                                                                                                                                                                                                                            planned_splits: [{ type: '16oz Cans', units: 1780 }, { type: '1/6 barrel keg', units: 20 }, { type: 'Taproom Draft 16oz', units: 160 }] },
    ])
    check(prErr, 'insert packaging_runs')

    // ── Package Splits ────────────────────────────────────────────────────────
    const { error: psErr } = await svc.from('package_splits').insert([
      { batch_package_id: ids.bpkgHazy, brewery_id: b, package_type: '16oz Cans',          units_packaged: 1820, volume_per_unit: 0.0123, total_volume: 22.4,  destination: 'distribution' },
      { batch_package_id: ids.bpkgHazy, brewery_id: b, package_type: '1/6 barrel keg',     units_packaged: 24,   volume_per_unit: 5.167,  total_volume: 124.0, destination: 'distribution' },
      { batch_package_id: ids.bpkgHazy, brewery_id: b, package_type: 'Taproom Draft 16oz', units_packaged: 185,  volume_per_unit: 0.0123, total_volume: 2.3,   destination: 'taproom' },
    ])
    check(psErr, 'insert package_splits')

    // ── Distribution Accounts (4) ─────────────────────────────────────────────
    const { error: daErr } = await svc.from('distribution_accounts').insert([
      { id: ids.distRetailer1, brewery_id: b, account_name: 'The Taproom District',        account_type: 'bar',      contact_name: 'Marcus Webb',  contact_email: 'marcus@taproomdistrict.example', contact_phone: '555-0201', payment_terms: 'net_30', is_active: true, pricing: [{ package_type: '1/6 barrel keg',     price_per_unit: 145.00 }] },
      { id: ids.distRetailer2, brewery_id: b, account_name: 'Independent Bottle Shop',     account_type: 'retailer', contact_name: 'Sarah Kim',    contact_email: 'sarah@indbottle.example',         contact_phone: '555-0202', payment_terms: 'net_15', is_active: true, pricing: [{ package_type: '16oz Cans',           price_per_unit: 1.85   }] },
      { id: ids.distBar1,      brewery_id: b, account_name: 'Craft & Draft Bar',           account_type: 'bar',      contact_name: 'Dave Torres',  contact_email: 'dave@craftdraft.example',          contact_phone: '555-0203', payment_terms: 'cod',    is_active: true, pricing: [{ package_type: '1/6 barrel keg',     price_per_unit: 140.00 }] },
      { id: ids.distTaproom,   brewery_id: b, account_name: 'Adaptive Taproom (in-house)', account_type: 'taproom',  is_active: true,                                                                                                                                              pricing: [{ package_type: 'Taproom Draft 16oz', price_per_unit: 7.50   }] },
    ])
    check(daErr, 'insert distribution_accounts')

    // ── Distribution Records (5) ──────────────────────────────────────────────
    const { error: drErr } = await svc.from('distribution_records').insert([
      { brewery_id: b, batch_package_id: ids.bpkgHazy, account_id: ids.distRetailer1, account_name: 'The Taproom District',        account_type: 'bar',      package_type: '1/6 barrel keg',     quantity: 10,  delivery_date: '2026-03-30', sale_price_per_unit: 145.00, ingredient_cost_per_unit: 0.95, returnable_kegs: true,  keg_return_date: new Date(new Date('2026-03-30').getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
      { brewery_id: b, batch_package_id: ids.bpkgHazy, account_id: ids.distRetailer2, account_name: 'Independent Bottle Shop',     account_type: 'retailer', package_type: '16oz Cans',          quantity: 240, delivery_date: '2026-03-30', sale_price_per_unit: 1.85,   ingredient_cost_per_unit: 0.95 },
      { brewery_id: b, batch_package_id: ids.bpkgHazy, account_id: ids.distBar1,      account_name: 'Craft & Draft Bar',           account_type: 'bar',      package_type: '1/6 barrel keg',     quantity: 8,   delivery_date: '2026-04-01', sale_price_per_unit: 140.00, ingredient_cost_per_unit: 0.95, returnable_kegs: true,  keg_return_date: new Date(new Date('2026-04-01').getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
      { brewery_id: b, batch_package_id: ids.bpkgHazy, account_id: ids.distTaproom,   account_name: 'Adaptive Taproom (in-house)', account_type: 'taproom',  package_type: 'Taproom Draft 16oz', quantity: 185, delivery_date: '2026-03-28', sale_price_per_unit: 7.50,   ingredient_cost_per_unit: 0.95 },
      { brewery_id: b, batch_package_id: ids.bpkgHazy, account_id: ids.distRetailer1, account_name: 'The Taproom District',        account_type: 'bar',      package_type: '1/6 barrel keg',     quantity: 6,   delivery_date: '2026-04-05', sale_price_per_unit: 145.00, ingredient_cost_per_unit: 0.95, returnable_kegs: true,  keg_return_date: new Date(new Date('2026-04-05').getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
    ])
    check(drErr, 'insert distribution_records')

    // ── Taproom Events (3 completed + 2 upcoming) ─────────────────────────────
    const _nextFriday = new Date(_today)
    _nextFriday.setDate(_today.getDate() + (5 - _today.getDay() + 7) % 7 || 7)
    const nextFridayStr = _nextFriday.toISOString().split('T')[0]
    const _threeWeeks = new Date(_today); _threeWeeks.setDate(_today.getDate() + 21)
    const threeWeeksStr = _threeWeeks.toISOString().split('T')[0]

    const { error: teErr } = await svc.from('taproom_events').insert([
      { brewery_id: b, event_name: 'Live Music Friday',         event_type: 'live_music',   event_date: '2026-04-04', status: 'completed', expected_attendance: 140, actual_attendance: 142, estimated_beer_revenue: 1900, actual_beer_revenue: 1920, entertainment_cost: 400, marketing_cost: 50,  staffing_cost: 480 },
      { brewery_id: b, event_name: 'Trivia Night',              event_type: 'recurring',    event_date: '2026-04-15', status: 'completed', expected_attendance: 80,  actual_attendance: 85,  estimated_beer_revenue: 950,  actual_beer_revenue: 975,  entertainment_cost: 150, marketing_cost: 30,  staffing_cost: 300 },
      { brewery_id: b, event_name: 'Adaptive Hazy IPA Release', event_type: 'beer_release', event_date: '2026-04-19', status: 'completed', expected_attendance: 200, actual_attendance: 195, estimated_beer_revenue: 2400, actual_beer_revenue: 2340, entertainment_cost: 200, marketing_cost: 250, staffing_cost: 600 },
      { brewery_id: b, event_name: 'Live Music Friday',         event_type: 'live_music',   event_date: nextFridayStr, status: 'confirmed', expected_attendance: 150, estimated_beer_revenue: 2000, entertainment_cost: 400, marketing_cost: 50,  staffing_cost: 480 },
      { brewery_id: b, event_name: 'Baseline Lager Release',    event_type: 'beer_release', event_date: threeWeeksStr, status: 'confirmed', expected_attendance: 220, estimated_beer_revenue: 2600, entertainment_cost: 200, marketing_cost: 300, staffing_cost: 600 },
    ])
    check(teErr, 'insert taproom_events')

    // ── Wholesale Accounts (3) ────────────────────────────────────────────────
    const { error: waErr } = await svc.from('wholesale_accounts').insert([
      { brewery_id: b, account_name: 'The Taproom District',    account_type: 'bar',      status: 'active', contacts: [{ name: 'Marcus Webb',  phone: '555-0201', email: 'marcus@taproomdistrict.example', title: 'Buyer' }],   last_contact_date: '2026-05-01', next_followup_date: new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], relationship_notes: 'Best account — orders consistently, pays on time' },
      { brewery_id: b, account_name: 'Independent Bottle Shop', account_type: 'retailer', status: 'active', contacts: [{ name: 'Sarah Kim',   phone: '555-0202', email: 'sarah@indbottle.example',         title: 'Owner' }],   last_contact_date: '2026-05-01', next_followup_date: new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
      { brewery_id: b, account_name: 'Craft & Draft Bar',       account_type: 'bar',      status: 'active', contacts: [{ name: 'Dave Torres', phone: '555-0203', email: 'dave@craftdraft.example',          title: 'Manager' }], last_contact_date: '2026-04-28', next_followup_date: new Date(new Date().getTime() + 7  * 24 * 60 * 60 * 1000).toISOString().split('T')[0], relationship_notes: 'Slow keg returns — follow up on outstanding kegs' },
    ])
    check(waErr, 'insert wholesale_accounts')

    // ── Staff Members (5) ─────────────────────────────────────────────────────
    const { error: smErr } = await svc.from('staff_members').insert([
      { id: ids.staffAlex,   brewery_id: b, first_name: 'Alex',   last_name: 'Rivera', role: 'head_brewer',     employment_type: 'full_time', status: 'active', is_active: true, start_date: '2019-03-15', phone: '555-0101', email: 'alex@adaptivebrewing.com' },
      { id: ids.staffJordan, brewery_id: b, first_name: 'Jordan', last_name: 'Lee',    role: 'taproom_manager', employment_type: 'full_time', status: 'active', is_active: true, start_date: '2020-06-01', phone: '555-0102', email: 'jordan@adaptivebrewing.com' },
      { id: ids.staffSam,    brewery_id: b, first_name: 'Sam',    last_name: 'Patel',  role: 'assistant_brewer', employment_type: 'full_time', status: 'active', is_active: true, start_date: '2021-09-01', phone: '555-0103', email: 'sam@adaptivebrewing.com' },
      { id: ids.staffCasey,  brewery_id: b, first_name: 'Casey',  last_name: 'Morgan', role: 'taproom_staff',   employment_type: 'part_time', status: 'active', is_active: true, start_date: '2023-02-15', phone: '555-0104', email: 'casey@adaptivebrewing.com' },
      { id: ids.staffRiley,  brewery_id: b, first_name: 'Riley',  last_name: 'Kim',    role: 'taproom_staff',   employment_type: 'part_time', status: 'active', is_active: true, start_date: '2024-01-10', phone: '555-0105', email: 'riley@adaptivebrewing.com' },
    ])
    check(smErr, 'insert staff_members')

    // ── Staff Certifications ──────────────────────────────────────────────────
    const { error: scErr } = await svc.from('staff_certifications').insert([
      { brewery_id: b, staff_member_id: ids.staffAlex,   certification_type: 'other', certification_name: 'OSHA 10-Hour General Industry',              certification_provider: 'OSHA',                            issuing_organization: 'OSHA',                            completion_date: '2024-01-15', issue_date: '2024-01-15', expiration_date: '2027-01-15',      status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffAlex,   certification_type: 'other', certification_name: 'Cicerone — Certified Beer Server (CBS)',     certification_provider: 'Cicerone Certification Program',  issuing_organization: 'Cicerone Certification Program',  completion_date: '2022-06-01', issue_date: '2022-06-01', expiration_date: null,              status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffAlex,   certification_type: 'other', certification_name: 'CPR / First Aid / AED',                     certification_provider: 'American Red Cross',              issuing_organization: 'American Red Cross',              completion_date: '2025-03-01', issue_date: '2025-03-01', expiration_date: '2027-03-01',      status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffJordan, certification_type: 'other', certification_name: 'TIPS (Training for Intervention Procedures)', certification_provider: 'TIPS',                           issuing_organization: 'TIPS',                            completion_date: '2024-05-10', issue_date: '2024-05-10', expiration_date: '2027-05-10',      status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffJordan, certification_type: 'other', certification_name: 'ServSafe Food Manager',                     certification_provider: 'National Restaurant Association', issuing_organization: 'National Restaurant Association', completion_date: '2022-08-20', issue_date: '2022-08-20', expiration_date: '2027-08-20',      status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffJordan, certification_type: 'other', certification_name: 'Cicerone — Certified Beer Server (CBS)',     certification_provider: 'Cicerone Certification Program',  issuing_organization: 'Cicerone Certification Program',  completion_date: '2021-11-15', issue_date: '2021-11-15', expiration_date: null,              status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffSam,    certification_type: 'other', certification_name: 'OSHA 10-Hour General Industry',              certification_provider: 'OSHA',                            issuing_organization: 'OSHA',                            completion_date: '2022-04-10', issue_date: '2022-04-10', expiration_date: expiringSoon45Str, status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffSam,    certification_type: 'other', certification_name: 'CPR / First Aid / AED',                     certification_provider: 'American Red Cross',              issuing_organization: 'American Red Cross',              completion_date: '2022-04-10', issue_date: '2022-04-10', expiration_date: expiredStr,        status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffCasey,  certification_type: 'other', certification_name: 'ServSafe Alcohol',                          certification_provider: 'National Restaurant Association', issuing_organization: 'National Restaurant Association', completion_date: '2022-11-01', issue_date: '2022-11-01', expiration_date: expiredStr,        status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffCasey,  certification_type: 'other', certification_name: 'TIPS (Training for Intervention Procedures)', certification_provider: 'TIPS',                           issuing_organization: 'TIPS',                            completion_date: '2022-11-01', issue_date: '2022-11-01', expiration_date: expiredStr,        status: 'active' },
      { brewery_id: b, staff_member_id: ids.staffRiley,  certification_type: 'other', certification_name: 'ServSafe Alcohol',                          certification_provider: 'National Restaurant Association', issuing_organization: 'National Restaurant Association', completion_date: '2024-01-15', issue_date: '2024-01-15', expiration_date: expiringSoon40Str, status: 'active' },
    ])
    check(scErr, 'insert staff_certifications')

    // ── Training Programs ─────────────────────────────────────────────────────
    const { error: tpErr } = await svc.from('training_programs').insert([
      { id: ids.progRas, brewery_id: b, program_name: 'Responsible Alcohol Service', program_type: 'compliance', is_required: true, renewal_required: true, renewal_period_months: 24 },
      { id: ids.progFh,  brewery_id: b, program_name: 'Food Handler Certification',  program_type: 'safety',    is_required: true, renewal_required: true, renewal_period_months: 36 },
    ])
    check(tpErr, 'insert training_programs')

    // ── Staff Training Records ────────────────────────────────────────────────
    const { error: strErr } = await svc.from('staff_training_records').insert([
      { brewery_id: b, staff_member_id: ids.staffAlex,   staff_name: 'Alex Rivera',  staff_role: 'Head Brewer',     program_id: ids.progRas, program_name: 'Responsible Alcohol Service', completion_date: '2025-01-15', expiration_date: '2027-01-15', passed: true },
      { brewery_id: b, staff_member_id: ids.staffJordan, staff_name: 'Jordan Lee',   staff_role: 'Taproom Manager', program_id: ids.progRas, program_name: 'Responsible Alcohol Service', completion_date: '2025-03-01', expiration_date: '2027-03-01', passed: true },
      { brewery_id: b, staff_member_id: ids.staffCasey,  staff_name: 'Casey Morgan', staff_role: 'Taproom Staff',   program_id: ids.progRas, program_name: 'Responsible Alcohol Service', completion_date: '2025-06-10', expiration_date: '2027-06-10', passed: true },
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
      { brewery_id: b, permit_name: 'City Business License', permit_type: 'business_license', issuing_authority: 'City of Springfield', permit_number: 'BL-2025-003847', issue_date: '2025-01-01', expiration_date: '2026-12-31', renewal_fee: 75,  auto_renews: true,  is_active: true },
      { brewery_id: b, permit_name: 'Outdoor Patio Permit',  permit_type: 'outdoor_seating',  issuing_authority: 'City of Springfield', permit_number: 'OP-2025-00912',  issue_date: '2025-04-01', expiration_date: '2025-10-31', renewal_fee: 150, auto_renews: false, is_active: true },
    ])
    check(lpErr, 'insert local_permits')

    // ── Taproom Metrics (6 months showing recovery story) ─────────────────────
    const { error: tmErr } = await svc.from('taproom_metrics').insert([
      { brewery_id: b, metric_month: '2025-12-01', taproom_revenue: 16200, total_transactions: 1080, num_operating_days: 22, labor_cost: 5800, labor_hours: 220 },
      { brewery_id: b, metric_month: '2026-01-01', taproom_revenue: 17100, total_transactions: 1140, num_operating_days: 22, labor_cost: 5900, labor_hours: 224 },
      { brewery_id: b, metric_month: '2026-02-01', taproom_revenue: 18400, total_transactions: 1230, num_operating_days: 23, labor_cost: 6000, labor_hours: 228 },
      { brewery_id: b, metric_month: '2026-03-01', taproom_revenue: 19200, total_transactions: 1280, num_operating_days: 23, labor_cost: 6100, labor_hours: 232 },
      { brewery_id: b, metric_month: '2026-04-01', taproom_revenue: 21300, total_transactions: 1420, num_operating_days: 24, labor_cost: 6200, labor_hours: 236 },
      { brewery_id: b, metric_month: '2026-05-01', taproom_revenue: 22800, total_transactions: 1520, num_operating_days: 24, labor_cost: 6300, labor_hours: 240 },
    ])
    check(tmErr, 'insert taproom_metrics')

    // ── Excise Tax Periods ────────────────────────────────────────────────────
    const { error: etErr } = await svc.from('excise_tax_periods').insert([
      { brewery_id: b, period_year: 2026, period_number: 1, period_type: 'quarterly', barrels_removed_sale: 42, tax_rate_applied: 3.50, tax_owed: 147.00, status: 'paid',      filed_date: '2026-04-10', payment_date: '2026-04-10' },
      { brewery_id: b, period_year: 2026, period_number: 2, period_type: 'quarterly', barrels_removed_sale: 28, tax_rate_applied: 3.50, tax_owed: 98.00,  status: 'estimated' },
    ])
    check(etErr, 'insert excise_tax_periods')

    // ── Keg Fleet ─────────────────────────────────────────────────────────────
    const { error: kfErr } = await svc.from('keg_fleet').insert([
      { brewery_id: b, keg_type: 'Half Barrel (15.5 gal)',  owned_count: 25, deposit_amount: 30.00 },
      { brewery_id: b, keg_type: 'Sixth Barrel (5.16 gal)', owned_count: 40, deposit_amount: 25.00 },
    ])
    check(kfErr, 'insert keg_fleet')

    // ── Keg Deposit Records ───────────────────────────────────────────────────
    // total_deposit_held is a generated column — do not insert it
    const { error: kdErr } = await svc.from('keg_deposit_records').insert([
      { brewery_id: b, account_name: 'The Taproom District', keg_type: 'Sixth Barrel (5.16 gal)', kegs_out: 16, deposit_per_keg: 25.00 },
      { brewery_id: b, account_name: 'Craft & Draft Bar',    keg_type: 'Sixth Barrel (5.16 gal)', kegs_out: 8,  deposit_per_keg: 25.00 },
    ])
    check(kdErr, 'insert keg_deposit_records')

    // ── Tracked Bills ─────────────────────────────────────────────────────────
    const { error: tbErr } = await svc.from('tracked_bills').insert([
      { id: ids.billSb412,  brewery_id: b, jurisdiction: 'State',   state: 'IL', bill_number: 'SB 1847', short_title: 'Craft Brewery Taproom Expansion Act', full_description: 'Would allow craft breweries under 15,000 barrels to sell to-go beer without a separate retail license. Currently requires a $12,000 annual retail license.', bill_url: 'https://www.ilga.gov',       date_introduced: '2026-01-15', status: 'In Committee', priority: 'A', business_impact: 'High',   impact_area: 'Taproom',    next_key_date: new Date(new Date().getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], next_action: 'Contact committee chair — brief guild lobbyist this week',                            guild_aware: 'Yes' },
      { id: ids.billHb1205, brewery_id: b, jurisdiction: 'Federal',            bill_number: 'HR 4521',  short_title: 'Small Brewer Reinvestment Act',       full_description: 'Would permanently extend the $3.50/bbl reduced excise tax rate and expand eligibility threshold from 60,000 to 100,000 barrels.',                                        bill_url: 'https://www.congress.gov', date_introduced: '2026-02-03', status: 'Introduced',   priority: 'B', business_impact: 'Medium', impact_area: 'Excise Tax', next_key_date: new Date(new Date().getTime() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], next_action: 'Monitor — contact guild for coordinated response if moves to committee', guild_aware: 'Notified' },
    ])
    check(tbErr, 'insert tracked_bills')

    // ── Bill Actions ──────────────────────────────────────────────────────────
    const { error: baErr } = await svc.from('bill_actions').insert([
      { brewery_id: b, bill_id: ids.billSb412,  action_date: '2026-02-20', action_type: 'Contacted Rep',    description: 'Called and emailed committee chair to express support. Shared economic impact data showing $12K annual savings if retail license requirement eliminated.', contact_name: 'Rep. Johnson Legislative Aide', outcome: 'Staffer confirmed committee hearing scheduled.' },
      { brewery_id: b, bill_id: ids.billHb1205, action_date: '2026-03-05', action_type: 'Attended Hearing', description: 'Attended House Ways & Means Committee hearing on HR 4521. Provided written testimony in support of expanded excise tax relief.',                         outcome: 'Bill referred to subcommittee for further review.' },
    ])
    check(baErr, 'insert bill_actions')

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during seed'
    console.error('reset-demo-data: seed error:', message)
    return json({ error: 'seed_failed', message }, 500)
  }

  console.log(`reset-demo-data: successfully reset demo data for brewery ${breweryId}`)

  return json({
    success:    true,
    brewery_id: breweryId,
    message:    `Demo data for ${DEMO_BREWERY} has been reset successfully.`,
  })
})
