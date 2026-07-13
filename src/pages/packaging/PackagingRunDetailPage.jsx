/**
 * PackagingRunDetailPage — full detail workflow for a single packaging run.
 * Route: /packaging/:id
 *
 * Six sections:
 *   1. Transfer from Fermenter — volume, date, notes (auto-save on blur)
 *   2. Package Splits          — plan vs actuals with inline editing
 *   3. Yield Loss              — computed loss metrics + notes
 *   4. Cost Recalculation      — estimated vs actual cost per pint
 *   5. Quality Control         — QC checks table + add modal
 *   6. Notes                   — general run notes (auto-save on blur)
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import { useReadOnly } from '../../hooks/useReadOnly'
import ModalShell from '../../components/ModalShell'
import TierGate from '../../components/TierGate'
import LoadingSpinner from '../../components/LoadingSpinner'
import WorkflowWarningBanner from '../../components/WorkflowWarningBanner'
import { useModalDraft } from '../../hooks/useModalDraft'
import {
  calculateTotalIngredientCost,
  calculatePackagingCostPerBatch,
  pintsPerContainer,
  calculateLaborCost,
  calculateUtilitiesCost,
  calculateTotalProductionCost,
  calculateCostPerBarrel,
  calculateCostPerPint,
  calculateSuggestedRetail,
  convertToBarrels,
} from '../recipes/recipeUtils'
import {
  PACKAGE_TYPES,
  sizeOptionsFor,
  findSizeOption,
  isKegType,
  isPackType,
  packageTypeLabel,
} from '../../utils/packagingTypes'

// ── Shared CSS helpers ──────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

// ── Static constants ────────────────────────────────────────────────────────────
// Package type + size options now live in the shared src/utils/packagingTypes.js
// module (PACKAGE_TYPES, sizeOptionsFor) so the Recipe Builder and the Packaging
// module read from one canonical list instead of two independently maintained ones.

const DESTINATIONS = ['Taproom', 'Distribution', 'Storage', 'Event', 'Other']

const CLARITY_OPTIONS = ['Bright', 'Slightly Hazy', 'Hazy', 'Very Hazy']
const CARBONATION_OPTIONS = ['Under Carbonated', 'Correct', 'Over Carbonated']
const ABV_METHODS = ['Refractometer', 'Hydrometer', 'Lab Test']

// Pints per barrel conversion — used for cost recalculation
const PINTS_PER_BARREL = 248
const PINTS_PER_GALLON = 8
const PINTS_PER_LITER  = 2.11338

// Status visual styles and labels
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

// ── Utility helpers ─────────────────────────────────────────────────────────────

// Format a YYYY-MM-DD string to "May 15, 2025" — used throughout for display dates
function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Return today's date as YYYY-MM-DD for use in date inputs
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Format a number to "$X.XX" — used for cost display
function fmtDollars(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Return the number of pints per unit based on the volume_unit setting
function pintsPerUnit(volumeUnit) {
  if (volumeUnit === 'gallons') return PINTS_PER_GALLON
  if (volumeUnit === 'liters')  return PINTS_PER_LITER
  return PINTS_PER_BARREL // default: barrels
}

// Recover an oz-per-unit size from a free-text label used by pre-Checkpoint-1 recipe
// splits and native packaging-run splits (e.g. "16oz pour", "12oz"). Structured splits
// carry size_oz/size_bbl directly and never need this.
function ozFromSizeLabel(label) {
  if (!label) return null
  const match = String(label).match(/^(\d+(?:\.\d+)?)\s*oz/i)
  return match ? parseFloat(match[1]) : null
}

// Normalize a planned split regardless of whether it came from the recipe builder's
// structured shape (type / size / size_oz / size_bbl / volume_barrels / packaging_yield),
// an older recipe split (container_type / container_size_label), or a previous packaging
// run (package_type / total_volume).
//
// For recipe splits, volume_barrels is the GROSS volume and packaging_yield (0-100) gives
// the net packagable fraction. Units stored in the split were calculated from net volume,
// so total_volume is set to the net value to keep everything consistent:
//   net_volume = volume_barrels × (packaging_yield / 100)
function normalizePlannedSplit(p) {
  const packageType = p.type || p.package_type || p.container_type || ''
  const sizeSpec     = p.size ?? null
  let sizeOz  = p.size_oz  ?? null
  let sizeBbl = p.size_bbl ?? null

  // Backward-compat: pre-Checkpoint-1 splits carry no structured size — recover one
  // from an explicit volume_per_unit (native unit: bbl for kegs, oz otherwise) or by
  // parsing a free-text size label.
  if (sizeOz == null && sizeBbl == null) {
    if (p.volume_per_unit != null) {
      if (isKegType(packageType)) sizeBbl = parseFloat(p.volume_per_unit) || null
      else sizeOz = parseFloat(p.volume_per_unit) || null
    } else {
      sizeOz = ozFromSizeLabel(p.container_size_label)
    }
  }

  const grossVolume    = parseFloat(p.total_volume ?? p.volume_barrels) || null
  const packagingYield = parseFloat(p.packaging_yield) || null
  const netVolume      = grossVolume != null && packagingYield != null
    ? grossVolume * (packagingYield / 100)
    : null
  const totalVolume    = netVolume ?? grossVolume

  return {
    package_type:    packageType,
    size_spec:       sizeSpec,
    size_oz:         sizeOz,
    size_bbl:        sizeBbl,
    units:           p.units ?? null,
    total_volume:    totalVolume,
    packaging_yield: packagingYield,
  }
}

// Human-readable unit label for the size column, driven by the structured size fields
// instead of substring-matching the package type name.
function sizeUnitLabel(packageType, sizeOz, sizeBbl) {
  if (sizeBbl != null) return 'bbl/unit'
  if (sizeOz  != null) return isPackType(packageType) ? 'oz/pack' : 'oz/unit'
  return ''
}

// Calculate total volume in barrels from actualUnits × per-unit size. sizeBbl/sizeOz
// (from the canonical packagingTypes.js table) take priority; manualVolPerUnit is the
// brewer-entered fallback for types with no standard size (e.g. Barrel Aging), treated
// as already being in barrels.
function calcTotalVolume(actualUnits, sizeOz, sizeBbl, manualVolPerUnit) {
  const units = Number(actualUnits) || 0
  if (!units) return 0
  if (sizeBbl != null) return units * Number(sizeBbl)
  if (sizeOz  != null) return (units * Number(sizeOz)) / 3968
  return units * (Number(manualVolPerUnit) || 0)
}

// Derive unit count from a volume-in-barrels value and a structured per-unit size
// (oz or bbl). Used when planned_splits don't carry an explicit unit count.
function unitsFromVolume(volumeBarrels, sizeOz, sizeBbl) {
  const vol = Number(volumeBarrels) || 0
  if (!vol) return 0
  if (sizeBbl != null) return Math.floor(vol / Number(sizeBbl))
  if (sizeOz  != null) return Math.floor((vol * 3968) / Number(sizeOz))
  return 0
}

// ── Page root — TierGate wrapper ───────────────────────────────────────────────

export default function PackagingRunDetailPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="batch_to_sale"
      featureName="Packaging"
      featureDescription="Manage full packaging workflows: log volume transfers, plan and record package splits by format, track yield loss, recalculate costs from actual yield, and record QC checks — all in one place."
    >
      <PackagingRunDetail />
    </TierGate>
  )
}

// ── PackagingRunDetail — the main stateful component ───────────────────────────

function PackagingRunDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { brewery } = useAuth()
  const { isReadOnly } = useReadOnly()

  const [run,            setRun]            = useState(null)
  const [qcChecks,       setQcChecks]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [saveStatus,     setSaveStatus]     = useState(null) // null | 'saving' | 'saved' | 'error'
  const [completing,     setCompleting]     = useState(false)
  const [completeMsg,    setCompleteMsg]    = useState(null)
  const [qcModalOpen,    setQcModalOpen]    = useState(false)
  const [targetMarginPct, setTargetMarginPct] = useState(null)
  const [recipeCostPerPint,   setRecipeCostPerPint]   = useState(null)
  const [recipeRetailPerPint, setRecipeRetailPerPint] = useState(null)

  // ── Data loading ──────────────────────────────────────────────────────────────

  // Load the packaging run record and its QC checks from Supabase
  const loadRun = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    const [runRes, qcRes] = await Promise.all([
      supabase.from('packaging_runs').select('*').eq('id', id).single(),
      supabase
        .from('packaging_quality_checks')
        .select('*')
        .eq('packaging_run_id', id)
        .order('check_date', { ascending: false }),
    ])

    if (runRes.error) {
      setError('Could not load packaging run: ' + runRes.error.message)
      setLoading(false)
      return
    }

    // Normalize planned_splits and actual_splits — always arrays
    const r = runRes.data
    if (!Array.isArray(r.planned_splits))  r.planned_splits  = []
    if (!Array.isArray(r.actual_splits))   r.actual_splits   = []

    setRun(r)
    setQcChecks(qcRes.data ?? [])

    // Fetch target_margin_percentage and full recipe cost data via fermentation → recipe chain
    let marginPct = null
    if (r.fermentation_id) {
      const { data: ferm } = await supabase
        .from('fermentations').select('recipe_id')
        .eq('id', r.fermentation_id).maybeSingle()
      if (ferm?.recipe_id) {
        // Fetch full recipe cost fields
        const { data: recipe } = await supabase
          .from('recipes')
          .select(`
            target_margin_percentage,
            batch_size_value, batch_size_unit,
            labor_rate_per_hour, brew_hours,
            utilities_cost_per_barrel, cleaning_cost_per_batch,
            water_cost_per_barrel, wastewater_cost_per_barrel,
            fixed_overhead_percentage,
            packaging_splits
          `)
          .eq('id', ferm.recipe_id)
          .maybeSingle()

        if (recipe?.target_margin_percentage != null)
          marginPct = parseFloat(recipe.target_margin_percentage)

        // Fetch recipe ingredients for cost computation
        const { data: recipeIngredients } = await supabase
          .from('recipe_ingredients')
          .select('amount, scale_with_batch, price_per_unit, category')
          .eq('recipe_id', ferm.recipe_id)

        // Compute cost per pint from recipe data
        if (recipe && recipe.batch_size_value) {
          try {
            const batchBbls = convertToBarrels(recipe.batch_size_value, recipe.batch_size_unit)
            const ingCost   = calculateTotalIngredientCost(recipeIngredients ?? [], batchBbls, batchBbls)

            // Packaging cost from recipe's packaging_splits — normalizePlannedSplit()
            // resolves size_oz/size_bbl from either the structured Checkpoint-1 shape
            // or an older recipe split's free-text size label.
            const pkgSplits = Array.isArray(recipe.packaging_splits) ? recipe.packaging_splits : []
            const pkgCost = pkgSplits.reduce((sum, split) => {
              const norm = normalizePlannedSplit(split)
              return sum + calculatePackagingCostPerBatch(
                parseFloat(split.volume_barrels) || 0,
                parseFloat(split.packaging_yield) || 85,
                norm.size_oz,
                norm.size_bbl,
                parseFloat(split.packaging_cost_per_unit) || 0,
                parseFloat(split.label_cost_per_unit) || 0,
                parseFloat(split.carrier_cost_per_unit) || 0,
              )
            }, 0)

            const laborCost = calculateLaborCost(recipe.brew_hours, recipe.labor_rate_per_hour)
            const { total: utilitiesCost } = calculateUtilitiesCost(
              batchBbls,
              recipe.utilities_cost_per_barrel,
              recipe.cleaning_cost_per_batch,
              recipe.water_cost_per_barrel,
              recipe.wastewater_cost_per_barrel,
            )
            const { totalCost } = calculateTotalProductionCost(ingCost, pkgCost, laborCost, utilitiesCost, recipe.fixed_overhead_percentage)
            const costPerBbl    = calculateCostPerBarrel(totalCost, batchBbls)
            const costPerPint   = calculateCostPerPint(costPerBbl)
            const retailPerPint = calculateSuggestedRetail(costPerPint, recipe.target_margin_percentage)

            if (costPerPint > 0)   setRecipeCostPerPint(costPerPint)
            if (retailPerPint > 0) setRecipeRetailPerPint(retailPerPint)
          } catch (_) {
            // Silently skip if recipe cost computation fails
          }
        }
      }
    }
    setTargetMarginPct(marginPct)

    setLoading(false)
  }, [id])

  useEffect(() => { loadRun() }, [loadRun])

  // ── Auto-save field helper ────────────────────────────────────────────────────

  // Save one field to packaging_runs by column name, then update local state
  async function saveField(col, val) {
    setSaveStatus('saving')
    const { error: err } = await supabase
      .from('packaging_runs')
      .update({ [col]: val })
      .eq('id', run.id)
    if (err) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(null), 3000)
      return
    }
    setRun(prev => ({ ...prev, [col]: val }))
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(s => s === 'saved' ? null : s), 2000)
  }

  // ── Status action handlers ────────────────────────────────────────────────────

  // Set run status to 'in_progress' when user clicks "Start Packaging"
  async function handleStart() {
    await saveField('status', 'in_progress')
  }

  // Set run status back to 'planned' when user clicks "Pause"
  async function handlePause() {
    await saveField('status', 'planned')
  }

  // Set run status to 'cancelled' after a confirmation prompt
  async function handleCancel() {
    if (!window.confirm('Cancel this packaging run? This cannot be undone.')) return
    await saveField('status', 'cancelled')
  }

  // ── Mark Complete flow ────────────────────────────────────────────────────────

  // Validate actuals, create batch_packages + package_splits records, set status='complete'
  async function handleMarkComplete() {
    const actualSplits = run.actual_splits || []

    console.log('[PackagingRunDetailPage] Marking complete, actual_splits:', actualSplits)

    // Validate: at least one actual split with units_packaged > 0
    const hasUnits = actualSplits.some(s => parseFloat(s.units_packaged) > 0)
    if (!hasUnits) {
      alert('Please enter at least one actual split with units packaged before completing.')
      return
    }

    // Validate: every split with units packaged must have a package type selected —
    // otherwise Distribution has no way to tell the brewer what's being assigned.
    const missingType = actualSplits.some(s => parseFloat(s.units_packaged) > 0 && !s.package_type)
    if (missingType) {
      alert('Please select a package type for every split with units packaged before completing.')
      return
    }

    if (!window.confirm('Mark this packaging run as complete? This will create a distribution record.')) return

    setCompleting(true)
    setCompleteMsg(null)

    // Step 1: insert the batch_packages record
    const totalVolPackaged = actualSplits.reduce((sum, s) => {
      return sum + calcTotalVolume(s.units_packaged, s.size_oz, s.size_bbl, s.volume_per_unit)
    }, 0)

    const { data: batchPkg, error: bpErr } = await supabase
      .from('batch_packages')
      .insert({
        brewery_id:            brewery.id,
        fermentation_id:       run.fermentation_id   || null,
        brew_day_id:           null,
        batch_number:          run.batch_number       || null,
        beer_name:             run.beer_name          || '',
        beer_style:            run.beer_style         || null,
        packaging_date:        run.packaging_date     || null,
        total_volume_packaged: totalVolPackaged        || null,
        volume_unit:           run.volume_unit        || 'barrels',
        total_volume_fermented: run.volume_from_fermenter || null,
        status:                'complete',
        packaging_notes:       run.notes              || null,
        quality_notes:         null,
        packaging_run_id:      run.id,
      })
      .select()
      .single()

    if (bpErr) {
      alert('Error creating batch record: ' + bpErr.message)
      setCompleting(false)
      return
    }

    const batchPackageId = batchPkg.id

    // Step 2: insert a package_splits row for each actual split
    if (actualSplits.length > 0) {
      const splitRows = actualSplits
        .filter(s => parseFloat(s.units_packaged) > 0)
        .map(s => ({
          batch_package_id: batchPackageId,
          brewery_id:       brewery.id,
          package_type:     s.package_type    || null,
          size_spec:        s.size_spec       || null,
          units_packaged:   parseFloat(s.units_packaged)   || null,
          volume_per_unit:  parseFloat(s.volume_per_unit)  || null,
          total_volume:     (parseFloat(s.units_packaged) || 0) * (parseFloat(s.volume_per_unit) || 0) || null,
          unit_cost:        null,
          total_packaging_cost: null,
          destination:      s.destination     || null,
          notes:            s.notes           || null,
        }))

      const { error: splitErr } = await supabase.from('package_splits').insert(splitRows)
      if (splitErr) {
        alert('Error saving package splits: ' + splitErr.message)
        setCompleting(false)
        return
      }
    }

    // Step 3: update the packaging_run to complete and link the batch_package
    const { error: updateErr } = await supabase
      .from('packaging_runs')
      .update({
        status:               'complete',
        batch_package_id:     batchPackageId,
        total_volume_packaged: totalVolPackaged || null,
        // Persist the full production cost (ingredients + packaging + labor + utilities + overhead)
        // so DistributionPage can pull it from packaging_runs.recipe_cost_per_pint
        ...(recipeCostPerPint > 0 && { recipe_cost_per_pint: recipeCostPerPint }),
      })
      .eq('id', run.id)

    if (updateErr) {
      alert('Error updating run status: ' + updateErr.message)
      setCompleting(false)
      return
    }

    // Reload the run to reflect the new status
    await loadRun()
    setCompleting(false)
    setCompleteMsg(batchPackageId)
  }

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner message="Loading packaging run…" />

  if (error || !run) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-danger font-semibold mb-3">{error || 'Packaging run not found.'}</p>
          <Link to="/packaging" className="text-amber text-sm hover:underline">
            ← Back to Packaging
          </Link>
        </div>
      </div>
    )
  }

  const isActive = run.status !== 'complete' && run.status !== 'cancelled'

  // ── Workflow warnings ────────────────────────────────────────────────────────

  const packagingWarnings = []

  if (!run.volume_from_fermenter) {
    packagingWarnings.push({
      message: 'Volume from fermenter not entered — required for yield calculations',
      severity: 'required',
    })
  }

  const actualSplitsCount = (run.actual_splits || []).filter(s => parseFloat(s.units_packaged) > 0).length
  if (actualSplitsCount === 0 && run.status !== 'planned') {
    packagingWarnings.push({
      message: 'No actual splits recorded — enter packaged quantities to track yield',
      severity: 'required',
    })
  }

  if (run.volume_from_fermenter && run.total_volume_packaged) {
    const vol  = parseFloat(run.volume_from_fermenter)
    const pkg  = parseFloat(run.total_volume_packaged)
    const diff = Math.abs(vol - pkg) / vol
    if (diff > 0.1) {
      packagingWarnings.push({
        message: `Splits total (${pkg.toFixed(2)}) differs from fermenter volume (${vol.toFixed(2)}) by more than 10%`,
        severity: 'recommended',
      })
    }
  }

  if (qcChecks.length === 0 && run.status !== 'planned') {
    packagingWarnings.push({
      message: 'No quality check completed for this packaging run',
      severity: 'recommended',
    })
  }

  return (
    <div className="px-4 py-6 space-y-8">

      {/* ── Page header ── */}
      <PageHeader
        run={run}
        isReadOnly={isReadOnly}
        saveStatus={saveStatus}
        completing={completing}
        completeMsg={completeMsg}
        isActive={isActive}
        onStart={handleStart}
        onPause={handlePause}
        onCancel={handleCancel}
        onMarkComplete={handleMarkComplete}
      />

      {/* ── Workflow warnings ── */}
      <WorkflowWarningBanner warnings={packagingWarnings} />

      {/* ── Section 1: Transfer from Fermenter ── */}
      <TransferSection
        run={run}
        isReadOnly={isReadOnly}
        saveField={saveField}
        setRun={setRun}
      />

      {/* ── Section 2: Package Splits ── */}
      <SplitsSection
        run={run}
        isReadOnly={isReadOnly}
        setRun={setRun}
        saveField={saveField}
        setSaveStatus={setSaveStatus}
        brewery={brewery}
        targetMarginPct={targetMarginPct}
        recipeCostPerPint={recipeCostPerPint}
        recipeRetailPerPint={recipeRetailPerPint}
      />

      {/* ── Section 3: Yield Loss ── */}
      <YieldLossSection
        run={run}
        isReadOnly={isReadOnly}
        saveField={saveField}
        setRun={setRun}
      />

      {/* ── Section 4: Cost Recalculation (only if recipe cost exists) ── */}
      {run.recipe_cost_per_pint != null && (
        <CostSection run={run} />
      )}

      {/* ── Section 5: Quality Control ── */}
      <QualityControlSection
        run={run}
        qcChecks={qcChecks}
        isReadOnly={isReadOnly}
        qcModalOpen={qcModalOpen}
        setQcModalOpen={setQcModalOpen}
        onQcSaved={() => { setQcModalOpen(false); loadRun() }}
        brewery={brewery}
      />

      {/* ── Section 6: Notes ── */}
      <NotesSection
        run={run}
        isReadOnly={isReadOnly}
        saveField={saveField}
        setRun={setRun}
      />
    </div>
  )
}

