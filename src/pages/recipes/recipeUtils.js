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

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatDollars(n) {
  return '$' + (parseFloat(n) || 0).toFixed(2)
}

export function formatPct(n, decimals = 1) {
  return (parseFloat(n) || 0).toFixed(decimals) + '%'
}
