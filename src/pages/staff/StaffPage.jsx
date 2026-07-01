/**
 * StaffPage — Staff & Training
 *
 * Two tabs: "Staff & Certs" (summary cards, warning banners, search/filter
 * bar, and a responsive staff card grid — each card shows the staff
 * member's details and all of their certifications color-coded by
 * expiration status) and "Training" (training programs, assignments, and
 * completion records — see TrainingSection.jsx).
 */
import { useEffect, useState, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import ModalShell from '../../components/ModalShell'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import EmptyState from '../../components/EmptyState'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import TrainingSection from './TrainingSection'

// ── Constants ─────────────────────────────────────────────────────────────────

const STAFF_ROLE_GROUPS = [
  {
    group: 'PRODUCTION',
    roles: [
      'Owner / Co-Owner', 'General Manager', 'Brewery Manager',
      'Head Brewer / Brewmaster', 'Senior Brewer', 'Brewer', 'Assistant Brewer',
      'Cellar Technician', 'Packaging Technician', 'Lab Technician / QC Technician',
      'Maintenance Technician',
    ],
  },
  {
    group: 'TAPROOM & HOSPITALITY',
    roles: [
      'Taproom Manager', 'Bartender / Taproom Staff', 'Server / Wait Staff',
      'Host / Hostess', 'Tour Guide / Beer Educator', 'Event Coordinator',
      'Kitchen Manager', 'Chef', 'Line Cook', 'Kitchen Staff',
    ],
  },
  {
    group: 'SALES & DISTRIBUTION',
    roles: [
      'Sales Director', 'Sales Manager', 'Sales Representative',
      'Delivery Driver', 'Distribution Coordinator',
    ],
  },
  {
    group: 'ADMINISTRATIVE & MARKETING',
    roles: [
      'Marketing Manager', 'Social Media Manager', 'Graphic Designer',
      'Accountant / Bookkeeper', 'HR Manager', 'Administrative Assistant',
    ],
  },
  {
    group: 'OTHER',
    roles: ['Volunteer', 'Intern', 'Contractor', 'Other'],
  },
]

// Flat list of all roles for the filter dropdown
const ALL_ROLES = STAFF_ROLE_GROUPS.flatMap(g => g.roles)

const EMPLOYMENT_TYPES = [
  { value: 'full_time',  label: 'Full Time' },
  { value: 'part_time',  label: 'Part Time' },
  { value: 'seasonal',   label: 'Seasonal' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'volunteer',  label: 'Volunteer' },
  { value: 'intern',     label: 'Intern' },
]

const STAFF_STATUS_OPTIONS = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On Leave' },
]

const CERT_TYPE_GROUPS = [
  {
    group: 'ALCOHOL SERVICE',
    types: [
      'TIPS (Training for Intervention Procedures)',
      'ServSafe Alcohol',
      'BASSET (Illinois)',
      'RBS (California Responsible Beverage Service)',
      'TAM (Techniques of Alcohol Management — Nevada)',
      'State Alcohol Server Certification',
    ],
  },
  {
    group: 'FOOD SAFETY',
    types: [
      'ServSafe Food Handler',
      'ServSafe Food Manager',
      'FSMA Qualified Individual',
      'Food Handler Card / Health Department Certification',
    ],
  },
  {
    group: 'BEER KNOWLEDGE',
    types: [
      'Cicerone — Certified Beer Server (CBS)',
      'Cicerone — Certified Cicerone',
      'Cicerone — Advanced Cicerone',
      'Cicerone — Master Cicerone',
      'BJCP Beer Judge',
      'Brewers Association Certified Craft Beer Professional',
    ],
  },
  {
    group: 'SAFETY',
    types: [
      'OSHA 10-Hour General Industry',
      'OSHA 30-Hour General Industry',
      'Brewers Association Safety Certification',
      'CO2 Safety Training',
      'CPR / First Aid / AED',
      'Confined Space Entry Certification',
      'Forklift / Powered Industrial Truck',
      'Hazmat Handling (HAZWOPER)',
      'Lockout/Tagout (LOTO)',
    ],
  },
  {
    group: 'DRIVING & TRANSPORTATION',
    types: ['CDL Class A', 'CDL Class B', 'Clean Driving Record Verification'],
  },
  {
    group: 'PROFESSIONAL',
    types: [
      'Certified Brewmaster',
      'Diploma in Brewing (IBD)',
      'Certified Packaging Professional',
      'Notary Public',
    ],
  },
  {
    group: 'OTHER',
    types: ['Background Check Completed', 'Other (specify)'],
  },
]