// ── PageHeader ─────────────────────────────────────────────────────────────────

// Top header: breadcrumb, batch badge, status, and action buttons
function PageHeader({
  run, isReadOnly, saveStatus, completing, completeMsg,
  isActive, onStart, onPause, onCancel, onMarkComplete,
}) {
  return (
    <div className="space-y-3">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/packaging" className="text-amber hover:underline font-medium">
          ← Packaging
        </Link>
        {run.fermentation_id && (
          <>
            <span className="text-gray-300">|</span>
            <Link to="/fermentation" className="text-amber hover:underline font-medium text-xs">
              ← Fermentation record
            </Link>
          </>
        )}
      </div>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {run.batch_number && (
              <span className="bg-navy text-white text-xs font-mono font-bold px-2.5 py-1 rounded">
                {run.batch_number}
              </span>
            )}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[run.status] || 'bg-gray-100 text-gray-500'}`}>
              {STATUS_LABELS[run.status] || run.status}
            </span>
            {saveStatus === 'saving' && <span className="text-xs text-gray-400">Saving…</span>}
            {saveStatus === 'saved'  && <span className="text-xs text-success">Saved ✓</span>}
            {saveStatus === 'error'  && <span className="text-xs text-danger">Save failed</span>}
          </div>
          <h1 className="text-2xl font-bold text-navy">{run.beer_name || 'Unnamed Run'}</h1>
          {run.beer_style && (
            <p className="text-sm text-gray-500 mt-0.5">{run.beer_style}</p>
          )}
        </div>
      </div>

      {/* Success message after completing */}
      {completeMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-success font-medium">
            Packaging complete! Distribution record created.
          </p>
          <Link to="/distribution" className="text-sm font-semibold text-success hover:underline shrink-0">
            View Distribution →
          </Link>
        </div>
      )}

      {/* Status action buttons */}
      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {run.status === 'planned' && (
            <button
              onClick={onStart}
              className="bg-navy text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-navy/80 transition-colors"
            >
              Start Packaging
            </button>
          )}

          {run.status === 'in_progress' && (
            <>
              <button
                onClick={onMarkComplete}
                disabled={completing}
                className="bg-amber text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50"
              >
                {completing ? 'Completing…' : 'Mark Complete'}
              </button>
              <button
                onClick={onPause}
                className="border border-gray-300 text-gray-600 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Pause
              </button>
            </>
          )}

          {/* Cancel link shown for any active status */}
          {isActive && (
            <button
              onClick={onCancel}
              className="text-xs text-danger hover:underline font-medium ml-2"
            >
              Cancel Run
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── TransferSection ────────────────────────────────────────────────────────────

// Section 1 — volume from fermenter, transfer date, and transfer notes
function TransferSection({ run, isReadOnly, saveField, setRun }) {
  // Local state mirrors run fields for controlled inputs
  const [volumeFrom, setVolumeFrom] = useState(run.volume_from_fermenter ?? '')
  const [volumeUnit, setVolumeUnit] = useState(run.volume_unit ?? 'barrels')
  const [transferDate, setTransferDate] = useState(run.transfer_date ?? '')
  const [transferNotes, setTransferNotes] = useState(run.transfer_notes ?? '')

  // Keep local state in sync if the run reloads (e.g. after Mark Complete)
  useEffect(() => {
    setVolumeFrom(run.volume_from_fermenter ?? '')
    setVolumeUnit(run.volume_unit ?? 'barrels')
    setTransferDate(run.transfer_date ?? '')
    setTransferNotes(run.transfer_notes ?? '')
  }, [run.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-base font-bold text-navy">Section 1 — Transfer from Fermenter</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Volume from fermenter */}
        <div>
          <label className={LBL}>Volume from Fermenter</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={INPUT_CLS}
            placeholder="e.g. 20"
            value={volumeFrom}
            disabled={isReadOnly}
            onChange={e => setVolumeFrom(e.target.value)}
            onBlur={e => {
              const val = e.target.value === '' ? null : parseFloat(e.target.value)
              saveField('volume_from_fermenter', val)
              setRun(prev => ({ ...prev, volume_from_fermenter: val }))
            }}
          />
        </div>

        {/* Volume unit */}
        <div>
          <label className={LBL}>Unit</label>
          <select
            className={INPUT_CLS}
            value={volumeUnit}
            disabled={isReadOnly}
            onChange={e => setVolumeUnit(e.target.value)}
            onBlur={e => {
              saveField('volume_unit', e.target.value)
              setRun(prev => ({ ...prev, volume_unit: e.target.value }))
            }}
          >
            <option value="barrels">Barrels</option>
            <option value="gallons">Gallons</option>
            <option value="liters">Liters</option>
          </select>
        </div>

        {/* Transfer date */}
        <div>
          <label className={LBL}>Transfer Date</label>
          <input
            type="date"
            className={INPUT_CLS}
            value={transferDate}
            disabled={isReadOnly}
            onChange={e => setTransferDate(e.target.value)}
            onBlur={e => {
              const val = e.target.value || null
              saveField('transfer_date', val)
              setRun(prev => ({ ...prev, transfer_date: val }))
            }}
          />
        </div>
      </div>

      {/* Transfer notes */}
      <div>
        <label className={LBL}>Transfer Notes</label>
        <textarea
          rows={3}
          className={INPUT_CLS}
          placeholder="Hose connections, CO2 push, temperature, anything unusual during transfer…"
          value={transferNotes}
          disabled={isReadOnly}
          onChange={e => setTransferNotes(e.target.value)}
          onBlur={e => {
            const val = e.target.value.trim() || null
            saveField('transfer_notes', val)
            setRun(prev => ({ ...prev, transfer_notes: val }))
          }}
        />
      </div>
    </section>
  )
}

// ── SplitsSection ──────────────────────────────────────────────────────────────

// Section 2 — planned splits (read-only) vs actual splits (editable inline)
function SplitsSection({ run, isReadOnly, setRun, saveField, setSaveStatus, brewery, targetMarginPct, recipeCostPerPint, recipeRetailPerPint }) {
  // Once a run is complete, its actual_splits are treated as data that has
  // physically left the building — permanently locked, no admin override.
  const isLocked = run.status === 'complete'

  // actualSplits mirrors run.actual_splits but is editable locally before saving.
  // Pre-populate from planned_splits (normalised to handle both recipe and native formats).
  const [actualSplits, setActualSplits] = useState(() => {
    if (run.actual_splits && run.actual_splits.length > 0) return run.actual_splits
    return (run.planned_splits || []).map(p => {
      const norm = normalizePlannedSplit(p)
      const hasSize = norm.size_oz != null || norm.size_bbl != null

      // volume_per_unit mirrors the structured size for computed types (display value);
      // types with no standard size (e.g. Barrel Aging) leave it blank for manual entry.
      const volumePerUnit = hasSize ? String(norm.size_bbl ?? norm.size_oz) : ''

      // When planned_splits don't carry an explicit unit count, derive it from total_volume
      // using the structured per-unit size.
      let unitsStr = norm.units != null ? String(norm.units) : ''
      if (!unitsStr && norm.total_volume != null && hasSize) {
        let derived = unitsFromVolume(parseFloat(norm.total_volume), norm.size_oz, norm.size_bbl)
        if (derived > 10000) {
          console.warn('[SplitsSection] derived unit count exceeds sanity threshold — capping at 10 000',
            { derived, total_volume: norm.total_volume, size_oz: norm.size_oz, size_bbl: norm.size_bbl, package_type: norm.package_type })
          derived = 10000
        }
        if (derived > 0) unitsStr = String(derived)
      }

      // Compute total_volume (in barrels) from units × size when both are available;
      // falls back to the plan's own total_volume otherwise.
      let totalVol = ''
      if (unitsStr && hasSize) {
        const computed = calcTotalVolume(unitsStr, norm.size_oz, norm.size_bbl)
        totalVol = computed > 0 ? computed.toFixed(4) : ''
      } else if (norm.total_volume != null) {
        totalVol = String(norm.total_volume)
      }

      return {
        package_type:    norm.package_type,
        size_spec:       norm.size_spec,
        size_oz:         norm.size_oz,
        size_bbl:        norm.size_bbl,
        units_packaged:  unitsStr,
        volume_per_unit: volumePerUnit,
        total_volume:    totalVol,
        destination:     '',
        notes:           '',
        _fromPlan:       true,
      }
    })
  })

  const [saving, setSaving]                 = useState(false)
  const [splitError, setSplitError]         = useState(null)
  const [splitSaveStatus, setSplitSaveStatus] = useState('saved') // 'saved' | 'pending'
  const saveDebounceRef = useRef(null)

  // Update a field in one actual split row; resets size on type change, auto-fills
  // volume_per_unit + size_oz/size_bbl on size change (recalculating units_packaged
  // from the existing total_volume when available), and recomputes total_volume
  // whenever units or volume_per_unit change.
  function updateSplit(index, field, value) {
    if (isLocked) return
    setActualSplits(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }

      // Type changes reset size and its derived fields — sizes differ per type.
      if (field === 'package_type') {
        next[index].size_spec       = ''
        next[index].size_oz         = null
        next[index].size_bbl        = null
        next[index].volume_per_unit = ''
      }

      // Size changes look up the numeric oz/bbl-per-unit value from the shared table
      // and recalculate units_packaged from the existing total_volume if available —
      // preserving the physical volume while adjusting the unit count for the new size.
      if (field === 'size_spec') {
        const sizeOption = findSizeOption(next[index].package_type, value)
        next[index].size_oz         = sizeOption?.ozPerUnit  ?? null
        next[index].size_bbl        = sizeOption?.bblPerUnit ?? null
        next[index].volume_per_unit = sizeOption?.bblPerUnit != null ? String(sizeOption.bblPerUnit)
                                     : sizeOption?.ozPerUnit  != null ? String(sizeOption.ozPerUnit)
                                     : ''
        const tv = parseFloat(next[index].total_volume) || 0
        if (tv > 0 && (next[index].size_oz != null || next[index].size_bbl != null)) {
          const units = unitsFromVolume(tv, next[index].size_oz, next[index].size_bbl)
          if (units > 0) next[index].units_packaged = String(units)
        }
      }

      // Auto-compute total_volume (in barrels) when units or volume_per_unit change.
      // calcTotalVolume prioritizes the structured size, falling back to the manually
      // entered volume_per_unit for types with no standard size (e.g. Barrel Aging).
      if (field === 'units_packaged' || field === 'volume_per_unit' || field === 'size_spec') {
        const units = parseFloat(field === 'units_packaged' ? value : next[index].units_packaged) || 0
        const tv    = calcTotalVolume(units, next[index].size_oz, next[index].size_bbl, next[index].volume_per_unit)
        next[index].total_volume = tv > 0 ? tv.toFixed(4) : ''
      }
      // Trigger debounced auto-save after every field change
      scheduleSplitSave(next)
      return next
    })
  }

  // Add a blank extra actual split row not tied to a plan entry
  function addExtraSplit() {
    setActualSplits(prev => {
      const next = [
        ...prev,
        { package_type: '', size_spec: '', size_oz: null, size_bbl: null, units_packaged: '', volume_per_unit: '', total_volume: '', destination: '', notes: '', _fromPlan: false },
      ]
      scheduleSplitSave(next)
      return next
    })
  }

  // Remove an actual split row
  function removeSplit(index) {
    setActualSplits(prev => {
      const next = prev.filter((_, i) => i !== index)
      scheduleSplitSave(next)
      return next
    })
  }

  // Compute total packaged volume from all actual splits
  const totalPackaged = useMemo(() => {
    return actualSplits.reduce((sum, s) => sum + (parseFloat(s.total_volume) || 0), 0)
  }, [actualSplits])

  const volumeFrom = parseFloat(run.volume_from_fermenter) || 0
  const yieldLoss  = volumeFrom > 0 ? volumeFrom - totalPackaged : null
  const yieldPct   = volumeFrom > 0 && totalPackaged > 0
    ? Math.round((totalPackaged / volumeFrom) * 1000) / 10
    : null

  // Total volume from planned splits (used for profit impact comparison)
  const plannedVolume = useMemo(() => {
    return (run.planned_splits || []).reduce((sum, p) => {
      const norm = normalizePlannedSplit(p)
      return sum + (parseFloat(norm.total_volume) || 0)
    }, 0)
  }, [run.planned_splits])

  // Color for yield percentage display
  function yieldColor(pct) {
    if (pct == null) return 'text-gray-400'
    if (pct >= 85)   return 'text-success font-semibold'
    if (pct >= 75)   return 'text-amber font-semibold'
    return 'text-danger font-semibold'
  }

  // Schedule a debounced auto-save of splits — triggered after each split field change
  function scheduleSplitSave(newSplits) {
    if (isLocked) return
    setSplitSaveStatus('pending')
    clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      saveSplitsData(newSplits)
    }, 500)
  }

  // Save all actual_splits plus recomputed totals in one DB update
  // splitsToSave: the array of splits to persist (passed explicitly for debounce correctness)
  async function saveSplitsData(splitsToSave) {
    // Guard against a stale debounced call landing after the run was marked
    // complete (e.g. an edit made just before completion whose 500ms timer
    // fires afterward) — the lock must hold even for in-flight requests.
    if (isLocked) return
    setSaving(true)
    setSplitError(null)

    // Build the normalized array to persist
    const toSave = splitsToSave.map(s => ({
      package_type:    s.package_type    || '',
      size_spec:       s.size_spec       || null,
      size_oz:         s.size_oz         ?? null,
      size_bbl:        s.size_bbl        ?? null,
      units_packaged:  s.units_packaged  !== '' ? parseFloat(s.units_packaged)  : null,
      volume_per_unit: s.volume_per_unit !== '' && s.volume_per_unit != null ? parseFloat(s.volume_per_unit) : null,
      total_volume:    s.total_volume    !== '' ? parseFloat(s.total_volume)    : null,
      destination:     s.destination    || '',
      notes:           s.notes          || '',
    }))

    // Recompute yield figures from the splits being saved
    const savedTotalPkg = splitsToSave.reduce((sum, s) => sum + (parseFloat(s.total_volume) || 0), 0)
    const savedVolumeFrom = parseFloat(run.volume_from_fermenter) || 0
    const savedYieldLoss = savedVolumeFrom > 0 ? savedVolumeFrom - savedTotalPkg : null
    const savedYieldPct  = savedVolumeFrom > 0 && savedTotalPkg > 0
      ? Math.round((savedTotalPkg / savedVolumeFrom) * 1000) / 10
      : null

    // Recompute cost per pint if recipe cost is available
    const ppu = pintsPerUnit(run.volume_unit)
    let actualCostPerPint = null
    if (run.recipe_cost_per_pint && savedVolumeFrom > 0 && savedTotalPkg > 0) {
      const totalProductionCost = run.recipe_cost_per_pint * (savedVolumeFrom * ppu)
      actualCostPerPint = totalProductionCost / (savedTotalPkg * ppu)
    }

    const updatePayload = {
      actual_splits:              toSave,
      total_volume_packaged:      savedTotalPkg || null,
      packaging_yield_percentage: savedYieldPct  || null,
      yield_loss_volume:          savedYieldLoss !== null ? parseFloat(savedYieldLoss.toFixed(4)) : null,
      actual_cost_per_pint:       actualCostPerPint,
    }

    const { error: err } = await supabase
      .from('packaging_runs')
      .update(updatePayload)
      .eq('id', run.id)

    if (err) {
      setSplitError(err.message)
      setSaving(false)
      setSplitSaveStatus('saved') // reset so next change can retry
      return
    }

    setRun(prev => ({ ...prev, ...updatePayload, actual_splits: toSave }))
    setSaving(false)
    setSplitSaveStatus('saved')
  }

  const plannedSplits = run.planned_splits || []
  const unit = run.volume_unit || 'barrels'

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <h2 className="text-base font-bold text-navy">Section 2 — Package Splits</h2>

      {/* Locked notice — shown once the run is complete; splits become permanently non-editable */}
      {isLocked && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
          This packaging run is complete. Package splits cannot be edited.
        </div>
      )}

      {/* No packaging plan message — shown when recipe has no splits and no actuals entered yet */}
      {(!run.planned_splits || run.planned_splits.length === 0) && (run.actual_splits || []).length === 0 && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500 mb-3">
          No packaging plan from recipe. Add splits manually below.
        </div>
      )}

      {/* Plan vs Actuals two-column table */}
      {(plannedSplits.length > 0 || actualSplits.length > 0) ? (
        <div className="w-full rounded-lg border border-gray-200">
          <table style={{ tableLayout: 'fixed', width: '100%' }} className="text-sm">
            <colgroup>
              <col style={{ width: '16%' }} />   {/* Package Type */}
              <col style={{ width: '9%' }} />    {/* Planned Units */}
              <col style={{ width: '9%' }} />    {/* Planned Vol */}
              <col style={{ width: '10%' }} />   {/* Actual Units */}
              <col style={{ width: '11%' }} />   {/* Vol/Unit */}
              <col style={{ width: '11%' }} />   {/* Total Vol */}
              <col style={{ width: '16%' }} />   {/* Destination */}
              <col style={{ width: (isReadOnly || isLocked) ? '18%' : '12%' }} />  {/* Notes */}
              {!isReadOnly && !isLocked && <col style={{ width: '6%' }} />}        {/* Remove */}
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Package Type</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-blue-600 uppercase tracking-wide">Planned Units</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-blue-600 uppercase tracking-wide">Planned Vol</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-amber uppercase tracking-wide">Actual Units</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-amber uppercase tracking-wide">Vol/Unit</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-amber uppercase tracking-wide">Total Vol</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Destination</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                {!isReadOnly && !isLocked && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actualSplits.map((s, i) => {
                // Normalize the planned split for this row to handle both recipe
                // format (container_type / volume_barrels) and native format.
                const planned = plannedSplits[i] ? normalizePlannedSplit(plannedSplits[i]) : null
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    {/* Package type + size — readonly if matched to a plan row */}
                    <td className="px-3 py-2">
                      {s._fromPlan && planned ? (
                        <span className="text-gray-700 font-medium">
                          {packageTypeLabel(s.package_type, s.size_spec)}
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <select
                            className={`${INPUT_CLS} ${!s.package_type && parseFloat(s.units_packaged) > 0 ? 'border-danger' : ''}`}
                            value={s.package_type}
                            disabled={isReadOnly || isLocked}
                            onChange={e => updateSplit(i, 'package_type', e.target.value)}
                          >
                            <option value="">— Type —</option>
                            {PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select
                            className={INPUT_CLS}
                            value={s.size_spec || ''}
                            disabled={isReadOnly || isLocked || !s.package_type}
                            onChange={e => updateSplit(i, 'size_spec', e.target.value)}
                          >
                            <option value="">— Size —</option>
                            {sizeOptionsFor(s.package_type).map(opt => (
                              <option key={opt.label} value={opt.label}>{opt.label}</option>
                            ))}
                          </select>
                          {!s.package_type && parseFloat(s.units_packaged) > 0 && (
                            <span className="text-[10px] text-danger block mt-0.5">Required before completing</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Planned columns — display only, using normalized keys */}
                    <td className="px-3 py-2 text-blue-700 font-medium">
                      {planned ? (planned.units ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-2 text-blue-700">
                      {planned && planned.total_volume != null ? (
                        <span
                          title={planned.packaging_yield != null
                            ? `Net packagable volume after ${planned.packaging_yield}% yield`
                            : 'Packagable volume'}
                          className="cursor-help"
                        >
                          {parseFloat(planned.total_volume).toFixed(3)} {unit}
                          {planned.packaging_yield != null && (
                            <span className="block text-[10px] text-blue-400 leading-tight">
                              {planned.packaging_yield}% yield
                            </span>
                          )}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Actual units */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={INPUT_CLS}
                        placeholder="0"
                        value={s.units_packaged}
                        disabled={isReadOnly || isLocked}
                        onChange={e => updateSplit(i, 'units_packaged', e.target.value)}
                      />
                    </td>

                    {/* Volume per unit — auto-filled from the selected size; editable only
                        when the type/size has no standard size (e.g. Barrel Aging) */}
                    <td className="px-2 py-2">
                      {(s.size_oz != null || s.size_bbl != null) ? (
                        <div className={`${INPUT_CLS} bg-gray-50 text-gray-500 text-right`}>
                          {s.size_bbl != null ? s.size_bbl : s.size_oz}
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          className={INPUT_CLS}
                          placeholder="0"
                          value={s.volume_per_unit}
                          disabled={isReadOnly || isLocked}
                          onChange={e => updateSplit(i, 'volume_per_unit', e.target.value)}
                        />
                      )}
                      <span className="text-[10px] text-gray-400 mt-0.5 block text-center">
                        {sizeUnitLabel(s.package_type, s.size_oz, s.size_bbl) || unit}
                      </span>
                      {s.package_type && s.size_spec && s.size_oz == null && s.size_bbl == null && !isReadOnly && !isLocked && (
                        <span className="text-[10px] text-amber block text-center leading-tight mt-0.5">
                          No standard volume for this size — please enter manually.
                        </span>
                      )}
                    </td>

                    {/* Total volume — auto-computed in barrels, display only */}
                    <td className="px-3 py-2 text-gray-700 font-medium">
                      {s.total_volume ? `${parseFloat(s.total_volume).toFixed(3)} ${unit}` : '—'}
                    </td>

                    {/* Destination */}
                    <td className="px-3 py-2">
                      <select
                        className={INPUT_CLS}
                        value={s.destination}
                        disabled={isReadOnly || isLocked}
                        onChange={e => updateSplit(i, 'destination', e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {DESTINATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className={INPUT_CLS}
                        placeholder="Optional"
                        value={s.notes}
                        disabled={isReadOnly || isLocked}
                        onChange={e => updateSplit(i, 'notes', e.target.value)}
                      />
                    </td>

                    {/* Remove button — only for extra (non-plan) rows */}
                    {!isReadOnly && !isLocked && (
                      <td className="px-3 py-2">
                        {!s._fromPlan && (
                          <button
                            onClick={() => removeSplit(i)}
                            className="text-danger text-xs hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}

              {/* Show empty state row if no splits at all */}
              {actualSplits.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No splits yet. Click "+ Add Split" below to add package formats.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center text-gray-400 text-sm">
          No planned splits. Add your actual splits below.
        </div>
      )}

      {/* Add split button + auto-save status indicator */}
      {!isReadOnly && !isLocked && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={addExtraSplit}
            className="text-sm text-amber font-semibold hover:underline"
          >
            + Add Split
          </button>
          <span className="text-xs ml-2">
            {splitSaveStatus === 'pending' && <span className="text-amber">Saving…</span>}
            {splitSaveStatus === 'saved'   && <span className="text-success">Saved ✓</span>}
          </span>
          {splitError && (
            <span className="text-danger text-xs">{splitError}</span>
          )}
        </div>
      )}

      {/* Running totals + Profit Impact — two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">

        {/* Running totals panel */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">From Fermenter</div>
            <div className="font-semibold text-gray-800">
              {volumeFrom > 0 ? `${volumeFrom} ${unit}` : '—'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Total Packaged</div>
            <div className="font-semibold text-gray-800">
              {totalPackaged > 0 ? `${totalPackaged.toFixed(3)} ${unit}` : '—'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Yield Loss</div>
            <div className="font-semibold text-gray-800">
              {yieldLoss !== null ? `${yieldLoss.toFixed(3)} ${unit}` : '—'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Yield %</div>
            <div className={yieldColor(yieldPct)}>
              {yieldPct !== null ? `${yieldPct}%` : '—'}
            </div>
          </div>
        </div>

        {/* Profit Impact panel — per-split sale price entry with auto-computed revenue/profit */}
        <ProfitImpactPanel
          run={run}
          actualSplits={actualSplits}
          recipeCostPerPint={recipeCostPerPint}
        />
      </div>
    </section>
  )
}

// ── ProfitImpactPanel ──────────────────────────────────────────────────────────

// Per-split profit breakdown. Brewer enters one sale price per split; revenue,
// cost, and profit are all computed automatically. Cost uses recipe_cost_per_pint
// when available; if not, cost columns show '—' and revenue still displays.
function ProfitImpactPanel({ run, actualSplits, recipeCostPerPint }) {
  const splits = actualSplits || []

  // Per-split sale prices — local only, not persisted (session entry)
  const [salePrices, setSalePrices] = useState(() => splits.map(() => ''))

  // Sync length when rows are added or removed
  useEffect(() => {
    setSalePrices(prev => {
      if (prev.length === splits.length) return prev
      return splits.map((_, i) => prev[i] ?? '')
    })
  }, [splits.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Use recipeCostPerPint prop first, then fall back to stored value on the run record
  const cost = recipeCostPerPint ?? (run.recipe_cost_per_pint != null ? parseFloat(run.recipe_cost_per_pint) : null)

  // Build one row object per split
  const rows = splits.map((s, i) => {
    const actualUnits   = parseFloat(s.units_packaged) || 0
    const salePrice     = parseFloat(salePrices[i])    || 0
    const ppu           = pintsPerContainer(s.size_oz, s.size_bbl) ?? 0
    const costPerUnit   = cost != null ? cost * ppu : null
    const profitPerUnit = costPerUnit != null ? salePrice - costPerUnit : null
    const revenue       = actualUnits * salePrice
    const totalCost     = costPerUnit  != null ? actualUnits * costPerUnit   : null
    const totalProfit   = profitPerUnit != null ? actualUnits * profitPerUnit : null
    const packageType   = s.package_type ? packageTypeLabel(s.package_type, s.size_spec) : '—'
    return { packageType, actualUnits, salePrice, costPerUnit, profitPerUnit, revenue, totalCost, totalProfit }
  })

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalCostAll = rows.reduce((s, r) => s + (r.totalCost ?? 0), 0)
  const totalProfit  = rows.reduce((s, r) => s + (r.totalProfit ?? r.revenue), 0)
  const marginPct    = totalRevenue > 0 && cost != null ? (totalProfit / totalRevenue) * 100 : null

  const hasRevenue   = rows.some(r => r.salePrice > 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-navy uppercase tracking-wide">Profit Impact</p>

      {cost != null && (
        <p className="text-[10px] text-gray-400">
          Cost/pint: <span className="font-semibold text-gray-600">{fmtDollars(cost)}</span>
          <span className="ml-1">(from recipe — used to compute cost per unit)</span>
        </p>
      )}
      {cost == null && (
        <p className="text-xs text-gray-400 italic">
          {run.fermentation_id
            ? 'Recipe cost not computed — cost columns will show —. Revenue still works.'
            : 'Link a fermentation record to auto-load recipe cost.'}
        </p>
      )}

      {splits.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ tableLayout: 'fixed', minWidth: '400px' }}>
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-gray-500 pb-1.5 font-medium">Package</th>
                  <th className="text-right text-gray-500 pb-1.5 font-medium">Units</th>
                  <th className="text-right text-amber pb-1.5 font-medium">Sale/Unit ($)</th>
                  <th className="text-right text-gray-500 pb-1.5 font-medium">Revenue</th>
                  <th className="text-right text-gray-500 pb-1.5 font-medium">Cost/Unit</th>
                  <th className="text-right text-gray-500 pb-1.5 font-medium">Profit/Unit</th>
                  <th className="text-right text-gray-500 pb-1.5 font-medium">Total Profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-700 truncate pr-1">{r.packageType}</td>
                    <td className="py-1.5 text-right text-gray-600">{r.actualUnits || '—'}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber text-right"
                        value={salePrices[i] ?? ''}
                        onChange={e => setSalePrices(prev => {
                          const next = [...prev]; next[i] = e.target.value; return next
                        })}
                      />
                    </td>
                    <td className="py-1.5 text-right text-gray-700">
                      {r.salePrice > 0 ? fmtDollars(r.revenue) : '—'}
                    </td>
                    <td className="py-1.5 text-right text-gray-500">
                      {r.costPerUnit != null ? fmtDollars(r.costPerUnit) : '—'}
                    </td>
                    <td className={`py-1.5 text-right font-medium ${r.profitPerUnit != null && r.profitPerUnit >= 0 ? 'text-success' : r.profitPerUnit != null ? 'text-danger' : 'text-gray-400'}`}>
                      {r.salePrice > 0 && r.profitPerUnit != null ? fmtDollars(r.profitPerUnit) : '—'}
                    </td>
                    <td className={`py-1.5 text-right font-semibold ${r.totalProfit != null && r.totalProfit >= 0 ? 'text-success' : r.totalProfit != null ? 'text-danger' : 'text-gray-400'}`}>
                      {r.salePrice > 0 ? fmtDollars(r.totalProfit ?? r.revenue) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasRevenue && (
            <p className="text-xs text-gray-400 text-center py-1">
              Enter a sale price per unit to see revenue and profit.
            </p>
          )}

          {hasRevenue && (
            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded px-3 py-2">
                <div className="text-[10px] text-gray-500">Total Revenue</div>
                <div className="font-semibold text-navy text-sm">{fmtDollars(totalRevenue)}</div>
              </div>
              <div className="bg-gray-50 rounded px-3 py-2">
                <div className="text-[10px] text-gray-500">Total Cost</div>
                <div className="font-semibold text-navy text-sm">{cost != null ? fmtDollars(totalCostAll) : '—'}</div>
              </div>
              <div className={`rounded px-3 py-2 ${totalProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="text-[10px] text-gray-500">Total Profit</div>
                <div className={`font-semibold text-sm ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {fmtDollars(totalProfit)}
                </div>
              </div>
              <div className="bg-gray-50 rounded px-3 py-2">
                <div className="text-[10px] text-gray-500">Margin %</div>
                <div className={`font-semibold text-sm ${marginPct != null && marginPct >= 0 ? 'text-success' : 'text-gray-600'}`}>
                  {marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-400 italic">Add package splits above to see profit impact.</p>
      )}
    </div>
  )
}

// ── YieldLossSection ───────────────────────────────────────────────────────────

// Section 3 — computed yield loss display + editable yield loss notes
function YieldLossSection({ run, isReadOnly, saveField, setRun }) {
  const [yieldNotes, setYieldNotes] = useState(run.yield_loss_notes ?? '')

  // Sync local state if the run reloads
  useEffect(() => {
    setYieldNotes(run.yield_loss_notes ?? '')
  }, [run.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const unit         = run.volume_unit || 'barrels'
  const volumeFrom   = parseFloat(run.volume_from_fermenter) || 0
  const totalPkg     = parseFloat(run.total_volume_packaged) || 0
  const yieldLossVol = volumeFrom > 0 && totalPkg > 0 ? volumeFrom - totalPkg : null
  const yieldLossPct = volumeFrom > 0 && totalPkg > 0
    ? Math.round(((volumeFrom - totalPkg) / volumeFrom) * 1000) / 10
    : null

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-base font-bold text-navy">Section 3 — Yield Loss</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Yield loss volume — computed display only */}
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500 mb-0.5">Loss Volume</div>
          <div className="font-semibold text-danger">
            {yieldLossVol !== null ? `${yieldLossVol.toFixed(3)} ${unit}` : '—'}
          </div>
        </div>

        {/* Yield loss percentage — computed display only */}
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500 mb-0.5">Loss %</div>
          <div className="font-semibold text-danger">
            {yieldLossPct !== null ? `${yieldLossPct}%` : '—'}
          </div>
        </div>

        {/* Packaging yield % — inverse of loss */}
        <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500 mb-0.5">Yield %</div>
          <div className={`font-semibold ${
            run.packaging_yield_percentage == null ? 'text-gray-400' :
            run.packaging_yield_percentage >= 85   ? 'text-success' :
            run.packaging_yield_percentage >= 75   ? 'text-amber'   : 'text-danger'
          }`}>
            {run.packaging_yield_percentage != null ? `${run.packaging_yield_percentage}%` : '—'}
          </div>
        </div>

        {/* Volume packaged */}
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500 mb-0.5">Packaged</div>
          <div className="font-semibold text-gray-800">
            {totalPkg > 0 ? `${totalPkg} ${unit}` : '—'}
          </div>
        </div>
      </div>

      {/* Yield loss notes — editable, auto-save on blur */}
      <div>
        <label className={LBL}>Yield Loss Notes</label>
        <textarea
          rows={3}
          className={INPUT_CLS}
          placeholder="Explain losses: trub carry-over, line fill, spillage, sampling, etc."
          value={yieldNotes}
          disabled={isReadOnly}
          onChange={e => setYieldNotes(e.target.value)}
          onBlur={e => {
            const val = e.target.value.trim() || null
            saveField('yield_loss_notes', val)
            setRun(prev => ({ ...prev, yield_loss_notes: val }))
          }}
        />
      </div>
    </section>
  )
}

// ── CostSection ────────────────────────────────────────────────────────────────

// Section 4 — recipe estimated vs actual cost per pint (only shown when recipe cost exists)
function CostSection({ run }) {
  const unit = run.volume_unit || 'barrels'
  const ppu  = pintsPerUnit(unit)

  const volumeFrom   = parseFloat(run.volume_from_fermenter) || 0
  const totalPkg     = parseFloat(run.total_volume_packaged) || 0
  const recipeCost   = parseFloat(run.recipe_cost_per_pint) || 0

  // Actual cost = (recipe_cost_per_pint × volume_from_fermenter × pints_per_unit) / (total_volume_packaged × pints_per_unit)
  const totalProductionCost = recipeCost * (volumeFrom * ppu)
  const computedActualCost  = totalPkg > 0 ? totalProductionCost / (totalPkg * ppu) : null
  const actualCost          = run.actual_cost_per_pint ?? computedActualCost

  const diff = actualCost != null ? actualCost - recipeCost : null
  const yieldPct = run.packaging_yield_percentage

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-base font-bold text-navy">Section 4 — Cost Recalculation</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Recipe estimated cost */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
          <div className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">
            Recipe Estimated
          </div>
          <div className="text-2xl font-bold text-navy">
            {fmtDollars(recipeCost)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">per pint, based on planned volume</div>
        </div>

        {/* Actual cost per pint */}
        <div className={`border rounded-xl px-5 py-4 ${
          diff == null ? 'bg-gray-50 border-gray-200' :
          diff > 0     ? 'bg-red-50 border-red-100'   :
                         'bg-green-50 border-green-100'
        }`}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1 text-gray-600">
            Actual
          </div>
          <div className="text-2xl font-bold text-navy">
            {actualCost != null ? fmtDollars(actualCost) : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">per pint, based on actual yield</div>
        </div>
      </div>

      {/* Variance explanation */}
      {diff != null && yieldPct != null && (
        <div className={`text-sm rounded-lg px-4 py-3 ${diff > 0 ? 'bg-red-50 text-danger' : 'bg-green-50 text-success'}`}>
          Actual cost is <strong>{fmtDollars(Math.abs(diff))}</strong> {diff > 0 ? 'higher' : 'lower'} than
          estimated due to a <strong>{yieldPct}%</strong> packaging yield.
        </div>
      )}

      {/* Explanation of calculation */}
      <div className="text-xs text-gray-400 leading-relaxed">
        Calculation: Total production cost = recipe cost × (volume from fermenter × {ppu.toFixed(2)} pints/{unit.replace('s', '')}).
        Actual cost per pint = total production cost ÷ (volume packaged × {ppu.toFixed(2)} pints/{unit.replace('s', '')}).
      </div>
    </section>
  )
}

// ── QualityControlSection ──────────────────────────────────────────────────────

// Section 5 — QC checks table + add QC check modal trigger
function QualityControlSection({ run, qcChecks, isReadOnly, qcModalOpen, setQcModalOpen, onQcSaved, brewery }) {
  // Delete a single QC check after confirmation
  async function handleDeleteQc(checkId) {
    if (!window.confirm('Delete this QC check?')) return
    await supabase.from('packaging_quality_checks').delete().eq('id', checkId)
    onQcSaved() // reloads the list
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">Section 5 — Quality Control</h2>
        {!isReadOnly && (
          <button
            onClick={() => setQcModalOpen(true)}
            className="bg-navy text-white font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-navy/80 transition-colors"
          >
            + Add QC Check
          </button>
        )}
      </div>

      {qcChecks.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center text-gray-400 text-sm">
          No QC checks recorded yet. Click "+ Add QC Check" to log one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Checked By', 'Clarity', 'Carbonation', 'ABV', 'pH', 'Result', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {qcChecks.map(chk => (
                <tr key={chk.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(chk.check_date)}</td>
                  <td className="px-3 py-2 text-gray-700">{chk.checked_by || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{chk.clarity || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{chk.carbonation_level || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {chk.abv_measured != null ? `${chk.abv_measured}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {chk.ph_measured != null ? chk.ph_measured : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {chk.passed_qc === true && (
                      <span className="bg-green-100 text-success text-xs font-bold px-2 py-0.5 rounded-full">Pass</span>
                    )}
                    {chk.passed_qc === false && (
                      <span className="bg-red-100 text-danger text-xs font-bold px-2 py-0.5 rounded-full">Fail</span>
                    )}
                    {chk.passed_qc == null && (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!isReadOnly && (
                      <button
                        onClick={() => handleDeleteQc(chk.id)}
                        className="text-danger text-xs hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add QC Check modal */}
      {qcModalOpen && (
        <AddQCCheckModal
          run={run}
          brewery={brewery}
          onClose={() => setQcModalOpen(false)}
          onSaved={onQcSaved}
        />
      )}
    </section>
  )
}

// ── AddQCCheckModal ────────────────────────────────────────────────────────────

function AddQCCheckModal({ run, brewery, onClose, onSaved }) {
  const DRAFT_KEY = `modal_draft_packaging_qc_${run.id}`
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft(DRAFT_KEY)

  const defaultForm = {
    check_date:         todayStr(),
    checked_by:         '',
    clarity:            CLARITY_OPTIONS[0],
    clarity_notes:      '',
    carbonation_level:  CARBONATION_OPTIONS[1],
    carbonation_notes:  '',
    appearance_notes:   '',
    aroma_notes:        '',
    flavor_notes:       '',
    abv_measured:       '',
    abv_method:         ABV_METHODS[0],
    ph_measured:        '',
    passed_qc:          true,
    qc_notes:           '',
  }

  const [form, setForm] = useState(() => {
    const draft = loadDraft(false)
    return draft?.form ?? defaultForm
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  useEffect(() => {
    console.log('[AddQCCheckModal] ModalShell + useModalDraft active')
  }, [])

  function set(field, val) {
    const next = { ...form, [field]: val }
    setForm(next)
    saveDraft({ form: next })
  }

  // Insert the QC check record then close the modal
  async function handleSave() {
    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('packaging_quality_checks').insert({
      packaging_run_id:   run.id,
      brewery_id:         brewery.id,
      check_date:         form.check_date        || null,
      checked_by:         form.checked_by        || null,
      clarity:            form.clarity           || null,
      clarity_notes:      form.clarity_notes     || null,
      appearance_notes:   form.appearance_notes  || null,
      carbonation_level:  form.carbonation_level || null,
      carbonation_notes:  form.carbonation_notes || null,
      aroma_notes:        form.aroma_notes       || null,
      flavor_notes:       form.flavor_notes      || null,
      abv_measured:       form.abv_measured      !== '' ? parseFloat(form.abv_measured) : null,
      abv_method:         form.abv_method        || null,
      ph_measured:        form.ph_measured       !== '' ? parseFloat(form.ph_measured)  : null,
      passed_qc:          form.passed_qc,
      qc_notes:           form.qc_notes          || null,
    })

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    clearDraft()
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Add QC Check"
      maxWidth="max-w-2xl"
      isDirty={!!form.checked_by}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <div className="space-y-4">
        {error && <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Check date */}
          <div>
            <label className={LBL}>Check Date</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={form.check_date}
              onChange={e => set('check_date', e.target.value)}
            />
          </div>

          {/* Checked by */}
          <div>
            <label className={LBL}>Checked By</label>
            <input
              type="text"
              className={INPUT_CLS}
              placeholder="Name or initials"
              value={form.checked_by}
              onChange={e => set('checked_by', e.target.value)}
            />
          </div>

          {/* Clarity */}
          <div>
            <label className={LBL}>Clarity</label>
            <select className={INPUT_CLS} value={form.clarity} onChange={e => set('clarity', e.target.value)}>
              {CLARITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Carbonation level */}
          <div>
            <label className={LBL}>Carbonation Level</label>
            <select className={INPUT_CLS} value={form.carbonation_level} onChange={e => set('carbonation_level', e.target.value)}>
              {CARBONATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* ABV measured */}
          <div>
            <label className={LBL}>ABV Measured (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className={INPUT_CLS}
              placeholder="e.g. 6.5"
              value={form.abv_measured}
              onChange={e => set('abv_measured', e.target.value)}
            />
          </div>

          {/* ABV method */}
          <div>
            <label className={LBL}>ABV Method</label>
            <select className={INPUT_CLS} value={form.abv_method} onChange={e => set('abv_method', e.target.value)}>
              {ABV_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* pH measured */}
          <div>
            <label className={LBL}>pH Measured</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="14"
              className={INPUT_CLS}
              placeholder="e.g. 4.2"
              value={form.ph_measured}
              onChange={e => set('ph_measured', e.target.value)}
            />
          </div>

          {/* Passed QC toggle */}
          <div className="flex items-center gap-3 pt-5">
            <input
              type="checkbox"
              id="passed-qc"
              checked={form.passed_qc}
              onChange={e => set('passed_qc', e.target.checked)}
              className="w-4 h-4 accent-amber"
            />
            <label htmlFor="passed-qc" className="text-sm text-gray-700 font-medium">
              Passed QC
            </label>
          </div>
        </div>

        {/* Clarity notes */}
        <div>
          <label className={LBL}>Clarity Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            placeholder="Visual description of the beer's clarity…"
            value={form.clarity_notes}
            onChange={e => set('clarity_notes', e.target.value)}
          />
        </div>

        {/* Carbonation notes */}
        <div>
          <label className={LBL}>Carbonation Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            placeholder="Pour behavior, head retention, mouthfeel…"
            value={form.carbonation_notes}
            onChange={e => set('carbonation_notes', e.target.value)}
          />
        </div>

        {/* Appearance notes */}
        <div>
          <label className={LBL}>Appearance Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            placeholder="Color, particulate, head…"
            value={form.appearance_notes}
            onChange={e => set('appearance_notes', e.target.value)}
          />
        </div>

        {/* Aroma notes */}
        <div>
          <label className={LBL}>Aroma Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            placeholder="Hop character, malt, esters, off-aromas…"
            value={form.aroma_notes}
            onChange={e => set('aroma_notes', e.target.value)}
          />
        </div>

        {/* Flavor notes */}
        <div>
          <label className={LBL}>Flavor Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            placeholder="Balance, bitterness, finish, any off-flavors…"
            value={form.flavor_notes}
            onChange={e => set('flavor_notes', e.target.value)}
          />
        </div>

        {/* General QC notes */}
        <div>
          <label className={LBL}>QC Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            placeholder="Overall assessment, any actions needed…"
            value={form.qc_notes}
            onChange={e => set('qc_notes', e.target.value)}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save QC Check'}
          </button>
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── NotesSection ───────────────────────────────────────────────────────────────

// Section 6 — general run notes (auto-save on blur)
function NotesSection({ run, isReadOnly, saveField, setRun }) {
  const [notes, setNotes] = useState(run.notes ?? '')

  // Sync local state if the run reloads
  useEffect(() => {
    setNotes(run.notes ?? '')
  }, [run.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <h2 className="text-base font-bold text-navy">Section 6 — Notes</h2>

      <div>
        <label className={LBL}>General Run Notes</label>
        <textarea
          rows={5}
          className={INPUT_CLS}
          placeholder="Anything else worth recording about this packaging run: equipment observations, crew notes, timeline, next steps…"
          value={notes}
          disabled={isReadOnly}
          onChange={e => setNotes(e.target.value)}
          onBlur={e => {
            const val = e.target.value.trim() || null
            saveField('notes', val)
            setRun(prev => ({ ...prev, notes: val }))
          }}
        />
      </div>
    </section>
  )
}
