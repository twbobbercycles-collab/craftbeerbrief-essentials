/**
 * import-grants-csv Edge Function
 * Accepts a batch of grant records (already parsed from CSV by the browser)
 * and upserts them into the grants table using external_program_id as the
 * conflict key. All field mapping from CSV column names to DB column names
 * is done here on the server.
 *
 * Deployed with --no-verify-jwt so we verify the caller's email ourselves.
 *
 * Request body:
 *   records    — array of objects with CSV column names as keys (lowercase)
 *   wipe_first — optional boolean; if true, deletes all is_manually_curated
 *                grants before importing (used for quarterly full refreshes)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Field mapping helpers ─────────────────────────────────────────────────────

function str(row: Record<string, string>, key: string): string | null {
  const v = row[key]?.trim()
  return v || null
}

function num(row: Record<string, string>, key: string): number | null {
  const v = row[key]?.trim().replace(/[$,\s]/g, '')
  if (!v) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function bool(row: Record<string, string>, key: string): boolean | null {
  const v = row[key]?.trim().toLowerCase()
  if (v === 'yes' || v === 'true') return true
  if (v === 'no'  || v === 'false') return false
  return null
}

function parseDate(row: Record<string, string>, key: string): string | null {
  const v = row[key]?.trim()
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function parseStates(row: Record<string, string>, key: string): string[] {
  const v = row[key]?.trim()
  if (!v) return []
  if (/^all\s*states?$/i.test(v) || /^nationwide$/i.test(v)) return ['nationwide']
  return v.split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

function mapStatus(raw: string | null): string {
  const v = raw?.trim().toLowerCase() ?? ''
  if (v === 'active') return 'open'
  if (v === 'temporarily closed') return 'closed'
  if (v === 'closed') return 'closed'
  if (v === 'upcoming') return 'upcoming'
  return 'open'
}

// Maps one CSV row object (keys = lowercase CSV column names) to a grants table row
function mapRecord(row: Record<string, string>): Record<string, unknown> {
  const fundingType  = str(row, 'funding type')
  const govLevel     = str(row, 'government level')
  const activeRecord = row['active record']?.trim().toLowerCase()

  return {
    external_program_id:       str(row, 'program id'),
    title:                     str(row, 'grant title'),
    program_acronym:           str(row, 'program acronym'),
    acronym_definition:        str(row, 'acronym definition'),
    funding_type:              fundingType,
    government_level:          govLevel,
    funding_agency:            str(row, 'funding agency/organization'),
    program_category:          str(row, 'program category'),
    description:               str(row, 'brief description'),
    eligibility_summary:       str(row, 'eligibility notes'),
    brewery_relevance_score:   (() => {
      const v = row['brewery relevance score']?.trim()
      const n = parseInt(v, 10)
      return isNaN(n) ? null : n
    })(),
    confidence_level:          str(row, 'confidence level'),
    amount_min:                num(row, 'minimum award amount'),
    amount_max:                num(row, 'maximum award amount'),
    application_deadline:      str(row, 'application deadline'),
    application_cycle:         str(row, 'application cycle'),
    status:                    mapStatus(str(row, 'program status')),
    application_url:           str(row, 'application url'),
    source_url:                str(row, 'source url'),
    states_eligible:           parseStates(row, 'states that are eligible'),
    county:                    str(row, 'county'),
    municipality:              str(row, 'municipality'),
    rural_eligible:            bool(row, 'rural eligible'),
    opportunity_zone_eligible: bool(row, 'opportunity zone eligible'),
    forgivable_loan_eligible:  bool(row, 'forgivable loan eligible'),
    stackable:                 bool(row, 'stackable with other incentives'),
    industry_focus:            str(row, 'industry focus'),
    business_stage:            str(row, 'business stage'),
    maintenance_priority:      str(row, 'maintenance priority'),
    next_verification_date:    parseDate(row, 'next recommended verification date'),
    program_priority_tier:     str(row, 'program priority tier'),
    data_quality_notes:        str(row, 'additional notes'),
    approved:                  activeRecord === 'yes' || activeRecord === 'true',
    is_loan:                   fundingType?.toLowerCase().includes('loan') ?? false,
    is_manually_curated:       true,
    grant_source:              'manual',
    is_federal:                govLevel?.startsWith('Federal') ?? false,
    last_reviewed_at:          new Date().toISOString(),
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminEmail     = Deno.env.get('ADMIN_EMAIL')!

    // ── Verify caller is the admin ─────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing auth token' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)
    if (user.email !== adminEmail) return json({ error: 'Forbidden: admin access only' }, 403)

    // ── Parse request ──────────────────────────────────────────────────────────
    const { records, wipe_first } = await req.json()
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: 'records must be a non-empty array' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ── Wipe manually curated grants if requested ──────────────────────────────
    if (wipe_first) {
      const { error: wipeError } = await admin
        .from('grants')
        .delete()
        .eq('is_manually_curated', true)
      if (wipeError) return json({ error: `Wipe failed: ${wipeError.message}` }, 500)
    }

    // ── Map and upsert each record ─────────────────────────────────────────────
    let processed = 0
    let upserted  = 0
    let skipped   = 0
    const errors: string[] = []

    for (const rawRow of records) {
      processed++
      try {
        const mapped = mapRecord(rawRow)

        if (!mapped.external_program_id) {
          skipped++
          errors.push(`Row ${processed}: missing "program id" — skipped`)
          continue
        }

        const { error: upsertError } = await admin
          .from('grants')
          .upsert(mapped, { onConflict: 'external_program_id' })

        if (upsertError) {
          skipped++
          errors.push(`Row ${processed} (${mapped.external_program_id}): ${upsertError.message}`)
        } else {
          upserted++
        }
      } catch (rowErr) {
        skipped++
        errors.push(`Row ${processed}: ${rowErr instanceof Error ? rowErr.message : 'Unknown error'}`)
      }
    }

    return json({ success: true, processed, upserted, skipped, errors })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('import-grants-csv error:', message)
    return json({ error: message }, 500)
  }
})
