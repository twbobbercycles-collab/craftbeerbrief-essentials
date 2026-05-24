// TrainingPage v1.0 — Full Suite Staff Training & Development Tracker
/**
 * Tracks internal training programs and staff completion records.
 * Three tabs: Programs (library) | Staff Records (matrix + log) | Compliance (gaps + export)
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { useModalDraft } from '../../hooks/useModalDraft'
import LoadingSpinner from '../../components/LoadingSpinner'

// ── Constants ─────────────────────────────────────────────────────────────────

const PROGRAM_TYPES = [
  'Safety', 'Compliance', 'Beer Knowledge', 'Customer Service',
  'Operations', 'Leadership', 'Food Safety', 'Alcohol Awareness', 'Equipment', 'Other',
]

const TYPE_COLORS = {
  'Safety':             'bg-red-100 text-red-700',
  'Compliance':         'bg-blue-100 text-blue-700',
  'Beer Knowledge':     'bg-amber/20 text-amber-dark',
  'Customer Service':   'bg-purple-100 text-purple-700',
  'Operations':         'bg-gray-100 text-gray-600',
  'Leadership':         'bg-indigo-100 text-indigo-700',
  'Food Safety':        'bg-green-100 text-green-700',
  'Alcohol Awareness':  'bg-orange-100 text-orange-700',
  'Equipment':          'bg-teal-100 text-teal-700',
  'Other':              'bg-gray-100 text-gray-500',
}

// Shared input and label styles
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-amber/40'
const LBL   = 'block text-xs font-semibold text-gray-500 mb-1'

// Empty form defaults for a new training program
const EMPTY_PROGRAM = {
  program_name: '', program_type: '', description: '', duration_hours: '',
  is_required: false, required_for_roles: '',
  renewal_required: false, renewal_period_months: '',
}

// Empty form defaults for a new training record
const EMPTY_RECORD = {
  staff_name: '', staff_role: '', program_id: '', program_name: '', program_type: '',
  completion_date: '', expiration_date: '', score: '', passed: true,
  trainer_name: '', certificate_number: '', notes: '',
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Formats a YYYY-MM-DD string as "May 24, 2026"
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Returns today as YYYY-MM-DD
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Returns a date string N days from today as YYYY-MM-DD
function futureDateStr(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

// Returns whole days between a date string and today (negative = past due)
function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000)
}

// Computes an expiration date from a completion date + renewal period in months
function computeExpiration(completionDate, months) {
  if (!completionDate || !months) return ''
  const d = new Date(completionDate + 'T00:00:00')
  d.setMonth(d.getMonth() + parseInt(months, 10))
  return d.toISOString().slice(0, 10)
}

// Converts the training records array to a CSV string for download
function recordsToCsv(records) {
  const headers = ['Staff Name','Role','Program','Type','Completion Date','Expiration Date','Score','Passed','Trainer','Certificate #','Notes']
  const rows = records.map(r => [
    r.staff_name, r.staff_role || '', r.program_name, r.program_type || '',
    r.completion_date || '', r.expiration_date || '',
    r.score != null ? r.score : '', r.passed ? 'Yes' : 'No',
    r.trainer_name || '', r.certificate_number || '', r.notes || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  return [headers.join(','), ...rows].join('\n')
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function TrainingPage() {
  return (
    <TierGate requiredTier="full_suite" featureKey="staff_training_tracker">
      <TrainingManager />
    </TierGate>
  )
}

// ── TrainingManager — root component inside the gate ──────────────────────────

function TrainingManager() {
  const { brewery } = useAuth()
  const [activeTab, setTab] = usePersistedTab('training_active_tab', 'programs')

  const [programs, setPrograms]   = useState([])
  const [records, setRecords]     = useState([])
  const [loading, setLoading]     = useState(true)

  // Modal open states
  const [addProgramOpen, setAddProgramOpen] = useState(false)
  const [editProgram, setEditProgram]       = useState(null)  // program object being edited
  const [addRecordOpen, setAddRecordOpen]   = useState(false)
  const [prefillRecord, setPrefillRecord]   = useState(null)  // partial record to pre-fill add modal
  const [editRecord, setEditRecord]         = useState(null)  // record object being edited

  // Load all programs and all training records for this brewery
  const loadAll = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [progRes, recRes] = await Promise.all([
      supabase
        .from('training_programs')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('program_name'),
      supabase
        .from('staff_training_records')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('completion_date', { ascending: false }),
    ])
    setPrograms(progRes.data ?? [])
    setRecords(recRes.data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  // Opens the Add Record modal with optional pre-filled fields (used by Compliance tab)
  function openAddRecord(prefill = null) {
    setPrefillRecord(prefill)
    setAddRecordOpen(true)
  }

  if (loading) return <LoadingSpinner message="Loading training data…" />

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-navy">Staff Training & Development</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Track training programs, certifications, and development progress for your entire team.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          ['programs',     'Programs'],
          ['staff-records','Staff Records'],
          ['compliance',   'Compliance'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-amber text-amber'
                : 'border-transparent text-gray-500 hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'programs' && (
        <ProgramsTab
          programs={programs}
          records={records}
          brewery={brewery}
          onAdded={loadAll}
          addProgramOpen={addProgramOpen}
          setAddProgramOpen={setAddProgramOpen}
          editProgram={editProgram}
          setEditProgram={setEditProgram}
        />
      )}
      {activeTab === 'staff-records' && (
        <StaffRecordsTab
          programs={programs}
          records={records}
          brewery={brewery}
          onAdded={loadAll}
          addRecordOpen={addRecordOpen}
          openAddRecord={openAddRecord}
          setAddRecordOpen={setAddRecordOpen}
          prefillRecord={prefillRecord}
          editRecord={editRecord}
          setEditRecord={setEditRecord}
        />
      )}
      {activeTab === 'compliance' && (
        <ComplianceTab
          programs={programs}
          records={records}
          openAddRecord={openAddRecord}
          addRecordOpen={addRecordOpen}
          setAddRecordOpen={setAddRecordOpen}
          prefillRecord={prefillRecord}
          brewery={brewery}
          onAdded={loadAll}
        />
      )}
    </div>
  )
}

// ── TAB 1: Programs ───────────────────────────────────────────────────────────

function ProgramsTab({ programs, records, brewery, onAdded, addProgramOpen, setAddProgramOpen, editProgram, setEditProgram }) {
  const today  = todayStr()
  const in60   = futureDateStr(60)

  // Count how many distinct staff have completed each program (any record, any date)
  function completedCount(programId) {
    const names = new Set(records.filter(r => r.program_id === programId).map(r => r.staff_name))
    return names.size
  }

  // Count required programs
  const requiredCount = programs.filter(p => p.is_required).length

  // Count programs where any staff has an expiring record in the next 60 days
  const expiringPrograms = new Set(
    records
      .filter(r => r.expiration_date && r.expiration_date > today && r.expiration_date <= in60)
      .map(r => r.program_id)
  ).size

  // Count programs where any staff has an overdue record (expiration_date < today)
  const overduePrograms = new Set(
    records
      .filter(r => r.expiration_date && r.expiration_date < today)
      .map(r => r.program_id)
  ).size

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Programs',       value: programs.length,   color: 'text-navy' },
          { label: 'Required Programs',    value: requiredCount,     color: 'text-navy' },
          { label: 'Programs w/ Expiring', value: expiringPrograms,  color: expiringPrograms > 0 ? 'text-amber' : 'text-navy' },
          { label: 'Programs w/ Overdue',  value: overduePrograms,   color: overduePrograms > 0 ? 'text-danger' : 'text-navy' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Add Program button */}
      <div className="flex justify-end">
        <button
          onClick={() => setAddProgramOpen(true)}
          className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Add Program
        </button>
      </div>

      {/* Program cards */}
      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">🎓</p>
          <p className="text-sm">No training programs yet. Add your first program to start tracking staff development.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map(prog => (
            <div key={prog.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy text-sm leading-tight">{prog.program_name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {prog.program_type && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[prog.program_type] ?? 'bg-gray-100 text-gray-500'}`}>
                        {prog.program_type}
                      </span>
                    )}
                    {prog.is_required && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">Required</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Details */}
              {prog.description && (
                <p className="text-xs text-gray-500 line-clamp-2">{prog.description}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {prog.duration_hours && <span>⏱ {prog.duration_hours}h</span>}
                {prog.renewal_required && prog.renewal_period_months && (
                  <span>🔄 Renews every {prog.renewal_period_months}mo</span>
                )}
                {prog.required_for_roles && (
                  <span>👥 {prog.required_for_roles}</span>
                )}
              </div>

              {/* Completion count */}
              <p className="text-xs text-gray-400">
                {completedCount(prog.id)} staff member{completedCount(prog.id) !== 1 ? 's' : ''} completed
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-1 border-t border-gray-100 mt-auto">
                <button
                  onClick={() => setEditProgram(prog)}
                  className="text-xs text-amber font-semibold hover:underline"
                >
                  Edit
                </button>
                <DeleteProgramButton program={prog} onDeleted={onAdded} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Program modal */}
      <ProgramModal
        isOpen={addProgramOpen || !!editProgram}
        onClose={() => { setAddProgramOpen(false); setEditProgram(null) }}
        program={editProgram}
        brewery={brewery}
        onSaved={() => { setAddProgramOpen(false); setEditProgram(null); onAdded() }}
      />
    </div>
  )
}

// ── Delete Program button — inline confirm ─────────────────────────────────────

function DeleteProgramButton({ program, onDeleted }) {
  const [confirming, setConfirming] = useState(false)

  async function doDelete() {
    await supabase.from('training_programs').delete().eq('id', program.id)
    onDeleted()
  }

  if (confirming) {
    return (
      <div className="flex gap-2 text-xs">
        <button onClick={doDelete} className="text-danger font-semibold hover:underline">Confirm delete</button>
        <button onClick={() => setConfirming(false)} className="text-gray-400 hover:underline">Cancel</button>
      </div>
    )
  }
  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-gray-400 hover:text-danger hover:underline transition-colors">
      Delete
    </button>
  )
}

