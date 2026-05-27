/**
 * compliance-alerts — Scheduled Edge Function
 *
 * Runs every day at 8:00 AM UTC via a cron schedule (configured in config.toml
 * and/or pg_cron). Queries every active paying subscriber, checks whether they
 * have any compliance deadlines due in the next 30 days, and sends one
 * consolidated email per brewery listing everything that needs attention.
 *
 * Tables queried (all via service role key to bypass RLS):
 *   users, breweries, ttb_filings, local_permits, insurance_policies,
 *   staff_certifications, staff_members, brewery_deadlines, compliance_deadlines,
 *   compliance_alert_logs
 *
 * Deploy:
 *   supabase functions deploy compliance-alerts --no-verify-jwt
 *
 * Required Supabase secrets:
 *   RESEND_API_KEY          — from resend.com dashboard
 *   SUPABASE_URL            — set automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Types ─────────────────────────────────────────────────────────────────────

// One upcoming deadline item that will appear in the email
interface Deadline {
  category: string   // e.g. 'TTB Filing', 'Insurance Renewal'
  name:     string   // Human-readable name shown in the email
  dueDate:  string   // ISO date string "YYYY-MM-DD"
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// Turns "2026-06-14" into "June 14, 2026" for the email body
function formatDate(isoDate: string): string {
  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]
  const [year, month, day] = isoDate.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

// Returns how many whole days remain from todayStr to targetDate (can be 0)
function daysUntil(targetDate: string, todayStr: string): number {
  const target = new Date(targetDate + 'T00:00:00Z')
  const today  = new Date(todayStr  + 'T00:00:00Z')
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// Adds N calendar days to an ISO date string and returns the new ISO string
function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── Deadline collector ────────────────────────────────────────────────────────

/**
 * Queries all five deadline sources for a single brewery and returns every item
 * due between today and today + 30 days, sorted soonest first.
 *
 * Important column notes (from the actual migration files):
 *   ttb_filings    — no due_date column; due date = period_end + 14 days
 *   local_permits  — uses is_active (boolean) not a status column
 *   insurance_policies — no status column; all records treated as active
 *   staff_certifications — no staff_name column; join staff_members for names
 *   brewery_deadlines — uses is_complete (boolean) and custom_date for the date
 */
