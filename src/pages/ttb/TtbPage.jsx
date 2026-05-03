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
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import ModalShell from '../../components/ModalShell'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useModalDraft } from '../../hooks/useModalDraft'

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

const PAYMENT_METHODS = [
  { value: 'eft_ach', label: 'EFT/ACH' },
  { value: 'check',   label: 'Check' },
  { value: 'other',   label: 'Other' },
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
    paid:      'bg-green-100 text-green-700',
    pending:   'bg-orange-100 text-orange-700',
    overdue:   'bg-red-100 text-danger',
    amended:   'bg-purple-100 text-purple-700',
    approved:  'bg-green-100 text-green-700',
    rejected:  'bg-red-100 text-danger',
    withdrawn: 'bg-gray-100 text-gray-500',
    submitted: 'bg-blue-100 text-blue-700',
    draft:     'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

// ── AddPaymentModal ───────────────────────────────────────────────────────────

const EMPTY_PAYMENT = {
  period_label: '', period_start: '', period_end: '',
  barrels_produced: '', barrels_removed: '', tax_rate: '3.50',
  amount_paid: '', payment_date: '', payment_method: 'eft_ach',
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
          payment_method:      editing.payment_method ?? 'eft_ach',
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

// ── AddColaModal ──────────────────────────────────────────────────────────────

const EMPTY_COLA = {
  beer_name: '', brand_name: '', container_size: '12oz Can',
  submission_date: '', status: 'pending', approval_number: '',
  approval_date: '', rejection_reason: '', notes: '',
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
        setForm({
          beer_name:        editing.beer_name ?? '',
          brand_name:       editing.brand_name ?? '',
          container_size:   editing.container_size ?? '12oz Can',
          submission_date:  editing.submission_date ?? '',
          status:           editing.status ?? 'pending',
          approval_number:  editing.approval_number ?? '',
          approval_date:    editing.approval_date ?? '',
          rejection_reason: editing.rejection_reason ?? '',
          notes:            editing.notes ?? '',
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

    const payload = {
      brewery_id:       breweryId,
      beer_name:        form.beer_name.trim(),
      brand_name:       form.brand_name.trim() || null,
      container_size:   form.container_size || null,
      submission_date:  form.submission_date || null,
      status:           form.status,
      approval_number:  form.approval_number.trim() || null,
      approval_date:    form.status === 'approved' ? (form.approval_date || null) : null,
      rejection_reason: form.status === 'rejected' ? (form.rejection_reason.trim() || null) : null,
      notes:            form.notes.trim() || null,
    }

    const { error: err } = editing
      ? await supabase.from('cola_submissions').update(payload).eq('id', editing.id)
      : await supabase.from('cola_submissions').insert(payload)

    setSaving(false)
    if (err) { setError('Could not save COLA record. Please try again.'); return }
    onSuccess()
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} isDirty={!editing && isDirty}
      draftRestored={draftRestored} onDismissDraft={onDismissDraft}
      title={editing ? 'Edit COLA Record' : 'Add COLA Submission'} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-1">
        {error && <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Beer Name" required>
              <input type="text" required value={form.beer_name}
                onChange={e => setField('beer_name', e.target.value)}
                placeholder="e.g. Hazy Summer IPA" className={inputCls} />
            </Field>
            <Field label="Brand Name (optional)">
              <input type="text" value={form.brand_name}
                onChange={e => setField('brand_name', e.target.value)}
                placeholder="As shown on label" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Container Size" required>
              <select required value={form.container_size}
                onChange={e => setField('container_size', e.target.value)} className={inputCls}>
                {CONTAINER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Submission Date" required>
              <input type="date" required value={form.submission_date}
                onChange={e => setField('submission_date', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Status" required>
            <select required value={form.status}
              onChange={e => setField('status', e.target.value)} className={inputCls}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </Field>

          {/* Approval fields — only shown when status is 'approved' */}
          {form.status === 'approved' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Approval Number (optional)">
                <input type="text" value={form.approval_number}
                  onChange={e => setField('approval_number', e.target.value)}
                  placeholder="TTB approval number" className={inputCls} />
              </Field>
              <Field label="Approval Date (optional)">
                <input type="date" value={form.approval_date}
                  onChange={e => setField('approval_date', e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}

          {/* Rejection reason — only shown when status is 'rejected' */}
          {form.status === 'rejected' && (
            <Field label="Rejection Reason (optional)" extra={`${form.rejection_reason.length} / 500`}>
              <textarea maxLength={500} rows={2} value={form.rejection_reason}
                onChange={e => setField('rejection_reason', e.target.value)}
                placeholder="Reason provided by the TTB" className={inputCls} />
            </Field>
          )}

          <Field label="Notes (optional)" extra={`${form.notes.length} / 300`}>
            <textarea maxLength={300} rows={2} value={form.notes}
              onChange={e => setField('notes', e.target.value)} className={inputCls} />
          </Field>

          <button type="submit" disabled={saving}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add COLA'}
          </button>
        </form>
      </div>
    </ModalShell>
  )
}

// ── AddReportModal ────────────────────────────────────────────────────────────

const EMPTY_REPORT = {
  report_month: '', barrels_brewed: '', barrels_packaged: '',
  barrels_on_hand: '', barrels_removed: '', submission_date: '',
  status: 'draft', notes: '',
}

function AddReportModal({ isOpen, onClose, onSuccess, breweryId,
  initialDraft, draftRestored, onDismissDraft, onSaveDraft, editing }) {
  const [form, setForm]     = useState(EMPTY_REPORT)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isDirty = Object.entries(form).some(([k, v]) => v !== (EMPTY_REPORT[k] ?? ''))

  useEffect(() => {
    if (isOpen) {
      if (editing) {
        setForm({
          report_month:     editing.report_month ? editing.report_month.slice(0, 7) : '',
          barrels_brewed:   editing.barrels_brewed   != null ? String(editing.barrels_brewed)   : '',
          barrels_packaged: editing.barrels_packaged != null ? String(editing.barrels_packaged) : '',
          barrels_on_hand:  editing.barrels_on_hand  != null ? String(editing.barrels_on_hand)  : '',
          barrels_removed:  editing.barrels_removed  != null ? String(editing.barrels_removed)  : '',
          submission_date:  editing.submission_date ?? '',
          status:           editing.status ?? 'draft',
          notes:            editing.notes ?? '',
        })
      } else {
        setForm(initialDraft ?? EMPTY_REPORT)
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

    // Convert YYYY-MM month picker value to YYYY-MM-01 for the date column
    const reportMonthDate = form.report_month ? `${form.report_month}-01` : null

    const payload = {
      brewery_id:       breweryId,
      report_month:     reportMonthDate,
      barrels_brewed:   form.barrels_brewed   ? parseFloat(form.barrels_brewed)   : null,
      barrels_packaged: form.barrels_packaged ? parseFloat(form.barrels_packaged) : null,
      barrels_on_hand:  form.barrels_on_hand  ? parseFloat(form.barrels_on_hand)  : null,
      barrels_removed:  form.barrels_removed  ? parseFloat(form.barrels_removed)  : null,
      submission_date:  form.submission_date || null,
      status:           form.status,
      notes:            form.notes.trim() || null,
    }

    const { error: err } = editing
      ? await supabase.from('brewers_report_logs').update(payload).eq('id', editing.id)
      : await supabase.from('brewers_report_logs').insert(payload)

    setSaving(false)
    if (err) { setError('Could not save report. Please try again.'); return }
    onSuccess()
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} isDirty={!editing && isDirty}
      draftRestored={draftRestored} onDismissDraft={onDismissDraft}
      title={editing ? 'Edit Production Report' : 'Add Monthly Production Report'} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-1">
        {error && <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">

          <Field label="Report Month" required>
            <input type="month" required value={form.report_month}
              onChange={e => setField('report_month', e.target.value)} className={inputCls} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Barrels Brewed" required>
              <input type="number" min="0" step="0.01" required value={form.barrels_brewed}
                onChange={e => setField('barrels_brewed', e.target.value)}
                placeholder="0.00" className={inputCls} />
            </Field>
            <Field label="Barrels Packaged" required>
              <input type="number" min="0" step="0.01" required value={form.barrels_packaged}
                onChange={e => setField('barrels_packaged', e.target.value)}
                placeholder="0.00" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Barrels On Hand (end of month)" required>
              <input type="number" min="0" step="0.01" required value={form.barrels_on_hand}
                onChange={e => setField('barrels_on_hand', e.target.value)}
                placeholder="0.00" className={inputCls} />
            </Field>
            <Field label="Barrels Removed for Consumption" required>
              <input type="number" min="0" step="0.01" required value={form.barrels_removed}
                onChange={e => setField('barrels_removed', e.target.value)}
                placeholder="0.00" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Submission Date (optional)">
              <input type="date" value={form.submission_date}
                onChange={e => setField('submission_date', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Status" required>
              <select required value={form.status}
                onChange={e => setField('status', e.target.value)} className={inputCls}>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
              </select>
            </Field>
          </div>

          <Field label="Notes (optional)" extra={`${form.notes.length} / 300`}>
            <textarea maxLength={300} rows={2} value={form.notes}
              onChange={e => setField('notes', e.target.value)} className={inputCls} />
          </Field>

          <button type="submit" disabled={saving}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Report'}
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

// ── Main TtbPage component ────────────────────────────────────────────────────

export default function TtbPage() {
  const { brewery } = useAuth()

  // Data
  const [filings,       setFilings]       = useState([])
  const [colaList,      setColaList]      = useState([])
  const [reportLogs,    setReportLogs]    = useState([])
  const [filedPeriods,  setFiledPeriods]  = useState([])
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState('')

  // UI
  const [activeTab,     setActiveTab]     = useState(() => localStorage.getItem('ttb_active_tab') ?? 'dashboard')
  const [frequency,     setFrequency]     = useState(brewery?.ttb_filing_frequency ?? null)
  const [colaFilter,    setColaFilter]    = useState('all')
  const [calcBarrels,   setCalcBarrels]   = useState('')
  const [calcTier,      setCalcTier]      = useState('3.50')
  const [markingFiled,  setMarkingFiled]  = useState(false)

  // Modal visibility + editing targets
  const [showPayment,   setShowPayment]   = useState(false)
  const [showCola,      setShowCola]      = useState(false)
  const [showReport,    setShowReport]    = useState(false)
  const [editPayment,   setEditPayment]   = useState(null)
  const [editCola,      setEditCola]      = useState(null)
  const [editReport,    setEditReport]    = useState(null)

  // Draft hooks — one per modal
  const paymentDraft = useModalDraft('modal_draft_ttb_payment')
  const colaDraft    = useModalDraft('modal_draft_ttb_cola')
  const reportDraft  = useModalDraft('modal_draft_ttb_report')

  // Precompute the set of filed period keys for fast lookup
  const filedKeys = useMemo(
    () => new Set(filedPeriods.filter(p => p.status === 'filed').map(p => {
      // Reconstruct the key from period_start and period_end
      // Key format matches what getCurrentPeriod / getPastPeriods produces
      return p.period_label ? p.period_label.split(' (')[0] : ''
    })),
    [filedPeriods]
  )

  // Persist the active tab so it survives navigation away and back
  useEffect(() => {
    localStorage.setItem('ttb_active_tab', activeTab)
  }, [activeTab])

  // Load all data when the brewery is known
  useEffect(() => {
    if (!brewery?.id) return
    setFrequency(brewery.ttb_filing_frequency ?? null)
    loadAll()
  }, [brewery?.id])

  // Fetch all four data sets in parallel
  async function loadAll() {
    setLoading(true)
    setLoadError('')

    const [filingsRes, colaRes, reportsRes, periodsRes] = await Promise.all([
      supabase.from('ttb_filings').select('*')
        .eq('brewery_id', brewery.id).order('created_at', { ascending: false }),
      supabase.from('cola_submissions').select('*')
        .eq('brewery_id', brewery.id).order('submission_date', { ascending: false }),
      supabase.from('brewers_report_logs').select('*')
        .eq('brewery_id', brewery.id).order('report_month', { ascending: false }),
      supabase.from('ttb_filing_periods').select('*')
        .eq('brewery_id', brewery.id).order('period_start', { ascending: false }),
    ])

    if (filingsRes.error || colaRes.error || reportsRes.error || periodsRes.error) {
      setLoadError('Some data failed to load. Try refreshing the page.')
    }

    setFilings(filingsRes.data ?? [])
    setColaList(colaRes.data ?? [])
    setReportLogs(reportsRes.data ?? [])
    setFiledPeriods(periodsRes.data ?? [])
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

  // Delete helpers with optimistic removal
  async function deletePayment(id) {
    if (!window.confirm('Delete this payment record? This cannot be undone.')) return
    await supabase.from('ttb_filings').delete().eq('id', id)
    setFilings(prev => prev.filter(r => r.id !== id))
  }

  async function deleteCola(id) {
    if (!window.confirm('Delete this COLA record? This cannot be undone.')) return
    await supabase.from('cola_submissions').delete().eq('id', id)
    setColaList(prev => prev.filter(r => r.id !== id))
  }

  async function deleteReport(id) {
    if (!window.confirm('Delete this report? This cannot be undone.')) return
    await supabase.from('brewers_report_logs').delete().eq('id', id)
    setReportLogs(prev => prev.filter(r => r.id !== id))
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
  const pendingColas   = colaList.filter(c => c.status === 'pending').length
  const upcomingPeriods = getUpcomingPeriods(frequency, 3)

  const calcEstimate = useMemo(() => {
    const b = parseFloat(calcBarrels) || 0
    const r = parseFloat(calcTier) || 0
    return b * r
  }, [calcBarrels, calcTier])

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

  function openAddCola() {
    setEditCola(null)
    setShowCola(true)
  }
  function openEditCola(row) {
    setEditCola(row)
    setShowCola(true)
  }
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

  function openAddReport() {
    setEditReport(null)
    setShowReport(true)
  }
  function openEditReport(row) {
    setEditReport(row)
    setShowReport(true)
  }
  function closeReport() {
    if (!editReport) reportDraft.clearDraft()
    setShowReport(false)
    setEditReport(null)
  }
  function onReportSuccess() {
    reportDraft.clearDraft()
    setShowReport(false)
    setEditReport(null)
    loadAll()
  }

  // ── Tab content renderers ──────────────────────────────────────────────────

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
            { label: 'Pending COLAs',        value: pendingColas },
            { label: 'Open Periods',          value: upcomingPeriods.filter(p => getPeriodStatus(p, filedKeys) !== 'filed').length },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-2xl font-bold text-navy">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

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

        {/* ── Upcoming Deadlines ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-navy mb-3">Upcoming Filing Deadlines</h3>
          <div className="space-y-3">
            {upcomingPeriods.map(p => {
              const st   = getPeriodStatus(p, filedKeys)
              const days = Math.ceil((p.dueDate - new Date()) / 86400000)
              return (
                <div key={p.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-navy">{p.label}</p>
                    <p className="text-xs text-gray-500">{p.dates} · Due {fmtDate(toISO(p.dueDate))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {st !== 'filed' && days >= 0 && (
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
            <button onClick={openAddPayment}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              + Add Payment
            </button>
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
    const filtered = colaFilter === 'all'
      ? colaList
      : colaList.filter(c => c.status === colaFilter)

    return (
      <div className="space-y-4">
        {colaDraft.hasDraft && !showCola && (
          <DraftNoticeBar
            onContinue={() => { setEditCola(null); setShowCola(true) }}
            onDiscard={() => colaDraft.clearDraft()}
          />
        )}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <select value={colaFilter} onChange={e => setColaFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
            <option value="all">All Statuses</option>
            {['pending', 'approved', 'rejected', 'withdrawn'].map(s => (
              <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <button onClick={openAddCola}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Add COLA
          </button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="🏷️" title="No COLA submissions yet"
            message={colaFilter === 'all' ? 'Use the Add COLA button to start tracking label approvals.' : `No ${colaFilter} COLAs found.`}
            action={colaFilter === 'all' && (
              <button onClick={openAddCola}
                className="bg-amber text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
                + Add COLA
              </button>
            )} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Beer Name', 'Brand Name', 'Container', 'Submitted', 'Status', 'Approval #', 'Approved', 'Notes', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 font-medium text-navy">{c.beer_name}</td>
                      <td className="px-3 py-3 text-gray-600">{c.brand_name ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{c.container_size ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtDate(c.submission_date)}</td>
                      <td className="px-3 py-3"><RowBadge status={c.status} /></td>
                      <td className="px-3 py-3 text-gray-500 font-mono text-xs">{c.approval_number ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtDate(c.approval_date)}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs max-w-[150px] truncate">{c.notes ?? '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEditCola(c)}
                            className="text-xs text-amber hover:underline">Edit</button>
                          <button onClick={() => deleteCola(c.id)}
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
      </div>
    )
  }

  function renderReports() {
    return (
      <div className="space-y-4">
        {reportDraft.hasDraft && !showReport && (
          <DraftNoticeBar
            onContinue={() => { setEditReport(null); setShowReport(true) }}
            onDiscard={() => reportDraft.clearDraft()}
          />
        )}
        <div className="flex justify-end">
          <button onClick={openAddReport}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Add Report
          </button>
        </div>

        {reportLogs.length === 0 ? (
          <EmptyState icon="📋" title="No monthly reports logged"
            message="Use the Add Report button to start tracking your monthly TTB production reports."
            action={<button onClick={openAddReport}
              className="bg-amber text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
              + Add Report
            </button>} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Report Month', 'Bbl Brewed', 'Bbl Packaged', 'Bbl On Hand', 'Bbl Removed', 'Submitted', 'Status', 'Notes', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportLogs.map(r => {
                    const monthLabel = r.report_month
                      ? new Date(r.report_month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                      : '—'
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 font-medium text-navy whitespace-nowrap">{monthLabel}</td>
                        <td className="px-3 py-3 text-gray-600">{fmtBarrels(r.barrels_brewed)}</td>
                        <td className="px-3 py-3 text-gray-600">{fmtBarrels(r.barrels_packaged)}</td>
                        <td className="px-3 py-3 text-gray-600">{fmtBarrels(r.barrels_on_hand)}</td>
                        <td className="px-3 py-3 text-gray-600">{fmtBarrels(r.barrels_removed)}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.submission_date)}</td>
                        <td className="px-3 py-3"><RowBadge status={r.status} /></td>
                        <td className="px-3 py-3 text-gray-500 text-xs max-w-[150px] truncate">{r.notes ?? '—'}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEditReport(r)}
                              className="text-xs text-amber hover:underline">Edit</button>
                            <button onClick={() => deleteReport(r.id)}
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
    { id: 'dashboard', label: 'Filing Dashboard' },
    { id: 'payments',  label: 'Excise Tax Log' },
    { id: 'cola',      label: 'COLA Tracker' },
    { id: 'reports',   label: "Brewer's Report Log" },
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
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'payments'  && renderPayments()}
        {activeTab === 'cola'      && renderCola()}
        {activeTab === 'reports'   && renderReports()}
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

      <AddReportModal
        isOpen={showReport}
        onClose={closeReport}
        onSuccess={onReportSuccess}
        breweryId={brewery?.id}
        editing={editReport}
        initialDraft={reportDraft.loadDraft(false)}
        draftRestored={reportDraft.draftRestored}
        onDismissDraft={reportDraft.dismissDraftBanner}
        onSaveDraft={reportDraft.saveDraft}
      />
    </div>
  )
}
