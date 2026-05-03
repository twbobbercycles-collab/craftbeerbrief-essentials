/**
 * grants-sync Edge Function
 * Runs every 24 hours via Supabase cron and can be triggered manually.
 *
 * Primary API:  Simpler.Grants.gov — POST https://api.simpler.grants.gov/v1/opportunities/search
 *               Requires GRANTS_GOV_API_KEY secret (sent as Bearer token).
 *
 * Fallback API: Legacy Grants.gov   — POST https://api.grants.gov/v1/api/search2
 *               Public, no auth. Used when the primary API is unavailable or returns an error.
 *
 * Strategy: each keyword is tried against the primary API first. If that call fails for
 * any reason (401, 5xx, network error, etc.) the same keyword is immediately retried
 * against the legacy endpoint. Results across all keywords are deduplicated by
 * external_id before any database writes occur.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SEARCH_KEYWORDS = [
  'brewery',
  'craft beer',
  'beverage manufacturing',
  'agriculture small business',
  'rural business development',
  'food production',
  'value-added producer',
]

const SIMPLER_GRANTS_URL = 'https://api.simpler.grants.gov/v1/opportunities/search'
const LEGACY_GRANTS_URL  = 'https://api.grants.gov/v1/api/search2'

// ── Response shape from Simpler.Grants.gov ──────────────────────────────────
interface SimplerOpportunity {
  opportunity_id:    string | number
  opportunity_title: string
  summary: {
    description?:        string
    agency_name?:        string
    post_date?:          string
    close_date?:         string
    award_floor?:        number | null
    award_ceiling?:      number | null
    opportunity_status?: string
  }
}

// ── Response shape from legacy Grants.gov search2 ───────────────────────────
interface LegacyOpportunity {
  id:            string
  title:         string
  agencyName?:   string
  openDate?:     string
  closeDate?:    string
  awardFloor?:   string | number | null
  awardCeiling?: string | number | null
}

// ── Common shape used for all DB writes regardless of source API ─────────────
interface NormalizedGrant {
  external_id: string
  title:       string
  description: string | null
  status:      string
  deadline:    string | null
  amount_min:  number | null
  amount_max:  number | null
}

// ── Status mapping for Simpler.Grants.gov ───────────────────────────────────
const SIMPLER_STATUS_MAP: Record<string, string> = {
  posted:     'open',
  closed:     'closed',
  forecasted: 'upcoming',
  archived:   'closed',
}

Deno.serve(async (_req: Request) => {
  // Log API key presence so it's visible in Edge Function logs for debugging
  const apiKey = Deno.env.get('GRANTS_GOV_API_KEY') ?? ''
  console.log('GRANTS_GOV_API_KEY present:', apiKey.length > 0)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Collect all results across every keyword, deduplicating by external_id
  const seen      = new Set<string>()
  const allGrants: NormalizedGrant[] = []
  const errors:    string[] = []

  for (const keyword of SEARCH_KEYWORDS) {
    let opps: NormalizedGrant[] | null = null

    // ── Step 1: try Simpler.Grants.gov if an API key is available ─────────
    if (apiKey.length > 0) {
      try {
        opps = await searchSimplerGrants(keyword, apiKey)
        console.log(`[simpler] "${keyword}": ${opps.length} results`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`[simpler] "${keyword}" failed — ${message} — retrying with legacy endpoint`)
        // opps stays null, triggers fallback below
      }
    }

    // ── Step 2: fall back to legacy endpoint if primary failed or no key ──
    if (opps === null) {
      try {
        opps = await searchLegacyGrants(keyword)
        console.log(`[legacy] "${keyword}": ${opps.length} results`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`"${keyword}": both APIs failed — last error: ${message}`)
        console.error(`[legacy] "${keyword}" also failed:`, message)
        continue // skip to next keyword
      }
    }

    // ── Deduplicate and collect ────────────────────────────────────────────
    for (const opp of opps) {
      if (!seen.has(opp.external_id)) {
        seen.add(opp.external_id)
        allGrants.push(opp)
      }
    }
  }

  const { added, updated } = await upsertGrants(supabase, allGrants)

  console.log(
    `grants-sync complete: ${added} added, ${updated} updated,`,
    `${allGrants.length} total unique, ${errors.length} keyword errors`
  )

  return new Response(
    JSON.stringify({ added, updated, total_unique: allGrants.length, errors }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

// ── Simpler.Grants.gov (primary) ─────────────────────────────────────────────

async function searchSimplerGrants(keyword: string, apiKey: string): Promise<NormalizedGrant[]> {
  const body = {
    filters: {
      opportunity_status: { one_of: ['posted'] },
      keywords: [keyword],
    },
    pagination: {
      page_offset: 1,
      page_size:   25,
      sort_by:     'post_date',
      order_by:    'desc',
    },
  }

  const response = await fetch(SIMPLER_GRANTS_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    // Throw so the caller can fall back to the legacy endpoint
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  // API may wrap results under `data` or `opportunities` depending on version
  const opps: SimplerOpportunity[] = data?.data ?? data?.opportunities ?? []

  return opps
    .filter(o => o.opportunity_id && o.opportunity_title)
    .map(normalizeSimpler)
}

function normalizeSimpler(o: SimplerOpportunity): NormalizedGrant {
  const rawStatus = (o.summary?.opportunity_status ?? '').toLowerCase()
  const status    = SIMPLER_STATUS_MAP[rawStatus] ?? 'open'

  const agencyLine = o.summary?.agency_name
    ? `Funding Agency: ${o.summary.agency_name}\n\n`
    : ''

  const deadline = o.summary?.close_date
    ? new Date(o.summary.close_date).toISOString().split('T')[0]
    : null

  return {
    external_id: String(o.opportunity_id),
    title:       o.opportunity_title,
    description: o.summary?.description ? agencyLine + o.summary.description : null,
    status,
    deadline,
    amount_min:  o.summary?.award_floor   ?? null,
    amount_max:  o.summary?.award_ceiling ?? null,
  }
}

// ── Legacy Grants.gov search2 (fallback, no auth) ────────────────────────────

async function searchLegacyGrants(keyword: string): Promise<NormalizedGrant[]> {
  // Minimal body — the legacy endpoint only needs keyword + status filter
  const body = {
    keyword,
    oppStatuses: 'posted',
  }

  const response = await fetch(LEGACY_GRANTS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  // Legacy response: { data: { oppHits: [ { id, title, agencyName, closeDate, ... } ] } }
  const opps: LegacyOpportunity[] = data?.data?.oppHits ?? []

  return opps
    .filter(o => o.id && o.title)
    .map(o => {
      const agencyLine = o.agencyName ? `Funding Agency: ${o.agencyName}\n\n` : ''

      const deadline = o.closeDate
        ? new Date(o.closeDate).toISOString().split('T')[0]
        : null

      // awardFloor/awardCeiling may come back as strings — coerce to number
      const toNum = (v: string | number | null | undefined): number | null => {
        if (v == null || v === '') return null
        const n = Number(v)
        return isNaN(n) ? null : n
      }

      return {
        external_id: String(o.id),
        title:       o.title,
        description: agencyLine || null,
        status:      'open', // we only request posted opportunities
        deadline,
        amount_min:  toNum(o.awardFloor),
        amount_max:  toNum(o.awardCeiling),
      } satisfies NormalizedGrant
    })
}

// ── Database upsert ───────────────────────────────────────────────────────────

/**
 * Inserts new grants; updates status + last_synced_at on existing ones if the status changed.
 * Title and description are never overwritten — manual admin edits are preserved.
 */
