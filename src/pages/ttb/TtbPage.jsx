/**
 * TtbPage — TTB Filing & Excise Tax Tracker
 *
 * Tabs:
 *   1. Filing Dashboard  — current period status, rate reference, quick stats, upcoming deadlines
 *   2. Excise Tax Log    — payment history table, add/edit payment modal, tax calculator
 *   3. COLA Tracker      — label approval submissions table, add/edit COLA modal
 *   4. Brewer's Report   — monthly production report log, add/edit report modal
 *
 * This is a tracking tool only. It does not file or communicate with the TTB.
 */
import { useEffect, useState, useMemo } from 'react'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import ModalShell from '../../components/ModalShell'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Constants ─────────────────────────────────────────────────────────────────

// Federal excise tax rates as of the Craft Beverage Modernization Act (2018)
const TTB_RATES = [
  { label: 'Domestic — first 60,000 barrels (producers ≤ 2M bbl/yr)', rate: 3.50 },
  { label: 'Domestic — over 60,000 barrels',                           rate: 16.00 },
  { label: 'Imported beer',                                             rate: 18.00 },
]

const CONTAINER_SIZES = [
  'Draft/Keg', '12oz Can', '16oz Can', '12oz Bottle',
  '22oz Bottle', '750ml Bottle', 'Other',
]

const COLA_RECORD_TYPES = [
  'Certificate of Label Approval (COLA)',
  'Certificate of Exemption from Label Approval',
  'Formula Approval (TTB)',
  'State Brand Registration',
]

const COLA_STATUS_OPTIONS = [
  { value: 'active',       label: 'Active' },
  { value: 'superseded',   label: 'Superseded' },
  { value: 'withdrawn',    label: 'Withdrawn' },
  { value: 'under_review', label: 'Under Review' },
]

const PAYMENT_METHODS = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card',  label: 'Debit Card' },
  { value: 'ach',         label: 'ACH / Electronic Transfer' },
  { value: 'check',       label: 'Check' },
  { value: 'money_order', label: 'Money Order' },
  { value: 'cash',        label: 'Cash' },
  { value: 'other',       label: 'Other' },
]

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ── Period computation helpers ────────────────────────────────────────────────

// Returns the current filing period for a given frequency
function getCurrentPeriod(frequency) {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()

  if (frequency === 'quarterly') {
    const q      = Math.floor(m / 3)
    const qStart = q * 3
    const start  = new Date(y, qStart, 1)
    const end    = new Date(y, qStart + 3, 0)
    return {
      label:   `Q${q + 1} ${y} (${MONTH_NAMES[qStart]} 1 – ${MONTH_NAMES[qStart + 2]} ${end.getDate()})`,
      short:   `Q${q + 1} ${y}`,
      start, end,
      dueDate: new Date(y, qStart + 3, 14),
      key:     `Q${q + 1}-${y}`,
    }
  }
  if (frequency === 'monthly') {
    const start = new Date(y, m, 1)
    const end   = new Date(y, m + 1, 0)
    return {
      label:   `${MONTH_NAMES[m]} ${y}`,
      short:   `${MONTH_NAMES[m]} ${y}`,
      start, end,
      dueDate: new Date(y, m + 1, 14),
      key:     `${y}-${String(m + 1).padStart(2, '0')}`,
    }
  }
  if (frequency === 'annual') {
    const start = new Date(y, 0, 1)
    const end   = new Date(y, 11, 31)
    return {
      label:   `Annual ${y} (Jan 1 – Dec 31)`,
      short:   `Annual ${y}`,
      start, end,
      dueDate: new Date(y + 1, 1, 14),
      key:     `annual-${y}`,
    }
  }
  return null
}

// Returns the next `count` periods starting from the current one
function getUpcomingPeriods(frequency, count = 3) {
  if (!frequency) return []
  const now = new Date()
  const periods = []

  if (frequency === 'quarterly') {
    const base = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)
    for (let i = 0; i < count; i++) {
      const total = base + i
      const y = Math.floor(total / 4)
      const q = total % 4
      const qs = q * 3
      const start = new Date(y, qs, 1)
      const end   = new Date(y, qs + 3, 0)
      periods.push({
        label:   `Q${q + 1} ${y}`,
        dates:   `${MONTH_NAMES[qs]} 1 – ${MONTH_NAMES[qs + 2]} ${end.getDate()}, ${y}`,
        start, end,
        dueDate: new Date(y, qs + 3, 14),
        key:     `Q${q + 1}-${y}`,
      })
    }
  } else if (frequency === 'monthly') {
    const base = now.getFullYear() * 12 + now.getMonth()
    for (let i = 0; i < count; i++) {
      const total = base + i
      const y = Math.floor(total / 12)
      const m = total % 12
      const start = new Date(y, m, 1)
      const end   = new Date(y, m + 1, 0)
      periods.push({
        label:   `${MONTH_NAMES[m]} ${y}`,
        dates:   `${MONTH_NAMES[m]} 1–${end.getDate()}, ${y}`,
        start, end,
        dueDate: new Date(y, m + 1, 14),
        key:     `${y}-${String(m + 1).padStart(2, '0')}`,
      })
    }
  } else if (frequency === 'annual') {
    for (let i = 0; i < count; i++) {
      const y     = now.getFullYear() + i
      const start = new Date(y, 0, 1)
      const end   = new Date(y, 11, 31)
      periods.push({
        label:   `Annual ${y}`,
        dates:   `Jan 1 – Dec 31, ${y}`,
        start, end,
        dueDate: new Date(y + 1, 1, 14),
        key:     `annual-${y}`,
      })
    }
  }
  return periods
}

// Returns the last `count` periods (most recent first) for the Add Payment dropdown
function getPastPeriods(frequency, count = 8) {
  if (!frequency) return []
  const now = new Date()
  const periods = []

  if (frequency === 'quarterly') {
    const base = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)
    for (let i = 0; i < count; i++) {
      const total = base - i
      const y = Math.floor(total / 4)
      const q = total % 4
      const qs = q * 3
      const start = new Date(y, qs, 1)
      const end   = new Date(y, qs + 3, 0)
      periods.push({ label: `Q${q + 1} ${y}`, start, end, key: `Q${q + 1}-${y}` })
    }
  } else if (frequency === 'monthly') {
    const base = now.getFullYear() * 12 + now.getMonth()
    for (let i = 0; i < count; i++) {
      const total = base - i
      const y = Math.floor(total / 12)
      const m = total % 12
      const start = new Date(y, m, 1)
      const end   = new Date(y, m + 1, 0)
      periods.push({ label: `${MONTH_NAMES[m]} ${y}`, start, end, key: `${y}-${String(m + 1).padStart(2, '0')}` })
    }
  } else if (frequency === 'annual') {
    for (let i = 0; i < count; i++) {
      const y     = now.getFullYear() - i
      const start = new Date(y, 0, 1)
      const end   = new Date(y, 11, 31)
      periods.push({ label: `Annual ${y}`, start, end, key: `annual-${y}` })
    }
  }
  return periods
}

// Converts a period_start ISO date string to the canonical key format used by
// getCurrentPeriod / getUpcomingPeriods, so DB-derived keys always match computed keys.
function keyFromPeriodStart(periodStart, frequency) {
  if (!periodStart) return ''
  const d = new Date(periodStart + 'T00:00:00')
  const y = d.getFullYear()
  const m = d.getMonth()
  if (frequency === 'monthly') return `${y}-${String(m + 1).padStart(2, '0')}`
  if (frequency === 'annual')  return `annual-${y}`
  return `Q${Math.floor(m / 3) + 1}-${y}`
}

