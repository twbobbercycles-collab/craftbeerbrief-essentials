/**
 * RecipesPage — Recipe Builder & Cost Calculator list view.
 * Wrapped in TierGate so Essentials users see a locked frosted-glass preview.
 * Operations and Full Suite users get full access.
 */
import { useEffect, useState, useCallback } from 'react'
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

const STYLE_SUGGESTIONS = [
  // American Ales
  'American Light Lager','American Lager','Cream Ale','American Wheat Beer','Blonde Ale',
  'American Pale Ale','American Amber Ale','California Common','American Brown Ale',
  'American Porter','American Stout','Imperial Stout','American Strong Ale',
  'American Barleywine','Wheatwine',
  // IPAs
  'Session IPA','American IPA','Hazy IPA','New England IPA','West Coast IPA',
  'Double IPA','Triple IPA','Brut IPA','Black IPA','Red IPA','Brown IPA','Rye IPA',
  'White IPA','Belgian IPA','Milkshake IPA',
  // British and Irish Ales
  'Ordinary Bitter','Best Bitter','Strong Bitter','British Golden Ale','English IPA',
  'Dark Mild','British Brown Ale','English Porter','Scottish Light','Scottish Heavy',
  'Scottish Export','Wee Heavy','Irish Red Ale','Irish Stout','Irish Extra Stout',
  'Sweet Stout','Oatmeal Stout','Tropical Stout','Foreign Extra Stout',
  'British Strong Ale','Old Ale','English Barleywine','Australian Sparkling Ale',
  // German and Czech Lagers
  'International Pale Lager','International Amber Lager','International Dark Lager',
  'Czech Pale Lager','Czech Premium Pale Lager','Czech Amber Lager','Czech Dark Lager',
  'Munich Helles','Festbier','Helles Bock','German Leichtbier','Kolsch',
  'German Exportbier','German Pils','Marzen','Rauchbier','Dunkles Bock','Vienna Lager',
  'Altbier','Munich Dunkel','Schwarzbier','Doppelbock','Eisbock','Baltic Porter',
  // German Wheat Beers
  'Weissbier','Hefeweizen','Dunkles Weissbier','Weizenbock','Roggenbier',
  'Kellerweis','Dunkelweizen',
  // Belgian and French Ales
  'Witbier','Belgian Pale Ale','Biere de Garde','Belgian Blond Ale','Saison',
  'Belgian Golden Strong Ale','Trappist Single','Belgian Dubbel','Belgian Tripel',
  'Belgian Dark Strong Ale',
  // Sour and Wild Ales
  'Berliner Weisse','Flanders Red Ale','Oud Bruin','Lambic','Gueuze','Fruit Lambic',
  'Gose','Brett Beer','Mixed-Fermentation Sour Beer','Wild Specialty Beer',
  'Smoothie Sour','Pastry Sour','Kettle Sour',
  // Fruit and Specialty
  'Fruit Beer','Fruit and Spice Beer','Specialty Fruit Beer',
  'Spice Herb or Vegetable Beer','Autumn Seasonal Beer','Winter Seasonal Beer',
  'Holiday Ale','Specialty Spice Beer',
  // Alternative and Experimental
  'Alternative Grain Beer','Alternative Sugar Beer','Classic Style Smoked Beer',
  'Specialty Smoked Beer','Wood-Aged Beer','Barrel-Aged Beer',
  'Specialty Wood-Aged Beer','Gluten-Free Beer','Non-Alcoholic Beer','Hard Seltzer',
  'Session Beer','Nitro Beer','Pastry Stout','Milkshake Stout','Dessert Beer',
  'Craft Lager','Experimental Beer',
  // Historical Styles
  'Gruit','Kellerbier','Kentucky Common','Lichtenhainer','London Brown Ale',
  'Piwo Grodziskie','Pre-Prohibition Lager','Pre-Prohibition Porter','Sahti',
  // Other
  'Mixed-Style Beer','Commercial Specialty Beer','Other',
]

