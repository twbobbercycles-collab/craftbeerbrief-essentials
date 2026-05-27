/**
 * WaterChemistryTab — Water chemistry calculator for the Recipe Builder.
 * Calculates mineral additions needed to transform source water into the
 * target profile for a given beer style.
 *
 * Props:
 *   recipeId   — recipe UUID, used for saving water chemistry settings
 *   recipe     — full recipe object (reads water_* columns set by migration 041)
 *   batchSize  — current batch size (numeric string, in recipe's base_batch_size_unit)
 *   lines      — ingredient lines (used to detect dark malts for pH estimate)
 *   isReadOnly — disables editing when true
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import { convertToBarrels } from './recipeUtils'

// ── Style preset profiles ─────────────────────────────────────────────────────
// Each entry has a description and target ranges [min, max] for each mineral in mg/L.

const WATER_PROFILES = {
  'Pilsner/Lager': {
    description: 'Very soft water. Delicate, clean lager character.',
    Ca: [40, 80], Mg: [5, 15], Na: [5, 25], Cl: [20, 60], SO4: [20, 60], HCO3: [20, 60],
  },
  'American IPA': {
    description: 'High sulfate accentuates hop bitterness and dryness.',
    Ca: [100, 200], Mg: [5, 20], Na: [5, 25], Cl: [50, 100], SO4: [150, 350], HCO3: [0, 50],
  },
  'New England IPA': {
    description: 'High chloride gives soft, juicy mouthfeel.',
    Ca: [100, 200], Mg: [5, 20], Na: [5, 25], Cl: [100, 200], SO4: [50, 150], HCO3: [0, 50],
  },
  'Stout/Porter': {
    description: 'Higher alkalinity supports dark malt character.',
    Ca: [50, 100], Mg: [5, 20], Na: [10, 40], Cl: [50, 100], SO4: [30, 80], HCO3: [100, 200],
  },
  'English Bitter/ESB': {
    description: 'Balanced sulfate and chloride, classic Burton character.',
    Ca: [100, 200], Mg: [20, 40], Na: [10, 30], Cl: [50, 100], SO4: [100, 200], HCO3: [50, 150],
  },
  'Wheat Beer/Hefeweizen': {
    description: 'Soft water lets yeast esters shine.',
    Ca: [40, 80], Mg: [5, 15], Na: [5, 20], Cl: [30, 60], SO4: [20, 50], HCO3: [30, 80],
  },
  'Belgian Golden/Saison': {
    description: 'Low mineral, very soft water.',
    Ca: [20, 60], Mg: [5, 15], Na: [5, 20], Cl: [20, 50], SO4: [20, 60], HCO3: [20, 60],
  },
  'Custom': {
    description: 'Enter your own target mineral ranges.',
    Ca: [0, 300], Mg: [0, 50], Na: [0, 100], Cl: [0, 300], SO4: [0, 400], HCO3: [0, 300],
  },
}

// ── Salt effect constants ─────────────────────────────────────────────────────
// Effect of 1 gram per gallon of each salt on water mineral concentration in mg/L.
// Source: Brun'Water / EZ Water brewing water calculator standards.

const SALT_EFFECTS = {
  gypsum:           { Ca: 61.5,  SO4: 147.4 },   // CaSO4·2H2O — adds Ca and sulfate
  calcium_chloride: { Ca: 72.0,  Cl:  127.5 },   // CaCl2 — adds Ca and chloride
  epsom_salt:       { Mg: 26.1,  SO4:  67.7 },   // MgSO4·7H2O — adds Mg and sulfate
  baking_soda:      { Na: 72.3,  HCO3: 191.0 },  // NaHCO3 — adds Na and bicarbonate
  chalk:            { Ca: 64.0,  HCO3: 192.0 },  // CaCO3 — adds Ca and bicarbonate
}

const SALT_LABELS = {
  gypsum:           'Gypsum (CaSO₄)',
  calcium_chloride: 'Calcium Chloride (CaCl₂)',
  epsom_salt:       'Epsom Salt (MgSO₄)',
  baking_soda:      'Baking Soda (NaHCO₃)',
  chalk:            'Chalk (CaCO₃)',
}

const SALT_EFFECT_DESC = {
  gypsum:           'Ca, SO₄',
  calcium_chloride: 'Ca, Cl',
  epsom_salt:       'Mg, SO₄',
  baking_soda:      'Na, HCO₃',
  chalk:            'Ca, HCO₃',
}

const MINERALS     = ['Ca', 'Mg', 'Na', 'Cl', 'SO4', 'HCO3']
const MINERAL_NAME = { Ca: 'Calcium', Mg: 'Magnesium', Na: 'Sodium', Cl: 'Chloride', SO4: 'Sulfate', HCO3: 'Bicarbonate' }
const MINERAL_SYM  = { Ca: 'Ca', Mg: 'Mg', Na: 'Na', Cl: 'Cl', SO4: 'SO₄', HCO3: 'HCO₃' }

// Keywords used to identify dark specialty malts that lower mash pH
const DARK_MALT_KEYWORDS = ['roast', 'black', 'chocolate', 'carafa', 'dark munich', 'patent', 'smoked']

// 1 US barrel = 31 gallons
const GALLONS_PER_BARREL = 31

// ── Calculation functions ─────────────────────────────────────────────────────

// Returns the midpoint of a [min, max] range
function mid([lo, hi]) { return (lo + hi) / 2 }

// Calculates recommended salt additions (in grams) to reach target mineral levels.
// Uses a priority-based approach to minimize salt interactions:
//   1. CaCl2 to satisfy Chloride deficit (also contributes Ca)
//   2. Epsom Salt to satisfy Magnesium deficit (also contributes SO4)
//   3. Gypsum to satisfy remaining Calcium deficit after CaCl2 contribution (also contributes SO4)
//   4. Baking Soda to satisfy Sodium deficit (also contributes HCO3)
//   5. Chalk to satisfy remaining HCO3 deficit after Baking Soda contribution (also contributes Ca)
//
// Formula: grams = (target_mg_L - source_mg_L) * mash_vol_gal / salt_effect_per_g_per_gal
function recommendAdditions(source, targets, mashVol) {
  if (mashVol <= 0) return { gypsum: 0, calcium_chloride: 0, epsom_salt: 0, baking_soda: 0, chalk: 0 }

  const e = SALT_EFFECTS

  // Step 1: CaCl2 for Cl deficit
  const Cl_need      = Math.max(0, targets.Cl  - (source.Cl  || 0))
  const cacl2_g      = Cl_need * mashVol / e.calcium_chloride.Cl

  // Step 2: Epsom salt for Mg deficit
  const Mg_need      = Math.max(0, targets.Mg  - (source.Mg  || 0))
  const epsom_g      = Mg_need * mashVol / e.epsom_salt.Mg

  // Step 3: Gypsum for remaining Ca deficit (CaCl2 already contributed some Ca)
  const Ca_from_cacl2 = cacl2_g * e.calcium_chloride.Ca / mashVol   // mg/L added by CaCl2
  const Ca_need       = Math.max(0, targets.Ca - (source.Ca || 0) - Ca_from_cacl2)
  const gypsum_g      = Ca_need * mashVol / e.gypsum.Ca

  // Step 4: Baking soda for Na deficit
  const Na_need      = Math.max(0, targets.Na  - (source.Na  || 0))
  const baking_g     = Na_need * mashVol / e.baking_soda.Na

  // Step 5: Chalk for remaining HCO3 deficit (Baking Soda already contributed some HCO3)
  const HCO3_from_baking = baking_g * e.baking_soda.HCO3 / mashVol  // mg/L added by NaHCO3
  const HCO3_need        = Math.max(0, targets.HCO3 - (source.HCO3 || 0) - HCO3_from_baking)
  const chalk_g          = HCO3_need * mashVol / e.chalk.HCO3

  return {
    gypsum:           Math.max(0, gypsum_g),
    calcium_chloride: Math.max(0, cacl2_g),
    epsom_salt:       Math.max(0, epsom_g),
    baking_soda:      Math.max(0, baking_g),
    chalk:            Math.max(0, chalk_g),
  }
}

// Calculates the resulting water profile after adding salts to source water.
// Formula: result_mineral_mg_L = source_mg_L + (grams_of_salt * effect_per_g_per_gal / mash_vol_gal)
// The "effect per g/gal" means: if you add X grams to Y gallons, the concentration
// increase is (X/Y) * effect_constant mg/L.
function calcResult(source, adds, mashVol) {
  if (mashVol <= 0) return Object.fromEntries(MINERALS.map(m => [m, parseFloat(source[m]) || 0]))

  const e = SALT_EFFECTS
  const added = { Ca: 0, Mg: 0, Na: 0, Cl: 0, SO4: 0, HCO3: 0 }

  if (adds.gypsum           > 0) { added.Ca  += adds.gypsum           * e.gypsum.Ca           / mashVol; added.SO4  += adds.gypsum           * e.gypsum.SO4           / mashVol }
  if (adds.calcium_chloride > 0) { added.Ca  += adds.calcium_chloride * e.calcium_chloride.Ca  / mashVol; added.Cl   += adds.calcium_chloride * e.calcium_chloride.Cl   / mashVol }
  if (adds.epsom_salt       > 0) { added.Mg  += adds.epsom_salt       * e.epsom_salt.Mg        / mashVol; added.SO4  += adds.epsom_salt       * e.epsom_salt.SO4        / mashVol }
  if (adds.baking_soda      > 0) { added.Na  += adds.baking_soda      * e.baking_soda.Na       / mashVol; added.HCO3 += adds.baking_soda      * e.baking_soda.HCO3      / mashVol }
  if (adds.chalk            > 0) { added.Ca  += adds.chalk            * e.chalk.Ca             / mashVol; added.HCO3 += adds.chalk            * e.chalk.HCO3            / mashVol }

  return Object.fromEntries(MINERALS.map(m => [m, Math.max(0, (parseFloat(source[m]) || 0) + added[m])]))
}

// Estimates mash pH using Kolbach's Residual Alkalinity (RA) formula.
//
// RA (mEq/L) = (HCO3 / 61) − (Ca / 20) − (Mg / 12.2)
//   where HCO3, Ca, Mg are in mg/L
//   Equivalent weights: HCO3=61, Ca=20 (atomic 40, valence 2), Mg=12.2 (atomic 24.3, valence 2)
//
// Base mash pH ≈ 5.5 + 0.03 × RA  (calibrated for typical light grain bill)
// Dark malt correction: ~1.0 pH unit reduction at 100% dark malt (rough estimate)
//
// Important: this is a planning estimate only. Verify with a calibrated pH meter.
function estimateMashPH(result, darkMaltPct) {
  const RA = (result.HCO3 / 61) - (result.Ca / 20) - (result.Mg / 12.2)
  const basePH = 5.5 + (0.03 * RA)
  const darkCorrection = (darkMaltPct / 100) * 1.2
  return Math.max(4.5, Math.min(6.5, basePH - darkCorrection))
}

// Returns what fraction of ingredient lines are dark specialty malts (by name).
// Used for the mash pH estimate correction.
function getDarkMaltPct(lines) {
  if (!lines || lines.length === 0) return 0
  const darkCount = lines.filter(l => {
    const name = (l.ingredient_name || '').toLowerCase()
    return DARK_MALT_KEYWORDS.some(kw => name.includes(kw))
  }).length
  return (darkCount / lines.length) * 100
}

const EMPTY_SOURCE = { name: '', Ca: 0, Mg: 0, Na: 0, Cl: 0, SO4: 0, HCO3: 0 }
const EMPTY_ADDS   = { gypsum: 0, calcium_chloride: 0, epsom_salt: 0, baking_soda: 0, chalk: 0 }

// ── Main component ────────────────────────────────────────────────────────────

export default function WaterChemistryTab({ recipeId, recipe, batchSize, lines, isReadOnly }) {
  const { brewery } = useAuth()

  // ── Source water state ────────────────────────────────────────────────────
  const [source, setSource]           = useState(EMPTY_SOURCE)
  const [editingSource, setEditingSource] = useState(false)
  const [sourceForm, setSourceForm]   = useState(EMPTY_SOURCE)
  const [sourceSaving, setSourceSaving] = useState(false)
  const [sourceSaved, setSourceSaved] = useState(false)

  // ── Target profile state ──────────────────────────────────────────────────
  const [targetProfile, setTargetProfile]   = useState('')          // profile name
  const [customTargets, setCustomTargets]   = useState({ Ca: 100, Mg: 10, Na: 15, Cl: 75, SO4: 250, HCO3: 25 })

  // ── Batch volume inputs ───────────────────────────────────────────────────
  const [mashPct, setMashPct] = useState('75')  // mash water as % of total batch volume

  // ── Salt additions (grams) — start calculated, can be manually overridden ─
  const [additions, setAdditions] = useState({ ...EMPTY_ADDS })
  const [autoCalc, setAutoCalc]   = useState(true)   // false when user has manually overridden any field

  // ── Auto-save status ──────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved' | 'saving' | 'error'
  const [loaded, setLoaded]         = useState(false)
  const saveTimerRef = useRef(null)

  // ── Load source water + recipe water settings on mount ───────────────────
  useEffect(() => {
    if (!brewery?.id) return
    loadWaterData()
  }, [brewery?.id, recipeId])

  async function loadWaterData() {
    const [brewRes] = await Promise.all([
      supabase.from('breweries')
        .select('source_water_name, source_water_calcium, source_water_magnesium, source_water_sodium, source_water_chloride, source_water_sulfate, source_water_bicarbonate')
        .eq('id', brewery.id)
        .single(),
    ])

    if (brewRes.data) {
      const d = brewRes.data
      const sw = {
        name:  d.source_water_name    || '',
        Ca:    parseFloat(d.source_water_calcium)     || 0,
        Mg:    parseFloat(d.source_water_magnesium)   || 0,
        Na:    parseFloat(d.source_water_sodium)      || 0,
        Cl:    parseFloat(d.source_water_chloride)    || 0,
        SO4:   parseFloat(d.source_water_sulfate)     || 0,
        HCO3:  parseFloat(d.source_water_bicarbonate) || 0,
      }
      setSource(sw)
      setSourceForm(sw)
    }

    // Load recipe water chemistry settings
    if (recipe) {
      const profile = recipe.water_target_profile || ''
      setTargetProfile(profile)
      if (profile === 'Custom') {
        setCustomTargets({
          Ca:   parseFloat(recipe.water_calcium_target)     || 100,
          Mg:   parseFloat(recipe.water_magnesium_target)   || 10,
          Na:   parseFloat(recipe.water_sodium_target)      || 15,
          Cl:   parseFloat(recipe.water_chloride_target)    || 75,
          SO4:  parseFloat(recipe.water_sulfate_target)     || 250,
          HCO3: parseFloat(recipe.water_bicarbonate_target) || 25,
        })
      }
      if (recipe.water_additions && typeof recipe.water_additions === 'object') {
        setAdditions({ ...EMPTY_ADDS, ...recipe.water_additions })
        setAutoCalc(false)  // treat saved additions as manually set
      }
    }

    setLoaded(true)
  }

  // ── Derived: batch and mash volumes in gallons ────────────────────────────
  const batchGal = useMemo(() => {
    const bbls = convertToBarrels(parseFloat(batchSize) || 0, recipe?.base_batch_size_unit)
    return bbls * GALLONS_PER_BARREL
  }, [batchSize, recipe?.base_batch_size_unit])

  const mashVol  = batchGal * (parseFloat(mashPct) / 100 || 0.75)
  const spargeVol = Math.max(0, batchGal - mashVol)

  // ── Derived: effective target values ─────────────────────────────────────
  // For preset profiles use the midpoint of the range; for Custom use user-set values.
  const targetVals = useMemo(() => {
    const prof = WATER_PROFILES[targetProfile]
    if (!prof) return { Ca: 0, Mg: 0, Na: 0, Cl: 0, SO4: 0, HCO3: 0 }
    if (targetProfile === 'Custom') return { ...customTargets }
    return Object.fromEntries(MINERALS.map(m => [m, mid(prof[m])]))
  }, [targetProfile, customTargets])

  // ── Auto-recalculate additions when profile or volumes change ─────────────
  useEffect(() => {
    if (!loaded || !autoCalc || !targetProfile) return
    const rec = recommendAdditions(source, targetVals, mashVol)
    setAdditions(rec)
  }, [source, targetVals, mashVol, autoCalc, loaded, targetProfile])

  // ── Derived: resulting water profile after additions ──────────────────────
  const result = useMemo(() => calcResult(source, additions, mashVol), [source, additions, mashVol])

  // ── Derived: mash pH estimate ─────────────────────────────────────────────
  const darkMaltPct = useMemo(() => getDarkMaltPct(lines), [lines])
  const estPH       = useMemo(() => estimateMashPH(result, darkMaltPct), [result, darkMaltPct])

  // Lactic acid volume to lower pH to 5.3 target (if above range)
  // Rule of thumb: ~1 mL of 88% lactic acid per 5 gallons lowers pH by ~0.1
  const lacticNeeded = estPH > 5.4 ? ((estPH - 5.3) * mashVol / 5).toFixed(1) : null

  // ── Auto-save recipe water settings with debounce ─────────────────────────
  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(saveWaterToRecipe, 1500)
    return () => clearTimeout(saveTimerRef.current)
  }, [targetProfile, customTargets, additions, loaded])

  async function saveWaterToRecipe() {
    if (!recipeId) return
    setSaveStatus('saving')
    const { error } = await supabase.from('recipes').update({
      water_target_profile:      targetProfile || null,
      water_calcium_target:      targetVals.Ca     || null,
      water_magnesium_target:    targetVals.Mg     || null,
      water_sodium_target:       targetVals.Na     || null,
      water_chloride_target:     targetVals.Cl     || null,
      water_sulfate_target:      targetVals.SO4    || null,
      water_bicarbonate_target:  targetVals.HCO3   || null,
      water_additions:           additions,
    }).eq('id', recipeId)
    setSaveStatus(error ? 'error' : 'saved')
  }

  // ── Save source water profile to brewery ─────────────────────────────────
  async function saveSourceWater() {
    if (!brewery?.id) return
    setSourceSaving(true)
    const { error } = await supabase.from('breweries').update({
      source_water_name:        sourceForm.name  || null,
      source_water_calcium:     parseFloat(sourceForm.Ca)   || 0,
      source_water_magnesium:   parseFloat(sourceForm.Mg)   || 0,
      source_water_sodium:      parseFloat(sourceForm.Na)   || 0,
      source_water_chloride:    parseFloat(sourceForm.Cl)   || 0,
      source_water_sulfate:     parseFloat(sourceForm.SO4)  || 0,
      source_water_bicarbonate: parseFloat(sourceForm.HCO3) || 0,
    }).eq('id', brewery.id)
    setSourceSaving(false)
    if (!error) {
      setSource({ ...sourceForm })
      setEditingSource(false)
      setSourceSaved(true)
      setTimeout(() => setSourceSaved(false), 3000)
      // Reset autoCalc so additions recalculate from new source
      if (autoCalc) {
        const rec = recommendAdditions(sourceForm, targetVals, mashVol)
        setAdditions(rec)
      }
    }
  }

  // ── Helper: status indicator color for a resulting mineral ────────────────
  // Returns 'ok', 'warn', or 'high' based on how far the result is from the target range.
  function mineralStatus(mineral, resultVal) {
    const prof = WATER_PROFILES[targetProfile]
    if (!prof) return 'ok'
    const [lo, hi] = targetProfile === 'Custom'
      ? [customTargets[mineral] * 0.8, customTargets[mineral] * 1.2]
      : prof[mineral]
    if (resultVal >= lo && resultVal <= hi) return 'ok'
    const margin = (hi - lo) * 0.25
    if (resultVal < lo - margin || resultVal > hi + margin) return 'high'
    return 'warn'
  }

  // ── Number formatting ──────────────────────────────────────────────────────
  function fmtM(val) { return (parseFloat(val) || 0).toFixed(1) }
  function fmtG(val) { return (parseFloat(val) || 0).toFixed(1) }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Auto-save indicator */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Water chemistry settings are saved automatically to this recipe.
        </p>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          saveStatus === 'saving' ? 'bg-amber/10 text-amber' :
          saveStatus === 'error'  ? 'bg-red-50 text-danger' :
          'bg-green-100 text-success'
        }`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved ✓'}
        </span>
      </div>

      {/* ── Section 1: Source Water Profile ──────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-navy">Source Water Profile</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Your tap or well water mineral content. Saved once and shared across all recipes.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {sourceSaved && <span className="text-xs text-success font-medium">Saved ✓</span>}
            {!isReadOnly && !editingSource && (
              <button
                onClick={() => { setSourceForm({ ...source }); setEditingSource(true) }}
                className="text-xs border border-amber text-amber px-3 py-1.5 rounded-lg hover:bg-amber/5 transition-colors font-medium"
              >
                Edit Source Water
              </button>
            )}
          </div>
        </div>

        <div className="p-5">
          {editingSource ? (
            /* ── Inline edit form ── */
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Water Source Name</label>
                <input
                  type="text"
                  placeholder="e.g. Philadelphia Municipal Water"
                  value={sourceForm.name}
                  onChange={e => setSourceForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {MINERALS.map(m => (
                  <div key={m}>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      {MINERAL_NAME[m]} ({MINERAL_SYM[m]}) mg/L
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={sourceForm[m]}
                      onChange={e => setSourceForm(p => ({ ...p, [m]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={saveSourceWater}
                  disabled={sourceSaving}
                  className="bg-amber hover:bg-amber-dark text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  {sourceSaving ? 'Saving…' : 'Save Source Water'}
                </button>
                <button
                  onClick={() => setEditingSource(false)}
                  className="border border-gray-300 text-gray-600 font-medium px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── Read-only display ── */
            <div>
              {source.name && (
                <p className="text-sm font-semibold text-navy mb-3">{source.name}</p>
              )}
              {!source.name && !MINERALS.some(m => source[m] > 0) ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400 mb-2">No source water profile saved yet.</p>
                  <p className="text-xs text-gray-400">
                    Click "Edit Source Water" to enter your tap or well water mineral content.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                  {MINERALS.map(m => (
                    <div key={m}>
                      <p className="text-xs text-gray-500">{MINERAL_NAME[m]} ({MINERAL_SYM[m]})</p>
                      <p className="font-semibold text-navy">{fmtM(source[m])} mg/L</p>
                    </div>
                  ))}
                </div>
              )}
              <a
                href="https://www.epa.gov/ccr"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-xs text-amber hover:underline"
              >
                Find your water report → search EPA water quality database
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Target Profile ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-navy">Target Water Profile</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Select the style that best matches this recipe.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Profile selection cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(WATER_PROFILES).map(([name, prof]) => (
              <button
                key={name}
                onClick={() => {
                  setTargetProfile(name)
                  setAutoCalc(true)
                }}
                disabled={isReadOnly}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  targetProfile === name
                    ? 'border-amber bg-amber/5'
                    : 'border-gray-200 hover:border-amber/50 bg-white'
                } disabled:opacity-50`}
              >
                <p className={`text-sm font-semibold ${targetProfile === name ? 'text-amber' : 'text-navy'}`}>
                  {name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{prof.description}</p>
              </button>
            ))}
          </div>

          {/* Target range display for selected profile */}
          {targetProfile && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {targetProfile === 'Custom' ? 'Custom Targets (mg/L)' : `${targetProfile} Target Ranges (mg/L)`}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {MINERALS.map(m => {
                  const prof = WATER_PROFILES[targetProfile]
                  if (!prof) return null
                  const [lo, hi] = prof[m]
                  return (
                    <div key={m} className="text-center bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">{MINERAL_SYM[m]}</p>
                      {targetProfile === 'Custom' ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={customTargets[m]}
                          onChange={e => {
                            setCustomTargets(p => ({ ...p, [m]: parseFloat(e.target.value) || 0 }))
                            setAutoCalc(true)
                          }}
                          disabled={isReadOnly}
                          className="w-full text-center border border-gray-300 rounded px-1 py-1 text-sm font-bold text-navy focus:outline-none focus:ring-1 focus:ring-amber bg-white"
                        />
                      ) : (
                        <p className="text-xs font-bold text-navy">{lo}–{hi}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Mineral Addition Calculator ───────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-navy">Mineral Addition Calculator</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Calculated for mash water only. Additions recalculate automatically when the profile changes.
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Batch and mash volumes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Total Batch Volume (auto)
              </label>
              <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                <span className="text-sm font-semibold text-navy">{batchGal.toFixed(1)} gal</span>
                <span className="text-xs text-gray-400 ml-2">from recipe</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Mash Water (% of batch)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="100"
                  step="5"
                  value={mashPct}
                  onChange={e => setMashPct(e.target.value)}
                  disabled={isReadOnly}
                  className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                />
                <span className="text-sm text-gray-500">% = {mashVol.toFixed(1)} gal</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Sparge Water (auto)
              </label>
              <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                <span className="text-sm font-semibold text-navy">{spargeVol.toFixed(1)} gal</span>
              </div>
            </div>
          </div>

          {/* Additions table */}
          {targetProfile ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Mash Water Additions
                  </p>
                  {!autoCalc && (
                    <button
                      onClick={() => { setAutoCalc(true) }}
                      className="text-xs text-amber hover:underline"
                    >
                      Reset to calculated
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Salt</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600 text-xs w-28">Amount (g)</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Adds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(SALT_LABELS).map(salt => {
                        const grams = parseFloat(additions[salt]) || 0
                        const effect = SALT_EFFECTS[salt]
                        // Calculate what this amount of salt adds to mash water
                        const effectDesc = Object.entries(effect)
                          .map(([m, val]) => `+${(grams * val / (mashVol || 1)).toFixed(1)} ${MINERAL_SYM[m] || m}`)
                          .join(', ')
                        return (
                          <tr key={salt} className="border-b border-gray-50">
                            <td className="px-3 py-2.5 font-medium text-navy">{SALT_LABELS[salt]}</td>
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={fmtG(additions[salt])}
                                onChange={e => {
                                  setAutoCalc(false)
                                  setAdditions(p => ({ ...p, [salt]: parseFloat(e.target.value) || 0 }))
                                }}
                                disabled={isReadOnly}
                                className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-amber"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">
                              {grams > 0 ? effectDesc : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resulting profile comparison table */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Resulting Water Profile
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Mineral</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Source</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">+ Additions</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs font-bold">Result</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600 text-xs">Target Range</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600 text-xs">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MINERALS.map(m => {
                        const srcVal   = parseFloat(source[m]) || 0
                        const resVal   = result[m] || 0
                        const addedVal = Math.max(0, resVal - srcVal)
                        const prof     = WATER_PROFILES[targetProfile]
                        const [lo, hi] = targetProfile === 'Custom'
                          ? [customTargets[m] * 0.8, customTargets[m] * 1.2]
                          : (prof?.[m] ?? [0, 0])
                        const status   = mineralStatus(m, resVal)

                        return (
                          <tr key={m} className="border-b border-gray-50">
                            <td className="px-3 py-2.5 font-medium text-navy">
                              {MINERAL_NAME[m]} ({MINERAL_SYM[m]})
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                              {fmtM(srcVal)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                              {addedVal > 0.05 ? `+${fmtM(addedVal)}` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold text-navy">
                              {fmtM(resVal)}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-500">
                              {targetProfile === 'Custom'
                                ? `${customTargets[m]}`
                                : `${lo}–${hi}`}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {status === 'ok'   && <span className="text-success font-bold">✓</span>}
                              {status === 'warn' && <span className="text-amber  font-bold">⚠</span>}
                              {status === 'high' && <span className="text-danger  font-bold">✕</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  <span><span className="text-success font-bold">✓</span> In target range</span>
                  <span><span className="text-amber font-bold">⚠</span> Slightly outside range</span>
                  <span><span className="text-danger font-bold">✕</span> Significantly outside range</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              Select a target profile above to see mineral addition recommendations.
            </p>
          )}
        </div>
      </div>

      {/* ── Section 4: Mash pH Estimate ──────────────────────────────────── */}
      {targetProfile && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-navy">Mash pH Estimate</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Estimated from water residual alkalinity and dark malt content. Planning purposes only.
            </p>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* pH estimate */}
              <div className={`rounded-xl border-2 p-4 text-center ${
                estPH >= 5.2 && estPH <= 5.4 ? 'border-green-200 bg-green-50' :
                estPH > 5.4 && estPH <= 5.6  ? 'border-amber/50 bg-amber/5' :
                'border-red-200 bg-red-50'
              }`}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Estimated Mash pH
                </p>
                <p className={`text-3xl font-bold ${
                  estPH >= 5.2 && estPH <= 5.4 ? 'text-green-700' :
                  estPH > 5.4 && estPH <= 5.6  ? 'text-amber' :
                  'text-danger'
                }`}>
                  {estPH.toFixed(2)}
                </p>
                <p className={`text-xs mt-1 font-medium ${
                  estPH >= 5.2 && estPH <= 5.4 ? 'text-green-600' :
                  estPH > 5.4 && estPH <= 5.6  ? 'text-amber' :
                  'text-danger'
                }`}>
                  {estPH >= 5.2 && estPH <= 5.4 ? '✓ In target range' :
                   estPH > 5.4 && estPH <= 5.6  ? 'Slightly high' :
                   estPH > 5.6                   ? 'Too high' : 'Too low'}
                </p>
              </div>

              {/* Target range */}
              <div className="rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Target Range
                </p>
                <p className="text-2xl font-bold text-navy">5.2 – 5.4</p>
                <p className="text-xs text-gray-400 mt-1">Optimal for most beer styles</p>
              </div>

              {/* Dark malt detected */}
              <div className="rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Dark Malt Detected
                </p>
                <p className="text-2xl font-bold text-navy">{darkMaltPct.toFixed(0)}%</p>
                <p className="text-xs text-gray-400 mt-1">of recipe ingredients</p>
              </div>
            </div>

            {/* Lactic acid suggestion */}
            {lacticNeeded && (
              <div className="bg-amber/5 border border-amber/30 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-amber">Suggestion</p>
                <p className="text-sm text-gray-700 mt-0.5">
                  Add approximately <strong>{lacticNeeded} mL</strong> of 88% lactic acid to the mash
                  to lower pH by ~{((estPH - 5.3)).toFixed(1)} and reach the 5.3 target.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Rule of thumb: 1 mL of 88% lactic acid per 5 gallons of mash water lowers pH by ~0.1.
                </p>
              </div>
            )}
            {!lacticNeeded && estPH >= 5.2 && estPH <= 5.4 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-green-700">
                  ✓ Your mash pH is estimated to be in range — no acid additions needed.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Disclaimer ────────────────────────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-500">
          <strong>Disclaimer:</strong> Water chemistry calculations are for planning purposes only.
          Salt addition formulas use industry-standard Brun'Water / EZ Water constants.
          Mash pH predictions are estimates based on simplified water chemistry models.
          Always verify additions with a calibrated pH meter on brew day and consult brewing
          references for your specific grain bill.
        </p>
      </div>

    </div>
  )
}
