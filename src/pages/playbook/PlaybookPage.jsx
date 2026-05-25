/**
 * PlaybookPage — Full Suite Module 5: Regulation Playbook & Templates.
 * 16 advocacy and compliance document templates organized in 5 categories.
 * Document generation calls the generate-document Edge Function which returns
 * a base64-encoded .docx file for immediate browser download.
 */
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── Template definitions organized by category ────────────────────────────────
// Fields with auto:true are pre-filled from brewery context and hidden from the form.
// Fields with defaultToday:true default to today's date.

const CATEGORIES = [
  {
    name: 'LEGISLATOR COMMUNICATIONS',
    templates: [
      {
        id: 'legislator_meeting_request',
        name: 'Legislator Meeting Request Letter',
        description: 'A formal letter requesting a face-to-face meeting with your state or federal legislator to discuss issues affecting your brewery.',
        icon: '🏛️',
        fields: [
          { key: 'brewery_name',           label: 'Brewery Name',          auto: true },
          { key: 'brewery_city',           label: 'City',                  auto: true },
          { key: 'brewery_state',          label: 'State',                 auto: true },
          { key: 'brewer_name',            label: 'Your Name',             required: true },
          { key: 'brewer_title',           label: 'Your Title',            required: true, placeholder: 'e.g. Owner & Head Brewer' },
          { key: 'date',                   label: 'Letter Date',           required: true, type: 'date', defaultToday: true },
          { key: 'legislator_name',        label: 'Legislator Name',       required: true },
          { key: 'legislator_title',       label: 'Legislator Title',      required: true, placeholder: 'e.g. State Senator' },
          { key: 'legislator_district',    label: 'District / Office',     required: true, placeholder: 'e.g. District 14' },
          { key: 'key_issue',              label: 'Key Issue to Discuss',  required: true, placeholder: 'e.g. Self-distribution rights' },
          { key: 'brewery_employees',      label: 'Number of Employees',   required: true, placeholder: 'e.g. 12' },
          { key: 'brewery_annual_revenue', label: 'Annual Revenue',        required: true, placeholder: 'e.g. $1.2M' },
        ],
      },
      {
        id: 'brewery_tour_invitation',
        name: 'Brewery Tour Invitation',
        description: 'Invite a local official, legislator, or business leader on a behind-the-scenes tour to show your economic impact firsthand.',
        icon: '🍺',
        fields: [
          { key: 'brewery_name',         label: 'Brewery Name',            auto: true },
          { key: 'brewery_city',         label: 'City',                    auto: true },
          { key: 'brewery_state',        label: 'State',                   auto: true },
          { key: 'brewery_address',      label: 'Brewery Address',         required: true, placeholder: 'e.g. 123 Main St' },
          { key: 'brewer_name',          label: 'Your Name',               required: true },
          { key: 'official_name',        label: "Guest's Name",            required: true },
          { key: 'official_title',       label: "Guest's Title",           required: true, placeholder: 'e.g. Mayor, City Council Member' },
          { key: 'proposed_dates',       label: 'Proposed Dates',          required: true, placeholder: 'e.g. Any Tuesday or Thursday afternoon' },
          { key: 'brewery_founded_year', label: 'Year Founded',            required: true, placeholder: 'e.g. 2018' },
          { key: 'brewery_employees',    label: 'Number of Employees',     required: true, placeholder: 'e.g. 12' },
          { key: 'annual_barrels',       label: 'Annual Barrels Produced', required: true, placeholder: 'e.g. 800' },
          { key: 'key_talking_points',   label: 'Key Talking Points',      type: 'textarea', placeholder: 'What you most want the guest to see or understand…' },
        ],
      },
      {
        id: 'economic_impact_one_pager',
        name: 'Economic Impact One-Pager',
        description: "A polished one-page fact sheet documenting your brewery's local economic contribution — jobs, tax revenue, purchases, and community giving.",
        icon: '📊',
        fields: [
          { key: 'brewery_name',              label: 'Brewery Name',             auto: true },
          { key: 'brewery_city',              label: 'City',                     auto: true },
          { key: 'brewery_state',             label: 'State',                    auto: true },
          { key: 'brewery_founded_year',      label: 'Year Founded',             required: true, placeholder: 'e.g. 2018' },
          { key: 'full_time_employees',       label: 'Full-Time Employees',      required: true, placeholder: 'e.g. 8' },
          { key: 'part_time_employees',       label: 'Part-Time Employees',      required: true, placeholder: 'e.g. 6' },
          { key: 'annual_payroll',            label: 'Annual Payroll',           required: true, placeholder: 'e.g. $420,000' },
          { key: 'annual_revenue',            label: 'Annual Revenue',           required: true, placeholder: 'e.g. $1.1M' },
          { key: 'annual_local_purchases',    label: 'Annual Local Purchases',   required: true, placeholder: 'e.g. $180,000' },
          { key: 'annual_visitors',           label: 'Annual Taproom Visitors',  required: true, placeholder: 'e.g. 15,000' },
          { key: 'tax_contributions',         label: 'Annual Tax Contributions', required: true, placeholder: 'e.g. $95,000' },
          { key: 'community_events_per_year', label: 'Community Events / Year',  required: true, placeholder: 'e.g. 24' },
          { key: 'charity_donations_annual',  label: 'Annual Charity Donations', required: true, placeholder: 'e.g. $12,000' },
          { key: 'key_policy_ask',            label: 'Policy Ask (optional)',    type: 'textarea', placeholder: 'e.g. We urge the council to support self-distribution rights…' },
        ],
      },
      {
        id: 'neighbor_notification_letter',
        name: 'Neighbor Notification Letter',
        description: 'A friendly, transparent letter to neighboring property owners explaining a planned permit or expansion before the public hearing.',
        icon: '🏘️',
        fields: [
          { key: 'brewery_name',         label: 'Brewery Name',        auto: true },
          { key: 'brewery_city',         label: 'City',                auto: true },
          { key: 'brewery_address',      label: 'Brewery Address',     required: true, placeholder: 'e.g. 123 Main St' },
          { key: 'brewer_name',          label: 'Your Name',           required: true },
          { key: 'neighbor_salutation',  label: 'Neighbor Salutation', required: true, placeholder: 'e.g. Neighbor, Dear Resident' },
          { key: 'permit_description',   label: 'Permit Description',  required: true, placeholder: 'e.g. a Conditional Use Permit to expand our outdoor patio' },
          { key: 'year_established',     label: 'Year Established',    required: true, placeholder: 'e.g. 2018' },
          { key: 'detail_1',             label: 'Detail 1',            required: true, placeholder: 'e.g. No structural changes to the building exterior' },
          { key: 'detail_2',             label: 'Detail 2',            required: true, placeholder: 'e.g. Seating capacity will remain unchanged' },
          { key: 'detail_3',             label: 'Detail 3',            placeholder: 'e.g. Hours of operation will not change' },
          { key: 'hearing_date',         label: 'Hearing Date',        required: true, type: 'date', defaultToday: true },
          { key: 'hearing_time',         label: 'Hearing Time',        required: true, placeholder: 'e.g. 6:00 PM' },
          { key: 'hearing_location',     label: 'Hearing Location',    required: true, placeholder: 'e.g. City Hall, 200 Civic Center Dr' },
          { key: 'brewer_phone',         label: 'Your Phone',          required: true, placeholder: 'e.g. (555) 555-1234' },
          { key: 'brewer_email',         label: 'Your Email',          required: true, placeholder: 'you@yourbeer.com' },
        ],
      },
      {
        id: 'pre_application_meeting_request',
        name: 'Pre-Application Meeting Request',
        description: 'A formal letter to the planning department requesting a pre-application meeting before submitting a permit — demonstrates good faith and builds relationships.',
        icon: '📋',
        fields: [
          { key: 'brewery_name',           label: 'Brewery Name',            auto: true },
          { key: 'brewery_address',        label: 'Brewery Address',         required: true, placeholder: 'e.g. 123 Main St' },
          { key: 'brewer_name',            label: 'Your Name',               required: true },
          { key: 'planning_dept_name',     label: 'Planning Department Name', required: true, placeholder: 'e.g. City of Portland Planning Bureau' },
          { key: 'planning_director_name', label: 'Director / Contact Name', required: true, placeholder: 'e.g. Ms. Sarah Chen, Planning Director' },
          { key: 'city_county',            label: 'City / County',           required: true, placeholder: 'e.g. Portland, Multnomah County' },
          { key: 'project_description',    label: 'Project Description',     required: true, placeholder: 'e.g. a conditional use permit for outdoor seating' },
          { key: 'available_date_1',       label: 'Available Date Option 1', required: true, placeholder: 'e.g. Monday, June 3 at 10:00 AM' },
          { key: 'available_date_2',       label: 'Available Date Option 2', placeholder: 'e.g. Wednesday, June 5 at 2:00 PM' },
          { key: 'available_date_3',       label: 'Available Date Option 3', placeholder: 'e.g. Thursday, June 6, any time after noon' },
          { key: 'brewer_phone',           label: 'Your Phone',              required: true, placeholder: 'e.g. (555) 555-1234' },
          { key: 'brewer_email',           label: 'Your Email',              required: true, placeholder: 'you@yourbeer.com' },
          { key: 'date',                   label: 'Letter Date',             required: true, type: 'date', defaultToday: true },
        ],
      },
    ],
  },
  {
    name: 'TESTIMONY & RESPONSE',
    templates: [
      {
        id: 'written_testimony',
        name: 'Written Committee Testimony',
        description: 'Formal written testimony for submission to a legislative committee hearing — structured with your position, arguments, and requested action.',
        icon: '📝',
        fields: [
          { key: 'brewery_name',     label: 'Brewery Name',     auto: true },
          { key: 'brewery_city',     label: 'City',             auto: true },
          { key: 'brewery_state',    label: 'State',            auto: true },
          { key: 'brewer_name',      label: 'Your Name',        required: true },
          { key: 'brewer_title',     label: 'Your Title',       required: true, placeholder: 'e.g. Owner & Head Brewer' },
          { key: 'committee_name',   label: 'Committee Name',   required: true, placeholder: 'e.g. House Commerce Committee' },
          { key: 'bill_number',      label: 'Bill Number',      required: true, placeholder: 'e.g. HB 1234' },
          { key: 'bill_title',       label: 'Bill Title',       required: true, placeholder: 'e.g. Craft Brewery Self-Distribution Act' },
          { key: 'hearing_date',     label: 'Hearing Date',     required: true, type: 'date', defaultToday: true },
          { key: 'position',         label: 'Your Position',    required: true, type: 'select',
            options: ['Support', 'Oppose', 'Support with Amendments'] },
          { key: 'key_argument_1',   label: 'Key Argument 1',   required: true, type: 'textarea', placeholder: 'Economic impact argument…' },
          { key: 'key_argument_2',   label: 'Key Argument 2',   type: 'textarea', placeholder: 'Community or industry argument…' },
          { key: 'key_argument_3',   label: 'Key Argument 3',   type: 'textarea', placeholder: 'Additional supporting argument…' },
          { key: 'financial_impact', label: 'Financial Impact', type: 'textarea', placeholder: 'How this bill affects your revenue or costs…' },
          { key: 'employee_impact',  label: 'Employee Impact',  type: 'textarea', placeholder: 'How this bill affects your workforce…' },
          { key: 'community_impact', label: 'Community Impact', type: 'textarea', placeholder: 'How this bill affects your local community…' },
          { key: 'requested_action', label: 'Requested Action', required: true, type: 'textarea', placeholder: 'What you are asking the committee to do…' },
        ],
      },
      {
        id: 'oral_testimony_3_minute',
        name: 'Oral Testimony 3-Minute Script',
        description: 'A timed, structured oral testimony script for speaking at a committee hearing — opening, personal story, the number, and the ask.',
        icon: '🎤',
        fields: [
          { key: 'brewery_name',              label: 'Brewery Name',                auto: true },
          { key: 'brewery_city',              label: 'City',                        auto: true },
          { key: 'brewer_name',               label: 'Your Name',                   required: true },
          { key: 'district_representative_name', label: "District Representative's Name", required: true, placeholder: 'e.g. Rep. Jane Smith' },
          { key: 'employee_count',            label: 'Number of Employees',         required: true, placeholder: 'e.g. 12' },
          { key: 'annual_tax_contribution',   label: 'Annual State Tax Contribution', required: true, placeholder: 'e.g. 95,000' },
          { key: 'annual_visitors',           label: 'Annual Taproom Visitors',     required: true, placeholder: 'e.g. 15,000' },
          { key: 'bill_number',               label: 'Bill Number',                 required: true, placeholder: 'e.g. HB 1234' },
          { key: 'specific_impact_story',     label: 'Personal Impact Story',       required: true, type: 'textarea', placeholder: 'A specific story of how this legislation affects your brewery…' },
          { key: 'affected_employee_name',    label: 'Affected Employee Name',      required: true, placeholder: 'e.g. Maria' },
          { key: 'affected_employee_context', label: 'Employee Context',            required: true, placeholder: 'e.g. our taproom manager of 6 years' },
          { key: 'financial_impact_amount',   label: 'Financial Impact ($)',        required: true, placeholder: 'e.g. 45,000' },
          { key: 'number_of_state_breweries', label: 'Total Breweries in State',    required: true, placeholder: 'e.g. 420' },
          { key: 'total_state_impact',        label: 'Total State Industry Impact ($)', required: true, placeholder: 'e.g. 18,900,000' },
          { key: 'specific_ask',              label: 'Specific Ask',                required: true, placeholder: 'e.g. Vote yes on the self-distribution amendment' },
          { key: 'amendment_section',         label: 'Amendment Section Number',    required: true, placeholder: 'e.g. 4(b)' },
        ],
      },
      {
        id: 'regulatory_public_comment',
        name: 'Regulatory Public Comment',
        description: 'A formal public comment on a proposed rule from a regulatory agency — structured with your position, specific section comments, and proposed alternatives.',
        icon: '📨',
        fields: [
          { key: 'brewery_name',            label: 'Brewery Name',        auto: true },
          { key: 'brewery_city',            label: 'City',                auto: true },
          { key: 'brewery_state',           label: 'State',               auto: true },
          { key: 'brewer_name',             label: 'Your Name',           required: true },
          { key: 'brewer_title',            label: 'Your Title',          required: true, placeholder: 'e.g. Owner & Head Brewer' },
          { key: 'agency_name',             label: 'Agency Name',         required: true, placeholder: 'e.g. TTB, State ABC Board' },
          { key: 'rule_number',             label: 'Rule Number',         required: true, placeholder: 'e.g. ATF 2025-001' },
          { key: 'rule_title',              label: 'Rule Title',          required: true, placeholder: 'e.g. Labeling Requirements for Craft Malt Beverages' },
          { key: 'comment_deadline',        label: 'Comment Deadline',    required: true, type: 'date', defaultToday: true },
          { key: 'summary_position',        label: 'Summary Position',    required: true, type: 'textarea', placeholder: 'Your overall stance and one-paragraph summary…' },
          { key: 'production_volume',       label: 'Annual Production',   required: true, placeholder: 'e.g. 800 barrels' },
          { key: 'employee_count',          label: 'Employees',           required: true, placeholder: 'e.g. 12' },
          { key: 'years_licensed',          label: 'Years Licensed',      required: true, placeholder: 'e.g. 7' },
          { key: 'section_number_1',        label: 'Section Number 1',    required: true, placeholder: 'e.g. 27 CFR § 7.71(a)' },
          { key: 'regulatory_text_1',       label: 'Regulatory Text 1',   required: true, type: 'textarea', placeholder: 'Quote the exact regulatory language you are commenting on…' },
          { key: 'operational_impact_1',    label: 'Operational Impact 1', required: true, type: 'textarea', placeholder: 'How does this section affect your brewery operations?' },
          { key: 'proposed_alternative_1',  label: 'Proposed Alternative 1', required: true, type: 'textarea', placeholder: 'What alternative language or approach do you recommend?' },
          { key: 'section_number_2',        label: 'Section Number 2',    placeholder: 'e.g. 27 CFR § 7.71(b)' },
          { key: 'regulatory_text_2',       label: 'Regulatory Text 2',   type: 'textarea', placeholder: 'Second section text (optional)…' },
          { key: 'operational_impact_2',    label: 'Operational Impact 2', type: 'textarea', placeholder: 'Impact of second section (optional)…' },
          { key: 'proposed_alternative_2',  label: 'Proposed Alternative 2', type: 'textarea', placeholder: 'Alternative for second section (optional)…' },
          { key: 'requested_modification',  label: 'Requested Modification', required: true, type: 'textarea', placeholder: 'Summarize the specific changes you are requesting…' },
          { key: 'supporting_data_description', label: 'Supporting Data', type: 'textarea', placeholder: 'Any data, studies, or evidence supporting your comment…' },
          { key: 'brewer_phone',            label: 'Your Phone',          required: true, placeholder: 'e.g. (555) 555-1234' },
          { key: 'brewer_email',            label: 'Your Email',          required: true, placeholder: 'you@yourbeer.com' },
          { key: 'date',                    label: 'Submission Date',     required: true, type: 'date', defaultToday: true },
        ],
      },
      {
        id: 'proactive_complaint_response',
        name: 'Proactive Complaint Response Protocol',
        description: 'An internal 5-step response protocol document for handling noise, odor, or neighbor complaints — with scripts, checklists, and follow-up scheduling.',
        icon: '🛡️',
        fields: [
          { key: 'brewery_name',           label: 'Brewery Name',          auto: true },
          { key: 'brewer_name',            label: 'Your Name',             required: true },
          { key: 'complaint_nature',       label: 'Nature of Complaint',   required: true, placeholder: 'e.g. Noise complaint from adjacent property owner' },
          { key: 'complaint_date',         label: 'Date of Complaint',     required: true, type: 'date', defaultToday: true },
          { key: 'investigation_findings', label: 'Investigation Findings', required: true, type: 'textarea', placeholder: 'What did you find when you investigated the complaint?' },
          { key: 'corrective_action',      label: 'Corrective Action',     required: true, type: 'textarea', placeholder: 'What steps are you taking to address the issue?' },
          { key: 'follow_up_date',         label: 'Follow-Up Date',        required: true, type: 'date', defaultToday: true },
          { key: 'brewer_phone',           label: 'Your Phone',            required: true, placeholder: 'e.g. (555) 555-1234' },
          { key: 'brewer_email',           label: 'Your Email',            required: true, placeholder: 'you@yourbeer.com' },
        ],
      },
    ],
  },
  {
    name: 'OP-ED & MEDIA',
    templates: [
      {
        id: 'op_ed_structure',
        name: 'Op-Ed Structure 600–800 Words',
        description: 'A complete op-ed draft with section-by-section word count guidance, byline, and submission tips — ready to send to your local newspaper or trade publication.',
        icon: '📰',
        fields: [
          { key: 'brewery_name',          label: 'Brewery Name',          auto: true },
          { key: 'brewery_city',          label: 'City',                  auto: true },
          { key: 'brewery_state',         label: 'State',                 auto: true },
          { key: 'brewer_name',           label: 'Your Name (Byline)',    required: true },
          { key: 'headline_draft',        label: 'Suggested Headline',    required: true, placeholder: 'e.g. Our Local Brewery Is Fighting for Your Right to Drink Local' },
          { key: 'opening_hook',          label: 'Opening Hook',          required: true, type: 'textarea', placeholder: '50–75 words. Start with a scene, a fact, or a question that grabs attention…' },
          { key: 'policy_issue_context',  label: 'Policy Context',        required: true, type: 'textarea', placeholder: '100–150 words. Explain the legislative issue in plain language…' },
          { key: 'brewery_personal_story', label: 'Your Personal Story', required: true, type: 'textarea', placeholder: '100–150 words. Tell your story — why you started, what you built, what is at stake…' },
          { key: 'policy_argument',       label: 'The Policy Argument',   required: true, type: 'textarea', placeholder: '150–200 words. Make the case — economic data, fairness, precedent…' },
          { key: 'statewide_data',        label: 'The Statewide Data',    required: true, type: 'textarea', placeholder: '75–100 words. Industry-wide numbers that show this is bigger than one brewery…' },
          { key: 'specific_ask',          label: 'The Ask',               required: true, type: 'textarea', placeholder: '50–75 words. What should readers do? Call their legislator? Attend a hearing?' },
          { key: 'deadline_urgency',      label: 'Deadline / Urgency',    required: true, placeholder: 'e.g. The vote is scheduled for June 10' },
          { key: 'guild_role_optional',   label: 'Guild Role (optional)', placeholder: 'e.g. Board Member, Colorado Brewers Guild' },
          { key: 'publication_target',    label: 'Target Publication',    required: true, placeholder: 'e.g. Denver Post, Colorado Biz Magazine' },
          { key: 'date',                  label: 'Date',                  required: true, type: 'date', defaultToday: true },
        ],
      },
    ],
  },
  {
    name: 'COMPLIANCE DOCUMENTS',
    templates: [
      {
        id: 'ttb_compliance_audit_memo',
        name: 'TTB Compliance Self-Audit Memo',
        description: "An internal compliance memorandum documenting your annual federal compliance self-audit — Brewer's Notice, excise tax filings, COLAs, and record-keeping.",
        icon: '✅',
        fields: [
          { key: 'brewery_name',            label: 'Brewery Name',            auto: true },
          { key: 'brewer_name',             label: 'Your Name',               required: true },
          { key: 'brewer_role',             label: 'Your Role / Title',       required: true, placeholder: 'e.g. Owner & Head Brewer' },
          { key: 'audit_date',              label: 'Audit Date',              required: true, type: 'date', defaultToday: true },
          { key: 'brewers_notice_number',   label: "Brewer's Notice Number",  required: true, placeholder: 'e.g. BR-PA-12345' },
          { key: 'notice_last_amended',     label: 'Notice Last Amended',     required: true, placeholder: 'e.g. March 2023' },
          { key: 'notice_accurate',         label: 'Notice Accurate?',        required: true, placeholder: 'Yes / No / Partially' },
          { key: 'discrepancies',           label: 'Discrepancies (if any)',  placeholder: 'Describe any discrepancies, or leave blank if none' },
          { key: 'filing_frequency',        label: 'Filing Frequency',        required: true, placeholder: 'e.g. Quarterly' },
          { key: 'last_filing_date',        label: 'Last Filing Date',        required: true, type: 'date', defaultToday: true },
          { key: 'late_filings_past_year',  label: 'Late Filings (past year)', placeholder: 'e.g. 0, or describe if any' },
          { key: 'filing_notes',            label: 'Filing Notes',            placeholder: 'Any notes about your filing status' },
          { key: 'total_active_colas',      label: 'Total Active COLAs',      required: true, placeholder: 'e.g. 8' },
          { key: 'colas_pending',           label: 'COLAs Pending Approval',  placeholder: 'e.g. 2, or 0 if none' },
          { key: 'products_without_cola',   label: 'Products Without COLA',   placeholder: 'List any, or leave blank if none' },
          { key: 'cola_notes',              label: 'COLA Notes',              placeholder: 'Any notes about your COLA status' },
          { key: 'records_current_through', label: 'Records Current Through', required: true, placeholder: 'e.g. April 30, 2025' },
          { key: 'storage_format',          label: 'Storage Format',          required: true, placeholder: 'e.g. Digital (Google Drive), Physical binders' },
          { key: 'records_accessible',      label: 'Records Accessible for 3-Year Audit?', required: true, placeholder: 'Yes / No / Partially' },
          { key: 'action_1',                label: 'Open Action Item 1',      placeholder: 'e.g. Amend Brewer\'s Notice to add new tank' },
          { key: 'action_1_due',            label: 'Action 1 Due Date',       placeholder: 'e.g. June 30, 2025' },
          { key: 'action_2',                label: 'Open Action Item 2',      placeholder: 'Second action item, if any' },
          { key: 'action_2_due',            label: 'Action 2 Due Date',       placeholder: 'e.g. July 15, 2025' },
          { key: 'signed_by',               label: 'Completed By',            required: true },
          { key: 'signed_date',             label: 'Completion Date',         required: true, type: 'date', defaultToday: true },
        ],
      },
      {
        id: 'letter_requesting_ttb_guidance',
        name: 'Letter Requesting TTB Guidance',
        description: "A formal letter to the TTB's National Revenue Center requesting informal guidance on a specific regulatory question — following the exact TTB-preferred format.",
        icon: '⚖️',
        fields: [
          { key: 'brewery_name',              label: 'Brewery Name',              auto: true },
          { key: 'brewery_address',           label: 'Brewery Address',           required: true, placeholder: 'e.g. 123 Main St, Portland, OR 97201' },
          { key: 'brewer_name',               label: 'Your Name',                 required: true },
          { key: 'brewer_title',              label: 'Your Title',                required: true, placeholder: 'e.g. Owner & Head Brewer' },
          { key: 'brewers_notice_number',     label: "Brewer's Notice Number",    required: true, placeholder: 'e.g. BR-OR-12345' },
          { key: 'guidance_topic',            label: 'Guidance Topic (short)',    required: true, placeholder: 'e.g. Co-packing arrangement with unlicensed facility' },
          { key: 'regulatory_question',       label: 'Your Regulatory Question',  required: true, type: 'textarea', placeholder: 'State the specific regulatory question clearly and precisely…' },
          { key: 'prior_guidance_reviewed',   label: 'Prior Guidance Reviewed',   required: true, type: 'textarea', placeholder: 'List the TTB rulings, circulars, or guidance documents you already consulted…' },
          { key: 'brewery_interpretation',    label: 'Your Current Interpretation', required: true, type: 'textarea', placeholder: 'Explain how you currently interpret the regulation and why…' },
          { key: 'preferred_contact_name',    label: 'Contact Name',              required: true },
          { key: 'preferred_contact_phone',   label: 'Contact Phone',             required: true, placeholder: 'e.g. (555) 555-1234' },
          { key: 'preferred_contact_email',   label: 'Contact Email',             required: true, placeholder: 'you@yourbeer.com' },
          { key: 'date',                      label: 'Letter Date',               required: true, type: 'date', defaultToday: true },
        ],
      },
    ],
  },
  {
    name: 'COALITION BUILDING',
    templates: [
      {
        id: 'customer_action_alert',
        name: 'Customer Action Alert Email',
        description: 'A shareable call-to-action flyer to post in your taproom, email to customers, or share on social media to mobilize grassroots support.',
        icon: '📣',
        fields: [
          { key: 'brewery_name',                label: 'Brewery Name',              auto: true },
          { key: 'issue_title',                 label: 'Issue Headline',            required: true, placeholder: 'e.g. Protect Your Local Brewery!' },
          { key: 'issue_summary',               label: 'Issue Summary',             required: true, type: 'textarea', placeholder: 'Briefly explain the legislative issue in plain language…' },
          { key: 'what_it_means_for_customers', label: 'What It Means For Customers', required: true, type: 'textarea', placeholder: 'How does this issue affect your customers directly?' },
          { key: 'action_requested',            label: 'Action Requested',          required: true, type: 'textarea', placeholder: 'What should customers do? Call their representative, sign a petition…' },
          { key: 'legislator_contact_info',     label: 'Legislator Contact Info',   type: 'textarea', placeholder: 'Phone numbers, emails, or links customers can use…' },
          { key: 'deadline_date',               label: 'Deadline / Vote Date',      type: 'date' },
          { key: 'brewery_website',             label: 'Brewery Website',           placeholder: 'e.g. https://yourbeer.com' },
          { key: 'brewer_name',                 label: 'Contact Name',              required: true },
        ],
      },
      {
        id: 'coalition_joint_statement',
        name: 'Coalition Joint Statement',
        description: 'A formal multi-organization joint statement of support or opposition to legislation — signed by up to four coalition partners.',
        icon: '🤝',
        fields: [
          { key: 'coalition_name',        label: 'Coalition Name',         required: true, placeholder: 'e.g. Colorado Craft Beverage Coalition' },
          { key: 'support_or_oppose',     label: 'Position',               required: true, type: 'select', options: ['Support', 'Oppose'] },
          { key: 'bill_number',           label: 'Bill Number',            required: true, placeholder: 'e.g. HB 1234' },
          { key: 'bill_title',            label: 'Bill Title',             required: true, placeholder: 'e.g. Craft Beverage Self-Distribution Act' },
          { key: 'date',                  label: 'Date',                   required: true, type: 'date', defaultToday: true },
          { key: 'coalition_description', label: 'Coalition Description',  required: true, placeholder: 'e.g. over 200 craft beverage producers across Colorado' },
          { key: 'background_summary',    label: 'Background',             required: true, type: 'textarea', placeholder: 'Describe the bill and legislative context…' },
          { key: 'shared_position',       label: 'Shared Position',        required: true, type: 'textarea', placeholder: 'Why does your coalition support or oppose this?' },
          { key: 'impact_on_communities', label: 'Community Impact',       required: true, type: 'textarea', placeholder: 'How does this affect local communities?' },
          { key: 'specific_request',      label: 'Specific Request',       required: true, type: 'textarea', placeholder: 'What are you asking the committee to do?' },
          { key: 'committee_or_chamber',  label: 'Committee / Chamber',    required: true, placeholder: 'e.g. the House Commerce Committee' },
          { key: 'partner_1_name',        label: 'Partner 1 Name',         required: true },
          { key: 'partner_1_descriptor',  label: 'Partner 1 Description',  placeholder: 'e.g. Craft beer producer, Denver, CO' },
          { key: 'partner_2_name',        label: 'Partner 2 Name',         placeholder: 'Optional' },
          { key: 'partner_2_descriptor',  label: 'Partner 2 Description',  placeholder: 'e.g. Craft cidery, Boulder, CO' },
          { key: 'partner_3_name',        label: 'Partner 3 Name',         placeholder: 'Optional' },
          { key: 'partner_3_descriptor',  label: 'Partner 3 Description',  placeholder: '' },
          { key: 'partner_4_name',        label: 'Partner 4 Name',         placeholder: 'Optional' },
          { key: 'partner_4_descriptor',  label: 'Partner 4 Description',  placeholder: '' },
          { key: 'coordinator_name',      label: 'Coordinator Name',       required: true },
          { key: 'coordinator_contact',   label: 'Coordinator Contact',    required: true, placeholder: 'e.g. (555) 555-1234 | contact@coalition.org' },
        ],
      },
      {
        id: 'coalition_partner_mou',
        name: 'Coalition Partner MOU',
        description: 'A one-page participation agreement for coalition members — documenting which Tier 1, 2, and 3 commitments each partner is signing up for.',
        icon: '📃',
        fields: [
          { key: 'coalition_name',            label: 'Coalition Name',             required: true, placeholder: 'e.g. Colorado Craft Beverage Coalition' },
          { key: 'year_session',              label: 'Year / Legislative Session', required: true, placeholder: 'e.g. 2025 Session' },
          { key: 'organization_name',         label: 'Your Organization Name',     required: true },
          { key: 'coalition_purpose',         label: 'Coalition Purpose',          required: true, type: 'textarea', placeholder: 'Describe the coalition\'s overall advocacy purpose…' },
          { key: 'policy_objective',          label: 'Policy Objective',           required: true, placeholder: 'e.g. Pass HB 1234 enabling craft brewery self-distribution' },
          { key: 'tier1_sign_statement',      label: 'Tier 1: Sign joint statement?', required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier1_issue_own_statement', label: 'Tier 1: Issue own statement?',  required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier1_named_partner',       label: 'Tier 1: Named partner in materials?', required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier2_coordinated_media',   label: 'Tier 2: Coordinated media outreach?', required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier2_written_testimony',   label: 'Tier 2: Submit written testimony?',   required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier2_meet_legislators',    label: 'Tier 2: Meet with legislators?',      required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier2_activate_network',    label: 'Tier 2: Activate member network?',    required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier3_attend_meetings',     label: 'Tier 3: Attend all strategy meetings?', required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier3_cosign_amendment',    label: 'Tier 3: Co-sign amendment request?',   required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier3_provide_data',        label: 'Tier 3: Provide proprietary data?',    required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'tier3_press_conference',    label: 'Tier 3: Appear at press conference?',  required: true, type: 'select', options: ['Yes', 'No'] },
          { key: 'coordinator_name',          label: 'Coordinator Name',             required: true },
          { key: 'coordinator_org',           label: 'Coordinator Organization',     placeholder: 'e.g. Colorado Brewers Guild' },
          { key: 'coordinator_contact',       label: 'Coordinator Contact',          required: true, placeholder: 'e.g. (555) 555-1234 | contact@guild.org' },
          { key: 'signatory_name',            label: 'Signatory Name',               required: true },
          { key: 'signatory_title',           label: 'Signatory Title',              required: true, placeholder: 'e.g. Owner & Head Brewer' },
          { key: 'signatory_org',             label: 'Signatory Organization',       required: true },
          { key: 'date',                      label: 'Agreement Date',               required: true, type: 'date', defaultToday: true },
        ],
      },
      {
        id: 'coalition_health_assessment',
        name: 'Coalition Health Assessment',
        description: 'A quarterly internal health check for your advocacy coalition — partner engagement, communications, legislative status, tensions, and next actions.',
        icon: '📈',
        fields: [
          { key: 'coalition_name',              label: 'Coalition Name',            required: true },
          { key: 'quarter',                     label: 'Quarter',                   required: true, placeholder: 'e.g. Q2 2025' },
          { key: 'assessment_date',             label: 'Assessment Date',           required: true, type: 'date', defaultToday: true },
          { key: 'total_partners',              label: 'Total Partners',            required: true, placeholder: 'e.g. 18' },
          { key: 'active_partners',             label: 'Active Partners',           required: true, placeholder: 'e.g. 14' },
          { key: 'partners_taken_action',       label: 'Partners Who Took Action',  required: true, placeholder: 'e.g. 9' },
          { key: 'partners_at_risk',            label: 'Partners At Risk of Dropout', placeholder: 'e.g. 2' },
          { key: 'new_partners',                label: 'New Partners This Quarter', placeholder: 'e.g. 3' },
          { key: 'communications_issued',       label: 'Communications Issued',     required: true, placeholder: 'e.g. 6 emails, 2 action alerts' },
          { key: 'avg_response_time',           label: 'Avg Response Time',         required: true, placeholder: 'e.g. 18 hours' },
          { key: 'messaging_consistent',        label: 'Messaging Consistent?',     required: true, placeholder: 'Yes / No / Mostly' },
          { key: 'messaging_contradictions',    label: 'Contradictions Noted',      placeholder: 'Describe any, or leave blank' },
          { key: 'bill_current_status',         label: 'Current Bill Status',       required: true, placeholder: 'e.g. In Senate Commerce Committee' },
          { key: 'political_feasibility_change', label: 'Feasibility Change',       placeholder: 'e.g. Improved — 2 new co-sponsors' },
          { key: 'legislative_meetings',        label: 'Legislative Meetings',      placeholder: 'e.g. 4 meetings with staff' },
          { key: 'testimony_submitted',         label: 'Testimony Submitted',       placeholder: 'e.g. 3 written, 1 oral' },
          { key: 'media_coverage',              label: 'Media Coverage',            placeholder: 'e.g. 2 local news mentions, 1 trade publication' },
          { key: 'active_tensions',             label: 'Active Tensions',           type: 'textarea', placeholder: 'Describe any internal disagreements or partner tensions…' },
          { key: 'partners_with_concerns',      label: 'Partners With Concerns',    type: 'textarea', placeholder: 'List any partners who have raised concerns…' },
          { key: 'issues_requiring_decision',   label: 'Issues Requiring Decision', type: 'textarea', placeholder: 'What decisions need to be made this quarter?' },
          { key: 'overall_health',              label: 'Overall Health Rating',     required: true, type: 'select', options: ['Strong', 'Moderate', 'Caution', 'At Risk'] },
          { key: 'action_1',                    label: 'Action Item 1',             required: true, placeholder: 'e.g. Re-engage 3 at-risk partners by June 15' },
          { key: 'action_2',                    label: 'Action Item 2',             placeholder: 'e.g. Draft media brief for upcoming committee vote' },
          { key: 'action_3',                    label: 'Action Item 3',             placeholder: 'Optional third action item' },
          { key: 'completed_by',               label: 'Assessment Completed By',    required: true },
          { key: 'next_review',                label: 'Next Review Date',           required: true, placeholder: 'e.g. September 1, 2025' },
        ],
      },
    ],
  },
]

// Flatten all templates from all categories into a single list for lookups
const ALL_TEMPLATES = CATEGORIES.flatMap(c => c.templates)

// Decode a base64 string returned by the Edge Function into a browser download
function downloadDocx(base64, filename) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── TemplateModal ─────────────────────────────────────────────────────────────

function TemplateModal({ template, brewery, canGenerate, onClose }) {
  const draftKey = `modal_draft_playbook_${template.id}`
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft(draftKey)

  function buildEmptyForm() {
    const state = {}
    for (const f of template.fields) {
      if (f.auto) {
        if (f.key === 'brewery_name')  state[f.key] = brewery?.name  ?? ''
        else if (f.key === 'brewery_city')  state[f.key] = brewery?.city  ?? ''
        else if (f.key === 'brewery_state') state[f.key] = brewery?.state ?? ''
        else if (f.key === 'brewery_address') state[f.key] = brewery?.address ?? ''
        else state[f.key] = ''
      } else if (f.defaultToday) {
        state[f.key] = todayStr()
      } else if (f.type === 'select') {
        state[f.key] = f.options[0]
      } else {
        state[f.key] = ''
      }
    }
    return state
  }

  const [form, setForm] = useState(() => loadDraft(false) ?? buildEmptyForm())
  const initialFormRef = useRef(buildEmptyForm())
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current)

  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState(null)
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    if (isDirty) saveDraft(form)
  }, [form]) // eslint-disable-line

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError(null)
    setSuccess(false)
  }

  function validate() {
    return template.fields
      .filter(f => f.required && !f.auto && !String(form[f.key] ?? '').trim())
      .map(f => f.label)
  }

  async function handleGenerate() {
    const missing = validate()
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}`)
      return
    }
    setGenerating(true)
    setError(null)
    setSuccess(false)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-document', {
        body: { template_id: template.id, brewery_data: form },
      })
      if (fnError) throw fnError
      if (!data?.base64) throw new Error('No document returned from server.')
      downloadDocx(data.base64, data.filename)
      clearDraft()
      setSuccess(true)
    } catch (err) {
      setError(err.message ?? 'Document generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const hasAutoFields   = template.fields.some(f => f.auto)
  const visibleFields   = template.fields.filter(f => !f.auto)

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      isDirty={isDirty}
      title={template.name}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 pt-2">
        {/* Auto-filled brewery info strip */}
        {hasAutoFields && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Auto-filled: </span>
            {brewery?.name}
            {brewery?.city  ? `, ${brewery.city}`  : ''}
            {brewery?.state ? `, ${brewery.state}` : ''}
          </div>
        )}

        {/* Dynamic form fields */}
        {visibleFields.map(f => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {f.label}
              {f.required && <span className="text-danger ml-1">*</span>}
            </label>

            {f.type === 'textarea' ? (
              <textarea
                value={form[f.key] ?? ''}
                onChange={e => setField(f.key, e.target.value)}
                placeholder={f.placeholder ?? ''}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
              />
            ) : f.type === 'select' ? (
              <select
                value={form[f.key] ?? f.options[0]}
                onChange={e => setField(f.key, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
              >
                {f.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type ?? 'text'}
                value={form[f.key] ?? ''}
                onChange={e => setField(f.key, e.target.value)}
                placeholder={f.placeholder ?? ''}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            )}
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-danger rounded-lg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
            Document downloaded successfully! Check your downloads folder.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>

          {canGenerate ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 bg-navy hover:bg-navy/90 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating your document…' : 'Generate & Download'}
            </button>
          ) : (
            <div className="flex-1 text-center">
              <p className="text-xs text-gray-500 mb-1">Full Suite subscription required</p>
              <a
                href="/upgrade"
                className="block w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors text-center"
              >
                Upgrade to Generate
              </a>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

// ── TemplateCard ──────────────────────────────────────────────────────────────

function TemplateCard({ template, onGenerate }) {
  const fieldCount = template.fields.filter(f => !f.auto).length
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{template.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-navy text-sm leading-tight">{template.name}</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{template.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs text-gray-400">{fieldCount} fields</span>
        <button
          type="button"
          onClick={() => onGenerate(template)}
          className="bg-navy hover:bg-navy/90 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          Generate
        </button>
      </div>
    </div>
  )
}

// ── CategorySection ───────────────────────────────────────────────────────────

function CategorySection({ category, onGenerate }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xs font-bold text-navy uppercase tracking-widest whitespace-nowrap">
          {category.name}
        </h2>
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {category.templates.length} {category.templates.length === 1 ? 'template' : 'templates'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {category.templates.map(t => (
          <TemplateCard key={t.id} template={t} onGenerate={onGenerate} />
        ))}
      </div>
    </div>
  )
}

// ── PlaybookPage ──────────────────────────────────────────────────────────────

export default function PlaybookPage() {
  const { profile, brewery } = useAuth()
  const [activeTemplate, setActiveTemplate] = useState(null)

  const canGenerate =
    profile?.subscription_tier === 'full_suite' &&
    profile?.subscription_status === 'active'

  return (
    <TierGate
      requiredTier="full_suite"
      featureKey="regulation_playbook"
      featureName="Regulation Playbook & Templates"
      featureDescription="Generate customized advocacy and compliance documents — legislator letters, economic impact one-pagers, written testimony, and more — tailored to your brewery."
    >
      <div className="p-6 max-w-6xl mx-auto space-y-10">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-navy">Regulation Playbook</h1>
          <p className="text-gray-500 text-sm mt-1">
            {ALL_TEMPLATES.length} professional advocacy and compliance document templates — fill in your details and download a formatted Word document ready to send.
          </p>
        </div>

        {/* Coming-soon: Full Playbook PDF */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-3xl">📖</div>
          <div className="flex-1">
            <h2 className="font-semibold text-navy text-base">Full Regulatory Playbook (PDF)</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              A comprehensive state-by-state guide to brewery licensing, TTB requirements, distribution laws, and taproom regulations.
            </p>
          </div>
          <button
            disabled
            className="shrink-0 bg-amber/40 text-white font-semibold text-sm px-5 py-2.5 rounded-lg cursor-not-allowed"
            title="Coming soon"
          >
            Coming Soon
          </button>
        </div>

        {/* Template categories */}
        <div className="space-y-10">
          {CATEGORIES.map(category => (
            <CategorySection
              key={category.name}
              category={category}
              onGenerate={tpl => setActiveTemplate(tpl)}
            />
          ))}
        </div>

        {/* Tips section */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="font-semibold text-blue-800 text-sm mb-2">Tips for effective advocacy</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Personalize generated documents with specific local details before sending.</li>
            <li>Always include your economic impact numbers — legislators respond to data.</li>
            <li>Follow up a written letter with a phone call to the legislator's office.</li>
            <li>Coordinate with your local brewery guild for amplified impact.</li>
          </ul>
        </div>
      </div>

      {/* Template generation modal */}
      {activeTemplate && (
        <TemplateModal
          template={activeTemplate}
          brewery={brewery}
          canGenerate={canGenerate}
          onClose={() => setActiveTemplate(null)}
        />
      )}
    </TierGate>
  )
}