// Returns 'open', 'due_soon', 'overdue', or 'filed'
function getPeriodStatus(period, filedKeys) {
  if (filedKeys.has(period.key)) return 'filed'
  const days = Math.ceil((period.dueDate - new Date()) / 86400000)
  if (days < 0)   return 'overdue'
  if (days <= 14) return 'due_soon'
  return 'open'
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtCurrency = (n) =>
  n != null
    ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

const fmtBarrels = (n) =>
  n != null
    ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : '—'

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const toISO = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d

// ── Excise tax rate constants and calculation ─────────────────────────────────

// The barrel threshold where the small-brewer rate rises from $3.50 to $16.00.
// Almost all craft breweries stay well under this limit.
const SMALL_BREWER_THRESHOLD = 60_000    // barrels per calendar year
const LARGE_BREWER_CUTOFF    = 2_000_000 // annual production to lose small-brewer status

// Pure calculation function — given the barrel inputs and brewery situation,
// returns how many barrels fall into each rate tier and the total tax owed.
// Called both for live display and when saving a period record.
function calculateExciseTax(barrelsSale, barrelsExport, barrelsDestruction, barrelsTransferred, priorYTD, annualEstimate) {
  // Step 1: taxable barrels = removed for sale minus allowed exemptions
  const taxable = Math.max(0, barrelsSale - barrelsExport - barrelsDestruction - barrelsTransferred)
  const cumulativeAfter = priorYTD + taxable

  // Craft breweries producing under 2M barrels/year get the reduced rate
  const isSmallBrewer = annualEstimate === 0 || annualEstimate < LARGE_BREWER_CUTOFF

  let at350 = 0, at1600small = 0, at1600large = 0, at1800 = 0, tax = 0

  if (isSmallBrewer) {
    // Small brewer: $3.50/bbl on first 60,000 barrels, $16.00/bbl above that
    const remainingIn350Tier = Math.max(0, SMALL_BREWER_THRESHOLD - priorYTD)
    at350       = Math.min(taxable, remainingIn350Tier)
    at1600small = Math.max(0, taxable - at350)
    tax = (at350 * 3.50) + (at1600small * 16.00)
  } else {
    // Large brewer: $16.00/bbl on first 6M barrels, $18.00/bbl above that
    const LARGE_THRESHOLD = 6_000_000
    const remainingIn1600Tier = Math.max(0, LARGE_THRESHOLD - priorYTD)
    at1600large = Math.min(taxable, remainingIn1600Tier)
    at1800      = Math.max(0, taxable - at1600large)
    tax = (at1600large * 16.00) + (at1800 * 18.00)
  }

  return { taxable, at350, at1600small, at1600large, at1800, tax, cumulativeAfter, isSmallBrewer }
}

// Returns the ISO date strings for the start and end of a filing period.
// Used when querying brew_days for auto-population.
function getPeriodDateRange(year, periodNum, periodType) {
  if (periodType === 'quarterly') {
    const monthStart = (periodNum - 1) * 3   // Q1→Jan, Q2→Apr, Q3→Jul, Q4→Oct
    const start = new Date(year, monthStart, 1)
    const end   = new Date(year, monthStart + 3, 0)  // last day of the quarter
    return { start: toISO(start), end: toISO(end) }
  }
  // Monthly
  const start = new Date(year, periodNum - 1, 1)
  const end   = new Date(year, periodNum, 0)
  return { start: toISO(start), end: toISO(end) }
}

// Returns the human-readable label for a saved excise_tax_periods row
function excisePeriodLabel(row) {
  if (row.period_type === 'quarterly') return `Q${row.period_number} ${row.period_year}`
  return `${MONTH_NAMES[row.period_number - 1]} ${row.period_year}`
}

// ── Shared micro-components ───────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber'

// Wraps a form field with a label and optional character counter
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

// Badge for filing period status
function StatusBadge({ status }) {
  const map = {
    open:     'bg-green-100 text-green-700',
    due_soon: 'bg-orange-100 text-orange-700',
    overdue:  'bg-red-100 text-danger',
    filed:    'bg-blue-100 text-blue-700',
  }
  const labels = { open: 'Open', due_soon: 'Due Soon', overdue: 'Overdue', filed: 'Filed' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// Badge for payment / cola / report status
function RowBadge({ status }) {
  const map = {
    paid:         'bg-green-100 text-green-700',
    pending:      'bg-orange-100 text-orange-700',
    overdue:      'bg-red-100 text-danger',
    amended:      'bg-purple-100 text-purple-700',
    approved:     'bg-green-100 text-green-700',
    rejected:     'bg-red-100 text-danger',
    withdrawn:    'bg-red-100 text-danger',
    submitted:    'bg-blue-100 text-blue-700',
    draft:        'bg-gray-100 text-gray-500',
    active:       'bg-green-100 text-green-700',
    superseded:   'bg-amber/20 text-amber-dark',
    under_review: 'bg-red-100 text-danger',
  }
  const labels = { under_review: 'Under Review' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ── AddPaymentModal ───────────────────────────────────────────────────────────

const EMPTY_PAYMENT = {
  period_label: '', period_start: '', period_end: '',
  barrels_produced: '', barrels_removed: '', tax_rate: '3.50',
  amount_paid: '', payment_date: '', payment_method: 'ach',
  confirmation_number: '', status: 'paid', notes: '',
}

function AddPaymentModal({ isOpen, onClose, onSuccess, breweryId, frequency,
  initialDraft, draftRestored, onDismissDraft, onSaveDraft, editing }) {
  const [form, setForm]         = useState(EMPTY_PAYMENT)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Auto-calculate tax from barrels removed × rate whenever either changes
  const taxCalculated = useMemo(() => {
    const b = parseFloat(form.barrels_removed) || 0
    const r = parseFloat(form.tax_rate) || 0
    return b * r
  }, [form.barrels_removed, form.tax_rate])

  const isDirty = Object.entries(form).some(([k, v]) => v !== (EMPTY_PAYMENT[k] ?? ''))

  // When modal opens, load draft or existing row data; when it closes, reset
  useEffect(() => {
    if (isOpen) {
      if (editing) {
        setForm({
          period_label:        editing.period_label ?? '',
          period_start:        editing.period_start ?? '',
          period_end:          editing.period_end ?? '',
          barrels_produced:    editing.barrels_produced != null ? String(editing.barrels_produced) : '',
          barrels_removed:     editing.barrels_removed  != null ? String(editing.barrels_removed)  : '',
          tax_rate:            editing.tax_rate          != null ? String(editing.tax_rate)          : '3.50',
          amount_paid:         editing.payment_amount    != null ? String(editing.payment_amount)    : '',
          payment_date:        editing.payment_date ?? '',
          payment_method:      editing.payment_method ?? 'ach',
          confirmation_number: editing.confirmation_number ?? '',
          status:              editing.status ?? 'paid',
          notes:               editing.notes ?? '',
        })
      } else {
        setForm(initialDraft ?? EMPTY_PAYMENT)
      }
      setError('')
    }
  }, [isOpen, editing, initialDraft])

  // Save draft to sessionStorage on every form change (skipped when editing existing)
  useEffect(() => {
    if (!isOpen || editing) return
    onSaveDraft(form)
  }, [form, isOpen, editing])

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })) }

  // When a period option is selected from the dropdown, split the encoded value
  function handlePeriodSelect(encoded) {
    if (!encoded) { setForm(p => ({ ...p, period_label: '', period_start: '', period_end: '' })); return }
    const [label, start, end] = encoded.split('||')
    setForm(p => ({ ...p, period_label: label, period_start: start, period_end: end }))
  }

  // Period options for the dropdown — last 8 periods including current
  const periodOptions = useMemo(() => getPastPeriods(frequency, 8), [frequency])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      brewery_id:          breweryId,
      period_label:        form.period_label || null,
      period_start:        form.period_start || null,
      period_end:          form.period_end   || null,
      barrels_produced:    form.barrels_produced ? parseFloat(form.barrels_produced) : null,
      barrels_removed:     form.barrels_removed  ? parseFloat(form.barrels_removed)  : null,
      tax_rate:            parseFloat(form.tax_rate) || 3.50,
      tax_owed:            taxCalculated || null,
      payment_amount:      form.amount_paid ? parseFloat(form.amount_paid) : null,
      payment_date:        form.payment_date || null,
      payment_method:      form.payment_method || null,
      confirmation_number: form.confirmation_number || null,
      status:              form.status,
      notes:               form.notes || null,
      filing_frequency:    frequency,
    }

    const { error: err } = editing
      ? await supabase.from('ttb_filings').update(payload).eq('id', editing.id)
      : await supabase.from('ttb_filings').insert(payload)

    setSaving(false)
    if (err) { setError('Could not save payment. Please try again.'); return }
    onSuccess()
  }

  const currentEncoded = form.period_label && form.period_start && form.period_end
    ? `${form.period_label}||${form.period_start}||${form.period_end}`
    : ''

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} isDirty={!editing && isDirty}
      draftRestored={draftRestored} onDismissDraft={onDismissDraft}
      title={editing ? 'Edit Payment Record' : 'Log Excise Tax Payment'} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-1">
        {error && <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">

          <Field label="Filing Period" required>
            <select required value={currentEncoded}
              onChange={e => handlePeriodSelect(e.target.value)}
              className={inputCls}>
              <option value="">Select a period…</option>
              {periodOptions.map(p => (
                <option key={p.key} value={`${p.label}||${toISO(p.start)}||${toISO(p.end)}`}>
                  {p.label} ({toISO(p.start)} – {toISO(p.end)})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Barrels Produced" required>
              <input type="number" min="0" step="0.01" required value={form.barrels_produced}
                onChange={e => setField('barrels_produced', e.target.value)}
                placeholder="e.g. 45.50" className={inputCls} />
            </Field>
            <Field label="Barrels Removed (taxable)" required>
              <input type="number" min="0" step="0.01" required value={form.barrels_removed}
                onChange={e => setField('barrels_removed', e.target.value)}
                placeholder="e.g. 40.00" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tax Rate ($ per barrel)" required>
              <input type="number" min="0" step="0.01" required value={form.tax_rate}
                onChange={e => setField('tax_rate', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Tax Calculated (read-only)">
              <div className={`${inputCls} bg-gray-50 text-gray-600 cursor-default`}>
                {fmtCurrency(taxCalculated)}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Amount Paid" required>
              <input type="number" min="0" step="0.01" required value={form.amount_paid}
                onChange={e => setField('amount_paid', e.target.value)}
                placeholder={taxCalculated ? taxCalculated.toFixed(2) : '0.00'}
                className={inputCls} />
            </Field>
            <Field label="Payment Date" required>
              <input type="date" required value={form.payment_date}
                onChange={e => setField('payment_date', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Payment Method">
              <select value={form.payment_method}
                onChange={e => setField('payment_method', e.target.value)} className={inputCls}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Confirmation Number (optional)">
              <input type="text" value={form.confirmation_number}
                onChange={e => setField('confirmation_number', e.target.value)}
                placeholder="TTB-issued number" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Status" required>
              <select required value={form.status}
                onChange={e => setField('status', e.target.value)} className={inputCls}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="amended">Amended</option>
              </select>
            </Field>
          </div>

          <Field label="Notes (optional)" extra={`${form.notes.length} / 300`}>
            <textarea maxLength={300} rows={2} value={form.notes}
              onChange={e => setField('notes', e.target.value)} className={inputCls} />
          </Field>

          <button type="submit" disabled={saving}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Payment'}
          </button>
        </form>
      </div>
    </ModalShell>
  )
}


// ── FrequencySetupPrompt ──────────────────────────────────────────────────────

// Shown when the brewery has not yet set their TTB filing frequency.
// Saves the selection to the breweries table and dismisses itself.
function FrequencySetupPrompt({ breweryId, onSaved }) {
  const [selected, setSelected] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    const { error: err } = await supabase
      .from('breweries')
      .update({ ttb_filing_frequency: selected })
      .eq('id', breweryId)
    setSaving(false)
    if (err) { setError('Could not save your selection. Please try again.'); return }
    onSaved(selected)
  }

  return (
    <div className="bg-white rounded-xl border border-amber/30 p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-navy mb-1">Set Your TTB Filing Frequency</h3>
        <p className="text-sm text-gray-500">
          This is used to track your current filing period and upcoming deadlines.
          Most small breweries (under 50,000 barrels/yr) file quarterly.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { value: 'monthly',   label: 'Monthly',   sub: 'Over 50,000 barrels annually' },
          { value: 'quarterly', label: 'Quarterly',  sub: 'Under 50,000 barrels annually' },
          { value: 'annual',    label: 'Annually',   sub: 'Very small producers' },
        ].map(opt => (
          <button key={opt.value} type="button"
            onClick={() => setSelected(opt.value)}
            className={`text-left p-4 rounded-lg border-2 transition-colors ${
              selected === opt.value
                ? 'border-amber bg-amber/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}>
            <p className="font-semibold text-navy text-sm">{opt.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
          </button>
        ))}
      </div>

      <button onClick={handleSave} disabled={!selected || saving}
        className="bg-amber hover:bg-amber-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
        {saving ? 'Saving…' : 'Save & Continue'}
      </button>
    </div>
  )
}

// ── AddColaModal ──────────────────────────────────────────────────────────────

const EMPTY_COLA = {
  record_type:               '',
  brand_name:                '',
  beer_name:                 '',
  container_size:            '',
  status:                    'active',
  cola_number:               '',
  beer_style:                '',
  abv:                       '',
  formula_approval_required: false,
  formula_number:            '',
  last_verified_date:        '',
  superseded_by:             '',
}

function AddColaModal({ isOpen, onClose, onSuccess, breweryId,
  initialDraft, draftRestored, onDismissDraft, onSaveDraft, editing }) {
  const [form, setForm]     = useState(EMPTY_COLA)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isDirty = Object.entries(form).some(([k, v]) => v !== (EMPTY_COLA[k] ?? ''))

  useEffect(() => {
    if (isOpen) {
      if (editing) {
        const meta = editing.metadata && typeof editing.metadata === 'object' ? editing.metadata : {}
        setForm({
          record_type:               editing.record_type ?? '',
          brand_name:                editing.brand_name ?? '',
          beer_name:                 editing.beer_name ?? '',
          container_size:            editing.container_size ?? '',
          status:                    editing.status ?? 'active',
          cola_number:               meta.cola_number ?? '',
          beer_style:                meta.beer_style ?? '',
          abv:                       meta.abv != null ? String(meta.abv) : '',
          formula_approval_required: meta.formula_approval_required ?? false,
          formula_number:            meta.formula_number ?? '',
          last_verified_date:        meta.last_verified_date ?? '',
          superseded_by:             meta.superseded_by ?? '',
        })
      } else {
        setForm(initialDraft ?? EMPTY_COLA)
      }
      setError('')
    }
  }, [isOpen, editing, initialDraft])

  useEffect(() => {
    if (!isOpen || editing) return
    onSaveDraft(form)
  }, [form, isOpen, editing])

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const meta = {}
    if (form.cola_number)    meta.cola_number = form.cola_number
    if (form.beer_style)     meta.beer_style  = form.beer_style
    if (form.abv)            meta.abv          = parseFloat(form.abv) || form.abv
    meta.formula_approval_required = form.formula_approval_required
    if (form.formula_approval_required && form.formula_number)
      meta.formula_number = form.formula_number
    if (form.last_verified_date) meta.last_verified_date = form.last_verified_date
    if (form.superseded_by)      meta.superseded_by      = form.superseded_by

    const payload = {
      brewery_id:     breweryId,
      record_type:    form.record_type    || null,
      brand_name:     form.brand_name     || null,
      beer_name:      form.beer_name,
      container_size: form.container_size || null,
      status:         form.status,
      metadata:       Object.keys(meta).length > 0 ? meta : null,
    }

    const { error: err } = editing
      ? await supabase.from('cola_submissions').update(payload).eq('id', editing.id)
      : await supabase.from('cola_submissions').insert(payload)

    setSaving(false)
    if (err) { setError('Could not save record. Please try again.'); return }
    onSuccess()
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} isDirty={!editing && isDirty}
      draftRestored={draftRestored} onDismissDraft={onDismissDraft}
      title={editing ? 'Edit COLA Record' : 'Add COLA Record'} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-1">
        {error && <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">

          <Field label="Record Type" required>
            <select required value={form.record_type}
              onChange={e => setField('record_type', e.target.value)}
              className={inputCls}>
              <option value="">Select a type…</option>
              {COLA_RECORD_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Brand Name">
              <input type="text" value={form.brand_name}
                onChange={e => setField('brand_name', e.target.value)}
                placeholder="e.g. Mountain Brewing Co." className={inputCls} />
            </Field>
            <Field label="Product Name / Beer" required>
              <input type="text" required value={form.beer_name}
                onChange={e => setField('beer_name', e.target.value)}
                placeholder="e.g. Hazy IPA 16oz Can" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="COLA Number">
              <input type="text" value={form.cola_number}
                onChange={e => setField('cola_number', e.target.value)}
                placeholder="TTB-assigned reference #" className={inputCls} />
            </Field>
            <Field label="Beer Style">
              <input type="text" value={form.beer_style}
                onChange={e => setField('beer_style', e.target.value)}
                placeholder="e.g. American IPA" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Container Size">
              <input type="text" value={form.container_size}
                onChange={e => setField('container_size', e.target.value)}
                placeholder="e.g. 16oz, 750ml" className={inputCls} />
            </Field>
            <Field label="ABV (%)">
              <input type="number" min="0" max="100" step="0.1" value={form.abv}
                onChange={e => setField('abv', e.target.value)}
                placeholder="e.g. 6.5" className={inputCls} />
            </Field>
            <Field label="Status" required>
              <select required value={form.status}
                onChange={e => setField('status', e.target.value)}
                className={inputCls}>
                {COLA_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => setField('formula_approval_required', !form.formula_approval_required)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                form.formula_approval_required ? 'bg-amber' : 'bg-gray-200'
              }`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.formula_approval_required ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <label className="text-sm font-medium text-navy">Formula Approval Required</label>
          </div>

          {form.formula_approval_required && (
            <Field label="Formula Number">
              <input type="text" value={form.formula_number}
                onChange={e => setField('formula_number', e.target.value)}
                placeholder="TTB formula approval number" className={inputCls} />
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Last Verified Date">
              <input type="date" value={form.last_verified_date}
                onChange={e => setField('last_verified_date', e.target.value)}
                className={inputCls} />
            </Field>
            <Field label="Superseded By (COLA #)">
              <input type="text" value={form.superseded_by}
                onChange={e => setField('superseded_by', e.target.value)}
                placeholder="If replaced, enter new COLA #" className={inputCls} />
            </Field>
          </div>

          <button type="submit" disabled={saving}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add COLA Record'}
          </button>
        </form>
      </div>
    </ModalShell>
  )
}

// ── Main TtbPage component ────────────────────────────────────────────────────

export default function TtbPage() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  // Data
  const [filings,      setFilings]      = useState([])
  const [colaList,     setColaList]     = useState([])
  const [filedPeriods, setFiledPeriods] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState('')

  // UI
  const [activeTab,    setActiveTab]    = usePersistedTab('ttb_active_tab', 'dashboard')
  const [frequency,    setFrequency]    = useState(brewery?.ttb_filing_frequency ?? null)
  const [calcBarrels,  setCalcBarrels]  = useState('')
  const [calcTier,     setCalcTier]     = useState('3.50')
  const [markingFiled, setMarkingFiled] = useState(false)

  // Modal visibility + editing targets
  const [showPayment,  setShowPayment]  = useState(false)
  const [editPayment,  setEditPayment]  = useState(null)
  const [showCola,     setShowCola]     = useState(false)
  const [editCola,     setEditCola]     = useState(null)
  const [colaFilter,   setColaFilter]   = useState('all')

  // Draft hooks — one per modal
  const paymentDraft = useModalDraft('modal_draft_ttb_payment')
  const colaDraft    = useModalDraft('modal_draft_ttb_cola')

  // ── Excise Tax Calculator state ─────────────────────────────────────────────
  const [excisePeriods,      setExcisePeriods]      = useState([])
  const [calcProfile,        setCalcProfile]         = useState({ annual_production_estimate: '', excise_tax_ytd_paid: '' })
  const [calcProfileSaving,  setCalcProfileSaving]   = useState(false)
  const [calcProfileSaved,   setCalcProfileSaved]    = useState(false)
  const [calcYear,           setCalcYear]            = useState(new Date().getFullYear())
  const [calcPeriodNum,      setCalcPeriodNum]       = useState(1)
  const [periodForm,         setPeriodForm]          = useState({
    barrels_produced: '', barrels_removed_sale: '', barrels_removed_export: '0',
    barrels_removed_destruction: '0', barrels_transferred: '0', status: 'estimated', notes: '',
  })
  const [existingPeriodRow,  setExistingPeriodRow]   = useState(null)
  const [autoFilledProduced, setAutoFilledProduced]  = useState(false)
  const [periodLoading,      setPeriodLoading]       = useState(false)
  const [periodSaving,       setPeriodSaving]        = useState(false)
  const [periodSaved,        setPeriodSaved]         = useState(false)
  const [periodError,        setPeriodError]         = useState('')

  // Precompute the set of filed period keys for fast lookup.
  // Keys are derived from period_start dates (not label strings) to guarantee
  // format consistency with getCurrentPeriod / getUpcomingPeriods.
  // Also includes ttb_filings rows with a payment_date set, so paying via the
  // payment modal removes the period from upcoming deadlines automatically.
  const filedKeys = useMemo(() => {
    const keys = new Set()
    for (const p of filedPeriods) {
      if (p.status === 'filed') {
        const k = keyFromPeriodStart(p.period_start, frequency)
        if (k) keys.add(k)
      }
    }
    for (const f of filings) {
      if (f.payment_date || f.status === 'paid' || f.status === 'filed') {
        const k = keyFromPeriodStart(f.period_start, frequency)
        if (k) keys.add(k)
      }
    }
    return keys
  }, [filedPeriods, filings, frequency])

  // Load all data when the brewery is known
  useEffect(() => {
    if (!brewery?.id) return
    setFrequency(brewery.ttb_filing_frequency ?? null)
    loadAll()
  }, [brewery?.id])

  // Fetch all data sets in parallel
  async function loadAll() {
    setLoading(true)
    setLoadError('')

    const [filingsRes, periodsRes, exciseRes, colaRes] = await Promise.all([
      supabase.from('ttb_filings').select('*')
        .eq('brewery_id', brewery.id).order('created_at', { ascending: false }),
      supabase.from('ttb_filing_periods').select('*')
        .eq('brewery_id', brewery.id).order('period_start', { ascending: false }),
      supabase.from('excise_tax_periods').select('*')
        .eq('brewery_id', brewery.id)
        .order('period_year', { ascending: false })
        .order('period_number', { ascending: false }),
      supabase.from('cola_submissions').select('*')
        .eq('brewery_id', brewery.id).order('created_at', { ascending: false }),
    ])

    if (filingsRes.error || periodsRes.error) {
      setLoadError('Some data failed to load. Try refreshing the page.')
    }

    setFilings(filingsRes.data ?? [])
    setFiledPeriods(periodsRes.data ?? [])
    setExcisePeriods(exciseRes.data ?? [])
    setColaList(colaRes.data ?? [])
    setLoading(false)
  }

  // Mark the current period as filed by upserting a row in ttb_filing_periods
  async function markCurrentPeriodFiled() {
    const period = getCurrentPeriod(frequency)
    if (!period) return
    setMarkingFiled(true)
    await supabase.from('ttb_filing_periods').upsert({
      brewery_id:       brewery.id,
      period_label:     period.short,
      period_start:     toISO(period.start),
      period_end:       toISO(period.end),
      filing_frequency: frequency,
      status:           'filed',
      filed_date:       toISO(new Date()),
    }, { onConflict: 'brewery_id,period_start,period_end' })
    setMarkingFiled(false)
    await loadAll()
  }

  // When the user switches to the Excise Tax Calculator tab, load the brewery's
  // saved profile settings and default the selector to the current period.
  useEffect(() => {
    if (activeTab !== 'excise_calculator' || !brewery?.id) return
    const now = new Date()
    const currentFreq = frequency ?? 'quarterly'
    setCalcYear(now.getFullYear())
    setCalcPeriodNum(currentFreq === 'monthly' ? now.getMonth() + 1 : Math.floor(now.getMonth() / 3) + 1)
    loadExciseTaxProfile()
  }, [activeTab, brewery?.id])

  // Reads annual_production_estimate and excise_tax_ytd_paid from the brewery row
  async function loadExciseTaxProfile() {
    const { data } = await supabase
      .from('breweries')
      .select('annual_production_estimate, excise_tax_ytd_paid')
      .eq('id', brewery.id)
      .single()
    if (data) {
      setCalcProfile({
        annual_production_estimate: data.annual_production_estimate != null ? String(data.annual_production_estimate) : '',
        excise_tax_ytd_paid:        data.excise_tax_ytd_paid        != null ? String(data.excise_tax_ytd_paid)        : '',
      })
    }
  }

  // Saves the annual production estimate and YTD paid back to the breweries table
  async function handleSaveCalcProfile() {
    setCalcProfileSaving(true)
    setCalcProfileSaved(false)
    const { error } = await supabase
      .from('breweries')
      .update({
        annual_production_estimate: parseFloat(calcProfile.annual_production_estimate) || 0,
        excise_tax_ytd_paid:        parseFloat(calcProfile.excise_tax_ytd_paid)        || 0,
      })
      .eq('id', brewery.id)
    setCalcProfileSaving(false)
    if (!error) { setCalcProfileSaved(true); setTimeout(() => setCalcProfileSaved(false), 3000) }
  }

  // Loads data for the chosen year + period. If a saved record exists, populates
  // the form from it. Otherwise auto-fills barrels_produced from brew_days.
  // Accepts optional arguments so the Edit button can pass values directly
  // without relying on potentially stale state.
  async function loadExcisePeriod(year = calcYear, periodNum = calcPeriodNum) {
    if (!brewery?.id) return
    setPeriodLoading(true)
    setPeriodSaved(false)
    setPeriodError('')
    setAutoFilledProduced(false)

    const periodType = (frequency ?? 'quarterly') === 'monthly' ? 'monthly' : 'quarterly'

    // Look for an existing saved record for this exact period
    const { data: existing } = await supabase
      .from('excise_tax_periods')
      .select('*')
      .eq('brewery_id', brewery.id)
      .eq('period_year', year)
      .eq('period_number', periodNum)
      .eq('period_type', periodType)
      .maybeSingle()

    if (existing) {
      setExistingPeriodRow(existing)
      setPeriodForm({
        barrels_produced:            existing.barrels_produced            != null ? String(existing.barrels_produced)            : '',
        barrels_removed_sale:        existing.barrels_removed_sale        != null ? String(existing.barrels_removed_sale)        : '',
        barrels_removed_export:      existing.barrels_removed_export      != null ? String(existing.barrels_removed_export)      : '0',
        barrels_removed_destruction: existing.barrels_removed_destruction != null ? String(existing.barrels_removed_destruction) : '0',
        barrels_transferred:         existing.barrels_transferred         != null ? String(existing.barrels_transferred)         : '0',
        status:                      existing.status ?? 'estimated',
        notes:                       existing.notes  ?? '',
      })
      setPeriodLoading(false)
      return
    }

    // No saved record — try to auto-fill barrels_produced from completed brew days
    setExistingPeriodRow(null)
    const { start, end } = getPeriodDateRange(year, periodNum, periodType)

    const { data: brewDayData } = await supabase
      .from('brew_days')
      .select('planned_batch_size, planned_batch_unit')
      .eq('brewery_id', brewery.id)
      .gte('brew_date', start)
      .lte('brew_date', end)
      .in('status', ['scheduled', 'in_progress', 'completed'])

    // Sum planned batch sizes for brew days that are already in barrels
    const autoBarrels = (brewDayData ?? []).reduce((sum, bd) => {
      if (!bd.planned_batch_unit || bd.planned_batch_unit === 'barrels') {
        return sum + (parseFloat(bd.planned_batch_size) || 0)
      }
      return sum
    }, 0)

    setAutoFilledProduced(autoBarrels > 0)
    setPeriodForm({
      barrels_produced:            autoBarrels > 0 ? autoBarrels.toFixed(3) : '',
      barrels_removed_sale:        '',
      barrels_removed_export:      '0',
      barrels_removed_destruction: '0',
      barrels_transferred:         '0',
      status:                      'estimated',
      notes:                       '',
    })
    setPeriodLoading(false)
  }

  // Saves (or updates) the current period form to the excise_tax_periods table,
  // using upsert so re-saving an existing period always works correctly.
  async function handleSavePeriod() {
    if (!brewery?.id) return
    setPeriodSaving(true)
    setPeriodError('')

    const periodType = (frequency ?? 'quarterly') === 'monthly' ? 'monthly' : 'quarterly'
    const payload = {
      brewery_id:                  brewery.id,
      period_year:                 calcYear,
      period_number:               calcPeriodNum,
      period_type:                 periodType,
      barrels_produced:            parseFloat(periodForm.barrels_produced)            || 0,
      barrels_removed_sale:        parseFloat(periodForm.barrels_removed_sale)        || 0,
      barrels_removed_export:      parseFloat(periodForm.barrels_removed_export)      || 0,
      barrels_removed_destruction: parseFloat(periodForm.barrels_removed_destruction) || 0,
      barrels_transferred:         parseFloat(periodForm.barrels_transferred)         || 0,
      tax_rate_applied:            calcResult.isSmallBrewer ? 3.50 : 16.00,
      tax_owed:                    calcResult.tax,
      cumulative_barrels_ytd:      calcResult.cumulativeAfter,
      status:                      periodForm.status,
      notes:                       periodForm.notes.trim() || null,
    }

    const { data, error } = await supabase
      .from('excise_tax_periods')
      .upsert(payload, { onConflict: 'brewery_id,period_year,period_number,period_type' })
      .select()
      .single()

    if (error) { setPeriodError('Could not save period. Please try again.'); setPeriodSaving(false); return }

    setExistingPeriodRow(data)
    setPeriodSaved(true)
    setTimeout(() => setPeriodSaved(false), 3000)
    setPeriodSaving(false)

    // Refresh the full list so the history table and YTD totals update
    const { data: allPeriods } = await supabase
      .from('excise_tax_periods').select('*').eq('brewery_id', brewery.id)
      .order('period_year', { ascending: false }).order('period_number', { ascending: false })
    setExcisePeriods(allPeriods ?? [])
  }

  // Updates a saved period's status to 'filed' or 'paid' and stamps the date
  async function handleMarkPeriodStatus(id, newStatus) {
    const update = { status: newStatus }
    if (newStatus === 'filed') update.filed_date   = new Date().toISOString().slice(0, 10)
    if (newStatus === 'paid')  update.payment_date = new Date().toISOString().slice(0, 10)
    await supabase.from('excise_tax_periods').update(update).eq('id', id)
    const { data: allPeriods } = await supabase
      .from('excise_tax_periods').select('*').eq('brewery_id', brewery.id)
      .order('period_year', { ascending: false }).order('period_number', { ascending: false })
    setExcisePeriods(allPeriods ?? [])
  }

  // Delete helpers with optimistic removal
  async function deletePayment(id) {
    if (!window.confirm('Delete this payment record? This cannot be undone.')) return
    await supabase.from('ttb_filings').delete().eq('id', id)
    setFilings(prev => prev.filter(r => r.id !== id))
  }

  // Export the payment log as a CSV file
  function exportPaymentsCsv() {
    const header = [
      'Period', 'Period Start', 'Period End', 'Barrels Produced', 'Barrels Removed',
      'Tax Rate', 'Tax Calculated', 'Amount Paid', 'Payment Date',
      'Payment Method', 'Confirmation', 'Status',
    ]
    const rows = filings.map(f => [
      f.period_label ?? '',
      f.period_start ?? '',
      f.period_end ?? '',
      f.barrels_produced ?? '',
      f.barrels_removed ?? '',
      f.tax_rate ?? '',
      f.tax_owed ?? '',
      f.payment_amount ?? '',
      f.payment_date ?? '',
      f.payment_method ?? '',
      f.confirmation_number ?? '',
      f.status ?? '',
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a   = document.createElement('a')
    a.href = url; a.download = 'excise-tax-log.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // Quick stats computed from loaded data
  const currentYear    = new Date().getFullYear()
  const yearFilings    = filings.filter(f => f.payment_date?.startsWith(String(currentYear)))
  const totalPaidYear  = yearFilings.reduce((sum, f) => sum + (parseFloat(f.payment_amount) || 0), 0)
  const upcomingPeriods = getUpcomingPeriods(frequency, 3)

  const calcEstimate = useMemo(() => {
    const b = parseFloat(calcBarrels) || 0
    const r = parseFloat(calcTier) || 0
    return b * r
  }, [calcBarrels, calcTier])

  const colasNeedingReview = useMemo(
    () => colaList.filter(c => c.status === 'under_review' || c.status === 'withdrawn'),
    [colaList]
  )

  // Sum of taxable barrels from all periods in the same year that come BEFORE
  // the currently selected period — used as the starting YTD position for the calculator
  const priorYTDBarrels = useMemo(() => {
    const periodType = (frequency ?? 'quarterly') === 'monthly' ? 'monthly' : 'quarterly'
    return excisePeriods
      .filter(p => p.period_year === calcYear && p.period_type === periodType && p.period_number < calcPeriodNum)
      .reduce((sum, p) => sum + Math.max(0,
        (parseFloat(p.barrels_removed_sale)        || 0)
        - (parseFloat(p.barrels_removed_export)      || 0)
        - (parseFloat(p.barrels_removed_destruction) || 0)
        - (parseFloat(p.barrels_transferred)         || 0)
      ), 0)
  }, [excisePeriods, calcYear, calcPeriodNum, frequency])

  // Live tax result — recomputes instantly as the user types in the period form
  const calcResult = useMemo(() => calculateExciseTax(
    parseFloat(periodForm.barrels_removed_sale)        || 0,
    parseFloat(periodForm.barrels_removed_export)      || 0,
    parseFloat(periodForm.barrels_removed_destruction) || 0,
    parseFloat(periodForm.barrels_transferred)         || 0,
    priorYTDBarrels,
    parseFloat(calcProfile.annual_production_estimate) || 0,
  ), [periodForm, priorYTDBarrels, calcProfile.annual_production_estimate])

  // ── Modals open/close handlers ─────────────────────────────────────────────

  function openAddPayment() {
    setEditPayment(null)
    setShowPayment(true)
  }
  function openEditPayment(row) {
    setEditPayment(row)
    setShowPayment(true)
  }
  function closePayment() {
    if (!editPayment) paymentDraft.clearDraft()
    setShowPayment(false)
    setEditPayment(null)
  }
  function onPaymentSuccess() {
    paymentDraft.clearDraft()
    setShowPayment(false)
    setEditPayment(null)
    loadAll()
  }

  function openAddCola() { setEditCola(null); setShowCola(true) }
  function openEditCola(row) { setEditCola(row); setShowCola(true) }
  function closeCola() {
    if (!editCola) colaDraft.clearDraft()
    setShowCola(false)
    setEditCola(null)
  }
  function onColaSuccess() {
    colaDraft.clearDraft()
    setShowCola(false)
    setEditCola(null)
    loadAll()
  }
  async function deleteCola(id) {
    if (!window.confirm('Delete this COLA record? This cannot be undone.')) return
    await supabase.from('cola_submissions').delete().eq('id', id)
    setColaList(prev => prev.filter(r => r.id !== id))
  }

  // ── Tab content renderers ──────────────────────────────────────────────────

  function renderExciseCalculator() {
    const currentFreq = frequency ?? 'quarterly'
    const periodType  = currentFreq === 'monthly' ? 'monthly' : 'quarterly'

    // Period selector options — months Jan–Dec or quarters Q1–Q4
    const periodOptions = currentFreq === 'monthly'
      ? MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))
      : [1, 2, 3, 4].map(q => ({ value: q, label: `Q${q}` }))

    const yearOptions  = [new Date().getFullYear(), new Date().getFullYear() - 1]
    const annualEstimate = parseFloat(calcProfile.annual_production_estimate) || 0

    // Threshold progress bar values — green → amber → red as 60k approaches
    const ytdPercent    = annualEstimate === 0 || calcResult.isSmallBrewer
      ? Math.min(100, (calcResult.cumulativeAfter / 60_000) * 100)
      : 0
    const progressColor  = ytdPercent >= 100 ? 'bg-danger' : ytdPercent >= 83 ? 'bg-amber' : 'bg-green-500'
    const progressBorder = ytdPercent >= 100 ? 'border-red-200 bg-red-50'
      : ytdPercent >= 83 ? 'border-amber/30 bg-amber/5' : 'border-green-200 bg-green-50'

    // YTD totals from saved periods for the selected year
    const yearPeriods  = excisePeriods.filter(p => p.period_year === calcYear && p.period_type === periodType)
    const ytdTaxOwed   = yearPeriods.reduce((s, p) => s + (parseFloat(p.tax_owed) || 0), 0)
    const ytdTaxPaid   = yearPeriods.filter(p => p.status === 'paid').reduce((s, p) => s + (parseFloat(p.tax_owed) || 0), 0)
    const ytdOutstanding = Math.max(0, ytdTaxOwed - ytdTaxPaid)

    // Whether the period form is populated enough to show the inputs panel
    const periodFormVisible = existingPeriodRow !== null
      || periodForm.barrels_produced !== ''
      || periodForm.barrels_removed_sale !== ''

    // Whether the live calculation summary should be shown
    const showCalcSummary = parseFloat(periodForm.barrels_removed_sale) > 0
      || parseFloat(periodForm.barrels_produced) > 0

    return (
      <div className="space-y-5">

        {/* ── Disclaimer ── */}
        <div className="bg-amber/10 border border-amber/30 rounded-xl px-4 py-3 flex gap-3">
          <span className="text-amber text-lg flex-shrink-0 mt-0.5">⚠️</span>
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong className="text-navy">Estimates only.</strong>{' '}
            This calculator is for planning purposes. Consult a CPA or licensed alcohol beverage
            attorney to confirm your exact liability before filing. File using{' '}
            <strong>TTB Form 5000.24</strong> via{' '}
            <a href="https://pay.gov" target="_blank" rel="noopener noreferrer"
              className="text-amber underline hover:text-amber-dark">Pay.gov</a> or by mail.
          </p>
        </div>

        {/* ── Section 1: Brewery Tax Profile ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-semibold text-navy">Brewery Tax Profile</h3>
              <p className="text-xs text-gray-500 mt-0.5">Used to determine your rate tier and project your annual position.</p>
            </div>
            {calcProfileSaved && <span className="text-sm text-success font-medium">✓ Saved</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Field label="Estimated Annual Production (barrels)">
              <input type="number" min="0" step="1"
                value={calcProfile.annual_production_estimate}
                onChange={e => setCalcProfile(p => ({ ...p, annual_production_estimate: e.target.value }))}
                placeholder="e.g. 500" className={inputCls} />
            </Field>
            <Field label="Year-to-Date Excise Tax Already Paid ($)">
              <input type="number" min="0" step="0.01"
                value={calcProfile.excise_tax_ytd_paid}
                onChange={e => setCalcProfile(p => ({ ...p, excise_tax_ytd_paid: e.target.value }))}
                placeholder="e.g. 1200.00" className={inputCls} />
            </Field>
          </div>

          {/* Rate tier callout */}
          {annualEstimate > 0 ? (
            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200 text-sm text-green-800">
              <strong>✓ Small Brewer Rate — Qualified</strong><br />
              Your estimated {annualEstimate.toLocaleString()} barrels/yr qualifies you for{' '}
              <strong>$3.50/bbl</strong> on your first 60,000 barrels removed for sale.
              Barrels above 60,000 are taxed at $16.00/bbl.
            </div>
          ) : (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-600">
              Enter your estimated annual production above. Virtually all craft breweries
              qualify for the small brewer rate of <strong>$3.50/bbl</strong> on their first 60,000 barrels.
            </div>
          )}

          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
            <strong>Filing frequency:</strong>{' '}
            {currentFreq.charAt(0).toUpperCase() + currentFreq.slice(1)}
            {currentFreq !== 'monthly' && (
              <span className="ml-1">
                — Quarterly filing is available if your annual excise tax liability is $50,000 or less.
                Most small craft breweries qualify.
              </span>
            )}
          </div>

          <button onClick={handleSaveCalcProfile} disabled={calcProfileSaving}
            className="mt-4 bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
            {calcProfileSaving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>

        {/* ── Section 2: Period Calculator ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <h3 className="font-semibold text-navy">Period Calculator</h3>

          {/* Period selector row */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-sm font-medium text-navy block mb-1">Year</label>
              <select value={calcYear} onChange={e => setCalcYear(Number(e.target.value))}
                className={`${inputCls} w-28`}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-navy block mb-1">Period</label>
              <select value={calcPeriodNum} onChange={e => setCalcPeriodNum(Number(e.target.value))}
                className={`${inputCls} w-36`}>
                {periodOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <button onClick={() => loadExcisePeriod(calcYear, calcPeriodNum)} disabled={periodLoading}
              className="bg-navy hover:opacity-90 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
              {periodLoading ? 'Loading…' : 'Load Period'}
            </button>
          </div>

          {/* Barrel input form — shown after a period is loaded */}
          {periodFormVisible && (
            <div className="border-t border-gray-100 pt-5 space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Barrels Produced This Period"
                  extra={autoFilledProduced && !existingPeriodRow ? '📊 Auto-filled from brew days — verify' : undefined}>
                  <input type="number" min="0" step="0.001"
                    value={periodForm.barrels_produced}
                    onChange={e => setPeriodForm(p => ({ ...p, barrels_produced: e.target.value }))}
                    placeholder="0.000" className={inputCls} />
                </Field>
                <Field label="Barrels Removed for Consumption / Sale">
                  <input type="number" min="0" step="0.001"
                    value={periodForm.barrels_removed_sale}
                    onChange={e => setPeriodForm(p => ({ ...p, barrels_removed_sale: e.target.value }))}
                    placeholder="0.000" className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Barrels Removed for Export (exempt)">
                  <input type="number" min="0" step="0.001"
                    value={periodForm.barrels_removed_export}
                    onChange={e => setPeriodForm(p => ({ ...p, barrels_removed_export: e.target.value }))}
                    placeholder="0.000" className={inputCls} />
                </Field>
                <Field label="Barrels Removed for Destruction">
                  <input type="number" min="0" step="0.001"
                    value={periodForm.barrels_removed_destruction}
                    onChange={e => setPeriodForm(p => ({ ...p, barrels_removed_destruction: e.target.value }))}
                    placeholder="0.000" className={inputCls} />
                </Field>
                <Field label="Barrels Transferred (alt. proprietors)">
                  <input type="number" min="0" step="0.001"
                    value={periodForm.barrels_transferred}
                    onChange={e => setPeriodForm(p => ({ ...p, barrels_transferred: e.target.value }))}
                    placeholder="0.000" className={inputCls} />
                </Field>
              </div>

              {/* Live calculation summary — shown as soon as any barrel value is entered */}
              {showCalcSummary && (
                <div className="bg-navy text-white rounded-xl p-5 font-mono text-sm leading-relaxed">
                  <p className="font-bold text-amber mb-3 font-sans text-base">Calculation Summary</p>

                  {/* Step 1: Taxable barrel derivation */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Barrels removed for sale this period:</span>
                      <span>{(parseFloat(periodForm.barrels_removed_sale) || 0).toFixed(3)} bbl</span>
                    </div>
                    {parseFloat(periodForm.barrels_removed_export) > 0 && (
                      <div className="flex justify-between text-gray-400">
                        <span>Less: Export exemption:</span>
                        <span>−{(parseFloat(periodForm.barrels_removed_export) || 0).toFixed(3)} bbl</span>
                      </div>
                    )}
                    {parseFloat(periodForm.barrels_removed_destruction) > 0 && (
                      <div className="flex justify-between text-gray-400">
                        <span>Less: Destruction exemption:</span>
                        <span>−{(parseFloat(periodForm.barrels_removed_destruction) || 0).toFixed(3)} bbl</span>
                      </div>
                    )}
                    {parseFloat(periodForm.barrels_transferred) > 0 && (
                      <div className="flex justify-between text-gray-400">
                        <span>Less: Transfers:</span>
                        <span>−{(parseFloat(periodForm.barrels_transferred) || 0).toFixed(3)} bbl</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-600 pt-1 font-semibold">
                      <span>Taxable barrels this period:</span>
                      <span>{calcResult.taxable.toFixed(3)} bbl</span>
                    </div>
                  </div>

                  {/* Step 2: YTD position */}
                  <div className="mt-3 pt-3 border-t border-gray-600 space-y-1">
                    <div className="flex justify-between text-gray-300">
                      <span>Year-to-date removals (prior periods):</span>
                      <span>{priorYTDBarrels.toFixed(3)} bbl</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cumulative YTD after this period:</span>
                      <span className={
                        calcResult.cumulativeAfter > 60_000 ? 'text-red-400 font-bold'
                        : calcResult.cumulativeAfter > 50_000 ? 'text-amber font-semibold'
                        : 'text-green-400'
                      }>
                        {calcResult.cumulativeAfter.toFixed(3)} bbl
                      </span>
                    </div>
                  </div>

                  {/* Step 3: Rate tier breakdown */}
                  <div className="mt-3 pt-3 border-t border-gray-600 space-y-1">
                    <p className="text-gray-300 mb-1">Rate calculation:</p>
                    {calcResult.at350 > 0 && (
                      <div className="flex justify-between pl-4">
                        <span className="text-gray-300">Barrels at $3.50/bbl:</span>
                        <span>{calcResult.at350.toFixed(3)} bbl = {fmtCurrency(calcResult.at350 * 3.50)}</span>
                      </div>
                    )}
                    {calcResult.at1600small > 0 && (
                      <div className="flex justify-between pl-4">
                        <span className="text-gray-300">Barrels at $16.00/bbl:</span>
                        <span>{calcResult.at1600small.toFixed(3)} bbl = {fmtCurrency(calcResult.at1600small * 16.00)}</span>
                      </div>
                    )}
                    {calcResult.at1600large > 0 && (
                      <div className="flex justify-between pl-4">
                        <span className="text-gray-300">Barrels at $16.00/bbl:</span>
                        <span>{calcResult.at1600large.toFixed(3)} bbl = {fmtCurrency(calcResult.at1600large * 16.00)}</span>
                      </div>
                    )}
                    {calcResult.at1800 > 0 && (
                      <div className="flex justify-between pl-4">
                        <span className="text-gray-300">Barrels at $18.00/bbl:</span>
                        <span>{calcResult.at1800.toFixed(3)} bbl = {fmtCurrency(calcResult.at1800 * 18.00)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-600 pt-2 mt-1 text-base font-bold">
                      <span>EXCISE TAX OWED THIS PERIOD:</span>
                      <span className="text-amber">{fmtCurrency(calcResult.tax)}</span>
                    </div>
                  </div>

                  {/* YTD context */}
                  <div className="mt-3 pt-3 border-t border-gray-600 space-y-1 text-gray-300">
                    <div className="flex justify-between">
                      <span>Year-to-date excise tax paid ({calcYear}):</span>
                      <span>{fmtCurrency(ytdTaxPaid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Projected annual excise tax:</span>
                      <span>{fmtCurrency(calcResult.tax * (currentFreq === 'quarterly' ? 4 : currentFreq === 'monthly' ? 12 : 1))}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Threshold progress bar — small brewers only */}
              {calcResult.isSmallBrewer && calcResult.cumulativeAfter > 0 && (
                <div className={`p-4 rounded-xl border ${progressBorder}`}>
                  <div className="flex flex-wrap justify-between items-center text-sm mb-2 gap-1">
                    <span className="font-semibold text-navy">60,000 Barrel Threshold</span>
                    <span className="text-gray-500 text-xs">
                      {Math.round(calcResult.cumulativeAfter).toLocaleString()} of 60,000 bbl used ({ytdPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all duration-300 ${progressColor}`}
                      style={{ width: `${ytdPercent}%` }} />
                  </div>
                  {ytdPercent >= 83 && ytdPercent < 100 && (
                    <p className="text-xs text-amber mt-2 font-medium">
                      ⚠️ Approaching threshold — barrels above 60,000 will be taxed at $16.00/bbl instead of $3.50/bbl.
                    </p>
                  )}
                  {ytdPercent >= 100 && (
                    <p className="text-xs text-danger mt-2 font-medium">
                      Threshold exceeded — all additional barrels this year are taxed at $16.00/bbl.
                    </p>
                  )}
                </div>
              )}

              {/* Status, notes, save */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Filing Status">
                  <select value={periodForm.status}
                    onChange={e => setPeriodForm(p => ({ ...p, status: e.target.value }))}
                    className={inputCls}>
                    <option value="estimated">Estimated</option>
                    <option value="filed">Filed</option>
                    <option value="paid">Paid</option>
                  </select>
                </Field>
                <Field label="Notes (optional)">
                  <input type="text" value={periodForm.notes}
                    onChange={e => setPeriodForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Any notes for this period…" className={inputCls} />
                </Field>
              </div>

              {periodError && <p className="text-sm text-danger">{periodError}</p>}

              <div className="flex items-center gap-3">
                <button onClick={handleSavePeriod} disabled={periodSaving}
                  className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-60">
                  {periodSaving ? 'Saving…' : existingPeriodRow ? 'Update Period' : 'Save Period'}
                </button>
                {periodSaved && <span className="text-sm text-success font-medium">✓ Saved</span>}
              </div>
            </div>
          )}

          {/* Empty prompt — shown before a period is loaded */}
          {!periodFormVisible && !periodLoading && (
            <p className="text-sm text-gray-400 text-center py-4">
              Select a year and period above, then click <strong>Load Period</strong> to begin.
            </p>
          )}
        </div>

        {/* ── Section 3: Filing History ── */}
        {excisePeriods.filter(p => p.period_type === periodType).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-navy">Filing History</h3>
              <span className="text-xs text-gray-400">{currentFreq.charAt(0).toUpperCase() + currentFreq.slice(1)} periods</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Period', 'Taxable Bbl', 'Tax Owed', 'Cumulative YTD', 'Status', 'Filed Date', 'Paid Date', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {excisePeriods.filter(p => p.period_type === periodType).map(p => {
                    const taxable = Math.max(0,
                      (parseFloat(p.barrels_removed_sale)        || 0)
                      - (parseFloat(p.barrels_removed_export)      || 0)
                      - (parseFloat(p.barrels_removed_destruction) || 0)
                      - (parseFloat(p.barrels_transferred)         || 0)
                    )
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 font-medium text-navy whitespace-nowrap">{excisePeriodLabel(p)}</td>
                        <td className="px-3 py-3 text-gray-600">{taxable.toFixed(3)}</td>
                        <td className="px-3 py-3 font-semibold text-navy">{fmtCurrency(p.tax_owed)}</td>
                        <td className="px-3 py-3 text-gray-600">
                          {p.cumulative_barrels_ytd != null ? Number(p.cumulative_barrels_ytd).toFixed(3) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                            p.status === 'paid'     ? 'bg-green-100 text-green-700'
                            : p.status === 'filed'  ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>{p.status}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.filed_date)}</td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2 whitespace-nowrap">
                            {p.status === 'estimated' && (
                              <button onClick={() => handleMarkPeriodStatus(p.id, 'filed')}
                                className="text-xs text-blue-600 hover:underline">Mark Filed</button>
                            )}
                            {p.status !== 'paid' && (
                              <button onClick={() => handleMarkPeriodStatus(p.id, 'paid')}
                                className="text-xs text-success hover:underline">Mark Paid</button>
                            )}
                            <button onClick={() => {
                              setCalcYear(p.period_year)
                              setCalcPeriodNum(p.period_number)
                              loadExcisePeriod(p.period_year, p.period_number)
                            }} className="text-xs text-amber hover:underline">Edit</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Summary footer row */}
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <tr>
                    <td className="px-3 py-3 text-navy">{calcYear} Total</td>
                    <td className="px-3 py-3 text-navy">
                      {yearPeriods.reduce((s, p) => s + Math.max(0,
                        (parseFloat(p.barrels_removed_sale) || 0)
                        - (parseFloat(p.barrels_removed_export) || 0)
                        - (parseFloat(p.barrels_removed_destruction) || 0)
                        - (parseFloat(p.barrels_transferred) || 0)
                      ), 0).toFixed(3)} bbl
                    </td>
                    <td className="px-3 py-3 text-navy">{fmtCurrency(ytdTaxOwed)}</td>
                    <td className="px-3 py-3 text-gray-500">—</td>
                    <td colSpan={3} className="px-3 py-3 text-gray-600">
                      Paid: <span className="text-success">{fmtCurrency(ytdTaxPaid)}</span>
                      {ytdOutstanding > 0 && (
                        <span className="ml-3">Outstanding: <span className="text-danger">{fmtCurrency(ytdOutstanding)}</span></span>
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderDashboard() {
    if (!frequency) {
      return <FrequencySetupPrompt breweryId={brewery.id} onSaved={f => { setFrequency(f); loadAll() }} />
    }

    const currentPeriod = getCurrentPeriod(frequency)
    const periodStatus  = currentPeriod ? getPeriodStatus(currentPeriod, filedKeys) : null
    const daysUntilDue  = currentPeriod
      ? Math.ceil((currentPeriod.dueDate - new Date()) / 86400000)
      : null

    return (
      <div className="space-y-5">

        {/* ── Current Period Status ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Current Filing Period</p>
              <h3 className="text-lg font-bold text-navy">{currentPeriod?.label}</h3>
              <p className="text-sm text-gray-500 mt-1">
                Due by {currentPeriod ? fmtDate(toISO(currentPeriod.dueDate)) : '—'}
                {daysUntilDue != null && daysUntilDue >= 0
                  ? ` · ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} remaining`
                  : daysUntilDue != null ? ' · Overdue' : ''}
              </p>
            </div>
            {periodStatus && <StatusBadge status={periodStatus} />}
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            {periodStatus !== 'filed' && (
              <button onClick={markCurrentPeriodFiled} disabled={markingFiled}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
                {markingFiled ? 'Saving…' : '✓ Mark as Filed'}
              </button>
            )}
            <button onClick={() => { setActiveTab('payments'); openAddPayment() }}
              className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              + Add Payment for This Period
            </button>
          </div>
        </div>

        {/* ── Quick Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Payments This Year', value: yearFilings.length },
            { label: 'Tax Paid This Year',  value: fmtCurrency(totalPaidYear) },
            { label: 'Active COLAs',         value: colaList.filter(c => c.status === 'active').length },
            { label: 'Open Periods',          value: upcomingPeriods.filter(p => getPeriodStatus(p, filedKeys) !== 'filed').length },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-2xl font-bold text-navy">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── COLA Status Alert ── */}
        {colasNeedingReview.length > 0 && (
          <div className="rounded-xl border border-danger bg-red-50 px-4 py-3 flex items-center justify-between gap-4 flex-wrap text-sm">
            <div>
              <p className="font-semibold text-danger">⚠️ COLAs Require Attention</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {colasNeedingReview.length} COLA {colasNeedingReview.length !== 1 ? 'labels have' : 'label has'} an Under Review or Withdrawn status.
              </p>
            </div>
            <button onClick={() => setActiveTab('cola')}
              className="text-xs font-semibold text-danger hover:underline shrink-0">
              Review COLAs →
            </button>
          </div>
        )}

        {/* ── Rate Reference ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-navy mb-3">Federal Excise Tax Rate Reference</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase">Rate Tier</th>
                  <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase">Rate / Barrel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {TTB_RATES.map(r => (
                  <tr key={r.label}>
                    <td className="py-2.5 text-gray-700">{r.label}</td>
                    <td className="py-2.5 text-right font-semibold text-navy">{fmtCurrency(r.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Rates effective January 1, 2018 (Craft Beverage Modernization Act). Always verify current rates at{' '}
            <a href="https://www.ttb.gov" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">ttb.gov</a>{' '}
            before filing.
          </p>
        </div>

        {/* ── Upcoming Deadlines — only shows periods not yet filed or paid ── */}
        {upcomingPeriods.filter(p => !filedKeys.has(p.key)).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-navy mb-3">Upcoming Filing Deadlines</h3>
            <div className="space-y-3">
              {upcomingPeriods.filter(p => !filedKeys.has(p.key)).map(p => {
                const st   = getPeriodStatus(p, filedKeys)
                const days = Math.ceil((p.dueDate - new Date()) / 86400000)
                return (
                  <div key={p.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-navy">{p.label}</p>
                      <p className="text-xs text-gray-500">{p.dates} · Due {fmtDate(toISO(p.dueDate))}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {days >= 0 && (
                        <span className={`text-xs font-medium ${days <= 14 ? 'text-danger' : 'text-gray-500'}`}>
                          {days}d
                        </span>
                      )}
                      <StatusBadge status={st} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderPayments() {
    return (
      <div className="space-y-5">
        {paymentDraft.hasDraft && !showPayment && (
          <DraftNoticeBar
            onContinue={() => { setEditPayment(null); setShowPayment(true) }}
            onDiscard={() => paymentDraft.clearDraft()}
          />
        )}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button onClick={openAddPayment}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                + Add Payment
              </button>
            </ReadOnlyTooltip>
            {filings.length > 0 && (
              <button onClick={exportPaymentsCsv}
                className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                Export CSV
              </button>
            )}
          </div>
        </div>

        {filings.length === 0 ? (
          <EmptyState icon="💳" title="No payments logged yet"
            message="Use the Add Payment button to record your first excise tax payment."
            action={<button onClick={openAddPayment}
              className="bg-amber text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
              + Add Payment
            </button>} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Period', 'Period Dates', 'Bbl Produced', 'Bbl Removed', 'Rate', 'Tax Calc.', 'Paid', 'Date', 'Method', 'Confirm #', 'Status', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filings.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 font-medium text-navy whitespace-nowrap">{f.period_label ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                        {f.period_start && f.period_end ? `${fmtDate(f.period_start)} – ${fmtDate(f.period_end)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-600">{fmtBarrels(f.barrels_produced)}</td>
                      <td className="px-3 py-3 text-gray-600">{fmtBarrels(f.barrels_removed)}</td>
                      <td className="px-3 py-3 text-gray-600">{f.tax_rate ? fmtCurrency(f.tax_rate) : '—'}</td>
                      <td className="px-3 py-3 text-gray-600">{fmtCurrency(f.tax_owed)}</td>
                      <td className="px-3 py-3 font-medium text-navy">{fmtCurrency(f.payment_amount)}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtDate(f.payment_date)}</td>
                      <td className="px-3 py-3 text-gray-600 capitalize">
                        {PAYMENT_METHODS.find(m => m.value === f.payment_method)?.label ?? f.payment_method ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-500 font-mono text-xs">{f.confirmation_number ?? '—'}</td>
                      <td className="px-3 py-3"><RowBadge status={f.status} /></td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEditPayment(f)}
                            className="text-xs text-amber hover:underline">Edit</button>
                          <button onClick={() => deletePayment(f.id)}
                            className="text-xs text-danger hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tax Calculator ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-navy mb-1">Excise Tax Estimator</h3>
          <p className="text-xs text-gray-400 mb-4">Estimate your tax before filing. For estimation only — verify at ttb.gov.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <Field label="Barrels Removed">
              <input type="number" min="0" step="0.01" value={calcBarrels}
                onChange={e => setCalcBarrels(e.target.value)}
                placeholder="0.00" className={inputCls} />
            </Field>
            <Field label="Rate Tier">
              <select value={calcTier} onChange={e => setCalcTier(e.target.value)} className={inputCls}>
                {TTB_RATES.map(r => (
                  <option key={r.rate} value={String(r.rate)}>{r.label} (${r.rate}/bbl)</option>
                ))}
              </select>
            </Field>
            <div className="bg-amber/10 rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Estimated Tax Owed</p>
              <p className="text-2xl font-bold text-navy">{fmtCurrency(calcEstimate)}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderCola() {
    const filteredCola = colaFilter === 'all'
      ? colaList
      : colaList.filter(c => c.status === colaFilter)

    const activeCount = colaList.filter(c => c.status === 'active').length

    return (
      <div className="space-y-5">
        {colaDraft.hasDraft && !showCola && (
          <DraftNoticeBar
            onContinue={() => { setEditCola(null); setShowCola(true) }}
            onDiscard={() => colaDraft.clearDraft()}
          />
        )}

        {colasNeedingReview.length > 0 && (
          <div className="rounded-xl border border-danger bg-red-50 px-4 py-3 text-sm">
            <p className="font-semibold text-danger">⚠️ COLAs Require Attention</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {colasNeedingReview.length} COLA {colasNeedingReview.length !== 1 ? 'labels have' : 'label has'} an Under Review or Withdrawn status — action may be required.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button onClick={openAddCola}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                + Add COLA Record
              </button>
            </ReadOnlyTooltip>
            {['all', 'active', 'under_review', 'superseded', 'withdrawn'].map(f => (
              <button key={f} onClick={() => setColaFilter(f)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  colaFilter === f
                    ? 'bg-navy text-white border-navy'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {f === 'all' ? 'All' : f === 'under_review' ? 'Under Review' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {colaList.length > 0 && (
            <span className="text-xs text-gray-400">
              {activeCount} active · {colaList.length} total
            </span>
          )}
        </div>

        {filteredCola.length === 0 ? (
          <EmptyState icon="🏷️" title={colaFilter === 'all' ? 'No COLA records yet' : `No ${colaFilter === 'under_review' ? 'under review' : colaFilter} records`}
            message="Track Certificate of Label Approvals, exemptions, formula approvals, and state brand registrations here."
            action={colaFilter === 'all'
              ? <button onClick={openAddCola}
                  className="bg-amber text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
                  + Add COLA Record
                </button>
              : null
            }
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Record Type', 'Brand Name', 'Product / Beer', 'Container', 'COLA #', 'ABV', 'Status', 'Last Verified', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCola.map(c => {
                    const meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {}
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 text-gray-700 max-w-[180px]">
                          <span className="block truncate" title={c.record_type ?? ''}>{c.record_type ?? '—'}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{c.brand_name ?? '—'}</td>
                        <td className="px-3 py-3 font-medium text-navy">{c.beer_name}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{c.container_size ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-500 font-mono text-xs">{meta.cola_number ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-600">{meta.abv != null ? `${meta.abv}%` : '—'}</td>
                        <td className="px-3 py-3"><RowBadge status={c.status} /></td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                          {meta.last_verified_date ? fmtDate(meta.last_verified_date) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEditCola(c)}
                              className="text-xs text-amber hover:underline">Edit</button>
                            <button onClick={() => deleteCola(c.id)}
                              className="text-xs text-danger hover:underline">Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner message="Loading TTB tracker…" />

  const TABS = [
    { id: 'dashboard',          label: 'Filing Dashboard' },
    { id: 'excise_calculator',  label: 'Excise Tax Calculator' },
    { id: 'payments',           label: 'Excise Tax Log' },
    { id: 'cola',               label: 'COLA & Labels' },
  ]

  return (
    <div className="space-y-4">
      <DismissibleDisclaimer
        storageKey="disclaimer_ttb_dismissed"
        text="Tracking tool only — This app helps you organize and track your TTB obligations. It does not file, submit, or communicate with the TTB on your behalf. All actual filings and payments remain your sole responsibility. Always verify requirements directly at ttb.gov."
      />

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy">TTB Filing & Excise Tax Tracker</h2>
        {frequency && (
          <span className="text-xs text-gray-400 capitalize">
            Filing frequency: {frequency}
          </span>
        )}
      </div>

      {loadError && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{loadError}</div>
      )}

      {/* Tab bar — scrolls horizontally on mobile */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-gray-200 min-w-max">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-amber text-amber'
                  : 'border-transparent text-gray-500 hover:text-navy hover:border-gray-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'dashboard'         && renderDashboard()}
        {activeTab === 'excise_calculator' && renderExciseCalculator()}
        {activeTab === 'payments'          && renderPayments()}
        {activeTab === 'cola'              && renderCola()}
      </div>

      {/* Modals */}
      <AddPaymentModal
        isOpen={showPayment}
        onClose={closePayment}
        onSuccess={onPaymentSuccess}
        breweryId={brewery?.id}
        frequency={frequency}
        editing={editPayment}
        initialDraft={paymentDraft.loadDraft(false)}
        draftRestored={paymentDraft.draftRestored}
        onDismissDraft={paymentDraft.dismissDraftBanner}
        onSaveDraft={paymentDraft.saveDraft}
      />

      <AddColaModal
        isOpen={showCola}
        onClose={closeCola}
        onSuccess={onColaSuccess}
        breweryId={brewery?.id}
        editing={editCola}
        initialDraft={colaDraft.loadDraft(false)}
        draftRestored={colaDraft.draftRestored}
        onDismissDraft={colaDraft.dismissDraftBanner}
        onSaveDraft={colaDraft.saveDraft}
      />

    </div>
  )
}
