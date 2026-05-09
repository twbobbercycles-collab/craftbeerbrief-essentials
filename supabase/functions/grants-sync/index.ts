/**
 * grants-sync — DISABLED
 *
 * Grants.gov automated sync has been removed. Grant data is now manually
 * curated and imported via the admin panel CSV import tool.
 *
 * This stub returns a 200 so existing cron or webhook calls don't error,
 * but it performs no database operations.
 *
 * ── TO DISABLE THE CRON JOB ──────────────────────────────────────────────────
 * Run this in the Supabase SQL Editor to stop the scheduled daily sync:
 *
 *   SELECT cron.unschedule('grants-sync-daily');
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  return new Response(
    JSON.stringify({
      disabled: true,
      message: 'Grants.gov sync has been disabled. Grant data is now manually curated via the admin CSV import tool.',
    }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
  )
})
