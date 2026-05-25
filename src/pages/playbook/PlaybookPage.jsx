/**
 * PlaybookPage — Full Suite Module 5: Regulation Playbook & Templates.
 * Lets brewery owners generate customized advocacy and compliance documents.
 * Document generation is handled by the generate-document Supabase Edge Function,
 * which returns a base64-encoded .docx file for immediate browser download.
 */
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'

// Today's date as YYYY-MM-DD for default date field values
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// All five advocacy document templates: their IDs, display info, and form fields.
// Fields marked auto:true are pre-filled from the brewery context and hidden from the form.
// Fields marked required:true show a required indicator and block submission if empty.
const TEMPLATES = [
  {
    id: 'legislator_meeting_request',
    name: 'Legislator Meeting Request',
    description: 'A formal letter requesting a face-to-face meeting with your state or federal legislator to discuss issues affecting your brewery.',
    icon: '🏛️',
    fields: [
      { key: 'brewery_name',           label: 'Brewery Name',        auto: true },
      { key: 'brewery_city',           label: 'City',                auto: true },
      { key: 'brewery_state',          label: 'State',               auto: true },
      { key: 'brewer_name',            label: 'Your Name',           required: true },
      { key: 'brewer_title',           label: 'Your Title',          required: true,  placeholder: 'e.g. Owner & Head Brewer' },
      { key: 'date',                   label: 'Letter Date',         required: true,  type: 'date', defaultToday: true },
      { key: 'legislator_name',        label: 'Legislator Name',     required: true },
      { key: 'legislator_title',       label: 'Legislator Title',    required: true,  placeholder: 'e.g. State Senator, U.S. Representative' },
      { key: 'legislator_district',    label: 'District / Office',   required: true,  placeholder: 'e.g. District 14' },
      { key: 'key_issue',              label: 'Key Issue to Discuss', required: true, placeholder: 'e.g. Self-distribution rights, taproom hours' },
      { key: 'brewery_employees',      label: 'Number of Employees', required: true,  placeholder: 'e.g. 12' },
      { key: 'brewery_annual_revenue', label: 'Annual Revenue',      required: true,  placeholder: 'e.g. $1.2M' },
    ],
  },
  {
    id: 'brewery_tour_invitation',
    name: 'Brewery Tour Invitation',
    description: 'Invite a local official, legislator, or business leader on a behind-the-scenes tour to show your economic impact firsthand.',
    icon: '🍺',
    fields: [
      { key: 'brewery_name',       label: 'Brewery Name',       auto: true },
      { key: 'brewery_city',       label: 'City',               auto: true },
      { key: 'brewery_state',      label: 'State',              auto: true },
      { key: 'brewery_address',    label: 'Brewery Address',    required: true, placeholder: 'e.g. 123 Main St' },
      { key: 'brewer_name',        label: 'Your Name',          required: true },
      { key: 'official_name',      label: "Guest's Name",       required: true },
      { key: 'official_title',     label: "Guest's Title",      required: true, placeholder: 'e.g. Mayor, City Council Member' },
      { key: 'proposed_dates',     label: 'Proposed Dates',     required: true, placeholder: 'e.g. Any Tuesday or Thursday afternoon' },
      { key: 'brewery_founded_year', label: 'Year Founded',     required: true, placeholder: 'e.g. 2018' },
      { key: 'brewery_employees',  label: 'Number of Employees', required: true, placeholder: 'e.g. 12' },
      { key: 'annual_barrels',     label: 'Annual Barrels Produced', required: true, placeholder: 'e.g. 800' },
      { key: 'key_talking_points', label: 'Key Talking Points', type: 'textarea', placeholder: 'What you most want the guest to see or understand…' },
    ],
  },
  {
    id: 'economic_impact_one_pager',
    name: 'Economic Impact One-Pager',
    description: 'A polished one-page fact sheet documenting your brewery\'s local economic contribution — jobs, tax revenue, purchases, and community giving.',
    icon: '📊',
    fields: [
      { key: 'brewery_name',              label: 'Brewery Name',            auto: true },
      { key: 'brewery_city',              label: 'City',                    auto: true },
      { key: 'brewery_state',             label: 'State',                   auto: true },
      { key: 'brewery_founded_year',      label: 'Year Founded',            required: true, placeholder: 'e.g. 2018' },
      { key: 'full_time_employees',       label: 'Full-Time Employees',     required: true, placeholder: 'e.g. 8' },
      { key: 'part_time_employees',       label: 'Part-Time Employees',     required: true, placeholder: 'e.g. 6' },
      { key: 'annual_payroll',            label: 'Annual Payroll',          required: true, placeholder: 'e.g. $420,000' },
      { key: 'annual_revenue',            label: 'Annual Revenue',          required: true, placeholder: 'e.g. $1.1M' },
      { key: 'annual_local_purchases',    label: 'Annual Local Purchases',  required: true, placeholder: 'e.g. $180,000' },
      { key: 'annual_visitors',           label: 'Annual Taproom Visitors', required: true, placeholder: 'e.g. 15,000' },
      { key: 'tax_contributions',         label: 'Annual Tax Contributions', required: true, placeholder: 'e.g. $95,000' },
      { key: 'community_events_per_year', label: 'Community Events / Year', required: true, placeholder: 'e.g. 24' },
      { key: 'charity_donations_annual',  label: 'Annual Charity Donations', required: true, placeholder: 'e.g. $12,000' },
      { key: 'key_policy_ask',            label: 'Policy Ask (optional)',   type: 'textarea', placeholder: 'e.g. We urge the council to support self-distribution rights…' },
    ],
  },
  {
    id: 'written_testimony',
    name: 'Written Testimony',
    description: 'Formal written testimony for submission to a legislative committee hearing — structured with your position, arguments, and requested action.',
    icon: '📝',
    fields: [
      { key: 'brewery_name',      label: 'Brewery Name',      auto: true },
      { key: 'brewery_city',      label: 'City',              auto: true },
      { key: 'brewery_state',     label: 'State',             auto: true },
      { key: 'brewer_name',       label: 'Your Name',         required: true },
      { key: 'brewer_title',      label: 'Your Title',        required: true, placeholder: 'e.g. Owner & Head Brewer' },
      { key: 'committee_name',    label: 'Committee Name',    required: true, placeholder: 'e.g. House Commerce Committee' },
      { key: 'bill_number',       label: 'Bill Number',       required: true, placeholder: 'e.g. HB 1234' },
      { key: 'bill_title',        label: 'Bill Title',        required: true, placeholder: 'e.g. Craft Brewery Self-Distribution Act' },
      { key: 'hearing_date',      label: 'Hearing Date',      required: true, type: 'date', defaultToday: true },
      { key: 'position',          label: 'Your Position',     required: true, type: 'select',
        options: ['Support', 'Oppose', 'Support with Amendments'] },
      { key: 'key_argument_1',    label: 'Key Argument 1',    required: true, type: 'textarea', placeholder: 'Economic impact argument…' },
      { key: 'key_argument_2',    label: 'Key Argument 2',    type: 'textarea', placeholder: 'Community or industry argument…' },
      { key: 'key_argument_3',    label: 'Key Argument 3',    type: 'textarea', placeholder: 'Additional supporting argument…' },
      { key: 'financial_impact',  label: 'Financial Impact',  type: 'textarea', placeholder: 'How this bill affects your revenue or costs…' },
      { key: 'employee_impact',   label: 'Employee Impact',   type: 'textarea', placeholder: 'How this bill affects your workforce…' },
      { key: 'community_impact',  label: 'Community Impact',  type: 'textarea', placeholder: 'How this bill affects your local community…' },
      { key: 'requested_action',  label: 'Requested Action',  required: true, type: 'textarea', placeholder: 'What you are asking the committee to do…' },
    ],
  },
  {
    id: 'customer_action_alert',
    name: 'Customer Action Alert',
    description: 'A shareable call-to-action flyer you can post in your taproom, email to customers, or share on social media to mobilize grassroots support.',
    icon: '📣',
    fields: [
      { key: 'brewery_name',                    label: 'Brewery Name',             auto: true },
      { key: 'issue_title',                     label: 'Issue Headline',           required: true, placeholder: 'e.g. Protect Your Local Brewery!' },
      { key: 'issue_summary',                   label: 'Issue Summary',            required: true, type: 'textarea', placeholder: 'Briefly explain the legislative issue in plain language…' },
      { key: 'what_it_means_for_customers',     label: 'What It Means For Customers', required: true, type: 'textarea', placeholder: 'How does this issue affect your customers directly?' },
      { key: 'action_requested',                label: 'Action Requested',         required: true, type: 'textarea', placeholder: 'What should customers do? e.g. Call their representative, sign a petition…' },
      { key: 'legislator_contact_info',         label: 'Legislator Contact Info',  type: 'textarea', placeholder: 'Phone numbers, emails, or links customers can use…' },
      { key: 'deadline_date',                   label: 'Deadline / Vote Date',     type: 'date' },
      { key: 'brewery_website',                 label: 'Brewery Website',          placeholder: 'e.g. https://yourbeer.com' },
      { key: 'brewer_name',                     label: 'Contact Name',             required: true },
    ],
  },
]

