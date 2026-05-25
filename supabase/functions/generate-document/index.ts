/**
 * generate-document — Edge Function
 * Accepts a POST with { template_id, brewery_data }, verifies the caller is an
 * active Full Suite subscriber, builds a .docx Word document using the docx npm
 * package, and returns it as a base64 string with a suggested filename.
 *
 * Deploy with:
 *   supabase functions deploy generate-document --no-verify-jwt
 *
 * The --no-verify-jwt flag is required because we perform our own JWT verification
 * inside the function (needed to access the Authorization header manually).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
} from 'npm:docx@8.5.0'

// ── CORS headers required for browser-to-edge-function calls ─────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Brand colours (no leading #) ──────────────────────────────────────────────

const NAVY  = '1A2744'
const AMBER = 'C8871A'
const WHITE = 'FFFFFF'
const GRAY  = '6B7280'
const LIGHT = 'F9FAFB'

// ── Template name lookup ──────────────────────────────────────────────────────

const TEMPLATE_NAMES: Record<string, string> = {
  legislator_meeting_request:      'Legislator Meeting Request Letter',
  brewery_tour_invitation:         'Brewery Tour Invitation',
  economic_impact_one_pager:       'Economic Impact One-Pager',
  written_testimony:               'Written Committee Testimony',
  customer_action_alert:           'Customer Action Alert Email',
  neighbor_notification_letter:    'Neighbor Notification Letter',
  proactive_complaint_response:    'Proactive Complaint Response Protocol',
  pre_application_meeting_request: 'Pre-Application Meeting Request',
  oral_testimony_3_minute:         'Oral Testimony 3-Minute Script',
  regulatory_public_comment:       'Regulatory Public Comment',
  op_ed_structure:                 'Op-Ed Structure 600-800 Words',
  ttb_compliance_audit_memo:       'TTB Compliance Self-Audit Memo',
  letter_requesting_ttb_guidance:  'Letter Requesting TTB Guidance',
  coalition_joint_statement:       'Coalition Joint Statement',
  coalition_partner_mou:           'Coalition Partner MOU',
  coalition_health_assessment:     'Coalition Health Assessment',
}

// ═════════════════════════════════════════════════════════════════════════════
// DOCUMENT HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** Returns a blank paragraph — used as vertical spacing between sections. */
function spacer(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 0, before: 0, line: 240 } })
}

/** Returns a paragraph containing a single TextRun. Accepts optional styling. */
function p(
  text: string,
  opts: {
    bold?: boolean; italic?: boolean; size?: number; color?: string;
    align?: AlignmentType; spaceBefore?: number; spaceAfter?: number;
    font?: string;
  } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: {
      before: opts.spaceBefore ?? 0,
      after:  opts.spaceAfter  ?? 120,
    },
    children: [
      new TextRun({
        text,
        bold:    opts.bold   ?? false,
        italics: opts.italic ?? false,
        size:    (opts.size ?? 11) * 2,   // docx uses half-points
        color:   opts.color ?? '000000',
        font:    opts.font  ?? 'Calibri',
      }),
    ],
  })
}

/** Returns a styled heading paragraph (no built-in heading styles — manual styling). */
function heading(text: string, sizePt = 14, color = NAVY, spaceAfter = 160): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: spaceAfter },
    children: [
      new TextRun({ text, bold: true, size: sizePt * 2, color, font: 'Calibri' }),
    ],
  })
}

/** Returns a paragraph with a top border — used as a visual section divider. */
function rule(): Paragraph {
  return new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: AMBER } },
    spacing: { before: 160, after: 160 },
    children: [],
  })
}

/**
 * Builds the letterhead header block that appears at the top of every letter template:
 * the brewery name in large navy bold, followed by city/state and optional date.
 */
function letterhead(breweryName: string, cityState: string, date?: string): Paragraph[] {
  const blocks: Paragraph[] = [
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: breweryName.toUpperCase(), bold: true, size: 32, color: NAVY, font: 'Calibri' }),
      ],
    }),
    p(cityState, { color: GRAY, size: 11 }),
  ]
  if (date) {
    blocks.push(spacer())
    blocks.push(p(date, { size: 11 }))
  }
  return blocks
}

/** Wraps a list of content paragraphs in a Document with US Letter size, 1-inch margins. */
function wrapDocument(children: Paragraph[]): Document {
  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          size:   { width: 12240, height: 15840 },
        },
      },
      children,
    }],
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 — LEGISLATOR MEETING REQUEST LETTER
// ═════════════════════════════════════════════════════════════════════════════

