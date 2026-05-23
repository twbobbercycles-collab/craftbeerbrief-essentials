/**
 * StaffPage — Staff Members and Certification Tracker.
 * Two tabs: Staff Members (add/edit/deactivate) and Certifications
 * (add/edit/delete with expiration colour-coding).
 */
import { useEffect, useState } from 'react'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import ModalShell from '../../components/ModalShell'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAFF_ROLES = [
  { value: 'owner',                label: 'Owner' },
  { value: 'head_brewer',          label: 'Head Brewer' },
  { value: 'assistant_brewer',     label: 'Assistant Brewer' },
  { value: 'taproom_manager',      label: 'Taproom Manager' },
  { value: 'taproom_staff',        label: 'Taproom Staff' },
  { value: 'sales_representative', label: 'Sales Representative' },
  { value: 'operations_manager',   label: 'Operations Manager' },
  { value: 'other',                label: 'Other' },
]

const CERTIFICATION_TYPES = [
  { value: 'responsible_alcohol_service', label: 'Responsible Alcohol Service' },
  { value: 'food_handler',                label: 'Food Handler' },
  { value: 'food_manager',                label: 'Food Manager' },
  { value: 'cicerone',                    label: 'Cicerone' },
  { value: 'brewmaster',                  label: 'Brewmaster' },
  { value: 'first_aid',                   label: 'First Aid / CPR' },
  { value: 'other',                       label: 'Other' },
]

// Placeholder text in the certification name field changes with the selected type
const CERT_NAME_PLACEHOLDERS = {
  responsible_alcohol_service: 'e.g. TIPS Certification, ServSafe Alcohol, TAM Card',
  food_handler:                'e.g. Food Handler Card, ServSafe Food Handler',
  food_manager:                'e.g. ServSafe Manager Certification',
  cicerone:                    'e.g. Certified Beer Server, Certified Cicerone',
  brewmaster:                  'e.g. IBD General Certificate, MBAA Certificate',
  first_aid:                   'e.g. CPR/AED Certification, First Aid Certificate',
  other:                       'Enter certification name',
}

const EMPTY_STAFF_FORM = {
  first_name: '', last_name: '', role: '', email: '', phone: '',
}

