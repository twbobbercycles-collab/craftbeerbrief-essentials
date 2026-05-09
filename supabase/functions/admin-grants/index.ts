/**
 * admin-grants Edge Function
 * Handles all privileged admin operations on grants server-side.
 * The service role key lives only in Supabase's secure environment — never in the browser.
 *
 * Deployed with --no-verify-jwt so we can verify the caller's email ourselves
 * before allowing any database read or mutation.
 *
 * Actions:
 *   list_admin_data — fetch all four admin datasets (bypasses RLS for approved=false rows)
 *   archive         — set approved=false, stamp data_source_notes
 *   restore         — set approved=true, clear data_source_notes
 *   override        — set is_manually_curated=true
 *   save_edit       — update arbitrary fields + set last_reviewed_at=now()
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminEmail     = Deno.env.get('ADMIN_EMAIL')!

    // ── 1. Verify the caller's identity ───────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing auth token' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)
    if (user.email !== adminEmail) return json({ error: 'Forbidden: admin access only' }, 403)

    // ── 2. Parse the request body ──────────────────────────────────────────────
    const { action, grant_id, updated_fields } = await req.json()
    if (!action) return json({ error: 'Missing action' }, 400)

    // ── 3. Service role client — bypasses RLS safely on the server ─────────────
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ── list_admin_data ────────────────────────────────────────────────────────
    // Fetches all four admin datasets. Uses the service role client so that
    // approved=false rows (archived grants, pending submissions) are readable
    // even when RLS restricts them from the anon/authenticated role.
    if (action === 'list_admin_data') {
      const [pendingRes, allRes, archivedRes, syncRes] = await Promise.all([
        admin.from('grants').select('*, users(email)')
          .eq('grant_source', 'user_submitted').eq('approved', false)
          .order('created_at', { ascending: false }),
        admin.from('grants').select('*').eq('approved', true)
          .order('created_at', { ascending: false }),
        admin.from('grants').select('*').eq('approved', false)
          .neq('grant_source', 'user_submitted')
          .order('updated_at', { ascending: false }),
        admin.from('grants_last_sync').select('*')
          .order('synced_at', { ascending: false }).limit(50),
      ])
      return json({
        success:   true,
        pending:   pendingRes.data  ?? [],
        allGrants: allRes.data      ?? [],
        archived:  archivedRes.data ?? [],
        syncLogs:  syncRes.data     ?? [],
      })
    }

    // All remaining actions require a grant_id
    if (!grant_id) return json({ error: 'Missing grant_id' }, 400)

    // ── archive ────────────────────────────────────────────────────────────────
    if (action === 'archive') {
      const { error } = await admin.from('grants').update({
        approved: false,
        data_source_notes: 'Archived by admin - not brewery relevant',
      }).eq('id', grant_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── restore ────────────────────────────────────────────────────────────────
    if (action === 'restore') {
      const { error } = await admin.from('grants').update({
        approved: true,
        data_source_notes: null,
      }).eq('id', grant_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── override ───────────────────────────────────────────────────────────────
    if (action === 'override') {
      const { error } = await admin.from('grants').update({
        is_manually_curated: true,
      }).eq('id', grant_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── save_edit ──────────────────────────────────────────────────────────────
    if (action === 'save_edit') {
      if (!updated_fields) return json({ error: 'Missing updated_fields for save_edit' }, 400)
      const { error } = await admin.from('grants').update({
        ...updated_fields,
        last_reviewed_at: new Date().toISOString(),
      }).eq('id', grant_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('admin-grants error:', message)
    return json({ error: message }, 500)
  }
})
