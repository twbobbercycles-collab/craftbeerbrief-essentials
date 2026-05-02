/**
 * invite-staff-member Edge Function
 * Invites a staff member to join a brewery account via Supabase auth admin API.
 * The invited user gets an email and sets their own password on first login.
 * They are linked to the same brewery_id as the inviter.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const { email, breweryId, inviterName } = await req.json()

  // Use the service role to call the auth admin API — regular users can't create accounts for others
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // Invite the user — Supabase sends them a "you've been invited" email
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          brewery_id: breweryId,  // Passed to our handle_new_user trigger
          role: 'staff',
          invited_by: inviterName,
        },
        redirectTo: `${Deno.env.get('SITE_URL') ?? 'http://localhost:5173'}/login`,
      }
    )

    if (inviteError) throw inviteError

    // The handle_new_user trigger will fire, but it creates a NEW brewery.
    // For staff invites we need to override that and link to the existing brewery.
    // We do this by updating the users row after the trigger runs.
    if (inviteData?.user?.id) {
      await supabase.from('users').upsert({
        id: inviteData.user.id,
        brewery_id: breweryId,
        email,
        role: 'staff',
        // Staff share the brewery's subscription — no trial tracking needed
        trial_expires_at: new Date('2099-01-01').toISOString(),
      })

      // Also clean up the incorrectly-created brewery from the trigger
      // (The trigger creates a new brewery, but staff should use the existing one)
      // We rely on ON DELETE CASCADE to clean up, but we don't delete here to avoid race conditions.
      // In production, consider disabling the trigger for invited users using a flag in raw_user_meta_data.
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invite failed'
    console.error('invite-staff-member error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})
