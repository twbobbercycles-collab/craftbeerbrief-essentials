/**
 * LocalPermitsPage — Local Permit & Municipal License Tracker.
 * Lets brewery owners track city/county permits with expiration dates,
 * renewal fees, and authority contact info. Supports filter by type and
 * status, sort order, expand-to-details cards, and archiving superseded
 * permits without losing the record.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useReadOnly } from '../../hooks/useReadOnly'

// ─── Constants ────────────────────────────────────────────────────────────────

const PERMIT_TYPES = [
  { value: 'business_license',   label: 'Business License' },
  { value: 'zoning',             label: 'Zoning' },
  { value: 'building',           label: 'Building' },
  { value: 'sign_permit',        label: 'Sign Permit' },
  { value: 'outdoor_seating',    label: 'Outdoor Seating' },
  { value: 'live_entertainment', label: 'Live Entertainment' },
  { value: 'noise_variance',     label: 'Noise Variance' },
  { value: 'parking',            label: 'Parking' },
  { value: 'fire_safety',        label: 'Fire Safety' },
  { value: 'food_service',       label: 'Food Service' },
  { value: 'special_event',      label: 'Special Event' },
  { value: 'sidewalk',           label: 'Sidewalk' },
  { value: 'other',              label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'all',           label: 'All Status' },
  { value: 'current',       label: 'Current' },
  { value: 'expired',       label: 'Expired' },
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'no_expiration', label: 'No Expiration' },
]

const SORT_OPTIONS = [
  { value: 'expiration_date',   label: 'Expiration Date' },
  { value: 'permit_name',       label: 'Permit Name' },
  { value: 'issuing_authority', label: 'Issuing Authority' },
]

// Placeholder text for the permit name field changes based on selected type
const PERMIT_NAME_PLACEHOLDERS = {
  business_license:   'e.g. City of [City] Business License 2026',
  zoning:             'e.g. Conditional Use Permit — Brewery Operations',
  building:           'e.g. Certificate of Occupancy',
  sign_permit:        'e.g. Exterior Sign Permit 2026',
  outdoor_seating:    'e.g. Outdoor Patio Permit 2026',
  live_entertainment: 'e.g. Live Entertainment Permit 2026',
  noise_variance:     'e.g. Noise Ordinance Variance',
  parking:            'e.g. Parking Variance Agreement',
  fire_safety:        'e.g. Annual Fire Safety Inspection Certificate',
  food_service:       'e.g. Local Food Service Permit 2026',
  special_event:      'e.g. Recurring Special Event Permit',
  sidewalk:           'e.g. Sidewalk Cafe Permit 2026',
  other:              'Enter permit name',
}

const EMPTY_FORM = {
  permit_name: '', permit_type: '', issuing_authority: '',
  authority_contact_name: '', authority_contact_email: '', authority_contact_phone: '',
  permit_number: '', issue_date: '', expiration_date: '',
  no_expiration: false, auto_renews: false,
  renewal_fee: '', renewal_notes: '', document_id: '', notes: '',
}

// ─── Utility functions ────────────────────────────────────────────────────────

// Returns 'expired', 'urgent' (≤30 days), 'warning' (≤90 days), or 'ok'
function getExpirationStatus(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.floor((exp - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0)   return 'expired'
  if (diffDays <= 30) return 'urgent'
  if (diffDays <= 90) return 'warning'
  return 'ok'
}

// Format a YYYY-MM-DD date string as "Jan 5, 2026"
function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Format a numeric value as a USD currency string
function formatCurrency(value) {
  if (value == null || value === '') return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

// Look up the display label for a permit type value
function getTypeLabel(value) {
  return PERMIT_TYPES.find((t) => t.value === value)?.label ?? value
}

// Convert a form string to a float or null for numeric DB columns
function toNumericOrNull(str) {
  if (str === '' || str == null) return null
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LocalPermitsPage() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner, hasDraft } = useModalDraft('modal_draft_permit')

  // ── Data state ──
  const [permits,    setPermits]    = useState([])
  const [permitDocs, setPermitDocs] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [pageError,  setPageError]  = useState('')

  // ── Filter / sort state ──
  const [filterType,   setFilterType]   = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy,       setSortBy]       = useState('expiration_date')
  const [showArchived, setShowArchived] = useState(false)

  // ── Modal state ──
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editTarget, setEditTarget] = useState(null) // null = new permit
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [modalError, setModalError] = useState('')

  // ── Delete confirmation state ──
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleting,        setDeleting]        = useState(false)

  // ── Archive confirmation state ──
  const [archiveTargetId, setArchiveTargetId] = useState(null)
  const [archiving,       setArchiving]       = useState(false)

  // ── Expanded card — only one open at a time ──
  const [expandedId, setExpandedId] = useState(null)

  // Load data once the brewery id is known
  useEffect(() => {
    if (!brewery?.id) return
    loadPermits()
    loadPermitDocs()
  }, [brewery?.id])

  // Auto-save form to sessionStorage in add mode
  useEffect(() => {
    if (!modalOpen || editTarget) return
    saveDraft(form)
  }, [form, modalOpen, editTarget])

  // Fetch all permits for this brewery (active and archived) newest-first
  async function loadPermits() {
    setLoading(true)
    setPageError('')
    try {
      const { data, error } = await supabase
        .from('local_permits')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setPermits(data ?? [])
    } catch {
      setPageError('Could not load permits. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Fetch only local_permit documents so users can link them in the modal
  async function loadPermitDocs() {
    const { data } = await supabase
      .from('brewery_documents')
      .select('id, document_name')
      .eq('brewery_id', brewery.id)
      .eq('document_type', 'local_permit')
      .order('document_name', { ascending: true })
    setPermitDocs(data ?? [])
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  // Open the Add Permit modal — restore any saved draft into the form.
  // showBanner=false when the user clicked "Continue Draft" (they already know).
  function openAddModal(showBanner = true) {
    setEditTarget(null)
    setModalError('')
    const draft = loadDraft(showBanner)
    setForm(draft ? { ...EMPTY_FORM, ...draft } : EMPTY_FORM)
    setModalOpen(true)
  }

  // Open the Edit modal — clear any stale add-mode draft first
  function openEditModal(permit) {
    clearDraft()
    setEditTarget(permit)
    setForm({
      permit_name:             permit.permit_name,
      permit_type:             permit.permit_type,
      issuing_authority:       permit.issuing_authority,
      authority_contact_name:  permit.authority_contact_name  ?? '',
      authority_contact_email: permit.authority_contact_email ?? '',
      authority_contact_phone: permit.authority_contact_phone ?? '',
      permit_number:           permit.permit_number           ?? '',
      issue_date:              permit.issue_date              ?? '',
      expiration_date:         permit.expiration_date         ?? '',
      no_expiration:           !permit.expiration_date,
      auto_renews:             permit.auto_renews             ?? false,
      renewal_fee:             permit.renewal_fee != null ? String(permit.renewal_fee) : '',
      renewal_notes:           permit.renewal_notes           ?? '',
      document_id:             permit.document_id             ?? '',
      notes:                   permit.notes                   ?? '',
    })
    setModalError('')
    setModalOpen(true)
  }

  // Pure reset — does not touch the draft
  function resetModal() {
    setForm(EMPTY_FORM)
    setModalError('')
    setEditTarget(null)
  }

  // Full close: clear draft, reset state, shut modal (Cancel button calls this directly)
  function handleCloseModal() {
    clearDraft()
    resetModal()
    setModalOpen(false)
  }

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  // Insert a new permit or update an existing one depending on editTarget
  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setModalError('')

    const payload = {
      brewery_id:              brewery.id,
      permit_name:             form.permit_name.trim(),
      permit_type:             form.permit_type,
      issuing_authority:       form.issuing_authority.trim(),
      authority_contact_name:  form.authority_contact_name.trim()  || null,
      authority_contact_email: form.authority_contact_email.trim() || null,
      authority_contact_phone: form.authority_contact_phone.trim() || null,
      permit_number:           form.permit_number.trim()           || null,
      issue_date:              form.issue_date                     || null,
      // When no_expiration is checked, always save null regardless of date field value
      expiration_date:         form.no_expiration ? null : (form.expiration_date || null),
      auto_renews:             form.auto_renews,
      renewal_fee:             toNumericOrNull(form.renewal_fee),
      renewal_notes:           form.renewal_notes.trim()           || null,
      document_id:             form.document_id                    || null,
      notes:                   form.notes.trim()                   || null,
    }

    try {
      if (editTarget) {
        const { error } = await supabase.from('local_permits').update(payload).eq('id', editTarget.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('local_permits').insert(payload)
        if (error) throw error
      }
      await loadPermits()
      handleCloseModal()
    } catch (err) {
      setModalError(err.message || 'Could not save permit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Set is_active = false so the permit is hidden without deleting its record
  async function handleArchive(permitId) {
    setArchiving(true)
    try {
      const { error } = await supabase.from('local_permits').update({ is_active: false }).eq('id', permitId)
      if (error) throw error
      setArchiveTargetId(null)
      await loadPermits()
    } catch {
      alert('Could not archive permit. Please try again.')
    } finally {
      setArchiving(false)
    }
  }

  // Restore an archived permit back to active status
  async function handleRestore(permitId) {
    try {
      const { error } = await supabase.from('local_permits').update({ is_active: true }).eq('id', permitId)
      if (error) throw error
      await loadPermits()
    } catch {
      alert('Could not restore permit. Please try again.')
    }
  }

  // Permanently delete a permit after user confirms
  async function handleDelete(permitId) {
    setDeleting(true)
    try {
      const { error } = await supabase.from('local_permits').delete().eq('id', permitId)
      if (error) throw error
      setDeleteConfirmId(null)
      // Remove from local state immediately so the UI updates without a refetch
      setPermits((prev) => prev.filter((p) => p.id !== permitId))
    } catch {
      alert('Could not delete permit. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // Toggle the expanded details panel; collapse if already open
  function toggleExpand(permitId) {
    setExpandedId((prev) => (prev === permitId ? null : permitId))
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const activePermits   = permits.filter((p) => p.is_active)
  const archivedPermits = permits.filter((p) => !p.is_active)

  // Count active permits expiring in the next 90 days (future dates only)
  const expiringSoon90 = activePermits.filter((p) => {
    const s = getExpirationStatus(p.expiration_date)
    return s === 'urgent' || s === 'warning'
  }).length

  // Apply type filter, status filter, and sort to the active permits list
  const filteredPermits = activePermits
    .filter((permit) => {
      if (filterType !== 'all' && permit.permit_type !== filterType) return false
      if (filterStatus !== 'all') {
        const s = getExpirationStatus(permit.expiration_date)
        if (filterStatus === 'no_expiration') return !permit.expiration_date
        if (filterStatus === 'expired')       return s === 'expired'
        if (filterStatus === 'expiring_soon') return s === 'urgent' || s === 'warning'
        if (filterStatus === 'current')       return !permit.expiration_date || s === 'ok'
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'permit_name')       return a.permit_name.localeCompare(b.permit_name)
      if (sortBy === 'issuing_authority') return a.issuing_authority.localeCompare(b.issuing_authority)
      // Default: expiration date ascending, nulls last
      if (!a.expiration_date && !b.expiration_date) return 0
      if (!a.expiration_date) return 1
      if (!b.expiration_date) return -1
      return a.expiration_date.localeCompare(b.expiration_date)
    })

  const canSave = form.permit_name.trim() && form.permit_type && form.issuing_authority.trim()

  // Dirty = add mode AND any main field has data (edit modals close without warning)
  const isFormDirty = !editTarget && !!(form.permit_name.trim() || form.permit_type || form.issuing_authority.trim() || form.permit_number.trim() || form.expiration_date || form.renewal_fee || form.notes.trim())

  if (loading) return <LoadingSpinner message="Loading permits..." />

  return (
    <div className="space-y-4">

      {/* Disclaimer */}
      <DismissibleDisclaimer
        storageKey="disclaimer_permits_dismissed"
        text="Local permit requirements vary significantly by municipality. This tracker is for your own record keeping only. Always verify current requirements directly with your local government offices."
      />

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">📍 Local Permits &amp; Municipal Licenses</h2>
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={() => openAddModal(!hasDraft)}
            title={hasDraft ? "You have an unsaved draft — click to continue where you left off" : undefined}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors relative"
          >
            {hasDraft && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
            )}
            {hasDraft ? 'Continue Draft' : '+ Add Permit'}
          </button>
        </ReadOnlyTooltip>
      </div>

      {hasDraft && (
        <DraftNoticeBar
          onContinue={() => openAddModal(false)}
          onDiscard={clearDraft}
        />
      )}

      {/* Summary row */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3">
          <span className="text-2xl">📍</span>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Active Permits</p>
            <p className="text-2xl font-bold text-navy">{activePermits.length}</p>
          </div>
        </div>
        <div className={`rounded-xl border px-5 py-3 flex items-center gap-3 ${
          expiringSoon90 > 0 ? 'bg-amber/10 border-amber' : 'bg-white border-gray-200'
        }`}>
          <span className="text-2xl">⏰</span>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Expiring in 90 Days</p>
            <p className={`text-2xl font-bold ${expiringSoon90 > 0 ? 'text-amber-dark' : 'text-navy'}`}>
              {expiringSoon90}
            </p>
          </div>
        </div>
      </div>

      {/* Page-level error */}
      {pageError && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{pageError}</span>
          <button onClick={loadPermits} className="underline font-medium whitespace-nowrap">Retry</button>
        </div>
      )}

      {/* Filter and sort bar */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
        >
          <option value="all">All Types</option>
          {PERMIT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>Sort: {o.label}</option>
          ))}
        </select>
      </div>

      {/* Active permit grid or empty states */}
      {activePermits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-3">📍</p>
          <p className="text-sm font-semibold text-navy mb-1">No local permits added yet</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Add your first permit to keep all your municipal licenses organized and get renewal reminders.
          </p>
          <button
            onClick={openAddModal}
            className="mt-4 text-sm text-amber hover:underline font-medium"
          >
            Add your first permit →
          </button>
        </div>
      ) : filteredPermits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No permits match these filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPermits.map((permit) => (
            <PermitCard
              key={permit.id}
              permit={permit}
              expanded={expandedId === permit.id}
              deleteConfirmId={deleteConfirmId}
              archiveTargetId={archiveTargetId}
              deleting={deleting}
              archiving={archiving}
              permitDocs={permitDocs}
              onToggleExpand={() => toggleExpand(permit.id)}
              onEdit={() => openEditModal(permit)}
              onDeleteRequest={() => setDeleteConfirmId(permit.id)}
              onDeleteConfirm={() => handleDelete(permit.id)}
              onDeleteCancel={() => setDeleteConfirmId(null)}
              onArchiveRequest={() => setArchiveTargetId(permit.id)}
              onArchiveConfirm={() => handleArchive(permit.id)}
              onArchiveCancel={() => setArchiveTargetId(null)}
            />
          ))}
        </div>
      )}

      {/* Archived permits toggle */}
      {archivedPermits.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-sm text-gray-500 hover:text-navy underline"
          >
            {showArchived
              ? `Hide archived permits (${archivedPermits.length})`
              : `Show archived permits (${archivedPermits.length})`}
          </button>

          {showArchived && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              {archivedPermits.map((permit) => (
                <ArchivedPermitRow
                  key={permit.id}
                  permit={permit}
                  deleteConfirmId={deleteConfirmId}
                  deleting={deleting}
                  onRestore={() => handleRestore(permit.id)}
                  onDeleteRequest={() => setDeleteConfirmId(permit.id)}
                  onDeleteConfirm={() => handleDelete(permit.id)}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit modal ─────────────────────────────────────────────── */}
      <ModalShell
        isOpen={modalOpen}
        onClose={handleCloseModal}
        isDirty={isFormDirty}
        title={editTarget ? 'Edit Permit' : 'Add Local Permit'}
        draftRestored={draftRestored}
        onDismissDraft={dismissDraftBanner}
        maxWidth="max-w-xl"
      >
              <form onSubmit={handleSave} className="space-y-5">

                {/* ── Permit basics ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Permit Details</p>

                  {/* Permit type — choose this first so the name placeholder updates */}
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Permit Type <span className="text-danger">*</span>
                    </label>
                    <select
                      required
                      value={form.permit_type}
                      onChange={(e) => setForm((p) => ({ ...p, permit_type: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
                    >
                      <option value="">Select type...</option>
                      {PERMIT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Permit name — placeholder text responds to selected type */}
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Permit Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.permit_name}
                      onChange={(e) => setForm((p) => ({ ...p, permit_name: e.target.value }))}
                      placeholder={PERMIT_NAME_PLACEHOLDERS[form.permit_type] ?? 'Enter permit name'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                    />
                  </div>

                  {/* Issuing authority + permit number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Issuing Authority <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. City of Denver, Boulder County"
                        value={form.issuing_authority}
                        onChange={(e) => setForm((p) => ({ ...p, issuing_authority: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Permit Number <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. BL-2026-004521"
                        value={form.permit_number}
                        onChange={(e) => setForm((p) => ({ ...p, permit_number: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Authority contact ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Authority Contact</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Contact Name <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. City Clerk's Office"
                        value={form.authority_contact_name}
                        onChange={(e) => setForm((p) => ({ ...p, authority_contact_name: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Contact Phone <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={form.authority_contact_phone}
                        onChange={(e) => setForm((p) => ({ ...p, authority_contact_phone: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Contact Email <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="permits@yourcity.gov"
                      value={form.authority_contact_email}
                      onChange={(e) => setForm((p) => ({ ...p, authority_contact_email: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                    />
                  </div>
                </div>

                {/* ── Dates & Renewal ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dates &amp; Renewal</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Issue Date <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={form.issue_date}
                        onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Expiration Date <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      {/* Date picker is disabled when the no-expiration checkbox is checked */}
                      <input
                        type="date"
                        value={form.expiration_date}
                        disabled={form.no_expiration}
                        onChange={(e) => setForm((p) => ({ ...p, expiration_date: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                      />
                      {/* Checking this clears and locks the expiration date field above */}
                      <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.no_expiration}
                          onChange={(e) => setForm((p) => ({
                            ...p,
                            no_expiration:   e.target.checked,
                            expiration_date: e.target.checked ? '' : p.expiration_date,
                          }))}
                          className="rounded border-gray-300 text-amber focus:ring-amber"
                        />
                        <span className="text-xs text-gray-600">This permit has no expiration date</span>
                      </label>
                    </div>
                  </div>

                  {/* Auto-renews toggle */}
                  <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-navy">Auto-Renews</p>
                      <p className="text-xs text-gray-500 mt-0.5">Does this permit renew automatically?</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={form.auto_renews}
                        onChange={(e) => setForm((p) => ({ ...p, auto_renews: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:bg-amber after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                    </label>
                  </div>

                  {/* Renewal fee */}
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Renewal Fee <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="150.00"
                        value={form.renewal_fee}
                        onChange={(e) => setForm((p) => ({ ...p, renewal_fee: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                  </div>

                  {/* Renewal notes */}
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Renewal Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Submit renewal application 30 days before expiration at City Hall..."
                      value={form.renewal_notes}
                      onChange={(e) => setForm((p) => ({ ...p, renewal_notes: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
                    />
                  </div>
                </div>

                {/* ── Documents & Notes ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Documents &amp; Notes</p>
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Link to Document <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <select
                      value={form.document_id}
                      onChange={(e) => setForm((p) => ({ ...p, document_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
                    >
                      <option value="">No document linked</option>
                      {permitDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>{doc.document_name}</option>
                      ))}
                    </select>
                    {permitDocs.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        Upload a Local Permit document in the Documents tab to link it here.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Notes <span className="text-gray-400 font-normal">(optional, max 500 characters)</span>
                    </label>
                    <textarea
                      rows={2}
                      maxLength={500}
                      placeholder="Any additional notes about this permit..."
                      value={form.notes}
                      onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
                    />
                    <p className="text-xs text-gray-400 text-right mt-0.5">{form.notes.length}/500</p>
                  </div>
                </div>

                {modalError && (
                  <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
                    {modalError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSave || saving}
                    className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
                  >
                    {saving ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                        Saving...
                      </span>
                    ) : 'Save Permit'}
                  </button>
                </div>
              </form>
      </ModalShell>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Colour classes for expiration urgency text and card border accent
const EXP_TEXT = {
  expired: 'text-danger font-semibold',
  urgent:  'text-danger',
  warning: 'text-warning',
  ok:      'text-success',
}

const EXP_BORDER = {
  expired: 'border-red-300',
  urgent:  'border-red-200',
  warning: 'border-amber/40',
  ok:      'border-gray-200',
}

// Card for one active permit with expand-to-details, edit, archive, and delete
function PermitCard({
  permit, expanded,
  deleteConfirmId, archiveTargetId, deleting, archiving, permitDocs,
  onToggleExpand, onEdit,
  onDeleteRequest, onDeleteConfirm, onDeleteCancel,
  onArchiveRequest, onArchiveConfirm, onArchiveCancel,
}) {
  const expStatus        = getExpirationStatus(permit.expiration_date)
  const isConfirmDelete  = deleteConfirmId  === permit.id
  const isConfirmArchive = archiveTargetId  === permit.id
  const linkedDoc        = permitDocs.find((d) => d.id === permit.document_id)

  return (
    <div className={`bg-white rounded-xl border p-4 flex flex-col gap-3 ${EXP_BORDER[expStatus] ?? 'border-gray-200'}`}>

      {/* Name + type badge row */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-navy leading-tight">{permit.permit_name}</p>
          {linkedDoc && <span title={`Linked: ${linkedDoc.document_name}`} className="text-gray-400 shrink-0">📎</span>}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-navy text-white font-medium px-2 py-0.5 rounded-full">
            {getTypeLabel(permit.permit_type)}
          </span>
          {permit.auto_renews && (
            <span className="text-xs bg-green-100 text-success font-medium px-2 py-0.5 rounded-full">
              Auto-Renews
            </span>
          )}
          {!permit.expiration_date && (
            <span className="text-xs bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">
              No Expiration
            </span>
          )}
        </div>
      </div>

      {/* Issuing authority */}
      <div>
        <p className="text-xs text-gray-700 font-medium">{permit.issuing_authority}</p>
        {permit.permit_number && (
          <p className="text-xs text-gray-400 mt-0.5">Permit #: {permit.permit_number}</p>
        )}
      </div>

      {/* Renewal fee */}
      {permit.renewal_fee != null && (
        <p className="text-xs text-gray-500">
          Renewal fee: <span className="font-medium">{formatCurrency(permit.renewal_fee)}</span>
        </p>
      )}

      {/* Dates with expiration colour-coding */}
      <div className="space-y-0.5">
        {permit.issue_date && (
          <p className="text-xs text-gray-500">Issued: {formatDate(permit.issue_date)}</p>
        )}
        {permit.expiration_date && (
          <p className={`text-xs ${EXP_TEXT[expStatus] ?? 'text-gray-500'}`}>
            {expStatus === 'expired' ? '⚠️ Expired: ' : '📅 Expires: '}
            {formatDate(permit.expiration_date)}
            {expStatus === 'urgent'  && ' — renew soon!'}
            {expStatus === 'expired' && ' — renewal required'}
          </p>
        )}
      </div>

      {/* Expanded details panel — authority contacts, notes */}
      {expanded && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          {permit.authority_contact_name && (
            <p className="text-xs text-gray-600">Contact: {permit.authority_contact_name}</p>
          )}
          {permit.authority_contact_email && (
            <p className="text-xs text-gray-600">
              Email:{' '}
              <a href={`mailto:${permit.authority_contact_email}`} className="text-amber hover:underline">
                {permit.authority_contact_email}
              </a>
            </p>
          )}
          {permit.authority_contact_phone && (
            <p className="text-xs text-gray-600">Phone: {permit.authority_contact_phone}</p>
          )}
          {permit.renewal_notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500">Renewal notes:</p>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{permit.renewal_notes}</p>
            </div>
          )}
          {permit.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500">Notes:</p>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{permit.notes}</p>
            </div>
          )}
          {linkedDoc && (
            <p className="text-xs text-gray-500">📎 Linked document: {linkedDoc.document_name}</p>
          )}
        </div>
      )}

      {/* Inline confirmation states or normal action buttons */}
      {isConfirmDelete ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">Delete this permit? This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="flex-1 bg-danger text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={onDeleteCancel}
              className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : isConfirmArchive ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">
            Archive this permit? It will be hidden but its record will be preserved.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onArchiveConfirm}
              disabled={archiving}
              className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors disabled:opacity-60"
            >
              {archiving ? 'Archiving...' : 'Yes, Archive'}
            </button>
            <button
              onClick={onArchiveCancel}
              className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-3 mt-auto flex-wrap">
          <button
            onClick={onToggleExpand}
            className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {expanded ? 'Hide Details' : 'View Details'}
          </button>
          <button
            onClick={onEdit}
            className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onArchiveRequest}
            className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            Archive
          </button>
          <button
            onClick={onDeleteRequest}
            className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-danger hover:text-danger transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// Compact row for archived permits with restore and permanent-delete actions
function ArchivedPermitRow({ permit, deleteConfirmId, deleting, onRestore, onDeleteRequest, onDeleteConfirm, onDeleteCancel }) {
  const isConfirming = deleteConfirmId === permit.id

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 opacity-60">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-navy text-sm truncate">
            {permit.permit_name}
            <span className="ml-2 text-xs text-gray-400 font-normal">(Archived)</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {getTypeLabel(permit.permit_type)} · {permit.issuing_authority}
          </p>
        </div>
        {!isConfirming && (
          <div className="flex gap-3 shrink-0">
            <button
              onClick={onRestore}
              className="text-xs text-amber hover:underline font-medium"
            >
              Restore
            </button>
            <button
              onClick={onDeleteRequest}
              className="text-xs text-gray-400 hover:text-danger transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {isConfirming && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">Permanently delete this permit? This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="flex-1 bg-danger text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={onDeleteCancel}
              className="flex-1 border border-gray-300 text-gray-600 text-xs py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
