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
  calculateLaborCost,
  calculateUtilitiesCost,
  calculateTotalProductionCost,
  calculateCostPerBarrel,
  calculateCostPerPint,
  calculateSuggestedRetail,
  convertToBarrels,
} from '../recipes/recipeUtils'

// ── Shared CSS helpers ──────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

// ── Static constants ────────────────────────────────────────────────────────────

const PACKAGE_TYPES = [
  'Can 12oz', 'Can 16oz', 'Bottle 12oz', 'Bottle 22oz', 'Bottle 750ml',
  'Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel',
  'Growler 64oz', 'Crowler 32oz',
  '4-Pack (Cans)', '6-Pack (Cans)', '12-Pack (Cans)', '24-Pack / Case (Cans)',
  'Taproom Draft', 'Draft/Taproom', 'Barrel', 'Other',
]

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

// Normalize a planned split regardless of whether it came from the recipe builder
// (which uses container_type / volume_barrels / container_size_label / packaging_yield)
// or from a previous packaging run (which uses package_type / total_volume).
//
// For recipe splits, volume_barrels is the GROSS volume and packaging_yield (0-100) gives
// the net packagable fraction. Units stored in the split were calculated from net volume,
// so total_volume is set to the net value to keep everything consistent:
//   net_volume = volume_barrels × (packaging_yield / 100)
//
// container_size_label stores values like "16oz pour", "12oz", "1/2 bbl (15.5 gal)".
// When the label starts with a number followed by "oz" we parse that as oz-per-unit.
function normalizePlannedSplit(p) {
  // Prefer explicit volume_per_unit; otherwise try to parse oz from the size label
  let volumePerUnit = p.volume_per_unit ?? null
  if (volumePerUnit == null && p.container_size_label) {
    const match = String(p.container_size_label).match(/^(\d+(?:\.\d+)?)\s*oz/i)
    if (match) volumePerUnit = parseFloat(match[1])
  }

  // Compute net packagable volume from gross × yield%, when both are present.
  // Falls back to total_volume (native packaging run format) or gross volume as-is.
  const grossVolume    = parseFloat(p.total_volume ?? p.volume_barrels) || null
  const packagingYield = parseFloat(p.packaging_yield) || null
  const netVolume      = grossVolume != null && packagingYield != null
    ? grossVolume * (packagingYield / 100)
    : null
  const totalVolume    = netVolume ?? grossVolume

  return {
    package_type:         p.package_type || p.container_type || '',
    units:                p.units        ?? null,
    total_volume:         totalVolume,
    gross_volume:         grossVolume,
    net_volume:           netVolume,
    packaging_yield:      packagingYield,
    volume_per_unit:      volumePerUnit,
    container_size_label: p.container_size_label ?? null,
  }
}

// Auto-fill volume_per_unit for standard package types.
// Kegs and multi-packs store bbl/unit; cans, bottles, growlers, and draft store oz/unit.
const PKG_TYPE_DEFAULTS = {
  // Keg formats — bbl per unit
  'Keg Half Barrel':        '0.5',
  'Keg Quarter Barrel':     '0.25',
  'Keg Sixth Barrel':       '0.167',
  // Can / bottle formats — oz per unit
  'Can 12oz':               '12',
  'Can 16oz':               '16',
  'Bottle 12oz':            '12',
  'Bottle 22oz':            '22',
  'Bottle 750ml':           '25.36',   // 750 ml ≈ 25.36 oz
  // Small containers — oz per unit
  'Growler 64oz':           '64',
  'Crowler 32oz':           '32',
  'Draft/Taproom':          '16',      // 16 oz pour
  // Multi-pack formats — bbl per pack (each pack contains N × 12oz cans)
  '4-Pack (Cans)':          String((4  * 12 / 3968).toFixed(5)),
  '6-Pack (Cans)':          String((6  * 12 / 3968).toFixed(5)),
  '12-Pack (Cans)':         String((12 * 12 / 3968).toFixed(5)),
  '24-Pack / Case (Cans)':  String((24 * 12 / 3968).toFixed(5)),
}