async function gatherDeadlines(
  supabase: ReturnType<typeof createClient>,
  breweryId: string,
  todayStr: string,
  in30DaysStr: string,
): Promise<Deadline[]> {
  const deadlines: Deadline[] = []

  // ── 1. TTB Filings ─────────────────────────────────────────────────────────
  // The ttb_filings table has no due_date. By standard TTB rules, payment is
  // due 14 days after period_end. To find filings due in [today, today+30] we
  // query period_end in [today-14, today+16] and then verify in JavaScript.
  const minus14Str = addDays(todayStr, -14)
  const plus16Str  = addDays(todayStr, 16)

  const { data: ttbFilings } = await supabase
    .from('ttb_filings')
    .select('id, period_label, period_end, filing_frequency, status')
    .eq('brewery_id', breweryId)
    .neq('status', 'filed')
    .gte('period_end', minus14Str)
    .lte('period_end', plus16Str)

  for (const filing of ttbFilings ?? []) {
    const dueDateStr = addDays(filing.period_end, 14)
    // Double-check the derived due date lands in our window
    if (dueDateStr >= todayStr && dueDateStr <= in30DaysStr) {
      const name = filing.period_label
        ?? `TTB Filing (${filing.filing_frequency ?? 'period ending ' + filing.period_end})`
      deadlines.push({ category: 'TTB Filing', name, dueDate: dueDateStr })
    }
  }

  // ── 2. Local Permits & Licenses ────────────────────────────────────────────
  // local_permits uses is_active (true/false) to mark active vs. archived.
  // There is no separate status column — just filter is_active = true.
  const { data: permits } = await supabase
    .from('local_permits')
    .select('id, permit_name, expiration_date')
    .eq('brewery_id', breweryId)
    .eq('is_active', true)
    .gte('expiration_date', todayStr)
    .lte('expiration_date', in30DaysStr)

  for (const permit of permits ?? []) {
    deadlines.push({
      category: 'License / Permit Renewal',
      name:     permit.permit_name,
      dueDate:  permit.expiration_date,
    })
  }

  // ── 3. Insurance Policies ──────────────────────────────────────────────────
  // insurance_policies has no status or is_active column. All records are
  // treated as active. The insurer is stored in carrier_name (not insurer_name).
  const { data: policies } = await supabase
    .from('insurance_policies')
    .select('id, policy_name, carrier_name, expiration_date')
    .eq('brewery_id', breweryId)
    .gte('expiration_date', todayStr)
    .lte('expiration_date', in30DaysStr)

  for (const policy of policies ?? []) {
    deadlines.push({
      category: 'Insurance Renewal',
      name:     `${policy.policy_name} (${policy.carrier_name})`,
      dueDate:  policy.expiration_date,
    })
  }

  // ── 4. Staff Certifications ────────────────────────────────────────────────
  // staff_certifications has no staff_name column. We join to staff_members
  // using the staff_member_id foreign key to get first_name + last_name.
  const { data: certs } = await supabase
    .from('staff_certifications')
    .select('id, certification_name, expiration_date, staff_members!staff_member_id(first_name, last_name)')
    .eq('brewery_id', breweryId)
    .gte('expiration_date', todayStr)
    .lte('expiration_date', in30DaysStr)

  for (const cert of certs ?? []) {
    const member = cert.staff_members as { first_name: string; last_name: string } | null
    const staffName = member ? `${member.first_name} ${member.last_name}` : 'Staff Member'
    deadlines.push({
      category: 'Staff Certification',
      name:     `${cert.certification_name} — ${staffName}`,
      dueDate:  cert.expiration_date,
    })
  }

  // ── 5. Compliance Calendar ─────────────────────────────────────────────────
  // brewery_deadlines uses is_complete (boolean) and custom_date for the date.
  // deadline_name was added in migration 009; pre-seeded items get their name
  // from the compliance_deadlines parent row via the FK join.
  const { data: calendarItems } = await supabase
    .from('brewery_deadlines')
    .select('id, deadline_name, custom_date, compliance_deadlines!compliance_deadline_id(deadline_name)')
    .eq('brewery_id', breweryId)
    .eq('is_complete', false)
    .not('custom_date', 'is', null)
    .gte('custom_date', todayStr)
    .lte('custom_date', in30DaysStr)

  for (const item of calendarItems ?? []) {
    const parent = item.compliance_deadlines as { deadline_name: string } | null
    const name = item.deadline_name ?? parent?.deadline_name ?? 'Compliance Deadline'
    deadlines.push({
      category: 'Compliance Calendar',
      name,
      dueDate: item.custom_date,
    })
  }

  // Sort everything soonest-first so the email reads chronologically
  deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return deadlines
}

// ── Email builder ─────────────────────────────────────────────────────────────

// Builds one HTML table row for a single deadline item inside the email
function deadlineRow(deadline: Deadline, todayStr: string): string {
  const days = daysUntil(deadline.dueDate, todayStr)
  const dateLabel = formatDate(deadline.dueDate)
  const daysLabel = days === 0
    ? 'Due today'
    : days === 1
    ? 'Due in 1 day'
    : `Due in ${days} days`

  return `
    <tr>
      <td style="padding:9px 0 9px 2px;border-bottom:1px solid rgba(0,0,0,0.06);vertical-align:top;">
        <span style="font-size:14px;">📋</span>
        <span style="color:#1A2744;font-size:14px;font-weight:600;margin-left:6px;">${deadline.name}</span>
        <br>
        <span style="color:#6b7280;font-size:13px;margin-left:22px;">${daysLabel} &mdash; ${dateLabel}</span>
        <span style="color:#9ca3af;font-size:12px;margin-left:8px;">&middot; ${deadline.category}</span>
      </td>
    </tr>`
}

