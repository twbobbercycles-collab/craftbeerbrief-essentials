/**
 * DocumentsPage — License & Permit Document Storage
 * Lets brewery users upload, organize by category, download, and delete
 * their license and permit documents in one secure place.
 */
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'
import DraftNoticeBar from '../../components/DraftNoticeBar'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: 'federal_license',     label: 'Federal License',      description: "Brewer's Notice and TTB documents" },
  { value: 'state_license',       label: 'State License',        description: 'State brewery and manufacturer licenses' },
  { value: 'taproom_permit',      label: 'Taproom Permit',       description: 'Taproom and retail permits' },
  { value: 'health_permit',       label: 'Health Permit',        description: 'Health department permits and inspections' },
  { value: 'insurance',           label: 'Insurance',            description: 'Insurance certificates and policies' },
  { value: 'local_permit',        label: 'Local Permit',         description: 'Municipal and zoning permits' },
  { value: 'staff_certification', label: 'Staff Certification',  description: 'Staff alcohol service certifications' },
  { value: 'other',               label: 'Other',                description: 'Anything else' },
]

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

// ─── Utility functions ────────────────────────────────────────────────────────

// Returns 'expired', 'urgent' (≤30 days), 'warning' (≤90 days), or 'ok'
function getExpirationStatus(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Parse as local midnight to avoid timezone-offset day shifts
  const exp = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.floor((exp - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0)   return 'expired'
  if (diffDays <= 30) return 'urgent'
  if (diffDays <= 90) return 'warning'
  return 'ok'
}

// Format bytes into a human-readable string (B / KB / MB)
function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Format a date string as "Jan 5, 2026"
function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { brewery } = useAuth()
  const fileInputRef = useRef(null)
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner, hasDraft } = useModalDraft('modal_draft_document')

  // ── Page state ──
  const [documents, setDocuments]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [pageError, setPageError]         = useState('')
  const [activeTab, setActiveTab]         = useState('all')

  // ── Upload modal state ──
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    name: '', type: '', expiration_date: '', notes: '', file: null,
  })
  const [isDragOver, setIsDragOver]       = useState(false)
  const [uploading, setUploading]         = useState(false)
  const [uploadError, setUploadError]     = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)

  // ── Delete confirmation state ──
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleting, setDeleting]               = useState(false)

  // True in add mode when the user has entered any data (drives ModalShell dirty check)
  const isUploadFormDirty = !!(uploadForm.name.trim() || uploadForm.type || uploadForm.expiration_date || uploadForm.notes || uploadForm.file)

  // Fetch documents whenever the brewery is known
  useEffect(() => {
    if (!brewery?.id) return
    loadDocuments()
  }, [brewery?.id])

  // Auto-save the upload form whenever it changes (File objects are excluded — not serialisable)
  useEffect(() => {
    if (!uploadModalOpen) return
    const { file, ...rest } = uploadForm
    saveDraft(rest)
  }, [uploadForm, uploadModalOpen])

  // Pull all documents for this brewery ordered newest first
  async function loadDocuments() {
    setLoading(true)
    setPageError('')
    try {
      const { data, error } = await supabase
        .from('brewery_documents')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setDocuments(data ?? [])
    } catch {
      setPageError('Could not load documents. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Check the selected file's type and size, then store it in the form
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
    setUploadForm((prev) => ({ ...prev, file }))
  }

  // Drag-and-drop: highlight the drop zone while a file is held over it
  function handleDragOver(e) {
    e.preventDefault()
    setIsDragOver(true)
  }

  // Drag-and-drop: remove highlight when the file leaves the zone
  function handleDragLeave(e) {
    e.preventDefault()
    setIsDragOver(false)
  }

  // Drag-and-drop: receive the dropped file
  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSetFile(file)
  }

  // Upload the file to Supabase Storage and insert a record in brewery_documents
  async function handleUpload(e) {
    e.preventDefault()
    if (!uploadForm.file || !uploadForm.name.trim() || !uploadForm.type) return

    setUploading(true)
    setUploadError('')
    setUploadSuccess(false)

    try {
      // Sanitise the filename and build a unique storage path under the brewery's folder
      const safeName = uploadForm.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${brewery.id}/${Date.now()}_${safeName}`

      // Upload the binary to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('brewery-documents')
        .upload(filePath, uploadForm.file, {
          contentType: uploadForm.file.type,
          upsert: false,
        })
      if (storageError) throw storageError

      // Record the document metadata in the database
      const { error: dbError } = await supabase
        .from('brewery_documents')
        .insert({
          brewery_id:      brewery.id,
          document_name:   uploadForm.name.trim(),
          document_type:   uploadForm.type,
          file_path:       filePath,
          file_size:       uploadForm.file.size,
          expiration_date: uploadForm.expiration_date || null,
          notes:           uploadForm.notes.trim() || null,
        })

      if (dbError) {
        // Roll back the storage upload if the DB insert fails so we don't orphan files
        await supabase.storage.from('brewery-documents').remove([filePath])
        throw dbError
      }

      clearDraft()
      setUploadSuccess(true)
      setUploadForm({ name: '', type: '', expiration_date: '', notes: '', file: null })
      await loadDocuments()

      // Close the modal after a short success pause so the user sees the confirmation
      setTimeout(() => {
        setUploadModalOpen(false)
        setUploadSuccess(false)
      }, 1500)
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // Generate a short-lived signed URL and open the file in a new browser tab
  async function handleDownload(filePath, fileName) {
    try {
      const { data, error } = await supabase.storage
        .from('brewery-documents')
        .createSignedUrl(filePath, 3600) // 1-hour expiry
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      alert(`Could not open "${fileName}". Please try again.`)
    }
  }

  // Remove the file from storage and delete the database record
  async function handleDelete(docId, filePath) {
    setDeleting(true)
    try {
      // Delete from storage first so we don't leave orphaned files
      await supabase.storage.from('brewery-documents').remove([filePath])

      const { error } = await supabase
        .from('brewery_documents')
        .delete()
        .eq('id', docId)
      if (error) throw error

      setDeleteConfirmId(null)
      // Remove from local state immediately so the UI updates without a refetch
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch {
      alert('Could not delete the document. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // Open the upload modal, restoring any saved draft into the form.
  // showBanner=false when the user explicitly clicked "Continue Draft" (they already know).
  function openUploadModal(showBanner = true) {
    const draft = loadDraft(showBanner)
    if (draft) {
      setUploadForm((prev) => ({ ...prev, ...draft }))
    }
    setUploadModalOpen(true)
  }

  // Pure state reset — does not touch the draft (used internally)
  function resetUploadForm() {
    setUploadForm({ name: '', type: '', expiration_date: '', notes: '', file: null })
    setUploadError('')
    setUploadSuccess(false)
    setIsDragOver(false)
  }

  // Full close: clear the draft, reset form state, shut the modal.
  // Cancel button calls this directly (bypasses the dirty check in ModalShell).
  function handleCloseUploadModal() {
    clearDraft()
    resetUploadForm()
    setUploadModalOpen(false)
  }

  // Documents visible in the currently selected tab
  const filteredDocs = activeTab === 'all'
    ? documents
    : documents.filter((d) => d.document_type === activeTab)

  // Count for each tab badge
  function tabCount(type) {
    return type === 'all'
      ? documents.length
      : documents.filter((d) => d.document_type === type).length
  }

  // The Upload button is only active when the three required fields are filled
  const canUpload = uploadForm.name.trim() && uploadForm.type && uploadForm.file

  if (loading) return <LoadingSpinner message="Loading your documents..." />

  return (
    <div className="space-y-4">

      {/* Data ownership info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-lg shrink-0">🔒</span>
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Your documents are yours.</strong> Files you upload are stored privately and are only
          accessible to your brewery account. We never share your documents with other users or third
          parties. You can download or delete your files at any time.
        </p>
      </div>

      {/* Storage disclaimer */}
      <DismissibleDisclaimer
        storageKey="disclaimer_documents_dismissed"
        text="Document storage is provided as a convenience only. Always maintain your own backup copies of all license and permit documents."
      />

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">📂 License & Permit Documents</h2>
        <button
          onClick={() => openUploadModal(!hasDraft)}
          title={hasDraft ? "You have an unsaved draft — click to continue where you left off" : undefined}
          className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors relative"
        >
          {hasDraft && (
            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
          )}
          {hasDraft ? 'Continue Draft' : '+ Upload Document'}
        </button>
      </div>

      {/* Draft notice — shown when an unsaved upload draft exists */}
      {hasDraft && (
        <DraftNoticeBar
          onContinue={() => openUploadModal(false)}
          onDiscard={clearDraft}
        />
      )}

      {/* Page-level error with retry link */}
      {pageError && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{pageError}</span>
          <button onClick={loadDocuments} className="underline font-medium whitespace-nowrap">
            Retry
          </button>
        </div>
      )}

      {/* Category tabs — scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-1.5 min-w-max pb-1">
          <TabButton
            label="All"
            count={tabCount('all')}
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
          />
          {DOCUMENT_TYPES.map((dt) => (
            <TabButton
              key={dt.value}
              label={dt.label}
              count={tabCount(dt.value)}
              active={activeTab === dt.value}
              onClick={() => setActiveTab(dt.value)}
            />
          ))}
        </div>
      </div>

      {/* Document grid or empty state */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-sm font-semibold text-navy mb-1">
            No documents uploaded yet for this category
          </p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Upload your first document to keep all your compliance files organized in one place.
          </p>
          <button
            onClick={openUploadModal}
            className="mt-4 text-sm text-amber hover:underline font-medium"
          >
            Upload a document →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              deleteConfirmId={deleteConfirmId}
              deleting={deleting}
              onDownload={handleDownload}
              onDeleteRequest={setDeleteConfirmId}
              onDeleteConfirm={handleDelete}
              onDeleteCancel={() => setDeleteConfirmId(null)}
            />
          ))}
        </div>
      )}

      {/* ── Upload modal ── */}
      <ModalShell
        isOpen={uploadModalOpen}
        onClose={handleCloseUploadModal}
        isDirty={isUploadFormDirty}
        title="Upload Document"
        draftRestored={draftRestored}
        onDismissDraft={dismissDraftBanner}
        maxWidth="max-w-lg"
      >
        {/* Success state — shown briefly before the modal auto-closes */}
        {uploadSuccess ? (
          <div className="py-10 text-center">
            <p className="text-5xl mb-3">✅</p>
            <p className="font-semibold text-navy text-lg">Document uploaded!</p>
            <p className="text-sm text-gray-500 mt-1">Your document has been saved securely.</p>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">

            {/* Document name */}
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Document Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Brewer's Notice 2025"
                value={uploadForm.name}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>

            {/* Document type */}
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Document Type <span className="text-danger">*</span>
              </label>
              <select
                required
                value={uploadForm.type}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
              >
                <option value="">Select type...</option>
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label} — {dt.description}</option>
                ))}
              </select>
            </div>

            {/* Expiration date */}
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Expiration Date{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={uploadForm.expiration_date}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, expiration_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Notes{' '}
                <span className="text-gray-400 font-normal">(optional, max 500 characters)</span>
              </label>
              <textarea
                placeholder="Any notes about this document..."
                value={uploadForm.notes}
                maxLength={500}
                rows={2}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
              />
              <p className="text-xs text-gray-400 text-right mt-0.5">
                {uploadForm.notes.length}/500
              </p>
            </div>

            {/* File drop zone */}
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                File <span className="text-danger">*</span>
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg px-4 py-7 text-center cursor-pointer transition-colors select-none ${
                  isDragOver
                    ? 'border-amber bg-amber/10'
                    : 'border-gray-300 hover:border-amber hover:bg-gray-50'
                }`}
              >
                {uploadForm.file ? (
                  <div>
                    <p className="text-sm font-semibold text-navy">📄 {uploadForm.file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatFileSize(uploadForm.file.size)}</p>
                    <p className="text-xs text-amber mt-2">Click or drop to replace file</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-3xl mb-2">📎</p>
                    <p className="text-sm text-gray-600">
                      Drag & drop a file here, or{' '}
                      <span className="text-amber font-medium">click to browse</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      PDF, JPG, PNG, DOC, DOCX — max 25 MB
                    </p>
                  </div>
                )}
              </div>
              {/* Hidden native file picker triggered by clicking the drop zone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  if (e.target.files[0]) validateAndSetFile(e.target.files[0])
                  e.target.value = '' // reset so same file can be re-selected after error
                }}
                className="hidden"
              />
            </div>

            {/* Upload error with dismiss */}
            {uploadError && (
              <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-start justify-between gap-2">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError('')}
                  className="shrink-0 text-danger/60 hover:text-danger font-medium underline text-xs mt-0.5"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleCloseUploadModal}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canUpload || uploading}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    Uploading...
                  </span>
                ) : (
                  'Upload Document'
                )}
              </button>
            </div>

          </form>
        )}
      </ModalShell>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Tab button for the category navigation bar — shows document count as a badge
function TabButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-navy text-white'
          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
        active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
      }`}>
        {count}
      </span>
    </button>
  )
}

// Card showing one document with expiration status, download, and delete actions
function DocumentCard({
  doc,
  deleteConfirmId,
  deleting,
  onDownload,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}) {
  const typeLabel = DOCUMENT_TYPES.find((t) => t.value === doc.document_type)?.label ?? doc.document_type
  const expStatus = getExpirationStatus(doc.expiration_date)
  const isConfirmingDelete = deleteConfirmId === doc.id

  // Colour classes for the expiration line based on urgency
  const expColorClass = {
    expired: 'text-danger font-semibold',
    urgent:  'text-danger',
    warning: 'text-warning',
    ok:      'text-success',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">

      {/* Document name + type badge + file size */}
      <div>
        <p className="font-semibold text-navy text-sm truncate" title={doc.document_name}>
          {doc.document_name}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-amber/10 text-amber font-medium px-2 py-0.5 rounded-full">
            {typeLabel}
          </span>
          {doc.file_size && (
            <span className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</span>
          )}
        </div>
      </div>

      {/* Expiration date with colour-coded urgency */}
      {doc.expiration_date && (
        <p className={`text-xs ${expColorClass[expStatus]}`}>
          {expStatus === 'expired' ? '⚠️ Expired: ' : '📅 Expires: '}
          {formatDate(doc.expiration_date)}
          {expStatus === 'urgent'  && ' — expiring soon!'}
          {expStatus === 'expired' && ' — renewal required'}
        </p>
      )}

      {/* Notes */}
      {doc.notes && (
        <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-2">
          {doc.notes}
        </p>
      )}

      {/* Upload date */}
      <p className="text-xs text-gray-400">
        Uploaded {new Date(doc.created_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })}
      </p>

      {/* Delete confirmation inline or Download / Delete buttons */}
      {isConfirmingDelete ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-700 font-medium">
            Delete this document? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onDeleteConfirm(doc.id, doc.file_path)}
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
            onClick={() => onDownload(doc.file_path, doc.document_name)}
            className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors"
          >
            Download
          </button>
          <button
            onClick={() => onDeleteRequest(doc.id)}
            className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-danger hover:text-danger transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