// Return a human-readable unit label for the volume_per_unit column based on
// package type — kegs display "bbl/unit", multi-packs "bbl/pack", small containers "oz/unit".
function volumePerUnitLabel(packageType) {
  if (!packageType) return ''
  const pt = packageType.toLowerCase()
  if (pt.includes('pack') || pt.includes('case')) return 'bbl/pack'
  // Draft/Taproom uses oz/unit (16 oz serving), other taproom/draft/keg formats use bbl/unit
  if (packageType === 'Draft/Taproom') return 'oz/unit'
  if (pt.includes('keg') || pt === 'barrel' || pt.includes('taproom') || pt.includes('draft')) return 'bbl/unit'
  if (pt.includes('can') || pt.includes('bottle') || pt.includes('growler') || pt.includes('crowler')) return 'oz/unit'
  return 'unit'
}

// Return pints per individual unit based on package type and volume_per_unit.
// volume_per_unit is in barrels for kegs/packs, in oz for cans/bottles.
function pintsPerSplitUnit(packageType, volumePerUnit) {
  const vpu = parseFloat(volumePerUnit) || 0
  if (vpu === 0) return 0
  const label = volumePerUnitLabel(packageType)
  if (label === 'bbl/unit' || label === 'bbl/pack') return vpu * PINTS_PER_BARREL
  if (label === 'oz/unit')  return vpu / 16
  return vpu * PINTS_PER_BARREL // fallback
}

// Calculate total volume in barrels from actualUnits × volPerUnit.
// unitLabel drives the conversion: oz→bbl divides by 3968, gal→bbl divides by 31,
// bbl-labelled values are a direct product, and anything else is treated as bbl.
function calcTotalVolume(actualUnits, volPerUnit, unitLabel) {
  if (!actualUnits || !volPerUnit || actualUnits === 0) return 0
  const units = Number(actualUnits)
  const vol   = Number(volPerUnit)
  if (!units || !vol) return 0
  const label = (unitLabel || '').toLowerCase()
  if (label.includes('oz'))  return (units * vol) / 3968        // oz → barrels
  if (label.includes('bbl')) return  units * vol                 // already barrels
  if (label.includes('gal')) return (units * vol) / 31          // gallons → barrels
  return units * vol
}

// Derive unit count from a volume-in-barrels value and a per-unit size in oz.
// Used when planned_splits don't carry an explicit unit count.
function unitsFromVolume(volumeBarrels, ozPerUnit) {
  if (!volumeBarrels || !ozPerUnit) return 0
  return Math.floor((volumeBarrels * 3968) / ozPerUnit)
}

