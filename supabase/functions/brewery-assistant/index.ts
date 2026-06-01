/**
 * brewery-assistant — Edge Function
 * Accepts a POST with { messages, brewery_name }, verifies the caller is a
 * paying subscriber, enforces tier-based daily message limits, and proxies
 * the conversation to the Anthropic API.
 *
 * Deploy with:
 *   supabase functions deploy brewery-assistant --no-verify-jwt
 *
 * Required secrets:
 *   supabase secrets set ANTHROPIC_API_KEY=your_key_here
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS headers required for browser-to-edge-function calls ─────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── System prompt loaded once at cold-start time ──────────────────────────────

const SYSTEM_PROMPT = `You are the Craft Beer Brief Assistant, a helpful AI built specifically for craft brewery owners using The Craft Beer Brief Essentials app.

APP NAVIGATION — always give the exact sidebar path:
- Compliance Calendar: Essentials section → Compliance Calendar
- Grant Finder: Essentials section → Grant Finder (90+ curated programs)
- TTB Tracker: Essentials section → TTB Tracker
- Excise Tax Calculator: TTB Tracker → Excise Tax Calculator tab
- Brewery Records: Essentials section → Brewery Records (licenses, permits, insurance, agreements, label artwork — all compliance documents in one place)
- Staff & Certs: Essentials section → Staff & Certs
- Inventory: Operations section → Inventory
- Recipes: Operations section → Recipes (includes cost calculator + Water Chemistry Calculator per recipe)
- Brew Day: Operations section → Brew Day
- Fermentation: Operations section → Fermentation
- Packaging: Operations section → Packaging
- Distribution: Operations section → Distribution (includes Keg Fleet tab)
- Taproom: Operations section → Taproom
- Batch Profitability Reports: Operations section → Batch Profitability Reports (path: /reports/batch-profitability)
- Water Chemistry: open any recipe → scroll to Water Chemistry section → Expand
- Keg Fleet: Distribution → Keg Fleet tab
- Compliance Alerts: Compliance Calendar → click any deadline → Alert Me
- Events: Full Suite section → Taproom Events
- Wholesale: Full Suite section → Wholesale Manager
- Training: Full Suite section → Staff Training
- Benchmarking: Full Suite section → Revenue Benchmarking
- Playbook: Full Suite section → Regulation Playbook (26 document templates)
- Legislative Tracker: Full Suite section → Legislative Tracker (track bills, log advocacy actions, connect LegiScan for auto-updates)

KEY WORKFLOWS:
- To build a recipe: Recipes → Add Recipe → add ingredients → set packaging splits in cost calculator
- To schedule a brew: Brew Day → Schedule a Brew → link to recipe (auto-populates all fields)
- To log fermentation: Fermentation → assign vessel → Log Reading for gravity/temp
- To package: mark fermentation Ready to Package → Packaging → open planned run → enter actuals
- To distribute: Packaging → Mark Complete → Distribution → Assign Distribution
- To store a compliance record: Brewery Records → Add Record → select record type (Federal Permit, State License, Local Permit, Insurance Policy, Distribution Agreement, Label Artwork, Other) → fill in type-specific fields → add contacts → upload file
- To track staff certifications: Staff & Certs → staff card → Add Certification → select certification type → enter completion and expiration dates
- To track grants: Grant Finder → search by state/category → bookmark programs
- To log TTB filing: TTB Tracker → Add Filing Record
- To calculate excise tax: TTB Tracker → Excise Tax Calculator → Step 1 set brewery profile → Step 2 enter period barrels → Step 3 view tax summary and projections
- To track COLA: TTB Tracker → COLA tab → Add COLA Record → enter COLA number, brand, product, container size, ABV, status
- To set up water chemistry: Account Settings → Brewery Profile → Source Water Profile (enter once); then open any recipe → Water Chemistry section → select style target → review mineral additions
- To track keg fleet: Distribution → Keg Fleet tab → Add Keg Type → enter owned count and deposit amount per keg type
- To view batch profitability: Batch Profitability Reports (sidebar) → select a completed batch → review planned vs actual cost, yield, and margin
- To set a compliance alert: Compliance Calendar → click any deadline → Alert Me → choose advance notice days
- To generate advocacy doc: Full Suite → Regulation Playbook → select template → fill form → Generate Document
- To track a bill: Full Suite → Legislative Tracker → Add Bill → enter bill details, set A/B/C/D priority, add bill URL → Save
- To log advocacy action: Legislative Tracker → click View on a bill → Actions tab → Log Action
- To connect LegiScan: Legislative Tracker → Settings tab → follow the 7-step setup instructions

TTB KNOWLEDGE:
- Excise tax rates: $3.50/bbl for first 60,000 bbls (domestic brewers under 2M bbls annual production); $16/bbl over 60,000 bbls
- The Excise Tax Calculator tab pre-fills the $3.50/bbl reduced rate automatically — user only needs to enter barrels removed for the period
- The Excise Tax Calculator in the app auto-populates barrels from distribution records and shows the full tax calculation step by step
- COLA status codes: Active (green), Superseded (amber — may need new approval), Under Review (red — TTB is reviewing), Withdrawn (red — action needed)
- Filing: use TTB Form 5000.24 via Pay.gov at pay.gov or the TTB taxes and filing page at ttb.gov/taxes/tax-audit/taxes-and-filing
- Filing frequency: quarterly for most small breweries (under 50,000 bbls annual production); monthly only for large producers over 50,000 bbls/year
- CBMA credits available for foreign breweries importing to US
- Brewer's Report of Operations: monthly if over 10,000 bbls removed per quarter, quarterly if under
- COLA required for all malt beverages in interstate commerce
- Brewer's Notice required before beginning operations — file via myTTB portal
- Beer bond required if excise tax liability exceeds $50,000 in a calendar year
- The calculator does NOT file returns — all actual payments go through TTB's pay.gov system

STATE COMPLIANCE:
- Self-distribution rights vary dramatically by state — check your state brewery guild
- Franchise law protects distributors in most states — review before signing agreements
- Taproom sales rights, to-go container rules, and DTC shipping all vary by state
- Always recommend consulting a state-licensed alcohol beverage attorney for specifics

GRANT FUNDING:
- The app has 90+ curated programs in Grant Finder — filter by state, federal, or local
- Top federal programs: USDA Rural Development, SBA 7(a) loans, SSBCI state programs
- Bookmark grants and set deadline reminders in the app
- New grants added quarterly

TONE: Friendly, direct, concise. Brewery owners are busy. Use bullet points for multi-step answers. Keep responses under 300 words unless a complex topic requires more detail.

LIMITS: You cannot access the user's actual brewery data. For legal questions recommend a licensed alcohol beverage attorney. For tax specifics recommend a CPA. Never fabricate specific regulatory details — say you are unsure and point to TTB.gov or the state ABC agency.`

// ── Daily message limits per subscription tier ────────────────────────────────

const DAILY_LIMITS: Record<string, number> = {
  essentials:  20,
  operations:  40,
  full_suite:  60,
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

  // Only accept POST requests
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // ── 1. Verify JWT from Authorization header ───────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized', message: 'Missing or invalid authorization header.' }, 401)
  }

  const token = authHeader.replace('Bearer ', '')

  // Build a Supabase client that uses the caller's JWT so RLS applies correctly
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  // Validate the token by fetching the current user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return json({ error: 'unauthorized', message: 'Invalid or expired session.' }, 401)
  }

  // ── 2. Parse request body ─────────────────────────────────────────────────

  let messages: Array<{ role: string; content: string }>
  let brewery_name: string | undefined

  try {
    const body = await req.json()
    messages     = body.messages
    brewery_name = body.brewery_name
  } catch {
    return json({ error: 'bad_request', message: 'Invalid JSON body.' }, 400)
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'bad_request', message: 'messages must be a non-empty array.' }, 400)
  }

  // ── 3. Fetch user profile to check subscription status and tier ───────────

  // Use service role client so we can read the users table without RLS interference
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: profile, error: profileError } = await serviceClient
    .from('users')
    .select('subscription_tier, subscription_status, trial_expires_at, brewery_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    console.error('brewery-assistant: profile fetch error', profileError?.message)
    return json({ error: 'server_error', message: 'Could not load user profile.' }, 500)
  }

  // ── 4. Check that the user is a PAYING subscriber ────────────────────────
  // Trial-only users are not eligible — subscription_status must be 'active'
  // and tier must be one of the three paid tiers.

  const isPaidSubscriber =
    profile.subscription_status === 'active' &&
    ['essentials', 'operations', 'full_suite'].includes(profile.subscription_tier ?? '')

  if (!isPaidSubscriber) {
    return json({
      error: 'subscriber_only',
      message: 'The AI assistant is available to paid subscribers. Upgrade to access this feature.',
    }, 403)
  }

  // ── 5. Determine daily limit and check/update usage ───────────────────────

  const tier      = profile.subscription_tier as string
  const dailyLimit = DAILY_LIMITS[tier] ?? 20
  const today     = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Upsert usage row — insert if it doesn't exist for today, otherwise update
  await serviceClient
    .from('assistant_usage')
    .upsert(
      {
        user_id:       user.id,
        brewery_id:    profile.brewery_id ?? null,
        usage_date:    today,
        message_count: 1,
      },
      {
        onConflict:    'user_id,usage_date',
        ignoreDuplicates: false,
      }
    )
    .select('message_count')
    .single()

  // If the upsert returned a row, the record already existed — we need to read
  // the current count first, check the limit, then increment.
  // Supabase upsert with a conflict column will merge; we use a manual approach:

  // Fetch the current usage row (post-upsert)
  const { data: currentUsage } = await serviceClient
    .from('assistant_usage')
    .select('message_count')
    .eq('user_id', user.id)
    .eq('usage_date', today)
    .single()

  const currentCount = currentUsage?.message_count ?? 0

  // If already at or over the limit, reject before incrementing further
  if (currentCount > dailyLimit) {
    return json({
      error:   'rate_limit',
      limit:   dailyLimit,
      message: `You have reached today's limit of ${dailyLimit} messages. Resets at midnight.`,
    }, 429)
  }

  // Increment by 1 (the upsert above already set message_count=1 on insert;
  // on conflict we need a real increment via RPC or manual update)
  if (currentCount >= 1) {
    // Row existed — increment
    await serviceClient
      .from('assistant_usage')
      .update({ message_count: currentCount + 1 })
      .eq('user_id', user.id)
      .eq('usage_date', today)
  }
  // If count was 0 the upsert already inserted with message_count=1, no action needed

  const usedAfterThisMessage = currentCount >= 1 ? currentCount + 1 : 1
  const remaining = Math.max(0, dailyLimit - usedAfterThisMessage)

  // ── 6. Call Anthropic API ─────────────────────────────────────────────────

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    console.error('brewery-assistant: ANTHROPIC_API_KEY not set')
    return json({ error: 'server_error', message: 'AI service is not configured.' }, 500)
  }

  // Build the optional brewery name injection into the system prompt
  const systemPrompt = brewery_name
    ? `${SYSTEM_PROMPT}\n\nThe user's brewery is named: ${brewery_name}.`
    : SYSTEM_PROMPT

  let anthropicResponse: Response
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   messages,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Anthropic API call failed'
    console.error('brewery-assistant: Anthropic fetch error', msg)
    return json({ error: 'server_error', message: 'Could not reach AI service.' }, 500)
  }

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text()
    console.error('brewery-assistant: Anthropic API error', anthropicResponse.status, errText)
    return json({ error: 'ai_error', message: 'The AI service returned an error. Please try again.' }, 502)
  }

  const anthropicData = await anthropicResponse.json()

  // Extract the text content from the first content block
  const assistantMessage: string =
    anthropicData?.content?.[0]?.text ?? 'Sorry, I could not generate a response. Please try again.'

  // ── 7. Return response ────────────────────────────────────────────────────

  return json({
    response:  assistantMessage,
    remaining: remaining,
    limit:     dailyLimit,
  })
})
