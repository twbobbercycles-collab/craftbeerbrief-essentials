/**
 * AdminPage — visible only to the admin email (VITE_ADMIN_EMAIL).
 * Tabs: Pending Submissions | Grant Management | Archived Grants | Sync History
 */
import { useEffect, useState, useMemo } from 'react'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { US_STATES, US_STATE_NAMES, FUNDING_TYPES, getStateCode } from '../grants/grantsUtils'

// ── Constants ─────────────────────────────────────────────────────────────────

const PROGRAM_CATEGORIES = [
  { value: 'federal_sba',          label: 'Federal — SBA Programs' },
  { value: 'federal_usda',         label: 'Federal — USDA Programs' },
  { value: 'federal_other',        label: 'Federal — Other' },
  { value: 'economic_development', label: 'State — Economic Development' },
  { value: 'agriculture',          label: 'State — Agriculture' },
  { value: 'tourism',              label: 'State — Tourism' },
  { value: 'manufacturing',        label: 'State — Manufacturing' },
  { value: 'rural_development',    label: 'State — Rural Development' },
  { value: 'local_redevelopment',  label: 'Local — Redevelopment' },
  { value: 'energy_utility',       label: 'Energy and Utility Programs' },
]

const STATUS_OPTIONS = [
  { value: 'open',     label: 'Open' },
  { value: 'closed',   label: 'Closed' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'rolling',  label: 'Rolling (no deadline)' },
]

const SOURCE_LABELS = {
  grants_gov:     'Grants.gov',
  manual:         'Manual',
  user_submitted: 'User Submitted',
}

// ── Small UI helpers ───────────────────────────────────────────────────────────

