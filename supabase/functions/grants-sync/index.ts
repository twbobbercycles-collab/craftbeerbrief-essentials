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
 * Strategy: each keyword group is searched against both APIs. Results are filtered
 * to relevant agencies only and stripped of clearly off-topic opportunities before
 * deduplication. Each sync run is recorded in grants_last_sync.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Keyword groups → program_category mapping ────────────────────────────────

interface KeywordGroup {
  keywords:         string[]
  program_category: string
}

const KEYWORD_GROUPS: KeywordGroup[] = [
  {
    // Direct brewery keywords
    program_category: 'manufacturing',
    keywords: [
      'brewery',
      'craft brewery',
      'craft beer',
      'microbrewery',
      'brewpub',
    ],
  },
  {
    // USDA and agricultural keywords relevant to breweries
    program_category: 'federal_usda',
    keywords: [
      'value-added producer',
      'rural business development',
      'specialty crop',
      'malting barley',
      'hops production',
      'craft beverage',
      'agritourism',
      'local food system',
      'agricultural processing',
    ],
  },
  {
    // SBA and economic development
    program_category: 'federal_sba',
    keywords: [
      'small manufacturer',
      'food beverage manufacturer',
      'rural economic development',
      'main street revitalization',
      'downtown development',
    ],
  },
  {
    // Tourism and hospitality
    program_category: 'tourism',
    keywords: [
      'tourism development',
      'destination marketing',
      'hospitality small business',
      'beer trail',
    ],
  },
]

// ── Agency allow-list ─────────────────────────────────────────────────────────
// Only keep results whose funding agency matches one of these strings (case-insensitive).
const RELEVANT_AGENCY_FRAGMENTS = [
  'usda',
  'sba',
  'small business administration',
  'eda',
  'economic development administration',
  'ams',
  'agricultural marketing service',
  'ars',
  'agricultural research service',
  'rural development',
  'state',       // catches state pass-through agencies
]

// ── Title block-list ──────────────────────────────────────────────────────────
// Skip any opportunity whose title contains one of these terms (case-insensitive).
const IRRELEVANT_TITLE_TERMS = [
  'defense',
  'military',
  'weapons',
  'healthcare',
  'medical',
  'education',
  'school',
  'highway',
  'transit',
  'housing assistance',
]

const SIMPLER_GRANTS_URL = 'https://api.simpler.grants.gov/v1/opportunities/search'
const LEGACY_GRANTS_URL  = 'https://api.grants.gov/v1/api/search2'

// ── Response shapes ───────────────────────────────────────────────────────────

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

interface LegacyOpportunity {
  id:            string
  title:         string
  agencyName?:   string
  openDate?:     string
  closeDate?:    string
  awardFloor?:   string | number | null
  awardCeiling?: string | number | null
}

interface NormalizedGrant {
  external_id:      string
  title:            string
  description:      string | null
  agency_name:      string | null
  status:           string
  deadline:         string | null
  amount_min:       number | null
  amount_max:       number | null
  program_category: string
}

const SIMPLER_STATUS_MAP: Record<string, string> = {
  posted:     'open',
  closed:     'closed',
  forecasted: 'upcoming',
  archived:   'closed',
}

// ── Filtering helpers ─────────────────────────────────────────────────────────

function isRelevantAgency(agencyName: string | null): boolean {
  if (!agencyName) return false
  const lower = agencyName.toLowerCase()
  return RELEVANT_AGENCY_FRAGMENTS.some(fragment => lower.includes(fragment))
}

