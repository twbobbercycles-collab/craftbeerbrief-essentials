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
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import ModalShell from '../../components/ModalShell'
import { useReadOnly } from '../../hooks/useReadOnly'
import { useModalDraft } from '../../hooks/useModalDraft'
import {
  convertToBarrels,
  calculateScaledAmount, calculateTotalIngredientCost,
  calculatePackagingCostPerBatch, calculateUnitsProduced, pintsPerContainer,
  calculateLaborCost, calculateUtilitiesCost, calculateTotalProductionCost,
  calculateCostPerBarrel, calculateCostPerPint,
  calculateSuggestedRetail, calculateTaxInclusivePrice, calculateGrossMargin,
  formatDollars, formatPct,
} from './recipeUtils'

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function RecipeDetailPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { brewery } = useAuth()
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

  // Inline name editing
  const [editingName, setEditingName]   = useState(false)
  const [nameVal, setNameVal]           = useState('')

  // Mobile cost panel bottom sheet
  const [costPanelOpen, setCostPanelOpen] = useState(false)

  // Inventory / brew-check panel
  const [brewCheckOpen, setBrewCheckOpen] = useState(false)
  const [brewCheckResults, setBrewCheckResults] = useState([])

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

  // ── Load ──────────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!id || !brewery?.id) return
    setLoading(true)

    const [recipeResult, linesResult, libResult] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id).single(),
      supabase.from('recipe_ingredients')
        .select('*, ingredient:ingredients(id,name,category,unit,current_price_per_unit,ingredient_suppliers(*)), supplier:ingredient_suppliers(id,supplier_name,price_per_unit,is_preferred)')
        .eq('recipe_id', id)
        .order('sort_order'),
      supabase.from('ingredients')
        .select('*, ingredient_suppliers(*)')
        .eq('brewery_id', brewery.id)
        .order('category').order('name'),
    ])

    if (recipeResult.error || !recipeResult.data) {
      setError('Recipe not found.')
      setLoading(false)
      return
    }

    const r = recipeResult.data
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
    setLines(linesResult.data ?? [])
    setLibrary(libResult.data ?? [])
    setLoading(false)
  }, [id, brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Cost calculations (memoized — recomputes only when inputs change) ─────────

  const costs = useMemo(() => {
    const baseBatch  = parseFloat(recipe?.base_batch_size) || 0
    const curBatch   = parseFloat(batchSize) || baseBatch
    const batchBarrels = convertToBarrels(curBatch, recipe?.base_batch_size_unit)

    // Per-line costs for ingredient breakdown display
    const lineCosts = lines.map(l => {
      const pricePerUnit = parseFloat(l.supplier?.price_per_unit ?? l.ingredient?.current_price_per_unit ?? l._priceOverride ?? 0)
      const scaled = calculateScaledAmount(parseFloat(l.amount) || 0, baseBatch, curBatch, l.scale_with_batch)
      return { id: l.id, name: l.ingredient_name, scaled, effectiveCost: pricePerUnit, totalCost: scaled * pricePerUnit }
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

    const laborCost = calculateLaborCost(parseFloat(brewHours) || 0, parseFloat(laborRatePerHour) || 0)
    const utilitiesBreakdown = calculateUtilitiesCost(
      batchBarrels,
      parseFloat(utilitiesCostPerBarrel)  || 10,
      parseFloat(cleaningCostPerBatch)    || 15,
      parseFloat(waterCostPerBarrel)      || 0.50,
      parseFloat(wastewaterCostPerBarrel) || 0.30,
    )
    const breakdown = calculateTotalProductionCost(
      ingredientCost, packagingCost, laborCost, utilitiesBreakdown.total, parseFloat(fixedOverheadPct) || 15,
    )

    const costPerBarrel   = calculateCostPerBarrel(breakdown.totalCost, batchBarrels)
    const costPerPint     = calculateCostPerPint(costPerBarrel)
    const suggestedRetail = calculateSuggestedRetail(costPerPint, parseFloat(marginPct) || 65)
    const taxInclusivePrice = calculateTaxInclusivePrice(suggestedRetail, parseFloat(taxRate) || 0)
    const grossMargin     = calculateGrossMargin(suggestedRetail, costPerPint)

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
      const allocatedCost = breakdown.totalCost * (splitPct / 100)
      const costPerUnit   = units > 0 ? allocatedCost / units : null
      const ppc           = split.container_type && split.container_type !== 'Draft/Taproom'
        ? pintsPerContainer(split.container_type) : null
      const retailPerUnit = ppc != null ? suggestedRetail * ppc : null
      return { ...split, splitPct, units, splitPackCost, allocatedCost, costPerUnit, retailPerUnit }
    })

    return {
      ...breakdown, utilitiesBreakdown,
      costPerBarrel, costPerPint, suggestedRetail, taxInclusivePrice,
      grossMargin, batchBarrels, unitsProduced, lineCosts, splitOutputs,
    }
  }, [
    lines, recipe, batchSize,
    packagingSplits,
    packagingContainerType, packagingCostPerUnit, labelCostPerUnit, carrierCostPerUnit, packagingYieldPct,
    brewHours, laborRatePerHour, utilitiesCostPerBarrel, cleaningCostPerBatch,
    waterCostPerBarrel, wastewaterCostPerBarrel, fixedOverheadPct,
    marginPct, taxRate,
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
      packagingContainerType: setPackagingContainerType,
      packagingCostPerUnit:   setPackagingCostPerUnit,
      labelCostPerUnit:       setLabelCostPerUnit,
      carrierCostPerUnit:     setCarrierCostPerUnit,
      packagingYieldPct:      setPackagingYieldPct,
      brewHours:              setBrewHours,
      laborRatePerHour:       setLaborRatePerHour,
      utilitiesCostPerBarrel:  setUtilitiesCostPerBarrel,
      cleaningCostPerBatch:    setCleaningCostPerBatch,
      waterCostPerBarrel:      setWaterCostPerBarrel,
      wastewaterCostPerBarrel: setWastewaterCostPerBarrel,
      fixedOverheadPct:        setFixedOverheadPct,
      marginPct:              setMarginPct,
      taxRate:                setTaxRate,
    }
    setters[field]?.(value)
  }

  // ── Persist all cost settings to the recipe row on blur ───────────────────────

  async function saveCostSettings() {
    await supabase.from('recipes').update({
      packaging_splits:           packagingSplits.length > 0 ? packagingSplits : null,
      packaging_container_type:   packagingContainerType || null,
      packaging_cost_per_unit:    parseFloat(packagingCostPerUnit)   || 0,
      label_cost_per_unit:        parseFloat(labelCostPerUnit)       || 0,
      carrier_cost_per_unit:      parseFloat(carrierCostPerUnit)     || 0,
      packaging_yield_percentage: parseFloat(packagingYieldPct)      || 85,
      brew_hours:                 parseFloat(brewHours)              || 0,
      labor_rate_per_hour:        parseFloat(laborRatePerHour)       || 0,
      utilities_cost_per_barrel:   parseFloat(utilitiesCostPerBarrel)    || 10,
      cleaning_cost_per_batch:     parseFloat(cleaningCostPerBatch)      || 15,
      water_cost_per_barrel:       parseFloat(waterCostPerBarrel)        || 0.50,
      wastewater_cost_per_barrel:  parseFloat(wastewaterCostPerBarrel)   || 0.30,
      fixed_overhead_percentage:   parseFloat(fixedOverheadPct)          || 15,
      target_margin_percentage:   parseFloat(marginPct)              || 65,
      tax_rate:                   parseFloat(taxRate)                || 0,
    }).eq('id', id)
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
      name: `${recipe.name} (copy)`,
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
      ['Ingredient Cost',           formatDollars(costs.ingredientCost)],
      ['Packaging Cost',            formatDollars(costs.packagingCost)],
      ['Labor Cost',                formatDollars(costs.laborCost)],
      ['  Electric, gas & CO2',     formatDollars(costs.utilitiesBreakdown?.utilityCost)],
      ['  Water',                   formatDollars(costs.utilitiesBreakdown?.waterCost)],
      ['  Wastewater surcharge',    formatDollars(costs.utilitiesBreakdown?.wastewaterCost)],
      ['  Cleaning chemicals',      formatDollars(costs.utilitiesBreakdown?.cleaningCost)],
      ['Utilities Total',           formatDollars(costs.utilitiesCost)],
      ['Direct Costs',              formatDollars(costs.directCosts)],
      ['Fixed Overhead',     formatDollars(costs.overhead)],
      ['Total Production Cost', formatDollars(costs.totalCost)],
      ['Cost per Barrel',    formatDollars(costs.costPerBarrel)],
      ['Cost per Pint',      formatDollars(costs.costPerPint)],
      ['Suggested Retail (pre-tax)',   formatDollars(costs.suggestedRetail)],
      ['Suggested Retail (tax-incl.)', formatDollars(costs.taxInclusivePrice)],
      ['Gross Margin',       formatPct(costs.grossMargin?.percentage)],
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
    <div className="space-y-0 pb-24 lg:pb-0">

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
                className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                Duplicate
              </button>
            </ReadOnlyTooltip>
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

      {/* ── Main layout — ingredient editor left, cost panel right ── */}
      <div className="flex gap-6 items-start">

        {/* Left: Batch size selector + Ingredient sections */}
        <div className="flex-1 min-w-0 space-y-6">

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
              />
            )
          })}
        </div>

        {/* Right: Cost panel — sticky sidebar, hidden on mobile (shown as bottom sheet) */}
        <div className="hidden lg:block w-80 flex-shrink-0 sticky top-6">
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
            brewHours={brewHours}
            laborRatePerHour={laborRatePerHour}
            utilitiesCostPerBarrel={utilitiesCostPerBarrel}
            cleaningCostPerBatch={cleaningCostPerBatch}
            waterCostPerBarrel={waterCostPerBarrel}
            wastewaterCostPerBarrel={wastewaterCostPerBarrel}
            fixedOverheadPct={fixedOverheadPct}
            marginPct={marginPct}
            taxRate={taxRate}
            onChange={handleCostFieldChange}
            onBlur={saveCostSettings}
          />
        </div>
      </div>

      {/* Mobile: sticky Calculate Cost button */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-30">
        <button
          onClick={() => setCostPanelOpen(true)}
          className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors"
        >
          📊 Cost — {formatDollars(costs.costPerPint)}/pint · Retail {formatDollars(costs.suggestedRetail)}/pint
        </button>
      </div>

      {/* Mobile cost panel bottom sheet */}
      {costPanelOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCostPanelOpen(false)} />
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-bold text-navy">Cost Calculator</h3>
              <button onClick={() => setCostPanelOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5">
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
                brewHours={brewHours}
                laborRatePerHour={laborRatePerHour}
                utilitiesCostPerBarrel={utilitiesCostPerBarrel}
                cleaningCostPerBatch={cleaningCostPerBatch}
                waterCostPerBarrel={waterCostPerBarrel}
                wastewaterCostPerBarrel={wastewaterCostPerBarrel}
                fixedOverheadPct={fixedOverheadPct}
                marginPct={marginPct}
                taxRate={taxRate}
                onChange={handleCostFieldChange}
                onBlur={saveCostSettings}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Ingredient modal — opens when any section's "+ Add Ingredient" button is clicked */}
      <AddIngredientModal
        isOpen={addingTo !== null}
        addType={addingTo}
        library={library}
        form={newLineForm}
        error={newLineError}
        saving={newLineSaving}
        onChange={(field, val) => setNewLineForm(p => ({ ...p, [field]: val }))}
        onSubmit={handleSaveNewLine}
        onClose={cancelAddLine}
      />
    </div>
  )
}

