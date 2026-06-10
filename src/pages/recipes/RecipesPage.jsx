/**
 * RecipesPage — Recipe Builder & Cost Calculator list view.
 * Wrapped in TierGate so Essentials users see a locked frosted-glass preview.
 * Operations and Full Suite users get full access.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
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
import {
  convertToBarrels, calculateTotalIngredientCost,
  calculateTotalProductionCost, calculateCostPerBarrel, calculateCostPerPint,
  formatDollars,
} from './recipeUtils'

// ─── Static data ──────────────────────────────────────────────────────────────

// Complete BJCP 2021 style list in numerical order.
// Used as a <select> dropdown; 'Other / Custom' triggers a free-text input.
const BJCP_STYLES = [
  // Category 1: Standard American Beer
  '1A: American Light Lager', '1B: American Lager', '1C: Cream Ale', '1D: American Wheat Beer',
  // Category 2: International Lager
  '2A: International Pale Lager', '2B: International Amber Lager', '2C: International Dark Lager',
  // Category 3: Czech Lager
  '3A: Czech Pale Lager', '3B: Czech Premium Pale Lager', '3C: Czech Amber Lager', '3D: Czech Dark Lager',
  // Category 4: Pale Malty European Lager
  '4A: Munich Helles', '4B: Festbier', '4C: Helles Bock',
  // Category 5: Pale Bitter European Beer
  '5A: German Leichtbier', '5B: Kölsch', '5C: German Helles Exportbier', '5D: German Pils',
  // Category 6: Amber Malty European Lager
  '6A: Märzen', '6B: Rauchbier', '6C: Dunkles Bock',
  // Category 7: Amber Bitter European Beer
  '7A: Vienna Lager', '7B: Altbier', '7C: Kellerbier',
  // Category 8: Dark European Lager
  '8A: Munich Dunkel', '8B: Schwarzbier',
  // Category 9: Strong European Beer
  '9A: Doppelbock', '9B: Eisbock', '9C: Baltic Porter',
  // Category 10: German Wheat Beer
  '10A: Weissbier', '10B: Dunkles Weissbier', '10C: Weizenbock', '10D: Köstritzer Schwarzbier',
  // Category 11: British Bitter
  '11A: Ordinary Bitter', '11B: Best Bitter', '11C: Strong Bitter',
  // Category 12: Pale Commonwealth Beer
  '12A: British Golden Ale', '12B: Australian Sparkling Ale', '12C: English IPA',
  // Category 13: Brown British Beer
  '13A: Dark Mild', '13B: British Brown Ale', '13C: English Porter',
  // Category 14: Scottish Ale
  '14A: Scottish Light', '14B: Scottish Heavy', '14C: Scottish Export',
  // Category 15: Irish Beer
  '15A: Irish Red Ale', '15B: Irish Stout', '15C: Irish Extra Stout',
  // Category 16: Dark British Beer
  '16A: Sweet Stout', '16B: Oatmeal Stout', '16C: Tropical Stout', '16D: Foreign Extra Stout',
  // Category 17: Strong British Ale
  '17A: British Strong Ale', '17B: Old Ale', '17C: Wee Heavy', '17D: English Barleywine',
  // Category 18: Pale American Ale
  '18A: Blonde Ale', '18B: American Pale Ale',
  // Category 19: Amber and Brown American Beer
  '19A: American Amber Ale', '19B: California Common', '19C: American Brown Ale',
  // Category 20: American Porter and Stout
  '20A: American Porter', '20B: American Stout', '20C: Imperial Stout',
  // Category 21: IPA
  '21A: American IPA', '21B: Specialty IPA: Belgian IPA', '21B: Specialty IPA: Black IPA',
  '21B: Specialty IPA: Brown IPA', '21B: Specialty IPA: New England IPA',
  '21B: Specialty IPA: Red IPA', '21B: Specialty IPA: Rye IPA',
  '21B: Specialty IPA: White IPA', '21C: Hazy IPA',
  // Category 22: Strong American Ale
  '22A: Double IPA', '22B: American Strong Ale', '22C: American Barleywine', '22D: Wheatwine',
  // Category 23: European Sour Ale
  '23A: Berliner Weisse', '23B: Flanders Red Ale', '23C: Oud Bruin', '23D: Lambic',
  '23E: Gueuze', '23F: Fruit Lambic',
  // Category 24: Belgian Ale
  '24A: Witbier', '24B: Belgian Pale Ale', '24C: Bière de Garde',
  // Category 25: Strong Belgian Ale
  '25A: Belgian Blond Ale', '25B: Saison', '25C: Belgian Golden Strong Ale',
  // Category 26: Trappist Ale
  '26A: Single', '26B: Dubbel', '26C: Tripel', '26D: Belgian Dark Strong Ale',
  // Category 27: Historical Beer
  '27A: Historical Beer: Gose', '27A: Historical Beer: Kentucky Common',
  '27A: Historical Beer: Lichtenhainer', '27A: Historical Beer: London Brown Ale',
  '27A: Historical Beer: Piwo Grodziskie', '27A: Historical Beer: Pre-Prohibition Lager',
  '27A: Historical Beer: Pre-Prohibition Porter', '27A: Historical Beer: Roggenbier',
  '27A: Historical Beer: Sahti',
  // Category 28: American Wild Ale
  '28A: Brett Beer', '28B: Mixed-Fermentation Sour Beer', '28C: Wild Specialty Beer',
  // Category 29: Fruit Beer
  '29A: Fruit Beer', '29B: Fruit and Spice Beer', '29C: Specialty Fruit Beer', '29D: Grape Ale',
  // Category 30: Spiced Beer
  '30A: Spice, Herb, or Vegetable Beer', '30B: Autumn Seasonal Beer',
  '30C: Winter Seasonal Beer', '30D: Specialty Spice Beer',
  // Category 31: Alternative Fermentables Beer
  '31A: Alternative Grain Beer', '31B: Alternative Sugar Beer',
  // Category 32: Smoked Beer
  '32A: Classic Style Smoked Beer', '32B: Specialty Smoked Beer',
  // Category 33: Wood Beer
  '33A: Wood-Aged Beer', '33B: Specialty Wood-Aged Beer',
  // Category 34: Specialty Beer
  '34A: Commercial Specialty Beer', '34B: Mixed-Style Beer', '34C: Experimental Beer',
  // Custom
  'Other / Custom',
]

const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'District of Columbia': 'DC',
}

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

function getDefaultSalesTax(breweryState) {
  if (!breweryState) return 0
  const code = STATE_ABBR[breweryState]
  return code !== undefined ? (STATE_SALES_TAX[code] ?? 0) : 0
}

function getDefaultExciseRate(annualProduction) {
  if (!annualProduction) return 3.50
  return annualProduction <= 2000000 ? 3.50 : 16.00
}

function makeEmptyForm(brewery) {
  return {
    name: '', style: '', style_custom: '', bjcp_category: '',
    base_batch_size: '', base_batch_size_unit: 'barrels',
    description: '',
    target_og: '', target_fg: '', target_abv: '', target_ibu: '', target_srm: '',
    overhead_percentage: '30', target_margin_percentage: '65',
    tax_rate: String(getDefaultSalesTax(brewery?.state)),
    excise_tax_rate_per_bbl: getDefaultExciseRate(brewery?.annual_production_estimate),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecipesPage() {
  const { brewery, hasAccess } = useAuth()
  const navigate = useNavigate()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  const [recipes, setRecipes]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [styleFilter, setStyleFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Add Recipe modal
  const [addOpen, setAddOpen]     = useState(false)
  const [form, setForm]           = useState(() => makeEmptyForm(null))
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const draft = useModalDraft('modal_draft_recipe')

  // Save New Version modal
  const [versionModalRecipe, setVersionModalRecipe] = useState(null) // recipe being versioned
  const [versionNotes, setVersionNotes]             = useState('')
  const [versionSaving, setVersionSaving]           = useState(false)
  const [versionError, setVersionError]             = useState('')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)
  const [deleteError, setDeleteError]   = useState('')

  // ── Load recipes ────────────────────────────────────────────────────────────

  const loadRecipes = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)

    // Fetch all recipes for this brewery plus brewed recipe IDs in parallel
    const [recipeRes, brewedRes] = await Promise.all([
      supabase.from('recipes').select('*').eq('brewery_id', brewery.id).order('updated_at', { ascending: false }),
      supabase.from('brew_days').select('recipe_id').eq('brewery_id', brewery.id).not('recipe_id', 'is', null),
    ])

    if (recipeRes.error || !recipeRes.data) { setLoading(false); return }

    const recipeRows = recipeRes.data
    // Set of recipe IDs that have at least one brew day linked
    const brewedSet  = new Set((brewedRes.data ?? []).map(b => b.recipe_id))
    // Count brew days per recipe for the delete warning
    const brewDayCountByRecipe = {}
    for (const b of (brewedRes.data ?? [])) {
      if (b.recipe_id) brewDayCountByRecipe[b.recipe_id] = (brewDayCountByRecipe[b.recipe_id] ?? 0) + 1
    }

    // Compute version family sizes so cards can show version badges and history links.
    // Family root = parent_recipe_id if present, otherwise the recipe's own id.
    const rootCount = {}
    for (const r of recipeRows) {
      const root = r.parent_recipe_id ?? r.id
      rootCount[root] = (rootCount[root] ?? 0) + 1
    }

    // Fetch ingredient lines for all recipes in one query to compute cost per pint on cards
    const ids = recipeRows.map(r => r.id)
    const { data: lineRows } = ids.length > 0
      ? await supabase
          .from('recipe_ingredients')
          .select('recipe_id, amount, unit, scale_with_batch, ingredient:ingredients(current_price_per_unit), supplier:ingredient_suppliers(price_per_unit)')
          .in('recipe_id', ids)
      : { data: [] }

    // Group lines by recipe and compute a quick cost estimate
    const linesByRecipe = {}
    for (const line of (lineRows ?? [])) {
      if (!linesByRecipe[line.recipe_id]) linesByRecipe[line.recipe_id] = []
      linesByRecipe[line.recipe_id].push(line)
    }

    const enriched = recipeRows.map(r => {
      const lines = linesByRecipe[r.id] ?? []
      const mapped = lines.map(l => ({
        amount: parseFloat(l.amount) || 0,
        scale_with_batch: l.scale_with_batch,
        price_per_unit: parseFloat(l.supplier?.price_per_unit ?? l.ingredient?.current_price_per_unit ?? 0),
      }))
      const barrels   = convertToBarrels(r.base_batch_size, r.base_batch_size_unit)
      const totalIng  = calculateTotalIngredientCost(mapped, r.base_batch_size, r.base_batch_size)
      const breakdown = calculateTotalProductionCost(totalIng, 0, 0, 0, r.fixed_overhead_percentage ?? 15)
      const cpp       = calculateCostPerPint(calculateCostPerBarrel(breakdown.totalCost, barrels))
      const root      = r.parent_recipe_id ?? r.id
      return {
        ...r,
        _ingredientCount:   lines.length,
        _costPerPint:       cpp,
        _hasBrewed:         brewedSet.has(r.id),
        _brewDayCount:      brewDayCountByRecipe[r.id] ?? 0,
        _versionFamilySize: rootCount[root] ?? 1,
      }
    })

    setRecipes(enriched)
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => {
    if (hasAccess('operations')) loadRecipes()
    else setLoading(false)
  }, [brewery?.id, hasAccess('operations')])

  // ── Draft management ────────────────────────────────────────────────────────

  function openAddModal() {
    const saved = draft.loadDraft()
    setForm(saved ?? makeEmptyForm(brewery))
    setSaveError('')
    setAddOpen(true)
  }

  function closeAddModal() {
    draft.clearDraft()
    setForm(makeEmptyForm(brewery))
    setAddOpen(false)
  }

  function updateForm(field, value) {
    const next = { ...form, [field]: value }
    setForm(next)
    draft.saveDraft(next)
  }

  const isDirty = Object.keys(form).some(k => form[k] !== makeEmptyForm(brewery)[k])

  // ── Save recipe ─────────────────────────────────────────────────────────────

  async function handleSaveRecipe(e) {
    e.preventDefault()
    if (!form.name.trim()) { setSaveError('Beer name is required.'); return }
    if (!form.base_batch_size) { setSaveError('Base batch size is required.'); return }

    setSaving(true)
    setSaveError('')

    const { data, error } = await supabase
      .from('recipes')
      .insert({
        brewery_id: brewery.id,
        name: form.name.trim(),
        style: form.style === 'Other / Custom' ? (form.style_custom.trim() || null) : (form.style || null),
        bjcp_category: form.bjcp_category || null,
        base_batch_size: parseFloat(form.base_batch_size),
        base_batch_size_unit: form.base_batch_size_unit,
        description: form.description || null,
        target_og: form.target_og ? parseFloat(form.target_og) : null,
        target_fg: form.target_fg ? parseFloat(form.target_fg) : null,
        target_abv: form.target_abv ? parseFloat(form.target_abv) : null,
        target_ibu: form.target_ibu ? parseFloat(form.target_ibu) : null,
        target_srm: form.target_srm ? parseFloat(form.target_srm) : null,
        overhead_percentage: parseFloat(form.overhead_percentage) || 30,
        target_margin_percentage: parseFloat(form.target_margin_percentage) || 65,
        tax_rate: parseFloat(form.tax_rate) || 0,
        excise_tax_rate_per_bbl: parseFloat(form.excise_tax_rate_per_bbl) || 3.50,
      })
      .select()
      .single()

    setSaving(false)

    if (error) { setSaveError(error.message); return }

    draft.clearDraft()
    // Navigate directly to the detail page so the user can add ingredients immediately
    navigate(`/recipes/${data.id}`)
  }

  // ── Archive / unarchive ─────────────────────────────────────────────────────

  async function handleArchive(recipe) {
    const next = !recipe.is_archived
    await supabase.from('recipes').update({ is_archived: next }).eq('id', recipe.id)
    setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, is_archived: next } : r))
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')

    // Sever brew day links so logs are preserved but lose their recipe reference
    if (deleteTarget._brewDayCount > 0) {
      await supabase.from('brew_days').update({ recipe_id: null, recipe_name: deleteTarget.name }).eq('recipe_id', deleteTarget.id)
    }

    // Remove ingredient lines first (avoids FK issues if cascade isn't set)
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', deleteTarget.id)

    const { error } = await supabase.from('recipes').delete().eq('id', deleteTarget.id)
    if (error) {
      setDeleteError(error.message)
      setDeleting(false)
      return
    }

    setRecipes(prev => prev.filter(r => r.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  async function handleDuplicate(recipe) {
    const { data: copy, error } = await supabase
      .from('recipes')
      .insert({
        brewery_id:                  brewery.id,
        name:                        `${recipe.name} — Copy`,
        style:                       recipe.style,
        bjcp_category:               recipe.bjcp_category,
        base_batch_size:             recipe.base_batch_size,
        base_batch_size_unit:        recipe.base_batch_size_unit,
        description:                 recipe.description,
        target_og:                   recipe.target_og,
        target_fg:                   recipe.target_fg,
        target_abv:                  recipe.target_abv,
        target_ibu:                  recipe.target_ibu,
        target_srm:                  recipe.target_srm,
        packaging_splits:            recipe.packaging_splits ?? null,
        packaging_container_type:    recipe.packaging_container_type,
        packaging_cost_per_unit:     recipe.packaging_cost_per_unit,
        label_cost_per_unit:         recipe.label_cost_per_unit,
        carrier_cost_per_unit:       recipe.carrier_cost_per_unit,
        packaging_yield_percentage:  recipe.packaging_yield_percentage,
        brew_hours:                  recipe.brew_hours,
        labor_rate_per_hour:         recipe.labor_rate_per_hour,
        utilities_cost_per_barrel:   recipe.utilities_cost_per_barrel,
        cleaning_cost_per_batch:     recipe.cleaning_cost_per_batch,
        water_cost_per_barrel:       recipe.water_cost_per_barrel,
        wastewater_cost_per_barrel:  recipe.wastewater_cost_per_barrel,
        fixed_overhead_percentage:   recipe.fixed_overhead_percentage,
        target_margin_percentage:    recipe.target_margin_percentage,
        tax_rate:                    recipe.tax_rate,
        version:                     (recipe.version ?? 1) + 1,
        parent_recipe_id:            recipe.id,
      })
      .select()
      .single()

    if (error || !copy) return

    // Copy all ingredient lines to the new recipe
    const { data: ings } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', recipe.id)

    if (ings?.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        ings.map(({ id, recipe_id, created_at, updated_at, ...rest }) => ({
          ...rest,
          recipe_id:  copy.id,
          brewery_id: brewery.id,
        }))
      )
    }

    navigate(`/recipes/${copy.id}`)
  }

  // ── Save New Version ────────────────────────────────────────────────────────

  function openVersionModal(recipe) {
    setVersionModalRecipe(recipe)
    setVersionNotes('')
    setVersionError('')
  }

  function closeVersionModal() {
    setVersionModalRecipe(null)
    setVersionNotes('')
    setVersionError('')
  }

  // Creates a new version of a recipe: marks the old one as not current, copies all fields
  // and ingredients into a new row, then navigates to the new version.
  async function handleSaveNewVersion(e) {
    e.preventDefault()
    if (!versionNotes.trim()) { setVersionError('Please describe what changed in this version.'); return }

    const recipe = versionModalRecipe
    setVersionSaving(true)
    setVersionError('')

    // The root parent is always the original recipe (never an intermediate version)
    const rootParentId = recipe.parent_recipe_id ?? recipe.id

    // Mark the current recipe as no longer the current version
    await supabase.from('recipes').update({ is_current_version: false }).eq('id', recipe.id)

    // Create the new version with all the same fields
    const { data: copy, error: copyErr } = await supabase
      .from('recipes')
      .insert({
        brewery_id:                  brewery.id,
        name:                        recipe.name,
        style:                       recipe.style,
        bjcp_category:               recipe.bjcp_category,
        base_batch_size:             recipe.base_batch_size,
        base_batch_size_unit:        recipe.base_batch_size_unit,
        description:                 recipe.description,
        target_og:                   recipe.target_og,
        target_fg:                   recipe.target_fg,
        target_abv:                  recipe.target_abv,
        target_ibu:                  recipe.target_ibu,
        target_srm:                  recipe.target_srm,
        packaging_splits:            recipe.packaging_splits ?? null,
        packaging_container_type:    recipe.packaging_container_type,
        packaging_cost_per_unit:     recipe.packaging_cost_per_unit,
        label_cost_per_unit:         recipe.label_cost_per_unit,
        carrier_cost_per_unit:       recipe.carrier_cost_per_unit,
        packaging_yield_percentage:  recipe.packaging_yield_percentage,
        brew_hours:                  recipe.brew_hours,
        labor_rate_per_hour:         recipe.labor_rate_per_hour,
        utilities_cost_per_barrel:   recipe.utilities_cost_per_barrel,
        cleaning_cost_per_batch:     recipe.cleaning_cost_per_batch,
        water_cost_per_barrel:       recipe.water_cost_per_barrel,
        wastewater_cost_per_barrel:  recipe.wastewater_cost_per_barrel,
        fixed_overhead_percentage:   recipe.fixed_overhead_percentage,
        target_margin_percentage:    recipe.target_margin_percentage,
        tax_rate:                    recipe.tax_rate,
        version:                     (recipe.version ?? 1) + 1,
        parent_recipe_id:            rootParentId,
        version_notes:               versionNotes.trim(),
        is_current_version:          true,
      })
      .select()
      .single()

    if (copyErr || !copy) {
      // Roll back the is_current_version change if the copy failed
      await supabase.from('recipes').update({ is_current_version: true }).eq('id', recipe.id)
      setVersionError(copyErr?.message ?? 'Could not create new version. Please try again.')
      setVersionSaving(false)
      return
    }

    // Copy all ingredient lines to the new version
    const { data: ings } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', recipe.id)

    if (ings?.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        ings.map(({ id, recipe_id, created_at, ...rest }) => ({
          ...rest,
          recipe_id:  copy.id,
          brewery_id: brewery.id,
        }))
      )
    }

    setVersionSaving(false)
    closeVersionModal()
    navigate(`/recipes/${copy.id}`)
  }

  // ── Filtering ───────────────────────────────────────────────────────────────

  const allStyles = [...new Set(recipes.map(r => r.style).filter(Boolean))].sort()

  const visible = recipes.filter(r => {
    if (!showArchived && r.is_archived) return false
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) &&
        !(r.style ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (styleFilter && r.style !== styleFilter) return false
    return true
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  const pageContent = (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">🧪 Recipe Builder</h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400 hidden sm:block">
            <button
              onClick={() => navigate('/inventory')}
              className="text-amber hover:underline font-medium"
            >
              Manage ingredients & pricing
            </button>
            {' '}in the Inventory module
          </p>
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={openAddModal}
              disabled={isReadOnly}
              className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              + Add Recipe
            </button>
          </ReadOnlyTooltip>
        </div>
      </div>

      {/* Draft notice */}
      {draft.hasDraft && !addOpen && (
        <DraftNoticeBar onContinue={openAddModal} onDiscard={() => draft.clearDraft()} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search recipes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-amber"
        />
        <select
          value={styleFilter}
          onChange={e => setStyleFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          <option value="">All styles</option>
          {allStyles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
            className="rounded border-gray-300 text-amber focus:ring-amber"
          />
          Show archived
        </label>
      </div>

      {/* Loading */}
      {loading && <LoadingSpinner message="Loading recipes..." />}

      {/* Empty state */}
      {!loading && visible.length === 0 && (
        <EmptyState
          icon="🧪"
          title="No recipes yet"
          message={search || styleFilter ? 'No recipes match your filters.' : 'Click Add Recipe to build your first beer.'}
          action={
            !search && !styleFilter && !isReadOnly
              ? <button onClick={openAddModal} className="bg-amber text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">Add Recipe</button>
              : null
          }
        />
      )}

      {/* Recipe grid */}
      {!loading && visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(r => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onEdit={() => navigate(`/recipes/${r.id}`)}
              onArchive={() => handleArchive(r)}
              onDuplicate={() => handleDuplicate(r)}
              onSaveNewVersion={() => openVersionModal(r)}
              onViewVersionHistory={() => navigate(`/recipes/${r.parent_recipe_id ?? r.id}?versions=1`)}
              onDelete={() => { setDeleteError(''); setDeleteTarget(r) }}
              isReadOnly={isReadOnly}
              ReadOnlyTooltip={ReadOnlyTooltip}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      <TierGate
        requiredTier="operations"
        featureKey="recipe_builder"
        featureName="Recipe Builder & Cost Calculator"
        featureDescription="Build and store recipes, calculate ingredient costs per batch, and see your cost per barrel and cost per pint in real time. Know exactly what each beer costs to make before you brew it."
      >
        {pageContent}
      </TierGate>

      {/* Save New Version Modal */}
      <ModalShell
        isOpen={!!versionModalRecipe}
        onClose={closeVersionModal}
        title={`Save New Version — ${versionModalRecipe?.name ?? ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveNewVersion} className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            The current recipe will be preserved as <strong>v{versionModalRecipe?.version ?? 1}</strong>. A new version
            will be created as <strong>v{(versionModalRecipe?.version ?? 1) + 1}</strong> with all the same
            ingredients and packaging splits. Make your edits after saving.
          </p>

          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">
              What changed in this version? <span className="text-danger">*</span>
            </label>
            <textarea
              rows={3}
              value={versionNotes}
              onChange={e => setVersionNotes(e.target.value)}
              placeholder="e.g. Increased dry hop addition, adjusted water chemistry..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
            />
          </div>

          {versionError && (
            <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{versionError}</div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={closeVersionModal} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={versionSaving}
              className="bg-amber hover:bg-amber-dark text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {versionSaving ? 'Saving...' : 'Save New Version →'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Add Recipe Modal */}
      <ModalShell
        isOpen={addOpen}
        onClose={closeAddModal}
        title="New Recipe"
        isDirty={isDirty}
        draftRestored={draft.draftRestored}
        onDismissDraft={draft.dismissDraftBanner}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveRecipe} className="space-y-4">

          {/* Name + Style */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">Beer Name <span className="text-danger">*</span></label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => updateForm('name', e.target.value)}
                placeholder="e.g. Hazy Summer IPA"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">BJCP Style</label>
              <select
                value={form.style}
                onChange={e => updateForm('style', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="">Select style...</option>
                {BJCP_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {form.style === 'Other / Custom' && (
                <input
                  type="text"
                  value={form.style_custom}
                  onChange={e => updateForm('style_custom', e.target.value)}
                  placeholder="Enter your custom style name..."
                  className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                />
              )}
            </div>
          </div>

          {/* Batch size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">Base Batch Size <span className="text-danger">*</span></label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.base_batch_size}
                onChange={e => updateForm('base_batch_size', e.target.value)}
                placeholder="e.g. 10"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">Unit</label>
              <select
                value={form.base_batch_size_unit}
                onChange={e => updateForm('base_batch_size_unit', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="barrels">Barrels</option>
                <option value="gallons">Gallons</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => updateForm('description', e.target.value)}
              placeholder="Brief notes about this beer..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
            />
          </div>

          {/* Targets */}
          <div>
            <p className="text-sm font-semibold text-navy mb-2">Targets <span className="text-gray-400 font-normal">(all optional)</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { key: 'target_og',  label: 'OG',  placeholder: '1.065' },
                { key: 'target_fg',  label: 'FG',  placeholder: '1.012' },
                { key: 'target_abv', label: 'ABV %', placeholder: '6.5' },
                { key: 'target_ibu', label: 'IBU', placeholder: '45' },
                { key: 'target_srm', label: 'SRM', placeholder: '8' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input
                    type="number"
                    step="any"
                    value={form[f.key]}
                    onChange={e => updateForm(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Cost settings */}
          <div>
            <p className="text-sm font-semibold text-navy mb-2">Cost Settings</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                { key: 'overhead_percentage',     label: 'Overhead %',      placeholder: '30' },
                { key: 'target_margin_percentage', label: 'Target Margin %', placeholder: '65' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form[f.key]}
                    onChange={e => updateForm(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                </div>
              ))}
            </div>

            {/* Sales Tax % */}
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Sales Tax %</label>
              <input
                type="number"
                step="any"
                min="0"
                value={form.tax_rate}
                onChange={e => updateForm('tax_rate', e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
              {brewery?.state && (() => {
                const code = STATE_ABBR[brewery.state]
                const rate = code !== undefined ? STATE_SALES_TAX[code] : undefined
                return rate !== undefined ? (
                  <p className="text-[10px] text-gray-400 leading-tight mt-1">
                    Pre-populated with {brewery.state} base sales tax rate ({rate}%). Adjust for your local rate.
                  </p>
                ) : null
              })()}
            </div>

            {/* Federal Excise Tax */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-navy">Federal Excise Tax</h4>
                <span className="text-xs text-gray-500">
                  {brewery?.annual_production_estimate
                    ? (brewery.annual_production_estimate <= 60000 ? 'Small Brewer Rate' : 'Standard Rate')
                    : 'Set production in TTB Tracker'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-xs text-gray-600">Rate ($/bbl)</label>
                  <input
                    type="number"
                    value={form.excise_tax_rate_per_bbl}
                    onChange={e => updateForm('excise_tax_rate_per_bbl', parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber mt-1"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Batch size</label>
                  <p className="text-sm font-medium text-navy mt-2">
                    {convertToBarrels(form.base_batch_size, form.base_batch_size_unit).toFixed(2)} bbl
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-amber-200 pt-2">
                <div>
                  <p className="text-xs text-gray-500">Batch total</p>
                  <p className="font-bold text-amber-700">
                    ${(convertToBarrels(form.base_batch_size, form.base_batch_size_unit) * (parseFloat(form.excise_tax_rate_per_bbl) || 3.50)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Per pint</p>
                  <p className="font-bold text-amber-700">
                    {(() => {
                      const bbl = convertToBarrels(form.base_batch_size, form.base_batch_size_unit)
                      return bbl > 0
                        ? `$${((bbl * (parseFloat(form.excise_tax_rate_per_bbl) || 3.50)) / (bbl * 124)).toFixed(4)}`
                        : '$0.0000'
                    })()}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Auto-calculated from batch size. Adjust rate manually if needed.
              </p>
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
              {saving ? 'Creating...' : 'Create Recipe & Add Ingredients →'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ── Delete confirmation modal ── */}
      <ModalShell
        isOpen={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); setDeleteError('') }}
        title="Delete Recipe"
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-red-50 border border-danger rounded-lg px-4 py-3">
              <span className="shrink-0 text-danger mt-0.5">⚠</span>
              <div className="min-w-0">
                <p className="font-semibold text-danger text-sm">This cannot be undone</p>
                <p className="text-sm text-gray-700 mt-1">
                  <strong>{deleteTarget.name}</strong> and all its ingredient lines will be permanently deleted.
                </p>
              </div>
            </div>

            {deleteTarget._brewDayCount > 0 && (
              <div className="bg-amber/10 border border-amber/30 rounded-lg px-4 py-3 text-sm text-gray-700">
                <p className="font-semibold text-amber mb-1">
                  {deleteTarget._brewDayCount} brew day log{deleteTarget._brewDayCount !== 1 ? 's' : ''} linked to this recipe
                </p>
                <p>
                  The brew day logs will <strong>not</strong> be deleted, but they will lose their recipe link and show the recipe name as a text reference only.
                </p>
              </div>
            )}

            {deleteError && (
              <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-3 py-2">{deleteError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 bg-danger hover:bg-red-700 text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError('') }}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </ModalShell>

    </>
  )
}

// ─── Recipe Card ──────────────────────────────────────────────────────────────

// Returns the count of key fields that are missing or zero on a recipe row.
// Checks: target OG, target FG, and base batch size.
function recipeIncompleteCount(recipe) {
  let count = 0
  if (!recipe.target_og)  count++
  if (!recipe.target_fg)  count++
  const batchSize = recipe.batch_size_value ?? recipe.batch_size ?? recipe.base_batch_size
  if (!batchSize || parseFloat(batchSize) <= 0) count++
  return count
}

function RecipeCard({ recipe, onEdit, onArchive, onDuplicate, onSaveNewVersion, onViewVersionHistory, onDelete, isReadOnly, ReadOnlyTooltip }) {
  const hasIngredients  = recipe._ingredientCount > 0
  const cpp             = recipe._costPerPint
  const incompleteCount = recipeIncompleteCount(recipe)
  const hasVersions     = (recipe._versionFamilySize ?? 1) > 1

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 ${recipe.is_archived ? 'opacity-60' : ''}`}>
      {/* Title + badges */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-navy text-base leading-tight">
            {recipe.name}
            {(recipe.version ?? 1) > 1 && (
              <span style={{ color: '#C8871A' }}> — v{recipe.version}</span>
            )}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {incompleteCount > 0 && (
              <span
                className="inline-flex items-center bg-amber/10 text-amber text-xs font-medium px-2 py-0.5 rounded-full"
                title={`${incompleteCount} incomplete item${incompleteCount !== 1 ? 's' : ''} — OG, FG, or batch size missing`}
              >
                ⚠ {incompleteCount}
              </span>
            )}
            {recipe.is_archived && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Archived</span>
            )}
          </div>
        </div>
        {(recipe.version ?? 1) > 1 && recipe.version_notes && (
          <p className="text-xs text-gray-500 italic mt-0.5">
            Changes: {recipe.version_notes.length > 80 ? recipe.version_notes.slice(0, 80) + '…' : recipe.version_notes}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {recipe.style && (
            <span className="text-xs bg-amber/10 text-amber font-semibold px-2 py-0.5 rounded-full">{recipe.style}</span>
          )}
          {recipe.bjcp_category && (
            <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full">{recipe.bjcp_category}</span>
          )}
          {/* Not current version warning */}
          {recipe.is_current_version === false && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">older version</span>
          )}
        </div>
        {/* Version history link — shown when a family has more than one member */}
        {hasVersions && (
          <button
            onClick={onViewVersionHistory}
            className="mt-1.5 text-xs text-amber hover:underline font-medium"
          >
            View version history →
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-gray-400 text-xs">Batch</span>
          <p className="font-semibold text-navy">{recipe.base_batch_size} {recipe.base_batch_size_unit}</p>
        </div>
        <div>
          <span className="text-gray-400 text-xs">Cost/pint</span>
          <p className="font-semibold text-navy">{hasIngredients ? formatDollars(cpp) : '—'}</p>
        </div>
        {recipe.target_abv && (
          <div>
            <span className="text-gray-400 text-xs">Target ABV</span>
            <p className="font-semibold text-navy">{recipe.target_abv}%</p>
          </div>
        )}
        <div>
          <span className="text-gray-400 text-xs">Ingredients</span>
          <p className="font-semibold text-navy">{recipe._ingredientCount}</p>
        </div>
      </div>

      {/* Updated date */}
      <p className="text-xs text-gray-400">
        Updated {new Date(recipe.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <button
          onClick={onEdit}
          className="flex-1 text-sm bg-navy text-white font-medium py-2 rounded-lg hover:bg-navy-light transition-colors"
        >
          Edit Recipe
        </button>
        {/* Save New Version — only shown for recipes that have been brewed at least once */}
        {recipe._hasBrewed && !recipe.is_archived && (
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={onSaveNewVersion}
              disabled={isReadOnly}
              title="Preserve this brewed version and create a new editable version"
              className="text-sm text-purple-700 border border-purple-200 hover:bg-purple-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 font-medium whitespace-nowrap"
            >
              + Version
            </button>
          </ReadOnlyTooltip>
        )}
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={onDuplicate}
            disabled={isReadOnly}
            title="Create a copy with the same ingredients — useful for different packaging splits or batch sizes"
            className="text-sm text-amber border border-amber/40 hover:bg-amber/5 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 font-medium"
          >
            Copy
          </button>
        </ReadOnlyTooltip>
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={onArchive}
            disabled={isReadOnly}
            className="text-sm text-gray-500 hover:text-navy border border-gray-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
            title={recipe.is_archived ? 'Unarchive' : 'Archive'}
          >
            {recipe.is_archived ? '📂' : '🗄️'}
          </button>
        </ReadOnlyTooltip>
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={onDelete}
            disabled={isReadOnly}
            className="text-sm text-danger/60 hover:text-danger border border-gray-200 hover:border-danger/40 px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
            title="Delete recipe permanently"
          >
            🗑
          </button>
        </ReadOnlyTooltip>
      </div>
    </div>
  )
}
