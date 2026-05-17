/**
 * BrewDayPage — Brew Day Scheduler schedule/list view.
 * Shows all planned and completed brew days for the brewery.
 * Operations tier only — wrapped in TierGate.
 * URL: /brewday
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'

// Exact column widths shared by the table header and every data row
const COL_TEMPLATE = '90px 1fr 110px 120px 100px 110px 70px 70px 130px'

// Status badge colors — maps status string to Tailwind classes
const STATUS_STYLES = {
  scheduled:   'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber/15 text-amber',
  completed:   'bg-green-100 text-success',
  cancelled:   'bg-gray-100 text-gray-500',
}
const STATUS_LABELS = {
  scheduled:   'Scheduled',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
}

// Mash type short labels for badges
const MASH_LABELS = {
  step_mash: 'Step Mash',
  decoction: 'Decoction',
  biab:      'BIAB',
  no_sparge: 'No Sparge',
  turbid:    'Turbid',
  other:     'Custom Mash',
}

// Mash badge colors — single_infusion intentionally absent (no badge shown)
const MASH_BADGE_STYLES = {
  step_mash: 'bg-purple-50 text-purple-700',
  decoction: 'bg-teal-50 text-teal-700',
  biab:      'bg-blue-50 text-blue-700',
  no_sparge: 'bg-slate-100 text-slate-600',
  turbid:    'bg-indigo-50 text-indigo-700',
  other:     'bg-gray-100 text-gray-600',
}

// localStorage key prefix for filter preferences
const LS_KEY = 'brewday_filters'

// Empty form for the Schedule a Brew modal
const EMPTY_FORM = {
  batch_number: '',
  brew_date: '',
  brew_start_time: '',
  link_recipe: false,
  recipe_id: '',
  recipe_name: '',
  beer_style: '',
  planned_batch_size: '',
  planned_batch_unit: 'barrels',
  brewer_name: '',
  assistant_brewer: '',
  fermenter_id: '',
  target_packaging_date: '',
  mash_type: 'single_infusion',
  sparge_method: 'fly_sparge',
  fermentation_type: 'standard',
  target_og: '',
  target_fg: '',
  target_abv: '',
  target_ibu: '',
  target_brewhouse_efficiency: '72',
  yeast_strain: '',
}

export default function BrewDayPage() {
  const { brewery, hasAccess } = useAuth()
  const navigate = useNavigate()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  // Brew day list state
  const [brewDays, setBrewDays]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [recipes, setRecipes]     = useState([])

  // Filter state — persisted in localStorage
  const [search, setSearch]           = useState(() => loadFilters().search || '')
  const [statusFilter, setStatusFilter] = useState(() => loadFilters().status || 'all')
  const [dateRange, setDateRange]     = useState(() => loadFilters().dateRange || 'this_year')

  // Schedule modal state
  const [addOpen, setAddOpen]     = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const draft = useModalDraft('modal_draft_brew_day')

  // Load all brew days for this brewery
  const loadBrewDays = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('brew_days')
      .select('*')
      .eq('brewery_id', brewery.id)
      .order('brew_date', { ascending: false })
    setBrewDays(data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => {
    if (hasAccess('operations')) loadBrewDays()
    else setLoading(false)
  }, [brewery?.id, loadBrewDays])

  // Load recipes for the recipe dropdown inside the schedule modal
  async function loadRecipes() {
    if (!brewery?.id) return
    const { data } = await supabase
      .from('recipes')
      .select('id, name, style, base_batch_size, base_batch_size_unit, target_og, target_fg, target_abv, target_ibu, fixed_overhead_percentage')
      .eq('brewery_id', brewery.id)
      .eq('is_archived', false)
      .order('name')
    setRecipes(data ?? [])
  }

  // Generate the next sequential batch number in YYYY-NNN format
  async function suggestBatchNumber() {
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('brew_days')
      .select('batch_number')
      .eq('brewery_id', brewery.id)
      .like('batch_number', `${year}-%`)
      .order('batch_number', { ascending: false })
      .limit(1)
    if (data?.length > 0) {
      const parts = data[0].batch_number.split('-')
      const num = parseInt(parts[parts.length - 1]) || 0
      return `${year}-${String(num + 1).padStart(3, '0')}`
    }
    return `${year}-001`
  }

  // Open the schedule modal — load draft, suggest batch number, fetch recipes
  async function openAddModal() {
    const saved = draft.loadDraft()
    const suggested = await suggestBatchNumber()
    setForm(saved ?? { ...EMPTY_FORM, batch_number: suggested })
    setSaveError('')
    setAddOpen(true)
    loadRecipes()
  }

  function closeAddModal() {
    draft.clearDraft()
    setForm(EMPTY_FORM)
    setAddOpen(false)
  }

  // Update a form field and save to draft
  function updateForm(field, value) {
    const next = { ...form, [field]: value }
    setForm(next)
    draft.saveDraft(next)
  }

  // When a recipe is selected, auto-populate planning fields from the recipe row
  function handleRecipeSelect(recipeId) {
    const rec = recipes.find(r => r.id === recipeId)
    if (!rec) { updateForm('recipe_id', ''); return }
    const next = {
      ...form,
      recipe_id:  rec.id,
      recipe_name: rec.name,
      beer_style:  rec.style ?? '',
      planned_batch_size: String(rec.base_batch_size ?? ''),
      planned_batch_unit: rec.base_batch_size_unit ?? 'barrels',
      target_og:   rec.target_og ? String(rec.target_og) : '',
      target_fg:   rec.target_fg ? String(rec.target_fg) : '',
      target_abv:  rec.target_abv ? String(rec.target_abv) : '',
      target_ibu:  rec.target_ibu ? String(rec.target_ibu) : '',
    }
    setForm(next)
    draft.saveDraft(next)
  }

  // Save a new brew day to the database
  async function handleSave(e) {
    e.preventDefault()
    if (!form.batch_number.trim()) { setSaveError('Batch number is required.'); return }
    if (!form.brew_date)           { setSaveError('Brew date is required.'); return }
    if (!form.brewer_name.trim())  { setSaveError('Brewer name is required.'); return }

    setSaving(true); setSaveError('')

    const { data, error } = await supabase.from('brew_days').insert({
      brewery_id:                 brewery.id,
      batch_number:               form.batch_number.trim(),
      recipe_id:                  form.recipe_id || null,
      recipe_name:                form.recipe_name || null,
      beer_style:                 form.beer_style || null,
      status:                     'scheduled',
      brew_date:                  form.brew_date,
      brew_start_time:            form.brew_start_time || null,
      brewer_name:                form.brewer_name.trim(),
      assistant_brewer:           form.assistant_brewer || null,
      planned_batch_size:         form.planned_batch_size ? parseFloat(form.planned_batch_size) : null,
      planned_batch_unit:         form.planned_batch_unit,
      target_og:                  form.target_og ? parseFloat(form.target_og) : null,
      target_fg:                  form.target_fg ? parseFloat(form.target_fg) : null,
      target_abv:                 form.target_abv ? parseFloat(form.target_abv) : null,
      target_ibu:                 form.target_ibu ? parseFloat(form.target_ibu) : null,
      target_brewhouse_efficiency: parseFloat(form.target_brewhouse_efficiency) || 72,
      mash_type:                  form.mash_type || null,
      sparge_method:              form.sparge_method || null,
      fermentation_type:          form.fermentation_type || null,
      fermenter_id:               form.fermenter_id || null,
      target_packaging_date:      form.target_packaging_date || null,
      yeast_strain:               form.yeast_strain || null,
    }).select().single()

    setSaving(false)
    if (error) { setSaveError(error.message); return }
    draft.clearDraft()
    navigate(`/brewday/${data.id}`)
  }

  // Cancel a brew day (sets status to cancelled)
  async function handleCancel(bd) {
    if (!window.confirm(`Cancel brew day ${bd.batch_number}?`)) return
    await supabase.from('brew_days').update({ status: 'cancelled' }).eq('id', bd.id)
    setBrewDays(prev => prev.map(b => b.id === bd.id ? { ...b, status: 'cancelled' } : b))
  }

  // Save filter preferences to localStorage whenever they change
  function saveFilters(updates) {
    const current = loadFilters()
    localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...updates }))
  }

  function onSearchChange(v)       { setSearch(v);       saveFilters({ search: v }) }
  function onStatusChange(v)       { setStatusFilter(v); saveFilters({ status: v }) }
  function onDateRangeChange(v)    { setDateRange(v);    saveFilters({ dateRange: v }) }

  // Filter brew days by search text, status, and date range
  const visible = brewDays.filter(bd => {
    if (statusFilter !== 'all' && bd.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(bd.batch_number ?? '').toLowerCase().includes(q) &&
          !(bd.recipe_name  ?? '').toLowerCase().includes(q) &&
          !(bd.beer_style   ?? '').toLowerCase().includes(q) &&
          !(bd.brewer_name  ?? '').toLowerCase().includes(q)) return false
    }
    const d = new Date(bd.brew_date + 'T00:00:00')
    const now = new Date()
    if (dateRange === 'this_month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }
    if (dateRange === 'last_3_months') {
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3)
      return d >= cutoff
    }
    if (dateRange === 'this_year') {
      return d.getFullYear() === now.getFullYear()
    }
    return true
  })

  // Pull last 10 completed brews for the efficiency history table
  // Include all completed brews — those without efficiency data show '—'
  const completedBrews = brewDays
    .filter(bd => bd.status === 'completed')
    .slice(0, 10)

  const isDirty = Object.keys(EMPTY_FORM).some(k => form[k] !== EMPTY_FORM[k])

  const pageContent = (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">🗓️ Brew Day Scheduler</h2>
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={openAddModal}
            disabled={isReadOnly}
            className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            + Schedule a Brew
          </button>
        </ReadOnlyTooltip>
      </div>

      {/* Draft notice */}
      {draft.hasDraft && !addOpen && (
        <DraftNoticeBar onContinue={openAddModal} onDiscard={() => draft.clearDraft()} />
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search batch #, beer name, brewer..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-amber"
        />
        <select
          value={statusFilter}
          onChange={e => onStatusChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={dateRange}
          onChange={e => onDateRangeChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          <option value="this_month">This Month</option>
          <option value="last_3_months">Last 3 Months</option>
          <option value="this_year">This Year</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {/* ── Loading ── */}
      {loading && <LoadingSpinner message="Loading brew days..." />}

      {/* ── Empty state ── */}
      {!loading && visible.length === 0 && (
        <EmptyState
          icon="🗓️"
          title="No brew days scheduled yet"
          message={search || statusFilter !== 'all' ? 'No brew days match your filters.' : 'Click Schedule a Brew to plan your first batch.'}
          action={
            !search && statusFilter === 'all' && !isReadOnly
              ? <button onClick={openAddModal} className="bg-amber text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">Schedule a Brew</button>
              : null
          }
        />
      )}

      {/* ── Brew day table ── */}
      {!loading && visible.length > 0 && (
        <BrewDayTable
          rows={visible}
          onView={id => navigate(`/brewday/${id}`)}
          onCancel={handleCancel}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
        />
      )}

      {/* ── Efficiency history — always shown once data loads ── */}
      {!loading && <EfficiencyHistoryPanel brews={completedBrews} />}
    </div>
  )

  return (
    <>
      <TierGate
        requiredTier="operations"
        featureKey="brew_day_scheduler"
        featureName="Brew Day Scheduler & Log"
        featureDescription="Schedule brew days, log every measurement as you brew, track brewhouse efficiency over time, and automatically deduct ingredients from inventory when a batch is complete."
      >
        {pageContent}
      </TierGate>

      {/* Schedule a Brew modal */}
      <ModalShell
        isOpen={addOpen}
        onClose={closeAddModal}
        title="Schedule a Brew"
        isDirty={isDirty}
        draftRestored={draft.draftRestored}
        onDismissDraft={draft.dismissDraftBanner}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-5">

          {/* ── Basic Info ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Batch Number <span className="text-danger">*</span>
              </label>
              <input
                type="text" required
                value={form.batch_number}
                onChange={e => updateForm('batch_number', e.target.value)}
                placeholder="e.g. 2026-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Brew Date <span className="text-danger">*</span>
              </label>
              <input
                type="date" required
                value={form.brew_date}
                onChange={e => updateForm('brew_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">
                Brewer Name <span className="text-danger">*</span>
              </label>
              <input
                type="text" required
                value={form.brewer_name}
                onChange={e => updateForm('brewer_name', e.target.value)}
                placeholder="Head brewer"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">Assistant Brewer</label>
              <input
                type="text"
                value={form.assistant_brewer}
                onChange={e => updateForm('assistant_brewer', e.target.value)}
                placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
          </div>

          {/* ── Recipe link ── */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.link_recipe}
                onChange={e => updateForm('link_recipe', e.target.checked)}
                className="rounded border-gray-300 text-amber focus:ring-amber"
              />
              <span className="text-sm font-semibold text-navy">Link to a recipe</span>
            </label>

            {form.link_recipe && (
              <div className="space-y-3">
                <select
                  value={form.recipe_id}
                  onChange={e => handleRecipeSelect(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
                >
                  <option value="">Choose a recipe...</option>
                  {recipes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}{r.style ? ` — ${r.style}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {!form.link_recipe && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Beer Name</label>
                  <input
                    type="text"
                    value={form.recipe_name}
                    onChange={e => updateForm('recipe_name', e.target.value)}
                    placeholder="e.g. Summer Hazy IPA"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Style</label>
                  <input
                    type="text"
                    value={form.beer_style}
                    onChange={e => updateForm('beer_style', e.target.value)}
                    placeholder="e.g. Hazy IPA"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Batch size ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Planned Batch Size</label>
              <input
                type="number" step="0.01" min="0"
                value={form.planned_batch_size}
                onChange={e => updateForm('planned_batch_size', e.target.value)}
                placeholder="e.g. 10"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Unit</label>
              <select
                value={form.planned_batch_unit}
                onChange={e => updateForm('planned_batch_unit', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="barrels">Barrels</option>
                <option value="gallons">Gallons</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Target Efficiency %</label>
              <input
                type="number" step="0.1" min="0" max="100"
                value={form.target_brewhouse_efficiency}
                onChange={e => updateForm('target_brewhouse_efficiency', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
          </div>

          {/* ── Targets ── */}
          <div>
            <p className="text-sm font-semibold text-navy mb-2">Targets <span className="text-gray-400 font-normal text-xs">(optional — auto-populated from linked recipe)</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'target_og',  label: 'Target OG',  placeholder: '1.065' },
                { key: 'target_fg',  label: 'Target FG',  placeholder: '1.012' },
                { key: 'target_abv', label: 'Target ABV %', placeholder: '6.5' },
                { key: 'target_ibu', label: 'Target IBU', placeholder: '45' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input
                    type="number" step="any"
                    value={form[f.key]}
                    onChange={e => updateForm(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Process configuration ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mash Type</label>
              <select
                value={form.mash_type}
                onChange={e => updateForm('mash_type', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="single_infusion">Single Infusion</option>
                <option value="step_mash">Step Mash</option>
                <option value="decoction">Decoction</option>
                <option value="biab">BIAB</option>
                <option value="no_sparge">No Sparge</option>
                <option value="turbid">Turbid Mash</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sparge Method</label>
              <select
                value={form.sparge_method}
                onChange={e => updateForm('sparge_method', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="fly_sparge">Fly Sparge</option>
                <option value="batch_sparge">Batch Sparge</option>
                <option value="no_sparge">No Sparge</option>
                <option value="biab">BIAB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fermentation Type</label>
              <select
                value={form.fermentation_type}
                onChange={e => updateForm('fermentation_type', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="standard">Standard</option>
                <option value="open_fermentation">Open Fermentation</option>
                <option value="mixed_fermentation">Mixed Fermentation</option>
                <option value="spontaneous">Spontaneous (Lambic)</option>
                <option value="kveik">Kveik</option>
                <option value="cold_fermentation">Cold Fermentation (Lager)</option>
              </select>
            </div>
          </div>

          {/* ── Optional extras ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Yeast Strain</label>
              <input
                type="text"
                value={form.yeast_strain}
                onChange={e => updateForm('yeast_strain', e.target.value)}
                placeholder="e.g. WY1056"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fermenter</label>
              <input
                type="text"
                value={form.fermenter_id}
                onChange={e => updateForm('fermenter_id', e.target.value)}
                placeholder="e.g. Tank 3"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Target Packaging Date</label>
              <input
                type="date"
                value={form.target_packaging_date}
                onChange={e => updateForm('target_packaging_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
          </div>

          {saveError && (
            <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
              {saveError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={closeAddModal} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-amber hover:bg-amber-dark text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {saving ? 'Scheduling...' : 'Schedule Brew & Open Log →'}
            </button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

// ─── BrewDayTable ─────────────────────────────────────────────────────────────

function BrewDayTable({ rows, onView, onCancel, isReadOnly, ReadOnlyTooltip }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Desktop header */}
      <div
        className="hidden md:grid gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200"
        style={{ gridTemplateColumns: COL_TEMPLATE }}
      >
        {['Batch', 'Beer', 'Date', 'Brewer', 'Mash', 'Status', 'Eff.', 'Recipe', ''].map((h, i) => (
          <div key={i} className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${i === 6 ? 'text-right' : ''}`}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {rows.map((bd, idx) => (
          <BrewDayRow
            key={bd.id}
            bd={bd}
            isEven={idx % 2 === 1}
            onView={() => onView(bd.id)}
            onCancel={() => onCancel(bd)}
            isReadOnly={isReadOnly}
            ReadOnlyTooltip={ReadOnlyTooltip}
          />
        ))}
      </div>
    </div>
  )
}

// ─── BrewDayRow ───────────────────────────────────────────────────────────────

function BrewDayRow({ bd, isEven, onView, onCancel, isReadOnly, ReadOnlyTooltip }) {
  const [expanded, setExpanded] = useState(false)

  const isActive = bd.status === 'scheduled' || bd.status === 'in_progress'
  const eff      = bd.actual_brewhouse_efficiency != null ? parseFloat(bd.actual_brewhouse_efficiency) : null
  const target   = parseFloat(bd.target_brewhouse_efficiency) || 0
  const effDiff  = eff !== null && target > 0 ? eff - target : null
  const effCls   = effDiff === null   ? 'text-gray-300'
    : effDiff >= -3                   ? 'text-success font-semibold'
    : effDiff >= -8                   ? 'text-amber font-semibold'
    : 'text-danger font-semibold'

  const brewDate = bd.brew_date
    ? new Date(bd.brew_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  const actionLabel = bd.status === 'completed' ? 'View Log'
    : bd.status === 'in_progress' ? 'Continue'
    : 'Open Log'

  const rowBase = `transition-colors ${bd.status === 'cancelled' ? 'opacity-50' : ''} ${isEven ? 'bg-gray-50/40' : 'bg-white'} hover:bg-amber/5`

  return (
    <div className={rowBase}>
      {/* ── Desktop row ── */}
      <div
        className="hidden md:grid gap-3 px-4 py-3 items-center"
        style={{ gridTemplateColumns: COL_TEMPLATE }}
      >

        {/* Batch */}
        <div>
          <span className="text-xs font-bold text-navy bg-navy/10 px-2 py-0.5 rounded">
            {bd.batch_number}
          </span>
        </div>

        {/* Beer */}
        <div className="min-w-0">
          <p className="font-semibold text-navy text-sm truncate leading-tight">
            {bd.recipe_name || bd.beer_style || <span className="text-gray-400 font-normal italic">Unnamed</span>}
          </p>
          {bd.beer_style && bd.recipe_name && (
            <p className="text-[11px] text-gray-400 truncate">{bd.beer_style}</p>
          )}
        </div>

        {/* Date */}
        <div className="text-xs text-gray-500">{brewDate}</div>

        {/* Brewer */}
        <div className="text-xs text-gray-600 truncate">{bd.brewer_name || '—'}</div>

        {/* Mash type — blank for single_infusion */}
        <div>
          {bd.mash_type && bd.mash_type !== 'single_infusion' && MASH_LABELS[bd.mash_type] && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${MASH_BADGE_STYLES[bd.mash_type] ?? 'bg-gray-100 text-gray-600'}`}>
              {MASH_LABELS[bd.mash_type]}
            </span>
          )}
        </div>

        {/* Status */}
        <div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[bd.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABELS[bd.status] ?? bd.status}
          </span>
        </div>

        {/* Efficiency */}
        <div className="text-right">
          <span className={`text-sm ${effCls}`}>
            {eff !== null ? `${eff.toFixed(1)}%` : '—'}
          </span>
        </div>

        {/* Recipe linked badge */}
        <div>
          {bd.recipe_id && (
            <span className="text-[10px] font-semibold bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">
              Linked
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onView}
            className="text-xs bg-amber hover:bg-amber-dark text-white font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {actionLabel}
          </button>
          {isActive && !isReadOnly && (
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button
                onClick={onCancel}
                className="text-xs text-gray-400 hover:text-danger border border-gray-200 px-2 py-1.5 rounded-lg transition-colors"
                title="Cancel brew day"
              >
                ✕
              </button>
            </ReadOnlyTooltip>
          )}
        </div>
      </div>

      {/* ── Mobile row ── */}
      <div className="md:hidden px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Left: batch badge + beer name */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[11px] font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded flex-shrink-0">
              {bd.batch_number}
            </span>
            <p className="font-semibold text-navy text-sm truncate">
              {bd.recipe_name || bd.beer_style || 'Unnamed'}
            </p>
          </div>

          {/* Right: status + view + expand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[bd.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {STATUS_LABELS[bd.status] ?? bd.status}
            </span>
            <button
              onClick={onView}
              className="text-xs bg-amber hover:bg-amber-dark text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              {bd.status === 'completed' ? 'View' : 'Open'}
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-gray-400 hover:text-navy transition-colors text-xs px-1 py-1"
              aria-label={expanded ? 'Collapse details' : 'Expand details'}
            >
              {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Expanded details on mobile */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date</p>
              <p className="text-xs text-navy font-medium">{brewDate}</p>
            </div>
            {bd.brewer_name && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Brewer</p>
                <p className="text-xs text-navy font-medium">{bd.brewer_name}</p>
              </div>
            )}
            {bd.mash_type && bd.mash_type !== 'single_infusion' && MASH_LABELS[bd.mash_type] && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Mash</p>
                <p className="text-xs text-navy font-medium">{MASH_LABELS[bd.mash_type]}</p>
              </div>
            )}
            {eff !== null && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Efficiency</p>
                <p className={`text-xs ${effCls}`}>{eff.toFixed(1)}%</p>
              </div>
            )}
            {bd.recipe_id && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Recipe</p>
                <span className="text-[10px] font-semibold bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">Linked</span>
              </div>
            )}
            {isActive && !isReadOnly && (
              <div className="col-span-2 pt-1">
                <button
                  onClick={onCancel}
                  className="text-xs text-gray-400 hover:text-danger transition-colors"
                >
                  Cancel this brew day
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── EfficiencyHistoryPanel ───────────────────────────────────────────────────

function EfficiencyHistoryPanel({ brews }) {
  const brewsWithEff = brews.filter(b => b.actual_brewhouse_efficiency != null)
  const avg = brewsWithEff.length > 0
    ? brewsWithEff.reduce((s, b) => s + parseFloat(b.actual_brewhouse_efficiency || 0), 0) / brewsWithEff.length
    : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-navy text-sm">📈 Brewhouse Efficiency History</h3>
        {brews.length > 0 && (
          <p className="text-xs text-gray-400">Last {brews.length} completed brew{brews.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      {brews.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">Complete your first brew day to start tracking brewhouse efficiency trends.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2 text-left font-medium">Batch</th>
                <th className="px-4 py-2 text-left font-medium">Beer</th>
                <th className="px-4 py-2 text-left font-medium">Brew Date</th>
                <th className="px-4 py-2 text-right font-medium">Target %</th>
                <th className="px-4 py-2 text-right font-medium">Actual %</th>
                <th className="px-4 py-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brews.map(bd => {
                const target  = parseFloat(bd.target_brewhouse_efficiency) || 0
                const actual  = bd.actual_brewhouse_efficiency != null ? parseFloat(bd.actual_brewhouse_efficiency) : null
                const diff    = actual !== null && target > 0 ? actual - target : null
                const diffCls = diff === null
                  ? 'text-gray-400'
                  : Math.abs(diff) <= 3 ? 'text-success'
                  : Math.abs(diff) <= 8 ? 'text-amber'
                  : 'text-danger'
                const brewDate = bd.brew_date
                  ? new Date(bd.brew_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'
                return (
                  <tr key={bd.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-navy">{bd.batch_number}</td>
                    <td className="px-4 py-2.5 text-gray-600 truncate max-w-[140px]">
                      {bd.recipe_name || bd.beer_style || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{brewDate}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{target > 0 ? `${target.toFixed(1)}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-navy">
                      {actual !== null ? `${actual.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${diffCls}`}>
                      {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {avg !== null && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Average (brews with efficiency data)
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-navy">{avg.toFixed(1)}%</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Load saved filter preferences from localStorage (returns empty object on failure)
function loadFilters() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}