function buildLegislatorMeetingRequest(d: Record<string, string>): Document {
  const cityState = `${d.brewery_city}, ${d.brewery_state}`

  const children: Paragraph[] = [
    ...letterhead(d.brewery_name, cityState, d.date),
    spacer(),
    p(`${d.legislator_title} ${d.legislator_name}`),
    p(`${d.legislator_district} District, ${d.brewery_state} State Legislature`),
    spacer(),
    p(`Dear ${d.legislator_title} ${d.legislator_name}:`),
    spacer(),
    p(
      `I am writing on behalf of ${d.brewery_name}, a craft brewery located in ${cityState}, ` +
      `to respectfully request a brief meeting to discuss ${d.key_issue} and its impact on ` +
      `our brewery and the broader craft beer industry in ${d.brewery_state}.`
    ),
    spacer(),
    p(
      `${d.brewery_name} is proud to be part of ${d.brewery_city}'s small business community. ` +
      `We employ ${d.brewery_employees} local residents and contribute approximately ` +
      `${d.brewery_annual_revenue} annually to the local economy through wages, local purchasing, ` +
      `and tax revenue. Like many small craft breweries, we are deeply affected by state-level ` +
      `regulations that govern how we operate, sell, and grow our business.`
    ),
    spacer(),
    p(
      `We believe that ${d.key_issue} deserves thoughtful attention from state leadership. ` +
      `A conversation with your office would allow us to share our perspective, answer any ` +
      `questions you may have, and hear your thoughts on how to best support small manufacturers ` +
      `like us in ${d.brewery_state}.`
    ),
    spacer(),
    p(
      `We would be honored to welcome you to ${d.brewery_name} for a complimentary tour of our ` +
      `brewing facility at your convenience. Seeing a working craft brewery firsthand often ` +
      `provides valuable context for the policy discussions that affect our industry.`
    ),
    spacer(),
    p(
      `A meeting of 20–30 minutes would be greatly appreciated and can take place at your office, ` +
      `by phone, or here at our brewery. I can be reached at your convenience and am happy to ` +
      `work around your schedule. Thank you for your time and your service to ${d.legislator_district} District.`
    ),
    spacer(),
    p('Respectfully,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p(d.brewer_title),
    p(d.brewery_name),
    p(cityState),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 — BREWERY TOUR INVITATION
// ═════════════════════════════════════════════════════════════════════════════

function buildBreweryTourInvitation(d: Record<string, string>): Document {
  const cityState  = `${d.brewery_city}, ${d.brewery_state}`
  const today      = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Split talking points by newline so they can be rendered as separate bullet lines
  const talkingPoints = (d.key_talking_points ?? '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)

  const children: Paragraph[] = [
    ...letterhead(d.brewery_name, `${d.brewery_address} · ${cityState}`, today),
    spacer(),
    p(`${d.official_title} ${d.official_name}`),
    spacer(),
    p(`Dear ${d.official_title} ${d.official_name}:`),
    spacer(),
    p(
      `On behalf of ${d.brewery_name}, founded in ${d.brewery_founded_year} right here in ` +
      `${d.brewery_city}, I would like to personally invite you for a tour of our brewery. ` +
      `We believe that building relationships between local businesses and elected officials ` +
      `strengthens our community, and we would be delighted to welcome you as our guest.`
    ),
    spacer(),
    p(
      `${d.brewery_name} employs ${d.brewery_employees} local residents and produces ` +
      `${d.annual_barrels} barrels of craft beer annually. We purchase ingredients and ` +
      `supplies from local vendors wherever possible, and we host community events throughout ` +
      `the year. Simply put, the health of ${d.brewery_city}'s small business ecosystem matters deeply to us.`
    ),
    spacer(),
    p(
      `During your visit, you would have the opportunity to see our brewing operations from ` +
      `grain to glass, meet our team, and sample some of our handcrafted beers. We would ` +
      `also welcome the chance to discuss several topics important to our industry, including:`
    ),
  ]

  // Render each talking point as an indented line
  for (const point of talkingPoints) {
    children.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      indent: { left: 720 },
      children: [new TextRun({ text: `• ${point}`, size: 22, font: 'Calibri' })],
    }))
  }

  children.push(
    spacer(),
    p(
      `We are available on ${d.proposed_dates}. Please let us know what works best for ` +
      `your schedule and we will plan a tour tailored to your interests. A typical visit ` +
      `runs approximately 60–90 minutes, though we are happy to accommodate your availability.`
    ),
    spacer(),
    p(`We look forward to welcoming you to ${d.brewery_name}.`),
    spacer(),
    p('Warmly,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p(`Owner/Brewer`),
    p(d.brewery_name),
    p(cityState),
  )

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3 — ECONOMIC IMPACT ONE-PAGER
// ═════════════════════════════════════════════════════════════════════════════

/** Helper: build a two-column stat table row with a navy label cell and content cell. */
function statRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 40, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, fill: NAVY },
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 1, color: NAVY },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: NAVY },
          left:   { style: BorderStyle.SINGLE, size: 1, color: NAVY },
          right:  { style: BorderStyle.SINGLE, size: 1, color: NAVY },
        },
        children: [new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [new TextRun({ text: label, bold: true, size: 20, color: WHITE, font: 'Calibri' })],
        })],
      }),
      new TableCell({
        width: { size: 60, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, fill: LIGHT },
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 1, color: NAVY },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: NAVY },
          left:   { style: BorderStyle.SINGLE, size: 1, color: NAVY },
          right:  { style: BorderStyle.SINGLE, size: 1, color: NAVY },
        },
        children: [new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [new TextRun({ text: value, bold: true, size: 22, color: NAVY, font: 'Calibri' })],
        })],
      }),
    ],
  })
}

function buildEconomicImpactOnePager(d: Record<string, string>): Document {
  const cityState    = `${d.brewery_city}, ${d.brewery_state}`
  const totalEmp     = (parseInt(d.full_time_employees, 10) || 0) + (parseInt(d.part_time_employees, 10) || 0)

  const econTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      statRow('Full-Time Employees',      d.full_time_employees),
      statRow('Part-Time Employees',      d.part_time_employees),
      statRow('Total Annual Payroll',     d.annual_payroll),
      statRow('Annual Revenue',           d.annual_revenue),
      statRow('Annual Local Purchasing',  d.annual_local_purchases),
      statRow('Annual Visitors',          d.annual_visitors),
      statRow('Tax Contributions',        d.tax_contributions),
    ],
  })

  const communityTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      statRow('Community Events Per Year',      d.community_events_per_year),
      statRow('Annual Charitable Contributions', d.charity_donations_annual),
    ],
  })

  const children: Paragraph[] = [
    // Title block
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: d.brewery_name.toUpperCase(), bold: true, size: 36, color: NAVY, font: 'Calibri' })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: `Economic Impact Summary | ${cityState} | Est. ${d.brewery_founded_year}`, size: 22, color: AMBER, font: 'Calibri', bold: true })],
    }),
    // Summary bar
    new Paragraph({
      spacing: { before: 80, after: 160 },
      children: [
        new TextRun({ text: `${totalEmp} Employees  ·  `, bold: true, size: 22, color: NAVY, font: 'Calibri' }),
        new TextRun({ text: `${d.annual_revenue} Revenue  ·  `, bold: true, size: 22, color: NAVY, font: 'Calibri' }),
        new TextRun({ text: `${d.annual_visitors} Annual Visitors`, bold: true, size: 22, color: NAVY, font: 'Calibri' }),
      ],
    }),
    rule(),
    heading('Economic Impact', 13),
    econTable,
    spacer(),
    heading('Community Contribution', 13),
    communityTable,
    spacer(),
    // Narrative
    p(
      `${d.brewery_name} has been a cornerstone of the ${d.brewery_city} community since ${d.brewery_founded_year}. ` +
      `We employ ${totalEmp} local residents, support other local businesses through our purchasing, ` +
      `and welcome thousands of visitors to our taproom each year. Our commitment to the community ` +
      `goes beyond beer — we host ${d.community_events_per_year} community events annually and contribute ` +
      `${d.charity_donations_annual} to local charitable causes.`,
      { size: 10, spaceAfter: 200 }
    ),
    rule(),
    heading('Our Policy Ask', 13, AMBER),
    p(d.key_policy_ask, { spaceAfter: 200 }),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 4 — WRITTEN COMMITTEE TESTIMONY
// ═════════════════════════════════════════════════════════════════════════════

