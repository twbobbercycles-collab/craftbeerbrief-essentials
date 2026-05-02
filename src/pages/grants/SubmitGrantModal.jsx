/**
 * SubmitGrantModal — form for users to submit a grant they know about for admin review.
 * The grant is inserted with approved=false and goes to the admin queue.
 * Once approved it becomes visible to all breweries in the database.
 *
 * Draft persistence: the parent page passes saveDraft/initialDraft/etc. from useModalDraft
 * so form data survives tab switches. The draft is cleared on successful submit or discard.
 *
 * Props:
 *   isOpen        — controls visibility
 *   onClose       — called on discard/cancel (parent clears draft before calling this)
 *   onSuccess     — called after a successful submit (parent clears draft)
 *   initialDraft  — pre-filled form data if a saved draft exists (null if starting fresh)
 *   draftRestored — true when a draft was just loaded (shows amber banner in ModalShell)
 *   onDismissDraft — called when user dismisses the amber draft-restored banner
 *   onSaveDraft   — called with current form state whenever form changes
 */
import { useState, useEffect } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import ModalShell from '../../components/ModalShell'
import { US_STATES, US_STATE_NAMES, FUNDING_TYPES } from './grantsUtils'

// Blank starting state — used when no draft exists
const EMPTY_FORM = {
  title: '', funding_type: '', agency: '', description: '',
  eligibility_summary: '', amount: '', application_url: '',
  application_deadline: '', states_eligible: [], nationwide: false, submitter_note: '',
}

