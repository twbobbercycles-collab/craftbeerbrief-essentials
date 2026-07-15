/**
 * recipeUtils.js — pure calculation functions for the Recipe Builder.
 * Phase 1 multi-layer costing: ingredients, packaging, labor, utilities, fixed overhead.
 * No side effects, no imports — easy to test.
 */

const GALLONS_PER_BARREL = 31
const OZ_PER_GALLON      = 128
export const PINTS_PER_BARREL = 248

// ── Batch conversion ──────────────────────────────────────────────────────────

export function convertToBarrels(amount, unit) {
  const n = parseFloat(amount) || 0
  if (!unit) return n
  if (unit.toLowerCase().startsWith('barrel')) return n
  if (unit.toLowerCase().startsWith('gallon'))  return n / GALLONS_PER_BARREL
  return n
}

// ── Ingredient costing ────────────────────────────────────────────────────────

export function calculateScaledAmount(baseAmount, baseBatchSize, currentBatchSize, scaleWithBatch) {
  const base    = parseFloat(baseAmount)    || 0
  const baseBatch = parseFloat(baseBatchSize) || 0
  const curBatch  = parseFloat(currentBatchSize) || 0
  if (!scaleWithBatch) return base
  if (baseBatch === 0) return base
  return (base / baseBatch) * curBatch
}

export function calculateIngredientLineCost(
  baseAmount, baseBatchSize, currentBatchSize, scaleWithBatch, pricePerUnit,
) {
  const scaled = calculateScaledAmount(baseAmount, baseBatchSize, currentBatchSize, scaleWithBatch)
  return scaled * (parseFloat(pricePerUnit) || 0)
}

/**
 * Each element of `ingredients` must have: amount, scale_with_batch, price_per_unit
 */
export function calculateTotalIngredientCost(ingredients, currentBatchSize, baseBatchSize) {
  return (ingredients ?? []).reduce((total, ing) => {
    return total + calculateIngredientLineCost(
      ing.amount, baseBatchSize, currentBatchSize,
      ing.scale_with_batch, ing.price_per_unit,
    )
  }, 0)
}

// ── Packaging costing ─────────────────────────────────────────────────────────

// unitsFromPackageableGallons — shared by the three functions below. Takes the exact
// per-unit size (oz or bbl, mutually exclusive) instead of inferring it from a fixed
// per-type default, so cost/unit estimates actually reflect the size a brewer picked
// (e.g. a 12oz can and a 32oz can no longer produce identical estimates).
function unitsFromPackageableGallons(packageableGal, sizeOz, sizeBbl) {
  if (sizeBbl) return (packageableGal / GALLONS_PER_BARREL) / sizeBbl
  if (sizeOz)  return (packageableGal * OZ_PER_GALLON) / sizeOz
  return null
}

export function calculatePackagingCostPerBatch(
  splitVolumeBarrels, packagingYieldPercentage, sizeOz, sizeBbl,
  packagingCostPerUnit, labelCostPerUnit, carrierCostPerUnit,
) {
  const gallons        = (parseFloat(splitVolumeBarrels) || 0) * GALLONS_PER_BARREL
  const packageableGal = gallons * ((parseFloat(packagingYieldPercentage) || 85) / 100)
  const totalUnits      = unitsFromPackageableGallons(packageableGal, sizeOz, sizeBbl)
  if (totalUnits == null) return 0
  const costPerUnit    = (parseFloat(packagingCostPerUnit) || 0)
                       + (parseFloat(labelCostPerUnit)     || 0)
                       + (parseFloat(carrierCostPerUnit)   || 0)
  return totalUnits * costPerUnit
}

/** Returns whole-number unit count, or null when no size is set. */
export function calculateUnitsProduced(splitVolumeBarrels, packagingYieldPercentage, sizeOz, sizeBbl) {
  const gallons        = (parseFloat(splitVolumeBarrels) || 0) * GALLONS_PER_BARREL
  const packageableGal = gallons * ((parseFloat(packagingYieldPercentage) || 85) / 100)
  const totalUnits      = unitsFromPackageableGallons(packageableGal, sizeOz, sizeBbl)
  return totalUnits == null ? null : Math.floor(totalUnits)
}

/** Pints per unit for a given size (used to price per-unit retail). */
export function pintsPerContainer(sizeOz, sizeBbl) {
  if (sizeBbl) return (sizeBbl * GALLONS_PER_BARREL * OZ_PER_GALLON) / 16
  if (sizeOz)  return sizeOz / 16
  return null
}

// ── Direct labor ──────────────────────────────────────────────────────────────

export function calculateLaborCost(brewHours, laborRatePerHour) {
  return (parseFloat(brewHours) || 0) * (parseFloat(laborRatePerHour) || 0)
}

// ── Utilities & cleaning ──────────────────────────────────────────────────────