function buildWrittenTestimony(d: Record<string, string>): Document {
  const cityState = `${d.brewery_city}, ${d.brewery_state}`
  const posLabel  = d.position?.toUpperCase() ?? 'SUPPORT'

  // Format the position verb for narrative use
  const posVerb =
    d.position === 'Oppose' ? 'in opposition to' :
    d.position === 'Amend'  ? 'seeking amendment to' :
    'in support of'

  const children: Paragraph[] = [
    heading('WRITTEN TESTIMONY', 16),
    rule(),
    p(`Submitted to: ${d.committee_name}`, { bold: true }),
    p(`Re: ${d.bill_number} — ${d.bill_title}`),
    p(`Hearing Date: ${d.hearing_date}`),
    p(`Submitted by: ${d.brewer_name}, ${d.brewer_title}`),
    p(`Organization: ${d.brewery_name}, ${cityState}`),
    rule(),
    // Position statement
    new Paragraph({
      spacing: { before: 160, after: 160 },
      children: [
        new TextRun({ text: 'POSITION:  ', bold: true, size: 26, color: NAVY, font: 'Calibri' }),
        new TextRun({ text: `${posLabel} ${d.bill_number}`, bold: true, size: 26, color: posLabel === 'OPPOSE' ? 'DC2626' : posLabel === 'AMEND' ? AMBER : '16A34A', font: 'Calibri' }),
      ],
    }),
    rule(),
    heading('INTRODUCTION', 12),
    p(
      `${d.brewery_name} respectfully submits this written testimony ${posVerb} ${d.bill_number}, ` +
      `${d.bill_title}. ${d.brewery_name} is a craft brewery located in ${cityState}, employing ` +
      `local residents and contributing to the economic vitality of our community. As a small ` +
      `manufacturer directly affected by beer-related legislation, we have a significant stake ` +
      `in the outcome of this legislation.`
    ),
    spacer(),
    // Arguments
    heading(`ARGUMENT 1`, 12, AMBER),
    p(d.key_argument_1 ?? ''),
    spacer(),
    heading(`ARGUMENT 2`, 12, AMBER),
    p(d.key_argument_2 ?? ''),
    spacer(),
    heading(`ARGUMENT 3`, 12, AMBER),
    p(d.key_argument_3 ?? ''),
    rule(),
    heading(`IMPACT ON ${d.brewery_name.toUpperCase()}`, 12),
    p('Financial Impact:', { bold: true, spaceAfter: 60 }),
    p(d.financial_impact ?? '', { spaceAfter: 160 }),
    p('Employee Impact:', { bold: true, spaceAfter: 60 }),
    p(d.employee_impact ?? '', { spaceAfter: 160 }),
    p('Community Impact:', { bold: true, spaceAfter: 60 }),
    p(d.community_impact ?? '', { spaceAfter: 200 }),
    rule(),
    heading('REQUESTED ACTION', 12),
    p(d.requested_action ?? ''),
    spacer(),
    spacer(),
    p('Respectfully submitted,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p(d.brewer_title),
    p(d.brewery_name),
    p(cityState),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 5 — CUSTOMER ACTION ALERT EMAIL
// ═════════════════════════════════════════════════════════════════════════════

function buildCustomerActionAlert(d: Record<string, string>): Document {
  const actionLines = (d.action_requested ?? '')
    .split('\n').map(s => s.trim()).filter(Boolean)

  const children: Paragraph[] = [
    // Subject line suggestion
    new Paragraph({
      spacing: { before: 0, after: 80 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: AMBER },
      },
      children: [
        new TextRun({ text: 'SUGGESTED SUBJECT LINE:  ', bold: true, size: 20, color: GRAY, font: 'Calibri' }),
        new TextRun({
          text: `Action Needed: ${d.issue_title} Could Affect ${d.brewery_name}`,
          bold: true, size: 22, color: NAVY, font: 'Calibri',
        }),
      ],
    }),
    spacer(),
    heading('EMAIL BODY', 12, GRAY),
    spacer(),
    p(`Dear ${d.brewery_name} Community,`),
    spacer(),
    p(d.issue_summary ?? ''),
    spacer(),
    heading('What This Means For You', 12),
    p(d.what_it_means_for_customers ?? ''),
    spacer(),
    heading('What You Can Do', 12),
  ]

  if (actionLines.length > 0) {
    actionLines.forEach((line, i) => {
      children.push(new Paragraph({
        spacing: { before: 80, after: 80 },
        indent: { left: 720 },
        children: [new TextRun({ text: `${i + 1}. ${line}`, size: 22, font: 'Calibri' })],
      }))
    })
  } else {
    children.push(p(d.action_requested ?? ''))
  }

  children.push(
    spacer(),
    // Contact info box
    new Paragraph({
      spacing: { before: 160, after: 160 },
      border: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: NAVY },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY },
        left:   { style: BorderStyle.THICK,  size: 12, color: AMBER },
        right:  { style: BorderStyle.SINGLE, size: 4, color: NAVY },
      },
      indent: { left: 360 },
      children: [
        new TextRun({ text: 'Legislator Contact Information:  ', bold: true, size: 22, color: NAVY, font: 'Calibri' }),
        new TextRun({ text: d.legislator_contact_info ?? '', size: 22, font: 'Calibri' }),
      ],
    }),
    p(`Act by: ${d.deadline_date ?? 'As soon as possible'}`, { bold: true, color: 'DC2626', size: 12 }),
    spacer(),
    p(
      `Together, we can make a difference for ${d.brewery_name} and for craft beer across our state. ` +
      `Thank you for your support — it means everything to us.`
    ),
    spacer(),
    p('Cheers,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p(d.brewery_name),
    d.brewery_website ? p(d.brewery_website, { color: AMBER }) : spacer(),
  )

  return wrapDocument(children)
}

// ── Shared helpers used by multiple templates ─────────────────────────────────

/** Renders a bold label + value as two paragraphs — used in audit/assessment docs. */
function labelRow(label: string, value: string, spaceAfter = 100): Paragraph[] {
  return [
    p(label + ':', { bold: true, size: 10, spaceAfter: 20 }),
    p(value || '—', { spaceAfter }),
  ]
}