// Reusable label + children wrapper for form fields
function Field({ label, required, extra, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-navy">
          {label}{required && <span className="text-danger ml-0.5">*</span>}
        </label>
        {extra && <span className="text-xs text-gray-400">{extra}</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber'

export default function SubmitGrantModal({
  isOpen, onClose, onSuccess,
  initialDraft, draftRestored, onDismissDraft, onSaveDraft,
}) {
  const { user } = useAuth()
  const [form, setForm]           = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

  // isDirty is true when any field has been changed from its empty default.
  // Handles booleans properly so that 'nationwide: false' does not falsely trigger dirty.
  const isDirty = Object.entries(form).some(([, v]) => {
    if (typeof v === 'boolean') return v !== false
    if (Array.isArray(v))       return v.length > 0
    return v !== ''
  })

  // When the modal opens, restore the draft (if provided) or reset to blank
  useEffect(() => {
    if (isOpen) {
      setForm(initialDraft ?? EMPTY_FORM)
      setError('')
    }
  }, [isOpen, initialDraft])

  // Auto-save the form to sessionStorage whenever it changes (only while modal is open).
  // The parent's saveDraft function handles the actual storage write.
  // Guard on isOpen prevents saving EMPTY_FORM to draft when the modal resets on close.
  useEffect(() => {
    if (!isOpen) return
    onSaveDraft(form)
  }, [form, isOpen])

  // Updates a single form field by name
  function setField(name, value) {
    setForm(prev => ({ ...prev, [name]: value }))
  }

  // Adds or removes a state abbreviation from the states_eligible array
  function toggleState(abbr) {
    setForm(prev => ({
      ...prev,
      states_eligible: prev.states_eligible.includes(abbr)
        ? prev.states_eligible.filter(s => s !== abbr)
        : [...prev.states_eligible, abbr],
    }))
  }

  // Checking "Nationwide / Federal" marks the grant as available in all states
  function handleNationwideChange(checked) {
    setForm(prev => ({
      ...prev,
      nationwide: checked,
      states_eligible: checked ? ['All States'] : [],
    }))
  }

  // Validates the form and inserts the grant into the database for admin review
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validate that the application URL is a real URL
    try { new URL(form.application_url) } catch {
      setError('Please enter a valid URL — it must start with https://')
      return
    }

    setSubmitting(true)

    // Agency name is prepended to description so it appears in keyword searches
    const agencyPrefix = form.agency.trim() ? `Funding Agency: ${form.agency.trim()}\n\n` : ''
    const { error: insertError } = await supabase.from('grants').insert({
      title:                form.title.trim(),
      funding_type:         form.funding_type,
      description:          agencyPrefix + form.description.trim(),
      eligibility_summary:  form.eligibility_summary.trim() || null,
      amount_max:           form.amount ? Number(form.amount) : null,
      application_url:      form.application_url.trim(),
      application_deadline: form.application_deadline || null,
      states_eligible:      form.nationwide ? ['All States'] : form.states_eligible,
      grant_source:         'user_submitted',
      approved:             false,
      is_federal:           form.funding_type === 'federal_grant',
      submitted_by_user_id: user?.id ?? null,
    })

    setSubmitting(false)

    if (insertError) {
      setError('Something went wrong submitting your grant. Please try again.')
      return
    }

    // Parent's onSuccess calls clearDraft() and closes the modal
    onSuccess()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={onDismissDraft}
      title="Submit a Grant"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 pt-1">
        <p className="text-sm text-gray-500">
          Know of a grant or funding program that isn't listed here? Submit it and our team will
          review it within 48 hours. If approved it will be added to the database for all breweries to see.
        </p>

        {error && (
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Grant title */}
          <Field label="Grant Title" required>
            <input type="text" required value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="e.g. USDA Rural Business Development Grant"
              className={inputCls} />
          </Field>

          {/* Funding type + Agency — side by side on larger screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Funding Type" required>
              <select required value={form.funding_type}
                onChange={e => setField('funding_type', e.target.value)}
                className={inputCls}>
                <option value="">Select a type…</option>
                {/* FUNDING_TYPES from grantsUtils — same snake_case values used by the filter */}
                {FUNDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Funding Agency / Organization" required>
              <input type="text" required value={form.agency}
                onChange={e => setField('agency', e.target.value)}
                placeholder="e.g. USDA Rural Development"
                className={inputCls} />
            </Field>
          </div>

          {/* Description */}
          <Field label="Brief Description" required extra={`${form.description.length} / 1000`}>
            <textarea required maxLength={1000} rows={3} value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="What is this grant for? What can the funding be used for?"
              className={inputCls} />
          </Field>

          {/* Eligibility notes */}
          <Field label="Eligibility Notes" extra={`${form.eligibility_summary.length} / 500`}>
            <textarea maxLength={500} rows={2} value={form.eligibility_summary}
              onChange={e => setField('eligibility_summary', e.target.value)}
              placeholder="Who qualifies? Any restrictions? (optional)"
              className={inputCls} />
          </Field>

          {/* Estimated amount + Deadline — side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Estimated Amount (optional)">
              <input type="number" min="0" value={form.amount}
                onChange={e => setField('amount', e.target.value)}
                placeholder="e.g. 50000"
                className={inputCls} />
            </Field>
            <Field label="Application Deadline (optional)">
              <input type="date" value={form.application_deadline}
                onChange={e => setField('application_deadline', e.target.value)}
                className={inputCls} />
            </Field>
          </div>

          {/* Application URL */}
          <Field label="Application URL" required>
            <input type="url" required value={form.application_url}
              onChange={e => setField('application_url', e.target.value)}
              placeholder="https://www.example.gov/apply"
              className={inputCls} />
          </Field>

          {/* States eligible — scrollable checklist */}
          <Field label="States Eligible">
            <div className="border border-gray-300 rounded-lg p-3 max-h-44 overflow-y-auto">
              {/* Nationwide checkbox selects all states when checked */}
              <label className="flex items-center gap-2 text-sm font-semibold text-navy pb-2 mb-2 border-b border-gray-100 cursor-pointer">
                <input type="checkbox" checked={form.nationwide}
                  onChange={e => handleNationwideChange(e.target.checked)}
                  className="rounded" />
                Nationwide / Federal (all states)
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-y-1">
                {US_STATES.map(abbr => (
                  <label key={abbr} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer" title={US_STATE_NAMES[abbr]}>
                    <input type="checkbox" disabled={form.nationwide}
                      checked={form.nationwide || form.states_eligible.includes(abbr)}
                      onChange={() => toggleState(abbr)}
                      className="rounded" />
                    {abbr}
                  </label>
                ))}
              </div>
            </div>
          </Field>

          {/* Submitter note */}
          <Field label="Additional Notes for Reviewer" extra={`${form.submitter_note.length} / 300`}>
            <textarea maxLength={300} rows={2} value={form.submitter_note}
              onChange={e => setField('submitter_note', e.target.value)}
              placeholder="Any extra context for our review team? (optional)"
              className={inputCls} />
          </Field>

          <button type="submit" disabled={submitting}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {submitting ? 'Submitting…' : 'Submit for Review'}
          </button>

        </form>
      </div>
    </ModalShell>
  )
}
