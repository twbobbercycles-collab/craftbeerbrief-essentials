/**
 * packagingTypes.js — single source of truth for package/container types and their sizes.
 * Shared between the Recipe Builder (packaging splits) and the Packaging module
 * (planned/actual splits on a packaging run), replacing what used to be three
 * independently-maintained lists (CONTAINER_SIZE_OPTIONS in RecipeDetailPage.jsx,
 * PKG_TYPE_DEFAULTS/PACKAGE_TYPES in PackagingRunDetailPage.jsx, CONTAINER_VOLUMES
 * in recipeUtils.js) that used different type-string formats and drifted out of sync.
 */

// Canonical package type list, in display order.
export const PACKAGE_TYPES = [
  'Taproom Draft', 'Can', 'Bottle', 'Growler', 'Crowler',
  'Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel', 'Barrel Aging',
  '4-Pack (Cans)', '6-Pack (Cans)', '12-Pack (Cans)', '24-Pack / Case (Cans)',
]

// Types that represent a returnable keg or barrel.
export const KEG_TYPES = ['Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel']

// Types that represent a multi-unit pack or case.
export const PACK_TYPES = ['4-Pack (Cans)', '6-Pack (Cans)', '12-Pack (Cans)', '24-Pack / Case (Cans)']

// Size options per package type. Each option carries exactly one of ozPerUnit (fluid
// ounces per unit — cans, bottles, growlers, crowlers, taproom pours, packs/cases) or
// bblPerUnit (barrels per unit — kegs). ozPerUnit: null means no unit calculation is
// possible for that size (barrel aging).
export const PACKAGE_SIZE_OPTIONS = {
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
  'Taproom Draft': [
    { label: '12oz pour', ozPerUnit: 12 },
    { label: '16oz pour', ozPerUnit: 16 },
    { label: '20oz pour', ozPerUnit: 20 },
  ],
  '4-Pack (Cans)': [
    { label: '4-Pack 12oz', ozPerUnit: 4 * 12 },
    { label: '4-Pack 16oz', ozPerUnit: 4 * 16 },
  ],
  '6-Pack (Cans)': [
    { label: '6-Pack 12oz', ozPerUnit: 6 * 12 },
    { label: '6-Pack 16oz', ozPerUnit: 6 * 16 },
  ],
  '12-Pack (Cans)': [
    { label: '12-Pack 12oz', ozPerUnit: 12 * 12 },
    { label: '12-Pack 16oz', ozPerUnit: 12 * 16 },
  ],
  '24-Pack / Case (Cans)': [
    { label: 'Case 12oz (24)', ozPerUnit: 24 * 12 },
    { label: 'Case 16oz (24)', ozPerUnit: 24 * 16 },
  ],
}

// Default size used only by legacy single-container mode (a recipe with no explicit
// splits, just one packaging_container_type and no separate size field). Mirrors the
// per-type defaults the old CONTAINER_VOLUMES table implied, so that path's math is
// unaffected by this change.
export const DEFAULT_SIZE_BY_TYPE = {
  'Can':                { ozPerUnit: 12 },
  'Bottle':              { ozPerUnit: 12 },
  'Growler':             { ozPerUnit: 64 },
  'Crowler':             { ozPerUnit: 32 },
  'Keg Half Barrel':    { bblPerUnit: 0.5 },
  'Keg Quarter Barrel': { bblPerUnit: 0.25 },
  'Keg Sixth Barrel':   { bblPerUnit: 0.167 },
}

export function sizeOptionsFor(type) {
  return PACKAGE_SIZE_OPTIONS[type] ?? []
}

export function findSizeOption(type, label) {
  return sizeOptionsFor(type).find(o => o.label === label) ?? null
}

export function isKegType(type) {
  return KEG_TYPES.includes(type)
}

export function isPackType(type) {
  return PACK_TYPES.includes(type)
}

// Noun used for unit-count display ("≈ 1,234 units/kegs/packs/barrels").
export function unitNoun(type) {
  if (KEG_TYPES.includes(type))  return 'kegs'
  if (type === 'Barrel Aging')   return 'barrels'
  if (PACK_TYPES.includes(type)) return 'packs'
  return 'units'
}