function AdminTab({ active, onClick, children, count }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-amber text-amber'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
      {count != null && (
        <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
          active ? 'bg-amber text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

function SourceBadge({ source }) {
  const styles = {
    grants_gov:     'bg-blue-100 text-blue-700',
    manual:         'bg-amber/10 text-amber',
    user_submitted: 'bg-green-100 text-green-700',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[source] ?? 'bg-gray-100 text-gray-600'}`}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

function ScopeBadge({ isFederal }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      isFederal ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {isFederal ? 'Federal' : 'State'}
    </span>
  )
}

function StatusPill({ status }) {
  const styles = {
    open:     'bg-green-100 text-green-700',
    closed:   'bg-gray-100 text-gray-500',
    upcoming: 'bg-blue-100 text-blue-700',
    rolling:  'bg-teal-100 text-teal-700',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status ?? '—'}
    </span>
  )
}

// ── Grant table row ────────────────────────────────────────────────────────────

function GrantRow({ grant, onEdit, onArchive, onOverride }) {
  const fmt = n => n != null ? '$' + Number(n).toLocaleString() : null
  const amountStr = (grant.amount_min || grant.amount_max)
    ? [fmt(grant.amount_min), fmt(grant.amount_max)].filter(Boolean).join(' – ')
    : 'Varies'

  return (
    <tr className="hover:bg-gray-50">
      <td className="py-2 pr-3 max-w-[240px]">
        <span className="block truncate font-medium text-navy text-xs" title={grant.title}>
          {(grant.title ?? '').slice(0, 60)}{(grant.title?.length ?? 0) > 60 ? '…' : ''}
        </span>
      </td>
      <td className="py-2 pr-3"><SourceBadge source={grant.grant_source} /></td>
      <td className="py-2 pr-3 text-gray-500 text-xs">{grant.program_category ?? '—'}</td>
      <td className="py-2 pr-3"><ScopeBadge isFederal={grant.is_federal} /></td>
      <td className="py-2 pr-3 text-gray-600 text-xs whitespace-nowrap">{amountStr}</td>
      <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap">
        {grant.last_reviewed_at
          ? new Date(grant.last_reviewed_at).toLocaleDateString()
          : '—'}
      </td>
      <td className="py-2 pr-3"><StatusPill status={grant.status} /></td>
      <td className="py-2">
        <div className="flex gap-1 flex-wrap">
          <button onClick={onEdit}
            className="text-xs bg-navy text-white px-2 py-1 rounded hover:bg-navy/80 transition-colors">
            Edit
          </button>
          {grant.grant_source === 'grants_gov' && !grant.is_manually_curated && (
            <button onClick={onOverride}
              className="text-xs bg-amber text-white px-2 py-1 rounded hover:bg-amber-dark transition-colors">
              Override
            </button>
          )}
          <button onClick={onArchive}
            className="text-xs border border-danger/50 text-danger px-2 py-1 rounded hover:bg-red-50 transition-colors">
            Archive
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

function EditGrantModal({ form, setForm, saving, saveMsg, onSave, onClose }) {
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  function toggleState(code) {
    setForm(f => ({
      ...f,
      states_selected: f.states_selected.includes(code)
        ? f.states_selected.filter(s => s !== code)
        : [...f.states_selected, code],
    }))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-navy text-lg">Edit Grant</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>

          {/* Scrollable form body */}
          <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
              <input type="text" value={form.title ?? ''} onChange={e => set('title', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
              <textarea rows={4} value={form.description ?? ''} onChange={e => set('description', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-y" />
            </div>

            {/* Eligibility Summary */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Eligibility Summary</label>
              <textarea rows={3} value={form.eligibility_summary ?? ''} onChange={e => set('eligibility_summary', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-y" />
            </div>

            {/* Funding Type + Is Loan */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Funding Type</label>
                <select value={form.funding_type ?? ''} onChange={e => set('funding_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
                  <option value="">— Select —</option>
                  {FUNDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.is_loan} onChange={e => set('is_loan', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span className="text-sm text-gray-700">This is a Loan (not a grant)</span>
                </label>
              </div>
            </div>

            {/* Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Amount Min ($)</label>
                <input type="number" value={form.amount_min ?? ''} onChange={e => set('amount_min', e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Amount Max ($)</label>
                <input type="number" value={form.amount_max ?? ''} onChange={e => set('amount_max', e.target.value)}
                  placeholder="e.g. 500000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
            </div>

            {/* Status + Deadline */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                <select value={form.status ?? 'open'} onChange={e => set('status', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Application Deadline</label>
                <input type="date" value={form.application_deadline ?? ''} onChange={e => set('application_deadline', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
            </div>

            {/* Application URL */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Application URL</label>
              <input type="url" value={form.application_url ?? ''} onChange={e => set('application_url', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </div>

            {/* States Eligible */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">States Eligible</label>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input type="checkbox" checked={!!form.states_nationwide}
                  onChange={e => set('states_nationwide', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm text-gray-700">Nationwide — available in all states</span>
              </label>
              {!form.states_nationwide && (
                <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <div className="grid grid-cols-6 gap-x-2 gap-y-1">
                    {US_STATES.map(code => (
                      <label key={code} className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox"
                          checked={(form.states_selected ?? []).includes(code)}
                          onChange={() => toggleState(code)}
                          className="w-3 h-3 rounded border-gray-300 flex-shrink-0" />
                        <span className="text-xs text-gray-700" title={US_STATE_NAMES[code]}>{code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Program Category + Contact Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Program Category</label>
                <select value={form.program_category ?? ''} onChange={e => set('program_category', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
                  <option value="">— None —</option>
                  {PROGRAM_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Contact Info</label>
                <input type="text" value={form.contact_info ?? ''} onChange={e => set('contact_info', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
            </div>

            {/* Manually Curated toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.is_manually_curated}
                  onChange={e => set('is_manually_curated', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm text-gray-700">
                  Verified by The Craft Beer Brief{' '}
                  <span className="text-gray-400 font-normal">(shows "Verified" badge to users)</span>
                </span>
              </label>
            </div>

            {/* Data Source Notes — internal */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Data Source Notes{' '}
                <span className="text-gray-400 font-normal">— internal, not shown to users</span>
              </label>
              <textarea rows={2} value={form.data_source_notes ?? ''} onChange={e => set('data_source_notes', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-y" />
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
            <div className="min-h-[1.25rem]">
              {saveMsg === 'success' && (
                <p className="text-sm font-medium text-success">✅ Saved successfully</p>
              )}
              {typeof saveMsg === 'string' && saveMsg.startsWith('error:') && (
                <p className="text-sm font-medium text-danger">❌ {saveMsg.slice(6)}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={onClose}
                className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                Close
              </button>
              <button onClick={onSave} disabled={saving}
                className="text-sm bg-amber text-white px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Main page component ────────────────────────────────────────────────────────

export default function AdminPage() {
  // Data
  const [pendingGrants, setPendingGrants]   = useState([])
  const [allGrants, setAllGrants]           = useState([])
  const [archivedGrants, setArchivedGrants] = useState([])
  const [syncLogs, setSyncLogs]             = useState([])
  const [loading, setLoading]               = useState(true)

  // UI
  const [activeTab, setActiveTab]   = usePersistedTab('admin_active_tab', 'pending')
  const [syncing, setSyncing]       = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  // Grant Management filters + error banner
  const [gmSearch, setGmSearch]               = useState('')
  const [gmSourceFilter, setGmSourceFilter]   = useState('all')
  const [actionError, setActionError]         = useState('')   // shown as red banner in manage tab

  // Import Data tab
  const [importFile, setImportFile]           = useState(null)
  const [importParsed, setImportParsed]       = useState(null)  // { headers, rows }
  const [importing, setImporting]             = useState(false)
  const [importResult, setImportResult]       = useState(null)  // { processed, upserted, skipped, errors }
  const [importError, setImportError]         = useState('')
  const [wipeConfirm1, setWipeConfirm1]       = useState(false)
  const [wipeConfirmText, setWipeConfirmText] = useState('')

  // Edit modal
  const [editingGrant, setEditingGrant] = useState(null)
  const [editForm, setEditForm]         = useState({})
  const [savingEdit, setSavingEdit]     = useState(false)
  const [editSaveMsg, setEditSaveMsg]   = useState('')   // '' | 'success' | 'error:...'

  useEffect(() => { loadAdminData() }, [])

  async function loadAdminData() {
    setLoading(true)
    // Use the Edge Function so the service role client is used server-side.
    // Direct anon-key queries for approved=false rows are blocked by RLS,
    // which is why archived grants and pending submissions showed as empty on reload.
    const { data, error } = await supabase.functions.invoke('admin-grants', {
      body: { action: 'list_admin_data' },
    })
    if (!error && data?.success) {
      setPendingGrants(data.pending   ?? [])
      setAllGrants(data.allGrants     ?? [])
      setArchivedGrants(data.archived ?? [])
      setSyncLogs(data.syncLogs       ?? [])
    }
    setLoading(false)
  }

  // ── Admin Edge Function helper ──────────────────────────────────────────────
  // All grant mutations go through the admin-grants Edge Function which holds the
  // service role key server-side. The user's session JWT is sent so the function
  // can verify the caller is the admin before touching the database.

  async function adminAction(action, grantId, updatedFields = null) {
    const { data, error } = await supabase.functions.invoke('admin-grants', {
      body: { action, grant_id: grantId, updated_fields: updatedFields },
    })
    if (error) throw new Error(error.message ?? 'Admin action failed')
    if (data?.error) throw new Error(data.error)
    return data
  }

  // ── Grant Management actions ────────────────────────────────────────────────

  function openEdit(grant) {
    const states = grant.states_eligible ?? []
    const isNw   = states.length === 0 ||
      states.some(s => ['nationwide', 'all states'].includes(s.toLowerCase()))
    setEditForm({
      title:                grant.title ?? '',
      description:          grant.description ?? '',
      eligibility_summary:  grant.eligibility_summary ?? '',
      funding_type:         grant.funding_type ?? '',
      is_loan:              grant.is_loan ?? false,
      amount_min:           grant.amount_min ?? '',
      amount_max:           grant.amount_max ?? '',
      status:               grant.status ?? 'open',
      application_deadline: grant.application_deadline ?? '',
      application_url:      grant.application_url ?? '',
      states_nationwide:    isNw,
      states_selected:      isNw ? [] : states.map(s => getStateCode(s)),
      program_category:     grant.program_category ?? '',
      contact_info:         grant.contact_info ?? '',
      is_manually_curated:  grant.is_manually_curated ?? false,
      data_source_notes:    grant.data_source_notes ?? '',
    })
    setEditingGrant(grant)
    setEditSaveMsg('')
  }

  async function saveEdit() {
    setSavingEdit(true)
    setEditSaveMsg('')
    const statesEligible = editForm.states_nationwide ? ['nationwide'] : (editForm.states_selected ?? [])
    const updatedFields = {
      title:                editForm.title,
      description:          editForm.description || null,
      eligibility_summary:  editForm.eligibility_summary || null,
      funding_type:         editForm.funding_type || null,
      is_loan:              editForm.is_loan,
      amount_min:           editForm.amount_min  === '' ? null : Number(editForm.amount_min),
      amount_max:           editForm.amount_max  === '' ? null : Number(editForm.amount_max),
      status:               editForm.status,
      application_deadline: editForm.application_deadline || null,
      application_url:      editForm.application_url || null,
      states_eligible:      statesEligible,
      program_category:     editForm.program_category || null,
      contact_info:         editForm.contact_info || null,
      is_manually_curated:  editForm.is_manually_curated,
      data_source_notes:    editForm.data_source_notes || null,
    }
    try {
      await adminAction('save_edit', editingGrant.id, updatedFields)
      setEditSaveMsg('success')
      await loadAdminData()
    } catch (err) {
      setEditSaveMsg(`error:${err.message}`)
    }
    setSavingEdit(false)
  }

  async function archiveGrant(grant) {
    setActionError('')
    try {
      await adminAction('archive', grant.id)
      // Remove from local state immediately — no reload needed
      setAllGrants(prev => prev.filter(g => g.id !== grant.id))
      setArchivedGrants(prev => [{
        ...grant, approved: false, data_source_notes: 'Archived by admin - not brewery relevant',
      }, ...prev])
    } catch (err) {
      setActionError(`Archive failed: ${err.message}`)
    }
  }

  async function overrideGrant(grant) {
    setActionError('')
    try {
      await adminAction('override', grant.id)
      openEdit({ ...grant, is_manually_curated: true })
    } catch (err) {
      setActionError(`Override failed: ${err.message}`)
    }
  }

  async function restoreGrant(grant) {
    try {
      await adminAction('restore', grant.id)
      setArchivedGrants(prev => prev.filter(g => g.id !== grant.id))
      setAllGrants(prev => [{ ...grant, approved: true, data_source_notes: null }, ...prev])
    } catch (err) {
      setActionError(`Restore failed: ${err.message}`)
    }
  }

  // ── Pending submission actions ──────────────────────────────────────────────

  async function approveGrant(grantId) {
    await supabase.from('grants').update({ approved: true }).eq('id', grantId)
    loadAdminData()
  }

  async function rejectGrant(grantId, submittedByUserId) {
    await supabase.functions.invoke('reject-grant-submission', {
      body: { grantId, submittedByUserId },
    })
    loadAdminData()
  }

  // ── Manual sync ─────────────────────────────────────────────────────────────

  async function triggerManualSync() {
    setSyncing(true)
    setSyncMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('grants-sync')
      if (error) throw error
      setSyncMessage(`✅ Sync complete — ${data?.added ?? 0} added, ${data?.updated ?? 0} updated.`)
      loadAdminData()
    } catch (err) {
      setSyncMessage(`❌ Sync failed: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  // ── CSV Import helpers ──────────────────────────────────────────────────────

  // Parses raw CSV text into { headers (lowercase), rows (array of arrays) }.
  // Handles quoted fields, embedded commas, escaped double-quotes, and \r\n.
  function parseCSVText(text) {
    const rows = []
    let row = [], field = '', inQuotes = false, i = 0
    while (i < text.length) {
      const ch = text[i]
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
        if (ch === '"') { inQuotes = false; i++; continue }
        field += ch; i++; continue
      }
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === ',') { row.push(field); field = ''; i++; continue }
      if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
      field += ch; i++
    }
    if (field || row.length > 0) { row.push(field); rows.push(row) }
    if (rows.length === 0) return { headers: [], rows: [] }
    const headers = rows[0].map(h => h.trim().toLowerCase())
    const dataRows = rows.slice(1).filter(r => r.some(f => f.trim()))
    return { headers, rows: dataRows }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setImportParsed(null)
    setImportResult(null)
    setImportError('')
    setWipeConfirm1(false)
    setWipeConfirmText('')
  }

  function handleParseCSV() {
    if (!importFile) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = parseCSVText(e.target.result)
        if (parsed.headers.length === 0) {
          setImportError('Could not parse CSV — file appears to be empty.')
          return
        }
        setImportParsed(parsed)
        setImportError('')
      } catch (err) {
        setImportError(`Parse error: ${err.message}`)
      }
    }
    reader.readAsText(importFile)
  }

  // Converts parsed CSV rows into record objects keyed by lowercase CSV header name
  function buildRecords(parsed) {
    return parsed.rows.map(row =>
      Object.fromEntries(parsed.headers.map((h, i) => [h, row[i] ?? '']))
    )
  }

  async function handleImport(wipeFirst = false) {
    if (!importParsed) return
    setImporting(true)
    setImportResult(null)
    setImportError('')
    try {
      const { data, error } = await supabase.functions.invoke('import-grants-csv', {
        body: { records: buildRecords(importParsed), wipe_first: wipeFirst },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      setImportResult(data)
      setWipeConfirm1(false)
      setWipeConfirmText('')
      await loadAdminData()
    } catch (err) {
      setImportError(`Import failed: ${err.message}`)
    }
    setImporting(false)
  }

  // ── Filtered grant list for Grant Management tab ────────────────────────────

  const filteredGrants = useMemo(() => {
    return allGrants.filter(g => {
      if (gmSourceFilter !== 'all' && g.grant_source !== gmSourceFilter) return false
      if (gmSearch.trim()) {
        const q = gmSearch.toLowerCase()
        return (
          g.title?.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [allGrants, gmSearch, gmSourceFilter])

  if (loading) return <LoadingSpinner message="Loading admin panel..." />

  return (
    <div className="space-y-4 max-w-6xl">
      <h2 className="text-xl font-bold text-navy">🔧 Admin Panel</h2>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Tab navigation */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <AdminTab active={activeTab === 'pending'} onClick={() => setActiveTab('pending')} count={pendingGrants.length}>
            Pending Submissions
          </AdminTab>
          <AdminTab active={activeTab === 'manage'} onClick={() => setActiveTab('manage')} count={allGrants.length}>
            Grant Management
          </AdminTab>
          <AdminTab active={activeTab === 'archived'} onClick={() => setActiveTab('archived')} count={archivedGrants.length}>
            Archived Grants
          </AdminTab>
          <AdminTab active={activeTab === 'sync'} onClick={() => setActiveTab('sync')}>
            Sync History
          </AdminTab>
          <AdminTab active={activeTab === 'import'} onClick={() => setActiveTab('import')}>
            Import Data
          </AdminTab>
        </div>

        <div className="p-5">

          {/* ── Pending Submissions ─────────────────────────────────────────── */}
          {activeTab === 'pending' && (
            pendingGrants.length === 0 ? (
              <EmptyState
                icon="✅"
                title="No pending submissions"
                message="When brewery users submit grants for review, they'll appear here."
              />
            ) : (
              <div className="space-y-4">
                {pendingGrants.map(grant => (
                  <div key={grant.id} className="border border-gray-200 rounded-lg p-4">
                    <p className="font-semibold text-navy text-sm">{grant.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Submitted by: {grant.users?.email ?? 'unknown'} •{' '}
                      {new Date(grant.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-600 mt-2 line-clamp-2">{grant.eligibility_summary}</p>
                    {grant.application_url && (
                      <a href={grant.application_url} target="_blank" rel="noopener noreferrer"
                        className="text-amber text-xs hover:underline block mt-1 truncate">
                        {grant.application_url}
                      </a>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => approveGrant(grant.id)}
                        className="text-xs bg-success text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
                        ✅ Approve
                      </button>
                      <button onClick={() => rejectGrant(grant.id, grant.submitted_by_user_id)}
                        className="text-xs bg-danger text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors">
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Grant Management ────────────────────────────────────────────── */}
          {activeTab === 'manage' && (
            <div className="space-y-4">
              {actionError && (
                <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <p className="text-sm font-medium text-danger">❌ {actionError}</p>
                  <button onClick={() => setActionError('')} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4">✕</button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={gmSearch}
                  onChange={e => setGmSearch(e.target.value)}
                  placeholder="Search by title or description…"
                  className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                />
                <select
                  value={gmSourceFilter}
                  onChange={e => setGmSourceFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
                >
                  <option value="all">All Sources</option>
                  <option value="grants_gov">Grants.gov</option>
                  <option value="manual">Manual</option>
                  <option value="user_submitted">User Submitted</option>
                </select>
              </div>

              <p className="text-xs text-gray-500">
                Showing {filteredGrants.length} of {allGrants.length} approved grants
              </p>

              {filteredGrants.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No grants match your search.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[760px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-left">
                        <th className="pb-2 pr-3 font-medium">Title</th>
                        <th className="pb-2 pr-3 font-medium">Source</th>
                        <th className="pb-2 pr-3 font-medium">Category</th>
                        <th className="pb-2 pr-3 font-medium">Scope</th>
                        <th className="pb-2 pr-3 font-medium">Amount</th>
                        <th className="pb-2 pr-3 font-medium">Last Reviewed</th>
                        <th className="pb-2 pr-3 font-medium">Status</th>
                        <th className="pb-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredGrants.map(grant => (
                        <GrantRow
                          key={grant.id}
                          grant={grant}
                          onEdit={() => openEdit(grant)}
                          onArchive={() => archiveGrant(grant)}
                          onOverride={() => overrideGrant(grant)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Archived Grants ─────────────────────────────────────────────── */}
          {activeTab === 'archived' && (
            archivedGrants.length === 0 ? (
              <EmptyState
                icon="🗂️"
                title="No archived grants"
                message="Grants you archive from the Grant Management tab will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[540px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 text-left">
                      <th className="pb-2 pr-3 font-medium">Title</th>
                      <th className="pb-2 pr-3 font-medium">Source</th>
                      <th className="pb-2 pr-3 font-medium">Archive Reason</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {archivedGrants.map(grant => (
                      <tr key={grant.id} className="hover:bg-gray-50">
                        <td className="py-2 pr-3 max-w-xs">
                          <span className="block truncate font-medium text-navy" title={grant.title}>
                            {(grant.title ?? '').slice(0, 60)}{(grant.title?.length ?? 0) > 60 ? '…' : ''}
                          </span>
                        </td>
                        <td className="py-2 pr-3"><SourceBadge source={grant.grant_source} /></td>
                        <td className="py-2 pr-3 text-gray-500 max-w-xs">
                          <span className="block truncate" title={grant.data_source_notes ?? ''}>
                            {grant.data_source_notes ?? '—'}
                          </span>
                        </td>
                        <td className="py-2">
                          <button onClick={() => restoreGrant(grant)}
                            className="text-xs bg-success text-white px-2 py-1 rounded hover:bg-green-700 transition-colors">
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Sync History ────────────────────────────────────────────────── */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={triggerManualSync}
                  disabled={syncing}
                  className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors disabled:opacity-60"
                >
                  {syncing ? 'Syncing…' : '▶ Run Sync Now'}
                </button>
                {syncMessage && (
                  <p className="text-sm font-medium text-navy">{syncMessage}</p>
                )}
              </div>

              {syncLogs.length === 0 ? (
                <p className="text-sm text-gray-400">No sync history yet. Run a sync to populate this log.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-left">
                        <th className="pb-2 pr-3 font-medium">Timestamp</th>
                        <th className="pb-2 pr-3 font-medium">Type</th>
                        <th className="pb-2 pr-3 font-medium">Added</th>
                        <th className="pb-2 pr-3 font-medium">Updated</th>
                        <th className="pb-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {syncLogs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="py-2 pr-3 whitespace-nowrap text-gray-700">
                            {new Date(log.synced_at).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">{log.sync_type}</td>
                          <td className="py-2 pr-3">
                            <span className="font-medium text-success">+{log.grants_added}</span>
                          </td>
                          <td className="py-2 pr-3">
                            <span className="font-medium text-blue-600">~{log.grants_updated}</span>
                          </td>
                          <td className="py-2 text-gray-500 max-w-xs">
                            <span className="block truncate" title={log.notes ?? ''}>
                              {log.notes ?? '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Import Data ─────────────────────────────────────────────────── */}
          {activeTab === 'import' && (
            <div className="space-y-5">

              {/* Warning banner */}
              <div className="bg-amber/10 border border-amber/30 rounded-lg px-4 py-3 text-sm text-amber font-medium">
                ⚠️ Importing will upsert all records using the program ID as the key. Existing records
                with matching program IDs will be updated. Records without matching IDs will be inserted.
                No records will be deleted during a standard import.
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Select CSV File</label>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
                    <span className="text-gray-400 text-lg">📂</span>
                    <span className="text-sm text-gray-600">
                      {importFile ? importFile.name : 'Click to choose a CSV file'}
                    </span>
                    <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
                  </label>
                  {importFile && (
                    <button
                      onClick={handleParseCSV}
                      className="text-sm bg-navy text-white px-4 py-2 rounded-lg hover:bg-navy/80 transition-colors"
                    >
                      Parse CSV
                    </button>
                  )}
                </div>
              </div>

              {/* Parse error */}
              {importError && !importParsed && (
                <p className="text-sm text-danger font-medium">❌ {importError}</p>
              )}

              {/* Preview + column mapping */}
              {importParsed && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Parsed <strong>{importParsed.rows.length}</strong> records with{' '}
                    <strong>{importParsed.headers.length}</strong> columns.
                  </p>

                  {/* Column mapping reference */}
                  <details className="border border-gray-200 rounded-lg">
                    <summary className="px-4 py-2.5 text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">
                      Column Mapping Reference ({importParsed.headers.length} columns detected)
                    </summary>
                    <div className="px-4 pb-3 overflow-x-auto">
                      <table className="w-full text-xs mt-2 min-w-[400px]">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-gray-500">
                            <th className="pb-1 pr-4 font-medium">CSV Column</th>
                            <th className="pb-1 font-medium">Database Field</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {[
                            ['program id',                         'external_program_id'],
                            ['grant title',                        'title'],
                            ['program acronym',                    'program_acronym'],
                            ['acronym definition',                 'acronym_definition'],
                            ['funding type',                       'funding_type + is_loan'],
                            ['government level',                   'government_level + is_federal'],
                            ['funding agency/organization',        'funding_agency'],
                            ['program category',                   'program_category'],
                            ['brief description',                  'description'],
                            ['eligibility notes',                  'eligibility_summary'],
                            ['brewery relevance score',            'brewery_relevance_score'],
                            ['confidence level',                   'confidence_level'],
                            ['minimum award amount',               'amount_min'],
                            ['maximum award amount',               'amount_max'],
                            ['application deadline',               'application_deadline'],
                            ['application cycle',                  'application_cycle'],
                            ['program status',                     'status (Active→open)'],
                            ['application url',                    'application_url'],
                            ['source url',                         'source_url'],
                            ['states that are eligible',           'states_eligible'],
                            ['county',                             'county'],
                            ['municipality',                       'municipality'],
                            ['rural eligible',                     'rural_eligible'],
                            ['opportunity zone eligible',          'opportunity_zone_eligible'],
                            ['forgivable loan eligible',           'forgivable_loan_eligible'],
                            ['stackable with other incentives',    'stackable'],
                            ['industry focus',                     'industry_focus'],
                            ['business stage',                     'business_stage'],
                            ['maintenance priority',               'maintenance_priority'],
                            ['next recommended verification date', 'next_verification_date'],
                            ['program priority tier',              'program_priority_tier'],
                            ['additional notes',                   'data_quality_notes'],
                            ['active record',                      'approved'],
                          ].map(([csv, db]) => (
                            <tr key={csv}>
                              <td className="py-1 pr-4 text-gray-600 font-mono">{csv}</td>
                              <td className="py-1 text-navy font-mono">{db}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  {/* Preview table */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      Preview — first {Math.min(10, importParsed.rows.length)} rows
                    </p>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="text-xs min-w-max">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            {importParsed.headers.map(h => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {importParsed.rows.slice(0, 10).map((row, ri) => (
                            <tr key={ri} className="hover:bg-gray-50">
                              {row.map((cell, ci) => (
                                <td key={ci} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Import button + result */}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleImport(false)}
                      disabled={importing}
                      className="text-sm bg-amber text-white font-medium px-5 py-2 rounded-lg hover:bg-amber-dark transition-colors disabled:opacity-60"
                    >
                      {importing ? 'Importing…' : `⬆ Import ${importParsed.rows.length} Records`}
                    </button>
                  </div>

                  {/* Import error */}
                  {importError && (
                    <p className="text-sm text-danger font-medium">❌ {importError}</p>
                  )}

                  {/* Import result */}
                  {importResult && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
                      <p className="text-sm font-semibold text-green-800">✅ Import complete</p>
                      <p className="text-xs text-green-700">
                        Processed: {importResult.processed} &nbsp;·&nbsp;
                        Upserted: {importResult.upserted} &nbsp;·&nbsp;
                        Skipped: {importResult.skipped}
                      </p>
                      {importResult.errors?.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-red-600 cursor-pointer font-medium">
                            {importResult.errors.length} error(s) — click to expand
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                            {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Wipe and Replace */}
                  <div className="border-t border-gray-200 pt-5 space-y-3">
                    <p className="text-xs font-semibold text-gray-700">Wipe and Replace</p>
                    <p className="text-xs text-gray-500">
                      Deletes ALL manually curated grants, then imports the CSV from scratch.
                      Use this for quarterly full refreshes only. User-submitted grants are not affected.
                    </p>

                    {!wipeConfirm1 ? (
                      <button
                        onClick={() => setWipeConfirm1(true)}
                        className="text-sm border border-danger/50 text-danger px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        🗑 Wipe and Replace All Curated Grants
                      </button>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                        <p className="text-sm font-semibold text-danger">
                          ⚠️ This will permanently delete all manually curated grants. Are you sure?
                        </p>
                        <p className="text-xs text-red-600">
                          Type <strong>WIPE</strong> below to confirm, then click the button.
                        </p>
                        <input
                          type="text"
                          value={wipeConfirmText}
                          onChange={e => setWipeConfirmText(e.target.value)}
                          placeholder="Type WIPE to confirm"
                          className="border border-red-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-danger"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleImport(true)}
                            disabled={wipeConfirmText !== 'WIPE' || importing}
                            className="text-sm bg-danger text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40"
                          >
                            {importing ? 'Wiping & Importing…' : 'Confirm Wipe and Replace'}
                          </button>
                          <button
                            onClick={() => { setWipeConfirm1(false); setWipeConfirmText('') }}
                            className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          )}

        </div>
      </div>

      {/* Edit modal — rendered outside the card so z-index stacking is clean */}
      {editingGrant && (
        <EditGrantModal
          form={editForm}
          setForm={setEditForm}
          saveMsg={editSaveMsg}
          saving={savingEdit}
          onSave={saveEdit}
          onClose={() => setEditingGrant(null)}
        />
      )}
    </div>
  )
}
