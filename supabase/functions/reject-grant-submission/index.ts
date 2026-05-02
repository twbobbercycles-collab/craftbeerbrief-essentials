/**
 * reject-grant-submission Edge Function
 * Called by the admin when rejecting a user-submitted grant.
 * Deletes the grant and sends the submitter an email explaining the rejection.
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

  const { grantId, submittedByUserId } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // Get the grant title and submitter email before deleting
    const { data: grant } = await supabase
      .from('grants')
      .select('title, submitted_by_user_id')
      .eq('id', grantId)
      .single()

    let submitterEmail: string | null = null

    if (submittedByUserId || grant?.submitted_by_user_id) {
      const userId = submittedByUserId ?? grant?.submitted_by_user_id
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single()
      submitterEmail = user?.email ?? null
    }

    // Delete the grant from the database
    await supabase.from('grants').delete().eq('id', grantId)

    // Send a rejection email if we have the submitter's email
    // We use Supabase's built-in email (or you can swap this for a service like Resend)
    if (submitterEmail) {
      await supabase.auth.admin.sendRawEmail({
        to: submitterEmail,
        subject: 'Update on your grant submission — Craft Beer Brief Essentials',
        body: `Hi there,

Thank you for submitting a grant opportunity to the Craft Beer Brief Essentials platform — we appreciate the effort!

After reviewing your submission ("${grant?.title ?? 'your submission'}"), our team has determined it does not currently meet our listing criteria. This may be because it falls outside the beverage/brewery industry scope, is no longer active, or lacks the required public application information.

If you believe this is an error, please feel free to reply to this email or reach out to support.

Thanks again for being part of the Craft Beer Brief community!

— The Craft Beer Brief Team`,
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rejection failed'
    console.error('reject-grant-submission error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})