const RENEWAL_PERIODS = [
  { value: '6',      label: '6 months' },
  { value: '12',     label: '1 year' },
  { value: '24',     label: '2 years' },
  { value: '36',     label: '3 years' },
  { value: '60',     label: '5 years' },
  { value: 'custom', label: 'Custom' },
]

const EMPTY_STAFF = {
  first_name: '', last_name: '', role: '', employment_type: 'full_time',
  status: 'active', start_date: '', end_date: '', phone: '', email: '',
  emergency_contact_name: '', emergency_contact_phone: '', notes: '',
}

const EMPTY_CERT = {
  staff_member_id: '', certification_name: '', custom_cert_name: '',
  certification_provider: '', certificate_number: '', completion_date: '',
  has_expiration: true, expiration_date: '', renewal_period_months: '', notes: '',
}

// ── Utility functions ─────────────────────────────────────────────────────────

// Returns 'current', 'expiring_soon' (≤60 days), 'expired', or 'no_expiry'
function getCertStatus(cert) {
  if (!cert.expiration_date) return 'no_expiry'
  const today   = new Date()
  const expDate = new Date(cert.expiration_date + 'T00:00:00')
  const days    = Math.floor((expDate - today) / (1000 * 60 * 60 * 24))
  if (days < 0)   return 'expired'
  if (days <= 60) return 'expiring_soon'
  return 'current'
}

// Formats YYYY-MM-DD as "Jan 5, 2026"
function fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Returns the display label for an employment_type value
function fmtEmploymentType(value) {
  return EMPLOYMENT_TYPES.find(t => t.value === value)?.label ?? value ?? ''
}

// Shared input style
const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber'

// Label + optional required star wrapper
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

// ── AddStaffModal ─────────────────────────────────────────────────────────────

