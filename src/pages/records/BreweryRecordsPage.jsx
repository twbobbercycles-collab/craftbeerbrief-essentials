/**
 * BreweryRecordsPage — unified view of Documents, Insurance Policies, and Local Permits.
 * Replaces the separate /documents, /insurance, and /permits pages.
 * All three data sets are fetched in parallel on mount and displayed in separate tabs.
 */
import { useEffect, useState, useRef } from 'react'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useReadOnly } from '../../hooks/useReadOnly'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: 'federal_license',     label: 'Federal License',     description: "Brewer's Notice and TTB documents" },
  { value: 'state_license',       label: 'State License',       description: 'State brewery and manufacturer licenses' },
  { value: 'taproom_permit',      label: 'Taproom Permit',      description: 'Taproom and retail permits' },
  { value: 'health_permit',       label: 'Health Permit',       description: 'Health department permits and inspections' },
  { value: 'insurance',           label: 'Insurance',           description: 'Insurance certificates and policies' },
  { value: 'local_permit',        label: 'Local Permit',        description: 'Municipal and zoning permits' },
  { value: 'staff_certification', label: 'Staff Certification', description: 'Staff alcohol service certifications' },
  { value: 'other',               label: 'Other',               description: 'Anything else' },
]

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
  { value: 'monthly',    label: 'Monthly' },
  { value: 'quarterly',  label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual',     label: 'Annual' },
]

const PERMIT_TYPES = [
  { value: 'business_license',    label: 'Business License' },
  { value: 'zoning',              label: 'Zoning' },
  { value: 'building',            label: 'Building' },
  { value: 'sign_permit',         label: 'Sign Permit' },
  { value: 'outdoor_seating',     label: 'Outdoor Seating' },
  { value: 'live_entertainment',  label: 'Live Entertainment' },
  { value: 'noise_variance',      label: 'Noise Variance' },
  { value: 'parking',             label: 'Parking' },
  { value: 'fire_safety',         label: 'Fire Safety' },
  { value: 'food_service',        label: 'Food Service' },
  { value: 'special_event',       label: 'Special Event' },
  { value: 'sidewalk',            label: 'Sidewalk' },
  { value: 'other',               label: 'Other' },
]

const ALLOWED_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

// ─── Utility functions ────────────────────────────────────────────────────────

function getExpirationStatus(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.floor((exp - today) / 86400000)
  if (diffDays < 0)   return 'expired'
  if (diffDays <= 30) return 'urgent'
  if (diffDays <= 90) return 'warning'
  return 'ok'
}

