/**
 * grants-sync Edge Function
 * Runs automatically every 24 hours (scheduled via Supabase cron) and can be triggered manually.
 * Fetches brewery-relevant grants from Grants.gov API and inserts/updates them in our database.
 * Uses the service role key so it bypasses RLS and can write to the grants table as admin.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Keywords to search Grants.gov — rotated across syncs to find the most relevant opportunities
const SEARCH_KEYWORDS = [
  'brewery',
  'craft beer',
  'beverage manufacturing',
  'agriculture small business',
  'rural business development',
  'food production',
  'value-added producer',
]

// Grants.gov API endpoint
const GRANTS_GOV_URL = 'https://api.grants.gov/v1/api/search'

// The response structure from Grants.gov search API
interface GrantsGovOpportunity {
  id: string
  number: string
  title: string
  agency: string
  openDate: string
  closeDate: string
  oppStatus: string
  synopsis?: string
  description?: string
  awardCeiling?: number
  awardFloor?: number
  applicantTypes?: string[]
}

Deno.serve(async (req) => {
  // Create a Supabase client with the service role key — this bypasses RLS
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let totalAdded = 0
  let totalUpdated = 0
  const errors: string[] = []

  // Search Grants.gov once for each keyword
  for (const keyword of SEARCH_KEYWORDS) {
    try {
      const result = await searchGrantsGov(keyword)
      const { added, updated } = await upsertGrants(supabase, result)
      totalAdded += added
      totalUpdated += updated
    } catch (err) {
      // Log the error but keep going — one failed keyword shouldn't stop the whole sync
      const message = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`Keyword "${keyword}": ${message}`)
      console.error(`grants-sync error for keyword "${keyword}":`, message)
    }
  }

  console.log(`grants-sync complete: ${totalAdded} added, ${totalUpdated} updated, ${errors.length} errors`)

  return new Response(
    JSON.stringify({ added: totalAdded, updated: totalUpdated, errors }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

/**
 * Calls the Grants.gov API with a single keyword and returns matching opportunities.
 */
async function searchGrantsGov(keyword: string): Promise<GrantsGovOpportunity[]> {
  const body = {
    keyword,
    oppStatuses: 'posted', // Only open/active opportunities
    rows: 50,
    startRecordNum: 0,
    sortBy: 'openDate|desc',
  }

  const response = await fetch(GRANTS_GOV_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Grants.gov API returned ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  // Grants.gov nests results in data.oppHits.oppHit
  return data?.data?.oppHits?.oppHit ?? []
}

/**
 * Takes a list of Grants.gov opportunities and inserts new ones / updates existing ones.
 * Uses external_id (the Grants.gov opportunity ID) to detect duplicates.
 */
async function upsertGrants(
  supabase: ReturnType<typeof createClient>,
  opportunities: GrantsGovOpportunity[]
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0

  for (const opp of opportunities) {
    const externalId = opp.id ?? opp.number

    if (!externalId || !opp.title) continue // Skip malformed entries

    // Check if this grant already exists in our database
    const { data: existing } = await supabase
      .from('grants')
      .select('id, status')
      .eq('external_id', externalId)
      .maybeSingle()

    // Map Grants.gov status to our simplified status
    const status = opp.oppStatus?.toLowerCase() === 'posted' ? 'open' : 'closed'

    const grantData = {
      title: opp.title,
      description: opp.synopsis ?? opp.description ?? null,
      eligibility_summary: opp.applicantTypes ? opp.applicantTypes.join(', ') : null,
      funding_type: 'Grant',
      amount_min: opp.awardFloor ?? null,
      amount_max: opp.awardCeiling ?? null,
      states_eligible: ['All States'],  // Federal grants are nationwide
      status,
      application_deadline: opp.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : null,
      application_url: `https://www.grants.gov/search-results-detail/${externalId}`,
      is_federal: true,
      source_url: `https://www.grants.gov/search-results-detail/${externalId}`,
      grant_source: 'grants_gov',
      external_id: externalId,
      last_synced_at: new Date().toISOString(),
      approved: true,  // Federal grants from Grants.gov are auto-approved
    }

    if (existing) {
      // Update the existing record if status has changed
      if (existing.status !== status) {
        await supabase.from('grants').update({ status, last_synced_at: new Date().toISOString() }).eq('id', existing.id)
        updated++
      }
    } else {
      // Insert as a new grant
      await supabase.from('grants').insert(grantData)
      added++
    }
  }

  return { added, updated }
}
