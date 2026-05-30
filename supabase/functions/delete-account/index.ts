/**
 * delete-account — Edge Function
 * Permanently deletes all data for the authenticated user's brewery in
 * foreign-key-safe order, then removes the brewery, the user row, and
 * finally the Supabase auth user.
 *
 * Deploy with:
 *   supabase functions deploy delete-account --no-verify-jwt
 *
 * Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS headers required for browser-to-edge-function calls ─────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Helper: return a JSON response with CORS headers ─────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Preflight CORS check
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // ── 1. Verify JWT from Authorization header ───────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized', message: 'Missing or invalid authorization header.' }, 401)
  }

  const token = authHeader.replace('Bearer ', '')

  // Caller-scoped client to validate the JWT with RLS
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return json({ error: 'unauthorized', message: 'Invalid or expired session.' }, 401)
  }

  // Service-role client for all destructive operations (bypasses RLS)
  const svc = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // ── 2. Resolve brewery_id for this user ───────────────────────────────────

  const { data: userRow, error: userLookupErr } = await svc
    .from('users')
    .select('brewery_id')
    .eq('id', user.id)
    .single()

  if (userLookupErr || !userRow?.brewery_id) {
    console.error('delete-account: could not resolve brewery_id for user', user.id)
    return json({ error: 'not_found', message: 'No brewery found for this account.' }, 404)
  }

  const b = userRow.brewery_id
  console.log('delete-account: deleting brewery', b, 'for user', user.id)

  // ── 3. Delete helpers ─────────────────────────────────────────────────────

  // Deletes all rows in `table` where brewery_id = b.
  // Logs a warning and continues if the delete fails (e.g. table doesn't exist yet).
  const del = async (table: string) => {
    const { error } = await svc.from(table).delete().eq('brewery_id', b)
    if (error) console.warn(`delete-account: ${table}:`, error.message)
  }

  // Deletes rows in `table` where `col` = `val`.
  // Used for tables whose FK to brewery is indirect (e.g. via a join).
  const delBy = async (table: string, col: string, val: string) => {
    const { error } = await svc.from(table).delete().eq(col, val)
    if (error) console.warn(`delete-account: ${table} (by ${col}):`, error.message)
  }

  // ── 4. Delete all data in foreign-key-safe order (children before parents) ─

  // Advocacy / legislative
  await del('bill_actions')
  await del('tracked_bills')

  // AI assistant usage
  await del('assistant_usage')

  // Playbook document generations
  await del('playbook_generations')

  // Compliance alert logs
  await del('compliance_alert_logs')

  // Excise tax
  await del('excise_tax_periods')

  // Keg fleet (deposit records reference keg_fleet)
  await del('keg_deposit_records')
  await del('keg_fleet')

  // Taproom metrics
  await del('taproom_metrics')

  // Staff training (records and assignments reference programs)
  await del('staff_training_records')
  await del('training_assignments')
  await del('training_programs')

  // Wholesale
  await del('wholesale_contact_log')
  await del('wholesale_accounts')

  // Taproom events
  await del('taproom_events')

  // Distribution (records reference accounts)
  await del('distribution_records')
  await del('distribution_accounts')

  // Packaging (splits and packages reference runs)
  await del('package_splits')
  await del('batch_packages')
  await del('packaging_runs')

  // Fermentation (gravity readings reference fermentations)
  await del('gravity_readings')
  await del('fermentations')

  // Brew days (hop additions and mash steps reference brew_days)
  await del('brew_day_hop_additions')
  await del('brew_day_mash_steps')
  await del('brew_days')

  // Recipes (ingredients reference recipes)
  await del('recipe_ingredients')
  await del('recipes')

  // Inventory (transactions and PO items reference purchase_orders and ingredients)
  await del('inventory_transactions')
  await del('purchase_order_items')
  await del('purchase_orders')
  await del('ingredient_suppliers')
  await del('ingredients')

  // Packaging materials
  await del('packaging_material_transactions')
  await del('packaging_materials')

  // Fermentation vessels
  await del('fermentation_vessels')

  // News articles — only brewery-specific rows (global news has no brewery_id)
  await del('news_articles')

  // ── 5. Delete the brewery record ──────────────────────────────────────────

  const { error: brewErr } = await svc.from('breweries').delete().eq('id', b)
  if (brewErr) {
    console.warn('delete-account: breweries row deletion warning:', brewErr.message)
  }

  // ── 6. Delete the user row from the users table ───────────────────────────

  const { error: userRowErr } = await svc.from('users').delete().eq('id', user.id)
  if (userRowErr) {
    console.warn('delete-account: users row deletion warning:', userRowErr.message)
  }

  // ── 7. Delete the Supabase auth user (requires service role) ─────────────

  const { error: authDeleteErr } = await svc.auth.admin.deleteUser(user.id)
  if (authDeleteErr) {
    console.error('delete-account: auth user deletion failed:', authDeleteErr.message)
    // Data is already gone — report partial success so the client can still sign out
    return json({
      error: 'partial',
      message: 'Account data was deleted but the auth user could not be removed. Contact support.',
    }, 500)
  }

  console.log('delete-account: completed successfully for brewery', b)
  return json({ success: true })
})
