/**
 * IngredientLibraryModal — browse, add, edit, and manage suppliers for every
 * ingredient in the brewery's shared ingredient library.
 *
 * Layout: full-width modal with a two-panel design on desktop.
 *   Left panel  — ingredient list organized by category, with an Add Ingredient button.
 *   Right panel — detail view for the selected ingredient: details tab + suppliers tab.
 *
 * Props:
 *   isOpen  — boolean
 *   onClose — function
 */
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import ModalShell from '../../components/ModalShell'

const CATEGORIES = [
  'Malt/Grain','Hops','Yeast','Adjunct','Fruit',
  'Spice','Water Treatment','Packaging','Other',
]

const UNITS = ['lb','oz','g','kg','ml','L','packet','unit']

const EMPTY_ING = { name: '', category: 'Malt/Grain', unit: 'lb', notes: '' }

const EMPTY_SUPPLIER = {
  supplier_name: '', contact_name: '', contact_email: '', contact_phone: '',
  website_url: '', account_number: '',
  price_per_unit: '', shipping_cost_per_order: '',
  minimum_order_quantity: '', minimum_order_unit: '',
  lead_time_days: '', last_ordered_date: '', last_ordered_price: '',
  origin_source: '', quality_rating: '', is_preferred: false, notes: '', is_active: true,
}