async function upsertGrants(
  supabase: ReturnType<typeof createClient>,
  grants: NormalizedGrant[]
): Promise<{ added: number; updated: number }> {
  let added   = 0
  let updated = 0

  for (const grant of grants) {
    const { data: existing } = await supabase
      .from('grants')
      .select('id, status')
      .eq('external_id', grant.external_id)
      .maybeSingle()

    if (existing) {
      if (existing.status !== grant.status) {
        await supabase
          .from('grants')
          .update({ status: grant.status, last_synced_at: new Date().toISOString() })
          .eq('id', existing.id)
        updated++
      }
    } else {
      await supabase.from('grants').insert({
        title:                grant.title,
        description:          grant.description,
        eligibility_summary:  null,
        funding_type:         'federal_grant',
        amount_min:           grant.amount_min,
        amount_max:           grant.amount_max,
        states_eligible:      ['All States'],
        status:               grant.status,
        application_deadline: grant.deadline,
        application_url:      `https://www.grants.gov/search-results-detail/${grant.external_id}`,
        source_url:           `https://www.grants.gov/search-results-detail/${grant.external_id}`,
        is_federal:           true,
        grant_source:         'grants_gov',
        external_id:          grant.external_id,
        last_synced_at:       new Date().toISOString(),
        approved:             true,
      })
      added++
    }
  }

  return { added, updated }
}