export function calculateUtilitiesCost(
  batchSizeBarrels, utilitiesCostPerBarrel, cleaningCostPerBatch,
  waterCostPerBarrel, wastewaterCostPerBarrel,
) {
  const barrels       = parseFloat(batchSizeBarrels)       || 0
  const utilityCost   = barrels * (parseFloat(utilitiesCostPerBarrel)    || 10)
  const waterCost     = barrels * (parseFloat(waterCostPerBarrel)        || 0.50)
  const wastewaterCost = barrels * (parseFloat(wastewaterCostPerBarrel)   || 0.30)
  const cleaningCost  = parseFloat(cleaningCostPerBatch) || 15
  return {
    utilityCost,
    waterCost,
    wastewaterCost,
    cleaningCost,
    total: utilityCost + waterCost + wastewaterCost + cleaningCost,
  }
}

// ── Fixed overhead ────────────────────────────────────────────────────────────

export function calculateFixedOverhead(totalDirectCosts, fixedOverheadPercentage) {
  return (parseFloat(totalDirectCosts) || 0) * ((parseFloat(fixedOverheadPercentage) || 15) / 100)
}

// ── Master cost roll-up ───────────────────────────────────────────────────────

/**
 * Returns a full cost breakdown object.
 * directCosts = ingredients + packaging + labor + utilities
 * overhead    = fixed % applied to directCosts
 * totalCost   = directCosts + overhead
 */
export function calculateTotalProductionCost(
  ingredientCost, packagingCost, laborCost, utilitiesCost, fixedOverheadPercentage,
) {
  const directCosts = (parseFloat(ingredientCost) || 0)
                    + (parseFloat(packagingCost)   || 0)
                    + (parseFloat(laborCost)       || 0)
                    + (parseFloat(utilitiesCost)   || 0)
  const overhead  = calculateFixedOverhead(directCosts, fixedOverheadPercentage)
  return { ingredientCost: parseFloat(ingredientCost) || 0, packagingCost: parseFloat(packagingCost) || 0, laborCost: parseFloat(laborCost) || 0, utilitiesCost: parseFloat(utilitiesCost) || 0, directCosts, overhead, totalCost: directCosts + overhead }
}

// ── Per-pint metrics ──────────────────────────────────────────────────────────

export function calculateCostPerBarrel(totalCost, batchSizeBarrels) {
  const barrels = parseFloat(batchSizeBarrels) || 0
  if (barrels === 0) return 0
  return (parseFloat(totalCost) || 0) / barrels
}

export function calculateCostPerPint(costPerBarrel) {
  return (parseFloat(costPerBarrel) || 0) / PINTS_PER_BARREL
}

export function calculateSuggestedRetail(costPerPint, targetMarginPercentage) {
  const cost   = parseFloat(costPerPint) || 0
  const margin = Math.min((parseFloat(targetMarginPercentage) || 0) / 100, 0.9999)
  if (margin <= 0) return cost
  return cost / (1 - margin)
}

export function calculateTaxInclusivePrice(suggestedRetail, taxRate) {
  return (parseFloat(suggestedRetail) || 0) * (1 + (parseFloat(taxRate) || 0) / 100)
}

export function calculateGrossMargin(retailPrice, costPerPint) {
  const retail = parseFloat(retailPrice) || 0
  if (retail === 0) return { dollars: 0, percentage: 0 }
  const marginDollars = retail - (parseFloat(costPerPint) || 0)
  return { dollars: marginDollars, percentage: (marginDollars / retail) * 100 }
}

// ── Full recipe true-cost-per-pint model ──────────────────────────────────────