// Renders 1-5 filled/empty star characters for a quality rating
function StarRating({ rating }) {
  if (!rating) return <span className="text-gray-300 text-sm">—</span>
  return (
    <span className="text-amber text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

export default function IngredientLibraryModal({ isOpen, onClose }) {
  const { brewery } = useAuth()

  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading]         = useState(false)
  const [selectedId, setSelectedId]   = useState(null)
  const [activeTab, setActiveTab]     = useState('details') // 'details' | 'suppliers'

  // Add ingredient inline form
  const [addingIng, setAddingIng]     = useState(false)
  const [ingForm, setIngForm]         = useState(EMPTY_ING)
  const [ingError, setIngError]       = useState('')
  const [ingLoading, setIngLoading]   = useState(false)

  // Editing ingredient name inline
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal]         = useState('')

  // Supplier form (add or edit)
  const [supplierFormOpen, setSupplierFormOpen] = useState(false)
  const [editingSupplier, setEditingSupplier]   = useState(null)  // null = add, else supplier row
  const [supForm, setSupForm]                   = useState(EMPTY_SUPPLIER)
  const [supError, setSupError]                 = useState('')
  const [supLoading, setSupLoading]             = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadIngredients = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('ingredients')
      .select('*, ingredient_suppliers(*)')
      .eq('brewery_id', brewery.id)
      .order('category')
      .order('name')
    setIngredients(data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => {
    if (isOpen) { loadIngredients(); setSelectedId(null); setAddingIng(false) }
  }, [isOpen, loadIngredients])

  // ── Derived values ────────────────────────────────────────────────────────────

  const selectedIngredient = ingredients.find(i => i.id === selectedId) ?? null
  const preferredSupplier  = selectedIngredient?.ingredient_suppliers?.find(s => s.is_preferred)

  // Group ingredients by category for display
  const byCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = ingredients.filter(i => i.category === cat)
    return acc
  }, {})

  // ── Ingredient CRUD ───────────────────────────────────────────────────────────

  async function handleAddIngredient(e) {
    e.preventDefault()
    if (!ingForm.name.trim()) { setIngError('Name is required.'); return }
    setIngLoading(true); setIngError('')

    const { data, error } = await supabase
      .from('ingredients')
      .insert({ brewery_id: brewery.id, name: ingForm.name.trim(),
                category: ingForm.category, unit: ingForm.unit,
                notes: ingForm.notes || null })
      .select()
      .single()

    setIngLoading(false)
    if (error) { setIngError(error.message); return }
    setIngredients(prev => [...prev, { ...data, ingredient_suppliers: [] }]
      .sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name)))
    setAddingIng(false)
    setIngForm(EMPTY_ING)
    setSelectedId(data.id)
    setActiveTab('details')
  }

  async function handleSaveName() {
    if (!nameVal.trim() || nameVal === selectedIngredient?.name) { setEditingName(false); return }
    const { error } = await supabase.from('ingredients')
      .update({ name: nameVal.trim() }).eq('id', selectedId)
    if (!error) {
      setIngredients(prev => prev.map(i => i.id === selectedId ? { ...i, name: nameVal.trim() } : i))
    }
    setEditingName(false)
  }

  async function handleDeleteIngredient() {
    if (!selectedIngredient) return
    if (!window.confirm(`Delete "${selectedIngredient.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('ingredients').delete().eq('id', selectedId)
    if (!error) {
      setIngredients(prev => prev.filter(i => i.id !== selectedId))
      setSelectedId(null)
    }
  }

  async function handleUpdateIngField(field, value) {
    await supabase.from('ingredients').update({ [field]: value }).eq('id', selectedId)
    setIngredients(prev => prev.map(i => i.id === selectedId ? { ...i, [field]: value } : i))
  }

  // ── Supplier CRUD ─────────────────────────────────────────────────────────────

  function openAddSupplier() {
    setEditingSupplier(null)
    setSupForm(EMPTY_SUPPLIER)
    setSupError('')
    setSupplierFormOpen(true)
  }

  function openEditSupplier(supplier) {
    setEditingSupplier(supplier)
    setSupForm({
      supplier_name: supplier.supplier_name ?? '',
      contact_name: supplier.contact_name ?? '',
      contact_email: supplier.contact_email ?? '',
      contact_phone: supplier.contact_phone ?? '',
      website_url: supplier.website_url ?? '',
      account_number: supplier.account_number ?? '',
      price_per_unit: supplier.price_per_unit ?? '',
      shipping_cost_per_order: supplier.shipping_cost_per_order ?? '',
      minimum_order_quantity: supplier.minimum_order_quantity ?? '',
      minimum_order_unit: supplier.minimum_order_unit ?? '',
      lead_time_days: supplier.lead_time_days ?? '',
      last_ordered_date: supplier.last_ordered_date ?? '',
      last_ordered_price: supplier.last_ordered_price ?? '',
      origin_source: supplier.origin_source ?? '',
      quality_rating: supplier.quality_rating ?? '',
      is_preferred: supplier.is_preferred ?? false,
      notes: supplier.notes ?? '',
      is_active: supplier.is_active ?? true,
    })
    setSupplierFormOpen(true)
  }

  async function handleSaveSupplier(e) {
    e.preventDefault()
    if (!supForm.supplier_name.trim()) { setSupError('Supplier name is required.'); return }
    if (!supForm.price_per_unit) { setSupError('Price per unit is required.'); return }
    setSupLoading(true); setSupError('')

    const payload = {
      ingredient_id: selectedId,
      brewery_id: brewery.id,
      supplier_name: supForm.supplier_name.trim(),
      contact_name: supForm.contact_name || null,
      contact_email: supForm.contact_email || null,
      contact_phone: supForm.contact_phone || null,
      website_url: supForm.website_url || null,
      account_number: supForm.account_number || null,
      price_per_unit: parseFloat(supForm.price_per_unit) || null,
      shipping_cost_per_order: supForm.shipping_cost_per_order ? parseFloat(supForm.shipping_cost_per_order) : null,
      minimum_order_quantity: supForm.minimum_order_quantity ? parseFloat(supForm.minimum_order_quantity) : null,
      minimum_order_unit: supForm.minimum_order_unit || null,
      lead_time_days: supForm.lead_time_days ? parseInt(supForm.lead_time_days) : null,
      last_ordered_date: supForm.last_ordered_date || null,
      last_ordered_price: supForm.last_ordered_price ? parseFloat(supForm.last_ordered_price) : null,
      origin_source: supForm.origin_source || null,
      quality_rating: supForm.quality_rating ? parseInt(supForm.quality_rating) : null,
      is_preferred: supForm.is_preferred,
      notes: supForm.notes || null,
      is_active: supForm.is_active,
    }

    let error
    if (editingSupplier) {
      // Update existing supplier
      ;({ error } = await supabase.from('ingredient_suppliers')
        .update(payload).eq('id', editingSupplier.id))
    } else {
      // Insert new supplier
      ;({ error } = await supabase.from('ingredient_suppliers').insert(payload))
    }

    setSupLoading(false)
    if (error) { setSupError(error.message); return }

    // If this supplier is being set as preferred, sync the ingredient's current_price_per_unit
    if (supForm.is_preferred && supForm.price_per_unit) {
      await supabase.from('ingredients')
        .update({ current_price_per_unit: parseFloat(supForm.price_per_unit) })
        .eq('id', selectedId)
    }

    setSupplierFormOpen(false)
    loadIngredients()  // Refresh so all supplier data is current
  }

  async function handleSetPreferred(supplier) {
    // Unset all preferred for this ingredient then set the selected one
    await supabase.from('ingredient_suppliers')
      .update({ is_preferred: false })
      .eq('ingredient_id', selectedId)
    await supabase.from('ingredient_suppliers')
      .update({ is_preferred: true })
      .eq('id', supplier.id)
    // Sync current_price_per_unit on the ingredient
    if (supplier.price_per_unit) {
      await supabase.from('ingredients')
        .update({ current_price_per_unit: supplier.price_per_unit })
        .eq('id', selectedId)
    }
    loadIngredients()
  }

  async function handleDeactivateSupplier(supplier) {
    await supabase.from('ingredient_suppliers')
      .update({ is_active: !supplier.is_active })
      .eq('id', supplier.id)
    loadIngredients()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!isOpen) return null

  const suppliers = selectedIngredient?.ingredient_suppliers ?? []
  const activeSuppliers   = suppliers.filter(s => s.is_active)
  const inactiveSuppliers = suppliers.filter(s => !s.is_active)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-navy">Ingredient Library</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">✕</button>
        </div>

        {/* Body — two columns on desktop, stacked on mobile */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* ── Left: ingredient list ── */}
          <div className="md:w-64 lg:w-72 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-100 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-gray-100 flex-shrink-0">
              <button
                onClick={() => { setAddingIng(true); setIngForm(EMPTY_ING); setIngError('') }}
                className="w-full bg-amber hover:bg-amber-dark text-white text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                + Add Ingredient
              </button>
            </div>

            {/* Add ingredient form */}
            {addingIng && (
              <form onSubmit={handleAddIngredient} className="p-4 border-b border-gray-100 space-y-2 bg-amber/5">
                <input
                  autoFocus
                  type="text"
                  placeholder="Ingredient name *"
                  value={ingForm.name}
                  onChange={e => setIngForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                />
                <select
                  value={ingForm.category}
                  onChange={e => setIngForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={ingForm.unit}
                  onChange={e => setIngForm(p => ({ ...p, unit: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {ingError && <p className="text-danger text-xs">{ingError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={ingLoading}
                    className="flex-1 bg-amber text-white text-sm font-semibold py-1.5 rounded-lg disabled:opacity-60">
                    {ingLoading ? 'Saving...' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setAddingIng(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Ingredient list */}
            {loading && <p className="p-4 text-sm text-gray-400">Loading...</p>}
            {!loading && ingredients.length === 0 && (
              <p className="p-4 text-sm text-gray-400">No ingredients yet. Add your first one above.</p>
            )}
            {!loading && CATEGORIES.map(cat => {
              const items = byCategory[cat] ?? []
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <p className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
                    {cat}
                  </p>
                  {items.map(ing => (
                    <button
                      key={ing.id}
                      onClick={() => { setSelectedId(ing.id); setActiveTab('details'); setEditingName(false) }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-gray-50 ${
                        selectedId === ing.id
                          ? 'bg-amber/10 text-amber font-semibold'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block truncate">{ing.name}</span>
                      <span className="text-xs text-gray-400">
                        {ing.ingredient_suppliers?.filter(s => s.is_preferred)[0]?.price_per_unit
                          ? `$${Number(ing.ingredient_suppliers.find(s => s.is_preferred).price_per_unit).toFixed(4)}/${ing.unit}`
                          : ing.unit}
                      </span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>

          {/* ── Right: ingredient detail ── */}
          <div className="flex-1 overflow-y-auto">
            {!selectedIngredient ? (
              <div className="flex items-center justify-center h-full p-8 text-center text-gray-400">
                <div>
                  <p className="text-3xl mb-3">👈</p>
                  <p className="text-sm">Select an ingredient to view or edit its details.</p>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-5">

                {/* Ingredient name — inline edit */}
                <div className="flex items-center gap-3">
                  {editingName ? (
                    <input
                      autoFocus
                      value={nameVal}
                      onChange={e => setNameVal(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                      className="text-xl font-bold text-navy border-b-2 border-amber focus:outline-none flex-1 bg-transparent"
                    />
                  ) : (
                    <h3
                      className="text-xl font-bold text-navy flex-1"
                      onDoubleClick={() => { setNameVal(selectedIngredient.name); setEditingName(true) }}
                    >
                      {selectedIngredient.name}
                    </h3>
                  )}
                  <button
                    onClick={() => { setNameVal(selectedIngredient.name); setEditingName(true) }}
                    className="text-gray-400 hover:text-amber text-sm"
                    title="Edit name"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={handleDeleteIngredient}
                    className="text-gray-400 hover:text-danger text-sm"
                    title="Delete ingredient"
                  >
                    🗑️
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 border-b border-gray-100">
                  {['details', 'suppliers'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-2 text-sm font-medium capitalize transition-colors border-b-2 ${
                        activeTab === tab
                          ? 'border-amber text-amber'
                          : 'border-transparent text-gray-500 hover:text-navy'
                      }`}
                    >
                      {tab} {tab === 'suppliers' && `(${activeSuppliers.length})`}
                    </button>
                  ))}
                </div>

                {/* Details tab */}
                {activeTab === 'details' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Category</label>
                        <select
                          value={selectedIngredient.category ?? ''}
                          onChange={e => handleUpdateIngField('category', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Unit</label>
                        <select
                          value={selectedIngredient.unit ?? ''}
                          onChange={e => handleUpdateIngField('unit', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
                        >
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Price/Unit</label>
                      <p className="text-navy font-semibold">
                        {selectedIngredient.current_price_per_unit
                          ? `$${Number(selectedIngredient.current_price_per_unit).toFixed(4)} / ${selectedIngredient.unit}`
                          : <span className="text-gray-400 font-normal">Set by preferred supplier</span>}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                      <textarea
                        rows={3}
                        value={selectedIngredient.notes ?? ''}
                        onChange={e => handleUpdateIngField('notes', e.target.value)}
                        placeholder="Internal notes about this ingredient..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Suppliers tab */}
                {activeTab === 'suppliers' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        {activeSuppliers.length === 0 ? 'No suppliers yet.' : `${activeSuppliers.length} active supplier${activeSuppliers.length !== 1 ? 's' : ''}`}
                      </p>
                      <button
                        onClick={openAddSupplier}
                        className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        + Add Supplier
                      </button>
                    </div>

                    {activeSuppliers.map(sup => (
                      <SupplierRow
                        key={sup.id}
                        supplier={sup}
                        unit={selectedIngredient.unit}
                        onEdit={() => openEditSupplier(sup)}
                        onSetPreferred={() => handleSetPreferred(sup)}
                        onDeactivate={() => handleDeactivateSupplier(sup)}
                      />
                    ))}

                    {inactiveSuppliers.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Inactive suppliers</p>
                        {inactiveSuppliers.map(sup => (
                          <SupplierRow
                            key={sup.id}
                            supplier={sup}
                            unit={selectedIngredient.unit}
                            onEdit={() => openEditSupplier(sup)}
                            onSetPreferred={() => handleSetPreferred(sup)}
                            onDeactivate={() => handleDeactivateSupplier(sup)}
                            inactive
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Supplier form modal — rendered inside the library modal */}
      <ModalShell
        isOpen={supplierFormOpen}
        onClose={() => setSupplierFormOpen(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-navy mb-1">Supplier Name <span className="text-danger">*</span></label>
              <input type="text" required value={supForm.supplier_name}
                onChange={e => setSupForm(p => ({ ...p, supplier_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Contact Name</label>
              <input type="text" value={supForm.contact_name}
                onChange={e => setSupForm(p => ({ ...p, contact_name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Contact Email</label>
              <input type="email" value={supForm.contact_email}
                onChange={e => setSupForm(p => ({ ...p, contact_email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Contact Phone</label>
              <input type="tel" value={supForm.contact_phone}
                onChange={e => setSupForm(p => ({ ...p, contact_phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Website URL</label>
              <input type="url" value={supForm.website_url}
                onChange={e => setSupForm(p => ({ ...p, website_url: e.target.value }))}
                placeholder="https://"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Account Number</label>
              <input type="text" value={supForm.account_number}
                onChange={e => setSupForm(p => ({ ...p, account_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Price per Unit <span className="text-danger">*</span></label>
              <input type="number" required step="any" min="0" value={supForm.price_per_unit}
                onChange={e => setSupForm(p => ({ ...p, price_per_unit: e.target.value }))}
                placeholder="0.0000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Shipping Cost/Order</label>
              <input type="number" step="any" min="0" value={supForm.shipping_cost_per_order}
                onChange={e => setSupForm(p => ({ ...p, shipping_cost_per_order: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Min. Order Qty</label>
              <input type="number" step="any" min="0" value={supForm.minimum_order_quantity}
                onChange={e => setSupForm(p => ({ ...p, minimum_order_quantity: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Min. Order Unit</label>
              <input type="text" value={supForm.minimum_order_unit}
                onChange={e => setSupForm(p => ({ ...p, minimum_order_unit: e.target.value }))}
                placeholder="e.g. sack, case"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Lead Time (days)</label>
              <input type="number" min="0" value={supForm.lead_time_days}
                onChange={e => setSupForm(p => ({ ...p, lead_time_days: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Last Ordered Date</label>
              <input type="date" value={supForm.last_ordered_date}
                onChange={e => setSupForm(p => ({ ...p, last_ordered_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Last Ordered Price</label>
              <input type="number" step="any" min="0" value={supForm.last_ordered_price}
                onChange={e => setSupForm(p => ({ ...p, last_ordered_price: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Origin / Source</label>
              <input type="text" value={supForm.origin_source}
                onChange={e => setSupForm(p => ({ ...p, origin_source: e.target.value }))}
                placeholder="Farm, region, maltster..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1">Quality Rating</label>
              <select value={supForm.quality_rating}
                onChange={e => setSupForm(p => ({ ...p, quality_rating: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="">No rating</option>
                {[1,2,3,4,5].map(n => (
                  <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5-n)} ({n}/5)</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-navy mb-1">Notes <span className="text-gray-400 font-normal">(max 500 characters)</span></label>
              <textarea rows={2} maxLength={500} value={supForm.notes}
                onChange={e => setSupForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
              />
            </div>
            <div className="sm:col-span-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={supForm.is_preferred}
                  onChange={e => setSupForm(p => ({ ...p, is_preferred: e.target.checked }))}
                  className="rounded border-gray-300 text-amber focus:ring-amber"
                />
                <span className="text-navy font-medium">Set as preferred supplier</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={supForm.is_active}
                  onChange={e => setSupForm(p => ({ ...p, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-amber focus:ring-amber"
                />
                <span className="text-navy font-medium">Active</span>
              </label>
            </div>
          </div>

          {supError && (
            <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{supError}</div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setSupplierFormOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
            <button type="submit" disabled={supLoading}
              className="bg-amber hover:bg-amber-dark text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
              {supLoading ? 'Saving...' : 'Save Supplier'}
            </button>
          </div>
        </form>
      </ModalShell>
    </div>
  )
}

// ── Supplier row card ─────────────────────────────────────────────────────────

function SupplierRow({ supplier, unit, onEdit, onSetPreferred, onDeactivate, inactive }) {
  return (
    <div className={`border rounded-xl p-4 space-y-2 ${
      supplier.is_preferred ? 'border-amber bg-amber/5' : 'border-gray-200'
    } ${inactive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-navy text-sm">{supplier.supplier_name}</p>
            {supplier.is_preferred && (
              <span className="text-xs bg-amber text-white font-bold px-1.5 py-0.5 rounded">Preferred</span>
            )}
          </div>
          {supplier.quality_rating && <StarRating rating={supplier.quality_rating} />}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-navy">
            {supplier.price_per_unit ? `$${Number(supplier.price_per_unit).toFixed(4)}` : '—'}
          </p>
          <p className="text-xs text-gray-400">per {unit}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-500">
        {supplier.shipping_cost_per_order && (
          <p>Shipping: ${Number(supplier.shipping_cost_per_order).toFixed(2)}/order</p>
        )}
        {supplier.lead_time_days && <p>Lead time: {supplier.lead_time_days}d</p>}
        {supplier.last_ordered_date && (
          <p>Last ordered: {new Date(supplier.last_ordered_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        )}
        {supplier.origin_source && <p>Source: {supplier.origin_source}</p>}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onEdit}
          className="text-xs text-navy border border-navy px-3 py-1 rounded-lg hover:bg-navy/5 transition-colors">
          Edit
        </button>
        {!supplier.is_preferred && !inactive && (
          <button onClick={onSetPreferred}
            className="text-xs text-amber border border-amber px-3 py-1 rounded-lg hover:bg-amber/5 transition-colors">
            Set as Preferred
          </button>
        )}
        <button onClick={onDeactivate}
          className="text-xs text-gray-500 border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-50 transition-colors">
          {inactive ? 'Reactivate' : 'Deactivate'}
        </button>
      </div>
    </div>
  )
}