// Derive unit count from a volume-in-barrels value and a per-unit size in bbl.
// Used for keg splits (half / quarter / sixth barrel).
function unitsFromVolumeKeg(volumeBarrels, bblPerKeg) {
  if (!volumeBarrels || !bblPerKeg) return 0
  return Math.floor(volumeBarrels / bblPerKeg)
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

            // Packaging cost from recipe's packaging_splits
            const pkgSplits = Array.isArray(recipe.packaging_splits) ? recipe.packaging_splits : []
            const pkgCost = pkgSplits.reduce((sum, split) => {
              return sum + calculatePackagingCostPerBatch(
                parseFloat(split.volume_barrels) || 0,
                parseFloat(split.packaging_yield) || 85,
                split.container_type || '',
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

    if (!window.confirm('Mark this packaging run as complete? This will create a distribution record.')) return

    setCompleting(true)
    setCompleteMsg(null)

    // Step 1: insert the batch_packages record
    const totalVolPackaged = actualSplits.reduce((sum, s) => {
      const lbl = volumePerUnitLabel(s.package_type)
      return sum + calcTotalVolume(s.units_packaged, s.volume_per_unit, lbl)
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
  // actualSplits mirrors run.actual_splits but is editable locally before saving.
  // Pre-populate from planned_splits (normalised to handle both recipe and native formats).
  const [actualSplits, setActualSplits] = useState(() => {
    if (run.actual_splits && run.actual_splits.length > 0) return run.actual_splits
    return (run.planned_splits || []).map(p => {
      const norm = normalizePlannedSplit(p)

      // Derive volume_per_unit: use explicit value, then PKG_TYPE_DEFAULTS, then total/units
      let volumePerUnit = norm.volume_per_unit != null ? String(norm.volume_per_unit) : ''
      if (!volumePerUnit) {
        const defaultVol = PKG_TYPE_DEFAULTS[norm.package_type]
        if (defaultVol) {
          volumePerUnit = defaultVol
        } else if (norm.total_volume != null && norm.units != null && parseFloat(norm.units) > 0) {
          volumePerUnit = (parseFloat(norm.total_volume) / parseFloat(norm.units)).toFixed(6)
        }
      }

      // Compute total_volume (in barrels) from units × volume_per_unit when both are available;
      // uses calcTotalVolume so oz-based types (cans, bottles) are correctly converted to bbl.
      // When planned_splits don't carry an explicit unit count, derive it from total_volume.
      let unitsStr = norm.units != null ? String(norm.units) : ''
      if (!unitsStr && norm.total_volume != null && volumePerUnit) {
        const lbl = volumePerUnitLabel(norm.package_type)
        let derived = 0
        if (lbl.includes('oz')) {
          derived = unitsFromVolume(parseFloat(norm.total_volume), parseFloat(volumePerUnit))
        } else if (lbl.includes('bbl')) {
          derived = unitsFromVolumeKeg(parseFloat(norm.total_volume), parseFloat(volumePerUnit))
        }
        if (derived > 10000) {
          console.warn('[SplitsSection] derived unit count exceeds sanity threshold — capping at 10 000',
            { derived, total_volume: norm.total_volume, volumePerUnit, package_type: norm.package_type })
          derived = 10000
        }
        if (derived > 0) unitsStr = String(derived)
      }

      let totalVol = ''
      if (unitsStr && volumePerUnit) {
        const lbl     = volumePerUnitLabel(norm.package_type)
        const computed = calcTotalVolume(unitsStr, volumePerUnit, lbl)
        totalVol = computed > 0 ? computed.toFixed(4) : ''
      } else if (norm.total_volume != null) {
        totalVol = String(norm.total_volume)
      }

      return {
        package_type:    norm.package_type,
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

  // Update a field in one actual split row; auto-fills volume_per_unit for known
  // package types, recalculates units_packaged from total_volume on type change,
  // and recomputes total_volume when quantity fields change.
  function updateSplit(index, field, value) {
    setActualSplits(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      // When the package type is selected, auto-fill a default volume_per_unit and
      // recalculate units_packaged from the existing total_volume if available.
      if (field === 'package_type') {
        const defaultVol = PKG_TYPE_DEFAULTS[value]
        if (defaultVol) {
          next[index].volume_per_unit = defaultVol
          // Recalculate units from existing total_volume (in bbl) if available.
          // For oz-based types the formula inverts: units = total_bbl × 3968 / oz_per_unit
          const tv  = parseFloat(next[index].total_volume) || 0
          const vpu = parseFloat(defaultVol)
          const lbl = volumePerUnitLabel(value)
          if (tv > 0 && vpu > 0) {
            const units = lbl.includes('oz')
              ? Math.round((tv * 128 * 31) / vpu)
              : Math.round(tv / vpu)
            if (units > 0) next[index].units_packaged = String(units)
          }
        }
      }
      // Auto-compute total_volume (in barrels) when units or volume_per_unit change.
      // calcTotalVolume handles the oz→bbl conversion for can/bottle/growler types.
      if (field === 'units_packaged' || field === 'volume_per_unit') {
        const units = parseFloat(field === 'units_packaged' ? value : next[index].units_packaged) || 0
        const vol   = parseFloat(field === 'volume_per_unit' ? value : next[index].volume_per_unit) || 0
        const lbl   = volumePerUnitLabel(next[index].package_type)
        const tv    = calcTotalVolume(units, vol, lbl)
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
        { package_type: '', units_packaged: '', volume_per_unit: '', total_volume: '', destination: '', notes: '', _fromPlan: false },
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
    setSplitSaveStatus('pending')
    clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      saveSplitsData(newSplits)
    }, 500)
  }

  // Save all actual_splits plus recomputed totals in one DB update
  // splitsToSave: the array of splits to persist (passed explicitly for debounce correctness)
  async function saveSplitsData(splitsToSave) {
    setSaving(true)
    setSplitError(null)

    // Build the normalized array to persist
    const toSave = splitsToSave.map(s => ({
      package_type:    s.package_type    || '',
      units_packaged:  s.units_packaged  !== '' ? parseFloat(s.units_packaged)  : null,
      volume_per_unit: s.volume_per_unit !== '' ? parseFloat(s.volume_per_unit) : null,
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
              <col style={{ width: isReadOnly ? '18%' : '12%' }} />  {/* Notes */}
              {!isReadOnly && <col style={{ width: '6%' }} />}        {/* Remove */}
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
                {!isReadOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actualSplits.map((s, i) => {
                // Normalize the planned split for this row to handle both recipe
                // format (container_type / volume_barrels) and native format.
                const planned = plannedSplits[i] ? normalizePlannedSplit(plannedSplits[i]) : null
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    {/* Package type — readonly if matched to a plan row */}
                    <td className="px-3 py-2">
                      {s._fromPlan && planned ? (
                        <span className="text-gray-700 font-medium">{s.package_type}</span>
                      ) : (
                        <select
                          className={INPUT_CLS}
                          value={s.package_type}
                          disabled={isReadOnly}
                          onChange={e => updateSplit(i, 'package_type', e.target.value)}
                        >
                          <option value="">— Select —</option>
                          {PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
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
                        disabled={isReadOnly}
                        onChange={e => updateSplit(i, 'units_packaged', e.target.value)}
                      />
                    </td>

                    {/* Volume per unit — unit label shown below input */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        className={INPUT_CLS}
                        placeholder="0"
                        value={s.volume_per_unit}
                        disabled={isReadOnly}
                        onChange={e => updateSplit(i, 'volume_per_unit', e.target.value)}
                      />
                      <span className="text-[10px] text-gray-400 mt-0.5 block text-center">
                        {volumePerUnitLabel(s.package_type) || unit}
                      </span>
                      {s.package_type && !PKG_TYPE_DEFAULTS[s.package_type] && !isReadOnly && (
                        <span className="text-[10px] text-amber block text-center leading-tight mt-0.5">
                          Volume per unit not recognized — please enter manually.
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
                        onChange={e => updateSplit(i, 'notes', e.target.value)}
                      />
                    </td>

                    {/* Remove button — only for extra (non-plan) rows */}
                    {!isReadOnly && (
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
      {!isReadOnly && (
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
    const ppu           = pintsPerSplitUnit(s.package_type, s.volume_per_unit)
    const costPerUnit   = cost != null ? cost * ppu : null
    const profitPerUnit = costPerUnit != null ? salePrice - costPerUnit : null
    const revenue       = actualUnits * salePrice
    const totalCost     = costPerUnit  != null ? actualUnits * costPerUnit   : null
    const totalProfit   = profitPerUnit != null ? actualUnits * profitPerUnit : null
    return { packageType: s.package_type || '—', actualUnits, salePrice, costPerUnit, profitPerUnit, revenue, totalCost, totalProfit }
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
