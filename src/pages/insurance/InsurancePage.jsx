/**
 * InsurancePage — Insurance Policy Tracker.
 * Lets brewery owners record all insurance policies with coverage amounts,
 * premium details, renewal dates, and agent contact info. Cards are
 * colour-coded by expiration urgency and support expand-to-details.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'
import DraftNoticeBar from '../../components/DraftNoticeBar'

// ─── Constants ────────────────────────────────────────────────────────────────

const INSURANCE_TYPES = [
  { value: 'general_liability',    label: 'General Liability' },
  { value: 'liquor_liability',     label: 'Liquor Liability' },
  { value: 'product_liability',    label: 'Product Liability' },
  { value: 'property',             label: 'Property' },
  { value: 'workers_compensation', label: "Workers' Compensation" },
  { value: 'commercial_auto',      label: 'Commercial Auto' },
  { value: 'umbrella',             label: 'Umbrella' },
  { value: 'event_liability',      label: 'Event Liability' },
  { value: 'equipment_breakdown',  label: 'Equipment Breakdown' },
  { value: 'cyber_liability',      label: 'Cyber Liability' },
  { value: 'other',                label: 'Other' },
]

const PREMIUM_FREQUENCIES = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual',      label: 'Annual' },
]

// Placeholder text for policy name field changes based on selected insurance type
const POLICY_NAME_PLACEHOLDERS = {
  general_liability:    'e.g. General Liability Policy 2026',
  liquor_liability:     'e.g. Liquor Liability Coverage 2026',
  product_liability:    'e.g. Product Liability Policy 2026',
  property:             'e.g. Commercial Property Insurance 2026',
  workers_compensation: 'e.g. Workers Comp Policy 2026',
  commercial_auto:      'e.g. Commercial Auto Policy 2026',
  umbrella:             'e.g. Umbrella Policy 2026',
  event_liability:      'e.g. Special Event Insurance',
  equipment_breakdown:  'e.g. Equipment Breakdown Coverage 2026',
  cyber_liability:      'e.g. Cyber Liability Policy 2026',
  other:                'Enter policy name',
}

const EMPTY_FORM = {
  policy_name: '', insurance_type: '', carrier_name: '',
  agent_name: '', agent_email: '', agent_phone: '',
  policy_number: '', coverage_amount: '', deductible: '',
  premium_amount: '', premium_frequency: '',
  effective_date: '', expiration_date: '',
  auto_renews: false, renewal_notes: '',
  document_id: '', notes: '',
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

// Format a numeric value as a USD currency string with two decimal places
function formatCurrency(value) {
  if (value == null || value === '') return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

// Look up the display label for an insurance type value
function getTypeLabel(value) {
  return INSURANCE_TYPES.find((t) => t.value === value)?.label ?? value
}

// Look up the display label for a premium frequency value
function getFrequencyLabel(value) {
  return PREMIUM_FREQUENCIES.find((f) => f.value === value)?.label ?? value
}

// Convert a form string value to a float or null for numeric DB columns
function toNumericOrNull(str) {
  if (str === '' || str == null) return null
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InsurancePage() {
  const { brewery } = useAuth()
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner, hasDraft } = useModalDraft('modal_draft_insurance')

  // ── Data state ──
  const [policies,          setPolicies]          = useState([])
  const [insuranceDocs,     setInsuranceDocs]     = useState([])
  const [loading,           setLoading]           = useState(true)
  const [pageError,         setPageError]         = useState('')

  // ── Modal state ──
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editTarget,   setEditTarget]   = useState(null) // null = new policy
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [modalError,   setModalError]   = useState('')

  // ── Delete confirmation state ──
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleting,        setDeleting]        = useState(false)

  // ── Expanded card state — only one card open at a time ──
  const [expandedId, setExpandedId] = useState(null)

  // Load data once the brewery id is available
  useEffect(() => {
    if (!brewery?.id) return
    loadPolicies()
    loadInsuranceDocs()
  }, [brewery?.id])

  // Auto-save form to sessionStorage in add mode
  useEffect(() => {
    if (!modalOpen || editTarget) return
    saveDraft(form)
  }, [form, modalOpen, editTarget])

  // Fetch all insurance policies for this brewery, newest first
  async function loadPolicies() {
    setLoading(true)
    setPageError('')
    try {
      const { data, error } = await supabase
        .from('insurance_policies')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setPolicies(data ?? [])
    } catch {
      setPageError('Could not load insurance policies. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Fetch only documents of type 'insurance' so users can link a certificate
  // of insurance to a policy record in the Add/Edit modal
  async function loadInsuranceDocs() {
    const { data } = await supabase
      .from('brewery_documents')
      .select('id, document_name')
      .eq('brewery_id', brewery.id)
      .eq('document_type', 'insurance')
      .order('document_name', { ascending: true })
    setInsuranceDocs(data ?? [])
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  // Open the Add Policy modal — restore any saved draft into the form.
  // showBanner=false when the user clicked "Continue Draft" (they already know).
  function openAddModal(showBanner = true) {
    setEditTarget(null)
    setModalError('')
    const draft = loadDraft(showBanner)
    setForm(draft ? { ...EMPTY_FORM, ...draft } : EMPTY_FORM)
    setModalOpen(true)
  }

  // Open the Edit modal — clear any stale add-mode draft first
  function openEditModal(policy) {
    clearDraft()
    setEditTarget(policy)
    setForm({
      policy_name:       policy.policy_name,
      insurance_type:    policy.insurance_type,
      carrier_name:      policy.carrier_name,
      agent_name:        policy.agent_name        ?? '',
      agent_email:       policy.agent_email       ?? '',
      agent_phone:       policy.agent_phone       ?? '',
      policy_number:     policy.policy_number     ?? '',
      coverage_amount:   policy.coverage_amount   != null ? String(policy.coverage_amount) : '',
      deductible:        policy.deductible        != null ? String(policy.deductible)       : '',
      premium_amount:    policy.premium_amount    != null ? String(policy.premium_amount)   : '',
      premium_frequency: policy.premium_frequency ?? '',
      effective_date:    policy.effective_date    ?? '',
      expiration_date:   policy.expiration_date   ?? '',
      auto_renews:       policy.auto_renews       ?? false,
      renewal_notes:     policy.renewal_notes     ?? '',
      document_id:       policy.document_id       ?? '',
      notes:             policy.notes             ?? '',
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

  // Insert a new policy or update an existing one depending on editTarget
  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setModalError('')

    const payload = {
      brewery_id:        brewery.id,
      policy_name:       form.policy_name.trim(),
      insurance_type:    form.insurance_type,
      carrier_name:      form.carrier_name.trim(),
      agent_name:        form.agent_name.trim()    || null,
      agent_email:       form.agent_email.trim()   || null,
      agent_phone:       form.agent_phone.trim()   || null,
      policy_number:     form.policy_number.trim() || null,
      coverage_amount:   toNumericOrNull(form.coverage_amount),
      deductible:        toNumericOrNull(form.deductible),
      premium_amount:    toNumericOrNull(form.premium_amount),
      premium_frequency: form.premium_frequency    || null,
      effective_date:    form.effective_date       || null,
      expiration_date:   form.expiration_date      || null,
      auto_renews:       form.auto_renews,
      renewal_notes:     form.renewal_notes.trim() || null,
      document_id:       form.document_id          || null,
      notes:             form.notes.trim()         || null,
    }

    try {
      if (editTarget) {
        const { error } = await supabase
          .from('insurance_policies')
          .update(payload)
          .eq('id', editTarget.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('insurance_policies')
          .insert(payload)
        if (error) throw error
      }
      await loadPolicies()
      handleCloseModal()
    } catch (err) {
      setModalError(err.message || 'Could not save policy. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Permanently delete a policy after the user confirms in the card
  async function handleDelete(policyId) {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('insurance_policies')
        .delete()
        .eq('id', policyId)
      if (error) throw error
      setDeleteConfirmId(null)
      // Remove from local state immediately so the UI updates without a refetch
      setPolicies((prev) => prev.filter((p) => p.id !== policyId))
    } catch {
      alert('Could not delete policy. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // Toggle the expanded details panel for a card; collapse if already open
  function toggleExpand(policyId) {
    setExpandedId((prev) => (prev === policyId ? null : policyId))
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  // Count of policies with an expiration date in the next 90 days (future only)
  const expiringSoon90 = policies.filter((p) => {
    const status = getExpirationStatus(p.expiration_date)
    return status === 'urgent' || status === 'warning'
  }).length

  // Whether the Save button should be enabled
  const canSave = form.policy_name.trim() && form.insurance_type && form.carrier_name.trim()

  // Dirty = add mode AND any main field has data (edit modals close without warning)
  const isFormDirty = !editTarget && !!(form.policy_name.trim() || form.insurance_type || form.carrier_name.trim() || form.agent_name.trim() || form.policy_number.trim() || form.coverage_amount || form.expiration_date || form.notes.trim())

  if (loading) return <LoadingSpinner message="Loading insurance policies..." />

  return (
    <div className="space-y-4">

      {/* Disclaimer */}
      <DismissibleDisclaimer
        storageKey="disclaimer_insurance_dismissed"
        text="Insurance tracking is provided as a convenience only. Always work directly with your licensed insurance agent to ensure adequate coverage. Coverage requirements vary by state and license type."
      />

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">🛡️ Insurance Policies</h2>
        <button
          onClick={() => openAddModal(!hasDraft)}
          title={hasDraft ? "You have an unsaved draft — click to continue where you left off" : undefined}
          className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors relative"
        >
          {hasDraft && (
            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
          )}
          {hasDraft ? 'Continue Draft' : '+ Add Policy'}
        </button>
      </div>

      {/* Draft notice — shown when an unsaved policy draft exists */}
      {hasDraft && (
        <DraftNoticeBar
          onContinue={() => openAddModal(false)}
          onDiscard={clearDraft}
        />
      )}

      {/* Summary row */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Policies</p>
            <p className="text-2xl font-bold text-navy">{policies.length}</p>
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
          <button onClick={loadPolicies} className="underline font-medium whitespace-nowrap">Retry</button>
        </div>
      )}

      {/* Policy grid or empty state */}
      {policies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-3">🛡️</p>
          <p className="text-sm font-semibold text-navy mb-1">No insurance policies added yet</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Add your first policy to keep all your insurance coverage organized and get renewal reminders.
          </p>
          <button
            onClick={openAddModal}
            className="mt-4 text-sm text-amber hover:underline font-medium"
          >
            Add your first policy →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              expanded={expandedId === policy.id}
              deleteConfirmId={deleteConfirmId}
              deleting={deleting}
              insuranceDocs={insuranceDocs}
              onToggleExpand={() => toggleExpand(policy.id)}
              onEdit={() => openEditModal(policy)}
              onDeleteRequest={() => setDeleteConfirmId(policy.id)}
              onDeleteConfirm={() => handleDelete(policy.id)}
              onDeleteCancel={() => setDeleteConfirmId(null)}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ─────────────────────────────────────────────── */}
      <ModalShell
        isOpen={modalOpen}
        onClose={handleCloseModal}
        isDirty={isFormDirty}
        title={editTarget ? 'Edit Insurance Policy' : 'Add Insurance Policy'}
        draftRestored={draftRestored}
        onDismissDraft={dismissDraftBanner}
        maxWidth="max-w-2xl"
      >
              <form onSubmit={handleSave} className="space-y-5">

                {/* ── Section: Policy basics ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Policy Details</p>

                  {/* Insurance type */}
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Insurance Type <span className="text-danger">*</span>
                    </label>
                    <select
                      required
                      value={form.insurance_type}
                      onChange={(e) => setForm((p) => ({ ...p, insurance_type: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
                    >
                      <option value="">Select type...</option>
                      {INSURANCE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Policy name — placeholder text responds to selected type */}
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Policy Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.policy_name}
                      onChange={(e) => setForm((p) => ({ ...p, policy_name: e.target.value }))}
                      placeholder={POLICY_NAME_PLACEHOLDERS[form.insurance_type] ?? 'Enter policy name'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                    />
                  </div>

                  {/* Carrier name + Policy number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Carrier Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. State Farm, Nationwide"
                        value={form.carrier_name}
                        onChange={(e) => setForm((p) => ({ ...p, carrier_name: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Policy Number <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. GL-2026-123456"
                        value={form.policy_number}
                        onChange={(e) => setForm((p) => ({ ...p, policy_number: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Section: Agent contact ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Agent Contact</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Agent Name <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={form.agent_name}
                        onChange={(e) => setForm((p) => ({ ...p, agent_name: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Agent Phone <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={form.agent_phone}
                        onChange={(e) => setForm((p) => ({ ...p, agent_phone: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Agent Email <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="agent@insurancecompany.com"
                      value={form.agent_email}
                      onChange={(e) => setForm((p) => ({ ...p, agent_email: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                    />
                  </div>
                </div>

                {/* ── Section: Coverage & Premium ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Coverage &amp; Premium</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Coverage Amount <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="1,000,000.00"
                          value={form.coverage_amount}
                          onChange={(e) => setForm((p) => ({ ...p, coverage_amount: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Deductible <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="1,000.00"
                          value={form.deductible}
                          onChange={(e) => setForm((p) => ({ ...p, deductible: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Premium Amount <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="500.00"
                          value={form.premium_amount}
                          onChange={(e) => setForm((p) => ({ ...p, premium_amount: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Premium Frequency <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <select
                        value={form.premium_frequency}
                        onChange={(e) => setForm((p) => ({ ...p, premium_frequency: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
                      >
                        <option value="">Select frequency...</option>
                        {PREMIUM_FREQUENCIES.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── Section: Dates & Renewal ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dates &amp; Renewal</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Effective Date <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={form.effective_date}
                        onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-1.5">
                        Expiration Date <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={form.expiration_date}
                        onChange={(e) => setForm((p) => ({ ...p, expiration_date: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                      />
                    </div>
                  </div>

                  {/* Auto-renews toggle */}
                  <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-navy">Auto-Renews</p>
                      <p className="text-xs text-gray-500 mt-0.5">Does this policy renew automatically?</p>
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

                  {/* Renewal notes */}
                  <div>
                    <label className="block text-sm font-semibold text-navy mb-1.5">
                      Renewal Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Contact agent 60 days before expiration, requires updated revenue figures..."
                      value={form.renewal_notes}
                      onChange={(e) => setForm((p) => ({ ...p, renewal_notes: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
                    />
                  </div>
                </div>

                {/* ── Section: Documents & Notes ── */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Documents &amp; Notes</p>

                  {/* Link to an uploaded insurance document */}
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
                      {insuranceDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>{doc.document_name}</option>
                      ))}
                    </select>
                    {insuranceDocs.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        Upload an Insurance document in the Documents tab to link it here.
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
                      placeholder="Any additional notes about this policy..."
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
                    ) : 'Save Policy'}
                  </button>
                </div>
              </form>
      </ModalShell>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Colour classes for the expiration date row
const EXP_TEXT = {
  expired: 'text-danger font-semibold',
  urgent:  'text-danger',
  warning: 'text-warning',
  ok:      'text-success',
}

// Card border accent for expired/urgent policies so they stand out in the grid
const EXP_BORDER = {
  expired: 'border-red-300',
  urgent:  'border-red-200',
  warning: 'border-amber/40',
  ok:      'border-gray-200',
}

// Card showing one insurance policy with optional expand-to-details panel
function PolicyCard({
  policy, expanded, deleteConfirmId, deleting, insuranceDocs,
  onToggleExpand, onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}) {
  const expStatus    = getExpirationStatus(policy.expiration_date)
  const isConfirming = deleteConfirmId === policy.id
  const linkedDoc    = insuranceDocs.find((d) => d.id === policy.document_id)

  return (
    <div className={`bg-white rounded-xl border p-4 flex flex-col gap-3 ${EXP_BORDER[expStatus] ?? 'border-gray-200'}`}>

      {/* Policy name + type badge */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-navy leading-tight">{policy.policy_name}</p>
          {linkedDoc && (
            <span title={`Linked: ${linkedDoc.document_name}`} className="text-gray-400 shrink-0">📎</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-navy text-white font-medium px-2 py-0.5 rounded-full">
            {getTypeLabel(policy.insurance_type)}
          </span>
          {policy.auto_renews && (
            <span className="text-xs bg-green-100 text-success font-medium px-2 py-0.5 rounded-full">
              Auto-Renews
            </span>
          )}
        </div>
      </div>

      {/* Carrier and agent */}
      <div className="space-y-0.5">
        <p className="text-xs text-gray-700 font-medium">{policy.carrier_name}</p>
        {policy.agent_name && (
          <p className="text-xs text-gray-500">Agent: {policy.agent_name}</p>
        )}
        {policy.policy_number && (
          <p className="text-xs text-gray-400">Policy #: {policy.policy_number}</p>
        )}
      </div>

      {/* Coverage and premium */}
      <div className="space-y-0.5">
        {policy.coverage_amount != null && (
          <p className="text-xs text-gray-700">
            Coverage: <span className="font-semibold">{formatCurrency(policy.coverage_amount)}</span>
          </p>
        )}
        {policy.premium_amount != null && (
          <p className="text-xs text-gray-500">
            Premium: {formatCurrency(policy.premium_amount)}
            {policy.premium_frequency ? ` / ${getFrequencyLabel(policy.premium_frequency).toLowerCase()}` : ''}
          </p>
        )}
      </div>

      {/* Dates with expiration colour-coding */}
      <div className="space-y-0.5">
        {policy.effective_date && (
          <p className="text-xs text-gray-500">Effective: {formatDate(policy.effective_date)}</p>
        )}
        {policy.expiration_date ? (
          <p className={`text-xs ${EXP_TEXT[expStatus] ?? 'text-gray-500'}`}>
            {expStatus === 'expired' ? '⚠️ Expired: ' : '📅 Expires: '}
            {formatDate(policy.expiration_date)}
            {expStatus === 'urgent'  && ' — renew soon!'}
            {expStatus === 'expired' && ' — renewal required'}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">No expiration date set</p>
        )}
      </div>

      {/* Expanded details panel */}
      {expanded && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          {policy.deductible != null && (
            <p className="text-xs text-gray-600">Deductible: {formatCurrency(policy.deductible)}</p>
          )}
          {policy.agent_email && (
            <p className="text-xs text-gray-600">
              Agent email:{' '}
              <a href={`mailto:${policy.agent_email}`} className="text-amber hover:underline">
                {policy.agent_email}
              </a>
            </p>
          )}
          {policy.agent_phone && (
            <p className="text-xs text-gray-600">Agent phone: {policy.agent_phone}</p>
          )}
          {policy.renewal_notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500">Renewal notes:</p>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{policy.renewal_notes}</p>
            </div>
          )}
          {policy.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500">Notes:</p>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{policy.notes}</p>
            </div>
          )}
          {linkedDoc && (
            <p className="text-xs text-gray-500">📎 Linked document: {linkedDoc.document_name}</p>
          )}
        </div>
      )}

      {/* Delete confirmation or action buttons */}
      {isConfirming ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">Delete this policy? This cannot be undone.</p>
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
