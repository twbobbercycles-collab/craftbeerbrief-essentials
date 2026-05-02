/**
 * grants-sync Edge Function
 * Runs every 24 hours via Supabase cron and can be triggered manually.
 *
 * Primary API: Simpler.Grants.gov (https://api.simpler.grants.gov/v1) — requires GRANTS_GOV_API_KEY.
 * Fallback API: Legacy Grants.gov v2 (https://api.grants.gov/v2/api/search2) — no auth needed.
 *
 * Each keyword is searched separately. Results from all keywords are deduplicated by
 * opportunity_id / external_id before any database writes occur.
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
    description?:         string
    agency_name?:         string
    post_date?:           string
    close_date?:          string
    award_floor?:         number | null
    award_ceiling?:       number | null
    opportunity_status?:  string
  }
}

// ── Common shape used for all DB writes regardless of source API ─────────────
interface NormalizedGrant {
  external_id:  string
  title:        string
  description:  string | null
  status:       string
  deadline:     string | null
  amount_min:   number | null
  amount_max:   number | null
}

// ── Status mapping for the new API ──────────────────────────────────────────
const SIMPLER_STATUS_MAP: Record<string, string> = {
  posted:     'open',
  closed:     'closed',
  forecasted: 'upcoming',
  archived:   'closed',
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const apiKey    = Deno.env.get('GRANTS_GOV_API_KEY') ?? ''
  const useSimpler = apiKey.length > 0

  console.log(`grants-sync: using ${useSimpler ? 'Simpler.Grants.gov (authenticated)' : 'legacy Grants.gov v2 (fallback)'}`)

  // Collect all results across every keyword, deduplicating by external_id
  const seen      = new Set<string>()
  const allGrants: NormalizedGrant[] = []
  const errors:    string[] = []

  for (const keyword of SEARCH_KEYWORDS) {
    try {
      const opps = useSimpler
        ? await searchSimplerGrants(keyword, apiKey)
        : await searchLegacyGrants(keyword)

      for (const opp of opps) {
        if (!seen.has(opp.external_id)) {
          seen.add(opp.external_id)
          allGrants.push(opp)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`Keyword "${keyword}": ${message}`)
      console.error(`grants-sync error for keyword "${keyword}":`, message)
    }
  }

  const { added, updated } = await upsertGrants(supabase, allGrants)

  console.log(`grants-sync complete: ${added} added, ${updated} updated, ${allGrants.length} total unique, ${errors.length} keyword errors`)

  return new Response(
    JSON.stringify({ added, updated, total_unique: allGrants.length, errors }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

// ── Simpler.Grants.gov (primary, authenticated) ──────────────────────────────

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
    throw new Error(`Simpler.Grants.gov ${response.status}: ${await response.text()}`)
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

  // Prefix description with agency name so it appears in keyword searches
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

// ── Legacy Grants.gov v2 (fallback, no auth) ─────────────────────────────────

async function searchLegacyGrants(keyword: string): Promise<NormalizedGrant[]> {
  const body = {
    keyword,
    oppStatuses:      'posted',
    rows:             25,
    startRecordNum:   0,
    sortBy:           'openDate|desc',
  }

  const response = await fetch(LEGACY_GRANTS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Grants.gov v2 ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  // Legacy API nests results in data.oppHits.oppHit
  const opps: any[] = data?.data?.oppHits?.oppHit ?? data?.opportunities ?? []

  return opps
    .filter(o => (o.id ?? o.number) && o.title)
    .map(o => {
      const agencyLine = o.agency ? `Funding Agency: ${o.agency}\n\n` : ''
      return {
        external_id: String(o.id ?? o.number),
        title:       o.title,
        description: (o.synopsis ?? o.description)
          ? agencyLine + (o.synopsis ?? o.description)
          : null,
        status:      (o.oppStatus ?? '').toLowerCase() === 'posted' ? 'open' : 'closed',
        deadline:    o.closeDate
          ? new Date(o.closeDate).toISOString().split('T')[0]
          : null,
        amount_min:  o.awardFloor   ?? null,
        amount_max:  o.awardCeiling ?? null,
      } satisfies NormalizedGrant
    })
}

// ── Database upsert ───────────────────────────────────────────────────────────

/**
 * Inserts new grants and updates the status of existing ones if it has changed.
 * Only status is updated on existing records — title and description are not overwritten
 * to avoid clobbering any manual edits made in the admin panel.
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
      // Only touch the row if the status has actually changed
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
