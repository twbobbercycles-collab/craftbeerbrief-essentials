// TrainingPage v2.1 — Full Suite Staff Training & Development Tracker
/**
 * Tracks training programs, assignments, and staff completion records.
 * Three tabs: Programs (library) | Staff Records (matrix + log) | Compliance (gaps + export)
 *
 * v2.1 changes: staff dropdowns pull from Essentials staff_members table.
 * v2.0 changes: assignment support, Compliance tab crash fix (undefined STATUS_LABEL key).
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

const ROLE_LABELS = {
  owner:                'Owner',
  head_brewer:          'Head Brewer',
  assistant_brewer:     'Assistant Brewer',
  taproom_manager:      'Taproom Manager',
  taproom_staff:        'Taproom Staff',
  sales_representative: 'Sales Representative',
  operations_manager:   'Operations Manager',
  other:                'Other',
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-amber/40'
const LBL   = 'block text-xs font-semibold text-gray-500 mb-1'

const EMPTY_PROGRAM = {
  program_name: '', program_type: '', description: '', duration_hours: '',
  is_required: false, required_for_roles: '',
  renewal_required: false, renewal_period_months: '',
}

const EMPTY_RECORD = {
  staff_name: '', staff_role: '', program_id: '', program_name: '', program_type: '',
  completion_date: '', expiration_date: '', score: '', passed: true,
  trainer_name: '', certificate_number: '', notes: '',
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function futureDateStr(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000)
}

function computeExpiration(completionDate, months) {
  if (!completionDate || !months) return ''
  const d = new Date(completionDate + 'T00:00:00')
  d.setMonth(d.getMonth() + parseInt(months, 10))
  return d.toISOString().slice(0, 10)
}

// Generates a CSV string from all training records for export
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

  const [programs,      setPrograms]      = useState([])
  const [records,       setRecords]       = useState([])
  const [assignments,   setAssignments]   = useState([])
  const [staffMembers,  setStaffMembers]  = useState([])
  const [loading,       setLoading]       = useState(true)

  const [addProgramOpen, setAddProgramOpen] = useState(false)
  const [editProgram,    setEditProgram]    = useState(null)
  const [assignTarget,   setAssignTarget]   = useState(null)  // program to assign staff to
  const [addRecordOpen,  setAddRecordOpen]  = useState(false)
  const [prefillRecord,  setPrefillRecord]  = useState(null)
  const [editRecord,     setEditRecord]     = useState(null)

  // Load programs, records, assignments, and Essentials staff for this brewery
  const loadAll = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [progRes, recRes, assignRes, staffRes] = await Promise.all([
      supabase.from('training_programs').select('*').eq('brewery_id', brewery.id).order('program_name'),
      supabase.from('staff_training_records').select('*').eq('brewery_id', brewery.id).order('completion_date', { ascending: false }),
      supabase.from('training_assignments').select('*').eq('brewery_id', brewery.id).order('staff_name'),
      supabase.from('staff_members').select('id, first_name, last_name, role, is_active').eq('brewery_id', brewery.id).eq('is_active', true).order('first_name'),
    ])
    setPrograms(progRes.data ?? [])
    setRecords(recRes.data ?? [])
    setAssignments(assignRes.data ?? [])
    setStaffMembers(staffRes.data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  // Opens the Add Record modal with optional pre-fill (used by Compliance and matrix)
  function openAddRecord(prefill = null) {
    setPrefillRecord(prefill)
    setAddRecordOpen(true)
  }

  if (loading) return <LoadingSpinner message="Loading training data…" />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy">Staff Training & Development</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Track training programs, certifications, and development progress for your entire team.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['programs','Programs'],['staff-records','Staff Records'],['compliance','Compliance']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key ? 'border-amber text-amber' : 'border-transparent text-gray-500 hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'programs' && (
        <ProgramsTab
          programs={programs}
          records={records}
          assignments={assignments}
          staffMembers={staffMembers}
          brewery={brewery}
          onAdded={loadAll}
          addProgramOpen={addProgramOpen}
          setAddProgramOpen={setAddProgramOpen}
          editProgram={editProgram}
          setEditProgram={setEditProgram}
          assignTarget={assignTarget}
          setAssignTarget={setAssignTarget}
        />
      )}
      {activeTab === 'staff-records' && (
        <StaffRecordsTab
          programs={programs}
          records={records}
          assignments={assignments}
          staffMembers={staffMembers}
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
          assignments={assignments}
          staffMembers={staffMembers}
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

function ProgramsTab({ programs, records, assignments, staffMembers, brewery, onAdded, addProgramOpen, setAddProgramOpen, editProgram, setEditProgram, assignTarget, setAssignTarget }) {
  const today = todayStr()
  const in60  = futureDateStr(60)

  // Count distinct staff who have completed each program
  function completedCount(programId) {
    return new Set(records.filter(r => r.program_id === programId).map(r => r.staff_name)).size
  }

  // Count assignments for a program that are not yet excused
  function assignedCount(programId) {
    return assignments.filter(a => a.program_id === programId && a.status !== 'excused').length
  }

  const requiredCount    = programs.filter(p => p.is_required).length
  const expiringPrograms = new Set(records.filter(r => r.expiration_date && r.expiration_date > today && r.expiration_date <= in60).map(r => r.program_id)).size
  const overduePrograms  = new Set(records.filter(r => r.expiration_date && r.expiration_date < today).map(r => r.program_id)).size

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

      <div className="flex justify-end">
        <button onClick={() => setAddProgramOpen(true)} className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + Add Program
        </button>
      </div>

      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">🎓</p>
          <p className="text-sm">No training programs yet. Add your first program to start tracking staff development.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map(prog => (
            <div key={prog.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
              <div className="flex-1">
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
                {prog.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{prog.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                  {prog.duration_hours && <span>⏱ {prog.duration_hours}h</span>}
                  {prog.renewal_required && prog.renewal_period_months && <span>🔄 Every {prog.renewal_period_months}mo</span>}
                  {prog.required_for_roles && <span>👥 {prog.required_for_roles}</span>}
                </div>
                <div className="flex gap-4 text-xs text-gray-400 mt-2">
                  <span>{completedCount(prog.id)} completed</span>
                  {assignedCount(prog.id) > 0 && <span>{assignedCount(prog.id)} assigned</span>}
                </div>
              </div>

              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setEditProgram(prog)} className="text-xs text-amber font-semibold hover:underline">Edit</button>
                <button onClick={() => setAssignTarget(prog)} className="text-xs text-amber font-semibold hover:underline">Assign Staff</button>
                <DeleteProgramButton program={prog} onDeleted={onAdded} />
              </div>
            </div>
          ))}
        </div>
      )}

      <ProgramModal
        isOpen={addProgramOpen || !!editProgram}
        onClose={() => { setAddProgramOpen(false); setEditProgram(null) }}
        program={editProgram}
        brewery={brewery}
        onSaved={() => { setAddProgramOpen(false); setEditProgram(null); onAdded() }}
      />

      {/* Assign Staff modal — opens from "Assign Staff" on any program card */}
      <AssignStaffModal
        isOpen={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        program={assignTarget}
        assignments={assignments.filter(a => a.program_id === assignTarget?.id)}
        records={records}
        staffMembers={staffMembers}
        brewery={brewery}
        onSaved={() => { setAssignTarget(null); onAdded() }}
      />
    </div>
  )
}

