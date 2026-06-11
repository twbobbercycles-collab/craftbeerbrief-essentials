/**
 * RecipeDetailPage — full recipe editor with live cost calculator.
 * URL: /recipes/:id
 *
 * Layout (desktop): main ingredient editor on the left, sticky cost panel on the right.
 * Layout (mobile):  full-width editor, cost panel collapses to a bottom sheet triggered
 *                   by a sticky "Calculate Cost" button at the bottom of the screen.
 *
 * All cost math is imported from recipeUtils.js — no inline calculations here.
 */
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import ModalShell from '../../components/ModalShell'
import { useReadOnly } from '../../hooks/useReadOnly'
import { useModalDraft } from '../../hooks/useModalDraft'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import {
  convertToBarrels,
  calculateScaledAmount, calculateTotalIngredientCost,
  calculatePackagingCostPerBatch, calculateUnitsProduced, pintsPerContainer,
  calculateLaborCost, calculateUtilitiesCost, calculateTotalProductionCost,
  calculateCostPerBarrel, calculateCostPerPint,
  calculateSuggestedRetail, calculateTaxInclusivePrice, calculateGrossMargin,
  formatDollars, formatPct,
} from './recipeUtils'
import WaterChemistryTab from './WaterChemistryTab'

// State abbreviation lookup — brewery.state is stored as a full name (e.g. "California")
const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI',
  'Wyoming': 'WY', 'District of Columbia': 'DC',
}

// Base state sales tax rates by 2-letter code (state-level only — local rates vary)
const STATE_SALES_TAX = {
  'AL': 4.0, 'AK': 0.0, 'AZ': 5.6, 'AR': 6.5, 'CA': 7.25,
  'CO': 2.9, 'CT': 6.35, 'DE': 0.0, 'FL': 6.0, 'GA': 4.0,
  'HI': 4.0, 'ID': 6.0, 'IL': 6.25, 'IN': 7.0, 'IA': 6.0,
  'KS': 6.5, 'KY': 6.0, 'LA': 4.45, 'ME': 5.5, 'MD': 6.0,
  'MA': 6.25, 'MI': 6.0, 'MN': 6.875, 'MS': 7.0, 'MO': 4.225,
  'MT': 0.0, 'NE': 5.5, 'NV': 6.85, 'NH': 0.0, 'NJ': 6.625,
  'NM': 4.875, 'NY': 4.0, 'NC': 4.75, 'ND': 5.0, 'OH': 5.75,
  'OK': 4.5, 'OR': 0.0, 'PA': 6.0, 'RI': 7.0, 'SC': 6.0,
  'SD': 4.5, 'TN': 7.0, 'TX': 6.25, 'UT': 5.95, 'VT': 6.0,
  'VA': 5.3, 'WA': 6.5, 'WV': 6.0, 'WI': 5.0, 'WY': 4.0, 'DC': 6.0,
}

const FEDERAL_EXCISE_TAX_RATES = {
  SMALL_BREWER: 3.50,   // Under 2 million barrels annual production
  STANDARD:     16.00,  // Over 2 million barrels (essentially no craft brewery)
  THRESHOLD_BARRELS: 60000,
}

// Container type options — simplified names, synced with 016 migration constraint.
// Default volume for unit count estimates uses the most common size per type.
const CONTAINER_TYPES = [
  'Can', 'Bottle', 'Growler', 'Crowler',
  'Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel',
]

// The ordered list of addition type sections shown in the ingredient editor
const ADDITION_TYPES = [
  'Mash','Boil','Whirlpool','Dry Hop',
  'Fermentation','Conditioning','Packaging','Other',
]

// Addition time is only relevant for timed-addition types
const TIMED_ADDITION_TYPES = ['Boil', 'Whirlpool', 'Dry Hop']

// Unit options grouped by category for <optgroup> selects
const UNIT_GROUPS = [
  { label: 'Weight',           options: ['lb', 'oz', 'g', 'kg'] },
  { label: 'Volume — Liquid',  options: ['ml', 'L', 'fl oz', 'Gallon', 'Barrel'] },
  { label: 'Volume — Dry',     options: ['cup', 'quart'] },
  { label: 'Count',            options: ['packet', 'unit', 'each'] },
  { label: 'Other',            options: ['pinch', 'tsp', 'tbsp'] },
]

// ─── safeParse helper ─────────────────────────────────────────────────────────
// Parses a numeric field value for Supabase saves.
// Returns `fallback` when the value is empty/null/undefined or not a valid number.
// Critically, parseFloat('0') returns 0 (NOT the fallback), so users can zero-out fields.
function safeParse(val, fallback) {
  if (val === '' || val === null || val === undefined) return fallback
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}

// ─── Unit cost conversion when switching units ────────────────────────────────
// Returns { cost: number, warning: boolean } or the original cost string if no conversion is possible.
function convertCostPerUnit(cost, fromUnit, toUnit) {
  if (!cost || fromUnit === toUnit || !fromUnit || !toUnit) return cost
  const numCost = parseFloat(cost)
  if (isNaN(numCost) || numCost === 0) return cost

  const weightToGrams = { 'g': 1, 'oz': 28.3495, 'lb': 453.592, 'kg': 1000 }
  const volumeToMl = {
    'ml': 1, 'fl oz': 29.5735, 'qt': 946.353, 'quart': 946.353,
    'pint': 473.176, 'L': 1000, 'liter': 1000,
    'Gallon': 3785.41, 'gallon': 3785.41,
    'Barrel': 117347, 'bbl': 117347,
    'cup': 236.588, 'tsp': 4.929, 'tbsp': 14.787,
  }
  const countUnits = ['each', 'packet', 'unit', 'tablet', 'bag', 'box', 'case', 'bundle', 'sheet', 'roll', 'other', 'pinch']

  if (countUnits.includes(fromUnit) || countUnits.includes(toUnit)) {
    return { cost: numCost, warning: true }
  }
  if (weightToGrams[fromUnit] !== undefined && weightToGrams[toUnit] !== undefined) {
    const costPerGram = numCost / weightToGrams[fromUnit]
    return { cost: parseFloat((costPerGram * weightToGrams[toUnit]).toFixed(6)), warning: false }
  }
  if (volumeToMl[fromUnit] !== undefined && volumeToMl[toUnit] !== undefined) {
    const costPerMl = numCost / volumeToMl[fromUnit]
    return { cost: parseFloat((costPerMl * volumeToMl[toUnit]).toFixed(6)), warning: false }
  }
  return { cost: numCost, warning: true }
}