// Builds the complete HTML email body for one brewery's compliance alert
function buildEmailHtml(
  breweryName:  string,
  urgentItems:  Deadline[],
  upcomingItems: Deadline[],
  todayStr:     string,
): string {
  const totalCount = urgentItems.length + upcomingItems.length

  // Red section — deadlines due within 7 days
  const urgentSection = urgentItems.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#fef2f2;border-radius:8px;border:1px solid #fca5a5;margin-bottom:16px;">
      <tr>
        <td style="padding:14px 18px 10px;">
          <p style="margin:0 0 10px;color:#dc2626;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">
            🚨 Urgent &mdash; Due Within 7 Days
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${urgentItems.map(d => deadlineRow(d, todayStr)).join('')}
          </table>
        </td>
      </tr>
    </table>` : ''

  // Amber section — deadlines due in 8–30 days
  const upcomingSection = upcomingItems.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#fffbeb;border-radius:8px;border:1px solid #C8871A;margin-bottom:16px;">
      <tr>
        <td style="padding:14px 18px 10px;">
          <p style="margin:0 0 10px;color:#92400e;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">
            ⚠️ Upcoming &mdash; Due in the Next 30 Days
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${upcomingItems.map(d => deadlineRow(d, todayStr)).join('')}
          </table>
        </td>
      </tr>
    </table>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Compliance Deadline Reminder</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:28px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width:580px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1A2744;padding:26px 32px 22px;text-align:center;border-bottom:4px solid #C8871A;">
              <h1 style="margin:0;color:#C8871A;font-size:21px;font-weight:bold;letter-spacing:0.4px;font-family:Georgia,'Times New Roman',serif;">
                The Craft Beer Brief Essentials
              </h1>
              <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">Compliance Alert</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">

              <p style="margin:0 0 6px;color:#1A2744;font-size:17px;font-weight:bold;line-height:1.4;">
                Hi ${breweryName} team,
              </p>
              <p style="margin:0 0 24px;color:#4a4a4a;font-size:15px;line-height:1.75;">
                You have <strong>${totalCount} upcoming compliance deadline${totalCount !== 1 ? 's' : ''}</strong>
                to review in the next 30 days.
              </p>

              ${urgentSection}
              ${upcomingSection}

              <!-- CTA button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="margin:24px 0 8px;">
                <tr>
                  <td align="center">
                    <a href="https://thecraftbeerbrief.com/compliance"
                      style="display:inline-block;background-color:#1A2744;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                      View Your Compliance Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;line-height:1.6;">
                You are receiving this because you have compliance alerts enabled.
                <a href="https://thecraftbeerbrief.com/account"
                  style="color:#9ca3af;text-decoration:underline;">
                  Manage your alert preferences in Account Settings.
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

// ── Email sender ──────────────────────────────────────────────────────────────

// Sends the compliance alert email to one user via Resend.
// Throws if Resend returns an error — caller handles the exception.
async function sendAlertEmail(
  toEmail:      string,
  breweryName:  string,
  urgentItems:  Deadline[],
  upcomingItems: Deadline[],
  todayStr:     string,
  resendApiKey: string,
): Promise<void> {
  const totalCount = urgentItems.length + upcomingItems.length
  const allUrgent  = urgentItems.length > 0 && upcomingItems.length === 0

  const subject = allUrgent
    ? `🚨 Urgent: ${urgentItems.length} compliance deadline${urgentItems.length !== 1 ? 's' : ''} due within 7 days — ${breweryName}`
    : `⚠️ You have ${totalCount} compliance deadline${totalCount !== 1 ? 's' : ''} coming up — ${breweryName}`

  const htmlBody = buildEmailHtml(breweryName, urgentItems, upcomingItems, todayStr)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:     'The Craft Beer Brief Essentials <hello@thecraftbeerbrief.com>',
      reply_to: 'craftbeerbrief@gmail.com',
      to:       [toEmail],
      subject,
      html:     htmlBody,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Resend API error (${res.status}): ${errText}`)
  }

  console.log(`Compliance alert sent to ${toEmail} — ${totalCount} deadlines, ${urgentItems.length} urgent`)
}