/** Renders a checkbox line: ☑ for yes/true/1/x values, ☐ otherwise. */
function checkboxLine(value: string, label: string): Paragraph {
  const checked = ['yes', 'true', '1', 'x'].includes((value ?? '').toLowerCase().trim())
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
    children: [new TextRun({
      text: `${checked ? '☑' : '☐'}  ${label}`,
      size: 22,
      font: 'Calibri',
      color: checked ? NAVY : GRAY,
    })],
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 6 — NEIGHBOR NOTIFICATION LETTER
// ═════════════════════════════════════════════════════════════════════════════

function buildNeighborNotificationLetter(d: Record<string, string>): Document {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const children: Paragraph[] = [
    p(today),
    spacer(),
    p(`Dear ${d.neighbor_salutation},`),
    spacer(),
    p(
      `My name is ${d.brewer_name}, and I am the owner of ${d.brewery_name}, located at ` +
      `${d.brewery_address} in ${d.brewery_city}. We have been a part of this neighborhood ` +
      `since ${d.year_established} and value our relationship with the community around us.`
    ),
    spacer(),
    p(
      `I am writing to let you know that we have applied to the planning department for ` +
      `${d.permit_description}. I want to make sure you hear about this directly from us ` +
      `and have a chance to ask questions before any public hearing.`
    ),
    spacer(),
    p('Here is what this means in practice:', { bold: true }),
  ]

  for (const detail of [d.detail_1, d.detail_2, d.detail_3].filter(Boolean)) {
    children.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      indent: { left: 720 },
      children: [new TextRun({ text: `• ${detail}`, size: 22, font: 'Calibri' })],
    }))
  }

  children.push(
    spacer(),
    p(
      `If you have any questions or concerns — or simply want to talk through what is planned — ` +
      `I would welcome the conversation. Please feel free to reach me at ${d.brewer_phone} ` +
      `or ${d.brewer_email} at any time.`
    ),
    spacer(),
    p(
      `If you wish to attend the public hearing, it will be held on ${d.hearing_date} at ` +
      `${d.hearing_time}, at ${d.hearing_location}. Written comments may also be submitted ` +
      `to the planning department in advance of the hearing.`
    ),
    spacer(),
    p(
      `Thank you for being a good neighbor. We are proud to be part of this community and ` +
      `look forward to continuing to serve it for years to come.`
    ),
    spacer(),
    p('Warmly,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p('Owner'),
    p(d.brewery_name),
  )

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 7 — PROACTIVE COMPLAINT RESPONSE PROTOCOL
// ═════════════════════════════════════════════════════════════════════════════

function buildProactiveComplaintResponse(d: Record<string, string>): Document {
  const checklist = [
    'Date and time of complaint recorded',
    'Nature of complaint documented',
    'Complainant contact information on file',
    'Investigation findings written up',
    'Corrective action documented',
    'Follow-up communication sent and recorded',
    'Regulatory agency notified (if required)',
  ]

  const children: Paragraph[] = [
    heading('COMPLAINT RESPONSE PROTOCOL', 14),
    heading(d.brewery_name.toUpperCase(), 12, AMBER, 80),
    rule(),
    p(`Date of Complaint: ${d.complaint_date}`, { bold: true }),
    p(`Nature of Complaint: ${d.complaint_nature}`, { bold: true }),
    rule(),
    heading('STEP 1 — ACKNOWLEDGE RECEIPT (Within 2 Hours)', 12, NAVY),
    p('Use this script when contacting the complainant:'),
    new Paragraph({
      spacing: { before: 80, after: 160 },
      border: { left: { style: BorderStyle.THICK, size: 12, color: AMBER } },
      indent: { left: 360 },
      children: [new TextRun({
        text: `"Thank you for reaching out to us at ${d.brewery_name}. We take every concern ` +
          `seriously and want to make this right. I am personally looking into this today ` +
          `and will follow up with you within 24 hours. Can I confirm the best way to reach you?"`,
        italics: true, size: 22, font: 'Calibri',
      })],
    }),
    heading('STEP 2 — INVESTIGATION (Within 24 Hours)', 12, NAVY),
    p('Investigation Findings:', { bold: true, spaceAfter: 40 }),
    p(d.investigation_findings ?? '', { spaceAfter: 160 }),
    heading('STEP 3 — FOLLOW-UP MESSAGE (Within 48 Hours)', 12, NAVY),
    p('Send this follow-up to the complainant:'),
    new Paragraph({
      spacing: { before: 80, after: 160 },
      border: { left: { style: BorderStyle.THICK, size: 12, color: AMBER } },
      indent: { left: 360 },
      children: [new TextRun({
        text: `"Thank you for your patience. We have completed our review. Here is what we ` +
          `found and what we are doing: ${d.corrective_action}. We value your feedback ` +
          `and are committed to being a good neighbor."`,
        italics: true, size: 22, font: 'Calibri',
      })],
    }),
    heading('STEP 4 — DOCUMENTATION CHECKLIST', 12, NAVY),
  ]

  checklist.forEach(item => children.push(new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
    children: [new TextRun({ text: `☐  ${item}`, size: 22, font: 'Calibri' })],
  })))

  children.push(
    spacer(),
    heading('STEP 5 — FOLLOW-UP', 12, NAVY),
    p(`Scheduled follow-up to confirm resolution: ${d.follow_up_date}`, { bold: true }),
    spacer(),
    rule(),
    p(`Contact for this file: ${d.brewer_name}  |  ${d.brewer_phone}  |  ${d.brewer_email}`, { color: GRAY }),
  )

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 8 — PRE-APPLICATION MEETING REQUEST
// ═════════════════════════════════════════════════════════════════════════════