function isIrrelevantTitle(title: string): boolean {
  const lower = title.toLowerCase()
  return IRRELEVANT_TITLE_TERMS.some(term => lower.includes(term))
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const apiKey = Deno.env.get('GRANTS_GOV_API_KEY') ?? ''
  console.log('GRANTS_GOV_API_KEY present:', apiKey.length > 0)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const seen      = new Set<string>()
  const allGrants: NormalizedGrant[] = []
  const errors:    string[] = []

  for (const group of KEYWORD_GROUPS) {
    for (const keyword of group.keywords) {
      let opps: NormalizedGrant[] | null = null

      // Try Simpler.Grants.gov first (needs API key)
      if (apiKey.length > 0) {
        try {
          opps = await searchSimplerGrants(keyword, apiKey, group.program_category)
          console.log(`[simpler] "${keyword}" (${group.program_category}): ${opps.length} raw results`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.warn(`[simpler] "${keyword}" failed — ${message} — retrying with legacy endpoint`)
        }
      }

      // Fall back to legacy endpoint if primary failed or no key
      if (opps === null) {
        try {
          opps = await searchLegacyGrants(keyword, group.program_category)
          console.log(`[legacy] "${keyword}" (${group.program_category}): ${opps.length} raw results`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push(`"${keyword}": both APIs failed — last error: ${message}`)
          console.error(`[legacy] "${keyword}" also failed:`, message)
          continue
        }
      }

      // Apply agency + title filters, then deduplicate
      const filtered = opps.filter(o => {
        if (!isRelevantAgency(o.agency_name)) return false
        if (isIrrelevantTitle(o.title))        return false
        return true
      })

      console.log(`[filter] "${keyword}": ${filtered.length} relevant after filtering`)

      for (const opp of filtered) {
        if (!seen.has(opp.external_id)) {
          seen.add(opp.external_id)
          allGrants.push(opp)
        }
      }
    }
  }

  const { added, updated } = await upsertGrants(supabase, allGrants)

  // Record this sync run
  await supabase.from('grants_last_sync').insert({
    sync_type:      'grants_gov',
    synced_at:      new Date().toISOString(),
    grants_added:   added,
    grants_updated: updated,
    notes: errors.length > 0
      ? `${errors.length} keyword(s) failed: ${errors.slice(0, 3).join('; ')}`
      : null,
  })

  console.log(
    `grants-sync complete: ${added} added, ${updated} updated,`,
    `${allGrants.length} total unique, ${errors.length} keyword errors`
  )

  return new Response(
    JSON.stringify({ added, updated, total_unique: allGrants.length, errors }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

// ── Simpler.Grants.gov (primary) ──────────────────────────────────────────────

async function searchSimplerGrants(
  keyword:          string,
  apiKey:           string,
  program_category: string
): Promise<NormalizedGrant[]> {
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
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  const opps: SimplerOpportunity[] = data?.data ?? data?.opportunities ?? []

  return opps
    .filter(o => o.opportunity_id && o.opportunity_title)
    .map(o => normalizeSimpler(o, program_category))
}

function normalizeSimpler(o: SimplerOpportunity, program_category: string): NormalizedGrant {
  const rawStatus  = (o.summary?.opportunity_status ?? '').toLowerCase()
  const status     = SIMPLER_STATUS_MAP[rawStatus] ?? 'open'
  const agencyName = o.summary?.agency_name ?? null
  const agencyLine = agencyName ? `Funding Agency: ${agencyName}\n\n` : ''

  const deadline = o.summary?.close_date
    ? new Date(o.summary.close_date).toISOString().split('T')[0]
    : null

  return {
    external_id:      String(o.opportunity_id),
    title:            o.opportunity_title,
    description:      o.summary?.description ? agencyLine + o.summary.description : null,
    agency_name:      agencyName,
    status,
    deadline,
    amount_min:       o.summary?.award_floor   ?? null,
    amount_max:       o.summary?.award_ceiling ?? null,
    program_category,
  }
}

// ── Legacy Grants.gov search2 (fallback) ──────────────────────────────────────

async function searchLegacyGrants(keyword: string, program_category: string): Promise<NormalizedGrant[]> {
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
  const opps: LegacyOpportunity[] = data?.data?.oppHits ?? []

  return opps
    .filter(o => o.id && o.title)
    .map(o => {
      const agencyName = o.agencyName ?? null
      const agencyLine = agencyName ? `Funding Agency: ${agencyName}\n\n` : ''

      const deadline = o.closeDate
        ? new Date(o.closeDate).toISOString().split('T')[0]
        : null

      const toNum = (v: string | number | null | undefined): number | null => {
        if (v == null || v === '') return null
        const n = Number(v)
        return isNaN(n) ? null : n
      }

      return {
        external_id:      String(o.id),
        title:            o.title,
        description:      agencyLine || null,
        agency_name:      agencyName,
        status:           'open',
        deadline,
        amount_min:       toNum(o.awardFloor),
        amount_max:       toNum(o.awardCeiling),
        program_category,
      } satisfies NormalizedGrant
    })
}

// ── Database upsert ───────────────────────────────────────────────────────────

/**
 * Inserts new grants; on existing ones updates status, last_reviewed_at, and
 * program_category. Title and description are never overwritten to preserve
 * any manual admin edits.
 */
async function upsertGrants(
  supabase: ReturnType<typeof createClient>,
  grants:   NormalizedGrant[]
): Promise<{ added: number; updated: number }> {
  let added   = 0
  let updated = 0
  const now   = new Date().toISOString()

  for (const grant of grants) {
    const { data: existing } = await supabase
      .from('grants')
      .select('id, status')
      .eq('external_id', grant.external_id)
      .maybeSingle()

    if (existing) {
      // Always refresh last_reviewed_at to confirm the grant is still active
      await supabase
        .from('grants')
        .update({
          status:           grant.status,
          last_synced_at:   now,
          last_reviewed_at: now,
          program_category: grant.program_category,
        })
        .eq('id', existing.id)
      if (existing.status !== grant.status) updated++
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
        is_manually_curated:  false,
        program_category:     grant.program_category,
        grant_source:         'grants_gov',
        external_id:          grant.external_id,
        last_synced_at:       now,
        last_reviewed_at:     now,
        approved:             true,
      })
      added++
    }
  }

  return { added, updated }
}