// Grouped BJCP categories for the <select> element
const BJCP_GROUPS = [
  { label: 'Category 1 Standard American Beer', options: ['1A American Light Lager','1B American Lager','1C Cream Ale','1D American Wheat Beer'] },
  { label: 'Category 2 International Lager', options: ['2A International Pale Lager','2B International Amber Lager','2C International Dark Lager'] },
  { label: 'Category 3 Czech Lager', options: ['3A Czech Pale Lager','3B Czech Premium Pale Lager','3C Czech Amber Lager','3D Czech Dark Lager'] },
  { label: 'Category 4 Pale Malty European Lager', options: ['4A Munich Helles','4B Festbier','4C Helles Bock'] },
  { label: 'Category 5 Pale Bitter European Beer', options: ['5A German Leichtbier','5B Kolsch','5C German Exportbier','5D German Pils'] },
  { label: 'Category 6 Amber Malty European Lager', options: ['6A Marzen','6B Rauchbier','6C Dunkles Bock'] },
  { label: 'Category 7 Amber Bitter European Beer', options: ['7A Vienna Lager','7B Altbier','7C Kellerbier'] },
  { label: 'Category 8 Dark European Lager', options: ['8A Munich Dunkel','8B Schwarzbier'] },
  { label: 'Category 9 Strong European Beer', options: ['9A Doppelbock','9B Eisbock','9C Baltic Porter'] },
  { label: 'Category 10 German Wheat Beer', options: ['10A Weissbier','10B Dunkles Weissbier','10C Weizenbock','10D Roggenbier','10E Kellerweis'] },
  { label: 'Category 11 British Bitter', options: ['11A Ordinary Bitter','11B Best Bitter','11C Strong Bitter'] },
  { label: 'Category 12 Pale Commonwealth Beer', options: ['12A British Golden Ale','12B Australian Sparkling Ale','12C English IPA'] },
  { label: 'Category 13 Brown British Beer', options: ['13A Dark Mild','13B British Brown Ale','13C English Porter'] },
  { label: 'Category 14 Scottish Ale', options: ['14A Scottish Light','14B Scottish Heavy','14C Scottish Export'] },
  { label: 'Category 15 Irish Beer', options: ['15A Irish Red Ale','15B Irish Stout','15C Irish Extra Stout'] },
  { label: 'Category 16 Dark British Beer', options: ['16A Sweet Stout','16B Oatmeal Stout','16C Tropical Stout','16D Foreign Extra Stout'] },
  { label: 'Category 17 Strong British Ale', options: ['17A British Strong Ale','17B Old Ale','17C Wee Heavy','17D English Barleywine'] },
  { label: 'Category 18 Pale American Ale', options: ['18A Blonde Ale','18B American Pale Ale'] },
  { label: 'Category 19 Amber and Brown American Beer', options: ['19A American Amber Ale','19B California Common','19C American Brown Ale'] },
  { label: 'Category 20 American Porter and Stout', options: ['20A American Porter','20B American Stout','20C Imperial Stout'] },
  { label: 'Category 21 IPA', options: ['21A American IPA','21B Specialty IPA','21C Hazy IPA'] },
  { label: 'Category 22 Strong American Ale', options: ['22A Double IPA','22B American Strong Ale','22C American Barleywine','22D Wheatwine'] },
  { label: 'Category 23 European Sour Ale', options: ['23A Berliner Weisse','23B Flanders Red Ale','23C Oud Bruin','23D Lambic','23E Gueuze','23F Fruit Lambic','23G Gose'] },
  { label: 'Category 24 Belgian Ale', options: ['24A Witbier','24B Belgian Pale Ale','24C Biere de Garde'] },
  { label: 'Category 25 Strong Belgian Ale', options: ['25A Belgian Blond Ale','25B Saison','25C Belgian Golden Strong Ale'] },
  { label: 'Category 26 Trappist Ale', options: ['26A Trappist Single','26B Belgian Dubbel','26C Belgian Tripel','26D Belgian Dark Strong Ale'] },
  { label: 'Category 27 Historical Beer', options: ['27A Historical Beer'] },
  { label: 'Category 28 American Wild Ale', options: ['28A Brett Beer','28B Mixed-Fermentation Sour Beer','28C Wild Specialty Beer'] },
  { label: 'Category 29 Fruit Beer', options: ['29A Fruit Beer','29B Fruit and Spice Beer','29C Specialty Fruit Beer'] },
  { label: 'Category 30 Spiced Beer', options: ['30A Spice Herb or Vegetable Beer','30B Autumn Seasonal Beer','30C Winter Seasonal Beer','30D Specialty Spice Beer'] },
  { label: 'Category 31 Alternative Fermentables Beer', options: ['31A Alternative Grain Beer','31B Alternative Sugar Beer'] },
  { label: 'Category 32 Smoked Beer', options: ['32A Classic Style Smoked Beer','32B Specialty Smoked Beer'] },
  { label: 'Category 33 Wood-Aged Beer', options: ['33A Wood-Aged Beer','33B Specialty Wood-Aged Beer'] },
  { label: 'Category 34 Specialty Beer', options: ['34A Commercial Specialty Beer','34B Mixed-Style Beer','34C Experimental Beer'] },
]