function ExpirationBadge({ dateStr }) {
  const status = getExpirationStatus(dateStr)
  if (!status) return null
  const cls = { expired: 'text-danger font-semibold', urgent: 'text-danger', warning: 'text-warning', ok: 'text-success' }
  return (
    <p className={`text-xs ${cls[status]}`}>
      {status === 'expired' ? '⚠️ Expired: ' : '📅 Expires: '}
      {formatDate(dateStr)}
      {status === 'urgent' && ' — expiring soon!'}
      {status === 'expired' && ' — renewal required'}
    </p>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCurrency(val) {
  if (val == null || val === '') return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
}

// ─── Empty insurance / permit form defaults ───────────────────────────────────

const EMPTY_INSURANCE = {
  policy_name: '', insurance_type: '', carrier_name: '', agent_name: '', agent_email: '',
  agent_phone: '', policy_number: '', coverage_amount: '', deductible: '', premium_amount: '',
  premium_frequency: '', effective_date: '', expiration_date: '', auto_renews: false,
  renewal_notes: '', notes: '',
}

const EMPTY_PERMIT = {
  permit_name: '', permit_type: '', issuing_authority: '', authority_contact_name: '',
  authority_contact_email: '', authority_contact_phone: '', permit_number: '',
  issue_date: '', expiration_date: '', auto_renews: false, renewal_fee: '',
  renewal_notes: '', notes: '', is_active: true,
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BreweryRecordsPage() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()
  const fileInputRef = useRef(null)

  const docDraft  = useModalDraft('modal_draft_document')
  const insDraft  = useModalDraft('modal_draft_insurance')
  const permDraft = useModalDraft('modal_draft_permit')

  const [activeTab, setActiveTab] = usePersistedTab('records_active_tab', 'documents')

  // ── Data ──
  const [documents,  setDocuments]  = useState([])
  const [insurance,  setInsurance]  = useState([])
  const [permits,    setPermits]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [pageError,  setPageError]  = useState('')

  // ── Document upload modal ──
  const [docModalOpen,    setDocModalOpen]    = useState(false)
  const [docForm,         setDocForm]         = useState({ name: '', type: '', expiration_date: '', notes: '', file: null })
  const [isDragOver,      setIsDragOver]      = useState(false)
  const [uploading,       setUploading]       = useState(false)
  const [uploadError,     setUploadError]     = useState('')
  const [uploadSuccess,   setUploadSuccess]   = useState(false)

  // ── Document delete ──
  const [docDeleteId, setDocDeleteId] = useState(null)
  const [deleting,    setDeleting]    = useState(false)

  // ── Insurance modal ──
  const [insModalOpen,   setInsModalOpen]   = useState(false)
  const [insEditId,      setInsEditId]      = useState(null)
  const [insForm,        setInsForm]        = useState(EMPTY_INSURANCE)
  const [insSaving,      setInsSaving]      = useState(false)
  const [insError,       setInsError]       = useState('')
  const [insDeleteId,    setInsDeleteId]    = useState(null)
  const [insDeletingId,  setInsDeletingId]  = useState(null)

  // ── Permit modal ──
  const [permModalOpen,  setPermModalOpen]  = useState(false)
  const [permEditId,     setPermEditId]     = useState(null)
  const [permForm,       setPermForm]       = useState(EMPTY_PERMIT)
  const [permSaving,     setPermSaving]     = useState(false)
  const [permError,      setPermError]      = useState('')
  const [permDeleteId,   setPermDeleteId]   = useState(null)
  const [permDeletingId, setPermDeletingId] = useState(null)

  // ── Load all data ──
  useEffect(() => {
    if (!brewery?.id) return
    loadAll()
  }, [brewery?.id])

  // Auto-save document draft while modal is open
  useEffect(() => {
    if (!docModalOpen) return
    const { file, ...rest } = docForm
    docDraft.saveDraft(rest)
  }, [docForm, docModalOpen])

  // Auto-save insurance draft
  useEffect(() => {
    if (!insModalOpen) return
    insDraft.saveDraft(insForm)
  }, [insForm, insModalOpen])

  // Auto-save permit draft
  useEffect(() => {
    if (!permModalOpen) return
    permDraft.saveDraft(permForm)
  }, [permForm, permModalOpen])

  async function loadAll() {
    setLoading(true)
    setPageError('')
    try {
      const [docRes, insRes, permRes] = await Promise.all([
        supabase.from('brewery_documents').select('*').eq('brewery_id', brewery.id).order('created_at', { ascending: false }),
        supabase.from('insurance_policies').select('*').eq('brewery_id', brewery.id).order('expiration_date', { ascending: true }),
        supabase.from('local_permits').select('*').eq('brewery_id', brewery.id).order('expiration_date', { ascending: true }),
      ])
      if (docRes.error)  throw docRes.error
      if (insRes.error)  throw insRes.error
      if (permRes.error) throw permRes.error
      setDocuments(docRes.data  ?? [])
      setInsurance(insRes.data  ?? [])
      setPermits(permRes.data   ?? [])
    } catch {
      setPageError('Could not load records. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Document handlers ──────────────────────────────────────────────────────

  function validateAndSetFile(file) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError('File type not allowed. Please upload a PDF, JPG, PNG, DOC, or DOCX file.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File is too large. Maximum allowed size is 25 MB.')
      return
    }
    setUploadError('')
    setDocForm(prev => ({ ...prev, file }))
  }

  function openDocModal(showBanner = true) {
    const draft = docDraft.loadDraft(showBanner)
    if (draft) setDocForm(prev => ({ ...prev, ...draft }))
    setDocModalOpen(true)
  }

  function closeDocModal() {
    docDraft.clearDraft()
    setDocForm({ name: '', type: '', expiration_date: '', notes: '', file: null })
    setUploadError('')
    setUploadSuccess(false)
    setIsDragOver(false)
    setDocModalOpen(false)
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!docForm.file || !docForm.name.trim() || !docForm.type) return
    setUploading(true); setUploadError(''); setUploadSuccess(false)
    try {
      const safeName = docForm.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${brewery.id}/${Date.now()}_${safeName}`
      const { error: storageErr } = await supabase.storage.from('brewery-documents').upload(filePath, docForm.file, { contentType: docForm.file.type, upsert: false })
      if (storageErr) throw storageErr
      const { error: dbErr } = await supabase.from('brewery_documents').insert({
        brewery_id: brewery.id, document_name: docForm.name.trim(),
        document_type: docForm.type, file_path: filePath,
        file_size: docForm.file.size,
        expiration_date: docForm.expiration_date || null,
        notes: docForm.notes.trim() || null,
      })
      if (dbErr) {
        await supabase.storage.from('brewery-documents').remove([filePath])
        throw dbErr
      }
      docDraft.clearDraft()
      setUploadSuccess(true)
      setDocForm({ name: '', type: '', expiration_date: '', notes: '', file: null })
      const { data } = await supabase.from('brewery_documents').select('*').eq('brewery_id', brewery.id).order('created_at', { ascending: false })
      setDocuments(data ?? [])
      setTimeout(() => { setDocModalOpen(false); setUploadSuccess(false) }, 1500)
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDocDownload(filePath, fileName) {
    try {
      const { data, error } = await supabase.storage.from('brewery-documents').createSignedUrl(filePath, 3600)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      alert(`Could not open "${fileName}". Please try again.`)
    }
  }

  async function handleDocDelete(docId, filePath) {
    setDeleting(true)
    try {
      await supabase.storage.from('brewery-documents').remove([filePath])
      const { error } = await supabase.from('brewery_documents').delete().eq('id', docId)
      if (error) throw error
      setDocDeleteId(null)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch {
      alert('Could not delete the document. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Insurance handlers ─────────────────────────────────────────────────────

  function openAddInsurance() {
    const draft = insDraft.loadDraft(true)
    setInsForm(draft ? { ...EMPTY_INSURANCE, ...draft } : EMPTY_INSURANCE)
    setInsEditId(null); setInsError(''); setInsModalOpen(true)
  }

  function openEditInsurance(policy) {
    setInsForm({
      policy_name: policy.policy_name ?? '',
      insurance_type: policy.insurance_type ?? '',
      carrier_name: policy.carrier_name ?? '',
      agent_name: policy.agent_name ?? '',
      agent_email: policy.agent_email ?? '',
      agent_phone: policy.agent_phone ?? '',
      policy_number: policy.policy_number ?? '',
      coverage_amount: policy.coverage_amount ?? '',
      deductible: policy.deductible ?? '',
      premium_amount: policy.premium_amount ?? '',
      premium_frequency: policy.premium_frequency ?? '',
      effective_date: policy.effective_date ?? '',
      expiration_date: policy.expiration_date ?? '',
      auto_renews: policy.auto_renews ?? false,
      renewal_notes: policy.renewal_notes ?? '',
      notes: policy.notes ?? '',
    })
    setInsEditId(policy.id); setInsError(''); setInsModalOpen(true)
  }

  function closeInsModal() {
    insDraft.clearDraft()
    setInsForm(EMPTY_INSURANCE); setInsEditId(null); setInsError(''); setInsModalOpen(false)
  }

  async function handleInsSave(e) {
    e.preventDefault()
    setInsSaving(true); setInsError('')
    const payload = {
      brewery_id: brewery.id,
      policy_name: insForm.policy_name.trim(),
      insurance_type: insForm.insurance_type,
      carrier_name: insForm.carrier_name.trim(),
      agent_name: insForm.agent_name.trim() || null,
      agent_email: insForm.agent_email.trim() || null,
      agent_phone: insForm.agent_phone.trim() || null,
      policy_number: insForm.policy_number.trim() || null,
      coverage_amount: insForm.coverage_amount !== '' ? Number(insForm.coverage_amount) : null,
      deductible: insForm.deductible !== '' ? Number(insForm.deductible) : null,
      premium_amount: insForm.premium_amount !== '' ? Number(insForm.premium_amount) : null,
      premium_frequency: insForm.premium_frequency || null,
      effective_date: insForm.effective_date || null,
      expiration_date: insForm.expiration_date || null,
      auto_renews: insForm.auto_renews,
      renewal_notes: insForm.renewal_notes.trim() || null,
      notes: insForm.notes.trim() || null,
    }
    try {
      let err
      if (insEditId) {
        ;({ error: err } = await supabase.from('insurance_policies').update(payload).eq('id', insEditId))
      } else {
        ;({ error: err } = await supabase.from('insurance_policies').insert(payload))
      }
      if (err) throw err
      insDraft.clearDraft()
      const { data } = await supabase.from('insurance_policies').select('*').eq('brewery_id', brewery.id).order('expiration_date', { ascending: true })
      setInsurance(data ?? [])
      closeInsModal()
    } catch (err) {
      setInsError(err.message || 'Could not save. Please try again.')
    } finally {
      setInsSaving(false)
    }
  }

  async function handleInsDelete(id) {
    setInsDeletingId(id)
    try {
      const { error } = await supabase.from('insurance_policies').delete().eq('id', id)
      if (error) throw error
      setInsurance(prev => prev.filter(p => p.id !== id))
      setInsDeleteId(null)
    } catch {
      alert('Could not delete policy. Please try again.')
    } finally {
      setInsDeletingId(null)
    }
  }

  // ── Permit handlers ────────────────────────────────────────────────────────

  function openAddPermit() {
    const draft = permDraft.loadDraft(true)
    setPermForm(draft ? { ...EMPTY_PERMIT, ...draft } : EMPTY_PERMIT)
    setPermEditId(null); setPermError(''); setPermModalOpen(true)
  }

  function openEditPermit(permit) {
    setPermForm({
      permit_name: permit.permit_name ?? '',
      permit_type: permit.permit_type ?? '',
      issuing_authority: permit.issuing_authority ?? '',
      authority_contact_name: permit.authority_contact_name ?? '',
      authority_contact_email: permit.authority_contact_email ?? '',
      authority_contact_phone: permit.authority_contact_phone ?? '',
      permit_number: permit.permit_number ?? '',
      issue_date: permit.issue_date ?? '',
      expiration_date: permit.expiration_date ?? '',
      auto_renews: permit.auto_renews ?? false,
      renewal_fee: permit.renewal_fee ?? '',
      renewal_notes: permit.renewal_notes ?? '',
      notes: permit.notes ?? '',
      is_active: permit.is_active ?? true,
    })
    setPermEditId(permit.id); setPermError(''); setPermModalOpen(true)
  }

  function closePermModal() {
    permDraft.clearDraft()
    setPermForm(EMPTY_PERMIT); setPermEditId(null); setPermError(''); setPermModalOpen(false)
  }

  async function handlePermSave(e) {
    e.preventDefault()
    setPermSaving(true); setPermError('')
    const payload = {
      brewery_id: brewery.id,
      permit_name: permForm.permit_name.trim(),
      permit_type: permForm.permit_type,
      issuing_authority: permForm.issuing_authority.trim(),
      authority_contact_name: permForm.authority_contact_name.trim() || null,
      authority_contact_email: permForm.authority_contact_email.trim() || null,
      authority_contact_phone: permForm.authority_contact_phone.trim() || null,
      permit_number: permForm.permit_number.trim() || null,
      issue_date: permForm.issue_date || null,
      expiration_date: permForm.expiration_date || null,
      auto_renews: permForm.auto_renews,
      renewal_fee: permForm.renewal_fee !== '' ? Number(permForm.renewal_fee) : null,
      renewal_notes: permForm.renewal_notes.trim() || null,
      notes: permForm.notes.trim() || null,
      is_active: permForm.is_active,
    }
    try {
      let err
      if (permEditId) {
        ;({ error: err } = await supabase.from('local_permits').update(payload).eq('id', permEditId))
      } else {
        ;({ error: err } = await supabase.from('local_permits').insert(payload))
      }
      if (err) throw err
      permDraft.clearDraft()
      const { data } = await supabase.from('local_permits').select('*').eq('brewery_id', brewery.id).order('expiration_date', { ascending: true })
      setPermits(data ?? [])
      closePermModal()
    } catch (err) {
      setPermError(err.message || 'Could not save. Please try again.')
    } finally {
      setPermSaving(false)
    }
  }

  async function handlePermDelete(id) {
    setPermDeletingId(id)
    try {
      const { error } = await supabase.from('local_permits').delete().eq('id', id)
      if (error) throw error
      setPermits(prev => prev.filter(p => p.id !== id))
      setPermDeleteId(null)
    } catch {
      alert('Could not delete permit. Please try again.')
    } finally {
      setPermDeletingId(null)
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const isDocFormDirty = !!(docForm.name.trim() || docForm.type || docForm.expiration_date || docForm.notes || docForm.file)
  const isInsFormDirty = Object.values(insForm).some(v => v !== '' && v !== false)
  const isPermFormDirty = permForm.permit_name.trim() !== '' || permForm.permit_type !== '' || permForm.issuing_authority.trim() !== ''
  const canUpload = docForm.name.trim() && docForm.type && docForm.file

  const expiringCount = [
    ...insurance.filter(p => ['expired','urgent','warning'].includes(getExpirationStatus(p.expiration_date))),
    ...permits.filter(p => p.is_active && ['expired','urgent','warning'].includes(getExpirationStatus(p.expiration_date))),
    ...documents.filter(d => ['expired','urgent','warning'].includes(getExpirationStatus(d.expiration_date))),
  ].length

  if (loading) return <LoadingSpinner message="Loading brewery records..." />

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">🗂️ Brewery Records</h2>
        {expiringCount > 0 && (
          <span className="text-xs bg-red-50 text-danger border border-danger/30 px-3 py-1.5 rounded-lg font-semibold">
            ⚠️ {expiringCount} {expiringCount === 1 ? 'record' : 'records'} expiring or expired
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon="📁" label="Documents" count={documents.length} onClick={() => setActiveTab('documents')} active={activeTab === 'documents'} />
        <SummaryCard icon="🛡️" label="Insurance" count={insurance.length} onClick={() => setActiveTab('insurance')} active={activeTab === 'insurance'} />
        <SummaryCard icon="📍" label="Permits" count={permits.filter(p => p.is_active).length} onClick={() => setActiveTab('permits')} active={activeTab === 'permits'} />
      </div>

      {/* Privacy notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-lg shrink-0">🔒</span>
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Your records are yours.</strong> Everything you store here is private to your brewery account. We never share your data with third parties. You can download or delete your files at any time in Account Settings.
        </p>
      </div>

      <DismissibleDisclaimer
        storageKey="disclaimer_records_dismissed"
        text="Document storage is provided as a convenience only. Always maintain your own backup copies of all license, permit, and insurance documents."
      />

      {pageError && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{pageError}</span>
          <button onClick={loadAll} className="underline font-medium whitespace-nowrap">Retry</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1.5">
        <TabButton label="Documents" count={documents.length} active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} />
        <TabButton label="Insurance" count={insurance.length} active={activeTab === 'insurance'} onClick={() => setActiveTab('insurance')} />
        <TabButton label="Local Permits" count={permits.length} active={activeTab === 'permits'} onClick={() => setActiveTab('permits')} />
      </div>

      {/* ── Documents tab ── */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500">{documents.length} {documents.length === 1 ? 'document' : 'documents'} stored</p>
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button
                onClick={() => openDocModal(!docDraft.hasDraft)}
                disabled={isReadOnly}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors relative disabled:opacity-60"
              >
                {docDraft.hasDraft && (
                  <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
                )}
                {docDraft.hasDraft ? 'Continue Draft' : '+ Upload Document'}
              </button>
            </ReadOnlyTooltip>
          </div>

          {docDraft.hasDraft && (
            <DraftNoticeBar onContinue={() => openDocModal(false)} onDiscard={docDraft.clearDraft} />
          )}

          {documents.length === 0 ? (
            <EmptyState icon="📄" message="No documents uploaded yet" sub="Upload your license files, permits, and insurance certificates to keep everything in one place." action="Upload a document →" onAction={openDocModal} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documents.map(doc => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  deleteConfirmId={docDeleteId}
                  deleting={deleting}
                  onDownload={handleDocDownload}
                  onDeleteRequest={setDocDeleteId}
                  onDeleteConfirm={handleDocDelete}
                  onDeleteCancel={() => setDocDeleteId(null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Insurance tab ── */}
      {activeTab === 'insurance' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500">{insurance.length} {insurance.length === 1 ? 'policy' : 'policies'} tracked</p>
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button
                onClick={openAddInsurance}
                disabled={isReadOnly}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                + Add Policy
              </button>
            </ReadOnlyTooltip>
          </div>

          {insDraft.hasDraft && !insModalOpen && (
            <DraftNoticeBar onContinue={openAddInsurance} onDiscard={insDraft.clearDraft} />
          )}

          {insurance.length === 0 ? (
            <EmptyState icon="🛡️" message="No insurance policies tracked yet" sub="Add your general liability, liquor liability, property, and other policies to track renewals and coverage in one place." action="Add a policy →" onAction={openAddInsurance} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insurance.map(policy => (
                <InsuranceCard
                  key={policy.id}
                  policy={policy}
                  deleteConfirmId={insDeleteId}
                  deletingId={insDeletingId}
                  onEdit={() => openEditInsurance(policy)}
                  onDeleteRequest={setInsDeleteId}
                  onDeleteConfirm={handleInsDelete}
                  onDeleteCancel={() => setInsDeleteId(null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Permits tab ── */}
      {activeTab === 'permits' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500">{permits.filter(p => p.is_active).length} active / {permits.length} total</p>
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button
                onClick={openAddPermit}
                disabled={isReadOnly}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                + Add Permit
              </button>
            </ReadOnlyTooltip>
          </div>

          {permDraft.hasDraft && !permModalOpen && (
            <DraftNoticeBar onContinue={openAddPermit} onDiscard={permDraft.clearDraft} />
          )}

          {permits.length === 0 ? (
            <EmptyState icon="📍" message="No local permits tracked yet" sub="Add your business license, zoning permit, outdoor seating approval, and other municipal permits to track expirations and renewals." action="Add a permit →" onAction={openAddPermit} />
          ) : (
            <div className="space-y-3">
              {permits.map(permit => (
                <PermitCard
                  key={permit.id}
                  permit={permit}
                  deleteConfirmId={permDeleteId}
                  deletingId={permDeletingId}
                  onEdit={() => openEditPermit(permit)}
                  onDeleteRequest={setPermDeleteId}
                  onDeleteConfirm={handlePermDelete}
                  onDeleteCancel={() => setPermDeleteId(null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Document upload modal ── */}
      <ModalShell
        isOpen={docModalOpen}
        onClose={closeDocModal}
        isDirty={isDocFormDirty}
        title="Upload Document"
        draftRestored={docDraft.draftRestored}
        onDismissDraft={docDraft.dismissDraftBanner}
        maxWidth="max-w-lg"
      >
        {uploadSuccess ? (
          <div className="py-10 text-center">
            <p className="text-5xl mb-3">✅</p>
            <p className="font-semibold text-navy text-lg">Document uploaded!</p>
            <p className="text-sm text-gray-500 mt-1">Your document has been saved securely.</p>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">
            <FormField label="Document Name" required>
              <input type="text" required placeholder="e.g. Brewer's Notice 2025" value={docForm.name}
                onChange={e => setDocForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Document Type" required>
              <select required value={docForm.type} onChange={e => setDocForm(p => ({ ...p, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white">
                <option value="">Select type...</option>
                {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label} — {dt.description}</option>)}
              </select>
            </FormField>

            <FormField label="Expiration Date" optional>
              <input type="date" value={docForm.expiration_date}
                onChange={e => setDocForm(p => ({ ...p, expiration_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Notes" optional hint="max 500 characters">
              <textarea placeholder="Any notes about this document..." value={docForm.notes} maxLength={500} rows={2}
                onChange={e => setDocForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
              <p className="text-xs text-gray-400 text-right mt-0.5">{docForm.notes.length}/500</p>
            </FormField>

            {/* Drop zone */}
            <FormField label="File" required>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
                onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) validateAndSetFile(f) }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg px-4 py-7 text-center cursor-pointer transition-colors select-none ${isDragOver ? 'border-amber bg-amber/10' : 'border-gray-300 hover:border-amber hover:bg-gray-50'}`}
              >
                {docForm.file ? (
                  <div>
                    <p className="text-sm font-semibold text-navy">📄 {docForm.file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatFileSize(docForm.file.size)}</p>
                    <p className="text-xs text-amber mt-2">Click or drop to replace file</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-3xl mb-2">📎</p>
                    <p className="text-sm text-gray-600">Drag & drop a file here, or <span className="text-amber font-medium">click to browse</span></p>
                    <p className="text-xs text-gray-400 mt-1.5">PDF, JPG, PNG, DOC, DOCX — max 25 MB</p>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => { if (e.target.files[0]) validateAndSetFile(e.target.files[0]); e.target.value = '' }}
                className="hidden" />
            </FormField>

            {uploadError && <ErrorBar message={uploadError} onDismiss={() => setUploadError('')} />}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeDocModal} className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" disabled={!canUpload || uploading} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
                {uploading ? <Spinner label="Uploading..." /> : 'Upload Document'}
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* ── Insurance modal ── */}
      <ModalShell
        isOpen={insModalOpen}
        onClose={closeInsModal}
        isDirty={isInsFormDirty}
        title={insEditId ? 'Edit Insurance Policy' : 'Add Insurance Policy'}
        draftRestored={insDraft.draftRestored}
        onDismissDraft={insDraft.dismissDraftBanner}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleInsSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Policy Name" required>
              <input type="text" required placeholder="e.g. General Liability 2026" value={insForm.policy_name}
                onChange={e => setInsForm(p => ({ ...p, policy_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Insurance Type" required>
              <select required value={insForm.insurance_type} onChange={e => setInsForm(p => ({ ...p, insurance_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white">
                <option value="">Select type...</option>
                {INSURANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FormField>

            <FormField label="Insurance Carrier" required>
              <input type="text" required placeholder="e.g. Acme Insurance Co." value={insForm.carrier_name}
                onChange={e => setInsForm(p => ({ ...p, carrier_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Policy Number" optional>
              <input type="text" placeholder="e.g. GL-2026-001234" value={insForm.policy_number}
                onChange={e => setInsForm(p => ({ ...p, policy_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Coverage Amount" optional>
              <input type="number" min="0" step="1000" placeholder="e.g. 1000000" value={insForm.coverage_amount}
                onChange={e => setInsForm(p => ({ ...p, coverage_amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Deductible" optional>
              <input type="number" min="0" step="100" placeholder="e.g. 5000" value={insForm.deductible}
                onChange={e => setInsForm(p => ({ ...p, deductible: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Premium Amount" optional>
              <input type="number" min="0" step="0.01" placeholder="e.g. 2400" value={insForm.premium_amount}
                onChange={e => setInsForm(p => ({ ...p, premium_amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Premium Frequency" optional>
              <select value={insForm.premium_frequency} onChange={e => setInsForm(p => ({ ...p, premium_frequency: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white">
                <option value="">Select...</option>
                {PREMIUM_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </FormField>

            <FormField label="Effective Date" optional>
              <input type="date" value={insForm.effective_date}
                onChange={e => setInsForm(p => ({ ...p, effective_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Expiration Date" optional>
              <input type="date" value={insForm.expiration_date}
                onChange={e => setInsForm(p => ({ ...p, expiration_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Agent Name" optional>
              <input type="text" placeholder="Agent's full name" value={insForm.agent_name}
                onChange={e => setInsForm(p => ({ ...p, agent_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Agent Email" optional>
              <input type="email" placeholder="agent@example.com" value={insForm.agent_email}
                onChange={e => setInsForm(p => ({ ...p, agent_email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Agent Phone" optional>
              <input type="tel" placeholder="(555) 000-0000" value={insForm.agent_phone}
                onChange={e => setInsForm(p => ({ ...p, agent_phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="ins-auto-renews" checked={insForm.auto_renews}
                onChange={e => setInsForm(p => ({ ...p, auto_renews: e.target.checked }))}
                className="w-4 h-4 accent-amber" />
              <label htmlFor="ins-auto-renews" className="text-sm font-medium text-gray-700">Auto-renews</label>
            </div>
          </div>

          <FormField label="Renewal Notes" optional>
            <textarea placeholder="Renewal instructions, conditions, or notes..." value={insForm.renewal_notes} rows={2}
              onChange={e => setInsForm(p => ({ ...p, renewal_notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
          </FormField>

          <FormField label="Notes" optional hint="max 500 characters">
            <textarea placeholder="Any additional notes..." value={insForm.notes} maxLength={500} rows={2}
              onChange={e => setInsForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
            <p className="text-xs text-gray-400 text-right mt-0.5">{insForm.notes.length}/500</p>
          </FormField>

          {insError && <ErrorBar message={insError} onDismiss={() => setInsError('')} />}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeInsModal} className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={insSaving} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
              {insSaving ? <Spinner label="Saving..." /> : insEditId ? 'Save Changes' : 'Add Policy'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ── Permit modal ── */}
      <ModalShell
        isOpen={permModalOpen}
        onClose={closePermModal}
        isDirty={isPermFormDirty}
        title={permEditId ? 'Edit Permit' : 'Add Local Permit'}
        draftRestored={permDraft.draftRestored}
        onDismissDraft={permDraft.dismissDraftBanner}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handlePermSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Permit Name" required>
              <input type="text" required placeholder="e.g. Outdoor Seating Permit 2026" value={permForm.permit_name}
                onChange={e => setPermForm(p => ({ ...p, permit_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Permit Type" required>
              <select required value={permForm.permit_type} onChange={e => setPermForm(p => ({ ...p, permit_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white">
                <option value="">Select type...</option>
                {PERMIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FormField>

            <FormField label="Issuing Authority" required>
              <input type="text" required placeholder="e.g. City of Springfield" value={permForm.issuing_authority}
                onChange={e => setPermForm(p => ({ ...p, issuing_authority: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Permit Number" optional>
              <input type="text" placeholder="e.g. OS-2026-4421" value={permForm.permit_number}
                onChange={e => setPermForm(p => ({ ...p, permit_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Issue Date" optional>
              <input type="date" value={permForm.issue_date}
                onChange={e => setPermForm(p => ({ ...p, issue_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Expiration Date" optional>
              <input type="date" value={permForm.expiration_date}
                onChange={e => setPermForm(p => ({ ...p, expiration_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Renewal Fee" optional>
              <input type="number" min="0" step="0.01" placeholder="e.g. 150" value={permForm.renewal_fee}
                onChange={e => setPermForm(p => ({ ...p, renewal_fee: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="perm-auto-renews" checked={permForm.auto_renews}
                  onChange={e => setPermForm(p => ({ ...p, auto_renews: e.target.checked }))}
                  className="w-4 h-4 accent-amber" />
                <label htmlFor="perm-auto-renews" className="text-sm font-medium text-gray-700">Auto-renews</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="perm-is-active" checked={permForm.is_active}
                  onChange={e => setPermForm(p => ({ ...p, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-amber" />
                <label htmlFor="perm-is-active" className="text-sm font-medium text-gray-700">Active (uncheck to archive)</label>
              </div>
            </div>

            <FormField label="Contact Name" optional>
              <input type="text" placeholder="Authority contact name" value={permForm.authority_contact_name}
                onChange={e => setPermForm(p => ({ ...p, authority_contact_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Contact Email" optional>
              <input type="email" placeholder="contact@city.gov" value={permForm.authority_contact_email}
                onChange={e => setPermForm(p => ({ ...p, authority_contact_email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>

            <FormField label="Contact Phone" optional>
              <input type="tel" placeholder="(555) 000-0000" value={permForm.authority_contact_phone}
                onChange={e => setPermForm(p => ({ ...p, authority_contact_phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </FormField>
          </div>

          <FormField label="Renewal Notes" optional>
            <textarea placeholder="Renewal instructions or conditions..." value={permForm.renewal_notes} rows={2}
              onChange={e => setPermForm(p => ({ ...p, renewal_notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
          </FormField>

          <FormField label="Notes" optional hint="max 500 characters">
            <textarea placeholder="Any additional notes..." value={permForm.notes} maxLength={500} rows={2}
              onChange={e => setPermForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
            <p className="text-xs text-gray-400 text-right mt-0.5">{permForm.notes.length}/500</p>
          </FormField>

          {permError && <ErrorBar message={permError} onDismiss={() => setPermError('')} />}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closePermModal} className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={permSaving} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
              {permSaving ? <Spinner label="Saving..." /> : permEditId ? 'Save Changes' : 'Add Permit'}
            </button>
          </div>
        </form>
      </ModalShell>

    </div>
  )
}

// ─── Shared helper components ─────────────────────────────────────────────────

function TabButton({ label, count, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${active ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
    </button>
  )
}

function SummaryCard({ icon, label, count, onClick, active }) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-4 text-center transition-colors cursor-pointer ${active ? 'border-amber bg-amber/5' : 'border-gray-200 bg-white hover:border-amber/50'}`}>
      <p className="text-2xl mb-1">{icon}</p>
      <p className="text-xl font-bold text-navy">{count}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </button>
  )
}

function FormField({ label, required, optional, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-navy mb-1.5">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
        {optional && <span className="text-gray-400 font-normal ml-1">(optional{hint ? `, ${hint}` : ''})</span>}
      </label>
      {children}
    </div>
  )
}

function ErrorBar({ message, onDismiss }) {
  return (
    <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-start justify-between gap-2">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 text-danger/60 hover:text-danger font-medium underline text-xs mt-0.5">Dismiss</button>
    </div>
  )
}

function Spinner({ label }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
      {label}
    </span>
  )
}

function EmptyState({ icon, message, sub, action, onAction }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="text-sm font-semibold text-navy mb-1">{message}</p>
      <p className="text-xs text-gray-500 max-w-sm mx-auto">{sub}</p>
      <button onClick={onAction} className="mt-4 text-sm text-amber hover:underline font-medium">{action}</button>
    </div>
  )
}

// ─── Card components ──────────────────────────────────────────────────────────

function DocumentCard({ doc, deleteConfirmId, deleting, onDownload, onDeleteRequest, onDeleteConfirm, onDeleteCancel }) {
  const typeLabel = DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label ?? doc.document_type
  const isConfirming = deleteConfirmId === doc.id
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-navy text-sm truncate" title={doc.document_name}>{doc.document_name}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-amber/10 text-amber font-medium px-2 py-0.5 rounded-full">{typeLabel}</span>
          {doc.file_size && <span className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</span>}
        </div>
      </div>
      <ExpirationBadge dateStr={doc.expiration_date} />
      {doc.notes && <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-2">{doc.notes}</p>}
      <p className="text-xs text-gray-400">Uploaded {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      {isConfirming ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">Delete this document? This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={() => onDeleteConfirm(doc.id, doc.file_path)} disabled={deleting} className="flex-1 bg-danger text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60">{deleting ? 'Deleting...' : 'Yes, Delete'}</button>
            <button onClick={onDeleteCancel} className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-3 mt-auto">
          <button onClick={() => onDownload(doc.file_path, doc.document_name)} className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors">Download</button>
          <button onClick={() => onDeleteRequest(doc.id)} className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-danger hover:text-danger transition-colors">Delete</button>
        </div>
      )}
    </div>
  )
}

function InsuranceCard({ policy, deleteConfirmId, deletingId, onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel }) {
  const typeLabel = INSURANCE_TYPES.find(t => t.value === policy.insurance_type)?.label ?? policy.insurance_type
  const isConfirming = deleteConfirmId === policy.id
  const isDeleting   = deletingId === policy.id
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-navy text-sm">{policy.policy_name}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-amber/10 text-amber font-medium px-2 py-0.5 rounded-full">{typeLabel}</span>
          {policy.carrier_name && <span className="text-xs text-gray-500">{policy.carrier_name}</span>}
          {policy.auto_renews && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Auto-renews</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
        {policy.policy_number    && <span><span className="text-gray-400">Policy #</span> {policy.policy_number}</span>}
        {policy.coverage_amount  && <span><span className="text-gray-400">Coverage</span> {formatCurrency(policy.coverage_amount)}</span>}
        {policy.premium_amount   && <span><span className="text-gray-400">Premium</span> {formatCurrency(policy.premium_amount)}{policy.premium_frequency ? `/${policy.premium_frequency.replace('_','-')}` : ''}</span>}
        {policy.deductible       && <span><span className="text-gray-400">Deductible</span> {formatCurrency(policy.deductible)}</span>}
        {policy.agent_name       && <span><span className="text-gray-400">Agent</span> {policy.agent_name}</span>}
        {policy.agent_phone      && <span><span className="text-gray-400">Phone</span> {policy.agent_phone}</span>}
      </div>
      {policy.effective_date && <p className="text-xs text-gray-400">Effective {formatDate(policy.effective_date)}</p>}
      <ExpirationBadge dateStr={policy.expiration_date} />
      {policy.renewal_notes && <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">{policy.renewal_notes}</p>}
      {isConfirming ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">Delete this policy? This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={() => onDeleteConfirm(policy.id)} disabled={isDeleting} className="flex-1 bg-danger text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60">{isDeleting ? 'Deleting...' : 'Yes, Delete'}</button>
            <button onClick={onDeleteCancel} className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-3 mt-auto">
          <button onClick={onEdit} className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors">Edit</button>
          <button onClick={() => onDeleteRequest(policy.id)} className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-danger hover:text-danger transition-colors">Delete</button>
        </div>
      )}
    </div>
  )
}

function PermitCard({ permit, deleteConfirmId, deletingId, onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel }) {
  const typeLabel = PERMIT_TYPES.find(t => t.value === permit.permit_type)?.label ?? permit.permit_type
  const isConfirming = deleteConfirmId === permit.id
  const isDeleting   = deletingId === permit.id
  return (
    <div className={`bg-white rounded-xl border p-4 flex flex-col gap-3 ${!permit.is_active ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-navy text-sm">{permit.permit_name}</p>
          {!permit.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">Archived</span>}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-amber/10 text-amber font-medium px-2 py-0.5 rounded-full">{typeLabel}</span>
          {permit.issuing_authority && <span className="text-xs text-gray-500">{permit.issuing_authority}</span>}
          {permit.auto_renews && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Auto-renews</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
        {permit.permit_number && <span><span className="text-gray-400">Permit #</span> {permit.permit_number}</span>}
        {permit.renewal_fee   && <span><span className="text-gray-400">Renewal fee</span> {formatCurrency(permit.renewal_fee)}</span>}
        {permit.authority_contact_name  && <span><span className="text-gray-400">Contact</span> {permit.authority_contact_name}</span>}
        {permit.authority_contact_phone && <span><span className="text-gray-400">Phone</span> {permit.authority_contact_phone}</span>}
      </div>
      {permit.issue_date && <p className="text-xs text-gray-400">Issued {formatDate(permit.issue_date)}</p>}
      <ExpirationBadge dateStr={permit.expiration_date} />
      {permit.renewal_notes && <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">{permit.renewal_notes}</p>}
      {isConfirming ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">Delete this permit? This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={() => onDeleteConfirm(permit.id)} disabled={isDeleting} className="flex-1 bg-danger text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60">{isDeleting ? 'Deleting...' : 'Yes, Delete'}</button>
            <button onClick={onDeleteCancel} className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-3 mt-auto">
          <button onClick={onEdit} className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors">Edit</button>
          <button onClick={() => onDeleteRequest(permit.id)} className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-danger hover:text-danger transition-colors">Delete</button>
        </div>
      )}
    </div>
  )
}