function AddStaffModal({ isOpen, onClose, onSuccess, breweryId,
  initialDraft, draftRestored, onDismissDraft, onSaveDraft, editing }) {
  const [form, setForm]     = useState(EMPTY_STAFF)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isDirty = !editing && Object.entries(form).some(([k, v]) => v !== (EMPTY_STAFF[k] ?? ''))

  // Restore draft or editing data when modal opens; reset when it closes
  useEffect(() => {
    if (isOpen) {
      if (editing) {
        setForm({
          first_name:             editing.first_name ?? '',
          last_name:              editing.last_name ?? '',
          role:                   editing.role ?? '',
          employment_type:        editing.employment_type ?? 'full_time',
          status:                 editing.status ?? (editing.is_active ? 'active' : 'inactive'),
          start_date:             editing.start_date ?? '',
          end_date:               editing.end_date ?? '',
          phone:                  editing.phone ?? '',
          email:                  editing.email ?? '',
          emergency_contact_name:  editing.emergency_contact_name ?? '',
          emergency_contact_phone: editing.emergency_contact_phone ?? '',
          notes:                  editing.notes ?? '',
        })
      } else {
        setForm(initialDraft ?? EMPTY_STAFF)
      }
      setError('')
    }
  }, [isOpen, editing, initialDraft])

  // Auto-save draft whenever the form changes (add-mode only)
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
      brewery_id:              breweryId,
      first_name:              form.first_name.trim(),
      last_name:               form.last_name.trim(),
      role:                    form.role || null,
      employment_type:         form.employment_type || 'full_time',
      status:                  form.status || 'active',
      is_active:               form.status === 'active',
      start_date:              form.start_date || null,
      end_date:                form.end_date || null,
      phone:                   form.phone.trim() || null,
      email:                   form.email.trim() || null,
      emergency_contact_name:  form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      notes:                   form.notes.trim() || null,
    }

    const { error: err } = editing
      ? await supabase.from('staff_members').update(payload).eq('id', editing.id)
      : await supabase.from('staff_members').insert(payload)

    setSaving(false)
    if (err) { setError('Could not save staff member. Please try again.'); return }
    onSuccess()
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} isDirty={isDirty}
      draftRestored={draftRestored} onDismissDraft={onDismissDraft}
      title={editing ? 'Edit Staff Member' : 'Add Staff Member'} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-1">
        {error && <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First Name" required>
              <input type="text" required placeholder="Jane" value={form.first_name}
                onChange={e => setField('first_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Last Name" required>
              <input type="text" required placeholder="Smith" value={form.last_name}
                onChange={e => setField('last_name', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Role">
            <select value={form.role} onChange={e => setField('role', e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">Select role…</option>
              {STAFF_ROLE_GROUPS.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.roles.map(r => <option key={r} value={r}>{r}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Employment Type">
              <select value={form.employment_type} onChange={e => setField('employment_type', e.target.value)} className={`${inputCls} bg-white`}>
                {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => setField('status', e.target.value)} className={`${inputCls} bg-white`}>
                {STAFF_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Start Date">
              <input type="date" value={form.start_date}
                onChange={e => setField('start_date', e.target.value)} className={inputCls} />
            </Field>
            <Field label="End Date (optional — for seasonal/contract)">
              <input type="date" value={form.end_date}
                onChange={e => setField('end_date', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone">
              <input type="tel" placeholder="(555) 123-4567" value={form.phone}
                onChange={e => setField('phone', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" placeholder="jane@brewery.com" value={form.email}
                onChange={e => setField('email', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Emergency Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name">
                <input type="text" placeholder="Contact name" value={form.emergency_contact_name}
                  onChange={e => setField('emergency_contact_name', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Phone">
                <input type="tel" placeholder="(555) 999-0000" value={form.emergency_contact_phone}
                  onChange={e => setField('emergency_contact_phone', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          <Field label="Notes (optional)">
            <textarea rows={2} placeholder="Any notes about this staff member…" value={form.notes}
              onChange={e => setField('notes', e.target.value)} className={inputCls} />
          </Field>

          <button type="submit" disabled={saving || !form.first_name.trim() || !form.last_name.trim()}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Staff Member'}
          </button>
        </form>
      </div>
    </ModalShell>
  )
}

// ── AddCertificationModal ─────────────────────────────────────────────────────

function AddCertificationModal({ isOpen, onClose, onSuccess, breweryId, activeStaff,
  prefilledStaffId, initialDraft, draftRestored, onDismissDraft, onSaveDraft, editing }) {
  const [form, setForm]     = useState(EMPTY_CERT)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isDirty = !editing && Object.entries(form).some(([k, v]) => v !== (EMPTY_CERT[k] ?? ''))

  // Determine if the selected cert type is "Other (specify)"
  const isOther = form.certification_name === 'Other (specify)'

  // Restore draft or editing data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editing) {
        setForm({
          staff_member_id:       editing.staff_member_id ?? '',
          certification_name:    editing.certification_name ?? '',
          custom_cert_name:      '',
          certification_provider: editing.certification_provider ?? (editing.issuing_organization ?? ''),
          certificate_number:    editing.certificate_number ?? '',
          completion_date:       editing.completion_date ?? (editing.issue_date ?? ''),
          has_expiration:        !!editing.expiration_date,
          expiration_date:       editing.expiration_date ?? '',
          renewal_period_months: editing.renewal_period_months != null ? String(editing.renewal_period_months) : '',
          notes:                 editing.notes ?? '',
        })
      } else {
        const draft = initialDraft ?? EMPTY_CERT
        setForm({ ...draft, staff_member_id: draft.staff_member_id || prefilledStaffId || '' })
      }
      setError('')
    }
  }, [isOpen, editing, initialDraft, prefilledStaffId])

  // Auto-save draft whenever the form changes (add-mode only)
  useEffect(() => {
    if (!isOpen || editing) return
    onSaveDraft(form)
  }, [form, isOpen, editing])

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    // Resolve the final certification name (custom text for "Other (specify)")
    const finalName = isOther ? form.custom_cert_name.trim() : form.certification_name

    const payload = {
      brewery_id:             breweryId,
      staff_member_id:        form.staff_member_id,
      certification_name:     finalName,
      certification_type:     'other',  // generic category for compatibility with old schema
      certification_provider: form.certification_provider.trim() || null,
      issuing_organization:   form.certification_provider.trim() || null,  // keep old column in sync
      certificate_number:     form.certificate_number.trim() || null,
      completion_date:        form.completion_date || null,
      issue_date:             form.completion_date || null,  // keep old column in sync
      expiration_date:        form.has_expiration ? (form.expiration_date || null) : null,
      renewal_required:       form.has_expiration,
      renewal_period_months:  form.has_expiration && form.renewal_period_months && form.renewal_period_months !== 'custom'
        ? parseInt(form.renewal_period_months) : null,
      notes:                  form.notes.trim() || null,
      status:                 'active',
    }

    const { error: err } = editing
      ? await supabase.from('staff_certifications').update(payload).eq('id', editing.id)
      : await supabase.from('staff_certifications').insert(payload)

    setSaving(false)
    if (err) { setError('Could not save certification. Please try again.'); return }
    onSuccess()
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} isDirty={isDirty}
      draftRestored={draftRestored} onDismissDraft={onDismissDraft}
      title={editing ? 'Edit Certification' : 'Add Certification'} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-1">
        {error && <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">

          <Field label="Staff Member" required>
            <select required value={form.staff_member_id}
              onChange={e => setField('staff_member_id', e.target.value)}
              className={`${inputCls} bg-white`}
              disabled={!!prefilledStaffId && !editing}>
              <option value="">Select staff member…</option>
              {activeStaff.map(m => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}{m.role ? ` — ${m.role}` : ''}</option>
              ))}
            </select>
            {activeStaff.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Add a staff member first before logging a certification.</p>
            )}
          </Field>

          <Field label="Certification Type" required>
            <select required value={form.certification_name}
              onChange={e => setField('certification_name', e.target.value)}
              className={`${inputCls} bg-white`}>
              <option value="">Select certification…</option>
              {CERT_TYPE_GROUPS.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.types.map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          {isOther && (
            <Field label="Custom Certification Name" required>
              <input type="text" required placeholder="Enter certification name"
                value={form.custom_cert_name}
                onChange={e => setField('custom_cert_name', e.target.value)}
                className={inputCls} />
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Certification Provider / Issuing Organization">
              <input type="text" placeholder="e.g. National Restaurant Association"
                value={form.certification_provider}
                onChange={e => setField('certification_provider', e.target.value)}
                className={inputCls} />
            </Field>
            <Field label="Certificate Number (optional)">
              <input type="text" placeholder="e.g. CBS-123456"
                value={form.certificate_number}
                onChange={e => setField('certificate_number', e.target.value)}
                className={inputCls} />
            </Field>
          </div>

          <Field label="Completion Date / Issue Date">
            <input type="date" value={form.completion_date}
              onChange={e => setField('completion_date', e.target.value)} className={inputCls} />
          </Field>

          {/* Has Expiration toggle */}
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => setField('has_expiration', !form.has_expiration)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.has_expiration ? 'bg-amber' : 'bg-gray-200'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.has_expiration ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <label className="text-sm font-medium text-navy">Has Expiration Date</label>
          </div>

          {form.has_expiration && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Expiration Date">
                <input type="date" value={form.expiration_date}
                  onChange={e => setField('expiration_date', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Renewal Period">
                <select value={form.renewal_period_months}
                  onChange={e => setField('renewal_period_months', e.target.value)}
                  className={`${inputCls} bg-white`}>
                  <option value="">No renewal period set</option>
                  {RENEWAL_PERIODS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
            </div>
          )}

          <Field label="Notes (optional)">
            <textarea rows={2} placeholder="Any notes about this certification…"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              className={inputCls} />
          </Field>

          <button type="submit"
            disabled={saving || !form.staff_member_id || !form.certification_name || (isOther && !form.custom_cert_name.trim())}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Certification'}
          </button>
        </form>
      </div>
    </ModalShell>
  )
}

// ── Main StaffPage component ──────────────────────────────────────────────────

export default function StaffPage() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()
  const location = useLocation()

  // ── Page-level tab state (Staff & Certs vs Training) ─────────────────────
  const [activeTab, setActiveTab] = usePersistedTab('staff_page_active_tab', 'staff')

  // Deep-link support: dashboard widgets / onboarding tour can navigate here
  // with navigate('/staff', { state: { activeTab: 'training' } })
  useEffect(() => {
    if (location.state?.activeTab) setActiveTab(location.state.activeTab)
  }, [location.state])

  // ── Data state ───────────────────────────────────────────────────────────
  const [staffMembers,   setStaffMembers]   = useState([])
  const [certifications, setCertifications] = useState([])
  const [loading,        setLoading]        = useState(true)
  const [loadError,      setLoadError]      = useState('')

  // ── UI filter state ──────────────────────────────────────────────────────
  const [search,               setSearch]               = useState('')
  const [filterRole,           setFilterRole]           = useState('all')
  const [filterEmploymentType, setFilterEmploymentType] = useState('all')
  const [filterCertStatus,     setFilterCertStatus]     = useState('all')
  const [showInactive,         setShowInactive]         = useState(false)
  const [openMenuId,           setOpenMenuId]           = useState(null)

  // ── Modal state ──────────────────────────────────────────────────────────
  const [showAddStaff,        setShowAddStaff]        = useState(false)
  const [editStaff,           setEditStaff]           = useState(null)
  const [showAddCert,         setShowAddCert]         = useState(false)
  const [editCert,            setEditCert]            = useState(null)
  const [prefilledStaffId,    setPrefilledStaffId]    = useState(null)
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState(null)

  // ── Draft hooks ──────────────────────────────────────────────────────────
  const staffDraft = useModalDraft('modal_draft_add_staff')
  const certDraft  = useModalDraft('modal_draft_add_cert')

  // Load all data when the brewery is known
  useEffect(() => {
    if (!brewery?.id) return
    loadAll()
  }, [brewery?.id])

  // Close the "More" dropdown when the user clicks anywhere outside it
  const menuRef = useRef(null)
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Fetch staff members and certifications in parallel
  async function loadAll() {
    setLoading(true)
    setLoadError('')
    const [staffRes, certRes] = await Promise.all([
      supabase.from('staff_members').select('*').eq('brewery_id', brewery.id)
        .order('first_name', { ascending: true }),
      supabase.from('staff_certifications').select('*').eq('brewery_id', brewery.id)
        .order('expiration_date', { ascending: true, nullsFirst: false }),
    ])
    if (staffRes.error || certRes.error) {
      setLoadError('Some data failed to load. Please refresh and try again.')
    }
    setStaffMembers(staffRes.data ?? [])
    setCertifications(certRes.data ?? [])
    setLoading(false)
  }

  // Build a fast lookup: staff_member_id → array of certifications
  const certsByMember = useMemo(() => {
    const map = {}
    for (const cert of certifications) {
      if (!map[cert.staff_member_id]) map[cert.staff_member_id] = []
      map[cert.staff_member_id].push(cert)
    }
    return map
  }, [certifications])

  // ── Summary stats (derived) ──────────────────────────────────────────────

  const activeStaff   = staffMembers.filter(m => (m.status ?? (m.is_active ? 'active' : 'inactive')) === 'active')
  const inactiveStaff = staffMembers.filter(m => (m.status ?? (m.is_active ? 'active' : 'inactive')) !== 'active')

  const staffWithExpired  = activeStaff.filter(m => (certsByMember[m.id] ?? []).some(c => getCertStatus(c) === 'expired')).length
  const staffWithExpiring = activeStaff.filter(m => (certsByMember[m.id] ?? []).some(c => getCertStatus(c) === 'expiring_soon')).length
  const staffAllCurrent   = activeStaff.filter(m => {
    const certs = certsByMember[m.id] ?? []
    return certs.length > 0 && certs.every(c => getCertStatus(c) === 'current' || getCertStatus(c) === 'no_expiry')
  }).length

  // ── Filtered staff list ──────────────────────────────────────────────────

  const filteredStaff = useMemo(() => {
    // Start from active staff only (inactive added below via toggle)
    let list = [...activeStaff]

    // Search by name
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m => `${m.first_name} ${m.last_name}`.toLowerCase().includes(q))
    }

    // Role filter
    if (filterRole !== 'all') {
      list = list.filter(m => m.role === filterRole)
    }

    // Employment type filter
    if (filterEmploymentType !== 'all') {
      list = list.filter(m => m.employment_type === filterEmploymentType)
    }

    // Certification status filter
    if (filterCertStatus !== 'all') {
      list = list.filter(m => {
        const certs = certsByMember[m.id] ?? []
        if (filterCertStatus === 'all_current')
          return certs.length > 0 && certs.every(c => getCertStatus(c) === 'current' || getCertStatus(c) === 'no_expiry')
        if (filterCertStatus === 'has_expiring')
          return certs.some(c => getCertStatus(c) === 'expiring_soon')
        if (filterCertStatus === 'has_expired')
          return certs.some(c => getCertStatus(c) === 'expired')
        return true
      })
    }

    return list
  }, [staffMembers, certsByMember, search, filterRole, filterEmploymentType, filterCertStatus])

  // ── Staff CRUD handlers ──────────────────────────────────────────────────

  function openAddStaff() {
    setEditStaff(null)
    setShowAddStaff(true)
  }
  function openEditStaff(member) {
    setEditStaff(member)
    setShowAddStaff(true)
  }
  function closeAddStaff() {
    if (!editStaff) staffDraft.clearDraft()
    setShowAddStaff(false)
    setEditStaff(null)
  }
  function onStaffSuccess() {
    staffDraft.clearDraft()
    setShowAddStaff(false)
    setEditStaff(null)
    loadAll()
  }

  // Update status to 'inactive' or 'active' without deleting the record
  async function handleSetStatus(member, newStatus) {
    await supabase.from('staff_members').update({
      status: newStatus,
      is_active: newStatus === 'active',
    }).eq('id', member.id)
    loadAll()
    setOpenMenuId(null)
  }

  // Permanently delete a staff member and their certifications (cascade)
  async function handleDeleteStaff(id) {
    if (!window.confirm('Delete this staff member and all their certifications? This cannot be undone.')) return
    await supabase.from('staff_members').delete().eq('id', id)
    setStaffMembers(prev => prev.filter(m => m.id !== id))
    setCertifications(prev => prev.filter(c => c.staff_member_id !== id))
    setConfirmDeleteStaffId(null)
    setOpenMenuId(null)
  }

  // ── Certification CRUD handlers ──────────────────────────────────────────

  function openAddCert(staffId = null) {
    setEditCert(null)
    setPrefilledStaffId(staffId)
    setShowAddCert(true)
  }
  function openEditCert(cert) {
    setEditCert(cert)
    setPrefilledStaffId(null)
    setShowAddCert(true)
  }
  function closeAddCert() {
    if (!editCert) certDraft.clearDraft()
    setShowAddCert(false)
    setEditCert(null)
    setPrefilledStaffId(null)
  }
  function onCertSuccess() {
    certDraft.clearDraft()
    setShowAddCert(false)
    setEditCert(null)
    setPrefilledStaffId(null)
    loadAll()
  }
  async function handleDeleteCert(id) {
    if (!window.confirm('Delete this certification? This cannot be undone.')) return
    await supabase.from('staff_certifications').delete().eq('id', id)
    setCertifications(prev => prev.filter(c => c.id !== id))
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner message="Loading staff & training…" />

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">Staff &amp; Training</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your team, certifications, and staff development in one place.</p>
        </div>
        {activeTab === 'staff' && (
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button onClick={openAddStaff}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
              + Add Staff Member
            </button>
          </ReadOnlyTooltip>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['staff', 'Staff & Certs'], ['training', 'Training']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key ? 'border-amber text-amber' : 'border-transparent text-gray-500 hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'training' && <TrainingSection />}

      {activeTab === 'staff' && (
      <>
      <DismissibleDisclaimer
        storageKey="disclaimer_staff_dismissed"
        text="Certification tracking is provided as a convenience only. Always verify staff certification requirements with your state licensing authority and consult legal counsel regarding compliance obligations."
      />

      {loadError && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={loadAll} className="underline font-medium">Retry</button>
        </div>
      )}

      {/* Draft notice for add-staff draft */}
      {staffDraft.hasDraft && !showAddStaff && (
        <DraftNoticeBar
          onContinue={() => { setEditStaff(null); setShowAddStaff(true) }}
          onDiscard={() => staffDraft.clearDraft()}
        />
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryStatCard
          value={activeStaff.length}
          label="Active Staff"
          color="text-navy"
        />
        <SummaryStatCard
          value={staffAllCurrent}
          label="All Certs Current"
          color="text-success"
          hide={staffAllCurrent === 0 && certifications.length === 0}
        />
        <SummaryStatCard
          value={staffWithExpiring}
          label="Expiring Soon"
          color={staffWithExpiring > 0 ? 'text-amber' : 'text-navy'}
        />
        <SummaryStatCard
          value={staffWithExpired}
          label="Expired Certs"
          color={staffWithExpired > 0 ? 'text-danger' : 'text-navy'}
        />
        <SummaryStatCard
          value={certifications.length}
          label="Total Certs Tracked"
          color="text-navy"
        />
      </div>

      {/* ── Warning banners ── */}
      {staffWithExpired > 0 && (
        <div className="bg-red-50 border border-danger rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-4">
          <p className="text-danger font-semibold">
            {staffWithExpired} staff member{staffWithExpired !== 1 ? 's have' : ' has'} expired certifications requiring immediate attention.
          </p>
          <button onClick={() => setFilterCertStatus('has_expired')}
            className="text-xs font-semibold text-danger underline shrink-0">
            Filter →
          </button>
        </div>
      )}
      {staffWithExpiring > 0 && (
        <div className="bg-amber/10 border border-amber/40 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-4">
          <p className="text-amber-dark font-semibold">
            {staffWithExpiring} staff member{staffWithExpiring !== 1 ? 's have' : ' has'} certifications expiring within 60 days.
          </p>
          <button onClick={() => setFilterCertStatus('has_expiring')}
            className="text-xs font-semibold text-amber underline shrink-0">
            Filter →
          </button>
        </div>
      )}

      {/* ── Search and filter bar ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <input type="search" placeholder="Search by name…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber w-48" />

        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="all">All Roles</option>
          {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={filterEmploymentType} onChange={e => setFilterEmploymentType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="all">All Employment Types</option>
          {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <select value={filterCertStatus} onChange={e => setFilterCertStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="all">All Cert Status</option>
          <option value="all_current">All Current</option>
          <option value="has_expiring">Has Expiring</option>
          <option value="has_expired">Has Expired</option>
        </select>

        {(search || filterRole !== 'all' || filterEmploymentType !== 'all' || filterCertStatus !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterRole('all'); setFilterEmploymentType('all'); setFilterCertStatus('all') }}
            className="text-xs text-gray-500 hover:text-navy underline">
            Clear filters
          </button>
        )}
      </div>

      {/* ── Staff card grid ── */}
      {activeStaff.length === 0 ? (
        <EmptyState icon="👥" title="No staff members yet"
          message="Add your first staff member to start tracking your team and their certifications."
          action={<button onClick={openAddStaff}
            className="bg-amber text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
            + Add Staff Member
          </button>} />
      ) : filteredStaff.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No staff members match your current filters.</p>
          <button onClick={() => { setSearch(''); setFilterRole('all'); setFilterEmploymentType('all'); setFilterCertStatus('all') }}
            className="text-sm text-amber hover:underline mt-2">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map(member => (
            <StaffCard
              key={member.id}
              member={member}
              certs={certsByMember[member.id] ?? []}
              openMenuId={openMenuId}
              menuRef={menuRef}
              onEdit={() => openEditStaff(member)}
              onAddCert={() => openAddCert(member.id)}
              onToggleMenu={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
              onMarkInactive={() => handleSetStatus(member, 'inactive')}
              onMarkActive={() => handleSetStatus(member, 'active')}
              onDelete={() => handleDeleteStaff(member.id)}
              onEditCert={cert => openEditCert(cert)}
              onDeleteCert={cert => handleDeleteCert(cert.id)}
            />
          ))}
        </div>
      )}

      {/* ── Inactive staff toggle ── */}
      {inactiveStaff.length > 0 && (
        <div className="pt-1">
          <button onClick={() => setShowInactive(v => !v)}
            className="text-sm text-gray-500 hover:text-navy underline">
            {showInactive ? `Hide inactive staff (${inactiveStaff.length})` : `Show inactive staff (${inactiveStaff.length})`}
          </button>
          {showInactive && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactiveStaff.map(member => (
                <div key={member.id}
                  className="bg-gray-50 rounded-xl border border-gray-200 p-4 opacity-60 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy text-sm">{member.first_name} {member.last_name}
                      <span className="ml-2 text-xs text-gray-400 font-normal">(Inactive)</span>
                    </p>
                    {member.role && <p className="text-xs text-gray-500 mt-0.5">{member.role}</p>}
                  </div>
                  <button onClick={() => handleSetStatus(member, 'active')}
                    className="text-xs text-amber hover:underline font-medium shrink-0">
                    Reactivate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <AddStaffModal
        isOpen={showAddStaff}
        onClose={closeAddStaff}
        onSuccess={onStaffSuccess}
        breweryId={brewery?.id}
        editing={editStaff}
        initialDraft={staffDraft.loadDraft(false)}
        draftRestored={staffDraft.draftRestored}
        onDismissDraft={staffDraft.dismissDraftBanner}
        onSaveDraft={staffDraft.saveDraft}
      />

      <AddCertificationModal
        isOpen={showAddCert}
        onClose={closeAddCert}
        onSuccess={onCertSuccess}
        breweryId={brewery?.id}
        activeStaff={activeStaff}
        prefilledStaffId={prefilledStaffId}
        editing={editCert}
        initialDraft={certDraft.loadDraft(false)}
        draftRestored={certDraft.draftRestored}
        onDismissDraft={certDraft.dismissDraftBanner}
        onSaveDraft={certDraft.saveDraft}
      />
      </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Small colored stat card used in the summary row
function SummaryStatCard({ value, label, color, hide }) {
  if (hide) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1 leading-tight">{label}</p>
    </div>
  )
}

// Color config for each cert status — used in CertBadge
const CERT_STATUS_STYLE = {
  current:       { bg: 'bg-green-100',  text: 'text-green-700' },
  expiring_soon: { bg: 'bg-amber/10',   text: 'text-amber-dark' },
  expired:       { bg: 'bg-red-100',    text: 'text-danger' },
  no_expiry:     { bg: 'bg-gray-100',   text: 'text-gray-500' },
}

// Small inline badge for one certification on a staff card
function CertBadge({ cert, onEdit, onDelete }) {
  const status = getCertStatus(cert)
  const style  = CERT_STATUS_STYLE[status] ?? CERT_STATUS_STYLE.no_expiry
  const suffix = status === 'expiring_soon' ? ` · Exp: ${fmtDate(cert.expiration_date)}`
    : status === 'expired' ? ` · Expired ${fmtDate(cert.expiration_date)}`
    : ''

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${style.bg} ${style.text} group`}>
      <span className="font-medium truncate max-w-[160px]" title={cert.certification_name + suffix}>
        {cert.certification_name}{suffix}
      </span>
      <button onClick={onEdit} title="Edit" className="opacity-0 group-hover:opacity-100 hover:text-navy transition-opacity text-[10px]">✎</button>
      <button onClick={onDelete} title="Delete" className="opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity text-[10px]">✕</button>
    </div>
  )
}

// Individual staff card showing contact info, employment details, and certs
function StaffCard({ member, certs, openMenuId, menuRef, onEdit, onAddCert,
  onToggleMenu, onMarkInactive, onMarkActive, onDelete, onEditCert, onDeleteCert }) {
  const isMenuOpen  = openMenuId === member.id
  const memberStatus = member.status ?? (member.is_active ? 'active' : 'inactive')
  const isActive     = memberStatus === 'active'

  const hasCertIssues = certs.some(c => getCertStatus(c) === 'expired' || getCertStatus(c) === 'expiring_soon')
  const borderColor   = certs.some(c => getCertStatus(c) === 'expired') ? 'border-red-200'
    : hasCertIssues ? 'border-amber/40'
    : 'border-gray-200'

  return (
    <div className={`bg-white rounded-xl border p-4 flex flex-col gap-3 relative ${borderColor}`}>
      {/* Header row: name + status dot */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-navy text-base leading-tight">{member.first_name} {member.last_name}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {member.role && (
              <span className="text-xs bg-amber/10 text-amber font-medium px-2 py-0.5 rounded-full">
                {member.role}
              </span>
            )}
            {member.employment_type && member.employment_type !== 'full_time' && (
              <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full">
                {fmtEmploymentType(member.employment_type)}
              </span>
            )}
          </div>
        </div>
        {/* Active / inactive indicator dot */}
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${isActive ? 'bg-green-400' : 'bg-gray-300'}`}
          title={isActive ? 'Active' : memberStatus === 'on_leave' ? 'On Leave' : 'Inactive'} />
      </div>

      {/* Contact info */}
      <div className="space-y-0.5">
        {member.start_date && (
          <p className="text-xs text-gray-500">Started: {fmtDate(member.start_date)}</p>
        )}
        {member.phone && <p className="text-xs text-gray-500">📞 {member.phone}</p>}
        {member.email && <p className="text-xs text-gray-500 truncate">✉ {member.email}</p>}
      </div>

      {/* Certifications */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Certifications</p>
        {certs.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No certifications on file</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {certs.map(cert => (
              <CertBadge key={cert.id} cert={cert}
                onEdit={() => onEditCert(cert)}
                onDelete={() => onDeleteCert(cert)} />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-gray-100 pt-3 mt-auto">
        <button onClick={onEdit}
          className="flex-1 border border-gray-300 text-gray-700 text-xs font-semibold py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          ✎ Edit
        </button>
        <button onClick={onAddCert}
          className="flex-1 bg-amber hover:bg-amber-dark text-white text-xs font-semibold py-1.5 rounded-lg transition-colors">
          + Cert
        </button>

        {/* Three-dots "More" menu */}
        <div className="relative" ref={isMenuOpen ? menuRef : null}>
          <button onClick={onToggleMenu}
            className="px-2.5 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:bg-gray-50 transition-colors">
            ···
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 bottom-9 z-20 w-44 bg-white rounded-xl border border-gray-200 shadow-lg py-1 text-sm">
              {isActive ? (
                <button onClick={onMarkInactive}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700">
                  Mark Inactive
                </button>
              ) : (
                <button onClick={onMarkActive}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700">
                  Mark Active
                </button>
              )}
              <button onClick={onDelete}
                className="w-full text-left px-4 py-2 hover:bg-red-50 text-danger">
                Delete Staff Member
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
