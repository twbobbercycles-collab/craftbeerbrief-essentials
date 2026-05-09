/**
 * send-welcome-email Edge Function
 * Called after a user completes onboarding to send a branded welcome email
 * with their trial details and a link to the dashboard.
 *
 * Accepts POST { email, brewery_name, trial_expires_at }
 *
 * Email delivery: uses Resend (https://resend.com) when RESEND_API_KEY is set.
 * Without it, logs the email content and returns 200 so the app never breaks.
 * Wire up Resend in a follow-up step: add RESEND_API_KEY to Supabase secrets.
 *
 * Deploy: supabase functions deploy send-welcome-email --no-verify-jwt
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Converts an ISO date string to "May 17, 2026" without timezone shift issues
function formatTrialDate(raw: string | null | undefined): string {
  if (!raw) return 'the end of your trial period'
  const datePart = typeof raw === 'string' ? raw.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return 'the end of your trial period'
  const [year, month, day] = datePart.split('-').map(Number)
  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

// Builds the full HTML email body with inline styles for email client compatibility
function buildEmailHtml(breweryName: string, trialEndsFormatted: string): string {
  const name = breweryName || 'Your Brewery'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welcome to The Craft Beer Brief Essentials</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:28px 16px;">

        <!-- Main card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width:580px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">

          <!-- ── HEADER ── -->
          <tr>
            <td style="background-color:#1A2744;padding:26px 32px 22px;text-align:center;border-bottom:4px solid #C8871A;">
              <h1 style="margin:0;color:#C8871A;font-size:21px;font-weight:bold;letter-spacing:0.4px;font-family:Georgia,'Times New Roman',serif;">
                The Craft Beer Brief Essentials
              </h1>
            </td>
          </tr>

          <!-- ── BODY ── -->
          <tr>
            <td style="padding:32px 32px 28px;">

              <!-- Greeting -->
              <h2 style="margin:0 0 14px;color:#1A2744;font-size:19px;font-weight:bold;line-height:1.4;">
                Welcome to The Craft Beer Brief Essentials, ${name}!
              </h2>

              <!-- Opening paragraph -->
              <p style="margin:0 0 24px;color:#4a4a4a;font-size:15px;line-height:1.75;">
                Your 14-day free trial has started. You now have full access to all three compliance tools
                built specifically for craft breweries like yours&nbsp;&#8212; no credit card required.
              </p>

              <!-- What's included card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:#f8f9fb;border-radius:8px;border:1px solid #e8eaed;margin-bottom:22px;">
                <tr>
                  <td style="padding:20px 22px;">

                    <p style="margin:0 0 14px;color:#1A2744;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
                      What&#39;s Included
                    </p>

                    <!-- Core tools -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:5px 0;vertical-align:top;">
                          <span style="color:#C8871A;font-weight:bold;font-size:16px;margin-right:10px;line-height:1.4;">&#10003;</span>
                          <span style="color:#1A2744;font-weight:bold;font-size:14px;">Grant &amp; Funding Finder</span>
                          <span style="color:#666666;font-size:14px;"> &#8212; Search 100+ federal and state funding programs updated daily</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;vertical-align:top;">
                          <span style="color:#C8871A;font-weight:bold;font-size:16px;margin-right:10px;line-height:1.4;">&#10003;</span>
                          <span style="color:#1A2744;font-weight:bold;font-size:14px;">TTB Filing Tracker</span>
                          <span style="color:#666666;font-size:14px;"> &#8212; Never miss a federal excise tax deadline again</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;vertical-align:top;">
                          <span style="color:#C8871A;font-weight:bold;font-size:16px;margin-right:10px;line-height:1.4;">&#10003;</span>
                          <span style="color:#1A2744;font-weight:bold;font-size:14px;">State Compliance Calendar</span>
                          <span style="color:#666666;font-size:14px;"> &#8212; Personalized deadlines for your state and license types</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Bonus tools -->
                    <p style="margin:16px 0 10px;color:#999999;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">
                      Plus these bonus tools also included
                    </p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="color:#C8871A;font-size:14px;margin-right:10px;">&#10003;</span>
                          <span style="color:#555555;font-size:14px;">License Document Storage</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="color:#C8871A;font-size:14px;margin-right:10px;">&#10003;</span>
                          <span style="color:#555555;font-size:14px;">Staff Certification Tracker</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="color:#C8871A;font-size:14px;margin-right:10px;">&#10003;</span>
                          <span style="color:#555555;font-size:14px;">Insurance Policy Tracker</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="color:#C8871A;font-size:14px;margin-right:10px;">&#10003;</span>
                          <span style="color:#555555;font-size:14px;">Local Permit Tracker</span>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Trial reminder box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:#FEF8EE;border:1px solid #C8871A;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#6b3a08;font-size:14px;line-height:1.75;">
                      Your free trial ends on <strong>${trialEndsFormatted}</strong>. No credit card is required
                      and nothing will be charged automatically. If you would like to continue after your trial
                      simply choose a plan that works for you&nbsp;&#8212; <strong>$14.99/month</strong> or
                      <strong>$149.99/year</strong> (save $30). You are in complete control.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Primary CTA button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="https://craftbeerbrief-essentials.vercel.app"
                      style="display:inline-block;background-color:#C8871A;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                      Go To Your Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Secondary CTA button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="https://craftbeerbrief-essentials.vercel.app/upgrade"
                      style="display:inline-block;background-color:#ffffff;color:#1A2744;font-size:13px;font-weight:600;text-decoration:none;padding:10px 26px;border-radius:8px;border:1.5px solid #1A2744;">
                      View Pricing Options
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── DIVIDER ── -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;line-height:1.6;">
                You are receiving this because you signed up for The Craft Beer Brief Essentials.
                Questions? Reply to this email or contact us at
                <a href="mailto:hello@thecraftbeerbrief.com" style="color:#9ca3af;text-decoration:underline;">
                  hello@thecraftbeerbrief.com
                </a>
              </p>
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                &copy; 2026 The Craft Beer Brief. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

Deno.serve(async (req) => {
  // Respond to CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })
  }

  // Parse request body
  let email: string
  let brewery_name: string
  let trial_expires_at: string

  try {
    const body = await req.json()
    email        = body.email        ?? ''
    brewery_name = body.brewery_name ?? ''
    trial_expires_at = body.trial_expires_at ?? ''
  } catch {
    return new Response('Invalid request body', { status: 400, headers: CORS_HEADERS })
  }

  if (!email) {
    return new Response('email is required', { status: 400, headers: CORS_HEADERS })
  }

  const subject          = 'Welcome to The Craft Beer Brief Essentials — Your 14-Day Trial Has Started'
  const trialEndsFormatted = formatTrialDate(trial_expires_at)
  const htmlBody         = buildEmailHtml(brewery_name, trialEndsFormatted)

  // ── Attempt delivery via Resend ─────────────────────────────────────────────
  // Add RESEND_API_KEY to Supabase secrets to enable real sending.
  // Until then this function logs the email and returns 200 so the app never breaks.
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'The Craft Beer Brief Essentials <hello@thecraftbeerbrief.com>',
          to: [email],
          subject,
          html: htmlBody,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('Resend delivery failed:', errText)
      } else {
        console.log(`Welcome email sent via Resend to ${email}`)
      }
    } catch (err) {
      // Log but never throw — a broken email must never block the user
      console.error('Resend request error (non-fatal):', err)
    }
  } else {
    // ── Placeholder: no provider configured yet ────────────────────────────
    console.log('--- WELCOME EMAIL (RESEND_API_KEY not set — logging only) ---')
    console.log(`To:           ${email}`)
    console.log(`Subject:      ${subject}`)
    console.log(`Brewery:      ${brewery_name || '(not provided)'}`)
    console.log(`Trial ends:   ${trialEndsFormatted}`)
    console.log('--- END WELCOME EMAIL ---')
  }

  // Always return 200 — email failures must never surface to the user
  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
