/**
 * AddDeadlineModal — modal for adding a new custom compliance deadline.
 * Supports one-time and recurring deadlines (annually / quarterly / monthly).
 * Uses ModalShell + useModalDraft so the form survives accidental closes.
 */
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../services/supabase'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'
import { CATEGORIES, toISODate } from './complianceUtils'

const STORAGE_KEY = 'modal_draft_compliance_deadline'

const EMPTY = {
  deadline_name: '',
  category:      'License Renewal',
  custom_date:   '',
  recurrence:    'none',
  description:   '',
  notes:         '',
  document_id:   '',
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber'

// Simple labelled wrapper used throughout the form
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// Generates future recurring deadline rows linked back to a parent row id.
// annually → 2 future rows; quarterly → 8 future rows (~2 yrs); monthly → 24 rows (2 yrs)
function buildRecurringRows(parentId, form, breweryId) {
  const rows    = []
  const base    = new Date(form.custom_date + 'T00:00:00')
  const baseY   = base.getFullYear()
  const baseM   = base.getMonth()
  const baseD   = base.getDate()
  const freq    = form.recurrence

  const makeRow = (isoDate) => ({
    brewery_id:           breweryId,
    deadline_name:        form.deadline_name.trim(),
    category:             form.category,
    custom_date:          isoDate,
    original_date:        isoDate,
    description:          form.description.trim() || null,
    recurrence:           freq,
    recurrence_parent_id: parentId,
    is_custom:            true,
    is_complete:          false,
  })

  // Clamps day to the last valid day of the target month
  const clampDay = (y, m, d) => {
    const maxDay = new Date(y, m + 1, 0).getDate()
    const clamped = Math.min(d, maxDay)
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
  }

  if (freq === 'annually') {
    for (let i = 1; i <= 2; i++) {
      rows.push(makeRow(clampDay(baseY + i, baseM, baseD)))
    }
  } else if (freq === 'quarterly') {
    for (let i = 1; i <= 8; i++) {
      const total = baseY * 12 + baseM + i * 3
      rows.push(makeRow(clampDay(Math.floor(total / 12), total % 12, baseD)))
    }
  } else if (freq === 'monthly') {
    for (let i = 1; i <= 24; i++) {
      const total = baseY * 12 + baseM + i
      rows.push(makeRow(clampDay(Math.floor(total / 12), total % 12, baseD)))
    }
  }
  return rows
}

export default function AddDeadlineModal({ isOpen, onClose, onSuccess, breweryId, documents }) {
  const draft               = useModalDraft(STORAGE_KEY)
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isDirty = useMemo(
    () => Object.entries(form).some(([k, v]) => v !== (EMPTY[k] ?? '')),
    [form]
  )

  // When the modal opens, restore any saved draft
  useEffect(() => {
    if (isOpen) {
      setForm(draft.loadDraft(false) ?? EMPTY)
      setError('')
    }
  }, [isOpen])

  // Auto-save to sessionStorage whenever the form changes
  useEffect(() => {
    if (!isOpen) return
    draft.saveDraft(form)
  }, [form, isOpen])

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      brewery_id:    breweryId,
      deadline_name: form.deadline_name.trim(),
      category:      form.category,
      custom_date:   form.custom_date,
      original_date: form.custom_date,
      description:   form.description.trim() || null,
      notes:         form.notes.trim() || null,
      document_id:   form.document_id || null,
      recurrence:    form.recurrence,
      is_custom:     true,
      is_complete:   false,
    }

    const { data, error: err } = await supabase
      .from('brewery_deadlines')
      .insert(payload)
      .select('id')
      .single()

    if (err) {
      setSaving(false)
      setError('Could not save deadline. Please try again.')
      return
    }

    // Insert all future occurrences linked to this parent
    if (form.recurrence !== 'none' && data?.id) {
      const recurRows = buildRecurringRows(data.id, form, breweryId)
      if (recurRows.length) await supabase.from('brewery_deadlines').insert(recurRows)
    }

    draft.clearDraft()
    setSaving(false)
    onSuccess()
  }

  const recurLabel = form.recurrence === 'none'
    ? 'Save Deadline'
    : `Save + Generate Recurring Deadlines`

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      title="Add Custom Deadline"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 pt-1">
        {error && (
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">

          <Field label="Deadline Name" required>
            <input type="text" required value={form.deadline_name}
              onChange={e => setField('deadline_name', e.target.value)}
              placeholder="e.g. State Brewery License Renewal"
              className={inputCls} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category" required>
              <select required value={form.category}
                onChange={e => setField('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Due Date" required>
              <input type="date" required value={form.custom_date}
                onChange={e => setField('custom_date', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Recurring">
            <select value={form.recurrence}
              onChange={e => setField('recurrence', e.target.value)} className={inputCls}>
              <option value="none">One-time (not recurring)</option>
              <option value="annually">Annually</option>
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
            </select>
            {form.recurrence !== 'none' && (
              <p className="text-xs text-gray-400 mt-1">
                {form.recurrence === 'annually'  && 'Next 2 occurrences will be created automatically.'}
                {form.recurrence === 'quarterly' && 'Next 8 occurrences (~2 years) will be created automatically.'}
                {form.recurrence === 'monthly'   && 'Next 24 occurrences (2 years) will be created automatically.'}
              </p>
            )}
          </Field>

          <Field label="Description (optional)">
            <textarea rows={2} value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="What does this deadline involve?"
              className={inputCls} />
          </Field>

          <Field label="Notes (optional)">
            <textarea rows={2} value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              className={inputCls} />
          </Field>

          {documents?.length > 0 && (
            <Field label="Link to Document (optional)">
              <select value={form.document_id}
                onChange={e => setField('document_id', e.target.value)} className={inputCls}>
                <option value="">No document linked</option>
                {documents.map(d => <option key={d.id} value={d.id}>{d.document_name}</option>)}
              </select>
            </Field>
          )}

          <button type="submit" disabled={saving}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : recurLabel}
          </button>
        </form>
      </div>
    </ModalShell>
  )
}