const EMPTY_CERT_FORM = {
  staff_member_id: '', certification_type: '', certification_name: '',
  issuing_organization: '', issue_date: '', expiration_date: '',
  certificate_number: '', document_id: '', notes: '',
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

// Look up the display label for a role value
function getRoleLabel(value) {
  return STAFF_ROLES.find((r) => r.value === value)?.label ?? value
}

// Look up the display label for a certification type value
function getCertTypeLabel(value) {
  return CERTIFICATION_TYPES.find((t) => t.value === value)?.label ?? value
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StaffPage() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  const {
    loadDraft: loadStaffDraft, saveDraft: saveStaffDraft,
    clearDraft: clearStaffDraft, draftRestored: staffDraftRestored,
    dismissDraftBanner: dismissStaffDraft, hasDraft: hasDraftStaff,
  } = useModalDraft('modal_draft_staff')

  const {
    loadDraft: loadCertDraft, saveDraft: saveCertDraft,
    clearDraft: clearCertDraft, draftRestored: certDraftRestored,
    dismissDraftBanner: dismissCertDraft, hasDraft: hasDraftCert,
  } = useModalDraft('modal_draft_certification')

  // ── Tab ──
  const [activeTab, setActiveTab] = usePersistedTab('staff_active_tab', 'staff')

  // ── Staff members ──
  const [staffMembers, setStaffMembers] = useState([])
  const [showInactive, setShowInactive] = useState(false)
  const [staffLoading, setStaffLoading] = useState(true)
  const [staffError,   setStaffError]   = useState('')

  // ── Certifications ──
  const [certifications,    setCertifications]    = useState([])
  const [certFilterStaff,   setCertFilterStaff]   = useState('all')
  const [certFilterType,    setCertFilterType]    = useState('all')
  const [certLoading,       setCertLoading]       = useState(true)
  const [certError,         setCertError]         = useState('')

  // ── Staff certification documents available to link ──
  const [certDocuments, setCertDocuments] = useState([])

  // ── Staff modal ──
  const [staffModalOpen,  setStaffModalOpen]  = useState(false)
  const [staffEditTarget, setStaffEditTarget] = useState(null) // null = new record
  const [staffForm,       setStaffForm]       = useState(EMPTY_STAFF_FORM)
  const [staffSaving,     setStaffSaving]     = useState(false)
  const [staffModalError, setStaffModalError] = useState('')

  // ── Deactivate confirmation ──
  const [deactivateTargetId, setDeactivateTargetId] = useState(null)
  const [deactivating,       setDeactivating]       = useState(false)

  // ── Cert modal ──
  const [certModalOpen,  setCertModalOpen]  = useState(false)
  const [certEditTarget, setCertEditTarget] = useState(null) // null = new record
  const [certForm,       setCertForm]       = useState(EMPTY_CERT_FORM)
  const [certSaving,     setCertSaving]     = useState(false)
  const [certModalError, setCertModalError] = useState('')

  // ── Cert delete confirmation ──
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleting,        setDeleting]        = useState(false)

  // Load all data once the brewery id is available
  useEffect(() => {
    if (!brewery?.id) return
    loadStaffMembers()
    loadCertifications()
    loadCertDocuments()
  }, [brewery?.id])

  // Auto-save add-mode form drafts whenever the form state changes
  useEffect(() => {
    if (!staffModalOpen || staffEditTarget) return
    saveStaffDraft(staffForm)
  }, [staffForm, staffModalOpen, staffEditTarget])

  useEffect(() => {
    if (!certModalOpen || certEditTarget) return
    saveCertDraft(certForm)
  }, [certForm, certModalOpen, certEditTarget])

  // Fetch all staff members for this brewery, sorted alphabetically by first name
  async function loadStaffMembers() {
    setStaffLoading(true)
    setStaffError('')
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('first_name', { ascending: true })
      if (error) throw error
      setStaffMembers(data ?? [])
    } catch {
      setStaffError('Could not load staff members. Please refresh and try again.')
    } finally {
      setStaffLoading(false)
    }
  }

  // Fetch all certifications for this brewery, joining the staff member's name for display.
  // Sorted by expiration date ascending so soonest-expiring appear first.
  async function loadCertifications() {
    setCertLoading(true)
    setCertError('')
    try {
      const { data, error } = await supabase
        .from('staff_certifications')
        .select('*, staff_members(first_name, last_name)')
        .eq('brewery_id', brewery.id)
        .order('expiration_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      setCertifications(data ?? [])
    } catch {
      setCertError('Could not load certifications. Please refresh and try again.')
    } finally {
      setCertLoading(false)
    }
  }

  // Fetch only documents of type 'staff_certification' so users can link an
  // uploaded scan of a certificate to the cert record in the modal.
  async function loadCertDocuments() {
    const { data } = await supabase
      .from('brewery_documents')
      .select('id, document_name')
      .eq('brewery_id', brewery.id)
      .eq('document_type', 'staff_certification')
      .order('document_name', { ascending: true })
    setCertDocuments(data ?? [])
  }

  // ── Staff CRUD ──────────────────────────────────────────────────────────────

  // Open the Add Staff modal — restore any saved draft into the form.
  // showBanner=false when the user clicked "Continue Draft" (they already know).
  function openAddStaffModal(showBanner = true) {
    setStaffEditTarget(null)
    setStaffModalError('')
    const draft = loadStaffDraft(showBanner)
    setStaffForm(draft ? { ...EMPTY_STAFF_FORM, ...draft } : EMPTY_STAFF_FORM)
    setStaffModalOpen(true)
  }

  // Open the Edit Staff modal — clear any stale add-mode draft first
  function openEditStaffModal(member) {
    clearStaffDraft()
    setStaffEditTarget(member)
    setStaffForm({
      first_name: member.first_name,
      last_name:  member.last_name,
      role:       member.role,
      email:      member.email ?? '',
      phone:      member.phone ?? '',
    })
    setStaffModalError('')
    setStaffModalOpen(true)
  }

  // Pure reset — does not touch the draft
  function resetStaffModal() {
    setStaffForm(EMPTY_STAFF_FORM)
    setStaffModalError('')
    setStaffEditTarget(null)
  }

  // Full close: clear draft, reset state, shut modal (Cancel button calls this directly)
  function handleCloseStaffModal() {
    clearStaffDraft()
    resetStaffModal()
    setStaffModalOpen(false)
  }

  // Insert a new staff member or update an existing one depending on staffEditTarget
  async function handleSaveStaff(e) {
    e.preventDefault()
    setStaffSaving(true)
    setStaffModalError('')

    const payload = {
      brewery_id: brewery.id,
      first_name: staffForm.first_name.trim(),
      last_name:  staffForm.last_name.trim(),
      role:       staffForm.role,
      email:      staffForm.email.trim()  || null,
      phone:      staffForm.phone.trim()  || null,
    }

    try {
      if (staffEditTarget) {
        const { error } = await supabase
          .from('staff_members')
          .update(payload)
          .eq('id', staffEditTarget.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('staff_members')
          .insert(payload)
        if (error) throw error
      }
      await loadStaffMembers()
      handleCloseStaffModal()
    } catch (err) {
      setStaffModalError(err.message || 'Could not save. Please try again.')
    } finally {
      setStaffSaving(false)
    }
  }

  // Mark a staff member inactive — their certification history is preserved
  async function handleDeactivate(memberId) {
    setDeactivating(true)
    try {
      const { error } = await supabase
        .from('staff_members')
        .update({ is_active: false })
        .eq('id', memberId)
      if (error) throw error
      setDeactivateTargetId(null)
      await loadStaffMembers()
    } catch {
      alert('Could not deactivate staff member. Please try again.')
    } finally {
      setDeactivating(false)
    }
  }

  // Restore a previously deactivated staff member to active status
  async function handleReactivate(memberId) {
    try {
      const { error } = await supabase
        .from('staff_members')
        .update({ is_active: true })
        .eq('id', memberId)
      if (error) throw error
      await loadStaffMembers()
    } catch {
      alert('Could not reactivate staff member. Please try again.')
    }
  }

  // ── Certifications CRUD ─────────────────────────────────────────────────────

  // Open the Add Certification modal — restore any saved draft into the form.
  // showBanner=false when the user clicked "Continue Draft" (they already know).
  function openAddCertModal(showBanner = true) {
    setCertEditTarget(null)
    setCertModalError('')
    const draft = loadCertDraft(showBanner)
    setCertForm(draft ? { ...EMPTY_CERT_FORM, ...draft } : EMPTY_CERT_FORM)
    setCertModalOpen(true)
  }

  // Open the Edit Certification modal — clear any stale add-mode draft first
  function openEditCertModal(cert) {
    clearCertDraft()
    setCertEditTarget(cert)
    setCertForm({
      staff_member_id:      cert.staff_member_id,
      certification_type:   cert.certification_type,
      certification_name:   cert.certification_name,
      issuing_organization: cert.issuing_organization ?? '',
      issue_date:           cert.issue_date ?? '',
      expiration_date:      cert.expiration_date ?? '',
      certificate_number:   cert.certificate_number ?? '',
      document_id:          cert.document_id ?? '',
      notes:                cert.notes ?? '',
    })
    setCertModalError('')
    setCertModalOpen(true)
  }

  // Pure reset — does not touch the draft
  function resetCertModal() {
    setCertForm(EMPTY_CERT_FORM)
    setCertModalError('')
    setCertEditTarget(null)
  }

  // Full close: clear draft, reset state, shut modal (Cancel button calls this directly)
  function handleCloseCertModal() {
    clearCertDraft()
    resetCertModal()
    setCertModalOpen(false)
  }

  // Insert a new certification or update an existing one depending on certEditTarget
  async function handleSaveCert(e) {
    e.preventDefault()
    setCertSaving(true)
    setCertModalError('')

    const payload = {
      brewery_id:           brewery.id,
      staff_member_id:      certForm.staff_member_id,
      certification_type:   certForm.certification_type,
      certification_name:   certForm.certification_name.trim(),
      issuing_organization: certForm.issuing_organization.trim() || null,
      issue_date:           certForm.issue_date       || null,
      expiration_date:      certForm.expiration_date  || null,
      certificate_number:   certForm.certificate_number.trim() || null,
      document_id:          certForm.document_id      || null,
      notes:                certForm.notes.trim()     || null,
    }

    try {
      if (certEditTarget) {
        const { error } = await supabase
          .from('staff_certifications')
          .update(payload)
          .eq('id', certEditTarget.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('staff_certifications')
          .insert(payload)
        if (error) throw error
      }
      await loadCertifications()
      handleCloseCertModal()
    } catch (err) {
      setCertModalError(err.message || 'Could not save. Please try again.')
    } finally {
      setCertSaving(false)
    }
  }

  // Permanently delete a certification record after the user confirms
  async function handleDeleteCert(certId) {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('staff_certifications')
        .delete()
        .eq('id', certId)
      if (error) throw error
      setDeleteConfirmId(null)
      // Remove from local state immediately so the UI updates without a refetch
      setCertifications((prev) => prev.filter((c) => c.id !== certId))
    } catch {
      alert('Could not delete certification. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const activeStaff   = staffMembers.filter((m) => m.is_active)
  const inactiveStaff = staffMembers.filter((m) => !m.is_active)

  // Count how many certifications exist for a given staff member id
  function certCountFor(memberId) {
    return certifications.filter((c) => c.staff_member_id === memberId).length
  }

  // Apply the two filter dropdowns to the certifications list
  const filteredCerts = certifications.filter((c) => {
    if (certFilterStaff !== 'all' && c.staff_member_id !== certFilterStaff) return false
    if (certFilterType  !== 'all' && c.certification_type !== certFilterType)  return false
    return true
  })

  // Only active staff appear in the certification modal staff dropdown
  const activeStaffForDropdown = staffMembers.filter((m) => m.is_active)

  // Whether the Save button should be enabled in each modal
  const canSaveStaff = staffForm.first_name.trim() && staffForm.last_name.trim() && staffForm.role
  const canSaveCert  = certForm.staff_member_id && certForm.certification_type && certForm.certification_name.trim()

  // Dirty = add mode AND any field has data (edit modals close without warning)
  const isStaffFormDirty = !staffEditTarget && !!(staffForm.first_name.trim() || staffForm.last_name.trim() || staffForm.role || staffForm.email.trim() || staffForm.phone.trim())
  const isCertFormDirty  = !certEditTarget  && !!(certForm.staff_member_id || certForm.certification_type || certForm.certification_name.trim() || certForm.issuing_organization.trim() || certForm.issue_date || certForm.expiration_date || certForm.certificate_number.trim() || certForm.notes.trim())

  if (staffLoading && certLoading) return <LoadingSpinner message="Loading staff..." />

  return (
    <div className="space-y-4">

      {/* Disclaimer */}
      <DismissibleDisclaimer
        storageKey="disclaimer_staff_dismissed"
        text="Certification tracking is provided as a convenience only. Always verify staff certification requirements with your state licensing authority and consult your legal counsel regarding compliance obligations."
      />

      {/* Page header + context-sensitive Add button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">👥 Staff &amp; Certifications</h2>
        {activeTab === 'staff' ? (
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={() => openAddStaffModal(!hasDraftStaff)}
              title={hasDraftStaff ? "You have an unsaved draft — click to continue where you left off" : undefined}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors relative"
            >
              {hasDraftStaff && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
              )}
              {hasDraftStaff ? 'Continue Draft' : '+ Add Staff Member'}
            </button>
          </ReadOnlyTooltip>
        ) : (
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={() => openAddCertModal(!hasDraftCert)}
              title={hasDraftCert ? "You have an unsaved draft — click to continue where you left off" : undefined}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors relative"
            >
              {hasDraftCert && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
              )}
              {hasDraftCert ? 'Continue Draft' : '+ Add Certification'}
            </button>
          </ReadOnlyTooltip>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        <TabButton label="Staff Members"   active={activeTab === 'staff'}           onClick={() => setActiveTab('staff')} />
        <TabButton label="Certifications"  active={activeTab === 'certifications'}  onClick={() => setActiveTab('certifications')} />
      </div>

      {/* ── Staff Members tab ─────────────────────────────────────────────── */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {hasDraftStaff && (
            <DraftNoticeBar
              onContinue={() => openAddStaffModal(false)}
              onDiscard={clearStaffDraft}
            />
          )}
          {staffError && (
            <ErrorBar message={staffError} onRetry={loadStaffMembers} />
          )}

          {activeStaff.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-4xl mb-3">👤</p>
              <p className="text-sm font-semibold text-navy mb-1">No staff members added yet</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Add your first staff member to start tracking certifications.
              </p>
              <button
                onClick={openAddStaffModal}
                className="mt-4 text-sm text-amber hover:underline font-medium"
              >
                Add your first staff member →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeStaff.map((member) => (
                <StaffCard
                  key={member.id}
                  member={member}
                  certCount={certCountFor(member.id)}
                  deactivateTargetId={deactivateTargetId}
                  deactivating={deactivating}
                  onEdit={() => openEditStaffModal(member)}
                  onDeactivateRequest={() => setDeactivateTargetId(member.id)}
                  onDeactivateConfirm={() => handleDeactivate(member.id)}
                  onDeactivateCancel={() => setDeactivateTargetId(null)}
                />
              ))}
            </div>
          )}

          {/* Toggle to reveal/hide the inactive staff list */}
          {inactiveStaff.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowInactive((v) => !v)}
                className="text-sm text-gray-500 hover:text-navy underline"
              >
                {showInactive
                  ? `Hide inactive staff (${inactiveStaff.length})`
                  : `Show inactive staff (${inactiveStaff.length})`}
              </button>

              {showInactive && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {inactiveStaff.map((member) => (
                    <div
                      key={member.id}
                      className="bg-gray-50 rounded-xl border border-gray-200 p-4 opacity-60 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-navy text-sm">
                          {member.first_name} {member.last_name}
                          <span className="ml-2 text-xs text-gray-400 font-normal">(Inactive)</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{getRoleLabel(member.role)}</p>
                      </div>
                      <button
                        onClick={() => handleReactivate(member.id)}
                        className="text-xs text-amber hover:underline font-medium shrink-0"
                      >
                        Reactivate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Certifications tab ────────────────────────────────────────────── */}
      {activeTab === 'certifications' && (
        <div className="space-y-4">
          {hasDraftCert && (
            <DraftNoticeBar
              onContinue={() => openAddCertModal(false)}
              onDiscard={clearCertDraft}
            />
          )}
          {certError && (
            <ErrorBar message={certError} onRetry={loadCertifications} />
          )}

          {/* Filter dropdowns */}
          <div className="flex flex-wrap gap-3">
            <select
              value={certFilterStaff}
              onChange={(e) => setCertFilterStaff(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
            >
              <option value="all">All Staff</option>
              {staffMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}{!m.is_active ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
            <select
              value={certFilterType}
              onChange={(e) => setCertFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
            >
              <option value="all">All Types</option>
              {CERTIFICATION_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </div>

          {/* Empty states */}
          {certifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-4xl mb-3">🏅</p>
              <p className="text-sm font-semibold text-navy mb-1">No certifications tracked yet</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Add your first certification to start monitoring staff compliance.
              </p>
              <button
                onClick={openAddCertModal}
                className="mt-4 text-sm text-amber hover:underline font-medium"
              >
                Add your first certification →
              </button>
            </div>
          ) : filteredCerts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-500">No certifications match these filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCerts.map((cert) => (
                <CertificationCard
                  key={cert.id}
                  cert={cert}
                  deleteConfirmId={deleteConfirmId}
                  deleting={deleting}
                  onEdit={() => openEditCertModal(cert)}
                  onDeleteRequest={() => setDeleteConfirmId(cert.id)}
                  onDeleteConfirm={() => handleDeleteCert(cert.id)}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Staff modal ─────────────────────────────────────────── */}
      <ModalShell
        isOpen={staffModalOpen}
        onClose={handleCloseStaffModal}
        isDirty={isStaffFormDirty}
        title={staffEditTarget ? 'Edit Staff Member' : 'Add Staff Member'}
        draftRestored={staffDraftRestored}
        onDismissDraft={dismissStaffDraft}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveStaff} className="space-y-4">
          {/* First name and last name side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                First Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Jane"
                value={staffForm.first_name}
                onChange={(e) => setStaffForm((p) => ({ ...p, first_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Last Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Smith"
                value={staffForm.last_name}
                onChange={(e) => setStaffForm((p) => ({ ...p, last_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">
              Role <span className="text-danger">*</span>
            </label>
            <select
              required
              value={staffForm.role}
              onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
            >
              <option value="">Select role...</option>
              {STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Email (optional) */}
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">
              Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              placeholder="jane@yourbrewery.com"
              value={staffForm.email}
              onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {/* Phone (optional) */}
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={staffForm.phone}
              onChange={(e) => setStaffForm((p) => ({ ...p, phone: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {staffModalError && (
            <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
              {staffModalError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleCloseStaffModal}
              className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSaveStaff || staffSaving}
              className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {staffSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  Saving...
                </span>
              ) : 'Save'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ── Add / Edit Certification modal ────────────────────────────────── */}
      <ModalShell
        isOpen={certModalOpen}
        onClose={handleCloseCertModal}
        isDirty={isCertFormDirty}
        title={certEditTarget ? 'Edit Certification' : 'Add Certification'}
        draftRestored={certDraftRestored}
        onDismissDraft={dismissCertDraft}
        maxWidth="max-w-lg"
      >
              <form onSubmit={handleSaveCert} className="space-y-4">

                {/* Staff member selection */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">
                    Staff Member <span className="text-danger">*</span>
                  </label>
                  <select
                    required
                    value={certForm.staff_member_id}
                    onChange={(e) => setCertForm((p) => ({ ...p, staff_member_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
                  >
                    <option value="">Select staff member...</option>
                    {activeStaffForDropdown.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} — {getRoleLabel(m.role)}
                      </option>
                    ))}
                  </select>
                  {activeStaffForDropdown.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Add a staff member first before logging a certification.
                    </p>
                  )}
                </div>

                {/* Certification type */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">
                    Certification Type <span className="text-danger">*</span>
                  </label>
                  <select
                    required
                    value={certForm.certification_type}
                    onChange={(e) => setCertForm((p) => ({ ...p, certification_type: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
                  >
                    <option value="">Select type...</option>
                    {CERTIFICATION_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>

                {/* Certification name — placeholder text responds to the selected type */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">
                    Certification Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={certForm.certification_name}
                    onChange={(e) => setCertForm((p) => ({ ...p, certification_name: e.target.value }))}
                    placeholder={CERT_NAME_PLACEHOLDERS[certForm.certification_type] ?? 'Enter certification name'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>

                {/* Issuing organization */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">
                    Issuing Organization <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. National Restaurant Association, State of Colorado"
                    value={certForm.issuing_organization}
                    onChange={(e) => setCertForm((p) => ({ ...p, issuing_organization: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>

                {/* Issue date and expiration date side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Issue Date <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={certForm.issue_date}
                      onChange={(e) => setCertForm((p) => ({ ...p, issue_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Expiration Date <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={certForm.expiration_date}
                      onChange={(e) => setCertForm((p) => ({ ...p, expiration_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                    />
                  </div>
                </div>

                {/* Certificate number */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">
                    Certificate Number <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789"
                    value={certForm.certificate_number}
                    onChange={(e) => setCertForm((p) => ({ ...p, certificate_number: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>

                {/* Link to a staff_certification document already uploaded in Documents */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">
                    Link to Document <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={certForm.document_id}
                    onChange={(e) => setCertForm((p) => ({ ...p, document_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
                  >
                    <option value="">No document linked</option>
                    {certDocuments.map((doc) => (
                      <option key={doc.id} value={doc.id}>{doc.document_name}</option>
                    ))}
                  </select>
                  {certDocuments.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Upload a Staff Certification document in the Documents tab to link it here.
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-1.5">
                    Notes <span className="text-gray-400 font-normal">(optional, max 500 characters)</span>
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Any notes about this certification..."
                    value={certForm.notes}
                    onChange={(e) => setCertForm((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
                  />
                  <p className="text-xs text-gray-400 text-right mt-0.5">{certForm.notes.length}/500</p>
                </div>

                {certModalError && (
                  <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
                    {certModalError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseCertModal}
                    className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSaveCert || certSaving}
                    className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
                  >
                    {certSaving ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                        Saving...
                      </span>
                    ) : 'Save'}
                  </button>
                </div>
              </form>
      </ModalShell>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Inline error bar with a retry button
function ErrorBar({ message, onRetry }) {
  return (
    <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3">
      <span>{message}</span>
      <button onClick={onRetry} className="underline font-medium whitespace-nowrap">Retry</button>
    </div>
  )
}

// Tab button for switching between the Staff Members and Certifications views
function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-navy text-white'
          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

// Card for one active staff member showing contact info, cert count, and actions
function StaffCard({
  member, certCount,
  deactivateTargetId, deactivating,
  onEdit, onDeactivateRequest, onDeactivateConfirm, onDeactivateCancel,
}) {
  const isConfirming = deactivateTargetId === member.id

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-navy">{member.first_name} {member.last_name}</p>
        <p className="text-xs text-amber font-medium mt-0.5">{getRoleLabel(member.role)}</p>
      </div>

      <div className="space-y-0.5">
        {member.email && <p className="text-xs text-gray-500">✉️ {member.email}</p>}
        {member.phone && <p className="text-xs text-gray-500">📞 {member.phone}</p>}
      </div>

      <p className="text-xs text-gray-400">
        🏅 {certCount} certification{certCount !== 1 ? 's' : ''} on file
      </p>

      {isConfirming ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">
            Deactivate {member.first_name}? Their certification records will be preserved.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onDeactivateConfirm}
              disabled={deactivating}
              className="flex-1 bg-danger text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {deactivating ? 'Deactivating...' : 'Yes, Deactivate'}
            </button>
            <button
              onClick={onDeactivateCancel}
              className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-3 mt-auto">
          <button
            onClick={onEdit}
            className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDeactivateRequest}
            className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-danger hover:text-danger transition-colors"
          >
            Deactivate
          </button>
        </div>
      )}
    </div>
  )
}

// Colour map for expiration urgency text
const EXP_COLOR = {
  expired: 'text-danger font-semibold',
  urgent:  'text-danger',
  warning: 'text-warning',
  ok:      'text-success',
}

// Card for one certification showing staff name, type badge, dates, and actions
function CertificationCard({
  cert,
  deleteConfirmId, deleting,
  onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}) {
  const expStatus  = getExpirationStatus(cert.expiration_date)
  const isConfirming = deleteConfirmId === cert.id

  // Highlight the card border when the cert is expired or expiring very soon
  const cardBorder =
    expStatus === 'expired' || expStatus === 'urgent' ? 'border-red-200' :
    expStatus === 'warning'                           ? 'border-amber/40' :
    'border-gray-200'

  return (
    <div className={`bg-white rounded-xl border p-4 flex flex-col gap-3 ${cardBorder}`}>
      {/* Staff name + type badge + cert name */}
      <div>
        <p className="font-semibold text-navy text-sm">
          {cert.staff_members
            ? `${cert.staff_members.first_name} ${cert.staff_members.last_name}`
            : 'Unknown'}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-amber/10 text-amber font-medium px-2 py-0.5 rounded-full">
            {getCertTypeLabel(cert.certification_type)}
          </span>
          <span className="text-xs font-medium text-navy">{cert.certification_name}</span>
        </div>
      </div>

      {cert.issuing_organization && (
        <p className="text-xs text-gray-500">Issued by: {cert.issuing_organization}</p>
      )}

      {/* Dates */}
      <div className="space-y-0.5">
        {cert.issue_date && (
          <p className="text-xs text-gray-500">Issued: {formatDate(cert.issue_date)}</p>
        )}
        {cert.expiration_date ? (
          <p className={`text-xs ${EXP_COLOR[expStatus] ?? 'text-gray-500'}`}>
            {expStatus === 'expired' ? '⚠️ Expired: ' : '📅 Expires: '}
            {formatDate(cert.expiration_date)}
            {expStatus === 'urgent'  && ' — expiring soon!'}
            {expStatus === 'expired' && ' — renewal required'}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">No expiration date set</p>
        )}
      </div>

      {cert.certificate_number && (
        <p className="text-xs text-gray-400">Certificate #: {cert.certificate_number}</p>
      )}

      {cert.notes && (
        <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-2">
          {cert.notes}
        </p>
      )}

      {isConfirming ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">
            Delete this certification? This cannot be undone.
          </p>
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
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-3 mt-auto">
          <button
            onClick={onEdit}
            className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors"
          >
            Edit
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