// Decode a base64 string (returned by the Edge Function) into a browser download.
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

// ── TemplateModal ──────────────────────────────────────────────────────────────

function TemplateModal({ template, brewery, canGenerate, onClose }) {
  const draftKey = `modal_draft_playbook_${template.id}`
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft(draftKey)

  // Build the initial empty form state from this template's field list.
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

  const [form, setForm] = useState(() => {
    const saved = loadDraft(false)
    return saved ?? buildEmptyForm()
  })

  const initialFormRef = useRef(buildEmptyForm())
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current)

  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState(null)
  const [success, setSuccess]       = useState(false)

  // Persist draft to sessionStorage on every form change
  useEffect(() => {
    if (isDirty) saveDraft(form)
  }, [form]) // eslint-disable-line

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError(null)
    setSuccess(false)
  }

  // Check required fields before generating
  function validate() {
    const missing = template.fields
      .filter(f => f.required && !f.auto && !String(form[f.key] ?? '').trim())
      .map(f => f.label)
    return missing
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

  function handleClose() {
    onClose()
  }

  // Visible (non-auto) fields only
  const visibleFields = template.fields.filter(f => !f.auto)

  return (
    <ModalShell
      isOpen
      onClose={handleClose}
      isDirty={isDirty}
      title={template.name}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 pt-2">
        {/* Auto-filled brewery fields shown as read-only info strip */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Auto-filled: </span>
          {brewery?.name}{brewery?.city ? `, ${brewery.city}` : ''}{brewery?.state ? `, ${brewery.state}` : ''}
        </div>

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

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-danger rounded-lg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
            Document downloaded successfully! Check your downloads folder.
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
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

// ── TemplateCard ───────────────────────────────────────────────────────────────

function TemplateCard({ template, onGenerate }) {
  const fieldCount = template.fields.filter(f => !f.auto).length
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{template.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-navy text-sm leading-tight">{template.name}</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{template.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs text-gray-400">{fieldCount} fields to fill in</span>
        <button
          type="button"
          onClick={() => onGenerate(template)}
          className="bg-navy hover:bg-navy/90 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Generate
        </button>
      </div>
    </div>
  )
}

// ── PlaybookPage ───────────────────────────────────────────────────────────────

export default function PlaybookPage() {
  const { profile, brewery } = useAuth()

  const [activeTemplate, setActiveTemplate] = useState(null)

  // Full Suite paid users can generate; trial and lower tiers cannot
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
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-navy">Regulation Playbook</h1>
          <p className="text-gray-500 text-sm mt-1">
            Generate professional advocacy documents tailored to your brewery in seconds.
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

        {/* Template section */}
        <div>
          <h2 className="text-base font-semibold text-navy mb-1">Advocacy Document Templates</h2>
          <p className="text-sm text-gray-500 mb-4">
            Select a template, fill in your details, and download a formatted Word document ready to send or adapt.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATES.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                onGenerate={tpl => setActiveTemplate(tpl)}
              />
            ))}
          </div>
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
