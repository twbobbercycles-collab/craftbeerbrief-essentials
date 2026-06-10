/**
 * InventoryPage — Ingredient Inventory module for the Operations tier.
 * Single source of truth for all ingredients: stock levels, costs, suppliers,
 * purchase orders, and every stock movement.
 *
 * Four tabs:
 *   1. Inventory     — stock list with alerts, add/edit/adjust actions
 *   2. Receive Stock — log incoming deliveries
 *   3. Purchase Orders — create and track supplier orders
 *   4. Transaction History — full audit log of every stock change
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import LoadingSpinner from '../../components/LoadingSpinner'
import WorkflowWarningBanner from '../../components/WorkflowWarningBanner'
import { useModalDraft } from '../../hooks/useModalDraft'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Malt/Grain','Hops','Yeast','Adjunct','Fruit',
  'Spice','Water Treatment','Packaging',
  'Parts & Consumables','Lab & QC Supplies','Safety Supplies','Other',
]

const STOCK_UNITS = [
  'lb','oz','g','kg','L','ml','fl oz','Gallon','Barrel','packet','unit','each',
]

const TX_TYPES = [
  { value: 'received',     label: 'Received',        color: 'text-success' },
  { value: 'used_in_brew', label: 'Used in Brew',    color: 'text-navy' },
  { value: 'adjustment',   label: 'Adjustment',      color: 'text-amber' },
  { value: 'waste',        label: 'Waste',           color: 'text-danger' },
  { value: 'returned',     label: 'Returned',        color: 'text-blue-500' },
  { value: 'transferred',  label: 'Transferred',     color: 'text-gray-500' },
]

const PO_STATUSES = [
  { value: 'draft',              label: 'Draft',              bg: 'bg-gray-100',   text: 'text-gray-600' },
  { value: 'submitted',          label: 'Submitted',          bg: 'bg-blue-100',   text: 'text-blue-700' },
  { value: 'confirmed',          label: 'Confirmed',          bg: 'bg-teal-100',   text: 'text-teal-700' },
  { value: 'partially_received', label: 'Partially Received', bg: 'bg-amber/20',   text: 'text-amber-dark' },
  { value: 'received',           label: 'Received',           bg: 'bg-green-100',  text: 'text-success' },
  { value: 'cancelled',          label: 'Cancelled',          bg: 'bg-red-100',    text: 'text-danger' },
]

const TABS = ['Inventory', 'Packaging Materials', 'Receive Stock', 'Purchase Orders', 'Transaction History', 'Supplier Intelligence']

// Grouped packaging material types — keys become category labels, values are type options
const PACKAGING_MATERIAL_TYPES = {
  'Cans': [
    '12oz Can (blank)', '16oz Can / Tallboy (blank)', '19.2oz Stovepipe Can (blank)',
    '32oz Crowler Can (blank)', 'Can Lid',
  ],
  'Bottles': [
    '12oz Bottle (blank)', '22oz Bomber Bottle (blank)', '750ml Bottle (blank)',
    'Bottle Cap', 'Cork & Cage',
  ],
  'Labels': [
    '12oz Can Label', '16oz Can Label', '19.2oz Can Label', '32oz Crowler Label',
    '12oz Bottle Label — Front', '12oz Bottle Label — Back',
    '22oz Bottle Label — Front', '22oz Bottle Label — Back',
    '750ml Bottle Label — Front', '750ml Bottle Label — Back',
    'Neck Label', 'Keg Collar',
  ],
  'Carriers & Boxes': [
    '4-Pack Carrier (16oz cans)', '6-Pack Carrier (12oz cans)',
    '12-Pack Box', '24-Pack Case Box', 'Shipper Box',
  ],
  'Kegs': [
    'Half Barrel Keg (15.5 gal)', 'Quarter Barrel Keg (7.75 gal)',
    'Sixth Barrel Keg (5.16 gal)', 'Slim Quarter Keg (7.75 gal)', '50L European Keg',
  ],
  'Cleaning & Sanitation': [
    'Caustic Cleaner (PBW/NaOH)', 'Acid Cleaner (Star San/Acid)',
    'CIP Chemical', 'Keg Wash Chemical', 'Sanitizer (general)',
    'CO2 Gas Cylinder', 'Nitrogen Gas Cylinder', 'Mixed Gas Cylinder (CO2/N2)',
  ],
  'Other Packaging Supplies': [
    'Oxygen Barrier Caps', 'Shrink Sleeve', 'Tamper Evident Seal',
    'Wax Dip', 'Printed Carton', 'Other',
  ],
}

// Sub-type options for the three new ingredient categories
const PARTS_TYPES = [
  'Tri-Clamp Gasket', 'O-Ring', 'Pump Seal', 'Valve Seat/Diaphragm',
  'Silicone Tubing', 'Vinyl Tubing', 'Reinforced Hose', 'Gas Line Tubing',
  'Tri-Clamp Fitting', 'Hose Clamp', 'Quick Disconnect Fitting', 'Barbed Fitting',
  'Filter Cartridge', 'Filter Sheet', 'Spray Ball (CIP)',
  'Thermometer Probe/Sensor', 'Sight Glass Tube', 'Sample Cock/Petcock',
  'CO2/Gas Line Component', 'Pump Impeller', 'Other Part/Consumable',
]

const LAB_TYPES = [
  'pH Probe/Electrode', 'Hydrometer', 'Refractometer',
  'Dissolved Oxygen Test Kit', 'Turbidity Test Kit', 'Culture Media',
  'Petri Dish/Swab Kit', 'Yeast Counting Equipment', 'Other Lab Supply',
]

const SAFETY_TYPES = [
  'Nitrile Gloves', 'Safety Goggles', 'Rubber Boots/Footwear',
  'Chemical Resistant Apron', 'CO2 Monitor/Sensor', 'First Aid Kit Restock',
  'Fire Extinguisher Service', 'Eye Wash Solution', 'Other Safety Supply',
]

// Map category name → its sub-type list (null means no sub-type dropdown)
const CATEGORY_SUBTYPES = {
  'Parts & Consumables': PARTS_TYPES,
  'Lab & QC Supplies':   LAB_TYPES,
  'Safety Supplies':     SAFETY_TYPES,
}

// Days from today at which stock expiry becomes a warning vs. danger
const EXPIRY_WARN_DAYS  = 90
const EXPIRY_ALERT_DAYS = 30

// ── Page root ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="ingredient_inventory"
      featureName="Ingredient Inventory"
      featureDescription="Track stock levels, costs, supplier orders, and every ingredient movement. The Recipe Builder and Brew Day Scheduler pull costs directly from your inventory — one place to update a price and every recipe reflects it instantly."
    >
      <InventoryPageInner />
    </TierGate>
  )
}

// ── Inner page (only rendered when tier check passes) ─────────────────────────

function InventoryPageInner() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  const [activeTab,    setActiveTab]    = usePersistedTab('inventory_active_tab', 'Inventory')
  const [ingredients,  setIngredients]  = useState([])
  const [transactions, setTransactions] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal open states
  const [addIngOpen,    setAddIngOpen]    = useState(false)
  const [editIngTarget, setEditIngTarget] = useState(null)   // ingredient row or null
  const [adjustTarget,  setAdjustTarget]  = useState(null)   // ingredient row or null
  const [receiveOpen,   setReceiveOpen]   = useState(false)
  const [receivePO,     setReceivePO]     = useState(null)   // PO row to pre-populate, or null
  const [poOpen,        setPoOpen]        = useState(false)
  const [poTarget,      setPoTarget]      = useState(null)   // PO row for detail view
  const [historyIngId,  setHistoryIngId]  = useState(null)   // filter Transaction History by ingredient
  const [draftRefreshKey, setDraftRefreshKey] = useState(0)
  const [receiveSuccessMsg, setReceiveSuccessMsg] = useState(null)

  // Packaging Materials tab state
  const [packagingMaterials,  setPackagingMaterials]  = useState([])
  const [pkgMatsLoading,      setPkgMatsLoading]      = useState(false)
  const [addPkgMatOpen,       setAddPkgMatOpen]       = useState(false)
  const [adjustPkgMatTarget,  setAdjustPkgMatTarget]  = useState(null)

  // ── Load all data ────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)

    const [ingResult, txResult, poResult] = await Promise.all([
      supabase
        .from('ingredients')
        .select('*, ingredient_suppliers(*)')
        .eq('brewery_id', brewery.id)
        .order('category').order('name'),
      supabase
        .from('inventory_transactions')
        .select('*, ingredient:ingredients(name,unit)')
        .eq('brewery_id', brewery.id)
        .order('transaction_date', { ascending: false })
        .order('created_at',       { ascending: false })
        .limit(200),
      supabase
        .from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .eq('brewery_id', brewery.id)
        .order('order_date', { ascending: false }),
    ])

    setIngredients(ingResult.data ?? [])
    setTransactions(txResult.data ?? [])
    setPurchaseOrders(poResult.data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  const loadPackagingMaterials = useCallback(async () => {
    if (!brewery?.id) return
    setPkgMatsLoading(true)
    const { data } = await supabase
      .from('packaging_materials')
      .select('*')
      .eq('brewery_id', brewery.id)
      .eq('is_active', true)
      .order('category').order('name')
    setPackagingMaterials(data ?? [])
    setPkgMatsLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadPackagingMaterials() }, [loadPackagingMaterials])

  // ── PO lifecycle handlers ────────────────────────────────────────────────────

  async function handleDeletePO(po) {
    if (!window.confirm('Delete this draft purchase order? This cannot be undone.')) return
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', po.id)
    await supabase.from('purchase_orders').delete().eq('id', po.id)
    setPurchaseOrders(prev => prev.filter(p => p.id !== po.id))
  }

  async function handleCancelPO(po) {
    const note = window.prompt('Cancellation reason (optional):')
    if (note === null) return
    const updatedNotes = [po.notes, note ? `Cancelled: ${note}` : null].filter(Boolean).join('\n')
    await supabase.from('purchase_orders')
      .update({ status: 'cancelled', notes: updatedNotes || null })
      .eq('id', po.id)
    setPurchaseOrders(prev => prev.map(p =>
      p.id === po.id ? { ...p, status: 'cancelled', notes: updatedNotes || p.notes } : p
    ))
  }

  // ── Ingredient lifecycle handlers ────────────────────────────────────────────

  async function handleDeactivateIng(ing) {
    if (!window.confirm(`Deactivate "${ing.name}"? It will be hidden from inventory but its history is preserved.`)) return
    await supabase.from('ingredients').update({ is_active: false }).eq('id', ing.id)
    setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, is_active: false } : i))
  }

  async function handleReactivateIng(ing) {
    await supabase.from('ingredients').update({ is_active: true }).eq('id', ing.id)
    setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, is_active: true } : i))
  }

  // ── Draft discard ─────────────────────────────────────────────────────────────

  function discardDraft(key) {
    if (!window.confirm('Discard your unsaved draft? This cannot be recovered.')) return
    try { sessionStorage.removeItem(key) } catch {}
    setDraftRefreshKey(k => k + 1)
  }

  // ── Computed alert counts (used in Dashboard banner and page header) ──────────

  const today     = new Date()
  const todayStr  = today.toISOString().split('T')[0]

  const lowStockIngredients = ingredients.filter(i =>
    i.is_active && i.reorder_threshold != null &&
    (parseFloat(i.current_stock_quantity) || 0) <= parseFloat(i.reorder_threshold)
  )

  const outOfStockIngredients = ingredients.filter(i =>
    i.is_active && (parseFloat(i.current_stock_quantity) || 0) === 0
  )

  const expiringIngredients = ingredients.filter(i => {
    if (!i.expiration_date) return false
    const daysLeft = Math.ceil((new Date(i.expiration_date) - today) / 86400000)
    return daysLeft <= EXPIRY_ALERT_DAYS
  })

  if (loading) return <LoadingSpinner message="Loading inventory..." />

  // Read draft existence directly from sessionStorage — re-checked on every render.
  // When a modal clears its draft and closes, the state change triggers a re-render here
  // so the notice bar disappears automatically.
  function hasDraftFor(key) {
    try { return !!sessionStorage.getItem(key) } catch { return false }
  }
  const hasAddIngDraft  = hasDraftFor('modal_draft_inventory_add_ingredient')
  const hasAdjustDraft  = hasDraftFor('modal_draft_inventory_adjust_stock')
  const hasReceiveDraft = hasDraftFor('modal_draft_inventory_receive_stock')
  const hasPODraft      = hasDraftFor('modal_draft_inventory_create_po')

  return (
    <div className="space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">Ingredient Inventory</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {ingredients.filter(i => i.is_active).length} active ingredients ·{' '}
            {lowStockIngredients.length > 0 && (
              <span className="text-amber font-medium">{lowStockIngredients.length} low stock · </span>
            )}
            {outOfStockIngredients.length > 0 && (
              <span className="text-danger font-medium">{outOfStockIngredients.length} out of stock</span>
            )}
          </p>
        </div>
        {activeTab === 'Inventory' && (
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={() => { setEditIngTarget(null); setAddIngOpen(true) }}
              disabled={isReadOnly}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              + Add to Inventory
            </button>
          </ReadOnlyTooltip>
        )}
        {activeTab === 'Packaging Materials' && (
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={() => setAddPkgMatOpen(true)}
              disabled={isReadOnly}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              + Add Material
            </button>
          </ReadOnlyTooltip>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-amber text-amber'
                  : 'border-transparent text-gray-500 hover:text-navy',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Draft notice bars — shown when a saved draft exists for any modal ── */}
      {hasAddIngDraft && (
        <div className="bg-amber/10 border border-amber rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <span className="text-amber-dark">📝 You have an unsaved Add to Inventory draft.</span>
          <div className="flex gap-3 shrink-0 items-center">
            <button onClick={() => discardDraft('modal_draft_inventory_add_ingredient')}
              className="text-xs font-medium text-gray-500 hover:text-danger underline">Discard</button>
            <button onClick={() => { setEditIngTarget(null); setAddIngOpen(true) }}
              className="text-xs font-semibold text-amber underline">Continue Draft</button>
          </div>
        </div>
      )}
      {hasAdjustDraft && (
        <div className="bg-amber/10 border border-amber rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <span className="text-amber-dark">📝 You have an unsaved stock adjustment draft.</span>
          <div className="flex gap-3 shrink-0 items-center">
            <button onClick={() => discardDraft('modal_draft_inventory_adjust_stock')}
              className="text-xs font-medium text-gray-500 hover:text-danger underline">Discard</button>
            <span className="text-xs text-amber-dark/70">Open any ingredient and click Adjust to continue.</span>
          </div>
        </div>
      )}
      {hasReceiveDraft && (
        <div className="bg-amber/10 border border-amber rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <span className="text-amber-dark">📝 You have an unsaved Receive Stock draft.</span>
          <div className="flex gap-3 shrink-0 items-center">
            <button onClick={() => discardDraft('modal_draft_inventory_receive_stock')}
              className="text-xs font-medium text-gray-500 hover:text-danger underline">Discard</button>
            <button onClick={() => { setReceivePO(null); setReceiveOpen(true) }}
              className="text-xs font-semibold text-amber underline">Continue Draft</button>
          </div>
        </div>
      )}
      {hasPODraft && (
        <div className="bg-amber/10 border border-amber rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <span className="text-amber-dark">📝 You have an unsaved Purchase Order draft.</span>
          <div className="flex gap-3 shrink-0 items-center">
            <button onClick={() => discardDraft('modal_draft_inventory_create_po')}
              className="text-xs font-medium text-gray-500 hover:text-danger underline">Discard</button>
            <button onClick={() => { setPoTarget(null); setPoOpen(true) }}
              className="text-xs font-semibold text-amber underline">Continue Draft</button>
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      {activeTab === 'Inventory' && (
        <InventoryTab
          ingredients={ingredients}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          lowStock={lowStockIngredients}
          outOfStock={outOfStockIngredients}
          expiring={expiringIngredients}
          today={today}
          onAdd={() => { setEditIngTarget(null); setAddIngOpen(true) }}
          onEdit={ing => { setEditIngTarget(ing); setAddIngOpen(true) }}
          onAdjust={ing => setAdjustTarget(ing)}
          onViewHistory={ing => { setHistoryIngId(ing.id); setActiveTab('Transaction History') }}
          onCreatePO={() => setPoOpen(true)}
          onDeactivate={handleDeactivateIng}
          onReactivate={handleReactivateIng}
        />
      )}

      {activeTab === 'Packaging Materials' && (
        <PackagingMaterialsTab
          materials={packagingMaterials}
          loading={pkgMatsLoading}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          onAdd={() => setAddPkgMatOpen(true)}
          onAdjust={mat => setAdjustPkgMatTarget(mat)}
          onDeactivate={async mat => {
            if (!window.confirm(`Deactivate "${mat.name}"? It will be hidden but its history is preserved.`)) return
            await supabase.from('packaging_materials').update({ is_active: false }).eq('id', mat.id)
            setPackagingMaterials(prev => prev.filter(m => m.id !== mat.id))
          }}
        />
      )}

      {activeTab === 'Receive Stock' && (
        <ReceiveStockTab
          ingredients={ingredients}
          transactions={transactions.filter(t => t.transaction_type === 'received').slice(0, 20)}
          purchaseOrders={purchaseOrders.filter(p => ['submitted','confirmed','partially_received'].includes(p.status))}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          successMsg={receiveSuccessMsg}
          onClearSuccess={() => setReceiveSuccessMsg(null)}
          onOpenReceive={po => { setReceiveSuccessMsg(null); setReceivePO(po ?? null); setReceiveOpen(true) }}
        />
      )}

      {activeTab === 'Purchase Orders' && (
        <PurchaseOrdersTab
          purchaseOrders={purchaseOrders}
          ingredients={ingredients}
          breweryId={brewery.id}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          onCreatePO={() => { setPoTarget(null); setPoOpen(true) }}
          onViewPO={po => setPoTarget(po)}
          onDeletePO={handleDeletePO}
          onCancelPO={handleCancelPO}
          onEditPO={po => { setPoTarget(po); setPoOpen(true) }}
        />
      )}

      {activeTab === 'Transaction History' && (
        <TransactionHistoryTab
          transactions={transactions}
          ingredients={ingredients}
          filterIngId={historyIngId}
          onClearFilter={() => setHistoryIngId(null)}
          onOpenAdjust={ing => setAdjustTarget(ing)}
        />
      )}

      {activeTab === 'Supplier Intelligence' && (
        <SupplierIntelligenceTab
          ingredients={ingredients}
          transactions={transactions}
          purchaseOrders={purchaseOrders}
          breweryId={brewery.id}
        />
      )}

      {/* ── Modals ── */}
      {addIngOpen && (
        <AddEditIngredientModal
          isOpen={addIngOpen}
          ingredient={editIngTarget}
          breweryId={brewery.id}
          onClose={() => { setAddIngOpen(false); setEditIngTarget(null) }}
          onSaved={updated => {
            setIngredients(prev =>
              editIngTarget
                ? prev.map(i => i.id === updated.id ? updated : i)
                : [updated, ...prev]
            )
            setAddIngOpen(false)
            setEditIngTarget(null)
          }}
        />
      )}

      {adjustTarget && (
        <AdjustStockModal
          isOpen={!!adjustTarget}
          ingredient={adjustTarget}
          breweryId={brewery.id}
          onClose={() => setAdjustTarget(null)}
          onSaved={(updatedIng, tx) => {
            setIngredients(prev => prev.map(i => i.id === updatedIng.id ? updatedIng : i))
            setTransactions(prev => [tx, ...prev])
            setAdjustTarget(null)
          }}
        />
      )}

      {receiveOpen && (
        <ReceiveStockModal
          isOpen={receiveOpen}
          purchaseOrder={receivePO}
          ingredients={ingredients}
          breweryId={brewery.id}
          onClose={() => { setReceiveOpen(false); setReceivePO(null) }}
          onSaved={msg => { setReceiveOpen(false); setReceivePO(null); setReceiveSuccessMsg(msg ?? null); loadAll() }}
        />
      )}

      {poOpen && (
        <CreatePOModal
          isOpen={poOpen}
          purchaseOrder={poTarget}
          ingredients={ingredients}
          breweryId={brewery.id}
          onClose={() => { setPoOpen(false); setPoTarget(null) }}
          onSaved={newPO => {
            setPurchaseOrders(prev =>
              poTarget
                ? prev.map(p => p.id === newPO.id ? newPO : p)
                : [newPO, ...prev]
            )
            setPoOpen(false)
            setPoTarget(null)
          }}
        />
      )}

      {poTarget && !poOpen && (
        <PODetailModal
          isOpen={!!poTarget}
          purchaseOrder={poTarget}
          onClose={() => setPoTarget(null)}
          onReceive={po => { setReceivePO(po); setReceiveOpen(true); setPoTarget(null) }}
          onEdit={() => setPoOpen(true)}
        />
      )}

      {addPkgMatOpen && (
        <AddPackagingMaterialModal
          isOpen={addPkgMatOpen}
          breweryId={brewery.id}
          onClose={() => setAddPkgMatOpen(false)}
          onSaved={newMat => {
            setPackagingMaterials(prev =>
              [...prev, newMat].sort((a, b) =>
                (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name)
              )
            )
            setAddPkgMatOpen(false)
          }}
        />
      )}

      {adjustPkgMatTarget && (
        <AdjustPackagingMaterialModal
          isOpen={!!adjustPkgMatTarget}
          material={adjustPkgMatTarget}
          breweryId={brewery.id}
          onClose={() => setAdjustPkgMatTarget(null)}
          onSaved={updatedMat => {
            setPackagingMaterials(prev => prev.map(m => m.id === updatedMat.id ? updatedMat : m))
            setAdjustPkgMatTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Tab 1: Inventory ─────────────────────────────────────────────────────────

function InventoryTab({
  ingredients, isReadOnly, ReadOnlyTooltip,
  lowStock, outOfStock, expiring, today,
  onAdd, onEdit, onAdjust, onViewHistory, onCreatePO,
  onDeactivate, onReactivate,
}) {
  const [search,       setSearch]       = useState('')
  const [catFilter,    setCatFilter]    = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy,       setSortBy]       = useState('Name')
  const [showInactive, setShowInactive] = useState(false)

  // Filter and sort the ingredient list based on current controls
  const filtered = useMemo(() => {
    let list = showInactive
      ? ingredients.filter(i => !i.is_active)
      : ingredients.filter(i => i.is_active)

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i => i.name.toLowerCase().includes(q))
    }

    if (catFilter) {
      list = list.filter(i => i.category === catFilter)
    }

    if (statusFilter === 'Low Stock') {
      list = list.filter(i =>
        i.reorder_threshold != null &&
        (parseFloat(i.current_stock_quantity) || 0) <= parseFloat(i.reorder_threshold)
      )
    } else if (statusFilter === 'Out of Stock') {
      list = list.filter(i => (parseFloat(i.current_stock_quantity) || 0) === 0)
    } else if (statusFilter === 'Expiring Soon') {
      list = list.filter(i => {
        if (!i.expiration_date) return false
        const days = Math.ceil((new Date(i.expiration_date) - today) / 86400000)
        return days <= 30
      })
    }

    list = [...list]
    if (sortBy === 'Name')       list.sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'Category')   list.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''))
    if (sortBy === 'Stock Level') list.sort((a, b) => (parseFloat(a.current_stock_quantity) || 0) - (parseFloat(b.current_stock_quantity) || 0))
    if (sortBy === 'Last Updated') list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

    return list
  }, [ingredients, search, catFilter, statusFilter, sortBy, today, showInactive])

  // Build workflow warnings from the ingredients list
  const inventoryWarnings = []

  // Active ingredients with zero or null stock
  const warnOutOfStock = ingredients.filter(item =>
    (item.current_stock_quantity == null || parseFloat(item.current_stock_quantity) <= 0) &&
    (item.is_active !== false)
  )
  if (warnOutOfStock.length > 0) {
    inventoryWarnings.push({
      message: `${warnOutOfStock.length} ingredient${warnOutOfStock.length > 1 ? 's' : ''} out of stock`,
      severity: 'required',
      link: '/inventory',
    })
  }

  // Active ingredients at or below their reorder threshold (but still have some stock)
  const warnLowStock = ingredients.filter(item => {
    const qty    = parseFloat(item.current_stock_quantity) || 0
    const reorder = parseFloat(item.reorder_threshold ?? item.reorder_point ?? item.min_stock_level) || 0
    return item.is_active !== false && reorder > 0 && qty <= reorder && qty > 0
  })
  if (warnLowStock.length > 0) {
    inventoryWarnings.push({
      message: `${warnLowStock.length} ingredient${warnLowStock.length > 1 ? 's' : ''} at or below reorder threshold`,
      severity: 'recommended',
      link: '/inventory',
    })
  }

  return (
    <div className="space-y-4">

      {/* Workflow warning banner */}
      <WorkflowWarningBanner warnings={inventoryWarnings} />

      {/* Alert bars */}
      {(outOfStock.length > 0 || expiring.length > 0) && (
        <div className="bg-red-50 border border-danger rounded-lg px-4 py-3 text-sm">
          <p className="font-semibold text-danger mb-1">
            ⚠️ Attention required
          </p>
          {outOfStock.length > 0 && (
            <p className="text-danger text-xs">
              Out of stock: {outOfStock.map(i => i.name).join(', ')}
            </p>
          )}
          {expiring.length > 0 && (
            <p className="text-danger text-xs mt-0.5">
              Expiring within 30 days: {expiring.map(i => i.name).join(', ')}
            </p>
          )}
        </div>
      )}

      {lowStock.length > 0 && outOfStock.length === 0 && (
        <div className="bg-amber/10 border border-amber rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-amber-dark">
              🔔 Low stock: {lowStock.map(i => i.name).join(', ')}
            </p>
          </div>
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={onCreatePO}
              disabled={isReadOnly}
              className="text-xs bg-amber hover:bg-amber-dark text-white font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              Create Purchase Order
            </button>
          </ReadOnlyTooltip>
        </div>
      )}

      {/* Search / filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ingredients..."
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber w-48"
        />
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          {['All','Low Stock','Out of Stock','Expiring Soon'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          {['Name','Category','Stock Level','Last Updated'].map(s => (
            <option key={s} value={s}>Sort: {s}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 accent-amber" />
          Show inactive
        </label>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} ingredient{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Inventory table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-gray-500 text-sm">
            {ingredients.filter(i => i.is_active).length === 0
              ? 'No ingredients yet — add your first one.'
              : 'No ingredients match your filters.'}
          </p>
          {ingredients.filter(i => i.is_active).length === 0 && (
            <button
              onClick={onAdd}
              className="mt-3 text-amber hover:underline text-sm font-medium"
            >
              + Add to Inventory
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-semibold">Ingredient</th>
                  <th className="text-right px-4 py-3 font-semibold">Stock</th>
                  <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell">Reorder At</th>
                  <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Last Received Price</th>
                  <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Value on Hand</th>
                  <th className="text-center px-4 py-3 font-semibold hidden lg:table-cell">Expiry</th>
                  <th className="text-center px-4 py-3 font-semibold hidden lg:table-cell">Last Received</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(ing => (
                  <IngredientRow
                    key={ing.id}
                    ingredient={ing}
                    today={today}
                    isReadOnly={isReadOnly}
                    ReadOnlyTooltip={ReadOnlyTooltip}
                    onEdit={() => onEdit(ing)}
                    onAdjust={() => onAdjust(ing)}
                    onViewHistory={() => onViewHistory(ing)}
                    onDeactivate={onDeactivate}
                    onReactivate={onReactivate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single ingredient row in the inventory table ──────────────────────────────

function IngredientRow({ ingredient: ing, today, isReadOnly, ReadOnlyTooltip, onEdit, onAdjust, onViewHistory, onDeactivate, onReactivate }) {
  const stock         = parseFloat(ing.current_stock_quantity) || 0
  const threshold     = parseFloat(ing.reorder_threshold)
  const lastPrice     = parseFloat(ing.last_received_price) || 0
  const valueOnHand   = stock * lastPrice

  // Compute expiry status
  let expiryLabel = '—'
  let expiryClass = 'text-gray-400'
  if (ing.expiration_date) {
    const daysLeft = Math.ceil((new Date(ing.expiration_date) - today) / 86400000)
    expiryLabel = ing.expiration_date
    if (daysLeft <= 0)               { expiryClass = 'text-danger font-semibold' }
    else if (daysLeft <= EXPIRY_ALERT_DAYS) { expiryClass = 'text-danger' }
    else if (daysLeft <= EXPIRY_WARN_DAYS)  { expiryClass = 'text-amber' }
    else                             { expiryClass = 'text-gray-500' }
  }

  // Compute stock colour
  let stockClass = 'text-success font-semibold'
  if (stock === 0)                                   stockClass = 'text-danger font-bold'
  else if (threshold != null && stock <= threshold)  stockClass = 'text-amber font-semibold'

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Name + category + supplier */}
      <td className="px-4 py-3">
        <p className="font-medium text-navy">{ing.name}</p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {ing.category && (
            <span className="text-[11px] bg-navy/10 text-navy px-1.5 py-0.5 rounded-full">{ing.category}</span>
          )}
          {ing.sub_type && (
            <span className="text-[11px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{ing.sub_type}</span>
          )}
        </div>
        {ing.supplier_name && (
          <p className="text-[11px] text-gray-400 mt-0.5">🏭 {ing.supplier_name}</p>
        )}
        {ing.storage_location && (
          <p className="text-[11px] text-gray-400 mt-0.5">📍 {ing.storage_location}</p>
        )}
      </td>

      {/* Current stock */}
      <td className={`px-4 py-3 text-right ${stockClass}`}>
        {stock.toFixed(2)} {ing.stock_unit ?? ing.unit ?? ''}
        {stock === 0 && <span className="block text-[10px] font-normal text-danger">OUT</span>}
      </td>

      {/* Reorder threshold */}
      <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
        {threshold != null ? `${threshold} ${ing.stock_unit ?? ''}` : '—'}
      </td>

      {/* Last received price */}
      <td className="px-4 py-3 text-right text-gray-700 hidden md:table-cell">
        {lastPrice > 0 ? `$${lastPrice.toFixed(4)}` : '—'}
      </td>

      {/* Value on hand */}
      <td className="px-4 py-3 text-right font-medium text-navy hidden md:table-cell">
        {valueOnHand > 0 ? `$${valueOnHand.toFixed(2)}` : '—'}
      </td>

      {/* Expiry */}
      <td className={`px-4 py-3 text-center text-xs ${expiryClass} hidden lg:table-cell`}>
        {expiryLabel}
      </td>

      {/* Last received */}
      <td className="px-4 py-3 text-center text-xs text-gray-400 hidden lg:table-cell">
        {ing.last_received_date ?? '—'}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex gap-1 justify-end flex-wrap">
          {ing.is_active ? (
            <>
              <ReadOnlyTooltip isReadOnly={isReadOnly}>
                <button
                  onClick={onAdjust}
                  disabled={isReadOnly}
                  className="text-xs text-amber hover:text-amber-dark font-medium px-2 py-1 rounded border border-amber/30 hover:border-amber transition-colors disabled:opacity-40"
                >
                  Adjust
                </button>
              </ReadOnlyTooltip>
              <ReadOnlyTooltip isReadOnly={isReadOnly}>
                <button
                  onClick={onEdit}
                  disabled={isReadOnly}
                  className="text-xs text-gray-500 hover:text-navy font-medium px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-40"
                >
                  Edit
                </button>
              </ReadOnlyTooltip>
              <button
                onClick={onViewHistory}
                className="text-xs text-gray-400 hover:text-navy px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors"
              >
                History
              </button>
              <ReadOnlyTooltip isReadOnly={isReadOnly}>
                <button
                  onClick={() => onDeactivate(ing)}
                  disabled={isReadOnly}
                  className="text-xs text-gray-400 hover:text-danger px-2 py-1 rounded border border-gray-200 hover:border-red-200 transition-colors disabled:opacity-40"
                >
                  Deactivate
                </button>
              </ReadOnlyTooltip>
            </>
          ) : (
            <>
              <button
                onClick={onViewHistory}
                className="text-xs text-gray-400 hover:text-navy px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors"
              >
                History
              </button>
              <ReadOnlyTooltip isReadOnly={isReadOnly}>
                <button
                  onClick={() => onReactivate(ing)}
                  disabled={isReadOnly}
                  className="text-xs text-success hover:text-green-700 font-medium px-2 py-1 rounded border border-green-200 hover:border-green-300 transition-colors disabled:opacity-40"
                >
                  Reactivate
                </button>
              </ReadOnlyTooltip>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Tab 2: Receive Stock ──────────────────────────────────────────────────────

function ReceiveStockTab({ ingredients, transactions, purchaseOrders, isReadOnly, ReadOnlyTooltip, onOpenReceive, successMsg, onClearSuccess }) {
  const [expandedTxId, setExpandedTxId] = useState(null)
  const [selectedPOId, setSelectedPOId] = useState('')

  function handleReceivePO() {
    const po = purchaseOrders.find(p => p.id === selectedPOId)
    if (!po) return
    onOpenReceive(po)
  }

  return (
    <div className="space-y-4">

      {/* Success banner — shown after a receive completes */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-success font-medium">✓ {successMsg}</p>
          <button onClick={onClearSuccess} className="text-xs text-green-600 hover:text-green-800 underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* ── Primary workflow: Receive a Purchase Order ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-navy text-sm">Receive a Purchase Order</h3>
          <p className="text-xs text-gray-400 mt-0.5">Select an open order to pre-fill all line items automatically.</p>
        </div>
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-gray-400">No open purchase orders to receive against. Create one in the Purchase Orders tab.</p>
        ) : (
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-gray-600 block mb-1">Open Purchase Order</label>
              <select
                value={selectedPOId}
                onChange={e => setSelectedPOId(e.target.value)}
                className="field-input w-full"
              >
                <option value="">Select a purchase order...</option>
                {purchaseOrders.map(po => {
                  const statusNote = po.status === 'partially_received' ? ' (Partial)' : ''
                  return (
                    <option key={po.id} value={po.id}>
                      {po.supplier_name} — {po.order_date} · {po.purchase_order_items?.length ?? 0} items{statusNote}
                    </option>
                  )
                })}
              </select>
            </div>
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button
                onClick={handleReceivePO}
                disabled={isReadOnly || !selectedPOId}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Receive Selected Order
              </button>
            </ReadOnlyTooltip>
          </div>
        )}
      </div>

      {/* ── Secondary workflow: Receive Without a Purchase Order ── */}
      <div className="flex items-center gap-3 text-gray-300">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 shrink-0">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={() => onOpenReceive(null)}
            disabled={isReadOnly}
            className="border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
          >
            Receive Informal Stock
          </button>
        </ReadOnlyTooltip>
        <p className="text-xs text-gray-400">
          For stock received without a formal purchase order — donations, transfers, or informal purchases.
        </p>
      </div>

      {/* Recent receipts */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-navy text-sm">Recent Receipts</h3>
        </div>
        {transactions.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">No stock received yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Ingredient</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2 hidden sm:table-cell">Unit Cost</th>
                  <th className="text-right px-4 py-2 hidden sm:table-cell">Total</th>
                  <th className="text-right px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map(tx => (
                  <>
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{tx.transaction_date}</td>
                      <td className="px-4 py-2.5 font-medium text-navy">{tx.ingredient?.name ?? tx.reference_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-success font-semibold">
                        +{parseFloat(tx.quantity).toFixed(2)} {tx.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 hidden sm:table-cell">
                        {tx.unit_cost ? `$${parseFloat(tx.unit_cost).toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 hidden sm:table-cell">
                        {tx.total_cost ? `$${parseFloat(tx.total_cost).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => setExpandedTxId(expandedTxId === tx.id ? null : tx.id)}
                          className="text-xs text-gray-400 hover:text-navy px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          {expandedTxId === tx.id ? 'Hide' : 'Detail'}
                        </button>
                      </td>
                    </tr>
                    {expandedTxId === tx.id && (
                      <tr key={tx.id + '_detail'} className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-3 text-xs text-gray-600">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div><span className="text-gray-400 block mb-0.5">Lot #</span>{tx.lot_number ?? '—'}</div>
                            <div><span className="text-gray-400 block mb-0.5">Notes</span>{tx.notes ?? '—'}</div>
                            <div><span className="text-gray-400 block mb-0.5">Source</span>{tx.reference_name ?? (tx.reference_type === 'purchase_order' ? 'Purchase Order' : 'Manual')}</div>
                            <div><span className="text-gray-400 block mb-0.5">Landed cost/unit</span>{tx.unit_cost ? `$${parseFloat(tx.unit_cost).toFixed(4)}/${tx.unit}` : '—'}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 3: Purchase Orders ────────────────────────────────────────────────────

function PurchaseOrdersTab({ purchaseOrders, ingredients, breweryId, isReadOnly, ReadOnlyTooltip, onCreatePO, onViewPO, onDeletePO, onCancelPO, onEditPO }) {
  const [subTab,         setSubTab]         = usePersistedTab('inventory_po_subtab', 'orders')
  const [showCancelled,  setShowCancelled]  = useState(false)

  const displayedPOs = showCancelled
    ? purchaseOrders
    : purchaseOrders.filter(p => p.status !== 'cancelled')

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher + action button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
          {['orders', 'suppliers'].map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-1.5 rounded-md font-medium capitalize transition-colors ${
                subTab === t ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
              }`}
            >
              {t === 'orders' ? 'Purchase Orders' : 'Suppliers'}
            </button>
          ))}
        </div>
        {subTab === 'orders' && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)}
                className="rounded border-gray-300 accent-amber" />
              Show cancelled
            </label>
            <ReadOnlyTooltip isReadOnly={isReadOnly}>
              <button
                onClick={onCreatePO}
                disabled={isReadOnly}
                className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                + Create Purchase Order
              </button>
            </ReadOnlyTooltip>
          </div>
        )}
      </div>

      {subTab === 'orders' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {displayedPOs.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-gray-500 text-sm">
                {purchaseOrders.length === 0 ? 'No purchase orders yet.' : 'No active purchase orders. Check "Show cancelled" to see all.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Supplier</th>
                    <th className="text-left px-4 py-3 hidden sm:table-cell">Order Date</th>
                    <th className="text-center px-4 py-3 hidden sm:table-cell">Items</th>
                    <th className="text-right px-4 py-3">Total</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Expected Delivery</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedPOs.map(po => {
                    const statusInfo  = PO_STATUSES.find(s => s.value === po.status)
                    const isDraft     = po.status === 'draft'
                    const canCancel   = ['submitted','confirmed'].includes(po.status)
                    const isCancelled = po.status === 'cancelled'
                    return (
                      <tr key={po.id} className={`hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-navy">{po.supplier_name}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{po.order_date}</td>
                        <td className="px-4 py-3 text-center text-gray-500 hidden sm:table-cell">
                          {po.purchase_order_items?.length ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-navy">
                          ${parseFloat(po.total_order_cost).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo?.bg} ${statusInfo?.text}`}>
                            {statusInfo?.label ?? po.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                          {po.expected_delivery_date ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            {isDraft ? (
                              // Draft: Edit + Delete only
                              !isReadOnly && (
                                <>
                                  <button
                                    onClick={() => onEditPO(po)}
                                    className="text-xs text-amber hover:text-amber-dark font-medium px-2 py-1 rounded border border-amber/40 hover:border-amber transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => onDeletePO(po)}
                                    className="text-xs text-danger hover:text-red-700 font-medium px-2 py-1 rounded border border-red-200 hover:border-red-300 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </>
                              )
                            ) : (
                              // All non-draft statuses: optional Cancel + View
                              <>
                                {canCancel && !isReadOnly && (
                                  <button
                                    onClick={() => onCancelPO(po)}
                                    className="text-xs text-gray-500 hover:text-danger px-2 py-1 rounded border border-gray-200 hover:border-red-200 transition-colors"
                                  >
                                    Cancel Order
                                  </button>
                                )}
                                <button
                                  onClick={() => onViewPO(po)}
                                  className="text-xs text-gray-500 hover:text-navy px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors"
                                >
                                  View
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'suppliers' && (
        <SuppliersPanel
          ingredients={ingredients}
          purchaseOrders={purchaseOrders}
          breweryId={breweryId}
          isReadOnly={isReadOnly}
        />
      )}
    </div>
  )
}

// ─── Suppliers Panel (sub-tab of Purchase Orders) ─────────────────────────────

function SuppliersPanel({ ingredients, purchaseOrders, breweryId, isReadOnly }) {
  const [editingId, setEditingId] = useState(null) // supplier record id being edited
  const [editForm,  setEditForm]  = useState({})
  const [saving,    setSaving]    = useState(false)
  const [savedId,   setSavedId]   = useState(null) // flash confirmation

  // Aggregate unique suppliers from ingredient_suppliers across all ingredients
  const suppliers = useMemo(() => {
    const map = new Map()
    for (const ing of ingredients) {
      for (const sup of (ing.ingredient_suppliers ?? [])) {
        if (!map.has(sup.id)) {
          map.set(sup.id, { ...sup, _ingredientName: ing.name })
        }
      }
    }
    // Group by supplier_name, keeping the most-recently-updated record as the canonical one
    const byName = new Map()
    for (const sup of map.values()) {
      const existing = byName.get(sup.supplier_name)
      if (!existing || sup.updated_at > existing.updated_at) {
        byName.set(sup.supplier_name, { ...sup, _poCount: 0, _lastOrder: sup.last_ordered_date })
      }
    }
    // Tally PO counts per supplier name
    for (const po of purchaseOrders) {
      const rec = byName.get(po.supplier_name)
      if (rec) {
        rec._poCount++
        if (!rec._lastOrder || po.order_date > rec._lastOrder) rec._lastOrder = po.order_date
      }
    }
    return [...byName.values()].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name))
  }, [ingredients, purchaseOrders])

  function startEdit(sup) {
    setEditingId(sup.id)
    setEditForm({
      contact_name:   sup.contact_name   ?? '',
      contact_email:  sup.contact_email  ?? '',
      contact_phone:  sup.contact_phone  ?? '',
      website_url:    sup.website_url    ?? '',
      account_number: sup.account_number ?? '',
    })
  }

  async function saveEdit(sup) {
    setSaving(true)
    // Update ALL ingredient_suppliers rows for this supplier name within the brewery
    await supabase.from('ingredient_suppliers')
      .update({
        contact_name:   editForm.contact_name   || null,
        contact_email:  editForm.contact_email  || null,
        contact_phone:  editForm.contact_phone  || null,
        website_url:    editForm.website_url    || null,
        account_number: editForm.account_number || null,
      })
      .eq('brewery_id', breweryId)
      .eq('supplier_name', sup.supplier_name)

    setSaving(false)
    setEditingId(null)
    setSavedId(sup.id)
    setTimeout(() => setSavedId(null), 2500)
  }

  if (suppliers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center">
        <p className="text-3xl mb-2">🏭</p>
        <p className="text-gray-500 text-sm">No suppliers yet. Create a purchase order to add your first supplier.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {suppliers.map(sup => {
        const isEditing = editingId === sup.id
        return (
          <div key={sup.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-navy">{sup.supplier_name}</p>
                <div className="flex flex-wrap gap-4 mt-1 text-xs text-gray-500">
                  {sup._poCount > 0 && <span>{sup._poCount} order{sup._poCount !== 1 ? 's' : ''}</span>}
                  {sup._lastOrder  && <span>Last order: {sup._lastOrder}</span>}
                  {sup.contact_name  && <span>👤 {sup.contact_name}</span>}
                  {sup.contact_email && <span>✉ {sup.contact_email}</span>}
                  {sup.contact_phone && <span>📞 {sup.contact_phone}</span>}
                  {sup.website_url   && (
                    <a href={sup.website_url} target="_blank" rel="noopener noreferrer"
                      className="text-amber hover:underline">🌐 Website</a>
                  )}
                  {sup.account_number && <span>Acct: {sup.account_number}</span>}
                </div>
                {savedId === sup.id && (
                  <p className="text-xs text-success mt-1">Saved ✓</p>
                )}
              </div>
              {!isEditing && !isReadOnly && (
                <button onClick={() => startEdit(sup)}
                  className="text-xs text-gray-500 hover:text-navy px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors shrink-0">
                  Edit
                </button>
              )}
            </div>

            {isEditing && (
              <div className="mt-3 border-t border-gray-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Contact Name">
                  <input type="text" value={editForm.contact_name}
                    onChange={e => setEditForm(p => ({ ...p, contact_name: e.target.value }))}
                    className="field-input" />
                </Field>
                <Field label="Contact Email">
                  <input type="email" value={editForm.contact_email}
                    onChange={e => setEditForm(p => ({ ...p, contact_email: e.target.value }))}
                    className="field-input" />
                </Field>
                <Field label="Contact Phone">
                  <input type="tel" value={editForm.contact_phone}
                    onChange={e => setEditForm(p => ({ ...p, contact_phone: e.target.value }))}
                    className="field-input" />
                </Field>
                <Field label="Website">
                  <input type="url" value={editForm.website_url}
                    onChange={e => setEditForm(p => ({ ...p, website_url: e.target.value }))}
                    className="field-input" />
                </Field>
                <Field label="Account Number">
                  <input type="text" value={editForm.account_number}
                    onChange={e => setEditForm(p => ({ ...p, account_number: e.target.value }))}
                    className="field-input" />
                </Field>
                <div className="flex gap-2 items-end sm:col-span-2">
                  <button onClick={() => saveEdit(sup)} disabled={saving}
                    className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab 4: Transaction History ────────────────────────────────────────────────

function TransactionHistoryTab({ transactions, ingredients, filterIngId, onClearFilter, onOpenAdjust }) {
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')
  const [txTypeFilter,    setTxTypeFilter]    = useState('')
  const [ingFilter,       setIngFilter]       = useState(filterIngId ?? '')
  const [correctionIngId, setCorrectionIngId] = useState('')

  // Sync external filter (from History button on ingredient row)
  useEffect(() => { if (filterIngId) setIngFilter(filterIngId) }, [filterIngId])

  const filtered = useMemo(() => {
    let list = [...transactions]
    if (ingFilter) list = list.filter(t => t.ingredient_id === ingFilter)
    if (txTypeFilter) list = list.filter(t => t.transaction_type === txTypeFilter)
    if (dateFrom) list = list.filter(t => t.transaction_date >= dateFrom)
    if (dateTo)   list = list.filter(t => t.transaction_date <= dateTo)
    return list
  }, [transactions, ingFilter, txTypeFilter, dateFrom, dateTo])

  // Export filtered transactions as CSV
  function handleExportCSV() {
    const rows = [
      ['Date','Ingredient','Type','Quantity','Unit','Unit Cost','Total Cost','Reference','Lot #','Notes'],
      ...filtered.map(tx => [
        tx.transaction_date,
        tx.ingredient?.name ?? '',
        tx.transaction_type,
        tx.quantity,
        tx.unit,
        tx.unit_cost ?? '',
        tx.total_cost ?? '',
        tx.reference_name ?? '',
        tx.lot_number ?? '',
        tx.notes ?? '',
      ]),
    ]
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'inventory_transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">

      {/* Add Correction — open AdjustStockModal for any ingredient */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-gray-500 max-w-md">
          Transactions cannot be deleted to maintain audit integrity. To correct an error, add an adjustment transaction.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={correctionIngId}
            onChange={e => setCorrectionIngId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber"
          >
            <option value="">Select ingredient...</option>
            {ingredients.filter(i => i.is_active).map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <button
            disabled={!correctionIngId}
            onClick={() => {
              const ing = ingredients.find(i => i.id === correctionIngId)
              if (ing) { onOpenAdjust(ing); setCorrectionIngId('') }
            }}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Add Correction
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {filterIngId && (
          <div className="flex items-center gap-1 bg-amber/10 border border-amber/30 rounded-lg px-3 py-1.5 text-xs text-amber">
            <span>Filtered by ingredient</span>
            <button onClick={() => { onClearFilter(); setIngFilter('') }} className="hover:text-amber-dark ml-1">✕</button>
          </div>
        )}
        <select
          value={ingFilter}
          onChange={e => setIngFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber"
        >
          <option value="">All ingredients</option>
          {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select
          value={txTypeFilter}
          onChange={e => setTxTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber"
        >
          <option value="">All types</option>
          {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber"
        />
        <span className="text-gray-400 text-xs">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber"
        />
        <button
          onClick={handleExportCSV}
          className="ml-auto text-xs border border-gray-200 text-gray-500 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-gray-400 text-sm">No transactions match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Ingredient</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Quantity</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Unit Cost</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Total</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Reference</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(tx => {
                  const typeInfo = TX_TYPES.find(t => t.value === tx.transaction_type)
                  const qty = parseFloat(tx.quantity) || 0
                  const qtyClass = qty >= 0 ? 'text-success' : 'text-danger'
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500">{tx.transaction_date}</td>
                      <td className="px-4 py-2.5 font-medium text-navy">{tx.ingredient?.name ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium ${typeInfo?.color ?? 'text-gray-500'}`}>
                          {typeInfo?.label ?? tx.transaction_type}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${qtyClass}`}>
                        {qty >= 0 ? '+' : ''}{qty.toFixed(2)} {tx.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 hidden sm:table-cell">
                        {tx.unit_cost ? `$${parseFloat(tx.unit_cost).toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 hidden sm:table-cell">
                        {tx.total_cost ? `$${parseFloat(tx.total_cost).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden md:table-cell">
                        {tx.reference_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden md:table-cell">
                        {tx.notes ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal: Add / Edit Ingredient ─────────────────────────────────────────────

const EMPTY_INGREDIENT = {
  name: '', category: '', sub_type: '', stock_unit: 'lb', current_stock_quantity: '0',
  reorder_threshold: '', reorder_quantity: '', lead_time_days: '',
  storage_location: '', lot_number: '', expiration_date: '', notes: '',
  // Flat supplier contact fields saved directly on the ingredient row
  supplier_name: '', supplier_contact_name: '', supplier_phone: '',
  supplier_email: '', supplier_website: '', supplier_account_number: '',
  supplier_lead_time_days: '', supplier_minimum_order_quantity: '', supplier_notes: '',
}

function AddEditIngredientModal({ isOpen, ingredient, breweryId, onClose, onSaved }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_inventory_add_ingredient')

  const [form,   setForm]   = useState(EMPTY_INGREDIENT)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const isEdit = !!ingredient

  // Populate from the existing row when editing, or restore a draft when adding
  useEffect(() => {
    if (!isOpen) return
    if (isEdit) {
      setForm({
        name:                   ingredient.name ?? '',
        category:               ingredient.category ?? '',
        sub_type:               ingredient.sub_type ?? '',
        stock_unit:             ingredient.stock_unit ?? ingredient.unit ?? 'lb',
        current_stock_quantity: String(ingredient.current_stock_quantity ?? 0),
        reorder_threshold:      ingredient.reorder_threshold != null ? String(ingredient.reorder_threshold) : '',
        reorder_quantity:       ingredient.reorder_quantity  != null ? String(ingredient.reorder_quantity)  : '',
        lead_time_days:         ingredient.lead_time_days    != null ? String(ingredient.lead_time_days)    : '',
        storage_location:       ingredient.storage_location  ?? '',
        lot_number:             ingredient.lot_number        ?? '',
        expiration_date:        ingredient.expiration_date   ?? '',
        notes:                  ingredient.notes             ?? '',
        supplier_name:                   ingredient.supplier_name ?? '',
        supplier_contact_name:           ingredient.supplier_contact_name ?? '',
        supplier_phone:                  ingredient.supplier_phone ?? '',
        supplier_email:                  ingredient.supplier_email ?? '',
        supplier_website:                ingredient.supplier_website ?? '',
        supplier_account_number:         ingredient.supplier_account_number ?? '',
        supplier_lead_time_days:         ingredient.supplier_lead_time_days != null ? String(ingredient.supplier_lead_time_days) : '',
        supplier_minimum_order_quantity: ingredient.supplier_minimum_order_quantity != null ? String(ingredient.supplier_minimum_order_quantity) : '',
        supplier_notes:                  ingredient.supplier_notes ?? '',
      })
    } else {
      const draft = loadDraft()
      setForm(draft?.form ?? EMPTY_INGREDIENT)
    }
    setError('')
  }, [isOpen])

  // Auto-save draft while composing a new ingredient
  useEffect(() => {
    if (!isOpen || isEdit) return
    saveDraft({ form })
  }, [form])

  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_INGREDIENT)

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Ingredient name is required.'); return }
    if (!form.category)    { setError('Category is required.'); return }
    if (!form.stock_unit)  { setError('Stock unit is required.'); return }

    setSaving(true); setError('')

    const payload = {
      brewery_id:             breweryId,
      name:                   form.name.trim(),
      category:               form.category,
      sub_type:               form.sub_type || null,
      unit:                   form.stock_unit,
      stock_unit:             form.stock_unit,
      current_stock_quantity: parseFloat(form.current_stock_quantity) || 0,
      reorder_threshold:      form.reorder_threshold ? parseFloat(form.reorder_threshold) : null,
      reorder_quantity:       form.reorder_quantity  ? parseFloat(form.reorder_quantity)  : null,
      lead_time_days:         form.lead_time_days    ? parseInt(form.lead_time_days)      : null,
      storage_location:       form.storage_location || null,
      lot_number:             form.lot_number || null,
      expiration_date:        form.expiration_date || null,
      notes:                  form.notes || null,
      is_active:              true,
      // Flat supplier contact fields
      supplier_name:                   form.supplier_name.trim() || null,
      supplier_contact_name:           form.supplier_contact_name.trim() || null,
      supplier_phone:                  form.supplier_phone.trim() || null,
      supplier_email:                  form.supplier_email.trim() || null,
      supplier_website:                form.supplier_website.trim() || null,
      supplier_account_number:         form.supplier_account_number.trim() || null,
      supplier_lead_time_days:         form.supplier_lead_time_days ? parseInt(form.supplier_lead_time_days) : null,
      supplier_minimum_order_quantity: form.supplier_minimum_order_quantity ? parseFloat(form.supplier_minimum_order_quantity) : null,
      supplier_notes:                  form.supplier_notes.trim() || null,
    }

    let savedId
    if (isEdit) {
      const { error: e2 } = await supabase.from('ingredients').update(payload).eq('id', ingredient.id)
      if (e2) { setSaving(false); setError(e2.message); return }
      savedId = ingredient.id
    } else {
      const { data, error: e2 } = await supabase.from('ingredients').insert(payload).select('id').single()
      if (e2) { setSaving(false); setError(e2.message); return }
      savedId = data.id
    }

    // Re-fetch the full row with suppliers so the parent has fresh data
    const { data: final } = await supabase
      .from('ingredients').select('*, ingredient_suppliers(*)').eq('id', savedId).single()

    clearDraft()
    setSaving(false)
    onSaved(final)
  }

  const [showSupplierSection, setShowSupplierSection] = useState(false)
  // Sub-type list for the selected category (null when no sub-type dropdown is needed)
  const subTypes = CATEGORY_SUBTYPES[form.category] ?? null

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit ${ingredient.name}` : 'Add to Inventory'}
      isDirty={!isEdit && isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            For items received without a purchase order — donations, transfers, opening stock, or ingredients sourced informally. For purchased ingredients use <strong>Purchase Orders</strong> instead.
          </p>
        )}

        {/* Name + category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Ingredient / Item Name *">
            <input type="text" value={form.name} onChange={e => setField('name', e.target.value)}
              placeholder="e.g. Cascade Hops" className="field-input" autoFocus={!isEdit} />
          </Field>
          <Field label="Category *">
            <select value={form.category}
              onChange={e => { setField('category', e.target.value); setField('sub_type', '') }}
              className="field-input">
              <option value="">Select category...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        {/* Sub-type dropdown — shown for Parts/Lab/Safety categories */}
        {subTypes && (
          <Field label="Type">
            <select value={form.sub_type} onChange={e => setField('sub_type', e.target.value)} className="field-input">
              <option value="">Select type...</option>
              {subTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        )}

        {/* Stock tracking */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Stock Unit *">
            <select value={form.stock_unit} onChange={e => setField('stock_unit', e.target.value)} className="field-input">
              {STOCK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Current Stock">
            <input type="number" step="any" min="0" value={form.current_stock_quantity}
              onChange={e => setField('current_stock_quantity', e.target.value)} className="field-input" />
          </Field>
          <Field label="Reorder At" tooltip="You will be alerted to reorder when stock falls to this level">
            <input type="number" step="any" min="0" value={form.reorder_threshold}
              onChange={e => setField('reorder_threshold', e.target.value)} placeholder="e.g. 5" className="field-input" />
          </Field>
          <Field label="Reorder Quantity">
            <input type="number" step="any" min="0" value={form.reorder_quantity}
              onChange={e => setField('reorder_quantity', e.target.value)} placeholder="e.g. 50" className="field-input" />
          </Field>
          <Field label="Lead Time (days)">
            <input type="number" min="0" value={form.lead_time_days}
              onChange={e => setField('lead_time_days', e.target.value)} placeholder="e.g. 7" className="field-input" />
          </Field>
          <Field label="Storage Location">
            <input type="text" value={form.storage_location}
              onChange={e => setField('storage_location', e.target.value)} placeholder="e.g. Cold Room A" className="field-input" />
          </Field>
        </div>

        {/* Lot + Expiry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Lot Number">
            <input type="text" value={form.lot_number}
              onChange={e => setField('lot_number', e.target.value)} placeholder="Current lot/batch number" className="field-input" />
          </Field>
          <Field label="Expiration Date">
            <input type="date" value={form.expiration_date}
              onChange={e => setField('expiration_date', e.target.value)} className="field-input" />
          </Field>
        </div>

        {/* Notes */}
        <Field label="Notes">
          <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
            rows={2} className="field-input resize-none" placeholder="Origin, variety, any storage notes..." />
        </Field>

        {/* ── Collapsible Supplier Information ── */}
        <div className="border border-gray-200 rounded-lg">
          <button
            type="button"
            onClick={() => setShowSupplierSection(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-navy hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span>Supplier Information <span className="text-xs font-normal text-gray-400">(contact, lead time — optional)</span></span>
            <span className="text-gray-400 text-xs">{showSupplierSection ? '▲' : '▼'}</span>
          </button>
          {showSupplierSection && (
            <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Supplier Name">
                  <input type="text" value={form.supplier_name}
                    onChange={e => setField('supplier_name', e.target.value)}
                    placeholder="e.g. LD Carlson" className="field-input" />
                </Field>
                <Field label="Contact Name">
                  <input type="text" value={form.supplier_contact_name}
                    onChange={e => setField('supplier_contact_name', e.target.value)}
                    placeholder="Jane Smith" className="field-input" />
                </Field>
                <Field label="Phone">
                  <input type="tel" value={form.supplier_phone}
                    onChange={e => setField('supplier_phone', e.target.value)}
                    placeholder="(555) 555-5555" className="field-input" />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.supplier_email}
                    onChange={e => setField('supplier_email', e.target.value)}
                    placeholder="orders@supplier.com" className="field-input" />
                </Field>
                <Field label="Website">
                  <input type="url" value={form.supplier_website}
                    onChange={e => setField('supplier_website', e.target.value)}
                    placeholder="https://supplier.com" className="field-input" />
                </Field>
                <Field label="Account Number">
                  <input type="text" value={form.supplier_account_number}
                    onChange={e => setField('supplier_account_number', e.target.value)}
                    placeholder="ACC-12345" className="field-input" />
                </Field>
                <Field label="Lead Time (days)">
                  <input type="number" min="0" value={form.supplier_lead_time_days}
                    onChange={e => setField('supplier_lead_time_days', e.target.value)}
                    placeholder="e.g. 5" className="field-input" />
                </Field>
                <Field label="Min Order Quantity">
                  <input type="number" min="0" step="any" value={form.supplier_minimum_order_quantity}
                    onChange={e => setField('supplier_minimum_order_quantity', e.target.value)}
                    placeholder="e.g. 10" className="field-input" />
                </Field>
              </div>
              <Field label="Supplier Notes">
                <textarea value={form.supplier_notes}
                  onChange={e => setField('supplier_notes', e.target.value)}
                  rows={2} className="field-input resize-none"
                  placeholder="Lead time notes, ordering instructions, preferred contacts..." />
              </Field>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add to Inventory'}
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

// ─── Modal: Adjust Stock ──────────────────────────────────────────────────────

const ADJUST_TYPES = [
  { value: 'add',       label: 'Add Stock',           txType: 'adjustment' },
  { value: 'remove',    label: 'Remove Stock',         txType: 'adjustment' },
  { value: 'set',       label: 'Set Exact Quantity',   txType: 'adjustment' },
  { value: 'waste',     label: 'Record Waste',         txType: 'waste' },
]

function AdjustStockModal({ isOpen, ingredient, breweryId, onClose, onSaved }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_inventory_adjust_stock')

  const [adjustType,  setAdjustType]  = useState('add')
  const [quantity,    setQuantity]    = useState('')
  const [notes,       setNotes]       = useState('')
  const [txDate,      setTxDate]      = useState(new Date().toISOString().split('T')[0])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const currentStock = parseFloat(ingredient?.current_stock_quantity) || 0
  const unit         = ingredient?.stock_unit ?? ingredient?.unit ?? ''
  const qty          = parseFloat(quantity) || 0

  // Restore any saved draft when the modal opens (for the current ingredient)
  useEffect(() => {
    if (!isOpen) return
    const draft = loadDraft()
    if (draft && draft.ingredientId === ingredient?.id) {
      setAdjustType(draft.adjustType ?? 'add')
      setQuantity(draft.quantity ?? '')
      setNotes(draft.notes ?? '')
      setTxDate(draft.txDate ?? new Date().toISOString().split('T')[0])
    } else {
      // Different ingredient or no draft — start fresh
      setAdjustType('add')
      setQuantity('')
      setNotes('')
      setTxDate(new Date().toISOString().split('T')[0])
    }
    setError('')
  }, [isOpen])

  // Auto-save draft as the user types
  useEffect(() => {
    if (!isOpen) return
    saveDraft({ ingredientId: ingredient?.id, adjustType, quantity, notes, txDate })
  }, [adjustType, quantity, notes, txDate])

  const isDirty = !!quantity || !!notes

  // Preview what the new stock level will be after this adjustment
  function previewStock() {
    if (!qty) return currentStock
    if (adjustType === 'add')    return currentStock + qty
    if (adjustType === 'remove' || adjustType === 'waste') return Math.max(0, currentStock - qty)
    if (adjustType === 'set')    return qty
    return currentStock
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!qty) { setError('Quantity is required.'); return }

    setSaving(true); setError('')

    const newStock     = previewStock()
    const typeInfo     = ADJUST_TYPES.find(t => t.value === adjustType)
    const txQuantity   = adjustType === 'set'  ? newStock - currentStock
                       : adjustType === 'remove' || adjustType === 'waste' ? -qty
                       : qty

    const { data: tx, error: txErr } = await supabase
      .from('inventory_transactions')
      .insert({
        brewery_id:       breweryId,
        ingredient_id:    ingredient.id,
        transaction_type: typeInfo?.txType ?? 'adjustment',
        quantity:         txQuantity,
        unit:             unit,
        notes:            notes || null,
        transaction_date: txDate,
        reference_type:   'manual',
      })
      .select()
      .single()

    if (txErr) { setSaving(false); setError(txErr.message); return }

    const { data: updatedIng, error: ingErr } = await supabase
      .from('ingredients')
      .update({ current_stock_quantity: newStock })
      .eq('id', ingredient.id)
      .select('*, ingredient_suppliers(*)')
      .single()

    if (ingErr) { setSaving(false); setError(ingErr.message); return }

    clearDraft()
    setSaving(false)
    onSaved(updatedIng, tx)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Adjust Stock — ${ingredient?.name}`}
      maxWidth="max-w-md"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="bg-amber/5 border border-amber/20 rounded-lg px-4 py-3 text-sm">
          <p className="text-gray-500">Current stock</p>
          <p className="text-2xl font-bold text-navy">{currentStock.toFixed(2)} {unit}</p>
        </div>

        <Field label="Adjustment Type">
          <select value={adjustType} onChange={e => setAdjustType(e.target.value)} className="field-input">
            {ADJUST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        <Field label={adjustType === 'set' ? `Set stock to (${unit})` : `Quantity (${unit})`}>
          <input
            type="number" step="any" min="0"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            autoFocus
            className="field-input"
          />
        </Field>

        {/* Preview new stock level */}
        {qty > 0 && (
          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
            New stock level: <strong className="text-navy">{previewStock().toFixed(2)} {unit}</strong>
          </div>
        )}

        <Field label="Date">
          <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="field-input" />
        </Field>

        <Field label="Reason / Notes">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Why are you adjusting this?"
            className="field-input"
          />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Adjustment'}
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

// ─── Modal: Receive Stock ─────────────────────────────────────────────────────

function ReceiveStockModal({ isOpen, purchaseOrder, ingredients, breweryId, onClose, onSaved }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_inventory_receive_stock')

  const [supplier,     setSupplier]     = useState('')
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0])
  const [lines,        setLines]        = useState([])
  const [shippingCost, setShippingCost] = useState('0')
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const EMPTY_LINE = { ingredient_id: '', ingredient_name: '', quantity: '', unit: 'lb', unit_cost: '', lot_number: '', expiration_date: '' }

  useEffect(() => {
    console.log('[ReceiveStockModal] isOpen:', isOpen, 'purchaseOrder:', purchaseOrder)
    if (!isOpen) return
    setError('')

    async function init() {
      if (purchaseOrder) {
        // Use embedded items if available; otherwise fetch from DB
        let items = purchaseOrder.purchase_order_items ?? []
        if (items.length === 0) {
          console.log('[ReceiveStockModal] no embedded items — fetching from DB for PO:', purchaseOrder.id)
          const { data, error } = await supabase
            .from('purchase_order_items')
            .select('*')
            .eq('purchase_order_id', purchaseOrder.id)
            .order('id')
          if (error) {
            console.error('[ReceiveStockModal] fetch error:', error)
          } else {
            items = data ?? []
            console.log('[ReceiveStockModal] fetched', items.length, 'items')
          }
        }

        console.log('[ReceiveStockModal] pre-populating from PO — items:', items.length, items)
        setSupplier(purchaseOrder.supplier_name ?? '')
        setDeliveryDate(new Date().toISOString().split('T')[0])
        setShippingCost('0')
        setNotes('')
        setLines(items.map(item => {
          // unit_cost stored in DB; fall back to total_cost / quantity_ordered if 0/null
          const storedUc  = parseFloat(item.unit_cost) || 0
          const qty       = parseFloat(item.quantity_ordered) || 1
          const unitCost  = storedUc > 0 ? storedUc : (parseFloat(item.total_cost) || 0) / qty
          const remaining = qty - (parseFloat(item.quantity_received) || 0)
          console.log('[ReceiveStockModal] item:', item.ingredient_name, 'ordered:', qty, 'unitCost:', unitCost)
          return {
            ingredient_id:    item.ingredient_id ?? '',
            ingredient_name:  item.ingredient_name,
            quantity:         String(Math.max(0, remaining)),
            unit:             item.unit,
            unit_cost:        String(unitCost),
            lot_number:       item.lot_number ?? '',
            expiration_date:  '',
            _ordered:         qty,
            _receivedSoFar:   parseFloat(item.quantity_received ?? 0),
          }
        }))
        // Fall back to a single empty line if PO somehow has no items
        if (items.length === 0) setLines([{ ...EMPTY_LINE }])
      } else {
        // Manual receive — restore draft if available
        const draft = loadDraft()
        if (draft) {
          setSupplier(draft.supplier ?? '')
          setDeliveryDate(draft.deliveryDate ?? new Date().toISOString().split('T')[0])
          setShippingCost(draft.shippingCost ?? '0')
          setNotes(draft.notes ?? '')
          setLines(draft.lines ?? [{ ...EMPTY_LINE }])
        } else {
          setSupplier('')
          setDeliveryDate(new Date().toISOString().split('T')[0])
          setShippingCost('0')
          setNotes('')
          setLines([{ ...EMPTY_LINE }])
        }
      }
    }

    init()
  }, [isOpen, purchaseOrder?.id])

  // Auto-save draft only for manual (non-PO) receives
  useEffect(() => {
    if (!isOpen || purchaseOrder) return
    saveDraft({ supplier, deliveryDate, shippingCost, notes, lines })
  }, [supplier, deliveryDate, shippingCost, notes, lines])

  const isDirty = !purchaseOrder && (!!supplier || lines.some(l => l.ingredient_name || l.quantity))

  function setLineField(idx, key, val) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  // Add a blank line to the receive stock form
  function addLine() {
    setLines(prev => [...prev, { ...EMPTY_LINE }])
  }

  // Remove a line by index
  function removeLine(idx) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function handleIngSelect(idx, ingId) {
    const ing = ingredients.find(i => i.id === ingId)
    if (ing) {
      setLineField(idx, 'ingredient_id', ingId)
      setLineField(idx, 'ingredient_name', ing.name)
      setLineField(idx, 'unit', ing.stock_unit ?? ing.unit ?? 'lb')
      const preferred = ing.ingredient_suppliers?.find(s => s.is_preferred)
      if (preferred?.price_per_unit) setLineField(idx, 'unit_cost', String(preferred.price_per_unit))
    }
  }

  const itemsSubtotal = lines.reduce((sum, l) =>
    sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0)
  const totalReceivingCost = itemsSubtotal + (parseFloat(shippingCost) || 0)

  async function handleSubmit(e) {
    e.preventDefault()
    const validLines = lines.filter(l => l.ingredient_name.trim() && parseFloat(l.quantity) > 0)
    if (validLines.length === 0) { setError('Add at least one ingredient with a quantity.'); return }

    setSaving(true); setError('')

    const shipping     = parseFloat(shippingCost) || 0
    const itemsTotal   = validLines.reduce((s, l) =>
      s + (parseFloat(l.quantity)||0) * (parseFloat(l.unit_cost)||0), 0)

    await Promise.all(validLines.map(async line => {
      const qty      = parseFloat(line.quantity)
      const unitCost = parseFloat(line.unit_cost) || 0
      const lineValue = qty * unitCost
      // Prorate shipping across lines by their share of total items value
      const proratedShipping = itemsTotal > 0 ? shipping * (lineValue / itemsTotal) : 0
      const landedUnitCost   = unitCost + (qty > 0 ? proratedShipping / qty : 0)

      await supabase.from('inventory_transactions').insert({
        brewery_id:       breweryId,
        ingredient_id:    line.ingredient_id || null,
        transaction_type: 'received',
        quantity:         qty,
        unit:             line.unit,
        unit_cost:        landedUnitCost || null,
        total_cost:       (landedUnitCost * qty) || null,
        lot_number:       line.lot_number || null,
        notes:            notes || null,
        transaction_date: deliveryDate,
        reference_type:   purchaseOrder ? 'purchase_order' : 'manual',
        reference_id:     purchaseOrder?.id ?? null,
        reference_name:   supplier || null,
      })

      if (line.ingredient_id) {
        const ing      = ingredients.find(i => i.id === line.ingredient_id)
        const newStock = (parseFloat(ing?.current_stock_quantity) || 0) + qty

        // Always update ingredient with landed cost — no prompt needed
        await supabase.from('ingredients').update({
          current_stock_quantity:  newStock,
          current_price_per_unit:  landedUnitCost || null,
          last_received_date:      deliveryDate,
          last_received_quantity:  qty,
          last_received_price:     landedUnitCost || null,
          lot_number:              line.lot_number || null,
          expiration_date:         line.expiration_date || null,
        }).eq('id', line.ingredient_id)

        // Keep preferred supplier price in sync with landed cost
        const preferred = ing?.ingredient_suppliers?.find(s => s.is_preferred)
        if (preferred && landedUnitCost > 0) {
          await supabase.from('ingredient_suppliers').update({
            price_per_unit:     landedUnitCost,
            last_ordered_date:  deliveryDate,
            last_ordered_price: landedUnitCost,
          }).eq('id', preferred.id)
        }
      }
    }))

    let successMsg = 'Stock received successfully.'
    if (purchaseOrder) {
      // Determine if all ordered items are fully received
      const allFullyReceived = validLines.every(l => {
        if (l._ordered == null) return true
        return (l._receivedSoFar || 0) + (parseFloat(l.quantity) || 0) >= l._ordered - 0.001
      }) && validLines.length >= (purchaseOrder.purchase_order_items?.length ?? 0)
      const newStatus = allFullyReceived ? 'received' : 'partially_received'
      await supabase.from('purchase_orders')
        .update({ status: newStatus, actual_delivery_date: deliveryDate })
        .eq('id', purchaseOrder.id)
      const statusLabel = allFullyReceived ? 'received' : 'partially received'
      successMsg = `Stock received. Purchase Order "${purchaseOrder.supplier_name} — ${purchaseOrder.order_date}" has been marked as ${statusLabel}.`
    }

    clearDraft()
    setSaving(false)
    onSaved(successMsg)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Receive Stock"
      maxWidth="max-w-2xl"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Supplier Name">
            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier / vendor name" className="field-input" />
          </Field>
          <Field label="Delivery Date">
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="field-input" />
          </Field>
        </div>

        {/* Ingredient lines */}
        <div>
          <p className="text-sm font-semibold text-navy mb-2">Items Received</p>
          <div className="space-y-3">
            {lines.map((line, idx) => {
              const remaining  = line._ordered != null ? line._ordered - (line._receivedSoFar || 0) : null
              const receiving  = parseFloat(line.quantity) || 0
              const isPartialLine = remaining != null && receiving > 0 && receiving < remaining - 0.001
              return (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                {/* PO reference — shows ordered qty and remaining for each line */}
                {line._ordered != null && (
                  <p className="text-xs text-gray-400">
                    Ordered: <strong className="text-gray-600">{line._ordered} {line.unit}</strong>
                    {line._receivedSoFar > 0 && (
                      <span> · Previously received: {line._receivedSoFar} {line.unit}</span>
                    )}
                    {remaining != null && (
                      <span> · Remaining: {remaining.toFixed(2)} {line.unit}</span>
                    )}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_80px_80px] gap-2">
                  <Field label="Ingredient">
                    {purchaseOrder ? (
                      <div className="field-input bg-gray-50 text-gray-700">{line.ingredient_name}</div>
                    ) : (
                      <select
                        value={line.ingredient_id}
                        onChange={e => handleIngSelect(idx, e.target.value)}
                        className="field-input"
                      >
                        <option value="">Select ingredient...</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label="Quantity">
                    <input type="number" step="any" min="0" value={line.quantity}
                      onChange={e => setLineField(idx, 'quantity', e.target.value)} className="field-input" />
                  </Field>
                  <Field label="Unit">
                    <select value={line.unit} onChange={e => setLineField(idx, 'unit', e.target.value)} className="field-input">
                      {STOCK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Field label="Unit Cost ($)">
                    <input type="number" step="any" min="0" value={line.unit_cost}
                      onChange={e => setLineField(idx, 'unit_cost', e.target.value)} className="field-input" />
                  </Field>
                  <Field label="Lot Number">
                    <input type="text" value={line.lot_number}
                      onChange={e => setLineField(idx, 'lot_number', e.target.value)} className="field-input" />
                  </Field>
                  <Field label="Expiry Date">
                    <input type="date" value={line.expiration_date}
                      onChange={e => setLineField(idx, 'expiration_date', e.target.value)} className="field-input" />
                  </Field>
                </div>
                {/* Amber warning when receiving less than the remaining ordered qty */}
                {isPartialLine && (
                  <p className="text-xs text-amber">
                    ⚠️ Partial: receiving {receiving} of {remaining.toFixed(2)} remaining {line.unit}
                  </p>
                )}
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)}
                    className="text-xs text-danger hover:text-red-700">Remove item</button>
                )}
              </div>
              )
            })}
          </div>
          <button type="button" onClick={addLine}
            className="mt-2 text-sm text-amber hover:text-amber-dark font-medium">
            + Add Another Item
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Shipping Cost ($)">
            <input type="number" step="any" min="0" value={shippingCost}
              onChange={e => setShippingCost(e.target.value)} className="field-input" />
          </Field>
          <div className="flex items-end pb-1">
            <p className="text-sm text-gray-500">
              Total: <strong className="text-navy">${totalReceivingCost.toFixed(2)}</strong>
            </p>
          </div>
        </div>

        <Field label="Notes">
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Delivery notes..." className="field-input" />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Receive Delivery'}
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

// ─── Modal: Create Purchase Order ─────────────────────────────────────────────

// total_cost is what the brewery actually paid for the whole line (e.g. $150 for a sack of malt).
// unit_cost is calculated automatically as total_cost / quantity_ordered.
const EMPTY_PO_LINE = { ingredient_id: '', ingredient_name: '', quantity_ordered: '', unit: 'lb', total_cost: '', is_new: false, new_category: '' }

const EMPTY_SUPPLIER_DETAILS = {
  contact_name: '', contact_email: '', contact_phone: '', website_url: '', account_number: '',
}

function CreatePOModal({ isOpen, purchaseOrder, ingredients, breweryId, onClose, onSaved }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_inventory_create_po')

  const [supplier,         setSupplier]         = useState('')
  const [orderDate,        setOrderDate]        = useState(new Date().toISOString().split('T')[0])
  const [deliveryDate,     setDeliveryDate]     = useState('')
  const [lines,            setLines]            = useState([{ ...EMPTY_PO_LINE }])
  const [shippingCost,     setShippingCost]     = useState('0')
  const [notes,            setNotes]            = useState('')
  const [supplierDetails,  setSupplierDetails]  = useState({ ...EMPTY_SUPPLIER_DETAILS })
  const [showSupDetails,   setShowSupDetails]   = useState(false)
  const [acOpen,           setAcOpen]           = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')

  // Unique known suppliers derived from ingredient_suppliers nested data
  const knownSuppliers = useMemo(() => {
    const map = new Map()
    for (const ing of ingredients) {
      for (const sup of (ing.ingredient_suppliers ?? [])) {
        if (sup.supplier_name && !map.has(sup.supplier_name)) {
          map.set(sup.supplier_name, {
            supplier_name:  sup.supplier_name,
            contact_name:   sup.contact_name   ?? '',
            contact_email:  sup.contact_email  ?? '',
            contact_phone:  sup.contact_phone  ?? '',
            website_url:    sup.website_url    ?? '',
            account_number: sup.account_number ?? '',
          })
        }
      }
    }
    return [...map.values()]
  }, [ingredients])

  const ingredientsByCategory = useMemo(() => {
    const map = new Map()
    for (const ing of ingredients) {
      const cat = ing.category || 'Other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(ing)
    }
    return [...map.entries()].map(([cat, items]) => ({ cat, items }))
  }, [ingredients])

  const acResults = useMemo(() => {
    if (!supplier.trim()) return knownSuppliers
    const q = supplier.toLowerCase()
    return knownSuppliers.filter(s => s.supplier_name.toLowerCase().includes(q))
  }, [supplier, knownSuppliers])

  // Reset / restore form when the modal opens
  useEffect(() => {
    if (!isOpen) return
    setShowSupDetails(false)
    setAcOpen(false)
    setError('')

    if (purchaseOrder) {
      // Editing an existing PO — always load from the PO record (no draft restore)
      setSupplier(purchaseOrder.supplier_name ?? '')
      setOrderDate(purchaseOrder.order_date ?? new Date().toISOString().split('T')[0])
      setDeliveryDate(purchaseOrder.expected_delivery_date ?? '')
      setShippingCost(String(purchaseOrder.shipping_cost ?? 0))
      setNotes(purchaseOrder.notes ?? '')
      setSupplierDetails({ ...EMPTY_SUPPLIER_DETAILS })
      if (purchaseOrder.purchase_order_items?.length > 0) {
        setLines(purchaseOrder.purchase_order_items.map(i => {
          const qty   = parseFloat(i.quantity_ordered) || 0
          const uCost = parseFloat(i.unit_cost) || 0
          const total = qty > 0 ? qty * uCost : 0
          return {
            ingredient_id:    i.ingredient_id ?? '',
            ingredient_name:  i.ingredient_name,
            quantity_ordered: String(i.quantity_ordered),
            unit:             i.unit,
            total_cost:       total > 0 ? String(total.toFixed(2)) : '',
            is_new:           false,
            new_category:     '',
          }
        }))
      } else {
        setLines([{ ...EMPTY_PO_LINE }])
      }
    } else {
      // New PO — restore draft if one exists
      const draft = loadDraft()
      if (draft) {
        setSupplier(draft.supplier ?? '')
        setOrderDate(draft.orderDate ?? new Date().toISOString().split('T')[0])
        setDeliveryDate(draft.deliveryDate ?? '')
        setShippingCost(draft.shippingCost ?? '0')
        setNotes(draft.notes ?? '')
        setSupplierDetails(draft.supplierDetails ?? { ...EMPTY_SUPPLIER_DETAILS })
        setLines(draft.lines ?? [{ ...EMPTY_PO_LINE }])
      } else {
        setSupplier('')
        setOrderDate(new Date().toISOString().split('T')[0])
        setDeliveryDate('')
        setShippingCost('0')
        setNotes('')
        setSupplierDetails({ ...EMPTY_SUPPLIER_DETAILS })
        setLines([{ ...EMPTY_PO_LINE }])
      }
    }
  }, [isOpen, purchaseOrder])

  // Auto-save draft for new POs (not edits)
  useEffect(() => {
    if (!isOpen || purchaseOrder) return
    saveDraft({ supplier, orderDate, deliveryDate, shippingCost, notes, supplierDetails, lines })
  }, [supplier, orderDate, deliveryDate, shippingCost, notes, supplierDetails, lines])

  const isDirty = !purchaseOrder && (!!supplier || lines.some(l => l.ingredient_name || l.total_cost))

  function setLineField(idx, key, val) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function handleIngSelect(idx, val) {
    if (val.startsWith('other_')) {
      const cat = val.slice(6)
      setLines(prev => prev.map((l, i) => i === idx
        ? { ...l, ingredient_id: '', ingredient_name: '', unit: 'lb', is_new: true, new_category: cat }
        : l
      ))
      return
    }
    const ing = ingredients.find(i => i.id === val)
    if (ing) {
      setLines(prev => prev.map((l, i) => i === idx
        ? { ...l, ingredient_id: val, ingredient_name: ing.name, unit: ing.stock_unit ?? ing.unit ?? 'lb', is_new: false, new_category: '' }
        : l
      ))
    }
  }

  function selectAcSupplier(known) {
    setSupplier(known.supplier_name)
    setSupplierDetails({
      contact_name:   known.contact_name,
      contact_email:  known.contact_email,
      contact_phone:  known.contact_phone,
      website_url:    known.website_url,
      account_number: known.account_number,
    })
    setAcOpen(false)
  }

  // Items total is the sum of each line's total_cost (what the brewery paid per ingredient)
  const itemsTotal = lines.reduce((sum, l) => sum + (parseFloat(l.total_cost) || 0), 0)
  const orderTotal = itemsTotal + (parseFloat(shippingCost) || 0)

  async function handleSave(status) {
    if (!supplier.trim()) { setError('Supplier name is required.'); return }
    const validLines = lines.filter(l =>
      (l.ingredient_id || (l.is_new && l.ingredient_name.trim())) && parseFloat(l.quantity_ordered) > 0
    )
    if (validLines.length === 0) { setError('Add at least one item with a quantity.'); return }
    const missingCost = validLines.find(l => !parseFloat(l.total_cost))
    if (missingCost) { setError(`Enter the total cost for "${missingCost.ingredient_name}".`); return }
    const missingNewCat = validLines.find(l => l.is_new && !l.ingredient_name.trim())
    if (missingNewCat) { setError('Enter a name for all new ingredients.'); return }

    setSaving(true); setError('')

    // Create any new ingredients before inserting PO items
    const processedLines = await Promise.all(validLines.map(async l => {
      if (!l.is_new) return l
      const { data: newIng } = await supabase.from('ingredients').insert({
        brewery_id:             breweryId,
        name:                   l.ingredient_name.trim(),
        category:               l.new_category || 'Other',
        unit:                   l.unit,
        stock_unit:             l.unit,
        current_stock_quantity: 0,
        is_active:              true,
      }).select('id').single()
      return newIng ? { ...l, ingredient_id: newIng.id, is_new: false } : l
    }))

    let po, poErr
    if (purchaseOrder) {
      // Editing an existing draft PO — update in place and re-insert items
      const { data, error } = await supabase.from('purchase_orders')
        .update({
          supplier_name:          supplier.trim(),
          order_date:             orderDate,
          expected_delivery_date: deliveryDate || null,
          status,
          total_order_cost:       orderTotal,
          shipping_cost:          parseFloat(shippingCost) || 0,
          notes:                  notes || null,
        })
        .eq('id', purchaseOrder.id)
        .select().single()
      po = data; poErr = error
      if (!poErr) {
        await supabase.from('purchase_order_items').delete().eq('purchase_order_id', purchaseOrder.id)
      }
    } else {
      const { data, error } = await supabase.from('purchase_orders').insert({
        brewery_id:             breweryId,
        supplier_name:          supplier.trim(),
        order_date:             orderDate,
        expected_delivery_date: deliveryDate || null,
        status,
        total_order_cost:       orderTotal,
        shipping_cost:          parseFloat(shippingCost) || 0,
        notes:                  notes || null,
      }).select().single()
      po = data; poErr = error
    }

    if (poErr) { setSaving(false); setError(poErr.message); return }

    // Build line-item rows.
    // IMPORTANT: total_cost is a GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED column
    // in purchase_order_items — PostgreSQL will reject the insert if we include it.
    // Only send the columns we control; the DB computes total_cost automatically.
    const itemRows = processedLines.map(l => {
      const qty      = parseFloat(l.quantity_ordered)
      const total    = parseFloat(l.total_cost) || 0
      const unitCost = qty > 0 ? total / qty : 0
      const name     = l.ingredient_name?.trim()
                     || ingredients.find(i => i.id === l.ingredient_id)?.name
                     || ''
      return {
        purchase_order_id: po.id,
        brewery_id:        breweryId,
        ingredient_id:     l.ingredient_id || null,
        ingredient_name:   name,
        quantity_ordered:  qty,
        unit:              l.unit,
        unit_cost:         unitCost,
        // total_cost intentionally omitted — it is a generated column
      }
    })

    console.log('[CreatePOModal] inserting purchase_order_items:', JSON.stringify(itemRows, null, 2))

    const { error: itemsErr } = await supabase.from('purchase_order_items').insert(itemRows)

    if (itemsErr) {
      console.error('[CreatePOModal] purchase_order_items insert error:', itemsErr)
      // Roll back the newly created PO so the DB stays consistent
      if (!purchaseOrder) {
        await supabase.from('purchase_orders').delete().eq('id', po.id)
      }
      setSaving(false)
      setError(`Failed to save line items: ${itemsErr.message}`)
      return
    }

    // Upsert supplier contact info for each ingredient line with a known ingredient_id
    const supName = supplier.trim()
    const hasDetails = Object.values(supplierDetails).some(v => v.trim())
    await Promise.all(
      processedLines
        .filter(l => l.ingredient_id)
        .map(async l => {
          const qty      = parseFloat(l.quantity_ordered)
          const total    = parseFloat(l.total_cost) || 0
          const unitCost = qty > 0 ? total / qty : 0

          const { data: existing } = await supabase
            .from('ingredient_suppliers')
            .select('id')
            .eq('brewery_id', breweryId)
            .eq('ingredient_id', l.ingredient_id)
            .eq('supplier_name', supName)
            .maybeSingle()

          const payload = {
            brewery_id:     breweryId,
            ingredient_id:  l.ingredient_id,
            supplier_name:  supName,
            last_ordered_date:  orderDate,
            last_ordered_price: unitCost || null,
            ...(hasDetails ? {
              contact_name:   supplierDetails.contact_name  || null,
              contact_email:  supplierDetails.contact_email || null,
              contact_phone:  supplierDetails.contact_phone || null,
              website_url:    supplierDetails.website_url   || null,
              account_number: supplierDetails.account_number || null,
            } : {}),
          }

          if (existing) {
            await supabase.from('ingredient_suppliers').update(payload).eq('id', existing.id)
          } else {
            await supabase.from('ingredient_suppliers').insert(payload)
          }
        })
    )

    // Re-fetch PO with items
    const { data: full } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .eq('id', po.id)
      .single()

    clearDraft()
    setSaving(false)
    onSaved(full ?? po)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={purchaseOrder ? 'Edit Purchase Order' : 'Create Purchase Order'}
      maxWidth="max-w-2xl"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <form onSubmit={e => { e.preventDefault(); handleSave('submitted') }} className="space-y-4">

        {/* Supplier name with autocomplete */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Supplier *">
            <div className="relative">
              <input
                type="text"
                value={supplier}
                onChange={e => { setSupplier(e.target.value); setAcOpen(true) }}
                onFocus={() => setAcOpen(true)}
                onBlur={() => setTimeout(() => setAcOpen(false), 150)}
                placeholder="Supplier name"
                className="field-input"
                autoComplete="off"
              />
              {acOpen && acResults.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto text-sm">
                  {acResults.map(s => (
                    <li key={s.supplier_name}
                      onMouseDown={() => selectAcSupplier(s)}
                      className="px-3 py-2 cursor-pointer hover:bg-amber/10 text-navy">
                      {s.supplier_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
          <Field label="Order Date *">
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="field-input" />
          </Field>
          <Field label="Expected Delivery">
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="field-input" />
          </Field>
        </div>

        {/* Collapsible supplier details */}
        <div className="border border-gray-200 rounded-lg">
          <button
            type="button"
            onClick={() => setShowSupDetails(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-navy hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span>Supplier Details <span className="text-xs font-normal text-gray-400">(contact, account — optional)</span></span>
            <span className="text-gray-400 text-xs">{showSupDetails ? '▲' : '▼'}</span>
          </button>
          {showSupDetails && (
            <div className="px-3 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100">
              <Field label="Contact Name">
                <input type="text" value={supplierDetails.contact_name}
                  onChange={e => setSupplierDetails(p => ({ ...p, contact_name: e.target.value }))}
                  placeholder="John Smith" className="field-input" />
              </Field>
              <Field label="Contact Email">
                <input type="email" value={supplierDetails.contact_email}
                  onChange={e => setSupplierDetails(p => ({ ...p, contact_email: e.target.value }))}
                  placeholder="orders@supplier.com" className="field-input" />
              </Field>
              <Field label="Contact Phone">
                <input type="tel" value={supplierDetails.contact_phone}
                  onChange={e => setSupplierDetails(p => ({ ...p, contact_phone: e.target.value }))}
                  placeholder="(555) 555-5555" className="field-input" />
              </Field>
              <Field label="Website">
                <input type="url" value={supplierDetails.website_url}
                  onChange={e => setSupplierDetails(p => ({ ...p, website_url: e.target.value }))}
                  placeholder="https://supplier.com" className="field-input" />
              </Field>
              <Field label="Account Number">
                <input type="text" value={supplierDetails.account_number}
                  onChange={e => setSupplierDetails(p => ({ ...p, account_number: e.target.value }))}
                  placeholder="ACC-12345" className="field-input" />
              </Field>
            </div>
          )}
        </div>

        {/* Items — user enters total cost paid; unit cost is calculated automatically */}
        <div>
          <p className="text-sm font-semibold text-navy mb-2">Items</p>
          <div className="space-y-3">
            {lines.map((line, idx) => {
              const qty      = parseFloat(line.quantity_ordered) || 0
              const total    = parseFloat(line.total_cost) || 0
              const unitCost = qty > 0 && total > 0 ? total / qty : null
              return (
                <div key={idx} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  {/* Row 1: ingredient, qty, unit — flat grid so all inputs stay on one baseline */}
                  <div className="grid grid-cols-[1fr_80px_80px_24px] gap-2 items-end">
                    {line.is_new ? (
                      // Two sub-columns (name + category) inside the first grid cell, no extra height
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={idx === 0 ? 'New ingredient name *' : undefined}>
                          <input type="text" value={line.ingredient_name}
                            onChange={e => setLineField(idx, 'ingredient_name', e.target.value)}
                            placeholder="Ingredient name" className="field-input" autoFocus />
                        </Field>
                        <Field label={idx === 0 ? 'Category *' : undefined}>
                          <select value={line.new_category}
                            onChange={e => setLineField(idx, 'new_category', e.target.value)}
                            className="field-input">
                            <option value="">Category...</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Field>
                      </div>
                    ) : (
                      <Field label={idx === 0 ? 'Ingredient *' : undefined}>
                        <select value={line.ingredient_id} onChange={e => handleIngSelect(idx, e.target.value)} className="field-input">
                          <option value="">Select ingredient...</option>
                          {ingredientsByCategory.map(({ cat, items }) => (
                            <optgroup key={cat} label={cat}>
                              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                              <option value={`other_${cat}`}>Other — new ingredient</option>
                            </optgroup>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field label={idx === 0 ? 'Qty *' : undefined}>
                      <input type="number" step="any" min="0" value={line.quantity_ordered}
                        onChange={e => setLineField(idx, 'quantity_ordered', e.target.value)}
                        placeholder="e.g. 55" className="field-input" />
                    </Field>
                    <Field label={idx === 0 ? 'Unit *' : undefined}>
                      <select value={line.unit} onChange={e => setLineField(idx, 'unit', e.target.value)} className="field-input">
                        {STOCK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>
                    <button type="button" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-300 hover:text-danger pb-1 text-sm">✕</button>
                  </div>
                  {/* Back-to-list link — outside the grid so it never affects row height above */}
                  {line.is_new && (
                    <button type="button"
                      onClick={() => setLines(prev => prev.map((l, i) => i === idx
                        ? { ...l, is_new: false, ingredient_name: '', ingredient_id: '', new_category: '' }
                        : l
                      ))}
                      className="text-xs text-gray-400 hover:text-navy">
                      ← Back to ingredient list
                    </button>
                  )}
                  {/* Row 2: total cost (user enters) + calculated unit cost */}
                  <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                    <Field label={idx === 0 ? 'Total cost for this line ($) *' : 'Total cost ($) *'}
                      tooltip="The total amount your brewery paid for this ingredient in this order — e.g. $150 for a sack of malt.">
                      <input type="number" step="0.01" min="0" value={line.total_cost}
                        onChange={e => setLineField(idx, 'total_cost', e.target.value)}
                        placeholder="e.g. 150.00" className="field-input" />
                    </Field>
                    <div className="pb-1 text-right shrink-0">
                      <p className="text-xs text-gray-400">Unit cost</p>
                      <p className="text-sm font-semibold text-navy">
                        {unitCost != null ? `$${unitCost.toFixed(4)}/${line.unit}` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <button type="button" onClick={() => setLines(prev => [...prev, { ...EMPTY_PO_LINE }])}
            className="mt-2 text-sm text-amber hover:text-amber-dark font-medium">
            + Add Item
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Shipping Cost ($)">
            <input type="number" step="any" min="0" value={shippingCost}
              onChange={e => setShippingCost(e.target.value)} className="field-input" />
          </Field>
          <div className="flex items-end pb-1">
            <p className="text-sm text-gray-600">
              Items: <strong className="text-navy">${itemsTotal.toFixed(2)}</strong> ·
              Total: <strong className="text-navy">${orderTotal.toFixed(2)}</strong>
            </p>
          </div>
        </div>

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="field-input resize-none" placeholder="Special instructions, etc." />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('draft')}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Submit Order'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Modal: PO Detail ─────────────────────────────────────────────────────────

function PODetailModal({ isOpen, purchaseOrder: po, onClose, onReceive, onEdit }) {
  const [items,        setItems]        = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemsError,   setItemsError]   = useState('')

  // Fetch line items whenever the PO changes — use embedded data if present,
  // otherwise query purchase_order_items directly (handles the case where the
  // parent state doesn't include the nested join).
  useEffect(() => {
    if (!po?.id) { setItems([]); return }
    setItemsError('')

    if (po.purchase_order_items?.length > 0) {
      setItems(po.purchase_order_items)
      return
    }

    setLoadingItems(true)
    supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', po.id)
      .order('id')
      .then(({ data, error }) => {
        setLoadingItems(false)
        if (error) {
          console.error('[PODetailModal] fetch error:', error)
          setItemsError('Could not load line items.')
        } else {
          setItems(data ?? [])
        }
      })
  }, [po?.id])

  if (!po) return null

  const statusInfo = PO_STATUSES.find(s => s.value === po.status)
  const canReceive = ['submitted','confirmed','partially_received'].includes(po.status)
  const itemsTotal = items.reduce((s, i) => {
    const lineTotal = parseFloat(i.total_cost) || (parseFloat(i.unit_cost) * parseFloat(i.quantity_ordered)) || 0
    return s + lineTotal
  }, 0)

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={`PO — ${po.supplier_name}`} maxWidth="max-w-xl">
      <div className="space-y-4">

        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400">Status</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo?.bg} ${statusInfo?.text}`}>
              {statusInfo?.label ?? po.status}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-400">Order Date</p>
            <p className="font-medium text-navy">{po.order_date}</p>
          </div>
          {po.expected_delivery_date && (
            <div>
              <p className="text-xs text-gray-400">Expected Delivery</p>
              <p className="font-medium text-navy">{po.expected_delivery_date}</p>
            </div>
          )}
          {po.actual_delivery_date && (
            <div>
              <p className="text-xs text-gray-400">Actual Delivery</p>
              <p className="font-medium text-navy">{po.actual_delivery_date}</p>
            </div>
          )}
        </div>

        {/* Items table — shows spinner, error, or loaded rows */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                <th className="text-left px-3 py-2">Ingredient</th>
                <th className="text-right px-3 py-2">Ordered</th>
                <th className="text-right px-3 py-2">Received</th>
                <th className="text-right px-3 py-2">Unit Cost</th>
                <th className="text-right px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingItems ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                    Loading items…
                  </td>
                </tr>
              ) : itemsError ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-danger">
                    {itemsError}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                    No line items found.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-medium text-navy">{item.ingredient_name}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{parseFloat(item.quantity_ordered).toFixed(2)} {item.unit}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{parseFloat(item.quantity_received ?? 0).toFixed(2)} {item.unit}</td>
                    <td className="px-3 py-2 text-right text-gray-600">${parseFloat(item.unit_cost || 0).toFixed(4)}</td>
                    <td className="px-3 py-2 text-right font-medium text-navy">${parseFloat(item.total_cost || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
              {!loadingItems && !itemsError && (
                <>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2 text-navy" colSpan={4}>Items Subtotal</td>
                    <td className="px-3 py-2 text-right text-navy">${itemsTotal.toFixed(2)}</td>
                  </tr>
                  {parseFloat(po.shipping_cost) > 0 && (
                    <tr className="bg-gray-50">
                      <td className="px-3 py-2 text-gray-500" colSpan={4}>Shipping</td>
                      <td className="px-3 py-2 text-right text-gray-700">${parseFloat(po.shipping_cost).toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="bg-amber/5 font-bold">
                    <td className="px-3 py-2 text-navy" colSpan={4}>Order Total</td>
                    <td className="px-3 py-2 text-right text-navy">${parseFloat(po.total_order_cost).toFixed(2)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {po.notes && (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Notes: {po.notes}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {canReceive && (
            <button onClick={() => onReceive(po)}
              className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors">
              Receive Delivery
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Tab: Packaging Materials ─────────────────────────────────────────────────

function PackagingMaterialsTab({ materials, loading, isReadOnly, ReadOnlyTooltip, onAdd, onAdjust, onDeactivate }) {
  const [search,    setSearch]    = useState('')
  const [catFilter, setCatFilter] = useState('')

  const lowStock = materials.filter(m =>
    m.reorder_threshold != null &&
    (parseFloat(m.current_stock_quantity) || 0) <= parseFloat(m.reorder_threshold)
  )

  const filtered = useMemo(() => {
    let list = [...materials]
    if (search)    list = list.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    if (catFilter) list = list.filter(m => m.category === catFilter)
    return list
  }, [materials, search, catFilter])

  if (loading) return <LoadingSpinner message="Loading packaging materials..." />

  return (
    <div className="space-y-4">
      {lowStock.length > 0 && (
        <div className="bg-amber/10 border border-amber rounded-lg px-4 py-2.5 text-sm text-amber-dark">
          <strong>{lowStock.length} material{lowStock.length > 1 ? 's' : ''} at or below reorder threshold:</strong>{' '}
          {lowStock.map(m => m.name).join(', ')}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search materials..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px] focus:outline-none focus:border-amber"
        />
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber"
        >
          <option value="">All Categories</option>
          {Object.keys(PACKAGING_MATERIAL_TYPES).map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium">No packaging materials yet</p>
          <p className="text-sm mt-1">Track cans, bottles, kegs, labels, carriers, and more.</p>
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={onAdd}
              disabled={isReadOnly}
              className="mt-4 bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              + Add Material
            </button>
          </ReadOnlyTooltip>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Name / Type</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Size / Spec</th>
                <th className="text-right px-4 py-3">In Stock</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Reorder At</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Cost/Unit</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Supplier</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(mat => {
                const qty      = parseFloat(mat.current_stock_quantity) || 0
                const reorder  = mat.reorder_threshold != null ? parseFloat(mat.reorder_threshold) : null
                const isLow    = reorder != null && qty <= reorder
                return (
                  <tr key={mat.id} className="hover:bg-gray-50">
                    {/* Name with category + type badges */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">
                        {mat.name}
                        {isLow && (
                          <span className="ml-2 text-xs bg-amber/20 text-amber-dark font-semibold px-1.5 py-0.5 rounded">
                            Low Stock
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(mat.material_category || mat.category) && (
                          <span className="text-[11px] bg-navy/10 text-navy px-1.5 py-0.5 rounded-full">
                            {mat.material_category || mat.category}
                          </span>
                        )}
                        {mat.material_type && (
                          <span className="text-[11px] bg-amber/10 text-amber-dark px-1.5 py-0.5 rounded-full">
                            {mat.material_type}
                          </span>
                        )}
                      </div>
                      {mat.supplier_name && (
                        <p className="text-[11px] text-gray-400 mt-0.5">🏭 {mat.supplier_name}</p>
                      )}
                    </td>
                    {/* Size / Spec — uses new size_spec field, falls back to legacy specification */}
                    <td className="px-4 py-3 text-gray-500 text-sm hidden sm:table-cell">
                      {mat.size_spec || mat.specification || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={isLow ? 'text-amber' : 'text-navy'}>
                        {qty.toLocaleString()} {mat.stock_unit ?? 'units'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                      {reorder != null ? `${reorder.toLocaleString()} ${mat.stock_unit ?? 'units'}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">
                      {mat.cost_per_unit != null ? `$${parseFloat(mat.cost_per_unit).toFixed(4)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {mat.supplier_name || mat.supplier || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <ReadOnlyTooltip isReadOnly={isReadOnly}>
                          <button
                            onClick={() => onAdjust(mat)}
                            disabled={isReadOnly}
                            className="text-xs font-medium text-amber hover:underline disabled:opacity-50"
                          >
                            Adjust
                          </button>
                        </ReadOnlyTooltip>
                        <ReadOnlyTooltip isReadOnly={isReadOnly}>
                          <button
                            onClick={() => onDeactivate(mat)}
                            disabled={isReadOnly}
                            className="text-xs font-medium text-gray-400 hover:text-danger disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </ReadOnlyTooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Modal: Add Packaging Material ───────────────────────────────────────────

const INPUT_PKG = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber'

const BLANK_PKG = {
  material_category: '', material_type: '', name: '', size_spec: '',
  stock_unit: 'units', current_stock_quantity: '', reorder_threshold: '',
  reorder_quantity: '', cost_per_unit: '', notes: '',
  supplier_name: '', supplier_contact_name: '', supplier_phone: '',
  supplier_email: '', supplier_website: '', supplier_account_number: '',
  supplier_lead_time_days: '', supplier_minimum_order_quantity: '', supplier_notes: '',
}

function AddPackagingMaterialModal({ isOpen, breweryId, onClose, onSaved }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('add_packaging_material')

  const [form,             setForm]             = useState(BLANK_PKG)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')
  const [showSupSection,   setShowSupSection]   = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Restore draft or reset when modal opens
  useEffect(() => {
    if (!isOpen) return
    const draft = loadDraft()
    if (draft) setForm(draft)
    else       setForm(BLANK_PKG)
    setError('')
  }, [isOpen])

  // Auto-save draft while composing
  useEffect(() => {
    if (!isOpen) return
    saveDraft(form)
  }, [form])

  // Type options for the selected material category
  const typeOptions = PACKAGING_MATERIAL_TYPES[form.material_category] ?? []

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')

    const { data, error: err } = await supabase
      .from('packaging_materials')
      .insert({
        brewery_id:                      breweryId,
        // Use material_category as the display category; keep legacy category column in sync
        category:                        form.material_category || null,
        material_category:               form.material_category || null,
        material_type:                   form.material_type || null,
        name:                            form.name.trim(),
        size_spec:                       form.size_spec.trim() || null,
        stock_unit:                      form.stock_unit || 'units',
        current_stock_quantity:          parseFloat(form.current_stock_quantity) || 0,
        reorder_threshold:               form.reorder_threshold !== '' ? parseFloat(form.reorder_threshold) : null,
        reorder_quantity:                form.reorder_quantity  !== '' ? parseFloat(form.reorder_quantity)  : null,
        cost_per_unit:                   form.cost_per_unit     !== '' ? parseFloat(form.cost_per_unit)     : null,
        notes:                           form.notes.trim() || null,
        supplier_name:                   form.supplier_name.trim() || null,
        supplier_contact_name:           form.supplier_contact_name.trim() || null,
        supplier_phone:                  form.supplier_phone.trim() || null,
        supplier_email:                  form.supplier_email.trim() || null,
        supplier_website:                form.supplier_website.trim() || null,
        supplier_account_number:         form.supplier_account_number.trim() || null,
        supplier_lead_time_days:         form.supplier_lead_time_days ? parseInt(form.supplier_lead_time_days) : null,
        supplier_minimum_order_quantity: form.supplier_minimum_order_quantity ? parseFloat(form.supplier_minimum_order_quantity) : null,
        supplier_notes:                  form.supplier_notes.trim() || null,
      })
      .select()
      .single()

    setSaving(false)
    if (err) { setError(err.message); return }
    clearDraft()
    onSaved(data)
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Add Packaging Material"
      isDirty={JSON.stringify(form) !== JSON.stringify(BLANK_PKG)}
      maxWidth="max-w-xl"
    >
      {draftRestored && (
        <div className="bg-amber/10 border border-amber rounded-lg px-3 py-2 text-xs text-amber-dark flex justify-between items-center mb-3">
          Draft restored.
          <button onClick={dismissDraftBanner} className="text-gray-400 hover:text-gray-600 ml-3">✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Category → grouped type dropdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Category</label>
            <select
              value={form.material_category}
              onChange={e => { set('material_category', e.target.value); set('material_type', '') }}
              className={INPUT_PKG}
            >
              <option value="">Select category…</option>
              {Object.keys(PACKAGING_MATERIAL_TYPES).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Type</label>
            <select
              value={form.material_type}
              onChange={e => set('material_type', e.target.value)}
              className={INPUT_PKG}
              disabled={!form.material_category}
            >
              <option value="">{form.material_category ? 'Select type…' : 'Select a category first'}</option>
              {typeOptions.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Name + size spec */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Name <span className="text-danger">*</span></label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. 16oz Tallboy Cans"
              className={INPUT_PKG}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Size / Spec</label>
            <input
              value={form.size_spec}
              onChange={e => set('size_spec', e.target.value)}
              placeholder="e.g. 16oz, 12mm ID, 1.5 inch tri-clamp"
              className={INPUT_PKG}
            />
          </div>
        </div>

        {/* Stock unit + levels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Stock Unit</label>
            <input
              value={form.stock_unit}
              onChange={e => set('stock_unit', e.target.value)}
              placeholder="units, cases, lbs…"
              className={INPUT_PKG}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Cost per Unit ($)</label>
            <input
              type="number" min="0" step="any"
              value={form.cost_per_unit}
              onChange={e => set('cost_per_unit', e.target.value)}
              placeholder="0.00"
              className={INPUT_PKG}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Current Stock</label>
            <input type="number" min="0" step="any" value={form.current_stock_quantity}
              onChange={e => set('current_stock_quantity', e.target.value)} placeholder="0" className={INPUT_PKG} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Reorder At</label>
            <input type="number" min="0" step="any" value={form.reorder_threshold}
              onChange={e => set('reorder_threshold', e.target.value)} placeholder="—" className={INPUT_PKG} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Reorder Qty</label>
            <input type="number" min="0" step="any" value={form.reorder_quantity}
              onChange={e => set('reorder_quantity', e.target.value)} placeholder="—" className={INPUT_PKG} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} className={INPUT_PKG} placeholder="Any notes about this material…" />
        </div>

        {/* ── Collapsible Supplier Information ── */}
        <div className="border border-gray-200 rounded-lg">
          <button
            type="button"
            onClick={() => setShowSupSection(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-navy hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span>Supplier Information <span className="text-xs font-normal text-gray-400">(contact, lead time — optional)</span></span>
            <span className="text-gray-400 text-xs">{showSupSection ? '▲' : '▼'}</span>
          </button>
          {showSupSection && (
            <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Supplier Name</label>
                  <input type="text" value={form.supplier_name}
                    onChange={e => set('supplier_name', e.target.value)}
                    placeholder="e.g. Ball Corporation" className={INPUT_PKG} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Contact Name</label>
                  <input type="text" value={form.supplier_contact_name}
                    onChange={e => set('supplier_contact_name', e.target.value)}
                    placeholder="Jane Smith" className={INPUT_PKG} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Phone</label>
                  <input type="tel" value={form.supplier_phone}
                    onChange={e => set('supplier_phone', e.target.value)}
                    placeholder="(555) 555-5555" className={INPUT_PKG} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Email</label>
                  <input type="email" value={form.supplier_email}
                    onChange={e => set('supplier_email', e.target.value)}
                    placeholder="orders@supplier.com" className={INPUT_PKG} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Website</label>
                  <input type="url" value={form.supplier_website}
                    onChange={e => set('supplier_website', e.target.value)}
                    placeholder="https://supplier.com" className={INPUT_PKG} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Account Number</label>
                  <input type="text" value={form.supplier_account_number}
                    onChange={e => set('supplier_account_number', e.target.value)}
                    placeholder="ACC-12345" className={INPUT_PKG} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Lead Time (days)</label>
                  <input type="number" min="0" value={form.supplier_lead_time_days}
                    onChange={e => set('supplier_lead_time_days', e.target.value)}
                    placeholder="e.g. 14" className={INPUT_PKG} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Min Order Quantity</label>
                  <input type="number" min="0" step="any" value={form.supplier_minimum_order_quantity}
                    onChange={e => set('supplier_minimum_order_quantity', e.target.value)}
                    placeholder="e.g. 500" className={INPUT_PKG} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Supplier Notes</label>
                <textarea value={form.supplier_notes}
                  onChange={e => set('supplier_notes', e.target.value)}
                  rows={2} className={INPUT_PKG}
                  placeholder="Lead time notes, ordering instructions, preferred contacts…" />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Material'}
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

// ─── Modal: Adjust Packaging Material Stock ───────────────────────────────────

const PKG_ADJUST_TYPES = [
  { value: 'received',         label: 'Received (add)',      sign:  1, txType: 'received'        },
  { value: 'used_in_packaging',label: 'Used in Packaging',   sign: -1, txType: 'used_in_packaging'},
  { value: 'adjustment',       label: 'Manual Adjustment',   sign:  1, txType: 'adjustment'       },
  { value: 'waste',            label: 'Waste / Disposal',    sign: -1, txType: 'waste'            },
]

function AdjustPackagingMaterialModal({ isOpen, material, breweryId, onClose, onSaved }) {
  const [adjType,  setAdjType]  = useState('received')
  const [quantity, setQuantity] = useState('')
  const [notes,    setNotes]    = useState('')
  const [txDate,   setTxDate]   = useState(new Date().toISOString().split('T')[0])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const currentQty  = parseFloat(material?.current_stock_quantity) || 0
  const qty         = parseFloat(quantity) || 0
  const typeInfo    = PKG_ADJUST_TYPES.find(t => t.value === adjType)
  const signedQty   = typeInfo ? typeInfo.sign * qty : qty

  useEffect(() => {
    if (!isOpen) return
    setAdjType('received'); setQuantity(''); setNotes('')
    setTxDate(new Date().toISOString().split('T')[0])
    setError('')
  }, [isOpen, material?.id])

  function previewNew() {
    if (!qty) return currentQty
    return Math.max(0, currentQty + signedQty)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!qty) { setError('Quantity is required.'); return }
    setSaving(true); setError('')

    const newQty = previewNew()

    const { error: matErr } = await supabase
      .from('packaging_materials')
      .update({ current_stock_quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', material.id)

    if (matErr) { setSaving(false); setError(matErr.message); return }

    await supabase.from('packaging_material_transactions').insert({
      brewery_id:       breweryId,
      material_id:      material.id,
      transaction_type: typeInfo?.txType ?? 'adjustment',
      quantity:         signedQty,
      notes:            notes.trim() || null,
      transaction_date: txDate,
    })

    setSaving(false)
    onSaved({ ...material, current_stock_quantity: newQty })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={`Adjust Stock — ${material?.name ?? ''}`}
      isDirty={!!quantity || !!notes}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-50 rounded-lg px-4 py-3 flex justify-between text-sm">
          <span className="text-gray-500">Current stock</span>
          <span className="font-semibold text-navy">
            {currentQty.toLocaleString()} {material?.stock_unit ?? 'units'}
          </span>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Adjustment Type</label>
          <div className="grid grid-cols-2 gap-2">
            {PKG_ADJUST_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setAdjType(t.value)}
                className={[
                  'px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left',
                  adjType === t.value
                    ? 'bg-amber/10 border-amber text-amber-dark'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">
            Quantity ({material?.stock_unit ?? 'units'})
          </label>
          <input
            type="number" min="0" step="any"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            placeholder="0"
            className={INPUT_PKG}
            autoFocus
          />
        </div>

        {qty > 0 && (
          <div className="bg-blue-50 rounded-lg px-4 py-2.5 text-sm text-blue-700 flex justify-between">
            <span>New stock level</span>
            <span className="font-semibold">
              {previewNew().toLocaleString()} {material?.stock_unit ?? 'units'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Date</label>
            <input
              type="date"
              value={txDate}
              onChange={e => setTxDate(e.target.value)}
              className={INPUT_PKG}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Notes</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
              className={INPUT_PKG}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !qty}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Adjustment'}
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

// ─── Tab 6: Supplier Intelligence ─────────────────────────────────────────────

// Distinct colors for chart lines — one per supplier, cycling if more than 8
const CHART_COLORS = ['#F59E0B', '#1E3A5F', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

function SupplierIntelligenceTab({ ingredients, transactions, purchaseOrders, breweryId }) {

  // ── Section 2 state ───────────────────────────────────────────────────────
  // ID of the ingredient whose price history is displayed in the chart
  const [selectedIngId,  setSelectedIngId]  = useState('')
  // Received transactions fetched on-demand for the selected ingredient
  const [priceHistory,   setPriceHistory]   = useState([])
  const [loadingChart,   setLoadingChart]   = useState(false)

  // ── Section 3 state ───────────────────────────────────────────────────────
  // How supplier rows are sorted within each ingredient group
  const [compSort, setCompSort] = useState('price')
  // When true, only show ingredients that have 2+ suppliers
  const [multiOnly, setMultiOnly] = useState(true)
  // ID of the supplier currently being set as preferred (shows a spinner)
  const [settingPreferred, setSettingPreferred] = useState(null)
  // Local copy of ingredients so is_preferred updates show instantly without a full reload
  const [localIngredients, setLocalIngredients] = useState(ingredients)

  // Keep localIngredients in sync whenever the parent reloads the data
  useEffect(() => setLocalIngredients(ingredients), [ingredients])

  // ── Section 5 state ───────────────────────────────────────────────────────
  // Global percentage threshold — alert fires when price rises by more than this
  const [globalThreshold, setGlobalThreshold] = useState(() => {
    try { return parseFloat(localStorage.getItem('supplier_price_alert_threshold')) || 10 }
    catch { return 10 }
  })
  // Per-ingredient threshold overrides stored as { ingredientId: number }
  const [perIngThresholds, setPerIngThresholds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('supplier_price_alert_per_ingredient') || '{}') }
    catch { return {} }
  })
  // State for the "Add Override" mini-form in Section 5
  const [overrideIngId, setOverrideIngId] = useState('')
  const [overrideValue, setOverrideValue] = useState('')

  // ── Active ingredient list ────────────────────────────────────────────────
  // All ingredients that have is_active = true
  const activeIngredients = useMemo(() =>
    localIngredients.filter(i => i.is_active),
  [localIngredients])

  // ── Section 1: Summary card computations ─────────────────────────────────

  // Count of distinct supplier names across all active ingredients (active suppliers only)
  const uniqueSupplierCount = useMemo(() => {
    const names = new Set()
    for (const ing of activeIngredients)
      for (const s of (ing.ingredient_suppliers ?? []))
        if (s.is_active !== false) names.add(s.supplier_name)
    return names.size
  }, [activeIngredients])

  // Number of active ingredients that have 2 or more active suppliers
  const multiSupplierCount = useMemo(() =>
    activeIngredients.filter(i =>
      (i.ingredient_suppliers ?? []).filter(s => s.is_active !== false).length >= 2
    ).length,
  [activeIngredients])

  // Average quality_rating across all suppliers; null when no ratings exist
  const avgQuality = useMemo(() => {
    const vals = []
    for (const ing of activeIngredients)
      for (const s of (ing.ingredient_suppliers ?? []))
        if (s.quality_rating != null) vals.push(s.quality_rating)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }, [activeIngredients])

  // Active ingredients that have zero supplier records on file
  const noSupplierCount = useMemo(() =>
    activeIngredients.filter(i =>
      (i.ingredient_suppliers ?? []).filter(s => s.is_active !== false).length === 0
    ).length,
  [activeIngredients])

  // ── Section 2: Fetch price history when user picks an ingredient ──────────

  useEffect(() => {
    if (!selectedIngId) { setPriceHistory([]); return }
    setLoadingChart(true)
    // Load every received transaction for this ingredient (no 200-row cap) so the full history shows
    supabase
      .from('inventory_transactions')
      .select('transaction_date, unit_cost, quantity, reference_name')
      .eq('brewery_id', breweryId)
      .eq('ingredient_id', selectedIngId)
      .eq('transaction_type', 'received')
      .not('unit_cost', 'is', null)
      .order('transaction_date', { ascending: true })
      .then(({ data }) => {
        setPriceHistory(data ?? [])
        setLoadingChart(false)
      })
  }, [selectedIngId, breweryId])

  // Build the recharts data array — one object per unique date, fields keyed by supplier name
  const chartData = useMemo(() => {
    if (!priceHistory.length) return []
    const byDate = new Map()
    for (const tx of priceHistory) {
      const sup = tx.reference_name ?? 'Direct'
      if (!byDate.has(tx.transaction_date)) byDate.set(tx.transaction_date, { date: tx.transaction_date })
      byDate.get(tx.transaction_date)[sup] = parseFloat(tx.unit_cost)
    }
    return [...byDate.values()]
  }, [priceHistory])

  // All distinct supplier identifiers seen in the loaded price history
  const chartSuppliers = useMemo(() =>
    [...new Set(priceHistory.map(t => t.reference_name ?? 'Direct'))],
  [priceHistory])

  // Per-supplier summary row: first price, latest price, % change, order count
  const priceSummary = useMemo(() => {
    if (!priceHistory.length) return []
    const bySupplier = new Map()
    for (const tx of priceHistory) {
      const sup = tx.reference_name ?? 'Direct'
      if (!bySupplier.has(sup)) bySupplier.set(sup, [])
      bySupplier.get(sup).push(tx)
    }
    return [...bySupplier.entries()].map(([name, txs]) => {
      const sorted     = [...txs].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
      const firstPrice = parseFloat(sorted[0].unit_cost)
      const lastPrice  = parseFloat(sorted[sorted.length - 1].unit_cost)
      const changePct  = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0
      return {
        name,
        firstPrice,
        lastPrice,
        changePct,
        count:    txs.length,
        lastDate: sorted[sorted.length - 1].transaction_date,
      }
    })
  }, [priceHistory])

  // ── Section 3: Price trend helper for the comparison table ───────────────

  // Returns ↑, ↓, or → based on the last 3 received transactions for this supplier + ingredient
  function getPriceTrend(supplierName, ingredientId) {
    const txs = transactions
      .filter(t =>
        t.ingredient_id === ingredientId &&
        t.transaction_type === 'received' &&
        t.unit_cost != null &&
        (t.reference_name ?? 'Direct') === supplierName
      )
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
      .slice(0, 3)
    if (txs.length < 2) return '→'
    const latest = parseFloat(txs[0].unit_cost)
    const oldest = parseFloat(txs[txs.length - 1].unit_cost)
    if (latest > oldest * 1.02) return '↑'
    if (latest < oldest * 0.98) return '↓'
    return '→'
  }

  // Marks a supplier as preferred for an ingredient; clears any previous preferred first
  async function handleSetPreferred(ingredientId, supplierId) {
    setSettingPreferred(supplierId)
    // Clear existing preferred flag for this ingredient
    await supabase.from('ingredient_suppliers')
      .update({ is_preferred: false })
      .eq('brewery_id', breweryId)
      .eq('ingredient_id', ingredientId)
    // Set the chosen supplier as preferred
    await supabase.from('ingredient_suppliers')
      .update({ is_preferred: true })
      .eq('id', supplierId)
    // Update local state immediately so the UI reflects the change without a full reload
    setLocalIngredients(prev => prev.map(ing =>
      ing.id !== ingredientId ? ing : {
        ...ing,
        ingredient_suppliers: (ing.ingredient_suppliers ?? []).map(s =>
          ({ ...s, is_preferred: s.id === supplierId })
        ),
      }
    ))
    setSettingPreferred(null)
  }

  // ── Section 4: Supplier performance rolled up from ingredient_suppliers + POs ──

  const supplierPerformance = useMemo(() => {
    // Build a map of supplier_name → aggregated stats
    const map = new Map()
    for (const ing of activeIngredients) {
      for (const s of (ing.ingredient_suppliers ?? [])) {
        if (s.is_active === false) continue
        if (!map.has(s.supplier_name)) {
          map.set(s.supplier_name, {
            name:          s.supplier_name,
            ingredients:   [],
            ratings:       [],
            contact_name:  s.contact_name  ?? null,
            contact_email: s.contact_email ?? null,
            contact_phone: s.contact_phone ?? null,
            orders:        [],
            totalSpend:    0,
            lastOrderDate: null,
          })
        }
        const entry = map.get(s.supplier_name)
        if (!entry.ingredients.includes(ing.name)) entry.ingredients.push(ing.name)
        if (s.quality_rating != null) entry.ratings.push(s.quality_rating)
      }
    }

    // Fold in purchase order data — match by supplier_name
    for (const po of purchaseOrders) {
      if (!map.has(po.supplier_name)) continue
      const entry = map.get(po.supplier_name)
      entry.orders.push(po)
      entry.totalSpend += parseFloat(po.total_order_cost ?? 0)
      if (!entry.lastOrderDate || po.order_date > entry.lastOrderDate) entry.lastOrderDate = po.order_date
    }

    return [...map.values()].map(s => {
      // On-time rate: orders where actual delivery was on or before expected
      const withDates = s.orders.filter(o => o.actual_delivery_date && o.expected_delivery_date)
      const onTime    = withDates.filter(o => o.actual_delivery_date <= o.expected_delivery_date)
      return {
        ...s,
        orderCount: s.orders.length,
        onTimeRate: withDates.length > 0 ? (onTime.length / withDates.length) * 100 : null,
        avgRating:  s.ratings.length   > 0 ? s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length : null,
      }
    }).sort((a, b) => b.totalSpend - a.totalSpend) // Sort by total spend descending
  }, [activeIngredients, purchaseOrders])

  // ── Section 5: Compute active price alerts ────────────────────────────────

  // Compare the last two received transactions per ingredient; alert when the increase exceeds threshold
  const priceAlerts = useMemo(() => {
    const alerts = []
    for (const ing of activeIngredients) {
      const received = transactions
        .filter(t => t.ingredient_id === ing.id && t.transaction_type === 'received' && t.unit_cost != null)
        .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
      if (received.length < 2) continue
      const latest   = parseFloat(received[0].unit_cost)
      const previous = parseFloat(received[1].unit_cost)
      if (!previous || !latest) continue
      const changePct = ((latest - previous) / previous) * 100
      const threshold = perIngThresholds[ing.id] ?? globalThreshold
      if (changePct > threshold) {
        alerts.push({
          name:      ing.name,
          previous,
          latest,
          changePct,
          supplier:  received[0].reference_name ?? 'Unknown supplier',
          unit:      ing.stock_unit ?? '',
        })
      }
    }
    return alerts.sort((a, b) => b.changePct - a.changePct)
  }, [activeIngredients, transactions, globalThreshold, perIngThresholds])

  // Persist the global threshold to localStorage whenever it changes
  function handleGlobalThreshold(val) {
    const num = Math.max(1, parseFloat(val) || 10)
    setGlobalThreshold(num)
    try { localStorage.setItem('supplier_price_alert_threshold', String(num)) } catch {}
  }

  // Add a per-ingredient override and save to localStorage
  function addOverride() {
    if (!overrideIngId || !overrideValue) return
    const num  = Math.max(1, parseFloat(overrideValue) || 10)
    const next = { ...perIngThresholds, [overrideIngId]: num }
    setPerIngThresholds(next)
    try { localStorage.setItem('supplier_price_alert_per_ingredient', JSON.stringify(next)) } catch {}
    setOverrideIngId('')
    setOverrideValue('')
  }

  // Remove a per-ingredient override and save to localStorage
  function removeOverride(ingId) {
    const { [ingId]: _removed, ...rest } = perIngThresholds
    setPerIngThresholds(rest)
    try { localStorage.setItem('supplier_price_alert_per_ingredient', JSON.stringify(rest)) } catch {}
  }

  // Format a numeric price to 4 decimal places with a $ prefix, or — if null
  function fmtPrice(val) {
    return val != null && val !== '' ? `$${parseFloat(val).toFixed(4)}` : '—'
  }

  // Render a star/empty-star string for a 1-5 quality rating
  function starRating(val) {
    if (val == null) return '—'
    const r = Math.round(val)
    return '★'.repeat(r) + '☆'.repeat(5 - r)
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10">

      {/* ══════════════════════════════════════════════════════════════════════
          Section 1 — Supplier Overview Dashboard
          ══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Supplier Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

          {/* Active supplier count */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-navy">{uniqueSupplierCount}</p>
            <p className="text-xs text-gray-500 mt-1">Active Suppliers</p>
          </div>

          {/* Total ingredients */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-navy">{activeIngredients.length}</p>
            <p className="text-xs text-gray-500 mt-1">Ingredients Tracked</p>
          </div>

          {/* Ingredients with 2+ suppliers */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber">{multiSupplierCount}</p>
            <p className="text-xs text-gray-500 mt-1">Multi-Supplier Ingredients</p>
          </div>

          {/* Average quality rating */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-navy">
              {avgQuality != null ? avgQuality.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Avg Quality Rating</p>
          </div>

          {/* Ingredients with no supplier — amber border when count > 0 */}
          <div className={`bg-white rounded-xl border p-4 text-center ${noSupplierCount > 0 ? 'border-amber' : 'border-gray-200'}`}>
            <p className={`text-2xl font-bold ${noSupplierCount > 0 ? 'text-amber' : 'text-gray-400'}`}>
              {noSupplierCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">No Supplier on Record</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Section 2 — Price Trend Analysis
          ══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Price Trend Analysis</h3>

        {/* Ingredient selector — picking an ingredient triggers the Supabase fetch */}
        <div className="mb-4">
          <select
            value={selectedIngId}
            onChange={e => setSelectedIngId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber w-full sm:w-80"
          >
            <option value="">Select an ingredient to view price trends…</option>
            {activeIngredients.map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>

        {selectedIngId && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-6">
            {loadingChart ? (
              <p className="text-sm text-gray-400 text-center py-10">Loading price history…</p>
            ) : chartData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">
                No price history yet — receive stock to start tracking price trends.
              </p>
            ) : (
              <>
                {/* Line chart: one line per supplier, X = date, Y = unit cost */}
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      tickFormatter={d => {
                        const dt = new Date(d + 'T00:00:00')
                        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      tickFormatter={v => `$${parseFloat(v).toFixed(2)}`}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value, name) => [`$${parseFloat(value).toFixed(4)}/unit`, name]}
                      labelFormatter={label => {
                        const dt = new Date(label + 'T00:00:00')
                        return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {/* Render one <Line> per unique supplier name */}
                    {chartSuppliers.map((sup, idx) => (
                      <Line
                        key={sup}
                        type="monotone"
                        dataKey={sup}
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* Price change summary table below the chart */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left pb-2">Supplier</th>
                        <th className="text-right pb-2">First Price</th>
                        <th className="text-right pb-2">Latest Price</th>
                        <th className="text-right pb-2">Change</th>
                        <th className="text-right pb-2 hidden sm:table-cell">Orders</th>
                        <th className="text-right pb-2 hidden md:table-cell">Last Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {priceSummary.map(row => (
                        <tr key={row.name}>
                          <td className="py-2.5 font-medium text-navy">{row.name}</td>
                          <td className="py-2.5 text-right text-gray-600">${row.firstPrice.toFixed(4)}</td>
                          <td className="py-2.5 text-right text-gray-600">${row.lastPrice.toFixed(4)}</td>
                          {/* Color: red for increase, green for decrease, amber for stable */}
                          <td className={`py-2.5 text-right font-semibold ${
                            row.changePct > 2  ? 'text-danger'  :
                            row.changePct < -2 ? 'text-success' : 'text-amber'
                          }`}>
                            {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 text-right text-gray-500 hidden sm:table-cell">{row.count}</td>
                          <td className="py-2.5 text-right text-gray-400 text-xs hidden md:table-cell">{row.lastDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Section 3 — Supplier Comparison Table
          ══════════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Supplier Comparison</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Sort select — applies to all ingredient comparison tables */}
            <select
              value={compSort}
              onChange={e => setCompSort(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber"
            >
              <option value="price">Sort: Lowest Price</option>
              <option value="quality">Sort: Highest Quality</option>
              <option value="lead_time">Sort: Fastest Lead Time</option>
            </select>
            {/* Toggle to filter to only ingredients with 2+ suppliers */}
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={multiOnly}
                onChange={e => setMultiOnly(e.target.checked)}
                className="rounded border-gray-300 accent-amber"
              />
              Only multi-supplier ingredients
            </label>
          </div>
        </div>

        {/* Determine which ingredients to render comparison tables for */}
        {(() => {
          const baseList = multiOnly
            ? activeIngredients.filter(i =>
                (i.ingredient_suppliers ?? []).filter(s => s.is_active !== false).length >= 2
              )
            : activeIngredients.filter(i =>
                (i.ingredient_suppliers ?? []).some(s => s.is_active !== false)
              )

          if (baseList.length === 0) {
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-400 text-sm">
                  {multiOnly
                    ? 'No ingredients have multiple suppliers yet. Add suppliers when editing an ingredient.'
                    : 'No suppliers on record yet.'}
                </p>
              </div>
            )
          }

          return (
            <div className="space-y-4">
              {baseList.map(ing => {
                // Get active suppliers and apply the selected sort
                let sups = (ing.ingredient_suppliers ?? []).filter(s => s.is_active !== false)
                if (compSort === 'price')
                  sups = [...sups].sort((a, b) =>
                    (parseFloat(a.price_per_unit) || Infinity) - (parseFloat(b.price_per_unit) || Infinity)
                  )
                else if (compSort === 'quality')
                  sups = [...sups].sort((a, b) => (b.quality_rating ?? 0) - (a.quality_rating ?? 0))
                else if (compSort === 'lead_time')
                  sups = [...sups].sort((a, b) =>
                    (a.lead_time_days ?? Infinity) - (b.lead_time_days ?? Infinity)
                  )

                return (
                  <div key={ing.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Ingredient header row */}
                    <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
                      <span className="font-semibold text-navy text-sm">{ing.name}</span>
                      {ing.category && (
                        <span className="text-[11px] bg-navy/10 text-navy px-1.5 py-0.5 rounded-full">{ing.category}</span>
                      )}
                    </div>
                    {/* Supplier rows — horizontally scrollable on mobile */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                            <th className="text-left px-4 py-2">Supplier</th>
                            <th className="text-right px-4 py-2">List Price</th>
                            <th className="text-right px-4 py-2 hidden sm:table-cell">Last Ordered</th>
                            <th className="text-right px-4 py-2 hidden md:table-cell">Shipping</th>
                            <th className="text-right px-4 py-2 hidden md:table-cell">Lead Time</th>
                            <th className="text-center px-4 py-2 hidden lg:table-cell">Quality</th>
                            <th className="text-right px-4 py-2 hidden lg:table-cell">Last Order Date</th>
                            <th className="text-center px-4 py-2 hidden sm:table-cell">Trend</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sups.map(sup => {
                            const trend      = getPriceTrend(sup.supplier_name, ing.id)
                            const trendColor = trend === '↑' ? 'text-danger' : trend === '↓' ? 'text-success' : 'text-gray-400'
                            return (
                              <tr
                                key={sup.id}
                                className={`hover:bg-gray-50 transition-colors ${sup.is_preferred ? 'bg-amber/5' : ''}`}
                              >
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-navy">{sup.supplier_name}</span>
                                    {sup.is_preferred && (
                                      <span className="text-[10px] bg-amber text-white px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
                                        Preferred
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-700">{fmtPrice(sup.price_per_unit)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-500 hidden sm:table-cell">{fmtPrice(sup.last_ordered_price)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-500 hidden md:table-cell">
                                  {sup.shipping_cost_per_order != null ? `$${parseFloat(sup.shipping_cost_per_order).toFixed(2)}` : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-500 hidden md:table-cell">
                                  {sup.lead_time_days != null ? `${sup.lead_time_days}d` : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-center text-amber text-xs hidden lg:table-cell">
                                  {starRating(sup.quality_rating)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-400 text-xs hidden lg:table-cell">
                                  {sup.last_ordered_date ?? '—'}
                                </td>
                                <td className={`px-4 py-2.5 text-center font-bold hidden sm:table-cell ${trendColor}`}>
                                  {trend}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {/* Only show "Set Preferred" when this supplier isn't already preferred */}
                                  {!sup.is_preferred && (
                                    <button
                                      onClick={() => handleSetPreferred(ing.id, sup.id)}
                                      disabled={settingPreferred === sup.id}
                                      className="text-xs text-gray-500 hover:text-navy border border-gray-200 hover:border-navy px-2 py-1 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                                    >
                                      {settingPreferred === sup.id ? 'Saving…' : 'Set Preferred'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Section 4 — Supplier Performance Dashboard
          ══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Supplier Performance</h3>

        {supplierPerformance.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">
              No suppliers on record yet. Add suppliers when editing an ingredient.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {supplierPerformance.map(sup => (
              <div key={sup.name} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">

                {/* Supplier name and contact info */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-navy">{sup.name}</h4>
                    {sup.contact_name  && <p className="text-xs text-gray-400 mt-0.5">{sup.contact_name}</p>}
                    {sup.contact_email && <p className="text-xs text-gray-400">{sup.contact_email}</p>}
                    {sup.contact_phone && <p className="text-xs text-gray-400">{sup.contact_phone}</p>}
                  </div>
                  {/* Total spend shown top-right when data exists */}
                  {sup.totalSpend > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-navy">${sup.totalSpend.toFixed(2)}</p>
                      <p className="text-xs text-gray-400">Total spend</p>
                    </div>
                  )}
                </div>

                {/* Ingredient tags — all ingredients this supplier provides */}
                <div className="flex flex-wrap gap-1">
                  {sup.ingredients.map(name => (
                    <span key={name} className="text-[11px] bg-navy/10 text-navy px-2 py-0.5 rounded-full">{name}</span>
                  ))}
                </div>

                {/* KPI grid: orders, on-time rate, quality, last order */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-xs">
                    <p className="text-gray-400 mb-0.5">Total Orders</p>
                    <p className="font-semibold text-navy">{sup.orderCount || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-xs">
                    <p className="text-gray-400 mb-0.5">On-Time Delivery</p>
                    <p className={`font-semibold ${
                      sup.onTimeRate == null ? 'text-gray-400' :
                      sup.onTimeRate >= 90   ? 'text-success'  :
                      sup.onTimeRate >= 70   ? 'text-amber'    : 'text-danger'
                    }`}>
                      {sup.onTimeRate != null ? `${sup.onTimeRate.toFixed(0)}%` : 'No data'}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-xs">
                    <p className="text-gray-400 mb-0.5">Avg Quality</p>
                    <p className="font-semibold text-amber">{starRating(sup.avgRating)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-xs">
                    <p className="text-gray-400 mb-0.5">Last Order</p>
                    <p className="font-semibold text-navy">{sup.lastOrderDate ?? '—'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          Section 5 — Price Alerts
          ══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Price Alerts</h3>

        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

          {/* Global threshold — one number that applies to all ingredients by default */}
          <div className="p-4">
            <p className="text-sm font-medium text-navy mb-2">Alert Threshold</p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-gray-600">Notify when any ingredient price increases by more than</label>
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                value={globalThreshold}
                onChange={e => handleGlobalThreshold(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-amber"
              />
              <span className="text-sm text-gray-600">% (global default)</span>
            </div>
          </div>

          {/* Per-ingredient overrides — allows tighter or looser thresholds per ingredient */}
          <div className="p-4 space-y-3">
            <p className="text-sm font-medium text-navy">Per-Ingredient Overrides</p>

            {/* List of active overrides with a remove button */}
            {Object.entries(perIngThresholds).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(perIngThresholds).map(([ingId, threshold]) => {
                  const ing = activeIngredients.find(i => i.id === ingId)
                  if (!ing) return null
                  return (
                    <div key={ingId} className="flex items-center gap-3 text-sm">
                      <span className="font-medium text-navy w-40 truncate">{ing.name}</span>
                      <span className="text-amber font-semibold">{threshold}%</span>
                      <button
                        onClick={() => removeOverride(ingId)}
                        className="text-xs text-gray-400 hover:text-danger transition-colors"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No per-ingredient overrides set.</p>
            )}

            {/* Add override form — ingredient dropdown + threshold input */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <select
                value={overrideIngId}
                onChange={e => setOverrideIngId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="">Select ingredient…</option>
                {/* Only show ingredients that don't already have an override */}
                {activeIngredients
                  .filter(i => !(i.id in perIngThresholds))
                  .map(i => <option key={i.id} value={i.id}>{i.name}</option>)
                }
              </select>
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                placeholder="e.g. 5"
                value={overrideValue}
                onChange={e => setOverrideValue(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-20 focus:outline-none focus:ring-2 focus:ring-amber"
              />
              <span className="text-xs text-gray-500">%</span>
              <button
                onClick={addOverride}
                disabled={!overrideIngId || !overrideValue}
                className="text-xs font-semibold bg-amber hover:bg-amber-dark text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Add Override
              </button>
            </div>
          </div>

          {/* Active alerts — ingredients whose latest receive price exceeded their threshold */}
          <div className="p-4">
            <p className="text-sm font-medium text-navy mb-2">
              Active Price Alerts
              {priceAlerts.length > 0 && (
                <span className="ml-2 text-xs bg-danger/10 text-danger px-2 py-0.5 rounded-full font-normal">
                  {priceAlerts.length}
                </span>
              )}
            </p>
            {priceAlerts.length === 0 ? (
              <p className="text-sm text-gray-400">
                No price alerts — all recent prices are within the configured threshold.
              </p>
            ) : (
              <div className="space-y-2">
                {priceAlerts.map((alert, i) => (
                  <div key={i} className="bg-amber/10 border border-amber/50 rounded-lg px-4 py-2.5 flex items-start gap-2.5">
                    <span className="text-amber shrink-0 mt-0.5">⚠</span>
                    <p className="text-sm text-amber-dark">
                      <span className="font-semibold">{alert.name}</span> price increased{' '}
                      <span className="font-bold">{alert.changePct.toFixed(1)}%</span> since last order
                      {' '}(from{' '}
                      <span className="font-medium">${alert.previous.toFixed(4)}</span> to{' '}
                      <span className="font-medium">${alert.latest.toFixed(4)}</span>
                      {alert.unit ? `/${alert.unit}` : ''})
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
  )
}

// ─── Shared form helpers ──────────────────────────────────────────────────────

// Labelled form field wrapper — keeps labels and inputs visually consistent
function Field({ label, tooltip, children }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
          {label}
          {tooltip && (
            <span className="text-gray-400 cursor-help" title={tooltip}>ⓘ</span>
          )}
        </label>
      )}
      {children}
    </div>
  )
}