// Ported line-by-line from RecipeDetailPage's costs useMemo — same operation order,
// same fallback defaults, packaging-INCLUSIVE exactly as today. This is a pure
// refactor: any behavior change (packaging convention, byte-for-byte float
// differences) is explicitly out of scope for this extraction.
//
// recipe: { base_batch_size, base_batch_size_unit, packaging_splits,
//   packaging_yield_percentage, default_size_oz, default_size_bbl (pre-resolved
//   single-container fallback size — callers resolve this from their own
//   package-type/size lookup; this file stays import-free),
//   packaging_cost_per_unit, label_cost_per_unit, carrier_cost_per_unit,
//   brewers_count, brew_hours_per_brewer, packaging_hours, packaging_labor_rate,
//   excise_tax_rate_per_bbl, target_margin_percentage, tax_rate }
// ingredientLines: [{ amount, scale_with_batch, price_per_unit }] — caller resolves
//   price_per_unit (e.g. supplier price ?? ingredient price ?? override ?? 0) before calling.
// breweryContext: { laborRatePerHour, monthlyFixedOverhead, batchesPerMonth, variableOverheadPerBbl }
// opts: { batchSize } — batch-size simulation override; defaults to recipe.base_batch_size.
export function calculateTrueCostPerPint(recipe, ingredientLines, breweryContext, opts = {}) {
  const baseBatch    = parseFloat(recipe.base_batch_size) || 0
  const curBatch     = parseFloat(opts.batchSize) || baseBatch
  const batchBarrels = convertToBarrels(curBatch, recipe.base_batch_size_unit)

  const ingredientCost = calculateTotalIngredientCost(ingredientLines, curBatch, baseBatch)

  // Packaging cost — use splits when defined, otherwise fall back to single container
  const defaultYield = parseFloat(recipe.packaging_yield_percentage) || 85
  const packagingSplits = recipe.packaging_splits || []
  let packagingCost
  if (packagingSplits.length > 0) {
    packagingCost = packagingSplits.reduce((total, split) => {
      const splitBbls = parseFloat(split.volume_barrels) || 0
      const yld = parseFloat(split.packaging_yield) || defaultYield
      return total + calculatePackagingCostPerBatch(
        splitBbls, yld, split.size_oz, split.size_bbl,
        parseFloat(split.packaging_cost_per_unit) || 0,
        parseFloat(split.label_cost_per_unit) || 0,
        parseFloat(split.carrier_cost_per_unit) || 0,
      )
    }, 0)
  } else {
    packagingCost = calculatePackagingCostPerBatch(
      batchBarrels, defaultYield, recipe.default_size_oz, recipe.default_size_bbl,
      parseFloat(recipe.packaging_cost_per_unit) || 0,
      parseFloat(recipe.label_cost_per_unit) || 0,
      parseFloat(recipe.carrier_cost_per_unit) || 0,
    )
  }

  const totalPints = batchBarrels * PINTS_PER_BARREL
  const tp1 = totalPints || 1

  // Per-pint ingredient and packaging costs
  const ingredientCostPerPint = ingredientCost / tp1
  const packagingCostPerPint  = packagingCost  / tp1

  // Direct brew labor
  const totalBrewLaborCost  = (parseFloat(recipe.brewers_count) || 0) * (parseFloat(recipe.brew_hours_per_brewer) || 0) * (parseFloat(breweryContext.laborRatePerHour) || 0)
  const brewLaborPerPint    = totalPints > 0 ? totalBrewLaborCost / totalPints : 0

  // Packaging labor
  const totalPackagingLaborCost = (parseFloat(recipe.packaging_hours) || 0) * (parseFloat(recipe.packaging_labor_rate) || 0)
  const packagingLaborPerPint   = totalPints > 0 ? totalPackagingLaborCost / totalPints : 0

  // Fixed overhead per batch (monthly fixed costs divided by batches per month)
  const fixedOverheadPerBatch   = (parseFloat(breweryContext.monthlyFixedOverhead) || 0) / (parseFloat(breweryContext.batchesPerMonth) || 4)
  const fixedOverheadPerPint    = totalPints > 0 ? fixedOverheadPerBatch / totalPints : 0

  // Variable overhead (utilities, cleaning, QC per barrel)
  const variableOverheadTotal   = batchBarrels * (parseFloat(breweryContext.variableOverheadPerBbl) || 0)
  const variableOverheadPerPint = totalPints > 0 ? variableOverheadTotal / totalPints : 0

  const totalOverheadPerPint = brewLaborPerPint + packagingLaborPerPint + fixedOverheadPerPint + variableOverheadPerPint

  // Federal excise tax
  const exciseTaxBatchTotal = batchBarrels * (parseFloat(recipe.excise_tax_rate_per_bbl) || 3.50)
  const exciseTaxPerPint    = totalPints > 0 ? exciseTaxBatchTotal / totalPints : 0

  // True cost per pint — all components combined
  const trueCostPerPint = ingredientCostPerPint + packagingCostPerPint + totalOverheadPerPint + exciseTaxPerPint

  // Total batch production cost (for per-unit calculations in packaged output)
  const totalCost = ingredientCost + packagingCost + totalBrewLaborCost + totalPackagingLaborCost + fixedOverheadPerBatch + variableOverheadTotal

  const targetMarginPct = parseFloat(recipe.target_margin_percentage) || 65
  const suggestedRetail = targetMarginPct > 0 && targetMarginPct < 100
    ? trueCostPerPint / (1 - targetMarginPct / 100)
    : trueCostPerPint * 2
  const taxInclusivePrice = calculateTaxInclusivePrice(suggestedRetail, parseFloat(recipe.tax_rate) || 0)
  const grossMarginPct    = suggestedRetail > 0 ? ((suggestedRetail - trueCostPerPint) / suggestedRetail) * 100 : 0
  const grossMargin       = { percentage: grossMarginPct, dollars: suggestedRetail - trueCostPerPint }

  return {
    baseBatch, curBatch, batchBarrels,
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
    totalPints,
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatDollars(n) {
  return '$' + (parseFloat(n) || 0).toFixed(2)
}

export function formatPct(n, decimals = 1) {
  return (parseFloat(n) || 0).toFixed(decimals) + '%'
}