function buildPreApplicationMeetingRequest(d: Record<string, string>): Document {
  const purposes = [
    `Confirm the correct application type and approval pathway for ${d.project_description}`,
    'Understand all submission requirements, timelines, and applicable fees',
    'Identify any known concerns your department may have so we can address them proactively',
  ]
  const dates = [d.available_date_1, d.available_date_2, d.available_date_3].filter(Boolean)

  const children: Paragraph[] = [
    p(d.date),
    spacer(),
    p(d.planning_dept_name, { bold: true }),
    p(`City/County of ${d.city_county}`),
    spacer(),
    p(`RE: Pre-Application Meeting Request — ${d.project_description}`, { bold: true }),
    spacer(),
    p(`Dear ${d.planning_director_name},`),
    spacer(),
    p(
      `I am the owner of ${d.brewery_name}, a licensed craft brewery located at ` +
      `${d.brewery_address}. We are in the early planning stages of a proposed project: ` +
      `${d.project_description}. Before preparing a formal application, we respectfully ` +
      `request a pre-application meeting with your department.`
    ),
    spacer(),
    p('We are seeking this meeting to accomplish three specific goals:'),
  ]

  purposes.forEach(item => children.push(new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 720 },
    children: [new TextRun({ text: `• ${item}`, size: 22, font: 'Calibri' })],
  })))

  children.push(spacer(), p('We are available for a meeting on any of the following dates:'))

  dates.forEach(date => children.push(new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 720 },
    children: [new TextRun({ text: `• ${date}`, size: 22, font: 'Calibri' })],
  })))

  children.push(
    spacer(),
    p(
      `We understand that a pre-application meeting does not constitute approval of any kind ` +
      `and we enter it as a planning exercise only. We are committed to working within the ` +
      `process and want to be a cooperative applicant from the outset.`
    ),
    spacer(),
    p(
      `Please contact me at ${d.brewer_phone} or ${d.brewer_email} to confirm a time that ` +
      `works for your department. We look forward to working with you.`
    ),
    spacer(),
    p('Respectfully,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p('Owner'),
    p(d.brewery_name),
    p(d.brewery_address),
  )

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 9 — ORAL TESTIMONY 3-MINUTE SCRIPT
// ═════════════════════════════════════════════════════════════════════════════

function buildOralTestimony3Minute(d: Record<string, string>): Document {
  const scriptBlock = (text: string): Paragraph => new Paragraph({
    spacing: { before: 80, after: 160 },
    border: { left: { style: BorderStyle.THICK, size: 12, color: AMBER } },
    indent: { left: 360 },
    children: [new TextRun({ text: `"${text}"`, italics: true, size: 22, font: 'Calibri' })],
  })

  const sectionHeader = (title: string, timing: string): Paragraph => new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text: title + '  ', bold: true, size: 24, color: NAVY, font: 'Calibri' }),
      new TextRun({ text: `(${timing})`, italics: true, size: 20, color: GRAY, font: 'Calibri' }),
    ],
  })

  const children: Paragraph[] = [
    heading('3-MINUTE ORAL TESTIMONY SCRIPT', 14),
    p(`${d.brewery_name}  ·  ${d.brewery_city}  ·  ${d.bill_number}`, { color: GRAY }),
    rule(),
    sectionHeader('OPENING', '30 seconds'),
    scriptBlock(
      `Good [morning/afternoon]. My name is ${d.brewer_name}. I own ${d.brewery_name} ` +
      `in ${d.brewery_city}, in [Representative] ${d.district_representative_name}'s district. ` +
      `We employ ${d.employee_count} people, contribute $${d.annual_tax_contribution} in state ` +
      `taxes annually, and welcomed ${d.annual_visitors} visitors to our taproom last year.`
    ),
    sectionHeader('THE STORY', '60–90 seconds'),
    scriptBlock(
      `${d.specific_impact_story} ${d.affected_employee_name} — ${d.affected_employee_context} — ` +
      `is exactly the kind of person this legislation affects.`
    ),
    sectionHeader('THE NUMBER', '30 seconds'),
    scriptBlock(
      `This is not just about my brewery. Across ${d.number_of_state_breweries} craft breweries ` +
      `in our state, the total impact is $${d.total_state_impact}. For my brewery alone, ` +
      `we are looking at $${d.financial_impact_amount} per year.`
    ),
    sectionHeader('THE ASK', '30 seconds'),
    scriptBlock(
      `${d.specific_ask}. Specifically, I ask you to support the amendment to ` +
      `Section ${d.amendment_section}. Thank you for your time.`
    ),
    rule(),
    new Paragraph({
      spacing: { before: 100, after: 100 },
      children: [
        new TextRun({ text: 'PRACTICE NOTE:  ', bold: true, size: 20, color: AMBER, font: 'Calibri' }),
        new TextRun({
          text: 'Time yourself out loud. 3 minutes = approximately 400–450 words.',
          italics: true, size: 20, color: GRAY, font: 'Calibri',
        }),
      ],
    }),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 10 — REGULATORY PUBLIC COMMENT
// ═════════════════════════════════════════════════════════════════════════════

function buildRegulatoryPublicComment(d: Record<string, string>): Document {
  const cityState = `${d.brewery_city}, ${d.brewery_state}`

  const commentSection = (num: string, regText: string, impact: string, alt: string): Paragraph[] => [
    heading(`SPECIFIC COMMENT — SECTION ${num}`, 12, NAVY),
    p('Regulatory Text:', { bold: true, spaceAfter: 40 }),
    new Paragraph({
      spacing: { before: 60, after: 120 },
      border: { left: { style: BorderStyle.THICK, size: 8, color: GRAY } },
      indent: { left: 360 },
      children: [new TextRun({ text: regText || '—', italics: true, size: 22, font: 'Calibri', color: GRAY })],
    }),
    p('Operational Impact:', { bold: true, spaceAfter: 40 }),
    p(impact || '', { spaceAfter: 120 }),
    p('Proposed Alternative:', { bold: true, spaceAfter: 40 }),
    p(alt || '', { spaceAfter: 160 }),
    rule(),
  ]

  const children: Paragraph[] = [
    heading(`COMMENT OF ${d.brewer_name.toUpperCase()}, ${d.brewer_title.toUpperCase()}`, 13),
    heading(d.brewery_name.toUpperCase(), 12, AMBER, 80),
    rule(),
    p(`Re: ${d.agency_name} Proposed Rule — ${d.rule_number}: ${d.rule_title}`, { bold: true }),
    p(`Comment Period Deadline: ${d.comment_deadline}`, { bold: true }),
    p(`Date: ${d.date}`),
    rule(),
    heading('SUMMARY POSITION', 12, NAVY),
    p(d.summary_position ?? '', { spaceAfter: 160 }),
    heading('COMMENTER BACKGROUND', 12, NAVY),
    p(
      `${d.brewer_name} is the ${d.brewer_title} of ${d.brewery_name}, a craft brewery located ` +
      `in ${cityState}. The brewery produces ${d.production_volume} annually, employs ` +
      `${d.employee_count} people, and has held its federal brewer's license for ` +
      `${d.years_licensed} years.`
    ),
    rule(),
    ...commentSection(
      d.section_number_1, d.regulatory_text_1, d.operational_impact_1, d.proposed_alternative_1
    ),
    ...commentSection(
      d.section_number_2, d.regulatory_text_2, d.operational_impact_2, d.proposed_alternative_2
    ),
    heading('REQUESTED MODIFICATION', 12, NAVY),
    p(d.requested_modification ?? '', { spaceAfter: 160 }),
    heading('SUPPORTING DATA', 12, NAVY),
    p(d.supporting_data_description ?? '', { spaceAfter: 200 }),
    rule(),
    p('Respectfully submitted,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p(d.brewer_title),
    p(d.brewery_name),
    p(cityState),
    p(`${d.brewer_phone}  |  ${d.brewer_email}`, { color: GRAY }),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 11 — OP-ED STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

function buildOpEdStructure(d: Record<string, string>): Document {
  const wordCounts: [string, string][] = [
    ['Opening Hook',        '50–75 words'],
    ['Context',             '100–150 words'],
    ['Your Story',          '100–150 words'],
    ['The Policy Argument', '150–200 words'],
    ['The Data',            '75–100 words'],
    ['The Call to Action',  '50–75 words'],
    ['TOTAL TARGET',        '600–800 words'],
  ]

  const bylineParts = [
    d.brewer_name,
    `Owner, ${d.brewery_name}`,
    d.brewery_city,
    d.guild_role_optional,
  ].filter(Boolean)

  const children: Paragraph[] = [
    heading('OP-ED DRAFT', 14),
    p(`${d.brewery_name}  ·  ${d.brewery_city}, ${d.brewery_state}  ·  ${d.date}`, { color: GRAY }),
    rule(),
    p('SUGGESTED HEADLINE:', { bold: true, color: AMBER, spaceAfter: 40 }),
    heading(d.headline_draft ?? '', 16, NAVY, 160),
    rule(),
    heading('Opening Hook', 12, AMBER),
    p('(50–75 words)', { italic: true, color: GRAY, spaceAfter: 60 }),
    p(d.opening_hook ?? '', { spaceAfter: 160 }),
    heading('Context', 12, AMBER),
    p('(100–150 words)', { italic: true, color: GRAY, spaceAfter: 60 }),
    p(d.policy_issue_context ?? '', { spaceAfter: 160 }),
    heading('Your Story', 12, AMBER),
    p('(100–150 words)', { italic: true, color: GRAY, spaceAfter: 60 }),
    p(d.brewery_personal_story ?? '', { spaceAfter: 160 }),
    heading('The Policy Argument', 12, AMBER),
    p('(150–200 words)', { italic: true, color: GRAY, spaceAfter: 60 }),
    p(d.policy_argument ?? '', { spaceAfter: 160 }),
    heading('The Data', 12, AMBER),
    p('(75–100 words)', { italic: true, color: GRAY, spaceAfter: 60 }),
    p(d.statewide_data ?? '', { spaceAfter: 160 }),
    heading('The Call to Action', 12, AMBER),
    p('(50–75 words)', { italic: true, color: GRAY, spaceAfter: 60 }),
    p(`${d.specific_ask ?? ''} — ${d.deadline_urgency ?? ''}`, { spaceAfter: 160 }),
    rule(),
    p('BYLINE:', { bold: true, color: NAVY, spaceAfter: 40 }),
    p(bylineParts.join('. ') + '.', { italic: true, spaceAfter: 160 }),
    new Paragraph({
      spacing: { before: 120, after: 120 },
      border: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: NAVY },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY },
        left:   { style: BorderStyle.THICK,  size: 12, color: AMBER },
        right:  { style: BorderStyle.SINGLE, size: 4, color: NAVY },
      },
      indent: { left: 360 },
      children: [
        new TextRun({ text: 'SUBMISSION NOTE:  ', bold: true, size: 22, color: AMBER, font: 'Calibri' }),
        new TextRun({
          text: `Target publication: ${d.publication_target}. Call the opinion desk editor before ` +
            `submitting — 2 minutes on the phone dramatically improves placement rates.`,
          size: 22, font: 'Calibri',
        }),
      ],
    }),
    spacer(),
    p('WORD COUNT GUIDE:', { bold: true, color: GRAY, spaceAfter: 40 }),
    ...wordCounts.map(([label, count], i) => new Paragraph({
      spacing: { before: 40, after: 40 },
      indent: { left: 360 },
      children: [new TextRun({
        text: `${label}: ${count}`,
        bold: i === wordCounts.length - 1,
        size: 20,
        color: i === wordCounts.length - 1 ? NAVY : GRAY,
        font: 'Calibri',
      })],
    })),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 12 — TTB COMPLIANCE SELF-AUDIT MEMO
// ═════════════════════════════════════════════════════════════════════════════

function buildTtbComplianceAuditMemo(d: Record<string, string>): Document {
  const children: Paragraph[] = [
    heading('INTERNAL COMPLIANCE MEMORANDUM', 14),
    rule(),
    p(`TO:    ${d.brewer_name} / ${d.brewer_role}`, { bold: true }),
    p(`FROM:  ${d.brewer_name}`, { bold: true }),
    p(`DATE:  ${d.audit_date}`, { bold: true }),
    p(`RE:    Annual Federal Compliance Self-Audit — ${d.brewery_name}`, { bold: true }),
    rule(),
    heading("SECTION 1 — BREWER'S NOTICE STATUS", 12, NAVY),
    ...labelRow("Brewer's Notice Number",                             d.brewers_notice_number),
    ...labelRow('Notice Last Amended',                               d.notice_last_amended),
    ...labelRow('Notice Accurate (operations, equipment, personnel)', d.notice_accurate),
    ...labelRow('Discrepancies Noted',                               d.discrepancies || 'None'),
    spacer(),
    heading('SECTION 2 — EXCISE TAX FILING STATUS', 12, NAVY),
    ...labelRow('Filing Frequency',         d.filing_frequency),
    ...labelRow('Last Filing Date',          d.last_filing_date),
    ...labelRow('Late Filings in Past Year', d.late_filings_past_year || '0'),
    ...labelRow('Filing Notes',              d.filing_notes || 'None'),
    spacer(),
    heading('SECTION 3 — COLA STATUS', 12, NAVY),
    ...labelRow('Total Active COLAs',     d.total_active_colas),
    ...labelRow('COLAs Pending Approval', d.colas_pending),
    ...labelRow('Products Without COLA',  d.products_without_cola || 'None'),
    ...labelRow('COLA Notes',             d.cola_notes || 'None'),
    spacer(),
    heading('SECTION 4 — RECORD-KEEPING', 12, NAVY),
    ...labelRow('Records Current Through',                    d.records_current_through),
    ...labelRow('Storage Format',                             d.storage_format),
    ...labelRow('Records Accessible for 3-Year Audit Window', d.records_accessible),
    spacer(),
    heading('SECTION 5 — OPEN ITEMS / CORRECTIVE ACTIONS', 12, AMBER),
    ...(d.action_1
      ? [p(`1.  ${d.action_1}`, { bold: true, spaceAfter: 40 }),
         p(`    Due: ${d.action_1_due}`, { color: GRAY, spaceAfter: 120 })]
      : [p('No open items.', { color: GRAY })]),
    ...(d.action_2
      ? [p(`2.  ${d.action_2}`, { bold: true, spaceAfter: 40 }),
         p(`    Due: ${d.action_2_due}`, { color: GRAY, spaceAfter: 120 })]
      : []),
    rule(),
    p(`Completed by: ${d.signed_by}`, { bold: true, spaceAfter: 40 }),
    p(`Date: ${d.signed_date}`),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 13 — LETTER REQUESTING TTB GUIDANCE
// ═════════════════════════════════════════════════════════════════════════════

function buildLetterRequestingTtbGuidance(d: Record<string, string>): Document {
  const children: Paragraph[] = [
    p(d.date),
    spacer(),
    p('Alcohol and Tobacco Tax and Trade Bureau', { bold: true }),
    p('National Revenue Center'),
    p('550 Main Street, Suite 8002'),
    p('Cincinnati, OH 45202'),
    spacer(),
    p(`RE: Request for Informal Guidance — ${d.guidance_topic}`, { bold: true }),
    spacer(),
    p('Dear TTB National Revenue Center,'),
    spacer(),
    p(
      `My name is ${d.brewer_name}, ${d.brewer_title} of ${d.brewery_name}, located at ` +
      `${d.brewery_address}. Our Brewer's Notice Number is ${d.brewers_notice_number}. ` +
      `I am writing to request informal guidance on a regulatory question that has arisen ` +
      `in the course of our operations.`
    ),
    spacer(),
    heading('Regulatory Question', 12, NAVY),
    p(d.regulatory_question ?? ''),
    spacer(),
    heading('Prior Guidance Reviewed', 12, NAVY),
    p(d.prior_guidance_reviewed ?? ''),
    spacer(),
    heading('Our Current Interpretation', 12, NAVY),
    p(d.brewery_interpretation ?? ''),
    spacer(),
    p(
      `We want to ensure we are in full compliance with federal regulations and would welcome ` +
      `any clarification you are able to provide. We are happy to discuss this matter by ` +
      `phone or email at your convenience.`
    ),
    spacer(),
    p(
      `The best contact for follow-up is ${d.preferred_contact_name} at ` +
      `${d.preferred_contact_phone} or ${d.preferred_contact_email}.`
    ),
    spacer(),
    p('Thank you for your time and assistance.'),
    spacer(),
    p('Respectfully,'),
    spacer(),
    p(d.brewer_name, { bold: true }),
    p(d.brewer_title),
    p(d.brewery_name),
    p(d.brewery_address),
    p(`Brewer's Notice: ${d.brewers_notice_number}`, { color: GRAY }),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 14 — COALITION JOINT STATEMENT
// ═════════════════════════════════════════════════════════════════════════════

function buildCoalitionJointStatement(d: Record<string, string>): Document {
  const isOppose  = (d.support_or_oppose ?? '').toLowerCase().includes('oppos')
  const titleText = isOppose
    ? `JOINT STATEMENT IN OPPOSITION TO ${d.bill_number}: ${d.bill_title}`
    : `JOINT STATEMENT OF SUPPORT FOR ${d.bill_number}: ${d.bill_title}`

  const partners = [
    { name: d.partner_1_name, desc: d.partner_1_descriptor },
    { name: d.partner_2_name, desc: d.partner_2_descriptor },
    { name: d.partner_3_name, desc: d.partner_3_descriptor },
    { name: d.partner_4_name, desc: d.partner_4_descriptor },
  ].filter(pt => pt.name)

  const children: Paragraph[] = [
    heading(titleText, 13),
    heading(`Issued by the ${d.coalition_name}`, 11, AMBER, 60),
    p(`Date: ${d.date}`, { color: GRAY }),
    rule(),
    p(
      `The undersigned organizations, representing ${d.coalition_description}, jointly ` +
      `${isOppose ? 'oppose' : 'support'} ${d.bill_number}, ${d.bill_title}.`
    ),
    spacer(),
    heading('BACKGROUND', 12, NAVY),
    p(d.background_summary ?? '', { spaceAfter: 160 }),
    heading(isOppose ? 'OUR SHARED CONCERN' : 'OUR SHARED SUPPORT', 12, NAVY),
    p(d.shared_position ?? '', { spaceAfter: 160 }),
    heading('IMPACT ON OUR COMMUNITIES', 12, NAVY),
    p(d.impact_on_communities ?? '', { spaceAfter: 160 }),
    rule(),
    heading('OUR REQUEST', 12, AMBER),
    p(`${d.specific_request} to the ${d.committee_or_chamber}.`, { spaceAfter: 200 }),
    rule(),
    heading('SIGNED', 12, NAVY),
  ]

  partners.forEach(pt => {
    children.push(p(pt.name, { bold: true, spaceAfter: 20 }))
    if (pt.desc) children.push(p(pt.desc, { color: GRAY, spaceAfter: 120 }))
  })

  children.push(
    rule(),
    p(`For information contact: ${d.coordinator_name}  |  ${d.coordinator_contact}`, { color: GRAY }),
  )

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 15 — COALITION PARTNER MOU
// ═════════════════════════════════════════════════════════════════════════════

function buildCoalitionPartnerMou(d: Record<string, string>): Document {
  const coalitionCommitments = [
    'Keep all partners informed of legislative developments within 24 hours',
    'Provide draft testimony and talking points for partner use',
    'Coordinate media strategy to avoid contradictory messaging',
    'Acknowledge all partners in public materials (unless anonymity is requested)',
  ]

  const children: Paragraph[] = [
    heading('COALITION PARTICIPATION AGREEMENT', 14),
    heading(`${d.coalition_name} — ${d.year_session}`, 12, AMBER, 80),
    rule(),
    p(
      `${d.organization_name} hereby confirms its participation in the ${d.coalition_name} ` +
      `for the ${d.year_session} legislative session.`
    ),
    spacer(),
    heading('COALITION PURPOSE', 12, NAVY),
    p(d.coalition_purpose ?? '', { spaceAfter: 60 }),
    p(`Policy Objective: ${d.policy_objective}`, { bold: true, spaceAfter: 160 }),
    heading('PARTICIPATING ORGANIZATION COMMITS TO', 12, NAVY),
    p('Tier 1 — Core Commitments:', { bold: true, spaceAfter: 60 }),
    checkboxLine(d.tier1_sign_statement,      'Sign the coalition joint statement'),
    checkboxLine(d.tier1_issue_own_statement,  'Issue own organizational statement in support'),
    checkboxLine(d.tier1_named_partner,        'Be listed as a named coalition partner in materials'),
    spacer(),
    p('Tier 2 — Active Participation:', { bold: true, spaceAfter: 60 }),
    checkboxLine(d.tier2_coordinated_media,  'Participate in coordinated media outreach'),
    checkboxLine(d.tier2_written_testimony,  'Submit written testimony'),
    checkboxLine(d.tier2_meet_legislators,   'Meet with legislators or their staff'),
    checkboxLine(d.tier2_activate_network,   'Activate member/customer network'),
    spacer(),
    p('Tier 3 — Full Engagement:', { bold: true, spaceAfter: 60 }),
    checkboxLine(d.tier3_attend_meetings,  'Attend all coalition strategy meetings'),
    checkboxLine(d.tier3_cosign_amendment, 'Co-sign a formal amendment request'),
    checkboxLine(d.tier3_provide_data,     'Provide proprietary data for testimony'),
    checkboxLine(d.tier3_press_conference, 'Appear at press conference'),
    rule(),
    heading('COALITION COMMITS TO', 12, NAVY),
    ...coalitionCommitments.map(item => new Paragraph({
      spacing: { before: 60, after: 60 },
      indent: { left: 360 },
      children: [new TextRun({ text: `☑  ${item}`, size: 22, color: NAVY, font: 'Calibri' })],
    })),
    rule(),
    heading('COALITION COORDINATOR', 12, NAVY),
    p(d.coordinator_name, { bold: true, spaceAfter: 20 }),
    p(d.coordinator_org ?? '', { spaceAfter: 20 }),
    p(d.coordinator_contact ?? '', { color: GRAY, spaceAfter: 160 }),
    rule(),
    heading('AUTHORIZED SIGNATURE', 12, NAVY),
    spacer(),
    p('Signature: ___________________________', { spaceAfter: 80 }),
    p(`Name: ${d.signatory_name}`, { bold: true, spaceAfter: 20 }),
    p(`Title: ${d.signatory_title}`, { spaceAfter: 20 }),
    p(`Organization: ${d.signatory_org}`, { spaceAfter: 20 }),
    p(`Date: ${d.date}`),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 16 — COALITION HEALTH ASSESSMENT
// ═════════════════════════════════════════════════════════════════════════════

function buildCoalitionHealthAssessment(d: Record<string, string>): Document {
  const h = (d.overall_health ?? '').toLowerCase()
  const healthColor =
    h.includes('strong')  ? '16A34A' :
    h.includes('at risk') ? 'DC2626' :
    h.includes('caution') ? AMBER    : NAVY

  const children: Paragraph[] = [
    heading('COALITION HEALTH ASSESSMENT', 14),
    heading(`${d.coalition_name} — ${d.quarter}`, 12, AMBER, 80),
    p(`Assessment Date: ${d.assessment_date}`, { color: GRAY }),
    rule(),
    heading('PARTNER ENGAGEMENT', 12, NAVY),
    ...labelRow('Total Partners',              d.total_partners),
    ...labelRow('Active Partners',             d.active_partners),
    ...labelRow('Partners Who Took Action',    d.partners_taken_action),
    ...labelRow('Partners At Risk of Dropout', d.partners_at_risk),
    ...labelRow('New Partners This Quarter',   d.new_partners),
    spacer(),
    heading('COMMUNICATION HEALTH', 12, NAVY),
    ...labelRow('Communications Issued',  d.communications_issued),
    ...labelRow('Avg Response Time',      d.avg_response_time),
    ...labelRow('Messaging Consistent',   d.messaging_consistent),
    ...labelRow('Contradictions Noted',   d.messaging_contradictions || 'None'),
    spacer(),
    heading('LEGISLATIVE STATUS', 12, NAVY),
    ...labelRow('Current Bill Status',               d.bill_current_status),
    ...labelRow('Political Feasibility Change',      d.political_feasibility_change),
    ...labelRow('Legislative Meetings This Quarter', d.legislative_meetings),
    ...labelRow('Testimony Submitted',               d.testimony_submitted),
    ...labelRow('Media Coverage',                    d.media_coverage),
    spacer(),
    heading('INTERNAL TENSIONS', 12, NAVY),
    ...labelRow('Active Tensions',           d.active_tensions || 'None'),
    ...labelRow('Partners With Concerns',    d.partners_with_concerns || 'None'),
    ...labelRow('Issues Requiring Decision', d.issues_requiring_decision || 'None'),
    rule(),
    new Paragraph({
      spacing: { before: 160, after: 120 },
      children: [
        new TextRun({ text: 'OVERALL HEALTH RATING:  ', bold: true, size: 28, color: NAVY, font: 'Calibri' }),
        new TextRun({ text: d.overall_health ?? '', bold: true, size: 28, color: healthColor, font: 'Calibri' }),
      ],
    }),
    rule(),
    heading('ACTION ITEMS', 12, AMBER),
    ...(d.action_1 ? [p(`1.  ${d.action_1}`, { spaceAfter: 80 })] : []),
    ...(d.action_2 ? [p(`2.  ${d.action_2}`, { spaceAfter: 80 })] : []),
    ...(d.action_3 ? [p(`3.  ${d.action_3}`, { spaceAfter: 80 })] : []),
    rule(),
    p(`Completed by: ${d.completed_by}  |  Next Review: ${d.next_review}`, { color: GRAY }),
  ]

  return wrapDocument(children)
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTER — dispatches to the correct template builder
// ═════════════════════════════════════════════════════════════════════════════

function generateDocument(templateId: string, data: Record<string, string>): Document {
  switch (templateId) {
    case 'legislator_meeting_request':     return buildLegislatorMeetingRequest(data)
    case 'brewery_tour_invitation':        return buildBreweryTourInvitation(data)
    case 'economic_impact_one_pager':      return buildEconomicImpactOnePager(data)
    case 'written_testimony':              return buildWrittenTestimony(data)
    case 'customer_action_alert':          return buildCustomerActionAlert(data)
    case 'neighbor_notification_letter':   return buildNeighborNotificationLetter(data)
    case 'proactive_complaint_response':   return buildProactiveComplaintResponse(data)
    case 'pre_application_meeting_request': return buildPreApplicationMeetingRequest(data)
    case 'oral_testimony_3_minute':        return buildOralTestimony3Minute(data)
    case 'regulatory_public_comment':      return buildRegulatoryPublicComment(data)
    case 'op_ed_structure':                return buildOpEdStructure(data)
    case 'ttb_compliance_audit_memo':      return buildTtbComplianceAuditMemo(data)
    case 'letter_requesting_ttb_guidance': return buildLetterRequestingTtbGuidance(data)
    case 'coalition_joint_statement':      return buildCoalitionJointStatement(data)
    case 'coalition_partner_mou':          return buildCoalitionPartnerMou(data)
    case 'coalition_health_assessment':    return buildCoalitionHealthAssessment(data)
    default: throw new Error(`Unknown template_id: ${templateId}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // Return CORS pre-flight immediately without processing
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  try {
    // ── 1. JWT verification ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization header' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')              ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const token = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Unauthorized — invalid token' }, 401)
    }

    // ── 2. Full Suite subscription check ────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('subscription_tier, subscription_status, brewery_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return json({ error: 'Could not load user profile' }, 500)
    }

    if (profile.subscription_tier !== 'full_suite' || profile.subscription_status !== 'active') {
      return json({ error: 'Full Suite subscription required to generate documents' }, 403)
    }

    // ── 3. Parse request body ────────────────────────────────────────────────
    const body = await req.json()
    const { template_id, brewery_data } = body as {
      template_id:   string
      brewery_data:  Record<string, string>
    }

    if (!template_id || !brewery_data) {
      return json({ error: 'Missing template_id or brewery_data' }, 400)
    }

    if (!TEMPLATE_NAMES[template_id]) {
      return json({ error: `Unknown template: ${template_id}` }, 400)
    }

    // ── 4. Generate the Word document ────────────────────────────────────────
    const doc    = generateDocument(template_id, brewery_data)
    const buffer = await Packer.toBuffer(doc)

    // Convert ArrayBuffer → base64 in chunks to avoid call-stack overflow
    const bytes  = new Uint8Array(buffer)
    let binary   = ''
    const CHUNK  = 8192
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    const base64   = btoa(binary)
    const filename = `${template_id.replace(/_/g, '-')}-${new Date().toISOString().slice(0, 10)}.docx`

    // ── 5. Log the generation (fire-and-forget; don't fail the request if it errors) ──
    supabase.from('playbook_generations').insert({
      brewery_id:    profile.brewery_id,
      template_id,
      template_name: TEMPLATE_NAMES[template_id],
      brewery_data,
    }).then(() => {}).catch(() => {})

    // ── 6. Return encoded document ───────────────────────────────────────────
    return json({ base64, filename })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-document] Error:', msg)
    return json({ error: 'Document generation failed', detail: msg }, 500)
  }
})