const EMPTY_FORM = {
  name: '', style: '', bjcp_category: '',
  base_batch_size: '', base_batch_size_unit: 'barrels',
  description: '',
  target_og: '', target_fg: '', target_abv: '', target_ibu: '', target_srm: '',
  overhead_percentage: '30', target_margin_percentage: '65', tax_rate: '0',
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
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const draft = useModalDraft('modal_draft_recipe')

  // ── Load recipes ────────────────────────────────────────────────────────────

  const loadRecipes = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)

    // Fetch all recipes for this brewery
    const { data: recipeRows, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('brewery_id', brewery.id)
      .order('updated_at', { ascending: false })

    if (error || !recipeRows) { setLoading(false); return }

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
      // Map lines to the shape calculateTotalIngredientCost expects
      const mapped = lines.map(l => ({
        amount: parseFloat(l.amount) || 0,
        scale_with_batch: l.scale_with_batch,
        price_per_unit: parseFloat(l.supplier?.price_per_unit ?? l.ingredient?.current_price_per_unit ?? 0),
      }))
      const barrels   = convertToBarrels(r.base_batch_size, r.base_batch_size_unit)
      const totalIng  = calculateTotalIngredientCost(mapped, r.base_batch_size, r.base_batch_size)
      const breakdown = calculateTotalProductionCost(totalIng, 0, 0, 0, r.fixed_overhead_percentage ?? 15)
      const cpp       = calculateCostPerPint(calculateCostPerBarrel(breakdown.totalCost, barrels))
      return { ...r, _ingredientCount: lines.length, _costPerPint: cpp }
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
    setForm(saved ?? EMPTY_FORM)
    setSaveError('')
    setAddOpen(true)
  }

  function closeAddModal() {
    draft.clearDraft()
    setForm(EMPTY_FORM)
    setAddOpen(false)
  }

  function updateForm(field, value) {
    const next = { ...form, [field]: value }
    setForm(next)
    draft.saveDraft(next)
  }

  const isDirty = Object.keys(form).some(k => form[k] !== EMPTY_FORM[k])

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
        style: form.style || null,
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
              <label className="block text-sm font-semibold text-navy mb-1.5">Style</label>
              <input
                type="text"
                list="recipe-styles"
                value={form.style}
                onChange={e => updateForm('style', e.target.value)}
                placeholder="e.g. Hazy IPA"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
              <datalist id="recipe-styles">
                {STYLE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>

          {/* BJCP Category */}
          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">BJCP Category <span className="text-gray-400 font-normal">(optional)</span></label>
            <select
              value={form.bjcp_category}
              onChange={e => updateForm('bjcp_category', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
            >
              <option value="">Select BJCP category...</option>
              {BJCP_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(o => <option key={o} value={o}>{o}</option>)}
                </optgroup>
              ))}
            </select>
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
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'overhead_percentage',      label: 'Overhead %',   placeholder: '30' },
                { key: 'target_margin_percentage',  label: 'Target Margin %', placeholder: '65' },
                { key: 'tax_rate',                 label: 'Tax Rate %',   placeholder: '0' },
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

function RecipeCard({ recipe, onEdit, onArchive, onDuplicate, isReadOnly, ReadOnlyTooltip }) {
  const hasIngredients = recipe._ingredientCount > 0
  const cpp = recipe._costPerPint
  const incompleteCount = recipeIncompleteCount(recipe)

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 ${recipe.is_archived ? 'opacity-60' : ''}`}>
      {/* Title + badges */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-navy text-base leading-tight">{recipe.name}</h3>
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
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {recipe.style && (
            <span className="text-xs bg-amber/10 text-amber font-semibold px-2 py-0.5 rounded-full">{recipe.style}</span>
          )}
          {recipe.bjcp_category && (
            <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full">{recipe.bjcp_category}</span>
          )}
          {recipe.version > 1 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">v{recipe.version}</span>
          )}
        </div>
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
      </div>
    </div>
  )
}