// ── Assign Staff modal ────────────────────────────────────────────────────────

function AssignStaffModal({ isOpen, onClose, program, assignments, records, staffMembers, brewery, onSaved }) {
  // Build checklist: Essentials staff first, then any history-only names as a fallback section
  const knownStaff = useMemo(() => {
    // Primary: active staff from the Essentials staff_members table
    const systemNames = new Set(staffMembers.map(s => `${s.first_name} ${s.last_name}`))
    const fromSystem  = staffMembers.map(s => ({
      name: `${s.first_name} ${s.last_name}`,
      role: ROLE_LABELS[s.role] ?? s.role,
      fromSystem: true,
    }))
    // Fallback: names that appear in training history but not in the staff table
    const historyMap = {}
    ;[...records.map(r => ({ name: r.staff_name, role: r.staff_role || '' })),
      ...assignments.map(a => ({ name: a.staff_name, role: a.staff_role || '' }))
    ].forEach(({ name, role }) => {
      if (name && !systemNames.has(name) && !historyMap[name]) historyMap[name] = role
    })
    const fromHistory = Object.entries(historyMap)
      .map(([name, role]) => ({ name, role, fromSystem: false }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...fromSystem, ...fromHistory]
  }, [staffMembers, records, assignments])

  // Currently assigned staff names for this program (excluding excused)
  const currentlyAssigned = new Set(assignments.filter(a => a.status !== 'excused').map(a => a.staff_name))

  const [selected, setSelected]           = useState(new Set())
  const [requiredDate, setRequiredDate]   = useState('')
  const [newStaffName, setNewStaffName]   = useState('')
  const [newStaffRole, setNewStaffRole]   = useState('')
  const [saving, setSaving]               = useState(false)

  // Pre-select currently assigned staff when modal opens
  useEffect(() => {
    if (!isOpen) return
    setSelected(new Set(currentlyAssigned))
    setRequiredDate('')
    setNewStaffName('')
    setNewStaffRole('')
  }, [isOpen])

  function toggleStaff(name) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  // Add a manually typed staff name to the selection list
  function addManualStaff() {
    const name = newStaffName.trim()
    if (!name) return
    setSelected(prev => new Set([...prev, name]))
    setNewStaffName('')
    setNewStaffRole('')
  }

  async function handleSave() {
    if (!program) return
    setSaving(true)

    // Build the set of names to assign and names to remove
    const toAdd    = [...selected].filter(name => !currentlyAssigned.has(name))
    const toRemove = [...currentlyAssigned].filter(name => !selected.has(name))

    // Build role lookup from knownStaff
    const roleMap = Object.fromEntries(knownStaff.map(s => [s.name, s.role]))

    const inserts = toAdd.map(name => ({
      brewery_id:               brewery.id,
      program_id:               program.id,
      staff_name:               name,
      staff_role:               roleMap[name] || null,
      assigned_date:            todayStr(),
      required_completion_date: requiredDate || null,
      status:                   'assigned',
    }))

    // Use upsert to handle duplicates gracefully (unique index on brewery+program+staff_name)
    if (inserts.length > 0) {
      await supabase.from('training_assignments').upsert(inserts, { onConflict: 'brewery_id,program_id,staff_name' })
    }

    // Remove deselected assignments
    for (const name of toRemove) {
      await supabase
        .from('training_assignments')
        .delete()
        .eq('brewery_id', brewery.id)
        .eq('program_id', program.id)
        .eq('staff_name', name)
    }

    // If a required completion date was set, update all existing assignments for this program
    if (requiredDate) {
      await supabase
        .from('training_assignments')
        .update({ required_completion_date: requiredDate })
        .eq('brewery_id', brewery.id)
        .eq('program_id', program.id)
    }

    setSaving(false)
    onSaved()
  }

  if (!program) return null

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      isDirty={false}
      title={`Assign Staff — ${program.program_name}`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Select staff members who should complete this training. Assigned staff appear as "Pending" in the compliance view until they log a completion record.
        </p>

        {/* Required completion date for the whole group */}
        <div>
          <label className={LBL}>Required Completion Date (optional — applies to all assigned staff)</label>
          <input type="date" value={requiredDate} onChange={e => setRequiredDate(e.target.value)} className={INPUT} />
        </div>

        {/* Staff checklist — system staff first, then history-only fallback */}
        {knownStaff.length > 0 && (
          <div>
            <label className={LBL}>Staff Members</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {knownStaff.map(({ name, role, fromSystem }, idx) => {
                // Insert a divider before the first history-only entry
                const prevIsSystem = idx > 0 ? knownStaff[idx - 1].fromSystem : true
                const showDivider  = !fromSystem && prevIsSystem && knownStaff.some(s => s.fromSystem)
                return (
                  <div key={name}>
                    {showDivider && (
                      <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        Previous staff (from training history)
                      </div>
                    )}
                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selected.has(name)}
                        onChange={() => toggleStaff(name)}
                        className="accent-amber"
                      />
                      <span className="text-sm text-navy font-medium">{name}</span>
                      {role && <span className="text-xs text-gray-400">{role}</span>}
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Add a staff member not in the list */}
        <div>
          <label className={LBL}>Add staff member not listed above</label>
          <div className="flex gap-2">
            <input
              value={newStaffName}
              onChange={e => setNewStaffName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addManualStaff())}
              className={INPUT}
              placeholder="Staff name…"
            />
            <input
              value={newStaffRole}
              onChange={e => setNewStaffRole(e.target.value)}
              className={`${INPUT} w-32`}
              placeholder="Role"
            />
            <button type="button" onClick={addManualStaff} className="shrink-0 bg-amber text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-amber-dark">Add</button>
          </div>
          {/* Show manually added names not in knownStaff */}
          {[...selected].filter(n => !knownStaff.find(s => s.name === n)).map(name => (
            <div key={name} className="flex items-center gap-2 mt-1 text-sm text-navy">
              <span className="text-green-500 text-xs">✓</span>
              {name}
              <button onClick={() => toggleStaff(name)} className="text-xs text-gray-400 hover:text-danger">✕</button>
            </div>
          ))}
        </div>

        {selected.size > 0 && (
          <p className="text-xs text-gray-500">{selected.size} staff member{selected.size !== 1 ? 's' : ''} selected</p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Save Assignments'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Delete Program button — inline confirm ────────────────────────────────────

function DeleteProgramButton({ program, onDeleted }) {
  const [confirming, setConfirming] = useState(false)

  async function doDelete() {
    await supabase.from('training_programs').delete().eq('id', program.id)
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
    <button onClick={() => setConfirming(true)} className="text-xs text-gray-400 hover:text-danger hover:underline transition-colors">
      Delete
    </button>
  )
}

// ── Program modal (add / edit) ────────────────────────────────────────────────

function ProgramModal({ isOpen, onClose, program, brewery, onSaved }) {
  const isEdit = !!program
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft('modal_draft_training_program')

  const [form, setForm]     = useState(EMPTY_PROGRAM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

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
    const next = { ...form, [key]: val }
    setForm(next)
    if (!isEdit) saveDraft(next)
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
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
          <input type="checkbox" checked={form.renewal_required} onChange={e => setField('renewal_required', e.target.checked)} className="accent-amber" />
          Renewal required
        </label>
        {form.renewal_required && (
          <div>
            <label className={LBL}>Renewal every (months)</label>
            <input type="number" min="1" value={form.renewal_period_months} onChange={e => setField('renewal_period_months', e.target.value)} className={INPUT} placeholder="e.g. 12" />
          </div>
        )}
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

function StaffRecordsTab({ programs, records, assignments, staffMembers, brewery, onAdded, addRecordOpen, openAddRecord, setAddRecordOpen, prefillRecord, editRecord, setEditRecord }) {
  const [searchStaff,   setSearchStaff]   = useState('')
  const [filterType,    setFilterType]    = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')

  const today = todayStr()
  const in60  = futureDateStr(60)

  const staffNames = useMemo(() => [...new Set(records.map(r => r.staff_name))].sort(), [records])

  // Required programs used for the matrix columns
  const requiredPrograms = useMemo(() => programs.filter(p => p.is_required), [programs])

  // All unique staff names from both records AND assignments (so assigned-but-not-started appear)
  const matrixStaff = useMemo(() => {
    const names = new Set([
      ...records.map(r => r.staff_name),
      ...assignments.map(a => a.staff_name),
    ])
    return [...names].sort()
  }, [records, assignments])

  // Returns the most recent completion record for a staff name + program id
  function latestRecord(staffName, programId) {
    return records
      .filter(r => r.staff_name === staffName && r.program_id === programId)
      .sort((a, b) => (b.completion_date ?? '').localeCompare(a.completion_date ?? ''))[0] ?? null
  }

  // Returns whether an assignment exists for staff + program
  function isAssigned(staffName, programId) {
    return assignments.some(a => a.staff_name === staffName && a.program_id === programId && a.status !== 'excused')
  }

  // Cell status: current | expiring | expired | pending (assigned, not done) | missing
  function cellStatus(staffName, programId) {
    const rec = latestRecord(staffName, programId)
    if (!rec) return isAssigned(staffName, programId) ? 'pending' : 'missing'
    if (!rec.expiration_date) return 'current'
    if (rec.expiration_date < today) return 'expired'
    if (rec.expiration_date <= in60) return 'expiring'
    return 'current'
  }

  const CELL_STYLES = {
    current:  { icon: '✓', cls: 'text-green-600 bg-green-50',    title: 'Completed — current' },
    expiring: { icon: '!', cls: 'text-amber bg-amber/10',         title: 'Expiring within 60 days' },
    expired:  { icon: '✗', cls: 'text-danger bg-red-50',          title: 'Expired' },
    pending:  { icon: 'A', cls: 'text-blue-600 bg-blue-50',       title: 'Assigned — not yet completed' },
    missing:  { icon: '—', cls: 'text-gray-300 bg-gray-50',       title: 'Not assigned or completed' },
  }

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (searchStaff && !r.staff_name.toLowerCase().includes(searchStaff.toLowerCase())) return false
      if (filterType && r.program_type !== filterType) return false
      if (filterStatus) {
        const du = daysUntil(r.expiration_date)
        if (filterStatus === 'current'  && !(r.expiration_date == null || (du != null && du > 60))) return false
        if (filterStatus === 'expiring' && !(du != null && du >= 0 && du <= 60)) return false
        if (filterStatus === 'expired'  && !(du != null && du < 0)) return false
      }
      return true
    })
  }, [records, searchStaff, filterType, filterStatus])

  return (
    <div className="space-y-5">
      {/* Training matrix */}
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
                  <td className="py-2 pr-4 font-medium text-navy">{name}</td>
                  {requiredPrograms.map(prog => {
                    const status = cellStatus(name, prog.id)
                    const { icon, cls, title } = CELL_STYLES[status]
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
            <span><span className="text-amber font-bold">!</span> Expiring (&lt;60d)</span>
            <span><span className="text-danger font-bold">✗</span> Expired</span>
            <span><span className="text-blue-600 font-bold">A</span> Assigned / Pending</span>
            <span><span className="text-gray-300 font-bold">—</span> Not assigned</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={searchStaff} onChange={e => setSearchStaff(e.target.value)} placeholder="Search by staff name…" className={`${INPUT} max-w-xs`} />
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
        <button onClick={() => openAddRecord()} className="ml-auto bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + Add Record
        </button>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">{records.length === 0 ? 'No training records yet. Add a record to start tracking completions.' : 'No records match your filters.'}</p>
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
                          : <span className="text-gray-400">No expiry</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                        {rec.score != null ? rec.score : '—'}
                        {rec.score != null && (
                          <span className={`ml-1 text-[10px] font-semibold ${rec.passed ? 'text-green-600' : 'text-danger'}`}>
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

      <RecordModal
        isOpen={addRecordOpen || !!editRecord}
        onClose={() => { setAddRecordOpen(false); setEditRecord(null) }}
        record={editRecord}
        prefill={prefillRecord}
        programs={programs}
        staffNames={staffNames}
        staffMembers={staffMembers}
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
    <button onClick={() => setConfirming(true)} className="text-xs text-gray-400 hover:text-danger hover:underline transition-colors">Delete</button>
  )
}

// ── Record modal (add / edit) ─────────────────────────────────────────────────

function RecordModal({ isOpen, onClose, record, prefill, programs, staffNames, staffMembers, brewery, onSaved }) {
  const isEdit = !!record
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft('modal_draft_training_record')

  const [form,           setForm]           = useState(EMPTY_RECORD)
  const [staffSelectVal, setStaffSelectVal] = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  // Names in training history that aren't in the Essentials staff table
  const systemStaffNames  = useMemo(() => new Set(staffMembers.map(s => `${s.first_name} ${s.last_name}`)), [staffMembers])
  const historyOnlyNames  = useMemo(() => staffNames.filter(n => !systemStaffNames.has(n)), [staffNames, systemStaffNames])

  // Derive the correct select value for a given staff_name
  function deriveSelectVal(name) {
    if (!name) return ''
    if (systemStaffNames.has(name)) return name
    if (historyOnlyNames.includes(name)) return name
    return '__other__'
  }

  useEffect(() => {
    if (!isOpen) return
    if (isEdit) {
      const data = {
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
      }
      setForm(data)
      setStaffSelectVal(deriveSelectVal(record.staff_name))
    } else if (prefill) {
      setForm({ ...EMPTY_RECORD, ...prefill })
      setStaffSelectVal(deriveSelectVal(prefill.staff_name ?? ''))
    } else {
      const draft = loadDraft()
      if (draft) {
        setForm(draft)
        setStaffSelectVal(deriveSelectVal(draft.staff_name ?? ''))
      } else {
        setStaffSelectVal('')
      }
    }
  }, [isOpen])

  // Select a staff member from the dropdown; auto-fills role from the system table
  function handleStaffSelect(val) {
    setStaffSelectVal(val)
    if (val === '__other__') {
      setField('staff_name', '')
      setField('staff_role', '')
    } else if (val) {
      setField('staff_name', val)
      const sysMember = staffMembers.find(s => `${s.first_name} ${s.last_name}` === val)
      if (sysMember) setField('staff_role', ROLE_LABELS[sysMember.role] ?? sysMember.role)
    } else {
      setField('staff_name', '')
      setField('staff_role', '')
    }
  }

  function setField(key, val) {
    setForm(prev => {
      const next = { ...prev, [key]: val }
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

    // If this record completes an assignment, mark it as completed
    if (!isEdit && payload.program_id && payload.staff_name) {
      await supabase
        .from('training_assignments')
        .update({ status: 'completed' })
        .eq('brewery_id', brewery.id)
        .eq('program_id', payload.program_id)
        .eq('staff_name', payload.staff_name)
        .eq('status', 'assigned')
    }

    clearDraft()
    setForm(EMPTY_RECORD)
    setStaffSelectVal('')
    setSaving(false)
    onSaved()
  }

  function handleClose() {
    setForm(EMPTY_RECORD)
    setStaffSelectVal('')
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Staff Name *</label>
            <select value={staffSelectVal} onChange={e => handleStaffSelect(e.target.value)} className={INPUT}>
              <option value="">Select staff member…</option>
              {staffMembers.map(s => {
                const fullName = `${s.first_name} ${s.last_name}`
                return (
                  <option key={s.id} value={fullName}>
                    {fullName} — {ROLE_LABELS[s.role] ?? s.role}
                  </option>
                )
              })}
              {historyOnlyNames.length > 0 && (
                <option disabled>── Previous staff ──</option>
              )}
              {historyOnlyNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="__other__">Other (type manually)…</option>
            </select>
            {staffSelectVal === '__other__' && (
              <input
                value={form.staff_name}
                onChange={e => setField('staff_name', e.target.value)}
                className={`${INPUT} mt-2`}
                placeholder="Enter staff name…"
              />
            )}
          </div>
          <div>
            <label className={LBL}>Role</label>
            <input value={form.staff_role} onChange={e => setField('staff_role', e.target.value)} className={INPUT} placeholder="e.g. Taproom Staff" />
          </div>
        </div>
        <div>
          <label className={LBL}>Training Program *</label>
          <select value={form.program_id} onChange={e => setField('program_id', e.target.value)} className={INPUT}>
            <option value="">Select a program…</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.program_name}</option>)}
          </select>
          {!form.program_id && (
            <input value={form.program_name} onChange={e => setField('program_name', e.target.value)} className={`${INPUT} mt-2`} placeholder="Or type program name manually…" />
          )}
        </div>
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

function ComplianceTab({ programs, records, assignments, staffMembers, openAddRecord, addRecordOpen, setAddRecordOpen, prefillRecord, brewery, onAdded }) {
  const today = todayStr()
  const in60  = futureDateStr(60)

  // All required programs — compliance is measured against these
  const requiredPrograms = useMemo(() => programs.filter(p => p.is_required), [programs])

  // Distinct staff from assignments (source of truth for "who should be trained")
  // Fall back to records if no assignments exist
  const assignedStaff = useMemo(() => {
    const fromAssignments = assignments.map(a => a.staff_name)
    const fromRecords     = records.map(r => r.staff_name)
    return [...new Set([...fromAssignments, ...fromRecords])].sort()
  }, [assignments, records])

  // Returns the most recent completion record for a staff name + program id
  function latestRecord(staffName, programId) {
    return records
      .filter(r => r.staff_name === staffName && r.program_id === programId)
      .sort((a, b) => (b.completion_date ?? '').localeCompare(a.completion_date ?? ''))[0] ?? null
  }

  // Returns whether staff has an active (non-excused) assignment for this program
  function hasAssignment(staffName, programId) {
    return assignments.some(a => a.staff_name === staffName && a.program_id === programId && a.status !== 'excused')
  }

  // Returns compliance status for one staff + program pair
  // 'current' | 'expiring' | 'expired' | 'pending' | 'missing'
  function pairStatus(staffName, program) {
    const rec = latestRecord(staffName, program.id)
    if (!rec) {
      return hasAssignment(staffName, program.id) ? 'pending' : 'missing'
    }
    if (!rec.expiration_date) return 'current'
    if (rec.expiration_date < today) return 'expired'
    if (rec.expiration_date <= in60) return 'expiring'
    return 'current'
  }

  // Worst-case compliance status per staff member across all required programs
  // Returns 'green' | 'amber' | 'red' — never returns undefined
  function staffOverallStatus(staffName) {
    if (requiredPrograms.length === 0) return 'green'
    const statuses = requiredPrograms.map(p => pairStatus(staffName, p))
    if (statuses.includes('expired') || statuses.includes('missing')) return 'red'
    if (statuses.includes('pending') || statuses.includes('expiring')) return 'amber'
    return 'green'
  }

  // Compliance rate: percentage of required-program slots that are 'current'
  const totalSlots   = assignedStaff.length * requiredPrograms.length
  const currentSlots = requiredPrograms.length === 0 ? 0 : assignedStaff.reduce(
    (sum, name) => sum + requiredPrograms.filter(p => pairStatus(name, p) === 'current').length,
    0
  )
  const complianceRate = totalSlots > 0 ? Math.round((currentSlots / totalSlots) * 100) : null

  // Expiring within 60 days
  const expiringSoon = useMemo(() =>
    records
      .filter(r => r.expiration_date && r.expiration_date > today && r.expiration_date <= in60)
      .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date))
  , [records, today, in60])

  // Expired records
  const expired = useMemo(() =>
    records
      .filter(r => r.expiration_date && r.expiration_date < today)
      .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date))
  , [records, today])

  // Pending: assigned but not yet completed, based on assignments table
  const pendingAssigned = useMemo(() => {
    return assignments
      .filter(a => a.status === 'assigned')
      .map(a => {
        const prog = programs.find(p => p.id === a.program_id)
        return { ...a, program_name: prog?.program_name ?? 'Unknown Program' }
      })
      .sort((a, b) => {
        // Sort overdue first (required_completion_date in the past), then by date
        const aOverdue = a.required_completion_date && a.required_completion_date < today
        const bOverdue = b.required_completion_date && b.required_completion_date < today
        if (aOverdue && !bOverdue) return -1
        if (!aOverdue && bOverdue) return 1
        return (a.required_completion_date ?? '9999').localeCompare(b.required_completion_date ?? '9999')
      })
  }, [assignments, programs, today])

  // Missing: required programs where a staff member has no assignment AND no record
  const missingRequired = useMemo(() => {
    const rows = []
    assignedStaff.forEach(name => {
      requiredPrograms.forEach(prog => {
        if (pairStatus(name, prog) === 'missing') {
          rows.push({ staff_name: name, program: prog })
        }
      })
    })
    return rows
  }, [assignedStaff, requiredPrograms, records, assignments])

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

  const STATUS_CARD  = { green: 'border-green-200 bg-green-50', amber: 'border-amber/40 bg-amber/10', red: 'border-red-200 bg-red-50' }
  const STATUS_LABEL = { green: { text: 'Compliant', cls: 'text-green-600' }, amber: { text: 'Needs attention', cls: 'text-amber' }, red: { text: 'Action required', cls: 'text-danger' } }
  const DOT_COLOR    = { current: 'bg-green-500', expiring: 'bg-amber', expired: 'bg-danger', pending: 'bg-blue-400', missing: 'bg-gray-300' }

  return (
    <div className="space-y-6">
      {/* Compliance rate header + export buttons */}
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
            <p className="text-sm text-gray-400 mt-1">
              {requiredPrograms.length === 0
                ? 'No required programs defined yet. Mark a program as "Required" on the Programs tab.'
                : 'Add training records to calculate compliance.'}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <button onClick={exportCsv} className="bg-navy hover:bg-navy/90 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">↓ Export CSV</button>
          <button onClick={() => openAddRecord()} className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">+ Add Record</button>
        </div>
      </div>

      {/* Empty state — no data at all */}
      {assignedStaff.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">No training data yet. Add programs, assign staff, and log completions to see compliance reporting here.</p>
        </div>
      )}

      {/* Staff compliance status cards */}
      {assignedStaff.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-navy mb-3">Staff Compliance Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assignedStaff.map(name => {
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
                        const st = pairStatus(name, prog)
                        return (
                          <span key={prog.id} className={`w-2 h-2 rounded-full ${DOT_COLOR[st] ?? 'bg-gray-300'}`} title={`${prog.program_name}: ${st}`} />
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

      {/* Pending assigned trainings (assigned but not yet completed) */}
      {pendingAssigned.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-blue-600 mb-3">Pending Assignments ({pendingAssigned.length})</h3>
          <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Staff</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Program</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Required By</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pendingAssigned.map(a => {
                    const du = daysUntil(a.required_completion_date)
                    const isOverdue = du != null && du < 0
                    return (
                      <tr key={a.id} className={isOverdue ? 'bg-red-50' : 'hover:bg-blue-50'}>
                        <td className="px-4 py-2.5 font-medium text-navy">{a.staff_name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{a.program_name}</td>
                        <td className={`px-4 py-2.5 text-xs hidden sm:table-cell ${isOverdue ? 'text-danger font-medium' : 'text-gray-500'}`}>
                          {a.required_completion_date ? `${fmtDate(a.required_completion_date)}${isOverdue ? ` (${Math.abs(du)}d overdue)` : du === 0 ? ' (today)' : ''}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => openAddRecord({ staff_name: a.staff_name, staff_role: a.staff_role ?? '', program_id: a.program_id, program_name: a.program_name })}
                            className="text-xs text-amber font-semibold hover:underline"
                          >
                            Log Completion
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Missing required trainings (no assignment AND no record) */}
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
                  {expired.map(rec => {
                    const du = daysUntil(rec.expiration_date)
                    return (
                      <tr key={rec.id} className="hover:bg-red-50">
                        <td className="px-4 py-2.5 font-medium text-navy">{rec.staff_name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{rec.program_name}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(rec.completion_date)}</td>
                        <td className="px-4 py-2.5 text-danger text-xs font-medium">
                          {fmtDate(rec.expiration_date)}
                          {du != null && <span className="ml-1">({Math.abs(du)}d ago)</span>}
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* All-clear state */}
      {assignedStaff.length > 0 && expiringSoon.length === 0 && expired.length === 0 && missingRequired.length === 0 && pendingAssigned.length === 0 && (
        <div className="bg-white rounded-xl border border-green-200 p-10 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm font-semibold text-green-600">All staff training is current. Great work!</p>
        </div>
      )}

      {/* RecordModal rendered here so Compliance-tab action buttons work */}
      <RecordModal
        isOpen={addRecordOpen}
        onClose={() => setAddRecordOpen(false)}
        record={null}
        prefill={prefillRecord}
        programs={programs}
        staffNames={[...new Set(records.map(r => r.staff_name))].sort()}
        staffMembers={staffMembers}
        brewery={brewery}
        onSaved={() => { setAddRecordOpen(false); onAdded() }}
      />
    </div>
  )
}