// ─── AdditionSection ──────────────────────────────────────────────────────────

function AdditionSection({
  addType, lines, allLines, library, batchSize, baseBatchSize,
  isReadOnly, ReadOnlyTooltip,
  acLineId, acResults, onIngNameInput, onAcSelect, onAcClose,
  onUpdateLine, onSaveLineField, onRemoveLine, onMoveLine,
  onStartAdding,
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
  onUpdateLine, onSaveLineField, onRemoveLine, onMoveLine,
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

// ─── CostPanel ────────────────────────────────────────────────────────────────

function CostPanel({
  costs,
  batchBarrels,
  packagingSplits, onSplitsChange,
  packagingContainerType, packagingCostPerUnit, labelCostPerUnit, carrierCostPerUnit, packagingYieldPct,
  brewHours, laborRatePerHour,
  utilitiesCostPerBarrel, cleaningCostPerBatch, waterCostPerBarrel, wastewaterCostPerBarrel,
  fixedOverheadPct, marginPct, taxRate,
  onChange, onBlur,
}) {
  const [packagingOpen,  setPackagingOpen]  = useState(true)
  const [laborOpen,      setLaborOpen]      = useState(false)
  const [utilitiesOpen,  setUtilitiesOpen]  = useState(false)
  const [overheadOpen,   setOverheadOpen]   = useState(false)

  const grossPct    = costs.grossMargin?.percentage ?? 0
  const targetPct   = parseFloat(marginPct) || 65
  const marginColor = grossPct >= targetPct ? 'text-success' : grossPct >= targetPct - 5 ? 'text-warning' : 'text-danger'
  const marginBg    = grossPct >= targetPct ? 'bg-green-50 border-success' : grossPct >= targetPct - 5 ? 'bg-orange-50 border-warning' : 'bg-red-50 border-danger'

  const hasSplits     = packagingSplits && packagingSplits.length > 0
  const unitsProduced = costs.unitsProduced

  // Single-container per-unit retail (only used when no splits are defined)
  const ppc              = !hasSplits && packagingContainerType ? pintsPerContainer(packagingContainerType) : null
  const retailPerUnit    = ppc != null ? costs.suggestedRetail * ppc : null
  const costPerUnit      = !hasSplits && unitsProduced > 0 ? costs.totalCost / unitsProduced : null
  const projectedRevenue = retailPerUnit != null && unitsProduced ? retailPerUnit * unitsProduced : null
  const projectedProfit  = costPerUnit != null && retailPerUnit != null && unitsProduced
    ? (retailPerUnit - costPerUnit) * unitsProduced : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 text-xs">
      <div className="px-4 py-3">
        <h3 className="font-bold text-navy text-sm">Cost Calculator</h3>
      </div>

      {/* ── Section 1: Ingredient Costs (always expanded) ── */}
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

      {/* ── Section 2: Packaging Costs — multi-split editor ── */}
      <SectionToggle title="Packaging" subtotal={costs.packagingCost} open={packagingOpen} onToggle={() => setPackagingOpen(v => !v)}>
        <PackagingSplitsEditor
          splits={packagingSplits ?? []}
          defaultYield={packagingYieldPct}
          batchBarrels={batchBarrels}
          onChange={onSplitsChange}
        />
        <CostRow label="Packaging subtotal" value={costs.packagingCost} bold />
      </SectionToggle>

      {/* ── Section 3: Direct Labor ── */}
      <SectionToggle title="Direct Labor" subtotal={costs.laborCost} open={laborOpen} onToggle={() => setLaborOpen(v => !v)}>
        <NumField label="Brew day hours" value={brewHours} onChange={v => onChange('brewHours', v)} onBlur={onBlur} />
        <NumField label="Labor rate/hour ($)" value={laborRatePerHour} onChange={v => onChange('laborRatePerHour', v)} onBlur={onBlur} />
        <CostRow label="Labor subtotal" value={costs.laborCost} bold />
      </SectionToggle>

      {/* ── Section 4: Utilities & Supplies ── */}
      <SectionToggle title="Utilities & Supplies" subtotal={costs.utilitiesCost} open={utilitiesOpen} onToggle={() => setUtilitiesOpen(v => !v)}>
        <NumField
          label="Electric, gas & CO2/barrel ($)"
          tooltip="Covers electricity, natural gas, and CO2 per barrel of beer produced."
          value={utilitiesCostPerBarrel}
          onChange={v => onChange('utilitiesCostPerBarrel', v)}
          onBlur={onBlur}
        />
        <NumField
          label="Water cost/barrel ($)"
          tooltip="Municipal water cost per barrel of beer produced including brewing, cleaning, and cooling water. Average US brewery pays between $0.003 and $0.01 per gallon."
          value={waterCostPerBarrel}
          onChange={v => onChange('waterCostPerBarrel', v)}
          onBlur={onBlur}
        />
        <NumField
          label="Wastewater surcharge/barrel ($)"
          tooltip="Many municipalities charge breweries wastewater surcharges based on discharge volume. Check your municipal utility bill for your actual rate."
          value={wastewaterCostPerBarrel}
          onChange={v => onChange('wastewaterCostPerBarrel', v)}
          onBlur={onBlur}
        />
        <NumField label="Cleaning chemicals/batch ($)" value={cleaningCostPerBatch} onChange={v => onChange('cleaningCostPerBatch', v)} onBlur={onBlur} />
        {/* Utilities sub-breakdown */}
        <div className="space-y-1 pt-1 border-t border-gray-100">
          <CostRow label="Electric, gas & CO2" value={costs.utilitiesBreakdown?.utilityCost} />
          <CostRow label="Water and wastewater" value={(costs.utilitiesBreakdown?.waterCost ?? 0) + (costs.utilitiesBreakdown?.wastewaterCost ?? 0)} />
          <CostRow label="Cleaning and supplies" value={costs.utilitiesBreakdown?.cleaningCost} />
          <CostRow label="Utilities subtotal" value={costs.utilitiesCost} bold />
        </div>
      </SectionToggle>

      {/* ── Section 5: Fixed Overhead ── */}
      <SectionToggle title="Fixed Overhead" subtotal={costs.overhead} open={overheadOpen} onToggle={() => setOverheadOpen(v => !v)}>
        <NumField
          label="Fixed overhead %"
          tooltip="Added on top of all direct costs to cover fixed expenses like rent, equipment depreciation, insurance, and licenses. 15% is a reasonable starting point."
          value={fixedOverheadPct}
          onChange={v => onChange('fixedOverheadPct', v)}
          onBlur={onBlur}
          suffix="%"
        />
        <CostRow label="Overhead amount" value={costs.overhead} bold />
      </SectionToggle>

      {/* ── Summary ── */}
      <div className="px-4 py-3 space-y-1">
        <p className="font-semibold text-gray-500 uppercase tracking-wide mb-2">Cost Summary</p>
        <CostRow label="Ingredient costs"     value={costs.ingredientCost} />
        <CostRow label="Packaging costs"      value={costs.packagingCost} />
        <CostRow label="Labor"                value={costs.laborCost} />
        <CostRow label="Utilities & supplies" value={costs.utilitiesCost} />
        <CostRow label="Direct costs subtotal" value={costs.directCosts} bold />
        <CostRow label={`Fixed overhead (${fixedOverheadPct}%)`} value={costs.overhead} />
        <CostRow label="Total production cost" value={costs.totalCost} bold />
        <div className="border-t border-gray-100 pt-1">
          <CostRow label="Cost per barrel" value={costs.costPerBarrel} />
          <CostRow label="Cost per pint"   value={costs.costPerPint} bold />
        </div>
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
        <div className="flex items-center justify-between gap-2">
          <label className="text-gray-600">Tax rate</label>
          <div className="flex items-center gap-1">
            <input type="number" min="0" max="30" step="0.1" value={taxRate}
              onChange={e => onChange('taxRate', e.target.value)} onBlur={onBlur}
              className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-amber" />
            <span className="text-gray-400">%</span>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tax-inclusive retail</span>
          <span className="font-semibold text-navy">{formatDollars(costs.taxInclusivePrice)}/pint</span>
        </div>
      </div>

      {/* ── Gross margin ── */}
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

      {/* ── Packaged output — per split when splits defined, single when not ── */}
      {hasSplits && (costs.splitOutputs ?? []).length > 0 ? (
        <div className="px-4 py-3 bg-amber/5 space-y-4">
          <p className="font-semibold text-gray-500 uppercase tracking-wide">Packaged Output by Split</p>
          {costs.splitOutputs.map((s, idx) => (
            <div key={idx} className="space-y-1 border-t border-amber/10 pt-2 first:border-t-0 first:pt-0">
              <p className="font-semibold text-navy text-xs">
                {s.container_type || 'Split ' + (idx + 1)}
                {s.container_size ? ` — ${s.container_size}` : ''}
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
  )
}

// ─── PackagingSplitsEditor ────────────────────────────────────────────────────
// Lets the brewer split one batch across multiple container types using volume
// (barrels) as the primary input. Percentage is calculated read-only.

const SPLIT_CONTAINER_TYPES = [
  'Draft/Taproom', 'Can', 'Bottle', 'Growler', 'Crowler',
  'Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel',
]

function PackagingSplitsEditor({ splits, defaultYield, batchBarrels, onChange }) {
  const bbls = parseFloat(batchBarrels) || 0
  const totalAllocated = splits.reduce((s, sp) => s + (parseFloat(sp.volume_barrels) || 0), 0)
  const remaining  = bbls - totalAllocated
  const remainColor = Math.abs(remaining) < 0.001 ? 'text-success' : remaining < 0 ? 'text-danger' : 'text-amber'

  function addSplit() {
    onChange([...splits, {
      container_type: '', volume_barrels: '', container_size: '',
      packaging_cost_per_unit: '', label_cost_per_unit: '',
      carrier_cost_per_unit: '', packaging_yield: String(defaultYield ?? 85),
    }])
  }

  function updateSplit(idx, field, val) {
    onChange(splits.map((s, i) => i === idx ? { ...s, [field]: val } : s))
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
                  {SPLIT_CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
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
              </div>
            </div>
            {/* Row 2: % of batch (read-only) + size description */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-gray-500 mb-0.5 block">% of batch</label>
                <div className="border border-gray-100 rounded px-1.5 py-1 bg-gray-50 text-right text-gray-500">
                  {splitPct}%
                </div>
              </div>
              <div>
                <label className="text-gray-500 mb-0.5 block">Size description</label>
                <input
                  type="text"
                  value={split.container_size}
                  onChange={e => updateSplit(idx, 'container_size', e.target.value)}
                  placeholder="e.g. 16oz cans"
                  className="w-full border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber"
                />
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

function AddIngredientModal({ isOpen, addType, library, form, error, saving, onChange, onSubmit, onClose }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_recipe_add_ingredient')

  // 'inventory' = using dropdown, 'other' = typing a free name
  const [mode, setMode] = useState('inventory')

  // Restore / save draft
  useEffect(() => {
    if (!isOpen) return
    const draft = loadDraft()
    if (draft) {
      Object.entries(draft).forEach(([k, v]) => onChange(k, v))
      if (draft.ingredient_name && !library.find(i => i.name === draft.ingredient_name)) setMode('other')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    saveDraft(form)
  }, [form])

  // Reset mode when modal opens fresh
  useEffect(() => {
    if (isOpen) setMode('inventory')
  }, [addType])

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

  const showAdditionTime = TIMED_ADDITION_TYPES.includes(form.addition_type)

  function handleSubmit(e) {
    clearDraft()
    onSubmit(e)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Add Ingredient — ${addType ?? ''}`}
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
              onChange={e => onChange('unit', e.target.value)}
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
            <p className="text-[11px] text-gray-400">
              To track costs automatically, add this ingredient in the{' '}
              <span className="text-amber font-medium">Inventory module</span> first.
            </p>
          </div>
        ) : null}

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
            {saving ? 'Saving...' : 'Add Ingredient'}
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