// ─── Amount conversion when switching units ──────────────────────────────────
// Returns { amount: number, warning: boolean } — warning true when units are
// incompatible (cross weight/volume, or count units).
function convertAmount(amount, fromUnit, toUnit) {
  if (!amount || fromUnit === toUnit || !fromUnit || !toUnit) return { amount, warning: false }
  const num = parseFloat(amount)
  if (isNaN(num) || num === 0) return { amount, warning: false }

  const weightToGrams = { 'g': 1, 'oz': 28.3495, 'lb': 453.592, 'kg': 1000 }
  const volumeToMl = {
    'ml': 1, 'fl oz': 29.5735, 'qt': 946.353, 'quart': 946.353,
    'pint': 473.176, 'L': 1000, 'liter': 1000,
    'Gallon': 3785.41, 'gallon': 3785.41,
    'Barrel': 117347, 'bbl': 117347,
    'cup': 236.588, 'tsp': 4.929, 'tbsp': 14.787,
  }
  const countUnits = ['each', 'packet', 'unit', 'tablet', 'bag', 'box', 'case', 'bundle', 'sheet', 'roll', 'other', 'pinch']

  if (countUnits.includes(fromUnit) || countUnits.includes(toUnit)) {
    return { amount: num, warning: true }
  }
  if (weightToGrams[fromUnit] !== undefined && weightToGrams[toUnit] !== undefined) {
    const inGrams = num * weightToGrams[fromUnit]
    return { amount: parseFloat((inGrams / weightToGrams[toUnit]).toFixed(4)), warning: false }
  }
  if (volumeToMl[fromUnit] !== undefined && volumeToMl[toUnit] !== undefined) {
    const inMl = num * volumeToMl[fromUnit]
    return { amount: parseFloat((inMl / volumeToMl[toUnit]).toFixed(4)), warning: false }
  }
  return { amount: num, warning: true }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RecipeDetailPage() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const { brewery }     = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  const [recipe, setRecipe]   = useState(null)
  const [lines, setLines]     = useState([])   // recipe_ingredient rows (enriched with ingredient + supplier joins)
  const [library, setLibrary] = useState([])   // brewery ingredient library (for autocomplete)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Current batch size (local — decoupled from the stored base batch size)
  const [batchSize, setBatchSize] = useState('')

  // Packaging splits — array of { container_type, percentage, container_size,
  // packaging_cost_per_unit, label_cost_per_unit, carrier_cost_per_unit, packaging_yield }
  const [packagingSplits, setPackagingSplits] = useState([])

  // Cost calculator fields — all stored in the recipes row, editable inline
  const [packagingContainerType, setPackagingContainerType] = useState('')
  const [packagingCostPerUnit,   setPackagingCostPerUnit]   = useState('0')
  const [labelCostPerUnit,       setLabelCostPerUnit]       = useState('0')
  const [carrierCostPerUnit,     setCarrierCostPerUnit]     = useState('0')
  const [packagingYieldPct,      setPackagingYieldPct]      = useState('85')
  const [brewHours,              setBrewHours]              = useState('0')
  const [laborRatePerHour,       setLaborRatePerHour]       = useState('0')
  const [utilitiesCostPerBarrel, setUtilitiesCostPerBarrel]     = useState('10')
  const [cleaningCostPerBatch,   setCleaningCostPerBatch]       = useState('15')
  const [waterCostPerBarrel,     setWaterCostPerBarrel]         = useState('0.50')
  const [wastewaterCostPerBarrel,setWastewaterCostPerBarrel]    = useState('0.30')
  const [fixedOverheadPct,       setFixedOverheadPct]           = useState('15')
  const [marginPct,              setMarginPct]              = useState('65')
  const [taxRate,                setTaxRate]                = useState('0')
  const [exciseTaxRatePerBbl,    setExciseTaxRatePerBbl]    = useState(3.50)

  // Expanded labor & overhead — saved to brewery profile
  const [brewers,               setBrewers]               = useState('2')
  const [brewHoursPerBrewer,    setBrewHoursPerBrewer]    = useState('8')
  const [packagingHours,        setPackagingHours]        = useState('4')
  const [packagingLaborRate,    setPackagingLaborRate]    = useState('16')
  const [monthlyFixedOverhead,  setMonthlyFixedOverhead]  = useState('')
  const [batchesPerMonth,       setBatchesPerMonth]       = useState('4')
  const [variableOverheadPerBbl, setVariableOverheadPerBbl] = useState('15')

  // Inline name editing
  const [editingName, setEditingName]   = useState(false)
  const [nameVal, setNameVal]           = useState('')

  // Auto-save status indicator — 'saving' | 'saved' | 'error'
  const [autoSaveStatus, setAutoSaveStatus] = useState('saved')

  // Active tab: 'ingredients' | 'cost' | 'water' | 'history' — persisted per recipe
  const [activeTab, setActiveTab] = usePersistedTab(`recipe_tab_${id}`, 'ingredients')

  // Inventory / brew-check panel
  const [brewCheckOpen, setBrewCheckOpen] = useState(false)
  const [brewCheckResults, setBrewCheckResults] = useState([])

  // Version control state
  const [hasBrewed,          setHasBrewed]          = useState(false)
  const [versionHistory,     setVersionHistory]      = useState([])   // all recipes in this version family
  const [versionHistoryOpen, setVersionHistoryOpen]  = useState(() => searchParams.get('versions') === '1')
  const [saveVersionOpen,    setSaveVersionOpen]     = useState(false)
  const [versionNotes,       setVersionNotes]        = useState('')
  const [versionSaving,      setVersionSaving]       = useState(false)
  const [versionError,       setVersionError]        = useState('')
  const [compareOpen,        setCompareOpen]         = useState(false)
  const [compareIdA,         setCompareIdA]          = useState('')
  const [compareIdB,         setCompareIdB]          = useState('')
  const [compareData,        setCompareData]         = useState(null)  // { a: {recipe, lines}, b: {recipe, lines} }
  const [compareLoading,     setCompareLoading]      = useState(false)

  // Autocomplete state — tracks which line's name input is active
  const [acLineId, setAcLineId]   = useState(null)
  const [acQuery, setAcQuery]     = useState('')
  const [acResults, setAcResults] = useState([])
  const acTimer = useRef(null)

  // Tracks which addition type is receiving a new line being composed
  const [addingTo, setAddingTo]         = useState(null)  // addition_type string | null
  const [newLineForm, setNewLineForm]    = useState(emptyNewLine('Mash'))
  const [newLineError, setNewLineError] = useState('')
  const [newLineSaving, setNewLineSaving] = useState(false)

  // Edit ingredient modal state
  const [editIngredientTarget, setEditIngredientTarget] = useState(null)
  const [editLineForm, setEditLineForm]                 = useState(null)
  const [editLineSaving, setEditLineSaving]             = useState(false)
  const [editLineError, setEditLineError]               = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!id || !brewery?.id) return
    setLoading(true)

    const [recipeResult, linesResult, libResult, brewedResult] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id).single(),
      supabase.from('recipe_ingredients')
        .select('*, ingredient:ingredients(id,name,category,unit,current_price_per_unit,ingredient_suppliers(*)), supplier:ingredient_suppliers(id,supplier_name,price_per_unit,is_preferred)')
        .eq('recipe_id', id)
        .order('sort_order'),
      supabase.from('ingredients')
        .select('*, ingredient_suppliers(*)')
        .eq('brewery_id', brewery.id)
        .order('category').order('name'),
      supabase.from('brew_days').select('id', { count: 'exact', head: true })
        .eq('brewery_id', brewery.id)
        .eq('recipe_id', id),
    ])

    if (recipeResult.error || !recipeResult.data) {
      setError('Recipe not found.')
      setLoading(false)
      return
    }

    const r = recipeResult.data
    setHasBrewed((brewedResult.count ?? 0) > 0)

    // Load all versions in this recipe's family (same root parent or is the root)
    const rootId = r.parent_recipe_id ?? r.id
    const { data: familyRows } = await supabase
      .from('recipes')
      .select('id, name, version, version_notes, is_current_version, parent_recipe_id, created_at, updated_at')
      .eq('brewery_id', brewery.id)
      .or(`id.eq.${rootId},parent_recipe_id.eq.${rootId}`)
      .order('version', { ascending: false })

    // Enrich each version with the first brew date that used it
    const familyIds = (familyRows ?? []).map(v => v.id)
    const { data: brewDayLinks } = familyIds.length > 0
      ? await supabase.from('brew_days')
          .select('recipe_id, brew_date')
          .in('recipe_id', familyIds)
          .order('brew_date', { ascending: true })
      : { data: [] }

    const firstBrewByRecipeId = {}
    for (const bd of (brewDayLinks ?? [])) {
      if (!firstBrewByRecipeId[bd.recipe_id]) firstBrewByRecipeId[bd.recipe_id] = bd.brew_date
    }

    const enrichedFamily = (familyRows ?? []).map(v => ({
      ...v,
      _firstBrewDate: firstBrewByRecipeId[v.id] ?? null,
    }))
    setVersionHistory(enrichedFamily)

    setRecipe(r)
    setBatchSize(String(r.base_batch_size ?? ''))
    setPackagingSplits(r.packaging_splits ?? [])
    setPackagingContainerType(r.packaging_container_type ?? '')
    setPackagingCostPerUnit(String(r.packaging_cost_per_unit ?? 0))
    setLabelCostPerUnit(String(r.label_cost_per_unit ?? 0))
    setCarrierCostPerUnit(String(r.carrier_cost_per_unit ?? 0))
    setPackagingYieldPct(String(r.packaging_yield_percentage ?? 85))
    setBrewHours(String(r.brew_hours ?? 0))
    setLaborRatePerHour(String(r.labor_rate_per_hour ?? 0))
    setUtilitiesCostPerBarrel(String(r.utilities_cost_per_barrel ?? 10))
    setCleaningCostPerBatch(String(r.cleaning_cost_per_batch ?? 15))
    setWaterCostPerBarrel(String(r.water_cost_per_barrel ?? 0.50))
    setWastewaterCostPerBarrel(String(r.wastewater_cost_per_barrel ?? 0.30))
    setFixedOverheadPct(String(r.fixed_overhead_percentage ?? 15))
    setMarginPct(String(r.target_margin_percentage ?? 65))
    setTaxRate(String(r.tax_rate ?? 0))
    setExciseTaxRatePerBbl(r.excise_tax_rate_per_bbl ?? 3.50)
    setBrewers(String(r.brewers_count ?? 2))
    setBrewHoursPerBrewer(String(r.brew_hours_per_brewer ?? 8))
    setPackagingHours(String(r.packaging_hours ?? 4))
    setPackagingLaborRate(String(r.packaging_labor_rate ?? 16))
    setLines(linesResult.data ?? [])
    setLibrary(libResult.data ?? [])
    setLoading(false)
  }, [id, brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  // Auto-populate sales tax from brewery state (only if not yet set on this recipe)
  useEffect(() => {
    if (brewery?.state && (taxRate === '0' || taxRate === '')) {
      const code = STATE_ABBR[brewery.state]
      const stateTax = code !== undefined ? STATE_SALES_TAX[code] : undefined
      if (stateTax !== undefined) setTaxRate(String(stateTax))
    }
  }, [brewery?.state]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-populate excise tax rate from brewery annual production estimate
  useEffect(() => {
    if (brewery?.annual_production_estimate) {
      const rate = brewery.annual_production_estimate <= 2000000
        ? FEDERAL_EXCISE_TAX_RATES.SMALL_BREWER
        : FEDERAL_EXCISE_TAX_RATES.STANDARD
      setExciseTaxRatePerBbl(rate)
    }
  }, [brewery?.annual_production_estimate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch fresh brewery overhead values directly from DB to bypass any context caching
  useEffect(() => {
    async function fetchOverhead() {
      if (!brewery?.id) return
      const { data, error } = await supabase
        .from('breweries')
        .select('monthly_fixed_overhead, batches_per_month, labor_rate_per_hour, variable_overhead_per_bbl')
        .eq('id', brewery.id)
        .maybeSingle()
      if (error) { console.error('fetchOverhead error:', error); return }
      if (!data) return
      console.log('Fetched brewery overhead:', data)
      setMonthlyFixedOverhead(data.monthly_fixed_overhead    != null ? String(data.monthly_fixed_overhead)    : '')
      setBatchesPerMonth(     data.batches_per_month         != null ? String(data.batches_per_month)         : '4')
      setLaborRatePerHour(    data.labor_rate_per_hour       != null ? String(data.labor_rate_per_hour)       : '18')
      setVariableOverheadPerBbl(data.variable_overhead_per_bbl != null ? String(data.variable_overhead_per_bbl) : '15')
    }
    fetchOverhead()
  }, [brewery?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cost calculations (memoized — recomputes only when inputs change) ─────────

  const costs = useMemo(() => {
    const baseBatch  = parseFloat(recipe?.base_batch_size) || 0
    const curBatch   = parseFloat(batchSize) || baseBatch
    const batchBarrels = convertToBarrels(curBatch, recipe?.base_batch_size_unit)

    // Per-line costs for ingredient breakdown display
    const lineCosts = lines.map(l => {
      const pricePerUnit = parseFloat(l.supplier?.price_per_unit ?? l.ingredient?.current_price_per_unit ?? l._priceOverride ?? 0)
      const scaled = calculateScaledAmount(parseFloat(l.amount) || 0, baseBatch, curBatch, l.scale_with_batch)
      return {
        id: l.id, name: l.ingredient_name, category: l.ingredient?.category ?? '',
        scaled, effectiveCost: pricePerUnit, totalCost: scaled * pricePerUnit,
      }
    })

    const mappedLines = lines.map(l => ({
      amount:           parseFloat(l.amount) || 0,
      scale_with_batch: l.scale_with_batch,
      price_per_unit:   parseFloat(l.supplier?.price_per_unit ?? l.ingredient?.current_price_per_unit ?? l._priceOverride ?? 0),
    }))

    const ingredientCost = calculateTotalIngredientCost(mappedLines, curBatch, baseBatch)

    // Packaging cost — use splits when defined, otherwise fall back to single container
    const defaultYield = parseFloat(packagingYieldPct) || 85
    let packagingCost
    if (packagingSplits.length > 0) {
      packagingCost = packagingSplits.reduce((total, split) => {
        const splitBbls = parseFloat(split.volume_barrels) || 0
        const yld = parseFloat(split.packaging_yield) || defaultYield
        return total + calculatePackagingCostPerBatch(
          splitBbls, yld, split.container_type,
          parseFloat(split.packaging_cost_per_unit) || 0,
          parseFloat(split.label_cost_per_unit) || 0,
          parseFloat(split.carrier_cost_per_unit) || 0,
        )
      }, 0)
    } else {
      packagingCost = calculatePackagingCostPerBatch(
        batchBarrels, defaultYield, packagingContainerType,
        parseFloat(packagingCostPerUnit) || 0,
        parseFloat(labelCostPerUnit) || 0,
        parseFloat(carrierCostPerUnit) || 0,
      )
    }

    const totalPints = batchBarrels * 124
    const tp1 = totalPints || 1

    // Per-pint ingredient and packaging costs
    const ingredientCostPerPint = ingredientCost / tp1
    const packagingCostPerPint  = packagingCost  / tp1

    // Direct brew labor
    const totalBrewLaborCost  = (parseFloat(brewers) || 0) * (parseFloat(brewHoursPerBrewer) || 0) * (parseFloat(laborRatePerHour) || 0)
    const brewLaborPerPint    = totalPints > 0 ? totalBrewLaborCost / totalPints : 0

    // Packaging labor
    const totalPackagingLaborCost = (parseFloat(packagingHours) || 0) * (parseFloat(packagingLaborRate) || 0)
    const packagingLaborPerPint   = totalPints > 0 ? totalPackagingLaborCost / totalPints : 0

    // Fixed overhead per batch (monthly fixed costs divided by batches per month)
    const fixedOverheadPerBatch   = (parseFloat(monthlyFixedOverhead) || 0) / (parseFloat(batchesPerMonth) || 4)
    const fixedOverheadPerPint    = totalPints > 0 ? fixedOverheadPerBatch / totalPints : 0

    // Variable overhead (utilities, cleaning, QC per barrel)
    const variableOverheadTotal   = batchBarrels * (parseFloat(variableOverheadPerBbl) || 0)
    const variableOverheadPerPint = totalPints > 0 ? variableOverheadTotal / totalPints : 0

    const totalOverheadPerPint = brewLaborPerPint + packagingLaborPerPint + fixedOverheadPerPint + variableOverheadPerPint

    // Federal excise tax
    const exciseTaxBatchTotal = batchBarrels * (parseFloat(exciseTaxRatePerBbl) || 3.50)
    const exciseTaxPerPint    = totalPints > 0 ? exciseTaxBatchTotal / totalPints : 0

    // True cost per pint — all components combined
    const trueCostPerPint = ingredientCostPerPint + packagingCostPerPint + totalOverheadPerPint + exciseTaxPerPint

    // Total batch production cost (for per-unit calculations in packaged output)
    const totalCost = ingredientCost + packagingCost + totalBrewLaborCost + totalPackagingLaborCost + fixedOverheadPerBatch + variableOverheadTotal

    const targetMarginPct = parseFloat(marginPct) || 65
    const suggestedRetail = targetMarginPct > 0 && targetMarginPct < 100
      ? trueCostPerPint / (1 - targetMarginPct / 100)
      : trueCostPerPint * 2
    const taxInclusivePrice = calculateTaxInclusivePrice(suggestedRetail, parseFloat(taxRate) || 0)
    const grossMarginPct    = suggestedRetail > 0 ? ((suggestedRetail - trueCostPerPint) / suggestedRetail) * 100 : 0
    const grossMargin       = { percentage: grossMarginPct, dollars: suggestedRetail - trueCostPerPint }

    // Total units produced across all splits (or single container)
    const unitsProduced = packagingSplits.length > 0
      ? packagingSplits.reduce((total, split) => {
          const splitBbls = parseFloat(split.volume_barrels) || 0
          const yld = parseFloat(split.packaging_yield) || defaultYield
          const u = calculateUnitsProduced(splitBbls, yld, split.container_type)
          return total + (u ?? 0)
        }, 0)
      : calculateUnitsProduced(batchBarrels, defaultYield, packagingContainerType)

    // Per-split output details (only populated when splits are defined)
    const splitOutputs = packagingSplits.map(split => {
      const splitBbls = parseFloat(split.volume_barrels) || 0
      const yld = parseFloat(split.packaging_yield) || defaultYield
      const splitPct = batchBarrels > 0 ? (splitBbls / batchBarrels) * 100 : 0
      const units = calculateUnitsProduced(splitBbls, yld, split.container_type)
      const splitPackCost = calculatePackagingCostPerBatch(
        splitBbls, yld, split.container_type,
        parseFloat(split.packaging_cost_per_unit) || 0,
        parseFloat(split.label_cost_per_unit) || 0,
        parseFloat(split.carrier_cost_per_unit) || 0,
      )
      const allocatedCost = totalCost * (splitPct / 100)
      const costPerUnit   = units > 0 ? allocatedCost / units : null
      const ppc           = split.container_type && split.container_type !== 'Draft/Taproom'
        ? pintsPerContainer(split.container_type) : null
      const retailPerUnit = ppc != null ? suggestedRetail * ppc : null
      return { ...split, splitPct, units, splitPackCost, allocatedCost, costPerUnit, retailPerUnit }
    })

    // Per-category ingredient costs for pint glass visualization
    const isGrain = lc => lc.category === 'Malt/Grain' || (lc.name ?? '').toLowerCase().includes('malt') || (lc.name ?? '').toLowerCase().includes('grain')
    const isHops  = lc => lc.category === 'Hops'  || (lc.name ?? '').toLowerCase().includes('hop')
    const isYeast = lc => lc.category === 'Yeast' || (lc.name ?? '').toLowerCase().includes('yeast')
    const isOther = lc => !isGrain(lc) && !isHops(lc) && !isYeast(lc)
    const grainCostPerPint    = lineCosts.filter(isGrain).reduce((s, lc) => s + lc.totalCost, 0) / tp1
    const hopsCostPerPint     = lineCosts.filter(isHops).reduce((s, lc) => s + lc.totalCost, 0) / tp1
    const yeastCostPerPint    = lineCosts.filter(isYeast).reduce((s, lc) => s + lc.totalCost, 0) / tp1
    const otherIngCostPerPint = lineCosts.filter(isOther).reduce((s, lc) => s + lc.totalCost, 0) / tp1

    return {
      ingredientCost, packagingCost,
      ingredientCostPerPint, packagingCostPerPint,
      totalBrewLaborCost, brewLaborPerPint,
      totalPackagingLaborCost, packagingLaborPerPint,
      fixedOverheadPerBatch, fixedOverheadPerPint,
      variableOverheadTotal, variableOverheadPerPint,
      totalOverheadPerPint,
      exciseTaxBatchTotal, exciseTaxPerPint,
      trueCostPerPint, totalCost,
      suggestedRetail, taxInclusivePrice, grossMargin,
      batchBarrels, totalPints, unitsProduced,
      lineCosts, splitOutputs,
      grainCostPerPint, hopsCostPerPint, yeastCostPerPint, otherIngCostPerPint,
    }
  }, [
    lines, recipe, batchSize,
    packagingSplits,
    packagingContainerType, packagingCostPerUnit, labelCostPerUnit, carrierCostPerUnit, packagingYieldPct,
    brewers, brewHoursPerBrewer, laborRatePerHour,
    packagingHours, packagingLaborRate,
    monthlyFixedOverhead, batchesPerMonth,
    variableOverheadPerBbl,
    marginPct, taxRate, exciseTaxRatePerBbl,
  ])

  // ── Recipe name inline save ───────────────────────────────────────────────────

  async function saveName() {
    if (!nameVal.trim() || nameVal === recipe.name) { setEditingName(false); return }
    const { error: e } = await supabase.from('recipes')
      .update({ name: nameVal.trim() }).eq('id', id)
    if (!e) setRecipe(prev => ({ ...prev, name: nameVal.trim() }))
    setEditingName(false)
  }

  // ── Single handler for all cost calculator field changes ─────────────────────

  function handleCostFieldChange(field, value) {
    const setters = {
      packagingContainerType:  setPackagingContainerType,
      packagingCostPerUnit:    setPackagingCostPerUnit,
      labelCostPerUnit:        setLabelCostPerUnit,
      carrierCostPerUnit:      setCarrierCostPerUnit,
      packagingYieldPct:       setPackagingYieldPct,
      brewers:                 setBrewers,
      brewHoursPerBrewer:      setBrewHoursPerBrewer,
      laborRatePerHour:        setLaborRatePerHour,
      packagingHours:          setPackagingHours,
      packagingLaborRate:      setPackagingLaborRate,
      monthlyFixedOverhead:    setMonthlyFixedOverhead,
      batchesPerMonth:         setBatchesPerMonth,
      variableOverheadPerBbl:  setVariableOverheadPerBbl,
      marginPct:               setMarginPct,
      taxRate:                 setTaxRate,
      exciseTaxRatePerBbl:     setExciseTaxRatePerBbl,
    }
    setters[field]?.(value)
  }

  // ── Persist all cost settings to the recipe row on blur ───────────────────────

  async function saveCostSettings() {
    setAutoSaveStatus('saving')
    const { error: saveErr } = await supabase.from('recipes').update({
      packaging_splits:           packagingSplits.length > 0 ? packagingSplits : null,
      packaging_container_type:   packagingContainerType || null,
      packaging_cost_per_unit:    safeParse(packagingCostPerUnit,        0),
      label_cost_per_unit:        safeParse(labelCostPerUnit,            0),
      carrier_cost_per_unit:      safeParse(carrierCostPerUnit,          0),
      packaging_yield_percentage: safeParse(packagingYieldPct,           85),
      brew_hours:                 safeParse(brewHours,                   4),
      labor_rate_per_hour:        safeParse(laborRatePerHour,            0),
      utilities_cost_per_barrel:  safeParse(utilitiesCostPerBarrel,      10),
      cleaning_cost_per_batch:    safeParse(cleaningCostPerBatch,        0),
      water_cost_per_barrel:      safeParse(waterCostPerBarrel,          0),
      wastewater_cost_per_barrel: safeParse(wastewaterCostPerBarrel,     0),
      fixed_overhead_percentage:  safeParse(fixedOverheadPct,            15),
      target_margin_percentage:   safeParse(marginPct,                   65),
      tax_rate:                   safeParse(taxRate,                     0),
      excise_tax_rate_per_bbl:    parseFloat(exciseTaxRatePerBbl) || 3.50,
      brewers_count:              safeParse(brewers,                     2),
      brew_hours_per_brewer:      safeParse(brewHoursPerBrewer,          8),
      packaging_hours:            safeParse(packagingHours,              4),
      packaging_labor_rate:       safeParse(packagingLaborRate,          16),
    }).eq('id', id)
    setAutoSaveStatus(saveErr ? 'error' : 'saved')
  }

  // ── Save overhead defaults to brewery profile ─────────────────────────────────

  async function saveOverheadToBreweryProfile() {
    if (!brewery?.id) return
    await supabase.from('breweries').update({
      labor_rate_per_hour:        safeParse(laborRatePerHour,        0),
      monthly_fixed_overhead:     safeParse(monthlyFixedOverhead,    0),
      batches_per_month:          safeParse(batchesPerMonth,         4),
      variable_overhead_per_bbl:  safeParse(variableOverheadPerBbl,  15),
    }).eq('id', brewery.id)
  }

  // ── Archive / unarchive ───────────────────────────────────────────────────────

  async function handleArchive() {
    const next = !recipe.is_archived
    await supabase.from('recipes').update({ is_archived: next }).eq('id', id)
    setRecipe(prev => ({ ...prev, is_archived: next }))
  }

  // ── Inventory / brew check ────────────────────────────────────────────────────

  function runBrewCheck() {
    const baseBatch = parseFloat(recipe?.base_batch_size) || 0
    const curBatch  = parseFloat(batchSize) || baseBatch
    const results = lines.map(line => {
      const scaled  = calculateScaledAmount(parseFloat(line.amount) || 0, baseBatch, curBatch, line.scale_with_batch)
      const libIng  = library.find(i => i.id === line.ingredient_id)
      if (!libIng) {
        return { id: line.id, name: line.ingredient_name, scaled, unit: line.unit, status: 'no_inventory' }
      }
      const stock   = parseFloat(libIng.current_stock_quantity) || 0
      const reorder = parseFloat(libIng.reorder_threshold) || 0
      if (stock < scaled) {
        return { id: line.id, name: line.ingredient_name, scaled, unit: line.unit, status: 'insufficient', stock, needed: scaled - stock }
      }
      const remaining = stock - scaled
      const status = reorder > 0 && remaining <= reorder ? 'low' : 'ok'
      return { id: line.id, name: line.ingredient_name, scaled, unit: line.unit, status, stock, remaining }
    })
    setBrewCheckResults(results)
    setBrewCheckOpen(true)
  }

  // ── Duplicate recipe ──────────────────────────────────────────────────────────

  async function handleDuplicate() {
    const { data: copy, error: e } = await supabase.from('recipes').insert({
      brewery_id: brewery.id,
      name: `${recipe.name} — Copy`,
      style: recipe.style,
      bjcp_category: recipe.bjcp_category,
      base_batch_size: recipe.base_batch_size,
      base_batch_size_unit: recipe.base_batch_size_unit,
      description: recipe.description,
      target_og: recipe.target_og,
      target_fg: recipe.target_fg,
      target_abv: recipe.target_abv,
      target_ibu: recipe.target_ibu,
      target_srm: recipe.target_srm,
      packaging_splits:           recipe.packaging_splits ?? null,
      packaging_container_type:   recipe.packaging_container_type,
      packaging_cost_per_unit:    recipe.packaging_cost_per_unit,
      label_cost_per_unit:        recipe.label_cost_per_unit,
      carrier_cost_per_unit:      recipe.carrier_cost_per_unit,
      packaging_yield_percentage: recipe.packaging_yield_percentage,
      brew_hours:                 recipe.brew_hours,
      labor_rate_per_hour:        recipe.labor_rate_per_hour,
      utilities_cost_per_barrel:   recipe.utilities_cost_per_barrel,
      cleaning_cost_per_batch:     recipe.cleaning_cost_per_batch,
      water_cost_per_barrel:       recipe.water_cost_per_barrel,
      wastewater_cost_per_barrel:  recipe.wastewater_cost_per_barrel,
      fixed_overhead_percentage:   recipe.fixed_overhead_percentage,
      target_margin_percentage:   recipe.target_margin_percentage,
      tax_rate:                   recipe.tax_rate,
      version: recipe.version + 1,
      parent_recipe_id: recipe.id,
    }).select().single()

    if (e || !copy) return

    // Copy ingredient lines to the new recipe
    if (lines.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        lines.map(l => ({
          recipe_id: copy.id,
          brewery_id: brewery.id,
          ingredient_id: l.ingredient_id,
          ingredient_name: l.ingredient_name,
          amount: l.amount,
          unit: l.unit,
          scale_with_batch: l.scale_with_batch,
          addition_type: l.addition_type,
          addition_time: l.addition_time,
          notes: l.notes,
          sort_order: l.sort_order,
          supplier_id: l.supplier_id,
        }))
      )
    }

    navigate(`/recipes/${copy.id}`)
  }

  // ── Save New Version ─────────────────────────────────────────────────────────

  async function handleSaveNewVersion() {
    if (versionSaving) return
    setVersionSaving(true)
    setVersionError('')

    const rootId = recipe.parent_recipe_id ?? recipe.id
    const { error: markErr } = await supabase.from('recipes')
      .update({ is_current_version: false })
      .or(`id.eq.${rootId},parent_recipe_id.eq.${rootId}`)
      .eq('brewery_id', brewery.id)
    if (markErr) { setVersionError('Failed to mark old versions.'); setVersionSaving(false); return }

    const { data: newRecipe, error: insertErr } = await supabase.from('recipes').insert({
      brewery_id: brewery.id,
      name: recipe.name,
      style: recipe.style,
      bjcp_category: recipe.bjcp_category,
      base_batch_size: recipe.base_batch_size,
      base_batch_size_unit: recipe.base_batch_size_unit,
      description: recipe.description,
      target_og: recipe.target_og,
      target_fg: recipe.target_fg,
      target_abv: recipe.target_abv,
      target_ibu: recipe.target_ibu,
      target_srm: recipe.target_srm,
      packaging_splits:           recipe.packaging_splits ?? null,
      packaging_container_type:   recipe.packaging_container_type,
      packaging_cost_per_unit:    recipe.packaging_cost_per_unit,
      label_cost_per_unit:        recipe.label_cost_per_unit,
      carrier_cost_per_unit:      recipe.carrier_cost_per_unit,
      packaging_yield_percentage: recipe.packaging_yield_percentage,
      brew_hours:                 recipe.brew_hours,
      labor_rate_per_hour:        recipe.labor_rate_per_hour,
      utilities_cost_per_barrel:  recipe.utilities_cost_per_barrel,
      cleaning_cost_per_batch:    recipe.cleaning_cost_per_batch,
      water_cost_per_barrel:      recipe.water_cost_per_barrel,
      wastewater_cost_per_barrel: recipe.wastewater_cost_per_barrel,
      fixed_overhead_percentage:  recipe.fixed_overhead_percentage,
      target_margin_percentage:   recipe.target_margin_percentage,
      tax_rate:                   recipe.tax_rate,
      version:                    recipe.version + 1,
      parent_recipe_id:           rootId,
      is_current_version:         true,
      version_notes:              versionNotes.trim() || null,
    }).select().single()
    if (insertErr || !newRecipe) { setVersionError('Failed to create new version.'); setVersionSaving(false); return }

    if (lines.length > 0) {
      const { error: copyErr } = await supabase.from('recipe_ingredients').insert(
        lines.map(l => ({
          recipe_id:       newRecipe.id,
          brewery_id:      brewery.id,
          ingredient_id:   l.ingredient_id,
          ingredient_name: l.ingredient_name,
          amount:          l.amount,
          unit:            l.unit,
          scale_with_batch: l.scale_with_batch,
          addition_type:   l.addition_type,
          addition_time:   l.addition_time,
          notes:           l.notes,
          sort_order:      l.sort_order,
          supplier_id:     l.supplier_id,
        }))
      )
      if (copyErr) {
        await supabase.from('recipes').delete().eq('id', newRecipe.id)
        setVersionError('Failed to copy ingredients.')
        setVersionSaving(false)
        return
      }
    }

    setSaveVersionOpen(false)
    setVersionNotes('')
    setVersionSaving(false)
    navigate(`/recipes/${newRecipe.id}`)
  }

  // ── Compare versions ──────────────────────────────────────────────────────────

  async function loadCompare(idA, idB) {
    if (!idA || !idB) return
    setCompareLoading(true)
    const [resA, resB, linesA, linesB] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', idA).single(),
      supabase.from('recipes').select('*').eq('id', idB).single(),
      supabase.from('recipe_ingredients').select('*, ingredient:ingredients(id,name,category)').eq('recipe_id', idA).order('sort_order'),
      supabase.from('recipe_ingredients').select('*, ingredient:ingredients(id,name,category)').eq('recipe_id', idB).order('sort_order'),
    ])
    setCompareData({
      a: { recipe: resA.data, lines: linesA.data ?? [] },
      b: { recipe: resB.data, lines: linesB.data ?? [] },
    })
    setCompareLoading(false)
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const baseBatch = recipe.base_batch_size
    const unit = recipe.base_batch_size_unit
    const rows = [
      ['Recipe', recipe.name],
      ['Style', recipe.style ?? ''],
      ['BJCP Category', recipe.bjcp_category ?? ''],
      ['Base Batch Size', `${baseBatch} ${unit}`],
      ['Current Batch Size', `${batchSize} ${unit}`],
      ['Target ABV', recipe.target_abv ? `${recipe.target_abv}%` : ''],
      ['Target IBU', recipe.target_ibu ?? ''],
      ['Target OG', recipe.target_og ?? ''],
      ['Target FG', recipe.target_fg ?? ''],
      ['Target SRM', recipe.target_srm ?? ''],
      [],
      ['Addition Type','Ingredient','Scaled Amount','Unit','Effective Cost/Unit','Line Cost'],
      ...costs.lineCosts.map((lc, i) => {
        const l = lines[i]
        return [l?.addition_type ?? '', lc.name, lc.scaled.toFixed(4), l?.unit ?? '', formatDollars(lc.effectiveCost), formatDollars(lc.totalCost)]
      }),
      [],
      ['Ingredient Cost',              formatDollars(costs.ingredientCost)],
      ['Packaging Cost',               formatDollars(costs.packagingCost)],
      ['Brew Labor',                   formatDollars(costs.totalBrewLaborCost)],
      ['Packaging Labor',              formatDollars(costs.totalPackagingLaborCost)],
      ['Fixed Overhead (per batch)',   formatDollars(costs.fixedOverheadPerBatch)],
      ['Variable Overhead',            formatDollars(costs.variableOverheadTotal)],
      ['Total Production Cost',        formatDollars(costs.totalCost)],
      ['Ingredient Cost per Pint',     formatDollars(costs.ingredientCostPerPint)],
      ['Packaging Cost per Pint',      formatDollars(costs.packagingCostPerPint)],
      ['Labor & Overhead per Pint',    formatDollars(costs.totalOverheadPerPint)],
      ['Federal Excise Tax per Pint',  formatDollars(costs.exciseTaxPerPint)],
      ['True Cost per Pint',           formatDollars(costs.trueCostPerPint)],
      ['Suggested Retail (pre-tax)',   formatDollars(costs.suggestedRetail)],
      ['Suggested Retail (tax-incl.)', formatDollars(costs.taxInclusivePrice)],
      ['Gross Margin',                 formatPct(costs.grossMargin?.percentage)],
    ]

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `${recipe.name.replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Ingredient line field update (local state — saved on blur) ────────────────

  function updateLine(lineId, field, value) {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l))
  }

  async function saveLineField(lineId, field, value) {
    await supabase.from('recipe_ingredients')
      .update({ [field]: value }).eq('id', lineId)
  }

  // ── Autocomplete ──────────────────────────────────────────────────────────────

  function handleIngNameInput(lineId, value) {
    updateLine(lineId, 'ingredient_name', value)
    setAcLineId(lineId)
    setAcQuery(value)
    clearTimeout(acTimer.current)
    if (value.length < 2) { setAcResults([]); return }
    acTimer.current = setTimeout(() => {
      const results = library
        .filter(i => i.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 8)
      setAcResults(results)
    }, 300)
  }

  function handleAcSelect(lineId, ingRow) {
    // Fill in all fields from the library ingredient
    const preferred = ingRow.ingredient_suppliers?.find(s => s.is_preferred)
    setLines(prev => prev.map(l => l.id === lineId
      ? { ...l,
          ingredient_id: ingRow.id,
          ingredient_name: ingRow.name,
          unit: ingRow.unit ?? l.unit,
          supplier_id: preferred?.id ?? null,
          ingredient: ingRow,
          supplier: preferred ?? null,
        }
      : l
    ))
    // Persist immediately
    supabase.from('recipe_ingredients').update({
      ingredient_id: ingRow.id,
      ingredient_name: ingRow.name,
      unit: ingRow.unit ?? 'lb',
      supplier_id: preferred?.id ?? null,
    }).eq('id', lineId)
    closeAutocomplete()
  }

  function closeAutocomplete() {
    setAcLineId(null); setAcQuery(''); setAcResults([])
    clearTimeout(acTimer.current)
  }

  // ── Add new ingredient line ───────────────────────────────────────────────────

  function startAddingLine(additionType) {
    setAddingTo(additionType)
    setNewLineForm(emptyNewLine(additionType))
    setNewLineError('')
  }

  function cancelAddLine() { setAddingTo(null) }

  async function handleSaveNewLine(e) {
    e.preventDefault()
    if (!newLineForm.ingredient_name.trim()) { setNewLineError('Ingredient name is required.'); return }
    if (!newLineForm.amount) { setNewLineError('Amount is required.'); return }

    setNewLineSaving(true); setNewLineError('')

    const maxSort = lines.filter(l => l.addition_type === addingTo).reduce((m, l) => Math.max(m, l.sort_order ?? 0), 0)

    // Match against library to set ingredient_id
    const match = library.find(i => i.name.toLowerCase() === newLineForm.ingredient_name.toLowerCase())
    const preferred = match?.ingredient_suppliers?.find(s => s.is_preferred)

    const enteredAddType = newLineForm.addition_type || addingTo
    // For Other mode (no library match), use the entered price as an override for immediate display
    const enteredPrice = parseFloat(newLineForm.price_per_unit) || 0

    const { data, error: e2 } = await supabase.from('recipe_ingredients').insert({
      recipe_id: id,
      brewery_id: brewery.id,
      ingredient_id: match?.id ?? null,
      ingredient_name: newLineForm.ingredient_name.trim(),
      amount: parseFloat(newLineForm.amount),
      unit: newLineForm.unit,
      scale_with_batch: newLineForm.scale_with_batch,
      addition_type: enteredAddType,
      addition_time: newLineForm.addition_time || null,
      notes: newLineForm.notes || null,
      sort_order: maxSort + 1,
      supplier_id: preferred?.id ?? null,
    }).select('*, ingredient:ingredients(id,name,category,unit,current_price_per_unit,ingredient_suppliers(*)), supplier:ingredient_suppliers(id,supplier_name,price_per_unit,is_preferred)').single()

    setNewLineSaving(false)
    if (e2) { setNewLineError(e2.message); return }

    // Attach _priceOverride for Other-mode ingredients so cost panel shows the entered price before next reload
    const lineWithPrice = !match && enteredPrice > 0 ? { ...data, _priceOverride: enteredPrice } : data
    setLines(prev => [...prev, lineWithPrice])
    setAddingTo(null)
  }

  // ── Edit existing ingredient line ─────────────────────────────────────────────

  async function handleSaveEditLine(e) {
    e.preventDefault()
    if (!editIngredientTarget || !editLineForm) return
    if (!editLineForm.ingredient_name?.trim()) { setEditLineError('Ingredient name is required.'); return }
    if (!editLineForm.amount) { setEditLineError('Amount is required.'); return }

    setEditLineSaving(true); setEditLineError('')

    const match = library.find(i => i.name.toLowerCase() === editLineForm.ingredient_name.toLowerCase())
    const preferred = match?.ingredient_suppliers?.find(s => s.is_preferred)
    const enteredPrice = parseFloat(editLineForm.price_per_unit) || 0

    const { data, error: e2 } = await supabase.from('recipe_ingredients')
      .update({
        ingredient_id:    match?.id ?? null,
        ingredient_name:  editLineForm.ingredient_name.trim(),
        amount:           parseFloat(editLineForm.amount),
        unit:             editLineForm.unit,
        scale_with_batch: editLineForm.scale_with_batch,
        addition_type:    editLineForm.addition_type,
        addition_time:    editLineForm.addition_time || null,
        notes:            editLineForm.notes || null,
        supplier_id:      preferred?.id ?? null,
      })
      .eq('id', editIngredientTarget.id)
      .select('*, ingredient:ingredients(id,name,category,unit,current_price_per_unit,ingredient_suppliers(*)), supplier:ingredient_suppliers(id,supplier_name,price_per_unit,is_preferred)')
      .single()

    setEditLineSaving(false)
    if (e2) { setEditLineError(e2.message); return }

    const lineWithPrice = !match && enteredPrice > 0 ? { ...data, _priceOverride: enteredPrice } : data
    setLines(prev => prev.map(l => l.id === editIngredientTarget.id ? lineWithPrice : l))
    setEditIngredientTarget(null)
  }

  // ── Remove ingredient line ────────────────────────────────────────────────────

  async function handleRemoveLine(lineId) {
    const name = lines.find(l => l.id === lineId)?.ingredient_name || 'this ingredient'
    if (!window.confirm(`Remove ${name} from this recipe?`)) return
    await supabase.from('recipe_ingredients').delete().eq('id', lineId)
    setLines(prev => prev.filter(l => l.id !== lineId))
  }

  // ── Reorder (move up / move down within the same addition type) ───────────────

  async function moveLine(lineId, direction) {
    const line    = lines.find(l => l.id === lineId)
    const section = lines.filter(l => l.addition_type === line.addition_type)
    const idx     = section.findIndex(l => l.id === lineId)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= section.length) return

    const a = section[idx]
    const b = section[swapIdx]
    const aSort = a.sort_order
    const bSort = b.sort_order

    setLines(prev => prev.map(l => {
      if (l.id === a.id) return { ...l, sort_order: bSort }
      if (l.id === b.id) return { ...l, sort_order: aSort }
      return l
    }))

    await Promise.all([
      supabase.from('recipe_ingredients').update({ sort_order: bSort }).eq('id', a.id),
      supabase.from('recipe_ingredients').update({ sort_order: aSort }).eq('id', b.id),
    ])
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner message="Loading recipe..." />
  if (error)   return <div className="p-6 text-danger">{error}</div>
  if (!recipe) return null

  const scalingMultiplier = recipe.base_batch_size
    ? (parseFloat(batchSize) / recipe.base_batch_size).toFixed(2)
    : '—'

  return (
    <div className="space-y-0 pb-6">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:px-6 -mx-4 md:-mx-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {/* Back link */}
            <button onClick={() => navigate('/recipes')} className="text-xs text-gray-400 hover:text-navy mb-2 block">
              ← All Recipes
            </button>

            {/* Inline name editing */}
            <div className="flex items-center gap-2">
              {editingName ? (
                <input
                  autoFocus
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  className="text-2xl font-bold text-navy border-b-2 border-amber focus:outline-none bg-transparent min-w-0 flex-1"
                />
              ) : (
                <h1 className="text-2xl font-bold text-navy truncate">{recipe.name}</h1>
              )}
              {!isReadOnly && (
                <button onClick={() => { setNameVal(recipe.name); setEditingName(true) }}
                  className="text-gray-400 hover:text-amber shrink-0" title="Edit name">✏️</button>
              )}
              <span className={`inline-flex items-center text-sm px-3 py-1 rounded-full font-medium ml-2 ${
                autoSaveStatus === 'saving' ? 'bg-amber/10 text-amber' :
                autoSaveStatus === 'error'  ? 'bg-red-50 text-danger' :
                'bg-green-100 text-success'
              }`}>
                {autoSaveStatus === 'saving' ? 'Saving…' :
                 autoSaveStatus === 'error'  ? 'Save failed — check connection' :
                 'All changes saved ✓'}
              </span>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mt-2">
              {recipe.style && (
                <span className="text-xs bg-amber/10 text-amber font-semibold px-2 py-0.5 rounded-full">{recipe.style}</span>
              )}
              {recipe.bjcp_category && (
                <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full">{recipe.bjcp_category}</span>
              )}
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">v{recipe.version}</span>
              {recipe.is_archived && (
                <span className="text-xs bg-orange-100 text-warning px-2 py-0.5 rounded-full">Archived</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <button onClick={runBrewCheck}
              className="text-xs border border-amber text-amber px-3 py-1.5 rounded-lg hover:bg-amber/5 transition-colors font-medium">
              Check Inventory
            </button>
            <button onClick={handleExportCSV}
              className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              Export CSV
            </button>
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button onClick={handleDuplicate} disabled={isReadOnly}
                title="Create a copy of this recipe with the same ingredients. Use this to brew the same beer with different packaging splits."
                className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                Duplicate Recipe
              </button>
            </ReadOnlyTooltip>
            {hasBrewed && !recipe.is_archived && (
              <ReadOnlyTooltip isReadOnly={isReadOnly}>
                <button onClick={() => setSaveVersionOpen(true)} disabled={isReadOnly}
                  title="Preserve this version and start a new one with the same ingredients."
                  className="text-xs border border-purple-200 text-purple-600 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50">
                  Save New Version
                </button>
              </ReadOnlyTooltip>
            )}
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button onClick={handleArchive} disabled={isReadOnly}
                className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                {recipe.is_archived ? 'Unarchive' : 'Archive'}
              </button>
            </ReadOnlyTooltip>
          </div>
        </div>

        {/* Target stats row */}
        {(recipe.target_og || recipe.target_fg || recipe.target_abv || recipe.target_ibu || recipe.target_srm) && (
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
            {recipe.target_og  && <span>OG: <strong className="text-navy">{recipe.target_og}</strong></span>}
            {recipe.target_fg  && <span>FG: <strong className="text-navy">{recipe.target_fg}</strong></span>}
            {recipe.target_abv && <span>ABV: <strong className="text-navy">{recipe.target_abv}%</strong></span>}
            {recipe.target_ibu && <span>IBU: <strong className="text-navy">{recipe.target_ibu}</strong></span>}
            {recipe.target_srm && <span>SRM: <strong className="text-navy">{recipe.target_srm}</strong></span>}
          </div>
        )}
      </div>

      {/* ── Brewed recipe warning banner ── */}
      {hasBrewed && (
        <div className="mb-4 flex items-start gap-3 bg-amber/10 border border-amber/30 rounded-xl px-4 py-3">
          <span className="shrink-0 mt-0.5 text-amber">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber">This recipe has been brewed.</p>
            <p className="text-xs text-gray-600 mt-0.5">Editing will change the recipe for future brews. To preserve this version, click Save New Version instead.</p>
          </div>
          {!recipe.is_archived && (
            <button onClick={() => setSaveVersionOpen(true)}
              className="shrink-0 text-xs font-semibold bg-amber text-white px-3 py-1.5 rounded-lg hover:bg-amber-dark transition-colors">
              Save New Version
            </button>
          )}
        </div>
      )}

      {/* ── Recipe completion checklist ── */}
      <div className="mb-4">
        <RecipeChecklist
          recipe={recipe}
          ingredients={lines.map(l => ({
            category: l.ingredient?.category ?? '',
            name: l.ingredient_name,
            price_per_unit: parseFloat(l.supplier?.price_per_unit ?? l.ingredient?.current_price_per_unit ?? l._priceOverride ?? 0),
          }))}
          packagingSplits={packagingSplits}
          batchBarrels={costs.batchBarrels}
        />
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-gray-200 mb-6 -mx-4 md:-mx-6 px-4 md:px-6 bg-white overflow-x-auto">
        {[
          { id: 'ingredients', label: 'Ingredients' },
          { id: 'cost',        label: 'Cost Calculator' },
          { id: 'water',       label: 'Water Chemistry' },
          { id: 'history',     label: 'Version History' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'border-amber text-amber'
                : 'border-transparent text-gray-500 hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div>

          {/* Ingredients tab */}
          {activeTab === 'ingredients' && (
          <div className="space-y-6">

          {/* Batch size selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Batch Size</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={batchSize}
                    onChange={e => setBatchSize(e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-navy focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                  <span className="text-sm text-gray-500">{recipe.base_batch_size_unit}</span>
                  <span className="text-xs text-amber font-semibold bg-amber/10 px-2 py-1 rounded-full">
                    {scalingMultiplier}× base
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>Base recipe: {recipe.base_batch_size} {recipe.base_batch_size_unit}</p>
                <button
                  onClick={() => setBatchSize(String(recipe.base_batch_size))}
                  className="text-amber hover:underline mt-0.5"
                >
                  Reset to base
                </button>
              </div>
            </div>
          </div>

          {/* Brew check results panel */}
          {brewCheckOpen && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-navy text-sm">Inventory Check</h3>
                <button onClick={() => setBrewCheckOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>

              {/* Top-level summary */}
              {brewCheckResults.every(r => r.status === 'ok' || r.status === 'no_inventory') && (
                <p className="text-sm font-semibold text-success mb-3">✓ You can brew this recipe</p>
              )}
              {brewCheckResults.some(r => r.status === 'insufficient') && (
                <p className="text-sm font-semibold text-danger mb-3">Missing ingredients — check inventory before brewing</p>
              )}
              {!brewCheckResults.some(r => r.status === 'insufficient') && brewCheckResults.some(r => r.status === 'low') && (
                <p className="text-sm font-semibold text-amber mb-3">⚠ Some ingredients are running low after this brew</p>
              )}

              {/* Per-ingredient rows */}
              <div className="space-y-2">
                {brewCheckResults.map(r => (
                  <div key={r.id} className="flex items-start gap-2 text-sm">
                    <span className={
                      r.status === 'ok'           ? 'text-success shrink-0 mt-0.5' :
                      r.status === 'low'          ? 'text-amber shrink-0 mt-0.5' :
                      r.status === 'insufficient' ? 'text-danger shrink-0 mt-0.5' :
                                                    'text-gray-300 shrink-0 mt-0.5'
                    }>
                      {r.status === 'ok' ? '✓' : r.status === 'low' ? '⚠' : r.status === 'insufficient' ? '✕' : '—'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-navy leading-tight">{r.name}</p>
                      {r.status === 'ok' && (
                        <p className="text-xs text-gray-400">
                          Need {r.scaled.toFixed(3)} {r.unit} · {r.remaining.toFixed(2)} {r.unit} remaining after brew
                        </p>
                      )}
                      {r.status === 'low' && (
                        <p className="text-xs text-amber">
                          {r.remaining.toFixed(2)} {r.unit} remaining — at or below reorder threshold
                        </p>
                      )}
                      {r.status === 'insufficient' && (
                        <p className="text-xs text-danger">
                          Need {r.scaled.toFixed(3)} {r.unit}, have {r.stock.toFixed(2)} {r.unit} (short {r.needed.toFixed(2)} {r.unit}).{' '}
                          <button
                            onClick={() => navigate('/inventory')}
                            className="underline font-medium"
                          >
                            Order in Inventory →
                          </button>
                        </p>
                      )}
                      {r.status === 'no_inventory' && (
                        <p className="text-xs text-gray-400">Not tracked in inventory</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {brewCheckResults.some(r => r.status === 'insufficient') && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => navigate('/inventory')}
                    className="text-xs bg-amber text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-dark transition-colors"
                  >
                    Go to Inventory to create a Purchase Order →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Ingredient sections — one per addition type */}
          {ADDITION_TYPES.map(addType => {
            const sectionLines = lines
              .filter(l => l.addition_type === addType)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

            return (
              <AdditionSection
                key={addType}
                addType={addType}
                lines={sectionLines}
                allLines={lines}
                library={library}
                batchSize={batchSize}
                baseBatchSize={recipe.base_batch_size}
                isReadOnly={isReadOnly}
                ReadOnlyTooltip={ReadOnlyTooltip}
                // Autocomplete props (for existing line name editing)
                acLineId={acLineId}
                acResults={acResults}
                onIngNameInput={handleIngNameInput}
                onAcSelect={handleAcSelect}
                onAcClose={closeAutocomplete}
                // Line actions
                onUpdateLine={updateLine}
                onSaveLineField={saveLineField}
                onRemoveLine={handleRemoveLine}
                onMoveLine={moveLine}
                // Opens the AddIngredientModal for this section
                onStartAdding={startAddingLine}
                // Opens the edit modal pre-populated with the ingredient's data
                onEditLine={line => {
                  setEditLineError('')
                  setEditLineForm({
                    ingredient_name: line.ingredient_name,
                    amount:          String(line.amount ?? ''),
                    unit:            line.unit ?? 'lb',
                    scale_with_batch: line.scale_with_batch ?? true,
                    addition_time:   line.addition_time ?? '',
                    notes:           line.notes ?? '',
                    addition_type:   line.addition_type,
                    price_per_unit:  String(line._priceOverride ?? ''),
                  })
                  setEditIngredientTarget(line)
                }}
              />
            )
          })}

          </div>
          )}{/* end ingredients tab */}

          {/* Cost Calculator tab — CostPanel left (55%), PintGlass right (45%) */}
          {activeTab === 'cost' && (
            <div className="grid grid-cols-1 xl:grid-cols-[55%_45%] gap-6 items-start">
              <div className="min-w-0">
                <CostPanel
                  costs={costs}
                  batchBarrels={costs.batchBarrels}
                  packagingSplits={packagingSplits}
                  onSplitsChange={newSplits => { setPackagingSplits(newSplits); saveCostSettings() }}
                  packagingContainerType={packagingContainerType}
                  packagingCostPerUnit={packagingCostPerUnit}
                  labelCostPerUnit={labelCostPerUnit}
                  carrierCostPerUnit={carrierCostPerUnit}
                  packagingYieldPct={packagingYieldPct}
                  brewers={brewers}
                  brewHoursPerBrewer={brewHoursPerBrewer}
                  laborRatePerHour={laborRatePerHour}
                  packagingHours={packagingHours}
                  packagingLaborRate={packagingLaborRate}
                  monthlyFixedOverhead={monthlyFixedOverhead}
                  batchesPerMonth={batchesPerMonth}
                  variableOverheadPerBbl={variableOverheadPerBbl}
                  marginPct={marginPct}
                  taxRate={taxRate}
                  exciseTaxRatePerBbl={exciseTaxRatePerBbl}
                  brewery={brewery}
                  onChange={handleCostFieldChange}
                  onBlur={saveCostSettings}
                  onSaveToProfile={saveOverheadToBreweryProfile}
                />
              </div>
              <div className="hidden xl:block min-w-0">
                <div className="sticky top-4">
                  <PintGlassVisualization costs={costs} />
                </div>
              </div>
            </div>
          )}

          {/* Water Chemistry tab */}
          {activeTab === 'water' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden p-5">
              <WaterChemistryTab
                recipeId={recipe.id}
                recipe={recipe}
                batchSize={batchSize}
                lines={lines}
                isReadOnly={isReadOnly}
              />
            </div>
          )}

          {/* Version History tab */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-navy text-sm">Version History</span>
                  <span className="text-xs bg-purple-100 text-purple-600 font-semibold px-2 py-0.5 rounded-full">
                    {versionHistory.length} version{versionHistory.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => { setCompareIdA(''); setCompareIdB(''); setCompareData(null); setCompareOpen(true) }}
                  className="text-xs text-amber font-medium hover:underline"
                >
                  Compare Versions
                </button>
              </div>
              {versionHistory.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {versionHistory.map(v => (
                    <div key={v.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-navy">v{v.version}</span>
                          {v.is_current_version && (
                            <span className="text-xs bg-green-100 text-success font-semibold px-2 py-0.5 rounded-full">Current</span>
                          )}
                          {v.id === recipe.id && (
                            <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">Viewing</span>
                          )}
                          {v._firstBrewDate && (
                            <span className="text-xs text-gray-400">First brewed {new Date(v._firstBrewDate).toLocaleDateString()}</span>
                          )}
                        </div>
                        {v.version_notes && (
                          <p className="text-xs text-gray-500 mt-0.5">{v.version_notes}</p>
                        )}
                      </div>
                      {v.id !== recipe.id && (
                        <button
                          onClick={() => navigate(`/recipes/${v.id}`)}
                          className="shrink-0 text-xs text-amber font-medium hover:underline"
                        >
                          View →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No other versions yet.</p>
              )}
            </div>
          )}

      </div>{/* end tab content */}

      {/* ── Save New Version modal ── */}
      <ModalShell
        isOpen={saveVersionOpen}
        onClose={() => { setSaveVersionOpen(false); setVersionNotes(''); setVersionError('') }}
        title="Save New Version"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Creates a copy of this recipe as a new version. The current recipe is preserved unchanged. Use this before making changes you want to test while keeping this version available for future brews.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">What's changing? (optional)</label>
            <textarea
              value={versionNotes}
              onChange={e => setVersionNotes(e.target.value)}
              placeholder="e.g. Increased dry hop, swapped Columbus for Citra..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
            />
          </div>
          {versionError && <p className="text-sm text-danger">{versionError}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSaveNewVersion} disabled={versionSaving}
              className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
              {versionSaving ? 'Saving...' : 'Create New Version'}
            </button>
            <button onClick={() => { setSaveVersionOpen(false); setVersionNotes(''); setVersionError('') }}
              className="flex-1 border border-gray-300 text-gray-600 font-medium py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Compare Versions modal ── */}
      <ModalShell
        isOpen={compareOpen}
        onClose={() => { setCompareOpen(false); setCompareData(null) }}
        title="Compare Versions"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Version A</label>
              <select
                value={compareIdA}
                onChange={e => { setCompareIdA(e.target.value); if (compareIdB) loadCompare(e.target.value, compareIdB) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="">Select version...</option>
                {versionHistory.map(v => (
                  <option key={v.id} value={v.id}>v{v.version}{v.is_current_version ? ' (current)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Version B</label>
              <select
                value={compareIdB}
                onChange={e => { setCompareIdB(e.target.value); if (compareIdA) loadCompare(compareIdA, e.target.value) }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="">Select version...</option>
                {versionHistory.map(v => (
                  <option key={v.id} value={v.id}>v{v.version}{v.is_current_version ? ' (current)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {compareLoading && (
            <p className="text-sm text-gray-500 text-center py-6">Loading comparison...</p>
          )}

          {compareData && !compareLoading && (
            <div className="grid grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto border border-gray-100 rounded-lg p-3">
              {['a', 'b'].map(side => (
                <div key={side}>
                  <p className="text-xs font-bold text-navy mb-3 uppercase tracking-wide">
                    v{compareData[side].recipe?.version}
                    {compareData[side].recipe?.is_current_version ? ' — Current' : ''}
                  </p>
                  {ADDITION_TYPES.map(addType => {
                    const sLines = (compareData[side].lines ?? []).filter(l => l.addition_type === addType)
                    if (!sLines.length) return null
                    return (
                      <div key={addType} className="mb-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">{addType}</p>
                        {sLines.map(l => (
                          <p key={l.id} className="text-xs text-gray-700 py-0.5">
                            {l.ingredient_name} — {l.amount} {l.unit}
                          </p>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {!compareData && !compareLoading && (
            <p className="text-sm text-gray-400 text-center py-6">Select two versions above to compare their ingredients side by side.</p>
          )}
        </div>
      </ModalShell>

      {/* Add Ingredient modal — opens when any section's "+ Add Ingredient" button is clicked */}
      <AddIngredientModal
        isOpen={addingTo !== null}
        addType={addingTo}
        library={library}
        form={newLineForm}
        setForm={setNewLineForm}
        error={newLineError}
        saving={newLineSaving}
        onChange={(field, val) => setNewLineForm(p => ({ ...p, [field]: val }))}
        onSubmit={handleSaveNewLine}
        onClose={cancelAddLine}
        totalPints={costs.totalPints ?? 0}
        lines={lines}
      />

      {/* Edit Ingredient modal — opens when the pencil button on an ingredient row is clicked */}
      <AddIngredientModal
        isOpen={editIngredientTarget !== null}
        addType={editIngredientTarget?.addition_type}
        library={library}
        form={editLineForm ?? emptyNewLine('Mash')}
        setForm={setEditLineForm}
        error={editLineError}
        saving={editLineSaving}
        onChange={(field, val) => setEditLineForm(p => ({ ...p, [field]: val }))}
        onSubmit={handleSaveEditLine}
        onClose={() => { setEditIngredientTarget(null); setEditLineError('') }}
        isEditMode={true}
        editTarget={editIngredientTarget}
        totalPints={costs.totalPints ?? 0}
        lines={lines}
      />
    </div>
  )
}

// ─── RecipeChecklist ──────────────────────────────────────────────────────────

function RecipeChecklist({ recipe, ingredients, packagingSplits, batchBarrels }) {
  const [open, setOpen] = useState(true)

  const required    = []
  const recommended = []

  // Mash: any ingredient with category containing 'Mash', 'Grain', or 'Adjunct'
  const hasMash = ingredients.some(i => /mash|grain|adjunct/i.test(i.category || ''))
  if (!hasMash) required.push('No mash ingredients added')

  // Hops: any ingredient with category containing 'Hop'
  const hasHops = ingredients.some(i => /hop/i.test(i.category || ''))
  if (!hasHops) required.push('No hop additions added')

  // Yeast: any ingredient with category = 'Yeast'
  const hasYeast = ingredients.some(i => /yeast/i.test(i.category || ''))
  if (!hasYeast) required.push('No yeast strain added')

  if (!recipe.target_og) required.push('Target OG not set')
  if (!recipe.target_fg) required.push('Target FG not set')
  if (!batchBarrels || parseFloat(batchBarrels) <= 0) required.push('Batch size not set')

  // Costs: at least one ingredient has a non-zero price_per_unit
  const hasCosts = ingredients.some(i => parseFloat(i.price_per_unit) > 0)
  if (!hasCosts) recommended.push('No ingredient costs set — add ingredients to inventory for cost tracking')

  // Splits total: if splits exist, sum volume_barrels and compare to batchBarrels
  if (packagingSplits.length > 0 && batchBarrels > 0) {
    const total = packagingSplits.reduce((s, p) => s + (parseFloat(p.volume_barrels) || 0), 0)
    if (Math.abs(total - parseFloat(batchBarrels)) > 0.01) {
      recommended.push('Packaging splits do not total full batch volume')
    }
  }

  const allClear = required.length === 0 && recommended.length === 0

  if (allClear) {
    return (
      <div className="flex items-center gap-2 text-sm text-success font-medium bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
        <span>✓ Recipe ready to brew</span>
      </div>
    )
  }

  return (
    <div className="bg-amber/5 border border-amber/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-amber/10 transition-colors"
      >
        <span className="text-sm font-semibold text-amber">
          ⚠ Recipe Checklist — {required.length + recommended.length} item{required.length + recommended.length !== 1 ? 's' : ''} need attention
        </span>
        <span className="text-amber text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5">
          {required.map((msg, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-danger mt-0.5 shrink-0">●</span>
              <span className="text-gray-700">{msg}</span>
            </div>
          ))}
          {recommended.map((msg, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-amber mt-0.5 shrink-0">●</span>
              <span className="text-gray-700">{msg}</span>
            </div>
          ))}
          {required.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">Red items are required to brew. Amber items are recommended for costing.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AdditionSection ──────────────────────────────────────────────────────────

function AdditionSection({
  addType, lines, allLines, library, batchSize, baseBatchSize,
  isReadOnly, ReadOnlyTooltip,
  acLineId, acResults, onIngNameInput, onAcSelect, onAcClose,
  onUpdateLine, onSaveLineField, onRemoveLine, onMoveLine,
  onStartAdding, onEditLine,
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="text-sm font-bold text-navy">{addType}</h3>
        <span className="text-xs text-gray-400">{lines.length} ingredient{lines.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Ingredient rows */}
      {lines.length === 0 && (
        <p className="px-5 py-3 text-sm text-gray-400">No ingredients in this section.</p>
      )}

      {lines.map((line, idx) => (
        <IngredientRow
          key={line.id}
          line={line}
          sectionLines={lines}
          idx={idx}
          library={library}
          batchSize={batchSize}
          baseBatchSize={baseBatchSize}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          isAcOpen={acLineId === line.id}
          acResults={acResults}
          onIngNameInput={onIngNameInput}
          onAcSelect={onAcSelect}
          onAcClose={onAcClose}
          onUpdateLine={onUpdateLine}
          onSaveLineField={onSaveLineField}
          onRemoveLine={onRemoveLine}
          onMoveLine={onMoveLine}
          onEditLine={onEditLine}
        />
      ))}

      {/* Add ingredient button — opens the modal */}
      {!isReadOnly && (
        <div className="px-5 py-3 border-t border-gray-100">
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={() => onStartAdding(addType)}
              className="text-sm text-amber hover:text-amber-dark font-medium transition-colors"
            >
              + Add Ingredient
            </button>
          </ReadOnlyTooltip>
        </div>
      )}
    </div>
  )
}

// ─── IngredientRow ────────────────────────────────────────────────────────────

function IngredientRow({
  line, sectionLines, idx, library, batchSize, baseBatchSize,
  isReadOnly, ReadOnlyTooltip,
  isAcOpen, acResults, onIngNameInput, onAcSelect, onAcClose,
  onUpdateLine, onSaveLineField, onRemoveLine, onMoveLine, onEditLine,
}) {
  const pricePerUnit   = parseFloat(line.supplier?.price_per_unit ?? line.ingredient?.current_price_per_unit ?? line._priceOverride ?? 0)
  const scaledAmount   = calculateScaledAmount(line.amount, baseBatchSize, batchSize, line.scale_with_batch)
  const lineCost       = scaledAmount * pricePerUnit

  // Inventory data for this ingredient
  const libIng = library.find(i => i.id === line.ingredient_id)

  // Inventory status — compared against the current scaled recipe amount
  const stockQty  = libIng != null ? parseFloat(libIng.current_stock_quantity) || 0 : null
  const reorderAt = libIng != null ? parseFloat(libIng.reorder_threshold) || 0 : null
  const stockUnit = libIng?.unit ?? ''
  // stockStatus is derived from both stock level AND how much this recipe needs
  const stockStatus = stockQty === null ? null              // not in inventory → show nothing
    : stockQty === 0             ? 'insufficient'           // out of stock
    : scaledAmount > stockQty   ? 'insufficient'           // have some but not enough
    : reorderAt > 0 && (stockQty - scaledAmount) <= reorderAt ? 'reorder'  // enough, but will hit reorder threshold
    : 'ok'                                                  // plenty in stock

  return (
    <div className="border-t border-gray-100 px-5 py-3 space-y-2">
      {/* Row 1: name + amount + unit */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_90px_80px] gap-2 items-start">

        {/* Ingredient name with autocomplete + inventory status */}
        <div className="relative">
          <input
            type="text"
            value={line.ingredient_name}
            onChange={e => onIngNameInput(line.id, e.target.value)}
            onFocus={() => onIngNameInput(line.id, line.ingredient_name)}
            onBlur={() => {
              onSaveLineField(line.id, 'ingredient_name', line.ingredient_name)
              setTimeout(onAcClose, 150)
            }}
            placeholder="Ingredient name..."
            disabled={isReadOnly}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:opacity-60"
          />
          {isAcOpen && acResults.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {acResults.map(ing => (
                <button
                  key={ing.id}
                  type="button"
                  onMouseDown={() => onAcSelect(line.id, ing)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber/10 flex items-center justify-between"
                >
                  <span className="font-medium text-navy">{ing.name}</span>
                  <span className="text-xs text-gray-400">{ing.category}</span>
                </button>
              ))}
            </div>
          )}
          {stockStatus === 'ok' && (
            <p className="text-[11px] text-success mt-0.5">
              ✓ {stockQty.toFixed(2)} {stockUnit} in stock
            </p>
          )}
          {stockStatus === 'reorder' && (
            <p className="text-[11px] text-amber mt-0.5">
              ⚠ {stockQty.toFixed(2)} {stockUnit} in stock — will trigger reorder after brew
            </p>
          )}
          {stockStatus === 'insufficient' && stockQty > 0 && (
            <p className="text-[11px] text-danger mt-0.5">
              ✗ Only {stockQty.toFixed(2)} {stockUnit} in stock — need {scaledAmount.toFixed(2)} {stockUnit}
            </p>
          )}
          {stockStatus === 'insufficient' && stockQty === 0 && (
            <p className="text-[11px] text-danger mt-0.5">
              ✗ Out of stock — need {scaledAmount.toFixed(2)} {stockUnit}
            </p>
          )}
        </div>

        {/* Scaled amount (display only) with base amount editable on hover */}
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Amount (scaled)</p>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="any"
              min="0"
              value={line.amount}
              onChange={e => onUpdateLine(line.id, 'amount', e.target.value)}
              onBlur={e => onSaveLineField(line.id, 'amount', parseFloat(e.target.value) || 0)}
              disabled={isReadOnly}
              className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber disabled:opacity-60"
              title="Base amount"
            />
            {!line.scale_with_batch && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1 rounded">Fixed</span>
            )}
          </div>
          <p className="text-xs text-amber font-medium mt-0.5">{scaledAmount.toFixed(3)} scaled</p>
        </div>

        {/* Unit */}
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Unit</p>
          <UnitSelect
            value={line.unit}
            onChange={e => { onUpdateLine(line.id, 'unit', e.target.value); onSaveLineField(line.id, 'unit', e.target.value) }}
            disabled={isReadOnly}
            className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber disabled:opacity-60"
          />
        </div>

        {/* Line cost */}
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-0.5">Cost</p>
          <p className="text-sm font-bold text-navy">{formatDollars(lineCost)}</p>
          {pricePerUnit > 0 && (
            <p className="text-xs text-gray-400">${pricePerUnit.toFixed(4)}/{line.unit}</p>
          )}
        </div>
      </div>

      {/* Row 2: addition time, scale toggle, reorder, remove */}
      <div className="flex flex-wrap gap-2 items-center">

        {/* Addition time */}
        <input
          type="text"
          value={line.addition_time ?? ''}
          onChange={e => onUpdateLine(line.id, 'addition_time', e.target.value)}
          onBlur={e => onSaveLineField(line.id, 'addition_time', e.target.value || null)}
          placeholder="Time (e.g. 60 min)"
          disabled={isReadOnly}
          className="text-xs border border-gray-200 rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-amber disabled:opacity-60"
        />

        {/* Scale toggle */}
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={line.scale_with_batch}
            disabled={isReadOnly}
            onChange={e => {
              onUpdateLine(line.id, 'scale_with_batch', e.target.checked)
              onSaveLineField(line.id, 'scale_with_batch', e.target.checked)
            }}
            className="rounded border-gray-300 text-amber focus:ring-amber"
          />
          <span className="text-gray-500">Scale</span>
        </label>

        {/* Reorder buttons */}
        <div className="flex gap-0.5 ml-auto">
          <button
            onClick={() => onMoveLine(line.id, -1)}
            disabled={idx === 0 || isReadOnly}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs px-1"
            title="Move up"
          >▲</button>
          <button
            onClick={() => onMoveLine(line.id, 1)}
            disabled={idx === sectionLines.length - 1 || isReadOnly}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs px-1"
            title="Move down"
          >▼</button>
        </div>

        {/* Edit */}
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={() => onEditLine(line)}
            disabled={isReadOnly}
            className="text-[11px] text-amber/70 hover:text-amber font-medium px-1 disabled:opacity-30 transition-colors"
          >
            ✏ Edit
          </button>
        </ReadOnlyTooltip>

        {/* Remove */}
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={() => onRemoveLine(line.id)}
            disabled={isReadOnly}
            className="text-[11px] text-danger/60 hover:text-danger font-medium px-1 disabled:opacity-30 transition-colors"
          >
            🗑 Remove
          </button>
        </ReadOnlyTooltip>

      </div>
    </div>
  )
}

// ─── PintGlassVisualization ───────────────────────────────────────────────────

function PintGlassVisualization({ costs }) {
  const {
    suggestedRetail = 0, trueCostPerPint = 0, exciseTaxPerPint = 0,
    grainCostPerPint = 0, hopsCostPerPint = 0,
    yeastCostPerPint = 0, otherIngCostPerPint = 0,
    packagingCostPerPint = 0,
    brewLaborPerPint = 0, packagingLaborPerPint = 0,
    fixedOverheadPerPint = 0, variableOverheadPerPint = 0,
  } = costs

  const marginCPP = Math.max(0, suggestedRetail - trueCostPerPint)

  const allLayers = [
    { label: 'Grain & Malt',       color: '#92400E', costPerPint: grainCostPerPint },
    { label: 'Hops',               color: '#16A34A', costPerPint: hopsCostPerPint },
    { label: 'Yeast',              color: '#CA8A04', costPerPint: yeastCostPerPint },
    { label: 'Other Ingredients',  color: '#2563EB', costPerPint: otherIngCostPerPint },
    { label: 'Packaging',          color: '#64748B', costPerPint: packagingCostPerPint },
    { label: 'Brew Labor',         color: '#EA580C', costPerPint: brewLaborPerPint },
    { label: 'Packaging Labor',    color: '#F97316', costPerPint: packagingLaborPerPint },
    { label: 'Fixed Overhead',     color: '#7C3AED', costPerPint: fixedOverheadPerPint },
    { label: 'Variable Overhead',  color: '#A855F7', costPerPint: variableOverheadPerPint },
    { label: 'Excise Tax',         color: '#D97706', costPerPint: exciseTaxPerPint },
    { label: "Brewer's Margin",    color: '#1A2744', costPerPint: marginCPP },
  ]
  const filledLayers   = allLayers.filter(l => l.costPerPint > 0.000001)
  const hasEmptyLayers = filledLayers.length < allLayers.length

  if (!suggestedRetail || suggestedRetail <= 0 || filledLayers.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-gray-400">
        Add ingredients and set a target margin to see your pint breakdown.
      </div>
    )
  }

  // SVG coordinate constants — wider glass, shifted left for right-side labels
  const VW = 600, VH = 580
  const GT = 20, GB = 560       // glass top / bottom y (height = 540)
  const GH = GB - GT            // 540
  const CX = 180                // glass center x (shifted left)
  const HWT = 140, HWB = 110   // half-widths at top / bottom → 280px top, 220px bottom

  const FOAM_H = 50
  const BT = GT + FOAM_H        // beer top y = 70
  const BH = GB - BT            // beer height = 490

  function gLeft(y)  { return CX - HWT + (HWT - HWB) * (y - GT) / GH }
  function gRight(y) { return CX + HWT - (HWT - HWB) * (y - GT) / GH }

  const glassPath = `M${CX - HWT},${GT} L${CX + HWT},${GT} L${CX + HWB},${GB} Q${CX},${GB + 14} ${CX - HWB},${GB} Z`
  const foamPath  = [
    `M${gLeft(BT)},${BT}`,
    `Q${CX - 52},${BT - 30} ${CX},${BT - 26}`,
    `Q${CX + 52},${BT - 22} ${gRight(BT)},${BT}`,
    `L${CX + HWT},${GT} L${CX - HWT},${GT} Z`,
  ].join(' ')

  // Compute layer rects from bottom to top (filled layers only)
  let curY = GB
  const layerRects = [...filledLayers].reverse().map(layer => {
    const h    = Math.max((layer.costPerPint / suggestedRetail) * BH, 1)
    const topY = Math.max(curY - h, BT)
    const actualH = curY - topY
    const midY = topY + actualH / 2
    curY = topY
    return { ...layer, topY, h: actualH, midY }
  }).reverse()

  // Spread right-side label Y positions — 30px minimum gap
  const MIN_GAP = 30
  const naturalYs = layerRects.map(lr => Math.min(Math.max(lr.midY, GT + 14), GB - 14))

  function spreadPositions(ys) {
    const pts = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
    for (let k = 1; k < pts.length; k++) {
      if (pts[k].y - pts[k - 1].y < MIN_GAP) pts[k].y = pts[k - 1].y + MIN_GAP
    }
    for (let k = pts.length - 2; k >= 0; k--) {
      if (pts[k + 1].y - pts[k].y < MIN_GAP) pts[k].y = pts[k + 1].y - MIN_GAP
    }
    const out = new Array(ys.length)
    for (const { y, i } of pts) out[i] = y
    return out
  }

  const labelYs = spreadPositions(naturalYs)
  const LABEL_X = 345   // right-side label text start x

  return (
    <div>
      <div className="px-4 pt-3 pb-1 flex items-baseline justify-between border-b border-gray-100">
        <p className="text-sm font-bold text-navy">What's in Your Pint?</p>
        <p className="text-xs text-gray-400">Retail ${suggestedRetail.toFixed(2)}</p>
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <clipPath id="glassClip" clipPathUnits="userSpaceOnUse">
            <path d={glassPath} />
          </clipPath>
        </defs>

        {/* Glass background tint */}
        <path d={glassPath} fill="#EFF6FF" opacity="0.4" />

        {/* Beer layers — clipped to glass, width interpolated at each layer's top edge */}
        <g clipPath="url(#glassClip)">
          {layerRects.map(lr => {
            const lx = gLeft(lr.topY)
            const rx = gRight(lr.topY)
            return <rect key={lr.label} x={lx} y={lr.topY} width={rx - lx} height={lr.h} fill={lr.color} opacity="0.88" />
          })}
          <path d={foamPath} fill="#FFF8E7" />
        </g>

        {/* Glass outline */}
        <path d={glassPath} fill="none" stroke="#94A3B8" strokeWidth="2" />

        {/* Shine */}
        <line x1={gLeft(GT) + 10} y1={GT + 14} x2={gLeft(GB) + 8} y2={GB - 24}
          stroke="white" strokeWidth="6" opacity="0.35" clipPath="url(#glassClip)" />

        {/* Foam label */}
        <text x={CX} y={BT - 7} textAnchor="middle" fontSize="13" fill="#92400E" fontWeight="500">Foam</text>

        {/* Right-side layer labels — single connector from glass right edge to label */}
        {layerRects.map((lr, i) => {
          const lY       = labelYs[i]
          const anchorX  = gRight(Math.min(Math.max(lr.midY, GT + 1), GB - 1))
          const anchorY  = lr.midY
          const pct      = suggestedRetail > 0 ? (lr.costPerPint / suggestedRetail * 100).toFixed(1) : '0.0'
          return (
            <g key={lr.label}>
              {/* Colored dot at glass right edge */}
              <circle cx={anchorX} cy={anchorY} r="3.5" fill={lr.color} />
              {/* Dashed connector: from glass right edge → elbow at x=325 → to label */}
              <polyline
                points={`${anchorX + 4},${anchorY} 325,${anchorY} 325,${lY} ${LABEL_X - 4},${lY}`}
                fill="none" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="3,3"
              />
              {/* Label line 1: name + cost */}
              <text x={LABEL_X} y={lY} textAnchor="start" fontSize="13" fill="#1A2744" fontWeight="600">
                {lr.label} · ${lr.costPerPint.toFixed(3)}
              </text>
              {/* Label line 2: percentage */}
              <text x={LABEL_X} y={lY + 15} textAnchor="start" fontSize="11" fill="#6B7280">
                {pct}% of retail
              </text>
            </g>
          )
        })}
      </svg>

      {/* Color legend */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {allLayers.map(l => (
            <div key={l.label} className="flex items-center gap-1.5" style={{ opacity: l.costPerPint > 0.000001 ? 1 : 0.4 }}>
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color }} />
              <span className="text-[13px] text-gray-500 leading-tight">
                {l.label}{l.costPerPint <= 0.000001 && <span className="text-gray-400"> (not set)</span>}
              </span>
            </div>
          ))}
        </div>
        {hasEmptyLayers && (
          <p className="text-xs text-gray-400 mt-2 text-center">⬜ Grayed items not yet entered in cost calculator</p>
        )}
      </div>
    </div>
  )
}

// ─── CostPanel ────────────────────────────────────────────────────────────────

function CostPanel({
  costs,
  batchBarrels,
  packagingSplits, onSplitsChange,
  packagingContainerType, packagingCostPerUnit, labelCostPerUnit, carrierCostPerUnit, packagingYieldPct,
  brewers, brewHoursPerBrewer, laborRatePerHour,
  packagingHours, packagingLaborRate,
  monthlyFixedOverhead, batchesPerMonth, variableOverheadPerBbl,
  marginPct, taxRate, exciseTaxRatePerBbl, brewery,
  onChange, onBlur, onSaveToProfile,
}) {
  const [packagingOpen, setPackagingOpen] = useState(true)
  const [laborOpen,     setLaborOpen]     = useState(false)
  const [overheadOpen,  setOverheadOpen]  = useState(false)
  const [overheadInfoOpen, setOverheadInfoOpen] = useState(false)

  const grossPct    = costs.grossMargin?.percentage ?? 0
  const targetPct   = parseFloat(marginPct) || 65
  const marginColor = grossPct >= targetPct ? 'text-success' : grossPct >= targetPct - 5 ? 'text-warning' : 'text-danger'
  const marginBg    = grossPct >= targetPct ? 'bg-green-50 border-success' : grossPct >= targetPct - 5 ? 'bg-orange-50 border-warning' : 'bg-red-50 border-danger'

  const hasSplits     = packagingSplits && packagingSplits.length > 0
  const unitsProduced = costs.unitsProduced

  const ppc              = !hasSplits && packagingContainerType ? pintsPerContainer(packagingContainerType) : null
  const retailPerUnit    = ppc != null ? costs.suggestedRetail * ppc : null
  const costPerUnit      = !hasSplits && unitsProduced > 0 ? costs.totalCost / unitsProduced : null
  const projectedRevenue = retailPerUnit != null && unitsProduced ? retailPerUnit * unitsProduced : null
  const projectedProfit  = costPerUnit != null && retailPerUnit != null && unitsProduced
    ? (retailPerUnit - costPerUnit) * unitsProduced : null

  const totalLaborCost    = (costs.totalBrewLaborCost ?? 0) + (costs.totalPackagingLaborCost ?? 0)
  const totalOverheadCost = (costs.fixedOverheadPerBatch ?? 0) + (costs.variableOverheadTotal ?? 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden text-xs">
      <div className="divide-y divide-gray-100">
      <div className="px-4 py-3">
        <h3 className="font-bold text-navy text-sm">Cost Calculator</h3>
      </div>

      {/* ── Section 1: Ingredient Costs ── */}
      <div className="px-4 py-3 space-y-1.5">
        <p className="font-semibold text-gray-500 uppercase tracking-wide">Ingredient Costs</p>
        {(costs.lineCosts ?? []).filter(lc => lc.totalCost > 0 || lc.effectiveCost > 0).map(lc => (
          <div key={lc.id} className="flex items-center justify-between gap-2">
            <span className="text-gray-600 truncate">{lc.name || '(unnamed)'}</span>
            <span className="text-navy font-medium shrink-0">{formatDollars(lc.totalCost)}</span>
          </div>
        ))}
        <CostRow label="Ingredient subtotal" value={costs.ingredientCost} bold />
      </div>

      {/* ── Section 2: Packaging ── */}
      <SectionToggle title="Packaging" subtotal={costs.packagingCost} open={packagingOpen} onToggle={() => setPackagingOpen(v => !v)}>
        <PackagingSplitsEditor
          splits={packagingSplits ?? []}
          defaultYield={packagingYieldPct}
          batchBarrels={batchBarrels}
          onChange={onSplitsChange}
        />
        <CostRow label="Packaging subtotal" value={costs.packagingCost} bold />
      </SectionToggle>

      {/* ── Section 3: Production Labor ── */}
      <SectionToggle title="Production Labor" subtotal={totalLaborCost} open={laborOpen} onToggle={() => setLaborOpen(v => !v)}>
        <p className="text-[10px] text-gray-400 mb-2">Brew Labor</p>
        <NumField label="Brewers on shift" value={brewers} onChange={v => onChange('brewers', v)} onBlur={onBlur} />
        <NumField label="Hours per brewer" value={brewHoursPerBrewer} onChange={v => onChange('brewHoursPerBrewer', v)} onBlur={onBlur} />
        <NumField label="Labor rate/hour ($)" value={laborRatePerHour} onChange={v => onChange('laborRatePerHour', v)} onBlur={onBlur} />
        <CostRow label="Brew labor subtotal" value={costs.totalBrewLaborCost} />
        <p className="text-[10px] text-gray-400 mt-2 mb-1">Packaging Labor</p>
        <NumField label="Packaging hours/batch" value={packagingHours} onChange={v => onChange('packagingHours', v)} onBlur={onBlur} />
        <NumField label="Packaging labor rate/hour ($)" value={packagingLaborRate} onChange={v => onChange('packagingLaborRate', v)} onBlur={onBlur} />
        <CostRow label="Packaging labor subtotal" value={costs.totalPackagingLaborCost} />
        <div className="border-t border-gray-100 pt-1 mt-1">
          <CostRow label="Total labor" value={totalLaborCost} bold />
        </div>
      </SectionToggle>

      {/* ── Section 4: Overhead ── */}
      <SectionToggle title="Overhead" subtotal={totalOverheadCost} open={overheadOpen} onToggle={() => setOverheadOpen(v => !v)}>
        {/* Collapsible explainer */}
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setOverheadInfoOpen(v => !v)}
            className="text-[10px] text-amber font-medium flex items-center gap-1"
          >
            {overheadInfoOpen ? '▾' : '▸'} What counts as overhead?
          </button>
          {overheadInfoOpen && (
            <div className="mt-1 p-2 bg-amber/5 rounded text-[10px] text-gray-500 leading-snug space-y-1">
              <p><strong>Fixed overhead</strong> — rent, equipment depreciation, insurance, licenses, office admin. Enter your total monthly fixed costs and how many batches you brew per month.</p>
              <p><strong>Variable overhead</strong> — utilities (electricity, gas, CO2), water &amp; wastewater, cleaning chemicals, QC lab. Enter a per-barrel rate so it scales with batch size.</p>
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mb-1">Fixed Overhead</p>
        <NumField
          label="Monthly fixed costs ($)"
          tooltip="Rent, equipment depreciation, insurance, licenses, loan payments — costs that don't change with batch volume."
          value={monthlyFixedOverhead}
          onChange={v => onChange('monthlyFixedOverhead', v)}
          onBlur={onBlur}
        />
        <NumField
          label="Batches brewed per month"
          tooltip="Used to allocate your monthly fixed overhead across individual batches."
          value={batchesPerMonth}
          onChange={v => onChange('batchesPerMonth', v)}
          onBlur={onBlur}
        />
        <CostRow label="Fixed overhead per batch" value={costs.fixedOverheadPerBatch} />
        <p className="text-[10px] text-gray-400 mt-2 mb-1">Variable Overhead</p>
        <NumField
          label="Variable overhead/barrel ($)"
          tooltip="Utilities, water, wastewater, cleaning chemicals, and QC costs per barrel produced. Scales with batch size."
          value={variableOverheadPerBbl}
          onChange={v => onChange('variableOverheadPerBbl', v)}
          onBlur={onBlur}
        />
        <CostRow label="Variable overhead this batch" value={costs.variableOverheadTotal} />
        <div className="border-t border-gray-100 pt-1 mt-1">
          <CostRow label="Total overhead" value={totalOverheadCost} bold />
        </div>
        {onSaveToProfile && (
          <button
            type="button"
            onClick={onSaveToProfile}
            className="mt-2 text-[10px] text-amber font-medium hover:underline"
          >
            Save labor &amp; overhead as brewery defaults →
          </button>
        )}
      </SectionToggle>

      {/* ── Cost Summary ── */}
      <div className="px-4 py-3 space-y-1">
        <p className="font-semibold text-gray-500 uppercase tracking-wide mb-2">Cost Summary</p>
        <CostRow label="Ingredient costs"    value={costs.ingredientCost} />
        <CostRow label="Packaging costs"     value={costs.packagingCost} />
        <CostRow label="Production labor"    value={totalLaborCost} />
        <CostRow label="Overhead"            value={totalOverheadCost} />
        <CostRow label="Total production cost" value={costs.totalCost} bold />
        <div className="border-t border-gray-100 pt-1 mt-1">
          <p className="text-[10px] text-gray-400 mb-1">Per pint breakdown</p>
          <CostRow label="Ingredients"        value={costs.ingredientCostPerPint} />
          <CostRow label="Packaging"          value={costs.packagingCostPerPint} />
          <CostRow label="Labor"              value={(costs.brewLaborPerPint ?? 0) + (costs.packagingLaborPerPint ?? 0)} />
          <CostRow label="Fixed overhead"     value={costs.fixedOverheadPerPint} />
          <CostRow label="Variable overhead"  value={costs.variableOverheadPerPint} />
          <div className="flex justify-between gap-2 text-amber font-medium">
            <span>Federal excise tax</span>
            <span>+${(costs.exciseTaxPerPint ?? 0).toFixed(4)}</span>
          </div>
          <CostRow label="True cost per pint" value={costs.trueCostPerPint} bold />
        </div>
      </div>

      {/* ── Federal Excise Tax ── */}
      <div className="mx-3 my-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-navy text-xs">Federal Excise Tax</span>
          <span className="text-gray-500 text-[10px]">
            {brewery?.annual_production_estimate
              ? (brewery.annual_production_estimate <= FEDERAL_EXCISE_TAX_RATES.THRESHOLD_BARRELS ? 'Small Brewer Rate' : 'Standard Rate')
              : 'Set in TTB Tracker'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-gray-600 block mb-0.5">Rate per barrel ($)</label>
            <input
              type="number" step="0.01" min="0"
              value={exciseTaxRatePerBbl}
              onChange={e => onChange('exciseTaxRatePerBbl', parseFloat(e.target.value) || 0)}
              onBlur={onBlur}
              className="w-full border border-amber-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber bg-white"
            />
          </div>
          <div>
            <label className="text-gray-600 block mb-0.5">Batch size</label>
            <p className="text-sm font-medium text-navy mt-1">{(batchBarrels || 0).toFixed(2)} bbl</p>
          </div>
        </div>
        <div className="border-t border-amber-200 pt-2 grid grid-cols-2 gap-2">
          <div>
            <p className="text-gray-500">Batch total</p>
            <p className="font-bold text-amber-700">${(costs.exciseTaxBatchTotal ?? 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Per pint</p>
            <p className="font-bold text-amber-700">${(costs.exciseTaxPerPint ?? 0).toFixed(4)}</p>
          </div>
        </div>
        {!brewery?.annual_production_estimate && (
          <p className="text-amber-700 mt-2">
            → <a href="/ttb" className="underline">Set annual production in TTB Tracker</a> to auto-set your rate.
          </p>
        )}
        <p className="text-gray-400 mt-2 leading-tight">
          Federal excise tax is owed when beer leaves your brewery for sale. Small brewers pay $3.50/bbl on the first 60,000 bbl removed per year.
        </p>
      </div>

      {/* ── Pricing ── */}
      <div className="px-4 py-3 space-y-2">
        <p className="font-semibold text-gray-500 uppercase tracking-wide">Pricing</p>
        <div className="flex items-center justify-between gap-2">
          <label className="text-gray-600">Target margin</label>
          <div className="flex items-center gap-1">
            <input type="number" min="0" max="99" step="0.1" value={marginPct}
              onChange={e => onChange('marginPct', e.target.value)} onBlur={onBlur}
              className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber" />
            <span className="text-gray-400">%</span>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Suggested retail</span>
          <span className="font-semibold text-navy">{formatDollars(costs.suggestedRetail)}/pint</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-gray-600">Sales Tax %</label>
            <div className="flex items-center gap-1">
              <input type="number" min="0" max="30" step="0.1" value={taxRate}
                onChange={e => onChange('taxRate', e.target.value)} onBlur={onBlur}
                className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber" />
              <span className="text-gray-400">%</span>
            </div>
          </div>
          {brewery?.state && (() => {
            const code = STATE_ABBR[brewery.state]
            const rate = code !== undefined ? STATE_SALES_TAX[code] : undefined
            return rate !== undefined ? (
              <p className="text-[10px] text-gray-400 leading-tight">
                Pre-populated with {brewery.state} base state rate ({rate}%). Adjust for local city/county taxes.
              </p>
            ) : null
          })()}
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tax-inclusive retail</span>
          <span className="font-semibold text-navy">{formatDollars(costs.taxInclusivePrice)}/pint</span>
        </div>
      </div>

      {/* ── Gross Margin ── */}
      <div className={`px-4 py-3 border-t ${marginBg}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold">Gross Margin</span>
          <span className={`text-lg font-bold ${marginColor}`}>{formatPct(grossPct)}</span>
        </div>
        <p className="text-gray-500 mt-0.5">{formatDollars(costs.grossMargin?.dollars ?? 0)} per pint profit</p>
        {grossPct < targetPct && (
          <p className={`mt-1 font-medium ${marginColor}`}>
            {targetPct - grossPct > 5 ? '⚠️ Below target' : '⚡ Close to target'}
          </p>
        )}
      </div>

      {/* ── Packaged output ── */}
      {hasSplits && (costs.splitOutputs ?? []).length > 0 ? (
        <div className="px-4 py-3 bg-amber/5 space-y-4">
          <p className="font-semibold text-gray-500 uppercase tracking-wide">Packaged Output by Split</p>
          {costs.splitOutputs.map((s, idx) => (
            <div key={idx} className="space-y-1 border-t border-amber/10 pt-2 first:border-t-0 first:pt-0">
              <p className="font-semibold text-navy text-xs">
                {s.container_type || 'Split ' + (idx + 1)}
                {s.container_size_label ? ` — ${s.container_size_label}` : ''}
                {s.units != null ? ` (~${s.units.toLocaleString()} units)` : ''}
              </p>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Volume</span>
                <span className="font-semibold text-navy">{parseFloat(s.volume_barrels || 0).toFixed(3)} bbl</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">% of batch</span>
                <span className="font-semibold text-navy">{(s.splitPct ?? 0).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Units produced</span>
                <span className="font-semibold text-navy">{(s.units ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              {s.splitPackCost > 0 && <CostRow label="Packaging cost" value={s.splitPackCost} />}
              {s.costPerUnit != null && <CostRow label="Cost per unit" value={s.costPerUnit} />}
              {s.retailPerUnit != null && <CostRow label="Suggested retail/unit" value={s.retailPerUnit} />}
            </div>
          ))}
          {unitsProduced > 0 && (
            <div className="border-t border-amber/20 pt-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-navy">Total units (all splits)</span>
                <span className="text-navy">{unitsProduced.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        unitsProduced != null && unitsProduced > 0 && (
          <div className="px-4 py-3 bg-amber/5 space-y-1.5">
            <p className="font-semibold text-gray-500 uppercase tracking-wide">Packaged Output ({packagingContainerType})</p>
            <div className="flex justify-between">
              <span className="text-gray-600">Estimated units</span>
              <span className="font-semibold text-navy">{unitsProduced.toLocaleString()}</span>
            </div>
            {costPerUnit != null   && <CostRow label="Cost per unit"             value={costPerUnit} />}
            {retailPerUnit != null && <CostRow label="Suggested retail per unit" value={retailPerUnit} />}
            {projectedRevenue != null && <CostRow label="Projected revenue (full sell-through)" value={projectedRevenue} bold />}
            {projectedProfit != null  && <CostRow label="Projected gross profit"                value={projectedProfit} bold />}
          </div>
        )
      )}
      </div>
    </div>
  )
}

// ─── PackagingSplitsEditor ────────────────────────────────────────────────────
// Lets the brewer split one batch across multiple container types using volume
// (barrels) as the primary input. Percentage is calculated read-only.

const SPLIT_CONTAINER_CATEGORIES = [
  'Draft/Taproom', 'Can', 'Bottle', 'Growler', 'Crowler',
  'Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel', 'Barrel Aging',
  '4-Pack (Cans)', '6-Pack (Cans)', '12-Pack (Cans)', '24-Pack / Case (Cans)',
]

// Size options per container category.
// ozPerUnit: fluid ounces per container (for cans, bottles, pours, growlers).
// bblPerUnit: barrels per container (for kegs).
// ozPerUnit: null means no unit calculation (barrel aging).
const CONTAINER_SIZE_OPTIONS = {
  'Can': [
    { label: '8oz',    ozPerUnit: 8 },
    { label: '10oz',   ozPerUnit: 10 },
    { label: '12oz',   ozPerUnit: 12 },
    { label: '16oz',   ozPerUnit: 16 },
    { label: '19.2oz', ozPerUnit: 19.2 },
    { label: '32oz',   ozPerUnit: 32 },
  ],
  'Bottle': [
    { label: '12oz',  ozPerUnit: 12 },
    { label: '16oz',  ozPerUnit: 16 },
    { label: '22oz',  ozPerUnit: 22 },
    { label: '375ml', ozPerUnit: 12.68 },
    { label: '500ml', ozPerUnit: 16.91 },
    { label: '750ml', ozPerUnit: 25.36 },
    { label: '1L',    ozPerUnit: 33.81 },
  ],
  'Growler': [
    { label: '32oz', ozPerUnit: 32 },
    { label: '64oz', ozPerUnit: 64 },
  ],
  'Crowler': [
    { label: '32oz', ozPerUnit: 32 },
  ],
  'Keg Half Barrel':    [{ label: '1/2 bbl (15.5 gal)',   bblPerUnit: 0.5 }],
  'Keg Quarter Barrel': [{ label: '1/4 bbl (7.75 gal)',   bblPerUnit: 0.25 }],
  'Keg Sixth Barrel':   [
    { label: '1/6 bbl (5.16 gal)',  bblPerUnit: 0.167 },
    { label: 'Slim 1/4 (7.75 gal)', bblPerUnit: 0.25 },
  ],
  'Barrel Aging': [
    { label: 'Bourbon Barrel', ozPerUnit: null },
    { label: 'Wine Barrel',    ozPerUnit: null },
    { label: 'Port Barrel',    ozPerUnit: null },
    { label: 'Rum Barrel',     ozPerUnit: null },
  ],
  'Draft/Taproom': [
    { label: '12oz pour', ozPerUnit: 12 },
    { label: '16oz pour', ozPerUnit: 16 },
    { label: '20oz pour', ozPerUnit: 20 },
  ],
  '4-Pack (Cans)': [
    { label: '4-Pack 12oz',  ozPerPack: 4  * 12 },
    { label: '4-Pack 16oz',  ozPerPack: 4  * 16 },
  ],
  '6-Pack (Cans)': [
    { label: '6-Pack 12oz',  ozPerPack: 6  * 12 },
    { label: '6-Pack 16oz',  ozPerPack: 6  * 16 },
  ],
  '12-Pack (Cans)': [
    { label: '12-Pack 12oz', ozPerPack: 12 * 12 },
    { label: '12-Pack 16oz', ozPerPack: 12 * 16 },
  ],
  '24-Pack / Case (Cans)': [
    { label: 'Case 12oz (24)',  ozPerPack: 24 * 12 },
    { label: 'Case 16oz (24)',  ozPerPack: 24 * 16 },
  ],
}

// Calculate estimated units from a volume + size option + yield percentage.
// Returns null when a calculation is not possible (no size, barrel aging, etc.).
function calcUnitsFromSize(volumeBarrels, sizeOption, packagingYield) {
  if (!sizeOption || !volumeBarrels) return null
  const bbls = parseFloat(volumeBarrels) || 0
  const yld  = (parseFloat(packagingYield) || 85) / 100
  const GALLONS_PER_BBL = 31
  const OZ_PER_GAL = 128

  if (sizeOption.bblPerUnit) {
    return Math.floor((bbls * yld) / sizeOption.bblPerUnit)
  }
  if (sizeOption.ozPerUnit) {
    const totalOz = bbls * GALLONS_PER_BBL * OZ_PER_GAL * yld
    return Math.floor(totalOz / sizeOption.ozPerUnit)
  }
  if (sizeOption.ozPerPack) {
    // ozPerPack = total oz per pack (e.g. 6-Pack 12oz = 72oz)
    const totalOz = bbls * GALLONS_PER_BBL * OZ_PER_GAL * yld
    return Math.floor(totalOz / sizeOption.ozPerPack)
  }
  return null
}

function PackagingSplitsEditor({ splits, defaultYield, batchBarrels, onChange }) {
  function unitLabel(ct) {
    if (!ct) return 'units'
    if (ct.startsWith('Keg'))         return 'kegs'
    if (ct === 'Barrel Aging')        return 'barrels'
    if (ct.includes('Pack') || ct.includes('Case')) return 'packs'
    return 'units'
  }
  const bbls = parseFloat(batchBarrels) || 0
  const totalAllocated = splits.reduce((s, sp) => s + (parseFloat(sp.volume_barrels) || 0), 0)
  const remaining  = bbls - totalAllocated
  const remainColor = Math.abs(remaining) < 0.001 ? 'text-success' : remaining < 0 ? 'text-danger' : 'text-amber'

  function addSplit() {
    onChange([...splits, {
      container_type: '', volume_barrels: '', container_size_label: '', units: null,
      packaging_cost_per_unit: '', label_cost_per_unit: '',
      carrier_cost_per_unit: '', packaging_yield: String(defaultYield ?? 85),
    }])
  }

  function updateSplit(idx, field, val) {
    // Build the next split object, then cascade derived fields.
    const current = splits[idx]
    let updated = { ...current, [field]: val }

    // When container_type changes, reset size label (sizes differ per category)
    if (field === 'container_type') {
      updated = { ...updated, container_size_label: '', units: null }
    }

    // Recalculate units whenever size label, volume, or yield changes
    if (field === 'container_size_label' || field === 'volume_barrels' || field === 'packaging_yield') {
      const sizeLabel = field === 'container_size_label' ? val : updated.container_size_label
      const sizeOptions = CONTAINER_SIZE_OPTIONS[updated.container_type] ?? []
      const sizeOption  = sizeOptions.find(o => o.label === sizeLabel) ?? null
      updated = {
        ...updated,
        units: calcUnitsFromSize(updated.volume_barrels, sizeOption, updated.packaging_yield),
      }
    }

    onChange(splits.map((s, i) => i === idx ? updated : s))
  }

  function removeSplit(idx) {
    onChange(splits.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {splits.length === 0 && (
        <p className="text-xs text-gray-400">No packaging splits defined. Add one below, or leave empty to use single-container mode.</p>
      )}

      {splits.map((split, idx) => {
        const splitVol = parseFloat(split.volume_barrels) || 0
        const splitPct = bbls > 0 ? ((splitVol / bbls) * 100).toFixed(1) : '0.0'
        return (
          <div key={idx} className="border border-gray-200 rounded-lg p-2 space-y-2 text-xs">
            {/* Row 1: container type + volume */}
            <div className="grid grid-cols-[1fr_70px] gap-1.5">
              <div>
                <label className="text-gray-500 mb-0.5 block">Container type</label>
                <select
                  value={split.container_type}
                  onChange={e => updateSplit(idx, 'container_type', e.target.value)}
                  className="w-full border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber"
                >
                  <option value="">Select...</option>
                  {SPLIT_CONTAINER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-500 mb-0.5 block">Volume (bbl)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={split.volume_barrels}
                  onChange={e => updateSplit(idx, 'volume_barrels', e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber"
                />
                {split.units != null && (
                  <p className="text-[11px] mt-0.5 font-medium text-amber">
                    ≈ {split.units.toLocaleString()} {unitLabel(split.container_type)}
                  </p>
                )}
              </div>
            </div>
            {/* Row 2: % of batch (read-only) + container size dropdown */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-gray-500 mb-0.5 block">% of batch</label>
                <div className="border border-gray-100 rounded px-1.5 py-1 bg-gray-50 text-right text-gray-500">
                  {splitPct}%
                </div>
              </div>
              <div>
                <label className="text-gray-500 mb-0.5 block">Container size</label>
                <select
                  value={split.container_size_label || ''}
                  onChange={e => updateSplit(idx, 'container_size_label', e.target.value)}
                  className="w-full border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber"
                >
                  <option value="">Select size…</option>
                  {(CONTAINER_SIZE_OPTIONS[split.container_type] ?? []).map(opt => (
                    <option key={opt.label} value={opt.label}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Row 3: yield + per-unit costs */}
            <div className="grid grid-cols-4 gap-1.5">
              <div>
                <label className="text-gray-500 mb-0.5 block">Yield %</label>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={split.packaging_yield}
                  onChange={e => updateSplit(idx, 'packaging_yield', e.target.value)}
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber"
                />
              </div>
              <div>
                <label className="text-gray-500 mb-0.5 block">Pkg $/unit</label>
                <input
                  type="number" step="0.001" min="0"
                  value={split.packaging_cost_per_unit}
                  onChange={e => updateSplit(idx, 'packaging_cost_per_unit', e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber"
                />
              </div>
              <div>
                <label className="text-gray-500 mb-0.5 block">Label $/unit</label>
                <input
                  type="number" step="0.001" min="0"
                  value={split.label_cost_per_unit}
                  onChange={e => updateSplit(idx, 'label_cost_per_unit', e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber"
                />
              </div>
              <div>
                <label className="text-gray-500 mb-0.5 block">Carrier $/unit</label>
                <input
                  type="number" step="0.001" min="0"
                  value={split.carrier_cost_per_unit}
                  onChange={e => updateSplit(idx, 'carrier_cost_per_unit', e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber"
                />
              </div>
            </div>
            <button type="button" onClick={() => removeSplit(idx)}
              className="text-danger hover:text-red-700 text-[10px] font-medium">
              Remove this split
            </button>
          </div>
        )
      })}

      <button
        type="button"
        onClick={addSplit}
        className="text-amber hover:text-amber-dark font-medium text-xs"
      >
        + Add Packaging Split
      </button>

      {/* Volume allocation totals */}
      {splits.length > 0 && (
        <div className="space-y-0.5 text-xs border-t border-gray-100 pt-2 mt-1">
          <div className="flex justify-between text-gray-500">
            <span>Total allocated</span>
            <span>{totalAllocated.toFixed(3)} bbl</span>
          </div>
          {bbls > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>Total batch</span>
              <span>{bbls.toFixed(3)} bbl</span>
            </div>
          )}
          {bbls > 0 && (
            <div className={`flex justify-between font-semibold ${remainColor}`}>
              <span>Remaining unallocated</span>
              <span>{remaining.toFixed(3)} bbl</span>
            </div>
          )}
          {bbls > 0 && remaining > 0.001 && (
            <p className="text-amber text-[10px] mt-1 leading-tight">
              You have {remaining.toFixed(3)} bbl unallocated. Add another packaging split or adjust existing splits to account for your full batch.
            </p>
          )}
          {bbls > 0 && remaining < -0.001 && (
            <p className="text-danger text-[10px] mt-1 leading-tight">
              Splits exceed batch size by {Math.abs(remaining).toFixed(3)} bbl — reduce split volumes.
            </p>
          )}
          {bbls === 0 && (
            <p className="text-gray-400 text-[10px] mt-1">Set a batch size to see volume allocations.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── CostPanel helper sub-components ─────────────────────────────────────────

function SectionToggle({ title, subtotal, open, onToggle, children }) {
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-700">{title}</span>
        <span className="flex items-center gap-2 text-gray-400">
          {subtotal > 0 && <span className="text-navy font-medium">{formatDollars(subtotal)}</span>}
          <span>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

function CostRow({ label, value, bold, textValue }) {
  return (
    <div className={`flex justify-between gap-2 text-xs ${bold ? 'font-bold border-t border-gray-100 pt-1 mt-1' : ''}`}>
      <span className={bold ? 'text-navy' : 'text-gray-600'}>{label}</span>
      <span className={bold ? 'text-navy' : 'text-navy font-medium'}>
        {textValue !== undefined ? textValue : formatDollars(value)}
      </span>
    </div>
  )
}

function NumField({ label, tooltip, value, onChange, onBlur, suffix }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-1 min-w-0">
        <label className="text-gray-600 truncate">{label}</label>
        {tooltip && (
          <span className="text-gray-400 cursor-help shrink-0" title={tooltip}>ⓘ</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number" step="any" min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-20 border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber"
        />
        {suffix && <span className="text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

// ─── UnitSelect ───────────────────────────────────────────────────────────────

function UnitSelect({ value, onChange, disabled, className }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled} className={className}>
      {UNIT_GROUPS.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map(o => <option key={o} value={o}>{o}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

// ─── AddIngredientModal ───────────────────────────────────────────────────────
// Full-screen modal for adding an ingredient to a recipe section.
// Ingredients are selected from a dropdown of the brewery's inventory,
// grouped by category. An "Other" option lets the brewer type a free name.

function AddIngredientModal({
  isOpen, addType, library, form, setForm, error, saving, onChange, onSubmit, onClose,
  isEditMode = false, editTarget = null, totalPints = 0, lines = [],
}) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_recipe_add_ingredient')

  // 'inventory' = using dropdown, 'other' = typing a free name
  const [mode, setMode] = useState('inventory')

  // Unit conversion feedback
  const [unitConversionWarning, setUnitConversionWarning] = useState(false)
  const [unitConversionMsg, setUnitConversionMsg]         = useState(null)

  // Restore / save draft (add mode only)
  useEffect(() => {
    if (!isOpen || isEditMode) return
    const draft = loadDraft()
    if (draft) {
      Object.entries(draft).forEach(([k, v]) => onChange(k, v))
      if (draft.ingredient_name && !library.find(i => i.name === draft.ingredient_name)) setMode('other')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || isEditMode) return
    saveDraft(form)
  }, [form])

  // Set mode when opening — inventory vs other, and respect edit pre-population
  useEffect(() => {
    if (!isOpen) return
    if (isEditMode && editTarget) {
      const inLibrary = library.some(i => i.name === editTarget.ingredient_name)
      setMode(inLibrary ? 'inventory' : 'other')
    } else {
      setMode('inventory')
    }
    setUnitConversionWarning(false)
    setUnitConversionMsg(null)
  }, [isOpen, isEditMode, editTarget?.id])

  const isDirty = !!form.ingredient_name || !!form.amount

  // Group library ingredients by category
  const groupedByCategory = useMemo(() => {
    const map = new Map()
    for (const ing of library) {
      const cat = ing.category || 'Other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(ing)
    }
    return [...map.entries()].map(([cat, items]) => ({ cat, items }))
  }, [library])

  // Called when the user picks from the inventory dropdown
  function handleInventorySelect(ingId) {
    if (ingId === '' || ingId === 'other') {
      setMode('other')
      onChange('ingredient_name', '')
      onChange('unit', 'lb')
      onChange('price_per_unit', '')
      return
    }
    const ing = library.find(i => i.id === ingId)
    if (!ing) return
    setMode('inventory')
    onChange('ingredient_name', ing.name)
    onChange('unit', ing.unit ?? 'lb')
    // Don't store price in form for inventory items — it comes from inventory
    onChange('price_per_unit', '')
  }

  // Find the selected ingredient to show stock level and cost
  const selectedIng = library.find(i => i.name === form.ingredient_name)
  const inventoryPrice = selectedIng
    ? parseFloat(selectedIng.ingredient_suppliers?.find(s => s.is_preferred)?.price_per_unit ?? selectedIng.current_price_per_unit ?? 0)
    : null

  // Unit change — all current form values are passed as explicit arguments so there
  // is no stale closure risk. Batch total is preserved: new_cost = batchTotal / new_amount.
  // For inventory-mode ingredients form.price_per_unit is empty, so fall back to inventoryPrice.
  const handleUnitChangeExplicit = useCallback((newUnit, currentAmount, currentCost, currentUnit) => {
    const numAmount = parseFloat(currentAmount) || 0
    const effectiveCost = parseFloat(currentCost) || inventoryPrice || 0
    const batchTotal = numAmount * effectiveCost

    const amountResult = convertAmount(numAmount, currentUnit, newUnit)

    if (amountResult.warning || amountResult.amount <= 0) {
      setForm(prev => ({ ...prev, unit: newUnit }))
      setUnitConversionWarning(true)
      setUnitConversionMsg(null)
      return
    }

    const newCostPerUnit = batchTotal > 0
      ? parseFloat((batchTotal / amountResult.amount).toFixed(6))
      : effectiveCost

    setForm(prev => ({
      ...prev,
      unit:           newUnit,
      amount:         String(parseFloat(amountResult.amount.toFixed(4))),
      price_per_unit: String(newCostPerUnit),
    }))

    // Switch to 'other' mode so the converted cost is visible and editable.
    // The brewer has changed the unit which overrides the inventory unit.
    setMode('other')

    setUnitConversionWarning(false)
    setUnitConversionMsg(`✓ Converted: ${currentUnit} → ${newUnit}. Cost updated to $${newCostPerUnit.toFixed(6)}/${newUnit}`)
  }, [setForm, inventoryPrice])

  // Cost impact calculations — shown live as the brewer fills in the form
  const effectiveCostPerUnit = mode === 'inventory' && selectedIng
    ? (inventoryPrice ?? 0)
    : parseFloat(form.price_per_unit) || 0
  const ingredientBatchCost = (parseFloat(form.amount) || 0) * effectiveCostPerUnit
  const currentTotalIngredientCost = lines.reduce((sum, line) => {
    if (editTarget && line.id === editTarget.id) return sum  // exclude line being replaced
    const lPrice = parseFloat(line.supplier?.price_per_unit ?? line.ingredient?.current_price_per_unit ?? line._priceOverride ?? 0)
    return sum + ((parseFloat(line.amount) || 0) * lPrice)
  }, 0)
  const newTotalWithThis  = currentTotalIngredientCost + ingredientBatchCost
  const percentOfTotal    = newTotalWithThis > 0 ? (ingredientBatchCost / newTotalWithThis) * 100 : 0
  const ingredientCostPerPint = totalPints > 0 ? ingredientBatchCost / totalPints : 0

  const showAdditionTime = TIMED_ADDITION_TYPES.includes(form.addition_type)

  function handleSubmit(e) {
    if (!isEditMode) clearDraft()
    onSubmit(e)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? `Edit Ingredient — ${editTarget?.ingredient_name ?? ''}` : `Add Ingredient — ${addType ?? ''}`}
      maxWidth="max-w-lg"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Ingredient selector — dropdown from inventory or free text */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Ingredient *</label>

          {/* Inventory dropdown — groups by category */}
          <select
            value={mode === 'inventory' && selectedIng ? selectedIng.id : (mode === 'other' ? 'other' : '')}
            onChange={e => handleInventorySelect(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
          >
            <option value="">Choose from inventory...</option>
            {groupedByCategory.map(({ cat, items }) => (
              <optgroup key={cat} label={cat}>
                {items.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                    {ing.current_stock_quantity != null
                      ? ` — ${parseFloat(ing.current_stock_quantity).toFixed(2)} ${ing.unit ?? ''} in stock`
                      : ''}
                  </option>
                ))}
                <option value="other">Other — type ingredient name</option>
              </optgroup>
            ))}
            {library.length === 0 && (
              <option value="other">Other — type ingredient name</option>
            )}
          </select>

          {/* Free text input when "Other" is selected */}
          {mode === 'other' && (
            <input
              type="text"
              value={form.ingredient_name}
              onChange={e => onChange('ingredient_name', e.target.value)}
              placeholder="Type ingredient name..."
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          )}

          {/* Stock level note for inventory items */}
          {selectedIng && mode === 'inventory' && (
            <p className="text-xs text-gray-400">
              {parseFloat(selectedIng.current_stock_quantity).toFixed(2)} {selectedIng.unit ?? ''} currently in stock
            </p>
          )}
        </div>

        {/* Amount + Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Amount *</label>
            <input
              type="number" step="any" min="0"
              value={form.amount}
              onChange={e => onChange('amount', e.target.value)}
              placeholder="e.g. 10"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Unit *</label>
            <UnitSelect
              value={form.unit}
              onChange={e => handleUnitChangeExplicit(e.target.value, form.amount, form.price_per_unit, form.unit)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
        </div>

        {/* Addition type + time + scale */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Addition Type</label>
            <select
              value={form.addition_type}
              onChange={e => onChange('addition_type', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
            >
              {ADDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {showAdditionTime && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Time</label>
              <input
                type="text"
                value={form.addition_time}
                onChange={e => onChange('addition_time', e.target.value)}
                placeholder="e.g. 60 min"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-0.5">
            <input
              type="checkbox"
              checked={form.scale_with_batch}
              onChange={e => onChange('scale_with_batch', e.target.checked)}
              className="rounded border-gray-300 text-amber focus:ring-amber"
            />
            <span className="text-gray-600">Scale with batch</span>
          </label>
        </div>

        {/* Cost display — read-only from inventory, or editable for Other items */}
        {mode === 'inventory' && selectedIng ? (
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
            Cost from inventory:{' '}
            <span className="font-semibold text-navy">
              {inventoryPrice != null && inventoryPrice > 0
                ? `$${inventoryPrice.toFixed(4)} per ${form.unit}`
                : 'No price on file — update in Inventory module'}
            </span>
          </div>
        ) : mode === 'other' ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Enter cost per unit — not in inventory ($)</label>
            <input
              type="number" step="any" min="0"
              value={form.price_per_unit}
              onChange={e => onChange('price_per_unit', e.target.value)}
              placeholder="e.g. 2.50"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
            {unitConversionWarning && (
              <p className="text-[11px] text-amber font-medium">
                ⚠ Unit type changed — please verify the cost per unit is correct for the new unit.
              </p>
            )}
            {unitConversionMsg && !unitConversionWarning && (
              <p className="text-[11px] text-success font-medium">{unitConversionMsg}</p>
            )}
            {!isEditMode && (
              <p className="text-[11px] text-gray-400">
                To track costs automatically, add this ingredient in the{' '}
                <span className="text-amber font-medium">Inventory module</span> first.
              </p>
            )}
          </div>
        ) : null}

        {/* Cost impact panel — shown when amount and cost are both entered */}
        {ingredientBatchCost > 0 && (
          <div className="bg-navy/5 border border-navy/10 rounded-lg p-3">
            <p className="text-xs font-semibold text-navy mb-2">Cost Impact for This Batch</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-gray-500">Batch cost</p>
                <p className="text-sm font-bold text-navy">${ingredientBatchCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Per pint</p>
                <p className="text-sm font-bold text-navy">${ingredientCostPerPint.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">% of recipe</p>
                <p className="text-sm font-bold text-navy">{percentOfTotal.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
          <input type="text"
            value={form.notes}
            onChange={e => onChange('notes', e.target.value)}
            placeholder="Variety, origin, etc."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Add Ingredient')}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyNewLine(additionType) {
  return {
    ingredient_name: '', amount: '', unit: 'lb',
    scale_with_batch: true, addition_time: '', notes: '',
    addition_type: additionType,
    price_per_unit: '',
  }
}