// ── Program add / edit modal ──────────────────────────────────────────────────

function ProgramModal({ isOpen, onClose, program, brewery, onSaved }) {
  const isEdit = !!program
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft('modal_draft_training_program')

  const [form, setForm]     = useState(EMPTY_PROGRAM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // When modal opens: populate from the program being edited, or restore a draft
  useEffect(() => {
    if (!isOpen) return
    if (isEdit) {
      setForm({
        program_name:          program.program_name,
        program_type:          program.program_type ?? '',
        description:           program.description ?? '',
        duration_hours:        program.duration_hours ?? '',
        is_required:           program.is_required,
        required_for_roles:    program.required_for_roles ?? '',
        renewal_required:      program.renewal_required,
        renewal_period_months: program.renewal_period_months ?? '',
      })
    } else {
      const draft = loadDraft()
      if (draft) setForm(draft)
    }
  }, [isOpen])

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
    if (!isEdit) saveDraft({ ...form, [key]: val })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.program_name.trim()) { setError('Program name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      brewery_id:            brewery.id,
      program_name:          form.program_name.trim(),
      program_type:          form.program_type || null,
      description:           form.description || null,
      duration_hours:        form.duration_hours ? parseFloat(form.duration_hours) : null,
      is_required:           form.is_required,
      required_for_roles:    form.required_for_roles || null,
      renewal_required:      form.renewal_required,
      renewal_period_months: (form.renewal_required && form.renewal_period_months) ? parseInt(form.renewal_period_months, 10) : null,
    }
    const { error: err } = isEdit
      ? await supabase.from('training_programs').update(payload).eq('id', program.id)
      : await supabase.from('training_programs').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    clearDraft()
    setForm(EMPTY_PROGRAM)
    setSaving(false)
    onSaved()
  }

  function handleClose() {
    setForm(EMPTY_PROGRAM)
    if (!isEdit) clearDraft()
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      isDirty={!!form.program_name}
      title={isEdit ? 'Edit Training Program' : 'Add Training Program'}
      draftRestored={!isEdit && draftRestored}
      onDismissDraft={dismissDraftBanner}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className={LBL}>Program Name *</label>
          <input value={form.program_name} onChange={e => setField('program_name', e.target.value)} className={INPUT} placeholder="e.g. Responsible Alcohol Service" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Program Type</label>
            <select value={form.program_type} onChange={e => setField('program_type', e.target.value)} className={INPUT}>
              <option value="">Select…</option>
              {PROGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Duration (hours)</label>
            <input type="number" min="0" step="0.5" value={form.duration_hours} onChange={e => setField('duration_hours', e.target.value)} className={INPUT} placeholder="e.g. 4" />
          </div>
        </div>
        <div>
          <label className={LBL}>Description</label>
          <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={2} className={INPUT} />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={form.is_required} onChange={e => setField('is_required', e.target.checked)} className="accent-amber" />
            This is a required training
          </label>
          {form.is_required && (
            <div>
              <label className={LBL}>Required for roles (optional)</label>
              <input value={form.required_for_roles} onChange={e => setField('required_for_roles', e.target.value)} className={INPUT} placeholder="e.g. taproom_staff, taproom_manager" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={form.renewal_required} onChange={e => setField('renewal_required', e.target.checked)} className="accent-amber" />
            Renewal required
          </label>
          {form.renewal_required && (
            <div>
              <label className={LBL}>Renewal every (months)</label>
              <input type="number" min="1" value={form.renewal_period_months} onChange={e => setField('renewal_period_months', e.target.value)} className={INPUT} placeholder="e.g. 12 for annual" />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleClose} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Program'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── TAB 2: Staff Records ──────────────────────────────────────────────────────

function StaffRecordsTab({ programs, records, brewery, onAdded, addRecordOpen, openAddRecord, setAddRecordOpen, prefillRecord, editRecord, setEditRecord }) {
  const [searchStaff, setSearchStaff] = useState('')
  const [filterType, setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const today = todayStr()
  const in60  = futureDateStr(60)

  // Derive the unique staff name list from records (for autocomplete)
  const staffNames = useMemo(() => [...new Set(records.map(r => r.staff_name))].sort(), [records])

  // All required programs (used for the training matrix columns)
  const requiredPrograms = useMemo(() => programs.filter(p => p.is_required), [programs])

  // Apply filters to the full records list
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (searchStaff && !r.staff_name.toLowerCase().includes(searchStaff.toLowerCase())) return false
      if (filterType && r.program_type !== filterType) return false
      if (filterStatus) {
        if (filterStatus === 'current'    && !(r.expiration_date == null || r.expiration_date > in60)) return false
        if (filterStatus === 'expiring'   && !(r.expiration_date && r.expiration_date > today && r.expiration_date <= in60)) return false
        if (filterStatus === 'expired'    && !(r.expiration_date && r.expiration_date < today)) return false
      }
      return true
    })
  }, [records, searchStaff, filterType, filterStatus, today, in60])

  // Build the matrix: rows = unique staff names, columns = required programs
  // Each cell: most recent record for that staff × program combination
  const matrixStaff = useMemo(() => [...new Set(records.map(r => r.staff_name))].sort(), [records])

  // Returns the most recent record for a given staff name + program id
  function latestRecord(staffName, programId) {
    return records
      .filter(r => r.staff_name === staffName && r.program_id === programId)
      .sort((a, b) => (b.completion_date ?? '').localeCompare(a.completion_date ?? ''))
      [0] ?? null
  }

  // Determines the cell color/icon in the training matrix
  function cellStatus(record) {
    if (!record) return 'missing'
    if (!record.expiration_date) return 'current'   // no expiry = permanently valid
    if (record.expiration_date < today) return 'expired'
    if (record.expiration_date <= in60) return 'expiring'
    return 'current'
  }

  const CELL_STYLES = {
    current:  { icon: '✓', cls: 'text-green-600 bg-green-50' },
    expiring: { icon: '!', cls: 'text-amber bg-amber/10' },
    expired:  { icon: '✗', cls: 'text-danger bg-red-50' },
    missing:  { icon: '—', cls: 'text-gray-300 bg-gray-50' },
  }

  return (
    <div className="space-y-5">
      {/* Training matrix — only shown when there are required programs and staff records */}
      {requiredPrograms.length > 0 && matrixStaff.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold text-navy mb-4">Required Training Matrix</h3>
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left font-medium text-gray-500 pb-2 pr-4 min-w-[120px]">Staff</th>
                {requiredPrograms.map(p => (
                  <th key={p.id} className="text-center font-medium text-gray-500 pb-2 px-2 min-w-[90px]">
                    <span className="block truncate max-w-[80px]" title={p.program_name}>{p.program_name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {matrixStaff.map(name => (
                <tr key={name}>
                  <td className="py-2 pr-4 font-medium text-navy text-xs">{name}</td>
                  {requiredPrograms.map(prog => {
                    const rec = latestRecord(name, prog.id)
                    const status = cellStatus(rec)
                    const { icon, cls } = CELL_STYLES[status]
                    const title = rec
                      ? `Completed: ${rec.completion_date ?? '?'}${rec.expiration_date ? ` · Expires: ${rec.expiration_date}` : ''}`
                      : 'Not completed'
                    return (
                      <td key={prog.id} className="py-2 px-2 text-center" title={title}>
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-sm ${cls}`}>
                          {icon}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-400">
            <span><span className="text-green-600 font-bold">✓</span> Current</span>
            <span><span className="text-amber font-bold">!</span> Expiring within 60 days</span>
            <span><span className="text-danger font-bold">✗</span> Expired</span>
            <span><span className="text-gray-300 font-bold">—</span> Not completed</span>
          </div>
        </div>
      )}

      {/* Filters + Add button */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={searchStaff}
          onChange={e => setSearchStaff(e.target.value)}
          placeholder="Search by staff name…"
          className={`${INPUT} max-w-xs`}
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="">All types</option>
          {PROGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="">All statuses</option>
          <option value="current">Current</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
        </select>
        <button
          onClick={() => openAddRecord()}
          className="ml-auto bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Add Record
        </button>
      </div>

      {/* Records table */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">
            {records.length === 0
              ? 'No training records yet. Add a record to start tracking completions.'
              : 'No records match your filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Staff</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Program</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Completed</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Expires</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Score</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Cert #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRecords.map(rec => {
                  const du = daysUntil(rec.expiration_date)
                  const expClass = du == null ? '' : du < 0 ? 'text-danger font-medium' : du <= 60 ? 'text-amber font-medium' : 'text-gray-500'
                  return (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy">{rec.staff_name}</p>
                        {rec.staff_role && <p className="text-xs text-gray-400">{rec.staff_role}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-navy text-xs font-medium">{rec.program_name}</p>
                        {rec.program_type && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[rec.program_type] ?? 'bg-gray-100 text-gray-500'}`}>
                            {rec.program_type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">{fmtDate(rec.completion_date)}</td>
                      <td className={`px-4 py-3 text-xs hidden md:table-cell ${expClass}`}>
                        {rec.expiration_date
                          ? `${fmtDate(rec.expiration_date)}${du != null && du < 0 ? ' (expired)' : du != null && du <= 60 ? ` (${du}d)` : ''}`
                          : <span className="text-gray-400">No expiry</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                        {rec.score != null ? rec.score : '—'}
                        {rec.score != null && (
                          <span className={`ml-1 text-[10px] font-semibold px-1 py-0.5 rounded ${rec.passed ? 'text-green-600' : 'text-danger'}`}>
                            {rec.passed ? 'Pass' : 'Fail'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">{rec.certificate_number || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setEditRecord(rec)} className="text-xs text-amber font-semibold hover:underline">Edit</button>
                          <DeleteRecordButton record={rec} onDeleted={onAdded} />
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

      {/* Add / Edit Record modal */}
      <RecordModal
        isOpen={addRecordOpen || !!editRecord}
        onClose={() => { setAddRecordOpen(false); setEditRecord(null) }}
        record={editRecord}
        prefill={prefillRecord}
        programs={programs}
        staffNames={staffNames}
        brewery={brewery}
        onSaved={() => { setAddRecordOpen(false); setEditRecord(null); onAdded() }}
      />
    </div>
  )
}

// ── Delete Record button — inline confirm ─────────────────────────────────────

function DeleteRecordButton({ record, onDeleted }) {
  const [confirming, setConfirming] = useState(false)

  async function doDelete() {
    await supabase.from('staff_training_records').delete().eq('id', record.id)
    onDeleted()
  }

  if (confirming) {
    return (
      <div className="flex gap-2 text-xs">
        <button onClick={doDelete} className="text-danger font-semibold hover:underline">Confirm</button>
        <button onClick={() => setConfirming(false)} className="text-gray-400 hover:underline">Cancel</button>
      </div>
    )
  }
  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-gray-400 hover:text-danger transition-colors hover:underline">
      Delete
    </button>
  )
}

// ── Training Record add / edit modal ──────────────────────────────────────────

function RecordModal({ isOpen, onClose, record, prefill, programs, staffNames, brewery, onSaved }) {
  const isEdit = !!record
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft('modal_draft_training_record')

  const [form, setForm]     = useState(EMPTY_RECORD)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // When modal opens: populate from the record being edited, the pre-fill object, or a saved draft
  useEffect(() => {
    if (!isOpen) return
    if (isEdit) {
      setForm({
        staff_name:         record.staff_name,
        staff_role:         record.staff_role ?? '',
        program_id:         record.program_id ?? '',
        program_name:       record.program_name,
        program_type:       record.program_type ?? '',
        completion_date:    record.completion_date ?? '',
        expiration_date:    record.expiration_date ?? '',
        score:              record.score != null ? String(record.score) : '',
        passed:             record.passed,
        trainer_name:       record.trainer_name ?? '',
        certificate_number: record.certificate_number ?? '',
        notes:              record.notes ?? '',
      })
    } else if (prefill) {
      setForm({ ...EMPTY_RECORD, ...prefill })
    } else {
      const draft = loadDraft()
      if (draft) setForm(draft)
    }
  }, [isOpen])

  function setField(key, val) {
    setForm(prev => {
      const next = { ...prev, [key]: val }
      // When a program is selected, auto-fill program_name, program_type, and expiration_date
      if (key === 'program_id') {
        const prog = programs.find(p => p.id === val)
        if (prog) {
          next.program_name = prog.program_name
          next.program_type = prog.program_type ?? ''
          if (prog.renewal_required && prog.renewal_period_months && next.completion_date) {
            next.expiration_date = computeExpiration(next.completion_date, prog.renewal_period_months)
          }
        }
      }
      // When completion date changes, recalculate expiration if a program with renewal is selected
      if (key === 'completion_date') {
        const prog = programs.find(p => p.id === next.program_id)
        if (prog?.renewal_required && prog.renewal_period_months) {
          next.expiration_date = computeExpiration(val, prog.renewal_period_months)
        }
      }
      if (!isEdit) saveDraft(next)
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.staff_name.trim()) { setError('Staff name is required.'); return }
    if (!form.program_name.trim()) { setError('Program is required.'); return }
    setSaving(true); setError('')
    const payload = {
      brewery_id:         brewery.id,
      staff_name:         form.staff_name.trim(),
      staff_role:         form.staff_role || null,
      program_id:         form.program_id || null,
      program_name:       form.program_name.trim(),
      program_type:       form.program_type || null,
      completion_date:    form.completion_date || null,
      expiration_date:    form.expiration_date || null,
      score:              form.score !== '' ? parseFloat(form.score) : null,
      passed:             form.passed,
      trainer_name:       form.trainer_name || null,
      certificate_number: form.certificate_number || null,
      notes:              form.notes || null,
    }
    const { error: err } = isEdit
      ? await supabase.from('staff_training_records').update(payload).eq('id', record.id)
      : await supabase.from('staff_training_records').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    clearDraft()
    setForm(EMPTY_RECORD)
    setSaving(false)
    onSaved()
  }

  function handleClose() {
    setForm(EMPTY_RECORD)
    if (!isEdit) clearDraft()
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      isDirty={!!form.staff_name || !!form.program_name}
      title={isEdit ? 'Edit Training Record' : 'Add Training Record'}
      draftRestored={!isEdit && draftRestored}
      onDismissDraft={dismissDraftBanner}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSave} className="space-y-4">
        {/* Staff info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Staff Name *</label>
            {/* datalist provides autocomplete from existing staff names */}
            <input
              list="staff-names-list"
              value={form.staff_name}
              onChange={e => setField('staff_name', e.target.value)}
              className={INPUT}
              placeholder="Type name…"
              required
            />
            <datalist id="staff-names-list">
              {staffNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div>
            <label className={LBL}>Role</label>
            <input value={form.staff_role} onChange={e => setField('staff_role', e.target.value)} className={INPUT} placeholder="e.g. Taproom Staff" />
          </div>
        </div>

        {/* Program selection */}
        <div>
          <label className={LBL}>Training Program *</label>
          <select value={form.program_id} onChange={e => setField('program_id', e.target.value)} className={INPUT}>
            <option value="">Select a program…</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.program_name}</option>)}
          </select>
          {/* Manual entry if no program matches */}
          {!form.program_id && (
            <input
              value={form.program_name}
              onChange={e => setField('program_name', e.target.value)}
              className={`${INPUT} mt-2`}
              placeholder="Or type program name manually…"
            />
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Completion Date</label>
            <input type="date" value={form.completion_date} onChange={e => setField('completion_date', e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Expiration Date</label>
            <input type="date" value={form.expiration_date} onChange={e => setField('expiration_date', e.target.value)} className={INPUT} />
          </div>
        </div>

        {/* Score + pass/fail */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Score (optional)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.score} onChange={e => setField('score', e.target.value)} className={INPUT} placeholder="e.g. 87.5" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
              <input type="checkbox" checked={form.passed} onChange={e => setField('passed', e.target.checked)} className="accent-amber" />
              Passed
            </label>
          </div>
        </div>

        {/* Trainer + cert # */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Trainer Name</label>
            <input value={form.trainer_name} onChange={e => setField('trainer_name', e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Certificate #</label>
            <input value={form.certificate_number} onChange={e => setField('certificate_number', e.target.value)} className={INPUT} />
          </div>
        </div>

        <div>
          <label className={LBL}>Notes</label>
          <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} className={INPUT} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleClose} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── TAB 3: Compliance ─────────────────────────────────────────────────────────

function ComplianceTab({ programs, records, openAddRecord, addRecordOpen, setAddRecordOpen, prefillRecord, brewery, onAdded }) {
  const today = todayStr()
  const in60  = futureDateStr(60)

  // All required programs
  const requiredPrograms = useMemo(() => programs.filter(p => p.is_required), [programs])

  // All unique staff names across all records
  const allStaff = useMemo(() => [...new Set(records.map(r => r.staff_name))].sort(), [records])

  // For each staff member, find the most recent record per required program
  // Returns 'current' | 'expiring' | 'expired' | 'missing'
  function staffProgramStatus(staffName, program) {
    const matching = records
      .filter(r => r.staff_name === staffName && r.program_id === program.id)
      .sort((a, b) => (b.completion_date ?? '').localeCompare(a.completion_date ?? ''))
    const latest = matching[0]
    if (!latest) return 'missing'
    if (!latest.expiration_date) return 'current'
    if (latest.expiration_date < today) return 'expired'
    if (latest.expiration_date <= in60) return 'expiring'
    return 'current'
  }

  // Overall compliance status per staff member (worst-case across all required programs)
  function staffOverallStatus(staffName) {
    if (requiredPrograms.length === 0) return 'current'
    const statuses = requiredPrograms.map(p => staffProgramStatus(staffName, p))
    if (statuses.includes('missing') || statuses.includes('expired')) return 'red'
    if (statuses.includes('expiring')) return 'amber'
    return 'green'
  }

  // Count of all required-program slots that are current across all staff
  const totalSlots   = allStaff.length * requiredPrograms.length
  const currentSlots = allStaff.reduce((sum, name) =>
    sum + requiredPrograms.filter(p => staffProgramStatus(name, p) === 'current').length
  , 0)
  const complianceRate = totalSlots > 0 ? Math.round((currentSlots / totalSlots) * 100) : null

  // Records expiring in next 60 days, sorted soonest first
  const expiringSoon = useMemo(() =>
    records
      .filter(r => r.expiration_date && r.expiration_date > today && r.expiration_date <= in60)
      .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date))
  , [records, today, in60])

  // All expired records
  const expired = useMemo(() =>
    records
      .filter(r => r.expiration_date && r.expiration_date < today)
      .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date))
  , [records, today])

  // Staff with missing required trainings (no record at all for that program)
  const missingRequired = useMemo(() => {
    const rows = []
    allStaff.forEach(name => {
      requiredPrograms.forEach(prog => {
        if (staffProgramStatus(name, prog) === 'missing') {
          rows.push({ staff_name: name, program: prog })
        }
      })
    })
    return rows
  }, [allStaff, requiredPrograms, records])

  // Downloads all training records as a CSV file
  function exportCsv() {
    const csv = recordsToCsv(records)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `training-compliance-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const STATUS_CARD = {
    green: 'border-green-200 bg-green-50',
    amber: 'border-amber/40 bg-amber/10',
    red:   'border-red-200 bg-red-50',
  }
  const STATUS_LABEL = {
    green: { text: 'Compliant', cls: 'text-green-600' },
    amber: { text: 'Expiring soon', cls: 'text-amber' },
    red:   { text: 'Action required', cls: 'text-danger' },
  }

  return (
    <div className="space-y-6">
      {/* Overall compliance rate + export */}
      <div className="flex flex-wrap gap-4 items-start">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex-1 min-w-[200px]">
          <p className="text-xs text-gray-500 mb-1">Required Training Compliance Rate</p>
          {complianceRate != null ? (
            <>
              <p className={`text-4xl font-bold ${complianceRate >= 80 ? 'text-green-600' : complianceRate >= 60 ? 'text-amber' : 'text-danger'}`}>
                {complianceRate}%
              </p>
              <p className="text-xs text-gray-400 mt-1">{currentSlots} of {totalSlots} required training slots current</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">No required programs defined</p>
          )}
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={exportCsv}
            className="bg-navy hover:bg-navy/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            ↓ Export CSV
          </button>
          <button
            onClick={() => openAddRecord()}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            + Add Record
          </button>
        </div>
      </div>

      {/* Staff compliance status cards */}
      {allStaff.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-navy mb-3">Staff Compliance Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allStaff.map(name => {
              const overall = staffOverallStatus(name)
              const { text, cls } = STATUS_LABEL[overall]
              return (
                <div key={name} className={`rounded-xl border p-3 ${STATUS_CARD[overall]}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-navy text-sm">{name}</p>
                    <span className={`text-xs font-semibold ${cls}`}>{text}</span>
                  </div>
                  {requiredPrograms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {requiredPrograms.map(prog => {
                        const st = staffProgramStatus(name, prog)
                        const dot = st === 'current' ? 'bg-green-500' : st === 'expiring' ? 'bg-amber' : 'bg-danger'
                        return (
                          <span key={prog.id} className={`w-2 h-2 rounded-full ${dot}`} title={prog.program_name} />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Missing required trainings */}
      {missingRequired.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-danger mb-3">Missing Required Trainings ({missingRequired.length})</h3>
          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Staff</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Required Program</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {missingRequired.map(({ staff_name, program }) => (
                    <tr key={`${staff_name}-${program.id}`} className="hover:bg-red-50">
                      <td className="px-4 py-2.5 font-medium text-navy">{staff_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{program.program_name}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => openAddRecord({ staff_name, program_id: program.id, program_name: program.program_name, program_type: program.program_type ?? '' })}
                          className="text-xs text-amber font-semibold hover:underline"
                        >
                          Add Record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Expiring soon */}
      {expiringSoon.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber mb-3">Expiring Within 60 Days ({expiringSoon.length})</h3>
          <div className="bg-white rounded-xl border border-amber/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Staff</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Program</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Expires</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Days Left</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expiringSoon.map(rec => (
                    <tr key={rec.id} className="hover:bg-amber/5">
                      <td className="px-4 py-2.5 font-medium text-navy">{rec.staff_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{rec.program_name}</td>
                      <td className="px-4 py-2.5 text-amber font-medium text-xs">{fmtDate(rec.expiration_date)}</td>
                      <td className="px-4 py-2.5 text-amber font-bold">{daysUntil(rec.expiration_date)}d</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => openAddRecord({ staff_name: rec.staff_name, staff_role: rec.staff_role ?? '', program_id: rec.program_id ?? '', program_name: rec.program_name, program_type: rec.program_type ?? '' })}
                          className="text-xs text-amber font-semibold hover:underline"
                        >
                          Schedule Renewal
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Expired records */}
      {expired.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-danger mb-3">Expired Records ({expired.length})</h3>
          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Staff</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Program</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Last Completed</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Expired</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expired.map(rec => (
                    <tr key={rec.id} className="hover:bg-red-50">
                      <td className="px-4 py-2.5 font-medium text-navy">{rec.staff_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{rec.program_name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(rec.completion_date)}</td>
                      <td className="px-4 py-2.5 text-danger text-xs font-medium">
                        {fmtDate(rec.expiration_date)}
                        {daysUntil(rec.expiration_date) != null && (
                          <span className="ml-1">({Math.abs(daysUntil(rec.expiration_date))}d ago)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => openAddRecord({ staff_name: rec.staff_name, staff_role: rec.staff_role ?? '', program_id: rec.program_id ?? '', program_name: rec.program_name, program_type: rec.program_type ?? '' })}
                          className="text-xs text-amber font-semibold hover:underline"
                        >
                          Renew
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state when everything is compliant */}
      {expiringSoon.length === 0 && expired.length === 0 && missingRequired.length === 0 && allStaff.length > 0 && (
        <div className="bg-white rounded-xl border border-green-200 p-10 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm font-semibold text-green-600">All staff training is current. Great work!</p>
        </div>
      )}

      {allStaff.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">Add training records on the Staff Records tab to see compliance data here.</p>
        </div>
      )}

      {/* RecordModal rendered here too so the Compliance tab's "Add Record" / "Schedule Renewal" buttons work */}
      <RecordModal
        isOpen={addRecordOpen}
        onClose={() => setAddRecordOpen(false)}
        record={null}
        prefill={prefillRecord}
        programs={programs}
        staffNames={[...new Set(records.map(r => r.staff_name))].sort()}
        brewery={brewery}
        onSaved={() => { setAddRecordOpen(false); onAdded() }}
      />
    </div>
  )
}
