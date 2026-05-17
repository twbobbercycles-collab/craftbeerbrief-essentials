/**
 * PackagingPage — Packaging Operations list view for the Operations tier.
 * Shows all packaging_runs records (canning, kegging, bottling events) and
 * lets the user create new runs manually or linked to a fermentation.
 *
 * Runs flow: planned → in_progress → complete | cancelled
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  planned:     'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber/15 text-amber',
  complete:    'bg-green-100 text-success',
  cancelled:   'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  planned:     'Planned',
  in_progress: 'In Progress',
  complete:    'Complete',
  cancelled:   'Cancelled',
}

// localStorage key for persisting the status filter tab between sessions
const FILTER_STORAGE_KEY = 'packaging_filter_status'

// Volume unit options for new run form
const VOLUME_UNITS = ['barrels', 'gallons', 'liters', 'hectoliters']

// Shared Tailwind classes for form inputs and labels
const INPUT_CLS =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

// ── Default export: TierGate wrapper ─────────────────────────────────────────

export default function PackagingPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="batch_to_sale"
      featureName="Packaging"
      featureDescription="Log every canning, kegging, and bottling run. Track volumes, yields, and costs from fermenter to final package — all linked to your recipes and fermentation records."
    >
      <PackagingTracker />
    </TierGate>
  )
}

// ── PackagingTracker — main list component ────────────────────────────────────

function PackagingTracker() {
  const { brewery } = useAuth()
  const { isReadOnly } = useReadOnly()
  const navigate = useNavigate()

  const [runs,         setRuns]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem(FILTER_STORAGE_KEY) ?? 'all'
  )
  const [newOpen, setNewOpen] = useState(false)

  // Persist selected status filter tab to localStorage whenever it changes
  function handleStatusFilter(value) {
    setStatusFilter(value)
    localStorage.setItem(FILTER_STORAGE_KEY, value)
  }

  // Fetch all packaging_runs for this brewery, newest first
  const loadRuns = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('packaging_runs')
      .select('*')
      .eq('brewery_id', brewery.id)
      .order('packaging_date', { ascending: false })
    if (!error) setRuns(data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  // Apply search and status filters to the full runs list
  const filteredRuns = runs.filter((run) => {
    const matchesStatus =
      statusFilter === 'all' || run.status === statusFilter

    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      (run.batch_number ?? '').toLowerCase().includes(q) ||
      (run.beer_name ?? '').toLowerCase().includes(q)

    return matchesStatus && matchesSearch
  })

  // Cancel a planned run after user confirmation
  async function handleCancel(run) {
    const confirmed = window.confirm(
      `Cancel packaging run for "${run.beer_name}" (${run.batch_number})? This cannot be undone.`
    )
    if (!confirmed) return
    const { error } = await supabase
      .from('packaging_runs')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', run.id)
    if (!error) loadRuns()
  }

  // Format packaging_date as "May 15, 2026"
  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Determine Tailwind text color for yield percentage
  function yieldColor(pct) {
    if (pct == null) return ''
    if (pct >= 85) return 'text-success'
    if (pct >= 75) return 'text-amber'
    return 'text-danger'
  }

  return (
    <div className="space-y-6">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Packaging</h1>
          <p className="text-gray-500 text-sm mt-0.5">Log and manage packaging runs</p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 bg-amber hover:bg-amber-dark text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors shrink-0"
          >
            + New Packaging Run
          </button>
        )}
      </div>

      {/* ── Status filter pills ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1">
        {['all', 'planned', 'in_progress', 'complete', 'cancelled'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleStatusFilter(tab)}
            className={
              statusFilter === tab
                ? 'bg-navy text-white rounded-full px-3 py-1 text-sm font-medium transition-colors'
                : 'text-gray-600 hover:text-navy rounded-full px-3 py-1 text-sm transition-colors'
            }
          >
            {tab === 'all' ? 'All' : STATUS_LABELS[tab] ?? tab}
          </button>
        ))}
      </div>

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <input
        type="text"
        placeholder="Search batch number or beer name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={INPUT_CLS}
      />

      {/* ── Content area ──────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSpinner message="Loading packaging runs…" />
      ) : filteredRuns.length === 0 ? (
        <EmptyState hasRuns={runs.length > 0} />
      ) : (
        <>
          {/* Desktop table — hidden on small screens */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Batch #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Beer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">From Fermenter</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Total Packaged</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Yield %</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">

                    {/* Batch number badge */}
                    <td className="px-4 py-3">
                      <span className="inline-block bg-navy text-white font-mono text-xs px-2 py-0.5 rounded">
                        {run.batch_number ?? '—'}
                      </span>
                    </td>

                    {/* Beer name + style */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-navy">{run.beer_name ?? '—'}</span>
                      {run.beer_style && (
                        <span className="block text-xs text-gray-400 mt-0.5">{run.beer_style}</span>
                      )}
                    </td>

                    {/* Packaging date */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(run.packaging_date)}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[run.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[run.status] ?? run.status}
                      </span>
                    </td>

                    {/* Volume from fermenter */}
                    <td className="px-4 py-3 text-gray-600">
                      {run.volume_from_fermenter != null
                        ? `${run.volume_from_fermenter} ${run.volume_unit ?? ''}`
                        : '—'}
                    </td>

                    {/* Total volume packaged */}
                    <td className="px-4 py-3 text-gray-600">
                      {run.total_volume_packaged != null
                        ? `${run.total_volume_packaged} ${run.volume_unit ?? ''}`
                        : '—'}
                    </td>

                    {/* Yield percentage — color-coded */}
                    <td className={`px-4 py-3 font-medium ${yieldColor(run.packaging_yield_percentage)}`}>
                      {run.packaging_yield_percentage != null
                        ? `${Number(run.packaging_yield_percentage).toFixed(1)}%`
                        : '—'}
                    </td>

                    {/* Row actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => navigate(`/packaging/${run.id}`)}
                          className="text-xs font-medium text-navy border border-navy rounded px-2.5 py-1 hover:bg-navy hover:text-white transition-colors"
                        >
                          Open
                        </button>
                        {run.status === 'planned' && !isReadOnly && (
                          <button
                            onClick={() => handleCancel(run)}
                            className="text-xs font-medium text-danger border border-danger rounded px-2.5 py-1 hover:bg-danger hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — shown only on small screens */}
          <div className="md:hidden space-y-3">
            {filteredRuns.map((run) => (
              <div key={run.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block bg-navy text-white font-mono text-xs px-2 py-0.5 rounded mb-1">
                      {run.batch_number ?? '—'}
                    </span>
                    <p className="font-semibold text-navy text-sm">{run.beer_name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{formatDate(run.packaging_date)}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[run.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[run.status] ?? run.status}
                  </span>
                </div>

                {run.packaging_yield_percentage != null && (
                  <p className={`text-sm font-medium ${yieldColor(run.packaging_yield_percentage)}`}>
                    Yield: {Number(run.packaging_yield_percentage).toFixed(1)}%
                  </p>
                )}

                <button
                  onClick={() => navigate(`/packaging/${run.id}`)}
                  className="w-full text-sm font-medium text-navy border border-navy rounded-lg py-2 hover:bg-navy hover:text-white transition-colors"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* New run modal */}
      {newOpen && (
        <NewPackagingRunModal
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false)
            loadRuns()
          }}
        />
      )}
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

// Shown when no runs exist yet or when filters return nothing
function EmptyState({ hasRuns }) {
  return (
    <div className="text-center py-20 px-6">
      <p className="text-4xl mb-3">📦</p>
      {hasRuns ? (
        <p className="text-gray-500 text-sm">No packaging runs match your current filters.</p>
      ) : (
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          No packaging runs yet. Runs are created automatically when a fermentation is marked
          Ready to Package, or you can create one manually.
        </p>
      )}
    </div>
  )
}

// ── NewPackagingRunModal ──────────────────────────────────────────────────────

function NewPackagingRunModal({ onClose, onSaved }) {
  const { brewery } = useAuth()
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_packaging_run')

  // Fermentations that are eligible to link to a new packaging run
  const [fermentations, setFermentations] = useState([])

  // Form fields
  const [linkFerm,            setLinkFerm]            = useState(false)
  const [selectedFermId,      setSelectedFermId]      = useState('')
  const [batchNumber,         setBatchNumber]         = useState('')
  const [beerName,            setBeerName]            = useState('')
  const [beerStyle,           setBeerStyle]           = useState('')
  const [packagingDate,       setPackagingDate]       = useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [volumeFromFermenter, setVolumeFromFermenter] = useState('')
  const [volumeUnit,          setVolumeUnit]          = useState('barrels')
  const [notes,               setNotes]               = useState('')

  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // The form is considered dirty if any user-facing field has been touched
  const isDirty =
    batchNumber !== '' ||
    beerName !== '' ||
    beerStyle !== '' ||
    notes !== '' ||
    volumeFromFermenter !== '' ||
    linkFerm

  // On mount: restore any saved draft, then load eligible fermentations
  useEffect(() => {
    const draft = loadDraft()
    if (draft) {
      setLinkFerm(draft.linkFerm ?? false)
      setSelectedFermId(draft.selectedFermId ?? '')
      setBatchNumber(draft.batchNumber ?? '')
      setBeerName(draft.beerName ?? '')
      setBeerStyle(draft.beerStyle ?? '')
      setPackagingDate(draft.packagingDate ?? new Date().toISOString().slice(0, 10))
      setVolumeFromFermenter(draft.volumeFromFermenter ?? '')
      setVolumeUnit(draft.volumeUnit ?? 'barrels')
      setNotes(draft.notes ?? '')
    }
    fetchFermentations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load fermentations eligible for linking (ready_to_package or packaged)
  async function fetchFermentations() {
    if (!brewery?.id) return
    const { data } = await supabase
      .from('fermentations')
      .select('id, batch_number, beer_name, beer_style, status, volume_in_fermenter, volume_unit')
      .eq('brewery_id', brewery.id)
      .in('status', ['ready_to_package', 'packaged'])
      .order('batch_number', { ascending: false })
    setFermentations(data ?? [])
  }

  // Collect the current form values into a plain object for draft persistence
  function currentFormState() {
    return {
      linkFerm, selectedFermId, batchNumber, beerName, beerStyle,
      packagingDate, volumeFromFermenter, volumeUnit, notes,
    }
  }

  // Returns an onChange handler that updates state and saves a draft
  function handleFieldChange(setter) {
    return (val) => {
      setter(val)
      // Schedule after state flush so currentFormState() captures the new value
      setTimeout(() => saveDraft(currentFormState()), 0)
    }
  }

  // Auto-populate fields from the selected fermentation record
  function handleFermSelect(fermId) {
    setSelectedFermId(fermId)
    const ferm = fermentations.find((f) => f.id === fermId)
    if (ferm) {
      setBatchNumber(ferm.batch_number ?? '')
      setBeerName(ferm.beer_name ?? '')
      setBeerStyle(ferm.beer_style ?? '')
      setVolumeFromFermenter(
        ferm.volume_in_fermenter != null ? String(ferm.volume_in_fermenter) : ''
      )
      setVolumeUnit(ferm.volume_unit ?? 'barrels')
    }
    saveDraft({ ...currentFormState(), selectedFermId: fermId })
  }

  // Toggle the "link to fermentation" switch and clear linked fields when turned off
  function handleLinkToggle(checked) {
    setLinkFerm(checked)
    if (!checked) {
      setSelectedFermId('')
      setBatchNumber('')
      setBeerName('')
      setBeerStyle('')
      setVolumeFromFermenter('')
    }
    saveDraft({ ...currentFormState(), linkFerm: checked, selectedFermId: '' })
  }

  // Validate required fields; return true when the form is ready to submit
  function validate() {
    const errs = {}
    if (!batchNumber.trim()) errs.batchNumber = 'Batch number is required.'
    if (!beerName.trim())    errs.beerName    = 'Beer name is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Insert a new packaging_run row into Supabase
  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)

    const payload = {
      brewery_id:            brewery.id,
      fermentation_id:       linkFerm && selectedFermId ? selectedFermId : null,
      batch_number:          batchNumber.trim(),
      beer_name:             beerName.trim(),
      beer_style:            beerStyle.trim() || null,
      packaging_date:        packagingDate,
      status:                'planned',
      volume_from_fermenter: volumeFromFermenter ? Number(volumeFromFermenter) : null,
      volume_unit:           volumeUnit,
      notes:                 notes.trim() || null,
    }

    const { error } = await supabase.from('packaging_runs').insert(payload)
    setSaving(false)

    if (error) {
      setErrors({ form: error.message })
      return
    }

    clearDraft()
    onSaved()
  }

  // Close and clear the draft — user explicitly dismissed the modal
  function handleClose() {
    clearDraft()
    onClose()
  }

  return (
    <ModalShell
      isOpen
      title="New Packaging Run"
      onClose={handleClose}
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <form onSubmit={handleSubmit} className="space-y-5 pt-1">

        {/* Form-level server error */}
        {errors.form && (
          <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-3 py-2">
            {errors.form}
          </p>
        )}

        {/* ── Link to fermentation toggle ─────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={linkFerm}
            onClick={() => handleLinkToggle(!linkFerm)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber ${
              linkFerm ? 'bg-amber' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 mt-0.5 ${
                linkFerm ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-navy">Link to a fermentation</span>
        </div>

        {/* Fermentation select — only visible when the toggle is on */}
        {linkFerm && (
          <div>
            <label className={LBL}>Fermentation batch</label>
            {fermentations.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No fermentations with status &ldquo;Ready to Package&rdquo; or &ldquo;Packaged&rdquo; found.
              </p>
            ) : (
              <select
                value={selectedFermId}
                onChange={(e) => handleFermSelect(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">— Select a fermentation —</option>
                {fermentations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.batch_number} — {f.beer_name}
                    {f.beer_style ? ` (${f.beer_style})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ── Batch number ────────────────────────────────────────────── */}
        <div>
          <label className={LBL}>
            Batch number <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={batchNumber}
            onChange={(e) => handleFieldChange(setBatchNumber)(e.target.value)}
            placeholder="e.g. B-2026-042"
            className={INPUT_CLS}
            disabled={linkFerm && !!selectedFermId}
          />
          {errors.batchNumber && (
            <p className="text-xs text-danger mt-1">{errors.batchNumber}</p>
          )}
        </div>

        {/* ── Beer name ───────────────────────────────────────────────── */}
        <div>
          <label className={LBL}>
            Beer name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={beerName}
            onChange={(e) => handleFieldChange(setBeerName)(e.target.value)}
            placeholder="e.g. Hazy IPA"
            className={INPUT_CLS}
            disabled={linkFerm && !!selectedFermId}
          />
          {errors.beerName && (
            <p className="text-xs text-danger mt-1">{errors.beerName}</p>
          )}
        </div>

        {/* ── Beer style ──────────────────────────────────────────────── */}
        <div>
          <label className={LBL}>Beer style (optional)</label>
          <input
            type="text"
            value={beerStyle}
            onChange={(e) => handleFieldChange(setBeerStyle)(e.target.value)}
            placeholder="e.g. New England IPA"
            className={INPUT_CLS}
            disabled={linkFerm && !!selectedFermId}
          />
        </div>

        {/* ── Packaging date ──────────────────────────────────────────── */}
        <div>
          <label className={LBL}>Packaging date</label>
          <input
            type="date"
            value={packagingDate}
            onChange={(e) => handleFieldChange(setPackagingDate)(e.target.value)}
            className={INPUT_CLS}
          />
        </div>

        {/* ── Volume from fermenter + unit ────────────────────────────── */}
        <div>
          <label className={LBL}>Volume from fermenter (optional)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={volumeFromFermenter}
              onChange={(e) => handleFieldChange(setVolumeFromFermenter)(e.target.value)}
              placeholder="0.00"
              className={`${INPUT_CLS} flex-1`}
              disabled={linkFerm && !!selectedFermId}
            />
            <select
              value={volumeUnit}
              onChange={(e) => handleFieldChange(setVolumeUnit)(e.target.value)}
              className={`${INPUT_CLS} w-36`}
            >
              {VOLUME_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Notes ───────────────────────────────────────────────────── */}
        <div>
          <label className={LBL}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => handleFieldChange(setNotes)(e.target.value)}
            placeholder="Any notes about this packaging run…"
            rows={3}
            className={`${INPUT_CLS} resize-none`}
          />
        </div>

        {/* ── Form actions ─────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Create Run'}
          </button>
        </div>

      </form>
    </ModalShell>
  )
}