// ── Main cron handler ─────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  // Create a service-role Supabase client.
  // The service role key bypasses Row Level Security so this function can read
  // every brewery's data. Never expose this key to the browser.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')            ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  // Build the date strings we need for queries
  const now         = new Date()
  const todayStr    = now.toISOString().slice(0, 10)
  const in30DaysStr = addDays(todayStr, 30)
  const in7DaysStr  = addDays(todayStr, 7)

  // ── Step 1: fetch all active paying subscribers ─────────────────────────────
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, brewery_id, subscription_status, subscription_tier, compliance_alerts_enabled')
    .eq('subscription_status', 'active')
    .not('subscription_tier', 'is', null)

  if (usersError) {
    console.error('Failed to fetch users:', usersError.message)
    return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let successCount = 0
  let skipCount    = 0
  let failCount    = 0

  // ── Step 2: process each user ───────────────────────────────────────────────
  // We wrap each user in try/catch so one failure never stops the others.
  for (const user of users ?? []) {
    try {
      // Respect opt-out. null is treated as true (default = alerts enabled).
      if (user.compliance_alerts_enabled === false) {
        skipCount++
        continue
      }

      // ── Duplicate guard ─────────────────────────────────────────────────────
      // compliance_alert_logs has a unique constraint on (user_id, alert_date).
      // If a row already exists for today we skip this user entirely.
      const { data: existingLog } = await supabase
        .from('compliance_alert_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('alert_date', todayStr)
        .maybeSingle()

      if (existingLog) {
        console.log(`Already alerted ${user.email} today — skipping`)
        skipCount++
        continue
      }

      // ── Get brewery name ────────────────────────────────────────────────────
      const { data: brewery } = await supabase
        .from('breweries')
        .select('id, name')
        .eq('id', user.brewery_id)
        .single()

      if (!brewery) {
        console.warn(`No brewery found for user ${user.email} — skipping`)
        skipCount++
        continue
      }

      // ── Gather deadlines ────────────────────────────────────────────────────
      const deadlines = await gatherDeadlines(supabase, brewery.id, todayStr, in30DaysStr)

      // No deadlines = no email. Don't bother users with an empty reminder.
      if (deadlines.length === 0) {
        skipCount++
        continue
      }

      // ── Categorize by urgency ───────────────────────────────────────────────
      const urgentItems   = deadlines.filter(d => d.dueDate <= in7DaysStr)
      const upcomingItems = deadlines.filter(d => d.dueDate >  in7DaysStr)

      // ── Send or log ─────────────────────────────────────────────────────────
      if (resendApiKey) {
        await sendAlertEmail(user.email, brewery.name, urgentItems, upcomingItems, todayStr, resendApiKey)
      } else {
        // RESEND_API_KEY not set — print to logs so you can verify during testing
        console.log(`--- COMPLIANCE ALERT (RESEND_API_KEY not configured) ---`)
        console.log(`To: ${user.email}  |  Brewery: ${brewery.name}`)
        console.log(`Total: ${deadlines.length}  |  Urgent: ${urgentItems.length}`)
        deadlines.forEach(d => console.log(`  ${d.dueDate} | ${d.category} | ${d.name}`))
        console.log(`--- END ---`)
      }

      // ── Record the send ─────────────────────────────────────────────────────
      // Insert into compliance_alert_logs. The unique constraint means a second
      // insert for the same (user_id, alert_date) will fail — which is fine,
      // it just means a retry won't double-count.
      const { error: logError } = await supabase
        .from('compliance_alert_logs')
        .insert({
          user_id:         user.id,
          brewery_id:      brewery.id,
          alert_date:      todayStr,
          deadlines_count: deadlines.length,
          urgent_count:    urgentItems.length,
        })

      if (logError && !logError.message.includes('unique')) {
        // Log but don't fail — the email was already sent
        console.warn(`Log insert error for ${user.email}:`, logError.message)
      }

      successCount++
    } catch (err) {
      console.error(`Error processing ${user.email}:`, err instanceof Error ? err.message : err)
      failCount++
    }
  }

  // ── Step 3: report results ──────────────────────────────────────────────────
  const summary = { success: successCount, skipped: skipCount, failed: failCount }
  console.log('Compliance alerts complete:', JSON.stringify(summary))

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
