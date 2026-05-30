/**
 * legiscan-sync — Scheduled Edge Function
 *
 * Fetches updated bill statuses from the LegiScan API for every tracked bill
 * that has a legiscan_bill_id set. Uses each brewery's own API key stored in
 * users.legiscan_api_key — never a shared key.
 *
 * Called with:
 *   POST {}                        → syncs all users with a legiscan_api_key
 *   POST { "user_id": "uuid" }     → syncs only that user (used by "Sync Now" button)
 *
 * Deploy:
 *   supabase functions deploy legiscan-sync --no-verify-jwt
 *
 * Schedule: daily at 7am UTC via pg_cron (see pg_cron SQL in project notes).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── LegiScan status code → our status text ─────────────────────────────────
// Source: LegiScan API documentation — bill.status numeric codes
const LEGISCAN_STATUS_MAP: Record<number, string> = {
  1: 'Introduced',
  2: 'In Committee',
  3: 'Passed Committee',
  4: 'Floor Vote',    // LegiScan "Passed" = on floor for a vote
  5: 'Signed',
  6: 'Dead',          // Vetoed
  7: 'Dead',          // Failed
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackedBill {
  id:               string
  legiscan_bill_id: string
  status:           string
}

interface LegiScanBillResponse {
  status: string
  bill?: {
    bill_id:     number
    status:      number
    status_desc: string
  }
}

// ── LegiScan API caller ────────────────────────────────────────────────────────

/**
 * Fetches the current status of one bill from LegiScan.
 * Returns the mapped status string, or null if the call fails or status is unknown.
 */
async function fetchBillStatus(
  apiKey:       string,
  legiscanId:   string,
): Promise<string | null> {
  try {
    const url = `https://api.legiscan.com/?key=${encodeURIComponent(apiKey)}&op=getBill&id=${encodeURIComponent(legiscanId)}`
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) })

    if (!res.ok) {
      console.warn(`LegiScan HTTP ${res.status} for bill ${legiscanId}`)
      return null
    }

    const json = await res.json() as LegiScanBillResponse

    if (json.status !== 'OK' || !json.bill) {
      console.warn(`LegiScan returned non-OK for bill ${legiscanId}: ${json.status}`)
      return null
    }

    return LEGISCAN_STATUS_MAP[json.bill.status] ?? null
  } catch (err) {
    console.warn(`LegiScan fetch error for bill ${legiscanId}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Service-role client bypasses RLS so we can read all breweries' data
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')              ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Parse optional user_id from request body
  let targetUserId: string | null = null
  try {
    const body = await req.json()
    targetUserId = body?.user_id ?? null
  } catch { /* body is optional */ }

  // ── Step 1: fetch target users ─────────────────────────────────────────────
  // Either the specific user requested or all users with a legiscan_api_key set
  let usersQuery = supabase
    .from('users')
    .select('id, brewery_id, legiscan_api_key')
    .not('legiscan_api_key', 'is', null)

  if (targetUserId) {
    usersQuery = usersQuery.eq('id', targetUserId)
  }

  const { data: users, error: usersErr } = await usersQuery

  if (usersErr) {
    console.error('Failed to fetch users:', usersErr.message)
    return new Response(JSON.stringify({ error: usersErr.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let totalUpdated = 0
  let totalChecked = 0

  // ── Step 2: process each user ───────────────────────────────────────────────
  for (const user of users ?? []) {
    if (!user.legiscan_api_key || !user.brewery_id) continue

    try {
      // Fetch all bills for this brewery that have a LegiScan bill ID
      const { data: bills, error: billsErr } = await supabase
        .from('tracked_bills')
        .select('id, legiscan_bill_id, status')
        .eq('brewery_id', user.brewery_id)
        .not('legiscan_bill_id', 'is', null)
        .is('closed_date', null)  // skip closed bills

      if (billsErr) {
        console.warn(`Failed to fetch bills for user ${user.id}: ${billsErr.message}`)
        continue
      }

      // ── Step 3: update each bill's status from LegiScan ──────────────────
      for (const bill of (bills as TrackedBill[]) ?? []) {
        totalChecked++

        const newStatus = await fetchBillStatus(user.legiscan_api_key, bill.legiscan_bill_id)
        if (!newStatus) continue

        // Only write to DB if status actually changed to avoid noisy updates
        if (newStatus === bill.status) {
          // Still bump legiscan_last_synced so users can see it was checked
          await supabase
            .from('tracked_bills')
            .update({ legiscan_last_synced: new Date().toISOString() })
            .eq('id', bill.id)
          continue
        }

        const { error: updateErr } = await supabase
          .from('tracked_bills')
          .update({
            status:               newStatus,
            legiscan_last_synced: new Date().toISOString(),
          })
          .eq('id', bill.id)

        if (updateErr) {
          console.warn(`Failed to update bill ${bill.id}: ${updateErr.message}`)
        } else {
          totalUpdated++
          console.log(`Updated bill ${bill.id}: ${bill.status} → ${newStatus}`)
        }
      }
    } catch (err) {
      console.error(`Error processing user ${user.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const summary = {
    message:       `Checked ${totalChecked} bills. Updated ${totalUpdated} statuses.`,
    checked:       totalChecked,
    updated:       totalUpdated,
    users_synced:  (users ?? []).length,
  }

  console.log(summary.message)

  return new Response(JSON.stringify(summary), {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
