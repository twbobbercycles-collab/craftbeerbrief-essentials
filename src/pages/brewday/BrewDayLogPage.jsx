/**
 * BrewDayLogPage — Detailed log for a single brew day.
 * Auto-saves every field on blur. Accessed via /brewday/:id.
 * Operations tier only (parent route is ProtectedRoute).
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import WorkflowWarningBanner from '../../components/WorkflowWarningBanner'
import { useReadOnly } from '../../hooks/useReadOnly'

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

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

export default function BrewDayLogPage() {
  const { id } = useParams()
  const { brewery, user } = useAuth()
  const { isReadOnly } = useReadOnly()

  const [bd, setBd]           = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved' | 'error'

  const [hopAdditions, setHopAdditions] = useState([])
  const [mashSteps, setMashSteps]       = useState([])
  const [recipeIngredients, setRecipeIngredients] = useState([])

  const [manualDeducting, setManualDeducting] = useState(false)
  const [deductError, setDeductError]         = useState('')
  const [deductedTx, setDeductedTx]           = useState([])
  const [toast, setToast]                     = useState(null) // { type: 'success'|'warning', message }

  const [open, setOpen] = useState({
    overview: true,
    mash:     true,
    boil:     true,
    yeast:    true,
    actuals:  true,
    notes:    true,
  })

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [bdRes, hopRes, stepRes] = await Promise.all([
      supabase.from('brew_days').select('*').eq('id', id).single(),
      supabase.from('brew_day_hop_additions').select('*').eq('brew_day_id', id).order('created_at'),
      supabase.from('brew_day_mash_steps').select('*').eq('brew_day_id', id).order('step_number'),
    ])
    if (bdRes.error || !bdRes.data) { setNotFound(true); setLoading(false); return }
    setBd(bdRes.data)
    setHopAdditions(hopRes.data ?? [])
    setMashSteps(stepRes.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!bd?.recipe_id) return
    supabase
      .from('recipe_ingredients')
      .select('*, ingredient:ingredients(id, name, current_stock_quantity, stock_unit)')
      .eq('recipe_id', bd.recipe_id)
      .order('sort_order')
      .then(({ data }) => setRecipeIngredients(data ?? []))
  }, [bd?.recipe_id])

  // Track whether we've already auto-populated hops so we don't re-run
  // after the brewer manually adds or removes hop additions.
  const [hopAutoPopulated, setHopAutoPopulated] = useState(false)

  // Auto-populate hop additions from the linked recipe on first load.
  // Only runs when:  recipe is linked + no existing hop rows + not yet populated.
  useEffect(() => {
    if (!bd?.recipe_id || hopAdditions.length > 0 || hopAutoPopulated) return
    if (isReadOnly) return

    async function autoPopulateHops() {
      // Fetch the recipe base batch size for scaling
      const [recipeRes, hopIngRes] = await Promise.all([
        supabase.from('recipes').select('base_batch_size').eq('id', bd.recipe_id).single(),
        supabase.from('recipe_ingredients')
          .select('id, name, ingredient_id, amount, unit, addition_type, addition_time, category')
          .eq('recipe_id', bd.recipe_id)
          .in('addition_type', ['Boil', 'Whirlpool', 'Dry Hop', 'First Wort', 'Flameout'])
          .order('addition_time', { ascending: false }),
      ])
      const hopIngs = hopIngRes.data ?? []
      if (hopIngs.length === 0) return

      const scale = (recipeRes.data?.base_batch_size && bd.planned_batch_size)
        ? parseFloat(bd.planned_batch_size) / parseFloat(recipeRes.data.base_batch_size)
        : 1

      const inserts = hopIngs.map(h => ({
        brew_day_id:     bd.id,
        brewery_id:      brewery.id,
        ingredient_name: h.name,
        ingredient_id:   h.ingredient_id ?? null,
        planned_amount:  h.amount != null ? Math.round(parseFloat(h.amount) * scale * 100) / 100 : null,
        unit:            h.unit ?? 'oz',
        addition_type:   h.addition_type ?? 'Boil',
        planned_time:    h.addition_time ?? null,
      }))

      const { data: created } = await supabase
        .from('brew_day_hop_additions')
        .insert(inserts)
        .select()

      if (created?.length > 0) {
        setHopAdditions(prev => [...prev, ...created])
        setHopAutoPopulated(true)
      }
    }

    autoPopulateHops()
  }, [bd?.id, bd?.recipe_id, hopAdditions.length, hopAutoPopulated])

  // Load the transactions that were created during deduction so we can show the summary
  useEffect(() => {
    if (!bd?.inventory_deducted || !id) return
    supabase
      .from('inventory_transactions')
      .select('quantity, unit, ingredient:ingredients(name)')
      .eq('reference_id', id)
      .eq('transaction_type', 'used_in_brew')
      .order('created_at')
      .then(({ data }) => setDeductedTx(data ?? []))
  }, [bd?.inventory_deducted, id])

  // ── Auto-save ────────────────────────────────────────────────────────────────

  async function saveField(field, rawValue) {
    if (!bd?.id || isReadOnly) return
    const value = rawValue === '' || rawValue === undefined ? null : rawValue
    setSaveStatus('saving')
    const { error } = await supabase.from('brew_days').update({ [field]: value }).eq('id', bd.id)
    if (error) { setSaveStatus('error'); return }
    setBd(prev => ({ ...prev, [field]: value }))
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(s => s === 'saved' ? null : s), 2000)
  }

  // Returns props for a controlled text/number input that auto-saves on blur
  function fi(field, type = 'text') {
    return {
      value: bd?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setBd(prev => ({ ...prev, [field]: e.target.value })),
      onBlur: e => {
        const v = e.target.value.trim()
        saveField(field, type === 'number' ? (v === '' ? null : parseFloat(v)) : (v || null))
      },
    }
  }

  // Returns props for a select that saves on change
  function si(field) {
    return {
      value: bd?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => { setBd(prev => ({ ...prev, [field]: e.target.value })); saveField(field, e.target.value || null) },
    }
  }

  // Returns props for a textarea that saves on blur
  function ti(field) {
    return {
      value: bd?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setBd(prev => ({ ...prev, [field]: e.target.value })),
      onBlur:   e => saveField(field, e.target.value.trim() || null),
    }
  }

  // ── Status transitions ───────────────────────────────────────────────────────

  async function markInProgress() {
    const now    = new Date().toTimeString().slice(0, 5)
    const update = { status: 'in_progress', ...(!bd.brew_start_time && { brew_start_time: now }) }
    await supabase.from('brew_days').update(update).eq('id', bd.id)
    setBd(prev => ({ ...prev, ...update }))
  }

  async function markComplete() {
    if (!window.confirm('Mark this brew day as complete?')) return
    const now    = new Date().toTimeString().slice(0, 5)
    const update = { status: 'completed', ...(!bd.brew_end_time && { brew_end_time: now }) }
    await supabase.from('brew_days').update(update).eq('id', bd.id)
    const completedBd = { ...bd, ...update }
    setBd(completedBd)

    // Auto-deduct inventory immediately on completion
    const { deducted, warning } = await performDeduction(completedBd)

    // Auto-create a fermentation record (status: pending_assignment) so the
    // brewer can assign a vessel in the Fermentation Tracker without re-entering data.
    const fermInsertPayload = {
      brewery_id:           brewery.id,
      brew_day_id:          completedBd.id,
      recipe_id:            completedBd.recipe_id ?? null,
      batch_number:         completedBd.batch_number ?? null,
      beer_name:            completedBd.recipe_name || null,
      beer_style:           completedBd.beer_style ?? null,
      status:               'pending_assignment',
      fermentation_type:    completedBd.fermentation_type ?? 'standard',
      volume_in_fermenter:  completedBd.volume_into_fermenter ?? null,
      volume_unit:          completedBd.planned_batch_unit ?? 'barrels',
      actual_og:            completedBd.actual_og ?? null,
      target_og:            completedBd.target_og ?? null,
      target_fg:            completedBd.target_fg ?? null,
      target_abv:           completedBd.target_abv ?? null,
      yeast_strain:         completedBd.yeast_strain ?? null,
      yeast_generation:     completedBd.yeast_generation ?? 1,
      pitch_date:           completedBd.brew_date ?? null,
      pitch_temp:           completedBd.pitch_temp_actual ?? null,
    }
    console.log('[BrewDayLogPage] Creating fermentation record:', fermInsertPayload)
    const { error: fermErr } = await supabase.from('fermentations').insert(fermInsertPayload)

    const fermNote = fermErr ? '' : ' Fermentation record created — assign a vessel in the Fermentation Tracker.'
    const msg = warning
      ? `Brew day marked complete. ${warning}${fermNote}`
      : `Brew day complete. Inventory updated — ${deducted} ingredient${deducted !== 1 ? 's' : ''} deducted.${fermNote}`
    showToast(warning ? 'warning' : 'success', msg)
  }

  async function cancelBrewDay() {
    if (!window.confirm(`Cancel brew day ${bd.batch_number}?`)) return
    await supabase.from('brew_days').update({ status: 'cancelled' }).eq('id', bd.id)
    setBd(prev => ({ ...prev, status: 'cancelled' }))
  }

  // ── Mash steps ───────────────────────────────────────────────────────────────

  async function addMashStep() {
    const nextNum = (mashSteps.at(-1)?.step_number ?? 0) + 1
    const { data, error } = await supabase.from('brew_day_mash_steps').insert({
      brew_day_id: id,
      brewery_id:  brewery.id,
      step_number: nextNum,
      step_type:   bd.mash_type === 'decoction' ? 'decoction' : 'rest',
    }).select().single()
    if (!error && data) setMashSteps(prev => [...prev, data])
  }

  async function saveMashStepField(stepId, field, rawValue) {
    if (isReadOnly) return
    const value = rawValue === '' ? null : rawValue
    await supabase.from('brew_day_mash_steps').update({ [field]: value }).eq('id', stepId)
    setMashSteps(prev => prev.map(s => s.id === stepId ? { ...s, [field]: value } : s))
  }

  async function removeMashStep(stepId) {
    if (!window.confirm('Remove this mash step?')) return
    await supabase.from('brew_day_mash_steps').delete().eq('id', stepId)
    setMashSteps(prev => prev.filter(s => s.id !== stepId))
  }

  // ── Hop additions ────────────────────────────────────────────────────────────

  async function addHopAddition() {
    const { data, error } = await supabase.from('brew_day_hop_additions').insert({
      brew_day_id:     id,
      brewery_id:      brewery.id,
      ingredient_name: 'Hop addition',
      unit:            'oz',
      addition_type:   'Boil',
    }).select().single()
    if (!error && data) setHopAdditions(prev => [...prev, data])
  }

  async function saveHopField(hopId, field, rawValue) {
    if (isReadOnly) return
    const value = rawValue === '' ? null : rawValue
    await supabase.from('brew_day_hop_additions').update({ [field]: value }).eq('id', hopId)
    setHopAdditions(prev => prev.map(h => h.id === hopId ? { ...h, [field]: value } : h))
  }

  async function removeHopAddition(hopId) {
    if (!window.confirm('Remove this hop addition?')) return
    await supabase.from('brew_day_hop_additions').delete().eq('id', hopId)
    setHopAdditions(prev => prev.filter(h => h.id !== hopId))
  }

  // ── Inventory deduction ──────────────────────────────────────────────────────

  function showToast(type, message) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 5000)
  }

  // Core deduction logic — loads fresh ingredient data, writes transactions,
  // decrements stock, and marks inventory_deducted on the brew day.
  // Returns { deducted: number, warning: string|null }
  async function performDeduction(currentBd) {
    if (!currentBd.recipe_id) {
      return { deducted: 0, warning: 'Brew day is not linked to a recipe — inventory not updated.' }
    }

    // Always fetch fresh data so stock quantities are current at deduction time
    const { data: ings } = await supabase
      .from('recipe_ingredients')
      .select('*, ingredient:ingredients(id, current_stock_quantity)')
      .eq('recipe_id', currentBd.recipe_id)

    const linked = (ings ?? []).filter(ri => ri.ingredient_id)
    if (linked.length === 0) {
      return { deducted: 0, warning: 'No inventory-linked ingredients found in this recipe.' }
    }

    const base    = parseFloat(currentBd.planned_batch_size) || 1
    const actual  = parseFloat(currentBd.volume_into_fermenter) || base
    const refName = `${currentBd.batch_number} — ${currentBd.recipe_name || currentBd.beer_style || 'Brew Day'}`
    let deducted  = 0

    for (const ri of linked) {
      const amt = parseFloat(ri.amount) || 0
      const qty = ri.scale_with_batch ? (amt * actual) / base : amt
      if (qty <= 0) continue

      await supabase.from('inventory_transactions').insert({
        brewery_id:       brewery.id,
        ingredient_id:    ri.ingredient_id,
        transaction_type: 'used_in_brew',
        quantity:         -qty,
        unit:             ri.unit,
        reference_type:   'brew_day',
        reference_id:     id,
        reference_name:   refName,
        transaction_date: currentBd.brew_date ?? new Date().toISOString().slice(0, 10),
        created_by:       user?.id ?? null,
      })
      const currentStock = parseFloat(ri.ingredient?.current_stock_quantity) || 0
      await supabase
        .from('ingredients')
        .update({ current_stock_quantity: Math.max(0, currentStock - qty) })
        .eq('id', ri.ingredient_id)
      deducted++
    }

    await supabase.from('brew_days').update({ inventory_deducted: true }).eq('id', currentBd.id)
    setBd(prev => ({ ...prev, inventory_deducted: true }))

    // Reload transactions for the summary display
    const { data: tx } = await supabase
      .from('inventory_transactions')
      .select('quantity, unit, ingredient:ingredients(name)')
      .eq('reference_id', currentBd.id)
      .eq('transaction_type', 'used_in_brew')
      .order('created_at')
    setDeductedTx(tx ?? [])

    return { deducted, warning: null }
  }

  // Manual fallback — shown in Section 5 when auto-deduction failed or was skipped
  async function handleManualDeduct() {
    setManualDeducting(true)
    setDeductError('')
    const { deducted, warning } = await performDeduction(bd)
    setManualDeducting(false)
    if (warning) {
      setDeductError(warning)
    } else {
      showToast('success', `Inventory updated — ${deducted} ingredient${deducted !== 1 ? 's' : ''} deducted.`)
    }
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────

  function exportCSV() {
    if (!bd) return
    const rows = [
      ['Field', 'Value'],
      ['Batch Number', bd.batch_number ?? ''],
      ['Beer Name', bd.recipe_name || bd.beer_style || ''],
      ['Status', STATUS_LABELS[bd.status] ?? bd.status],
      ['Brew Date', bd.brew_date ?? ''],
      ['Start Time', bd.brew_start_time ?? ''],
      ['End Time', bd.brew_end_time ?? ''],
      ['Brewer', bd.brewer_name ?? ''],
      ['Assistant Brewer', bd.assistant_brewer ?? ''],
      ['Fermenter', bd.fermenter_id ?? ''],
      ['Planned Batch Size', `${bd.planned_batch_size ?? ''} ${bd.planned_batch_unit ?? ''}`],
      ['Mash Type', bd.mash_type ?? ''],
      ['Strike Water Vol', bd.strike_water_volume ?? ''],
      ['Strike Temp Target', bd.strike_water_temp_target ?? ''],
      ['Strike Temp Actual', bd.strike_water_temp_actual ?? ''],
      ['Mash Temp Target', bd.mash_temp_target ?? ''],
      ['Mash Temp Actual', bd.mash_temp_actual ?? ''],
      ['Mash pH Target', bd.mash_ph_target ?? ''],
      ['Mash pH Actual', bd.mash_ph_actual ?? ''],
      ['Mash Duration (min)', bd.mash_duration_minutes ?? ''],
      ['Pre-Boil Vol Target', bd.pre_boil_volume_target ?? ''],
      ['Pre-Boil Vol Actual', bd.pre_boil_volume_actual ?? ''],
      ['Pre-Boil Gravity Target', bd.pre_boil_gravity_target ?? ''],
      ['Pre-Boil Gravity Actual', bd.pre_boil_gravity_actual ?? ''],
      ['Boil Duration (min)', bd.boil_duration_minutes ?? ''],
      ['Post-Boil Vol Target', bd.post_boil_volume_target ?? ''],
      ['Post-Boil Vol Actual', bd.post_boil_volume_actual ?? ''],
      ['Post-Boil Gravity Target', bd.post_boil_gravity_target ?? ''],
      ['Post-Boil Gravity Actual', bd.post_boil_gravity_actual ?? ''],
      ['Pitch Temp Target', bd.pitch_temp_target ?? ''],
      ['Pitch Temp Actual', bd.pitch_temp_actual ?? ''],
      ['Volume Into Fermenter', bd.volume_into_fermenter ?? ''],
      ['Target OG', bd.target_og ?? ''],
      ['Actual OG', bd.actual_og ?? ''],
      ['Target FG', bd.target_fg ?? ''],
      ['Target ABV %', bd.target_abv ?? ''],
      ['Target IBU', bd.target_ibu ?? ''],
      ['Target BE %', bd.target_brewhouse_efficiency ?? ''],
      ['Actual BE %', bd.actual_brewhouse_efficiency ?? ''],
      ['Yeast Strain', bd.yeast_strain ?? ''],
      ['Yeast Lot #', bd.yeast_lot_number ?? ''],
      ['Yeast Generation', bd.yeast_generation ?? ''],
      ['Dry Hop Scheduled', bd.dry_hop_scheduled ? 'Yes' : 'No'],
      ['Dry Hop Date', bd.dry_hop_date ?? ''],
      ['Recipe Deviations', bd.recipe_deviations ?? ''],
      ['Water Chemistry Notes', bd.water_chemistry_notes ?? ''],
      ['Equipment Notes', bd.equipment_notes ?? ''],
      ['Quality Observations', bd.quality_observations ?? ''],
      ['General Notes', bd.general_notes ?? ''],
    ]
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `brew-log-${bd.batch_number}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Derived: brewhouse efficiency ────────────────────────────────────────────

  const calcEfficiency = useMemo(() => {
    if (!bd) return null
    const aoP = (parseFloat(bd.actual_og) - 1) * 1000
    const toP = (parseFloat(bd.target_og)  - 1) * 1000
    const av  = parseFloat(bd.volume_into_fermenter)
    const pv  = parseFloat(bd.planned_batch_size)
    const tBE = parseFloat(bd.target_brewhouse_efficiency) || 72
    if (!aoP || !toP || !av || !pv) return null
    return (aoP * av) / (toP * pv) * tBE
  }, [bd?.actual_og, bd?.volume_into_fermenter, bd?.target_og, bd?.planned_batch_size, bd?.target_brewhouse_efficiency])

  // Write calculated efficiency back to DB whenever it changes
  useEffect(() => {
    if (calcEfficiency === null || !bd) return
    const rounded = Math.round(calcEfficiency * 10) / 10
    if (rounded !== parseFloat(bd.actual_brewhouse_efficiency)) {
      saveField('actual_brewhouse_efficiency', rounded)
    }
  }, [calcEfficiency]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(key) { setOpen(o => ({ ...o, [key]: !o[key] })) }

  // ── Guards ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <LoadingSpinner message="Loading brew log..." />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Brew day not found.</p>
        <Link to="/brewday" className="text-amber hover:underline">← Back to Schedule</Link>
      </div>
    )
  }

  const isStandardMash = ['single_infusion', 'biab', 'no_sparge', 'turbid'].includes(bd.mash_type)
  const isSour         = bd.fermentation_type === 'mixed_fermentation' || bd.fermentation_type === 'spontaneous'
  const isLager        = bd.fermentation_type === 'cold_fermentation'

  // ── Render ───────────────────────────────────────────────────────────────────

  // Derive warnings from current brew day state — no extra state needed
  const brewDayWarnings = []
  if (bd) {
    // Required: volume into fermenter not entered
    if (!bd.volume_into_fermenter) {
      brewDayWarnings.push({
        message: 'Volume into fermenter not recorded — enter in Post-Brew Actuals',
        severity: 'required',
      })
    }
    // Recommended: actual OG not entered
    if (!bd.actual_og) {
      brewDayWarnings.push({
        message: 'Actual OG not recorded — enter in Post-Brew Actuals for efficiency tracking',
        severity: 'recommended',
      })
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Toast notification ── */}
      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-xl px-6 py-3 text-sm font-medium shadow-lg max-w-md text-center pointer-events-none ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-amber text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/brewday" className="text-xs text-gray-400 hover:text-amber flex items-center gap-1 mb-2">
            ← Back to Schedule
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-navy bg-navy/10 px-2 py-0.5 rounded">
              {bd.batch_number}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[bd.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {STATUS_LABELS[bd.status] ?? bd.status}
            </span>
            {saveStatus && (
              <span className={`text-xs ${
                saveStatus === 'saving' ? 'text-amber' :
                saveStatus === 'saved'  ? 'text-success' :
                'text-danger'
              }`}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '⚠ Save failed'}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-navy mt-1">
            {bd.recipe_name || bd.beer_style || 'Unnamed Batch'}
          </h2>
          {bd.beer_style && bd.recipe_name && (
            <p className="text-sm text-gray-400">{bd.beer_style}</p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {bd.status === 'scheduled' && !isReadOnly && (
            <button
              onClick={markInProgress}
              className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Start Brew →
            </button>
          )}
          {bd.status === 'in_progress' && !isReadOnly && (
            <button
              onClick={markComplete}
              className="text-sm bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Mark Complete ✓
            </button>
          )}
          {(bd.status === 'scheduled' || bd.status === 'in_progress') && !isReadOnly && (
            <button
              onClick={cancelBrewDay}
              className="text-sm text-gray-500 hover:text-danger border border-gray-200 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={exportCSV}
            className="text-sm text-gray-500 hover:text-navy border border-gray-200 px-4 py-2 rounded-lg transition-colors"
          >
            📥 Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="text-sm text-gray-500 hover:text-navy border border-gray-200 px-4 py-2 rounded-lg transition-colors"
          >
            🖨 Print
          </button>
        </div>
      </div>

      {/* ── Workflow warnings ── */}
      <WorkflowWarningBanner warnings={brewDayWarnings} />

      {/* ── Section 1: Brew Overview ── */}
      <SectionBlock title="Brew Overview" icon="📋" open={open.overview} onToggle={() => toggle('overview')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className={LBL}>Brew Date</label>
            <input type="date" className={INPUT_CLS} {...fi('brew_date')} />
          </div>
          <div>
            <label className={LBL}>Start Time</label>
            <input type="time" className={INPUT_CLS} {...fi('brew_start_time')} />
          </div>
          <div>
            <label className={LBL}>End Time</label>
            <input type="time" className={INPUT_CLS} {...fi('brew_end_time')} />
          </div>
          <div>
            <label className={LBL}>Head Brewer</label>
            <input type="text" className={INPUT_CLS} {...fi('brewer_name')} />
          </div>
          <div>
            <label className={LBL}>Assistant Brewer</label>
            <input type="text" className={INPUT_CLS} {...fi('assistant_brewer')} placeholder="Optional" />
          </div>
          <div>
            <label className={LBL}>Fermenter</label>
            <input type="text" className={INPUT_CLS} {...fi('fermenter_id')} placeholder="e.g. Tank 3" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={LBL}>Planned Batch Size</label>
            <input type="number" step="0.01" className={INPUT_CLS} {...fi('planned_batch_size', 'number')} />
          </div>
          <div>
            <label className={LBL}>Unit</label>
            <select className={INPUT_CLS} {...si('planned_batch_unit')}>
              <option value="barrels">Barrels</option>
              <option value="gallons">Gallons</option>
            </select>
          </div>
          <div>
            <label className={LBL}>Target OG</label>
            <input type="number" step="0.001" className={INPUT_CLS} {...fi('target_og', 'number')} placeholder="1.065" />
          </div>
          <div>
            <label className={LBL}>Target FG</label>
            <input type="number" step="0.001" className={INPUT_CLS} {...fi('target_fg', 'number')} placeholder="1.012" />
          </div>
          <div>
            <label className={LBL}>Target ABV %</label>
            <input type="number" step="0.1" className={INPUT_CLS} {...fi('target_abv', 'number')} placeholder="6.5" />
          </div>
          <div>
            <label className={LBL}>Target IBU</label>
            <input type="number" step="0.1" className={INPUT_CLS} {...fi('target_ibu', 'number')} placeholder="45" />
          </div>
          <div>
            <label className={LBL}>Target Eff. %</label>
            <input type="number" step="0.1" className={INPUT_CLS} {...fi('target_brewhouse_efficiency', 'number')} />
          </div>
          <div>
            <label className={LBL}>Target Packaging Date</label>
            <input type="date" className={INPUT_CLS} {...fi('target_packaging_date')} />
          </div>
        </div>
      </SectionBlock>

      {/* ── Section 2: Mash ── */}
      <SectionBlock title="Mash" icon="🌡️" open={open.mash} onToggle={() => toggle('mash')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Mash Type</label>
            <select className={INPUT_CLS} {...si('mash_type')}>
              <option value="single_infusion">Single Infusion</option>
              <option value="step_mash">Step Mash</option>
              <option value="decoction">Decoction</option>
              <option value="biab">BIAB</option>
              <option value="no_sparge">No Sparge</option>
              <option value="turbid">Turbid Mash</option>
              <option value="other">Other</option>
            </select>
          </div>
          {bd.mash_type !== 'biab' && (
            <div>
              <label className={LBL}>Sparge Method</label>
              <select className={INPUT_CLS} {...si('sparge_method')}>
                <option value="fly_sparge">Fly Sparge</option>
                <option value="batch_sparge">Batch Sparge</option>
                <option value="no_sparge">No Sparge</option>
                <option value="biab">BIAB</option>
              </select>
            </div>
          )}
        </div>

        {bd.mash_type === 'other' && (
          <div className="mt-3">
            <label className={LBL}>Mash Description</label>
            <textarea rows={3} className={INPUT_CLS} {...ti('mash_other_description')} placeholder="Describe your mash process…" />
          </div>
        )}

        {/* Standard single-step fields */}
        {isStandardMash && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Strike Vol ({bd.planned_batch_unit === 'gallons' ? 'gal' : 'bbl'})</label>
                <input type="number" step="0.01" className={INPUT_CLS} {...fi('strike_water_volume', 'number')} />
              </div>
              <div>
                <label className={LBL}>Strike Temp Target (°F)</label>
                <input type="number" step="0.1" className={INPUT_CLS} {...fi('strike_water_temp_target', 'number')} />
              </div>
              <div>
                <label className={LBL}>Strike Temp Actual (°F)</label>
                <input
                  type="number" step="0.1"
                  className={`${INPUT_CLS} ${tempBorderCls(bd.strike_water_temp_actual, bd.strike_water_temp_target)}`}
                  {...fi('strike_water_temp_actual', 'number')}
                />
              </div>
              <div>
                <label className={LBL}>Mash Duration (min)</label>
                <input type="number" step="1" className={INPUT_CLS} {...fi('mash_duration_minutes', 'number')} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Mash Temp Target (°F)</label>
                <input type="number" step="0.1" className={INPUT_CLS} {...fi('mash_temp_target', 'number')} />
              </div>
              <div>
                <label className={LBL}>Mash Temp Actual (°F)</label>
                <input
                  type="number" step="0.1"
                  className={`${INPUT_CLS} ${tempBorderCls(bd.mash_temp_actual, bd.mash_temp_target)}`}
                  {...fi('mash_temp_actual', 'number')}
                />
                {tempOffMsg(bd.mash_temp_actual, bd.mash_temp_target, 2)}
              </div>
              <div>
                <label className={LBL}>Mash pH Target</label>
                <input type="number" step="0.01" className={INPUT_CLS} {...fi('mash_ph_target', 'number')} placeholder="5.4" />
              </div>
              <div>
                <label className={LBL}>Mash pH Actual</label>
                <input
                  type="number" step="0.01"
                  className={`${INPUT_CLS} ${phBorderCls(bd.mash_ph_actual)}`}
                  {...fi('mash_ph_actual', 'number')}
                />
                {phOffMsg(bd.mash_ph_actual)}
              </div>
            </div>

            {bd.mash_type !== 'biab' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Sparge Vol ({bd.planned_batch_unit === 'gallons' ? 'gal' : 'bbl'})</label>
                  <input type="number" step="0.01" className={INPUT_CLS} {...fi('sparge_water_volume', 'number')} />
                </div>
                <div>
                  <label className={LBL}>Sparge Water Temp (°F)</label>
                  <input type="number" step="0.1" className={INPUT_CLS} {...fi('sparge_water_temp', 'number')} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step mash rows */}
        {bd.mash_type === 'step_mash' && (
          <div className="mt-4">
            <MashStepsTable
              steps={mashSteps}
              onAdd={addMashStep}
              onSave={saveMashStepField}
              onRemove={removeMashStep}
              isReadOnly={isReadOnly}
              isDecoction={false}
            />
          </div>
        )}

        {/* Decoction rows */}
        {bd.mash_type === 'decoction' && (
          <div className="mt-4">
            <MashStepsTable
              steps={mashSteps}
              onAdd={addMashStep}
              onSave={saveMashStepField}
              onRemove={removeMashStep}
              isReadOnly={isReadOnly}
              isDecoction={true}
            />
          </div>
        )}

        {/* Pre-boil readings */}
        <div className="mt-5 border-t border-gray-100 pt-4 space-y-3">
          <p className="text-sm font-semibold text-navy">Pre-Boil Readings</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={LBL}>Pre-Boil Vol Target</label>
              <input type="number" step="0.01" className={INPUT_CLS} {...fi('pre_boil_volume_target', 'number')} />
            </div>
            <div>
              <label className={LBL}>Pre-Boil Vol Actual</label>
              <input type="number" step="0.01" className={INPUT_CLS} {...fi('pre_boil_volume_actual', 'number')} />
            </div>
            <div>
              <label className={LBL}>Pre-Boil Gravity Target</label>
              <input type="number" step="0.001" className={INPUT_CLS} {...fi('pre_boil_gravity_target', 'number')} placeholder="1.052" />
            </div>
            <div>
              <label className={LBL}>Pre-Boil Gravity Actual</label>
              <input type="number" step="0.001" className={INPUT_CLS} {...fi('pre_boil_gravity_actual', 'number')} placeholder="1.050" />
            </div>
          </div>
          <div>
            <label className={LBL}>Lauter Notes</label>
            <textarea rows={2} className={INPUT_CLS} {...ti('lauter_notes')} placeholder="Clarity, stuck sparge, recirculation notes…" />
          </div>
        </div>
      </SectionBlock>

      {/* ── Section 3: Boil ── */}
      <SectionBlock title="Boil" icon="🔥" open={open.boil} onToggle={() => toggle('boil')}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={bd.no_boil ?? false}
            disabled={isReadOnly}
            onChange={e => { setBd(prev => ({ ...prev, no_boil: e.target.checked })); saveField('no_boil', e.target.checked) }}
            className="rounded border-gray-300 text-amber focus:ring-amber"
          />
          <span className="text-sm text-navy font-medium">No Boil (raw ale, NEIPA-style)</span>
        </label>

        {!bd.no_boil && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Boil Duration (min)</label>
                <input type="number" step="1" className={INPUT_CLS} {...fi('boil_duration_minutes', 'number')} placeholder="60" />
              </div>
              <div>
                <label className={LBL}>Post-Boil Vol Target</label>
                <input type="number" step="0.01" className={INPUT_CLS} {...fi('post_boil_volume_target', 'number')} />
              </div>
              <div>
                <label className={LBL}>Post-Boil Vol Actual</label>
                <input type="number" step="0.01" className={INPUT_CLS} {...fi('post_boil_volume_actual', 'number')} />
              </div>
              <div>
                <label className={LBL}>Post-Boil Wort pH</label>
                <input type="number" step="0.01" className={INPUT_CLS} {...fi('wort_ph_post_boil', 'number')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Post-Boil Gravity Target</label>
                <input type="number" step="0.001" className={INPUT_CLS} {...fi('post_boil_gravity_target', 'number')} placeholder="1.065" />
              </div>
              <div>
                <label className={LBL}>Post-Boil Gravity Actual</label>
                <input type="number" step="0.001" className={INPUT_CLS} {...fi('post_boil_gravity_actual', 'number')} placeholder="1.063" />
              </div>
            </div>
          </div>
        )}

        {/* Hop additions */}
        <div className="mt-5 border-t border-gray-100 pt-4">
          <HopAdditionsTable
            hops={hopAdditions}
            onAdd={addHopAddition}
            onSave={saveHopField}
            onRemove={removeHopAddition}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* Chill */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={LBL}>Chill Method</label>
            <input type="text" className={INPUT_CLS} {...fi('chill_method')} placeholder="e.g. Plate chiller, Immersion" />
          </div>
          <div>
            <label className={LBL}>Chill Time (min)</label>
            <input type="number" step="1" className={INPUT_CLS} {...fi('chill_time_minutes', 'number')} />
          </div>
          <div>
            <label className={LBL}>Pitch Temp Target (°F)</label>
            <input type="number" step="0.1" className={INPUT_CLS} {...fi('pitch_temp_target', 'number')} placeholder="65" />
          </div>
        </div>
      </SectionBlock>

      {/* ── Section 4: Yeast & Pitching ── */}
      <SectionBlock title="Yeast & Pitching" icon="🧫" open={open.yeast} onToggle={() => toggle('yeast')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className={LBL}>Yeast Strain</label>
            <input type="text" className={INPUT_CLS} {...fi('yeast_strain')} placeholder="e.g. WY1056, US-05" />
          </div>
          <div>
            <label className={LBL}>Lot / Pack Date</label>
            <input type="text" className={INPUT_CLS} {...fi('yeast_lot_number')} placeholder="e.g. LOT12345" />
          </div>
          <div>
            <label className={LBL}>Generation #</label>
            <input type="number" step="1" min="1" className={INPUT_CLS} {...fi('yeast_generation', 'number')} />
          </div>
          <div>
            <label className={LBL}>Pitch Rate (M cells/ml/°P)</label>
            <input type="number" step="0.01" className={INPUT_CLS} {...fi('yeast_pitch_rate', 'number')} placeholder="0.75" />
          </div>
          <div>
            <label className={LBL}>Pitch Temp Actual (°F)</label>
            <input
              type="number" step="0.1"
              className={`${INPUT_CLS} ${tempBorderCls(bd.pitch_temp_actual, bd.pitch_temp_target, 3)}`}
              {...fi('pitch_temp_actual', 'number')}
            />
          </div>
          <div>
            <label className={LBL}>Fermentation Type</label>
            <select className={INPUT_CLS} {...si('fermentation_type')}>
              <option value="standard">Standard</option>
              <option value="open_fermentation">Open Fermentation</option>
              <option value="mixed_fermentation">Mixed Fermentation</option>
              <option value="spontaneous">Spontaneous (Lambic)</option>
              <option value="kveik">Kveik</option>
              <option value="cold_fermentation">Cold Fermentation (Lager)</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className={LBL}>Yeast Health Notes</label>
          <textarea rows={2} className={INPUT_CLS} {...ti('yeast_health_notes')} placeholder="Starter size, viability, smack pack timing…" />
        </div>

        {isSour && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={LBL}>Wild Strains / Organisms</label>
              <input type="text" className={INPUT_CLS} {...fi('wild_strains_noted')} placeholder="Lacto, Brett, Pedio…" />
            </div>
            <div>
              <label className={LBL}>Souring Method</label>
              <input type="text" className={INPUT_CLS} {...fi('souring_method')} placeholder="Kettle sour, co-pitch…" />
            </div>
            <div>
              <label className={LBL}>Sour Target pH</label>
              <input type="number" step="0.01" className={INPUT_CLS} {...fi('sour_target_ph', 'number')} placeholder="3.5" />
            </div>
          </div>
        )}

        {isLager && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className={LBL}>Lagering Temp Target (°F)</label>
              <input type="number" step="0.5" className={INPUT_CLS} {...fi('lagering_temp_target', 'number')} />
            </div>
            <div>
              <label className={LBL}>Lagering Duration (days)</label>
              <input type="number" step="1" className={INPUT_CLS} {...fi('lagering_duration_target', 'number')} />
            </div>
          </div>
        )}
      </SectionBlock>

      {/* ── Section 5: Post-Brew Actuals ── */}
      <SectionBlock title="Post-Brew Actuals" icon="📊" open={open.actuals} onToggle={() => toggle('actuals')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={LBL}>
              Volume Into Fermenter ({bd.planned_batch_unit === 'gallons' ? 'gal' : 'bbl'})
              {bd.planned_batch_size && (
                <span className="text-xs text-gray-400 ml-2">
                  (planned: {bd.planned_batch_size} {bd.planned_batch_unit ?? 'bbl'})
                </span>
              )}
            </label>
            <input type="number" step="0.01" className={INPUT_CLS} {...fi('volume_into_fermenter', 'number')} />
          </div>
          <div>
            <label className={LBL}>Trub Loss ({bd.planned_batch_unit === 'gallons' ? 'gal' : 'bbl'})</label>
            <input type="number" step="0.01" className={INPUT_CLS} {...fi('trub_loss', 'number')} />
          </div>
          <div>
            <label className={LBL}>Actual OG</label>
            <input type="number" step="0.001" className={INPUT_CLS} {...fi('actual_og', 'number')} placeholder="1.063" />
          </div>
          <div>
            <label className={LBL}>Brewhouse Efficiency %</label>
            {calcEfficiency !== null ? (
              <div className={`border rounded-lg px-3 py-2 text-sm font-semibold ${efficiencyBadgeCls(calcEfficiency, bd.target_brewhouse_efficiency)}`}>
                {calcEfficiency.toFixed(1)}%
                <span className="text-xs font-normal ml-1 opacity-70">(auto)</span>
              </div>
            ) : (
              <input
                type="number" step="0.1"
                className={INPUT_CLS}
                {...fi('actual_brewhouse_efficiency', 'number')}
                placeholder="Enter OG + vol to auto-calc"
              />
            )}
          </div>
        </div>

        {calcEfficiency !== null && bd.target_brewhouse_efficiency && (
          <div className={`mt-3 rounded-lg px-4 py-2.5 text-sm ${efficiencyBannerCls(calcEfficiency, bd.target_brewhouse_efficiency)}`}>
            {calcEfficiency >= parseFloat(bd.target_brewhouse_efficiency) - 3
              ? `✓ Efficiency on target (${calcEfficiency.toFixed(1)}% vs ${parseFloat(bd.target_brewhouse_efficiency).toFixed(1)}% target)`
              : `⚠ Efficiency ${(parseFloat(bd.target_brewhouse_efficiency) - calcEfficiency).toFixed(1)}% below target of ${parseFloat(bd.target_brewhouse_efficiency).toFixed(1)}%`
            }
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bd.dry_hop_scheduled ?? false}
              disabled={isReadOnly}
              onChange={e => { setBd(prev => ({ ...prev, dry_hop_scheduled: e.target.checked })); saveField('dry_hop_scheduled', e.target.checked) }}
              className="rounded border-gray-300 text-amber focus:ring-amber"
            />
            <span className="text-sm text-navy font-medium">Dry hop scheduled</span>
          </label>
          {bd.dry_hop_scheduled && (
            <div>
              <label className={LBL}>Dry Hop Date</label>
              <input type="date" className={INPUT_CLS} {...fi('dry_hop_date')} />
            </div>
          )}
        </div>

        {/* Inventory deduction summary — only shown once brew is complete */}
        {bd.status === 'completed' && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-navy mb-2">📦 Inventory Deduction</p>
            {bd.inventory_deducted ? (
              <div>
                <p className="text-sm text-success mb-2">✓ Ingredients deducted from inventory</p>
                {deductedTx.length > 0 && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                    {deductedTx.map((tx, i) => (
                      <p key={i} className="text-xs text-gray-600">
                        {tx.ingredient?.name ?? '—'} — {Math.abs(parseFloat(tx.quantity)).toFixed(3)} {tx.unit}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-amber mb-2">⚠ Inventory not yet deducted for this brew day.</p>
                {deductError && (
                  <p className="text-xs text-danger mb-2">{deductError}</p>
                )}
                {!isReadOnly && (
                  <button
                    onClick={handleManualDeduct}
                    disabled={manualDeducting}
                    className="text-sm bg-navy hover:bg-navy-light text-white font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {manualDeducting ? 'Deducting…' : '📦 Deduct Inventory Now'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </SectionBlock>

      {/* ── Section 6: Process Notes ── */}
      <SectionBlock title="Process Notes" icon="📝" open={open.notes} onToggle={() => toggle('notes')}>
        <div className="space-y-3">
          {[
            { field: 'recipe_deviations',    label: 'Recipe Deviations',     placeholder: 'Ingredient substitutions, amount changes…' },
            { field: 'water_chemistry_notes', label: 'Water Chemistry',       placeholder: 'Mineral additions, target profile, pH adjustments…' },
            { field: 'equipment_notes',       label: 'Equipment Notes',       placeholder: 'Equipment issues, cleaning notes, modifications…' },
            { field: 'quality_observations',  label: 'Quality Observations',  placeholder: 'Wort color, clarity, aroma, fermentation activity…' },
            { field: 'general_notes',         label: 'General Notes',         placeholder: 'Anything else worth noting for this batch…' },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className={LBL}>{label}</label>
              <textarea rows={3} className={INPUT_CLS} {...ti(field)} placeholder={placeholder} />
            </div>
          ))}
        </div>
      </SectionBlock>

    </div>
  )
}

// ── SectionBlock ───────────────────────────────────────────────────────────────

function SectionBlock({ title, icon, open, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <h3 className="font-semibold text-navy flex items-center gap-2 text-sm">
          <span>{icon}</span>
          <span>{title}</span>
        </h3>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4">{children}</div>}
    </div>
  )
}

// ── HopAdditionsTable ──────────────────────────────────────────────────────────

function HopAdditionsTable({ hops, onAdd, onSave, onRemove, isReadOnly }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-navy">Hop Additions</p>
        {!isReadOnly && (
          <button onClick={onAdd} className="text-xs text-amber hover:underline font-medium">
            + Add Hop
          </button>
        )}
      </div>
      {hops.length === 0 && (
        <p className="text-xs text-gray-400 py-2">No hop additions logged yet.</p>
      )}
      {hops.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[580px]">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-medium">Hop / Ingredient</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Planned</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-left font-medium">Unit</th>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Notes</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {hops.map(h => (
                <HopRow key={h.id} hop={h} onSave={onSave} onRemove={onRemove} isReadOnly={isReadOnly} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HopRow({ hop, onSave, onRemove, isReadOnly }) {
  const [local, setLocal] = useState(hop)
  useEffect(() => { setLocal(hop) }, [hop.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const inCls = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-gray-50'

  function f(field, type = 'text') {
    return {
      value: local[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setLocal(prev => ({ ...prev, [field]: e.target.value })),
      onBlur: e => {
        const v = e.target.value.trim()
        onSave(hop.id, field, type === 'number' ? (v === '' ? null : parseFloat(v)) : (v || null))
      },
    }
  }

  function sf(field) {
    return {
      value: local[field] ?? '',
      disabled: isReadOnly,
      onChange: e => { setLocal(prev => ({ ...prev, [field]: e.target.value })); onSave(hop.id, field, e.target.value || null) },
    }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2">
        <input className={`${inCls} min-w-[110px]`} {...f('ingredient_name')} />
      </td>
      <td className="px-3 py-2">
        <select className={`${inCls} min-w-[96px]`} {...sf('addition_type')}>
          <option value="Boil">Boil</option>
          <option value="First Wort">First Wort</option>
          <option value="Whirlpool">Whirlpool</option>
          <option value="Flameout">Flameout</option>
          <option value="Dry Hop">Dry Hop</option>
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <input type="number" step="0.01" className={`${inCls} w-16 text-right`} {...f('planned_amount', 'number')} />
      </td>
      <td className="px-3 py-2 text-right">
        <input type="number" step="0.01" className={`${inCls} w-16 text-right`} {...f('actual_amount', 'number')} />
      </td>
      <td className="px-3 py-2">
        <select className={`${inCls} min-w-[54px]`} {...sf('unit')}>
          <option value="oz">oz</option>
          <option value="lb">lb</option>
          <option value="g">g</option>
          <option value="kg">kg</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input className={`${inCls} min-w-[76px]`} {...f('actual_time')} placeholder="60 min" />
      </td>
      <td className="px-3 py-2">
        <input className={`${inCls} min-w-[110px]`} {...f('notes')} placeholder="Optional" />
      </td>
      <td className="px-3 py-2">
        {!isReadOnly && (
          <button
            onClick={() => onRemove(hop.id)}
            className="text-xs text-danger/60 hover:text-danger font-medium px-1 transition-colors"
            title="Remove"
          >
            🗑
          </button>
        )}
      </td>
    </tr>
  )
}

// ── MashStepsTable ─────────────────────────────────────────────────────────────

function MashStepsTable({ steps, onAdd, onSave, onRemove, isReadOnly, isDecoction }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-navy">
          {isDecoction ? 'Decoction Steps' : 'Mash Steps'}
        </p>
        {!isReadOnly && (
          <button onClick={onAdd} className="text-xs text-amber hover:underline font-medium">
            + Add Step
          </button>
        )}
      </div>
      {steps.length === 0 && (
        <p className="text-xs text-gray-400 py-2">No steps yet. Click + Add Step to begin.</p>
      )}
      {steps.map((step, idx) => (
        <MashStepRow
          key={step.id}
          step={step}
          index={idx}
          onSave={onSave}
          onRemove={onRemove}
          isReadOnly={isReadOnly}
          isDecoction={isDecoction}
        />
      ))}
    </div>
  )
}

function MashStepRow({ step, index, onSave, onRemove, isReadOnly, isDecoction }) {
  const [local, setLocal] = useState(step)
  useEffect(() => { setLocal(step) }, [step.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const inCls = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber disabled:bg-gray-50'

  function f(field, type = 'text') {
    return {
      value: local[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setLocal(prev => ({ ...prev, [field]: e.target.value })),
      onBlur: e => {
        const v = e.target.value.trim()
        onSave(step.id, field, type === 'number' ? (v === '' ? null : parseFloat(v)) : (v || null))
      },
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-navy">
          Step {index + 1}{local.step_name ? ` — ${local.step_name}` : ''}
        </span>
        {!isReadOnly && (
          <button
            onClick={() => onRemove(step.id)}
            className="text-xs text-danger/60 hover:text-danger font-medium transition-colors"
          >
            🗑 Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-0.5">Step Name</label>
          <input className={inCls} {...f('step_name')} placeholder="e.g. Protein Rest" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-0.5">Temp Target (°F)</label>
          <input type="number" step="0.1" className={inCls} {...f('target_temp', 'number')} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-0.5">Temp Actual (°F)</label>
          <input type="number" step="0.1" className={inCls} {...f('actual_temp', 'number')} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-0.5">Duration (min)</label>
          <input type="number" step="1" className={inCls} {...f('duration_minutes', 'number')} />
        </div>
        {isDecoction && (
          <>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Vol Pulled</label>
              <input type="number" step="0.01" className={inCls} {...f('volume_pulled', 'number')} />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Decoction Boil (min)</label>
              <input type="number" step="1" className={inCls} {...f('decoction_boil_time_minutes', 'number')} />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Temp Before Return</label>
              <input type="number" step="0.1" className={inCls} {...f('temp_before_return', 'number')} />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">Temp After Return</label>
              <input type="number" step="0.1" className={inCls} {...f('temp_after_return', 'number')} />
            </div>
          </>
        )}
        <div className="sm:col-span-4">
          <label className="block text-[10px] text-gray-400 mb-0.5">Notes</label>
          <input className={inCls} {...f('notes')} placeholder="Optional step notes…" />
        </div>
      </div>
    </div>
  )
}

// ── Flagging helpers ───────────────────────────────────────────────────────────

// Red border when actual temp deviates from target by more than threshold
function tempBorderCls(actual, target, threshold = 2) {
  if (!actual || !target) return ''
  return Math.abs(parseFloat(actual) - parseFloat(target)) > threshold
    ? 'border-danger focus:ring-danger'
    : ''
}

// Amber border when pH is outside the healthy 5.2–5.6 mash range
function phBorderCls(actual) {
  if (!actual) return ''
  const v = parseFloat(actual)
  return (v < 5.2 || v > 5.6) ? 'border-amber focus:ring-amber' : ''
}

// Small warning text below a temp field
function tempOffMsg(actual, target, threshold = 2) {
  if (!actual || !target) return null
  if (Math.abs(parseFloat(actual) - parseFloat(target)) > threshold) {
    return <p className="text-[10px] text-danger mt-0.5">⚠ Temp off by more than {threshold}°F from target</p>
  }
  return null
}

function phOffMsg(actual) {
  if (!actual) return null
  const v = parseFloat(actual)
  if (v < 5.2 || v > 5.6) {
    return <p className="text-[10px] text-amber mt-0.5">⚠ pH outside typical 5.2–5.6 range</p>
  }
  return null
}

// Efficiency badge: green ≤3% diff, amber 3–8%, red >8%
function efficiencyBadgeCls(actual, target) {
  if (!target) return 'bg-gray-100 text-gray-600 border-gray-200'
  const diff = Math.abs(parseFloat(actual) - parseFloat(target))
  if (diff <= 3) return 'bg-green-50 text-success border border-green-200'
  if (diff <= 8) return 'bg-amber/10 text-amber border border-amber/30'
  return 'bg-red-50 text-danger border border-danger/30'
}

function efficiencyBannerCls(actual, target) {
  const diff = parseFloat(actual) - parseFloat(target)
  if (diff >= -3) return 'bg-green-50 text-success border border-green-200'
  if (diff >= -8) return 'bg-amber/10 text-amber border border-amber/30'
  return 'bg-red-50 text-danger border border-danger/30'
}
