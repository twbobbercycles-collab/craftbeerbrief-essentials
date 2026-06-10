/**
 * EquipmentPage — Equipment & Assets Register with Maintenance Tracking.
 * Available to Operations and Full Suite subscribers (TierGate requiredTier='operations').
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import WorkflowWarningBanner from '../../components/WorkflowWarningBanner'
import { useModalDraft } from '../../hooks/useModalDraft'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSET_CATEGORIES = [
  'Brewhouse',
  'Fermentation & Conditioning',
  'Pumps & Transfer Equipment',
  'Glycol & Temperature Systems',
  'Gas Systems',
  'CIP & Cleaning Systems',
  'Packaging Equipment',
  'Taproom & Draft Systems',
  'Utilities & Infrastructure',
  'Material Handling',
  'Vehicles',
  'Lab Equipment',
  'Other',
]

const ASSET_TYPES = {
  'Brewhouse': ['Mash Tun', 'Lauter Tun', 'Mash/Lauter Tun (combined)', 'Brew Kettle', 'Whirlpool Tank', 'Brew Kettle/Whirlpool (combined)', 'Hot Liquor Tank (HLT)', 'Cold Liquor Tank (CLT)', 'Grant/Wort Grant', 'Grain Mill', 'Heat Exchanger', 'Steam Generator/Boiler', 'Electric Heating Element/Module'],
  'Fermentation & Conditioning': ['Conical Fermenter', 'Unitank', 'Open Fermenter', 'Brite/Conditioning Tank', 'Serving Tank (jacketed)', 'Yeast Propagation Tank', 'Yeast Brink/Harvesting Vessel', 'Sour Barrel/Foeder'],
  'Pumps & Transfer Equipment': ['Centrifugal Pump', 'Peristaltic Pump', 'Diaphragm Pump', 'Positive Displacement Pump', 'CIP Pump', 'Wort Transfer Pump', 'Yeast Transfer Pump', 'Portable Pump', 'Flow Meter', 'Inline DO Meter'],
  'Glycol & Temperature Systems': ['Glycol Chiller', 'Glycol Reservoir/Buffer Tank', 'Temperature Controller', 'Glycol Manifold'],
  'Gas Systems': ['CO2 Bulk Tank', 'CO2 Regulator System', 'Nitrogen Generator', 'Mixed Gas System (CO2/N2)', 'Carbonation Stone System', 'Spunding Valve'],
  'CIP & Cleaning Systems': ['CIP Station (automated)', 'CIP Cart (portable)', 'Keg Washer (automated)', 'Keg Washer (manual)', 'Bottle Washer', 'Chemical Dosing System'],
  'Packaging Equipment': ['Canning Line (complete)', 'Can Seamer', 'Can Filler', 'Bottle Filler', 'Bottle Capper/Corker', 'Labeler', 'Shrink Sleeve Applicator', 'Kegging Station', 'Keg Filler', 'Crowler Seamer', 'Packaging Conveyor'],
  'Taproom & Draft Systems': ['Draft System', 'Walk-in Cooler/Kegerator', 'Glycol-cooled Draft Tower', 'Glycol Power Pack (draft)', 'POS System', 'Glass Washer'],
  'Utilities & Infrastructure': ['Air Compressor', 'Water Softener', 'RO Water System', 'Water Filter System', 'Wastewater Treatment System', 'Electrical Panel/Subpanel', 'Generator', 'HVAC Unit'],
  'Material Handling': ['Forklift', 'Pallet Jack (electric)', 'Pallet Jack (manual)', 'Grain Conveyor/Auger', 'Spent Grain Bin/Silo', 'Hop Dosing System', 'Dry Hop Cannon/Canister'],
  'Vehicles': ['Delivery Truck (box truck)', 'Delivery Van', 'Pickup Truck', 'Refrigerated Vehicle'],
  'Lab Equipment': ['pH Meter', 'Dissolved Oxygen Meter', 'Turbidity Meter/Photometer', 'Microscope', 'Centrifuge (lab)', 'Autoclave/Sterilizer', 'Incubator', 'Spectrophotometer', 'CO2 Volume Meter'],
  'Other': ['Other Equipment'],
}

const MAINTENANCE_TYPES = [
  'Routine Cleaning',
  'Inspection',
  'Preventive Maintenance',
  'Repair',
  'Calibration',
  'Part Replacement',
  'Deep Clean',
  'Annual Service',
  'Warranty Service',
  'Other',
]

const FREQUENCY_OPTIONS = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Semi-Annual',
  'Annual',
  'Every X Days',
]

// Maps frequency label to number of days for auto-calculating next_due_date
const FREQUENCY_DAYS_MAP = {
  'Daily': 1,
  'Weekly': 7,
  'Monthly': 30,
  'Quarterly': 91,
  'Semi-Annual': 182,
  'Annual': 365,
}

const ASSET_STATUSES = ['Active', 'Out of Service', 'Retired', 'Sold']

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns number of days until a date string (negative if overdue, null if no date)
function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / 86400000)
}

// Returns 'overdue', 'due_soon', or 'ok' for schedule status coloring
function getScheduleStatus(nextDueDate) {
  const days = daysUntil(nextDueDate)
  if (days === null) return 'ok'
  if (days < 0) return 'overdue'
  if (days <= 30) return 'due_soon'
  return 'ok'
}

// Formats a date string as "Jan 15, 2025"
function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Adds days to a date string and returns the resulting date string
function addDaysToDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Page root ─────────────────────────────────────────────────────────────────
export default function EquipmentPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureName="Equipment & Assets Register"
      featureDescription="Track all of your brewery equipment, log maintenance history, and get alerts when service is due. Keep your assets running and your team on schedule."
    >
      <EquipmentPageInner />
    </TierGate>
  )
}

// ── Inner page component ──────────────────────────────────────────────────────
function EquipmentPageInner() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  // Data state
  const [assets, setAssets] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Tab state persisted to localStorage
  const [activeTab, setTab] = usePersistedTab('equipment_active_tab', 'registry')

  // Modal state — null means closed, object means open (possibly with prefill data)
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [detailAsset, setDetailAsset] = useState(null)
  const [logMaintenanceData, setLogMaintenanceData] = useState(null)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [prefillScheduleData, setPrefillScheduleData] = useState(null)
  const [editScheduleTarget, setEditScheduleTarget] = useState(null)

  useEffect(() => {
    if (!brewery?.id) return
    loadAll()
  }, [brewery?.id])

  // Loads all three tables in parallel
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    const [assetsRes, maintRes, schedsRes] = await Promise.all([
      supabase.from('equipment_assets')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('asset_name'),
      supabase.from('equipment_maintenance')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('maintenance_date', { ascending: false }),
      supabase.from('equipment_maintenance_schedules')
        .select('*')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true)
        .order('next_due_date', { ascending: true }),
    ])
    if (assetsRes.error) setError('Failed to load equipment data. Please refresh.')
    setAssets(assetsRes.data ?? [])
    setMaintenance(maintRes.data ?? [])
    setSchedules(schedsRes.data ?? [])
    setLoading(false)
  }, [brewery?.id])

  // Date strings used throughout the page
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysOut = addDaysToDate(today, 30)
  const ninetyDaysOut = addDaysToDate(today, 90)

  // Derived counts for summary cards and banners
  const activeAssetCount = useMemo(
    () => assets.filter(a => (a.status ?? 'active').toLowerCase() === 'active').length,
    [assets]
  )
  const warrantyExpiringSoon = useMemo(
    () => assets.filter(a => a.warranty_expiration_date && a.warranty_expiration_date >= today && a.warranty_expiration_date <= ninetyDaysOut).length,
    [assets, today, ninetyDaysOut]
  )
  const maintenanceOverdue = useMemo(
    () => schedules.filter(s => s.next_due_date && s.next_due_date < today).length,
    [schedules, today]
  )
  const maintenanceDueSoon = useMemo(
    () => schedules.filter(s => s.next_due_date && s.next_due_date >= today && s.next_due_date <= thirtyDaysOut).length,
    [schedules, today, thirtyDaysOut]
  )

  // Banner warnings for WorkflowWarningBanner
  const bannerWarnings = useMemo(() => {
    const w = []
    if (maintenanceOverdue > 0)
      w.push({ message: `${maintenanceOverdue} asset${maintenanceOverdue !== 1 ? 's have' : ' has'} overdue maintenance`, severity: 'required' })
    if (maintenanceDueSoon > 0)
      w.push({ message: `${maintenanceDueSoon} asset${maintenanceDueSoon !== 1 ? 's have' : ' has'} maintenance due within 30 days`, severity: 'recommended' })
    return w
  }, [maintenanceOverdue, maintenanceDueSoon])

  // Deletes an asset and all its records after confirmation
  async function handleDeleteAsset(asset) {
    if (!window.confirm(`Delete "${asset.asset_name}"? This will also remove all maintenance records and schedules for this asset. This cannot be undone.`)) return
    await supabase.from('equipment_assets').delete().eq('id', asset.id)
    if (detailAsset?.id === asset.id) setDetailAsset(null)
    await loadAll()
  }

  // Closes any open modal and refreshes data
  function handleModalSuccess() {
    setShowAddAsset(false)
    setEditingAsset(null)
    setLogMaintenanceData(null)
    setShowAddSchedule(false)
    setPrefillScheduleData(null)
    setEditScheduleTarget(null)
    loadAll()
  }

  if (loading) return <LoadingSpinner message="Loading equipment register…" />

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-navy">Equipment & Assets</h2>
        <p className="text-sm text-gray-500 mt-0.5">Track your brewery equipment, maintenance history, and upcoming service schedules.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Overdue/upcoming maintenance warnings */}
      <WorkflowWarningBanner warnings={bannerWarnings} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {[
          { key: 'registry', label: 'Asset Registry' },
          { key: 'log', label: 'Maintenance Log' },
          { key: 'schedules', label: 'Schedules & Alerts' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-amber text-amber'
                : 'border-transparent text-gray-500 hover:text-navy hover:border-gray-300'
            }`}
          >
            {tab.label}
            {/* Red or amber dot on Schedules tab when attention is needed */}
            {tab.key === 'schedules' && (maintenanceOverdue > 0 || maintenanceDueSoon > 0) && (
              <span className={`w-2 h-2 rounded-full shrink-0 ${maintenanceOverdue > 0 ? 'bg-danger' : 'bg-amber'}`} />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'registry' && (
        <AssetRegistryTab
          assets={assets}
          schedules={schedules}
          today={today}
          thirtyDaysOut={thirtyDaysOut}
          ninetyDaysOut={ninetyDaysOut}
          activeAssetCount={activeAssetCount}
          warrantyExpiringSoon={warrantyExpiringSoon}
          maintenanceOverdue={maintenanceOverdue}
          maintenanceDueSoon={maintenanceDueSoon}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          onAddAsset={() => setShowAddAsset(true)}
          onEditAsset={(a) => { setEditingAsset(a); setShowAddAsset(true) }}
          onDeleteAsset={handleDeleteAsset}
          onViewDetail={(a) => setDetailAsset(a)}
          onLogMaintenance={(a) => setLogMaintenanceData({ asset_id: a.id, assetName: a.asset_name })}
        />
      )}

      {activeTab === 'log' && (
        <MaintenanceLogTab
          assets={assets}
          maintenance={maintenance}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          onLogMaintenance={() => setLogMaintenanceData({})}
        />
      )}

      {activeTab === 'schedules' && (
        <SchedulesAlertsTab
          assets={assets}
          schedules={schedules}
          today={today}
          isReadOnly={isReadOnly}
          ReadOnlyTooltip={ReadOnlyTooltip}
          onAddSchedule={() => { setPrefillScheduleData(null); setEditScheduleTarget(null); setShowAddSchedule(true) }}
          onEditSchedule={(sched) => { setEditScheduleTarget(sched); setShowAddSchedule(true) }}
          onMarkComplete={(sched) => {
            const asset = assets.find(a => a.id === sched.asset_id)
            setLogMaintenanceData({
              asset_id: sched.asset_id,
              assetName: asset?.asset_name ?? '',
              maintenance_type: sched.maintenance_type,
              scheduleId: sched.id,
              frequencyDays: sched.frequency_days ?? (FREQUENCY_DAYS_MAP[sched.frequency] ?? null),
            })
          }}
          onDeleteSchedule={async (id) => {
            if (!window.confirm('Delete this maintenance schedule?')) return
            await supabase.from('equipment_maintenance_schedules').delete().eq('id', id)
            loadAll()
          }}
        />
      )}

      {/* ── Modals ── */}

      {showAddAsset && (
        <AddAssetModal
          breweryId={brewery.id}
          editAsset={editingAsset}
          onClose={() => { setShowAddAsset(false); setEditingAsset(null) }}
          onSuccess={handleModalSuccess}
        />
      )}

      {detailAsset && (
        <AssetDetailModal
          asset={assets.find(a => a.id === detailAsset.id) ?? detailAsset}
          maintenance={maintenance.filter(m => m.asset_id === detailAsset.id)}
          schedules={schedules.filter(s => s.asset_id === detailAsset.id)}
          today={today}
          onClose={() => setDetailAsset(null)}
          onEdit={() => { setEditingAsset(detailAsset); setDetailAsset(null); setShowAddAsset(true) }}
          onLogMaintenance={() => {
            setLogMaintenanceData({ asset_id: detailAsset.id, assetName: detailAsset.asset_name })
            setDetailAsset(null)
          }}
          onEditSchedule={(sched) => { setEditScheduleTarget(sched); setDetailAsset(null); setShowAddSchedule(true) }}
        />
      )}

      {logMaintenanceData !== null && (
        <LogMaintenanceModal
          breweryId={brewery.id}
          assets={assets}
          prefill={logMaintenanceData}
          onClose={() => setLogMaintenanceData(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {showAddSchedule && (
        <AddScheduleModal
          breweryId={brewery.id}
          assets={assets}
          prefill={prefillScheduleData}
          editSchedule={editScheduleTarget}
          onClose={() => { setShowAddSchedule(false); setPrefillScheduleData(null); setEditScheduleTarget(null) }}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}

// ── Tab 1: Asset Registry ─────────────────────────────────────────────────────
function AssetRegistryTab({
  assets, schedules, today, thirtyDaysOut, ninetyDaysOut,
  activeAssetCount, warrantyExpiringSoon, maintenanceOverdue, maintenanceDueSoon,
  isReadOnly, ReadOnlyTooltip,
  onAddAsset, onEditAsset, onDeleteAsset, onViewDetail, onLogMaintenance,
}) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Build a lookup: asset_id → next_due_date from the schedule with the earliest upcoming due date
  const nextDueLookup = useMemo(() => {
    const map = {}
    for (const s of schedules) {
      if (!s.next_due_date) continue
      if (!map[s.asset_id] || s.next_due_date < map[s.asset_id]) {
        map[s.asset_id] = s.next_due_date
      }
    }
    return map
  }, [schedules])

  // Filter assets by search text, category, and status
  const filtered = useMemo(() => {
    let list = assets
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.asset_name?.toLowerCase().includes(q) ||
        a.asset_type?.toLowerCase().includes(q) ||
        a.manufacturer?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q)
      )
    }
    if (catFilter !== 'all') list = list.filter(a => a.asset_category === catFilter)
    if (statusFilter !== 'all') list = list.filter(a => (a.status ?? 'active').toLowerCase() === statusFilter.toLowerCase())
    return list
  }, [assets, search, catFilter, statusFilter])

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total active assets</p>
          <p className="text-2xl font-bold text-navy">{activeAssetCount}</p>
        </div>
        <div className={`rounded-xl border p-4 ${warrantyExpiringSoon > 0 ? 'bg-amber/10 border-amber' : 'bg-white border-gray-200'}`}>
          <p className="text-xs text-gray-500 mb-1">Warranty expiring (90d)</p>
          <p className={`text-2xl font-bold ${warrantyExpiringSoon > 0 ? 'text-amber-dark' : 'text-navy'}`}>{warrantyExpiringSoon}</p>
        </div>
        <div className={`rounded-xl border p-4 ${maintenanceDueSoon > 0 ? 'bg-amber/10 border-amber' : 'bg-white border-gray-200'}`}>
          <p className="text-xs text-gray-500 mb-1">Maintenance due (30d)</p>
          <p className={`text-2xl font-bold ${maintenanceDueSoon > 0 ? 'text-amber-dark' : 'text-navy'}`}>{maintenanceDueSoon}</p>
        </div>
        <div className={`rounded-xl border p-4 ${maintenanceOverdue > 0 ? 'bg-red-50 border-danger' : 'bg-white border-gray-200'}`}>
          <p className="text-xs text-gray-500 mb-1">Maintenance overdue</p>
          <p className={`text-2xl font-bold ${maintenanceOverdue > 0 ? 'text-danger' : 'text-navy'}`}>{maintenanceOverdue}</p>
        </div>
      </div>

      {/* Filter bar and Add button */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search assets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber w-48"
        />
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          <option value="all">All Categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="out of service">Out of Service</option>
          <option value="retired">Retired</option>
        </select>
        <div className="flex-1" />
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={onAddAsset}
            disabled={isReadOnly}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            + Add Asset
          </button>
        </ReadOnlyTooltip>
      </div>

      {/* Asset cards grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">🔧</p>
          <p className="text-sm">
            {assets.length === 0 ? 'No assets yet — add your first piece of equipment.' : 'No assets match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(asset => {
            const nextDue = nextDueLookup[asset.id] ?? null
            const nextDueDays = daysUntil(nextDue)
            const statusLower = (asset.status ?? 'active').toLowerCase()
            const warrantyDays = daysUntil(asset.warranty_expiration_date)

            return (
              <div key={asset.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                {/* Name and status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-navy text-sm leading-snug">{asset.asset_name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded-full font-medium">{asset.asset_category}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{asset.asset_type}</span>
                    </div>
                  </div>
                  {/* Status badge */}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                    statusLower === 'active'
                      ? 'bg-green-100 text-green-700'
                      : statusLower === 'out of service'
                      ? 'bg-amber/20 text-amber-dark'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {asset.status ?? 'Active'}
                  </span>
                </div>

                {/* Asset details */}
                <div className="space-y-1 text-xs text-gray-600">
                  {(asset.manufacturer || asset.model_number) && (
                    <p>{[asset.manufacturer, asset.model_number].filter(Boolean).join(' · ')}</p>
                  )}
                  {asset.location && <p>📍 {asset.location}</p>}
                  {asset.purchase_date && (
                    <p>Purchased: {fmtDate(asset.purchase_date)}
                      {asset.purchase_price ? ` · $${parseFloat(asset.purchase_price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : ''}
                    </p>
                  )}
                  {/* Warranty expiration — amber if within 90d, red if expired */}
                  {asset.warranty_expiration_date && (
                    <p className={
                      warrantyDays !== null && warrantyDays < 0 ? 'text-danger font-medium' :
                      warrantyDays !== null && warrantyDays <= 90 ? 'text-amber-dark font-medium' : ''
                    }>
                      Warranty: {fmtDate(asset.warranty_expiration_date)}
                      {warrantyDays !== null && warrantyDays < 0 ? ' ⚠ Expired' :
                       warrantyDays !== null && warrantyDays <= 90 ? ` (${warrantyDays}d left)` : ''}
                    </p>
                  )}
                  {/* Next scheduled maintenance */}
                  {nextDue ? (
                    <p className={
                      nextDueDays !== null && nextDueDays < 0 ? 'text-danger font-medium' :
                      nextDueDays !== null && nextDueDays <= 30 ? 'text-amber-dark font-medium' : ''
                    }>
                      Next service: {fmtDate(nextDue)}
                      {nextDueDays !== null && nextDueDays < 0 ? ' ⚠ Overdue' :
                       nextDueDays !== null && nextDueDays <= 30 ? ` (${nextDueDays}d)` : ''}
                    </p>
                  ) : (
                    <p className="text-gray-400">No maintenance scheduled</p>
                  )}
                  {asset.vendor_name && <p>Vendor: {asset.vendor_name}</p>}
                  {Array.isArray(asset.contacts) && asset.contacts[0]?.name && (
                    <p className="text-gray-500">Contact: {asset.contacts[0].name}{asset.contacts[0].phone ? ` · ${asset.contacts[0].phone}` : ''}</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                  <button onClick={() => onViewDetail(asset)}
                    className="text-xs text-navy font-medium hover:underline">
                    View Details
                  </button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => onLogMaintenance(asset)}
                    className="text-xs text-amber font-medium hover:underline">
                    Log Maintenance
                  </button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => onEditAsset(asset)}
                    className="text-xs text-gray-500 hover:underline">
                    Edit
                  </button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => onDeleteAsset(asset)}
                    className="text-xs text-danger hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Maintenance Log ────────────────────────────────────────────────────
function MaintenanceLogTab({ assets, maintenance, isReadOnly, ReadOnlyTooltip, onLogMaintenance }) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')

  // Map asset_id → asset for quick lookups
  const assetMap = useMemo(() => {
    const m = {}
    for (const a of assets) m[a.id] = a
    return m
  }, [assets])

  // Apply filters and sort
  const filtered = useMemo(() => {
    let list = maintenance.map(m => ({ ...m, _asset: assetMap[m.asset_id] }))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m._asset?.asset_name?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.performed_by?.toLowerCase().includes(q)
      )
    }
    if (catFilter !== 'all') list = list.filter(m => m._asset?.asset_category === catFilter)
    if (typeFilter !== 'all') list = list.filter(m => m.maintenance_type === typeFilter)
    if (dateFrom) list = list.filter(m => m.maintenance_date >= dateFrom)
    if (dateTo)   list = list.filter(m => m.maintenance_date <= dateTo)

    list = [...list].sort((a, b) => {
      if (sortBy === 'date_desc') return b.maintenance_date.localeCompare(a.maintenance_date)
      if (sortBy === 'date_asc')  return a.maintenance_date.localeCompare(b.maintenance_date)
      if (sortBy === 'asset')     return (a._asset?.asset_name ?? '').localeCompare(b._asset?.asset_name ?? '')
      if (sortBy === 'next_due')  return (a.next_maintenance_date ?? '9999').localeCompare(b.next_maintenance_date ?? '9999')
      return 0
    })
    return list
  }, [maintenance, assetMap, search, catFilter, typeFilter, dateFrom, dateTo, sortBy])

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search asset or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber w-52"
        />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="all">All Categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="all">All Types</option>
          {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
          placeholder="From" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
          placeholder="To" />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="date_desc">Most Recent</option>
          <option value="date_asc">Oldest First</option>
          <option value="asset">Asset Name</option>
          <option value="next_due">Next Due Date</option>
        </select>
        <div className="flex-1" />
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button onClick={onLogMaintenance} disabled={isReadOnly}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            + Log Action
          </button>
        </ReadOnlyTooltip>
      </div>

      {/* Maintenance log table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">{maintenance.length === 0 ? 'No maintenance logged yet.' : 'No records match your filters.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Asset</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Performed By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy">{m._asset?.asset_name ?? '—'}</p>
                    {m._asset?.asset_category && (
                      <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded-full">{m._asset.asset_category}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] bg-amber/10 text-amber-dark px-1.5 py-0.5 rounded-full font-medium">{m.maintenance_type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(m.maintenance_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{m.performed_by ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs">
                    <p className="truncate">{m.description}</p>
                    {m.parts_replaced && <p className="text-xs text-gray-400 truncate">Parts: {m.parts_replaced}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {m.cost != null ? `$${parseFloat(m.cost).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {m.maintenance_type === 'Inspection' ? (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        m.passed !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-danger'
                      }`}>
                        {m.passed !== false ? 'Pass' : 'Fail'}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(m.next_maintenance_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Schedules & Alerts ─────────────────────────────────────────────────
function SchedulesAlertsTab({ assets, schedules, today, isReadOnly, ReadOnlyTooltip, onAddSchedule, onEditSchedule, onMarkComplete, onDeleteSchedule }) {
  // Map asset_id → asset for quick lookups
  const assetMap = useMemo(() => {
    const m = {}
    for (const a of assets) m[a.id] = a
    return m
  }, [assets])

  // Attach asset info to each schedule
  const schedulesWithAsset = useMemo(() =>
    schedules.map(s => ({ ...s, _asset: assetMap[s.asset_id] }))
  , [schedules, assetMap])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">Upcoming maintenance sorted by next due date. Red = overdue, amber = due within 30 days, green = on track.</p>
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button onClick={onAddSchedule} disabled={isReadOnly}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            + Add Schedule
          </button>
        </ReadOnlyTooltip>
      </div>

      {schedulesWithAsset.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📅</p>
          <p className="text-sm">No maintenance schedules yet. Add a schedule to track recurring service needs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Asset</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Frequency</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Performed</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Days Until Due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedulesWithAsset.map(s => {
                const days = daysUntil(s.next_due_date)
                const status = getScheduleStatus(s.next_due_date)
                return (
                  <tr key={s.id} className={`${
                    status === 'overdue' ? 'bg-red-50' : status === 'due_soon' ? 'bg-amber/5' : ''
                  }`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">{s._asset?.asset_name ?? '—'}</p>
                      {s._asset?.asset_category && (
                        <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded-full">{s._asset.asset_category}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] bg-amber/10 text-amber-dark px-1.5 py-0.5 rounded-full font-medium">{s.maintenance_type}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.frequency === 'Every X Days' && s.frequency_days
                        ? `Every ${s.frequency_days} days`
                        : s.frequency}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.last_performed_date)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.next_due_date)}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      {days === null ? '—' : days < 0 ? (
                        <span className="text-danger">{Math.abs(days)}d overdue</span>
                      ) : (
                        <span className={days <= 30 ? 'text-amber-dark' : 'text-success'}>{days}d</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        status === 'overdue' ? 'bg-red-100 text-danger' :
                        status === 'due_soon' ? 'bg-amber/20 text-amber-dark' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {status === 'overdue' ? 'Overdue' : status === 'due_soon' ? 'Due Soon' : 'On Track'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        <button onClick={() => onMarkComplete(s)}
                          className="text-xs text-amber font-medium hover:underline whitespace-nowrap">
                          Mark Complete
                        </button>
                        <button onClick={() => onEditSchedule(s)} title="Edit schedule"
                          className="text-gray-400 hover:text-navy transition-colors">
                          ✏️
                        </button>
                        <button onClick={() => onDeleteSchedule(s.id)}
                          className="text-xs text-danger hover:underline">
                          Delete
                        </button>
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

// ── Modal: Add / Edit Asset ───────────────────────────────────────────────────
function AddAssetModal({ breweryId, editAsset, onClose, onSuccess }) {
  const draft = useModalDraft('modal_draft_add_asset')
  const isEdit = !!editAsset

  const EMPTY_FORM = {
    asset_name: '', asset_category: 'Brewhouse', asset_type: '', status: 'Active',
    location: '', capacity_specs: '',
    manufacturer: '', model_number: '', serial_number: '',
    purchase_date: '', purchase_price: '', warranty_expiration_date: '',
    vendor_name: '',
    notes: '',
  }
  const EMPTY_CONTACT = { name: '', title: '', phone: '', email: '' }

  // Read the saved draft once for initialization (avoid calling loadDraft twice)
  const savedDraft = (() => {
    if (isEdit) return null
    try {
      const raw = sessionStorage.getItem('modal_draft_add_asset')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()

  const [form, setForm] = useState(() => {
    if (isEdit) return { ...EMPTY_FORM, ...editAsset, status: editAsset.status ?? 'Active' }
    if (savedDraft) { draft.loadDraft() }  // trigger the draft-restored banner
    return savedDraft ?? EMPTY_FORM
  })

  // Contacts are stored separately from the flat form fields
  const [contacts, setContacts] = useState(() => {
    if (isEdit) {
      const c = editAsset.contacts
      return Array.isArray(c) && c.length > 0 ? c : [{ ...EMPTY_CONTACT }]
    }
    return savedDraft?.contacts ?? [{ ...EMPTY_CONTACT }]
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Persist form + contacts to draft on every change (skip in edit mode)
  useEffect(() => {
    if (!isEdit) draft.saveDraft({ ...form, contacts })
  }, [form, contacts])

  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_FORM) || contacts.some(c => c.name || c.phone || c.email)

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'asset_category') next.asset_type = ''
      return next
    })
  }

  function addContact() {
    setContacts(prev => [...prev, { ...EMPTY_CONTACT }])
  }
  function updateContact(index, field, value) {
    setContacts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }
  function removeContact(index) {
    setContacts(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!form.asset_name.trim()) return setError('Asset name is required.')
    if (!form.asset_type) return setError('Asset type is required.')
    setError('')
    setSaving(true)

    // Strip blank contacts before saving
    const cleanContacts = contacts.filter(c => c.name.trim() || c.phone.trim() || c.email.trim())

    const payload = {
      brewery_id:               breweryId,
      asset_name:               form.asset_name.trim(),
      asset_category:           form.asset_category,
      asset_type:               form.asset_type,
      status:                   form.status,
      location:                 form.location.trim() || null,
      capacity_specs:           form.capacity_specs.trim() || null,
      manufacturer:             form.manufacturer.trim() || null,
      model_number:             form.model_number.trim() || null,
      serial_number:            form.serial_number.trim() || null,
      purchase_date:            form.purchase_date || null,
      purchase_price:           form.purchase_price ? parseFloat(form.purchase_price) : null,
      warranty_expiration_date: form.warranty_expiration_date || null,
      vendor_name:              form.vendor_name.trim() || null,
      contacts:                 cleanContacts,
      notes:                    form.notes.trim() || null,
    }

    let res
    if (isEdit) {
      res = await supabase.from('equipment_assets').update(payload).eq('id', editAsset.id)
    } else {
      res = await supabase.from('equipment_assets').insert(payload)
    }

    setSaving(false)
    if (res.error) return setError(res.error.message)
    draft.clearDraft()
    onSuccess()
  }

  const typeOptions = ASSET_TYPES[form.asset_category] ?? ['Other Equipment']

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit: ${editAsset.asset_name}` : 'Add Asset'}
      isDirty={isDirty && !isEdit}
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 pb-2">
        {error && <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-3 py-2">{error}</p>}

        {/* Section 1: Asset Information */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Asset Information</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Asset Name <span className="text-danger">*</span></label>
              <input type="text" value={form.asset_name} onChange={e => set('asset_name', e.target.value)}
                placeholder="e.g. 15 bbl Fermenter #3"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Asset Category <span className="text-danger">*</span></label>
                <select value={form.asset_category} onChange={e => set('asset_category', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
                  {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Asset Type <span className="text-danger">*</span></label>
                <select value={form.asset_type} onChange={e => set('asset_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
                  <option value="">Select type…</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
                  {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Location in Brewery</label>
                <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
                  placeholder="e.g. Fermentation Room"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Capacity / Specs</label>
              <input type="text" value={form.capacity_specs} onChange={e => set('capacity_specs', e.target.value)}
                placeholder='e.g. "15 bbl", "2 HP", "120V 20A"'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </div>
          </div>
        </div>

        {/* Section 2: Purchase & Warranty */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Purchase & Warranty</p>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Manufacturer</label>
                <input type="text" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Model Number</label>
                <input type="text" value={form.model_number} onChange={e => set('model_number', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
              <input type="text" value={form.serial_number} onChange={e => set('serial_number', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Date</label>
                <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Price ($)</label>
                <input type="number" min="0" step="0.01" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Warranty Expiration</label>
                <input type="date" value={form.warranty_expiration_date} onChange={e => set('warranty_expiration_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Vendor / Contacts */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Vendor / Contacts</p>
          <div className="space-y-3">
            {/* Vendor company name — standalone field */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vendor / Supplier Name</label>
              <input type="text" value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)}
                placeholder="e.g. ABE Equipment, North Star Equipment"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            </div>

            {/* Multi-contact list */}
            <div className="space-y-3">
              {contacts.map((contact, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">
                      {idx === 0 ? 'Primary Contact' : `Contact ${idx + 1}`}
                    </span>
                    {contacts.length > 1 && (
                      <button type="button" onClick={() => removeContact(idx)}
                        className="text-xs text-danger hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Name</label>
                      <input type="text" value={contact.name} onChange={e => updateContact(idx, 'name', e.target.value)}
                        placeholder="Full name"
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Title / Role</label>
                      <input type="text" value={contact.title} onChange={e => updateContact(idx, 'title', e.target.value)}
                        placeholder="e.g. Sales Rep, Service Tech"
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Phone</label>
                      <input type="tel" value={contact.phone} onChange={e => updateContact(idx, 'phone', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Email</label>
                      <input type="email" value={contact.email} onChange={e => updateContact(idx, 'email', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addContact}
                className="text-xs text-amber font-semibold hover:underline flex items-center gap-1">
                + Add Contact
              </button>
            </div>
          </div>
        </div>

        {/* Section 4: Notes */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notes</p>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Any additional notes about this asset…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Asset'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Modal: Asset Detail View ──────────────────────────────────────────────────
function AssetDetailModal({ asset, maintenance, schedules, today, onClose, onEdit, onLogMaintenance, onEditSchedule }) {
  const [subTab, setSubTab] = useState('overview')

  const nextDue = schedules.reduce((best, s) => {
    if (!s.next_due_date) return best
    return !best || s.next_due_date < best ? s.next_due_date : best
  }, null)

  return (
    <ModalShell isOpen onClose={onClose} title={asset.asset_name} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Sub-tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'history', label: `Maintenance History (${maintenance.length})` },
            { key: 'schedules', label: `Schedules (${schedules.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                subTab === t.key ? 'border-amber text-amber' : 'border-transparent text-gray-500 hover:text-navy'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview sub-tab */}
        {subTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Category" value={asset.asset_category} />
              <Field label="Type" value={asset.asset_type} />
              <Field label="Status" value={asset.status ?? 'Active'} />
              <Field label="Location" value={asset.location} />
              <Field label="Capacity/Specs" value={asset.capacity_specs} />
              <Field label="Next Scheduled Service" value={fmtDate(nextDue)} />
              <Field label="Manufacturer" value={asset.manufacturer} />
              <Field label="Model Number" value={asset.model_number} />
              <Field label="Serial Number" value={asset.serial_number} />
              <Field label="Purchase Date" value={fmtDate(asset.purchase_date)} />
              <Field label="Purchase Price" value={asset.purchase_price ? `$${parseFloat(asset.purchase_price).toLocaleString()}` : null} />
              <Field label="Warranty Expiration" value={fmtDate(asset.warranty_expiration_date)} />
              <Field label="Vendor" value={asset.vendor_name} />
            </div>
            {/* Contacts list */}
            {Array.isArray(asset.contacts) && asset.contacts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Contacts</p>
                <div className="space-y-2">
                  {asset.contacts.map((c, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <p className="font-medium text-gray-800">{c.name}{c.title ? <span className="font-normal text-gray-500"> · {c.title}</span> : null}</p>
                      {c.phone && <p className="text-gray-600">{c.phone}</p>}
                      {c.email && <p className="text-gray-600">{c.email}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {asset.notes && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{asset.notes}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={onEdit}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Edit Asset
              </button>
              <button onClick={onLogMaintenance}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                Log Maintenance
              </button>
            </div>
          </div>
        )}

        {/* Maintenance history sub-tab */}
        {subTab === 'history' && (
          <div>
            {maintenance.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No maintenance records for this asset.</p>
            ) : (
              <div className="space-y-3">
                {maintenance.map(m => (
                  <div key={m.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-navy">{m.maintenance_type}</span>
                      <span className="text-gray-400 text-xs">{fmtDate(m.maintenance_date)}</span>
                    </div>
                    <p className="text-gray-700">{m.description}</p>
                    {m.performed_by && <p className="text-xs text-gray-500 mt-1">By: {m.performed_by}</p>}
                    {m.parts_replaced && <p className="text-xs text-gray-500">Parts: {m.parts_replaced}</p>}
                    {m.cost != null && <p className="text-xs text-gray-500">Cost: ${parseFloat(m.cost).toFixed(2)}</p>}
                    {m.maintenance_type === 'Inspection' && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                        m.passed !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-danger'
                      }`}>
                        {m.passed !== false ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Schedules sub-tab */}
        {subTab === 'schedules' && (
          <div>
            {schedules.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No maintenance schedules for this asset.</p>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => {
                  const days = daysUntil(s.next_due_date)
                  const status = getScheduleStatus(s.next_due_date)
                  return (
                    <div key={s.id} className={`border rounded-lg p-3 text-sm ${
                      status === 'overdue' ? 'border-danger bg-red-50' :
                      status === 'due_soon' ? 'border-amber bg-amber/5' :
                      'border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-navy">{s.maintenance_type}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => onEditSchedule(s)} title="Edit schedule"
                            className="text-gray-400 hover:text-navy transition-colors text-xs">
                            ✏️
                          </button>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            status === 'overdue' ? 'bg-red-100 text-danger' :
                            status === 'due_soon' ? 'bg-amber/20 text-amber-dark' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {status === 'overdue' ? 'Overdue' : status === 'due_soon' ? 'Due Soon' : 'On Track'}
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-600 mt-1">
                        {s.frequency === 'Every X Days' && s.frequency_days ? `Every ${s.frequency_days} days` : s.frequency}
                        {' · '} Next due: {fmtDate(s.next_due_date)}
                        {days !== null && days < 0 && ` (${Math.abs(days)}d overdue)`}
                        {days !== null && days >= 0 && ` (${days}d)`}
                      </p>
                      {s.last_performed_date && <p className="text-xs text-gray-500 mt-0.5">Last performed: {fmtDate(s.last_performed_date)}</p>}
                      {s.notes && <p className="text-xs text-gray-400 mt-0.5">{s.notes}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// Small read-only field display used in AssetDetailModal overview
function Field({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-navy font-medium">{value}</p>
    </div>
  )
}

// ── Modal: Log Maintenance ────────────────────────────────────────────────────
function LogMaintenanceModal({ breweryId, assets, prefill = {}, onClose, onSuccess }) {
  const draft = useModalDraft('modal_draft_log_maintenance')
  const todayStr = new Date().toISOString().slice(0, 10)

  const EMPTY_FORM = {
    asset_id: prefill.asset_id ?? '',
    maintenance_type: prefill.maintenance_type ?? '',
    maintenance_date: todayStr,
    performed_by: '',
    description: '',
    parts_replaced: '',
    cost: '',
    passed: true,
    next_maintenance_date: '',
    notes: '',
  }

  const [form, setForm] = useState(() => {
    // Only restore draft if there's no prefill (prefill means triggered from a schedule)
    if (!prefill.asset_id && !prefill.maintenance_type) {
      const saved = draft.loadDraft()
      return saved ?? EMPTY_FORM
    }
    return EMPTY_FORM
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Save draft on change (only when not pre-filled from schedule)
  useEffect(() => {
    if (!prefill.scheduleId) draft.saveDraft(form)
  }, [form])

  const isDirty = form.description.trim().length > 0 || form.performed_by.trim().length > 0

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.asset_id) return setError('Please select an asset.')
    if (!form.maintenance_type) return setError('Please select a maintenance type.')
    if (!form.description.trim()) return setError('Description is required.')
    setError('')
    setSaving(true)

    // Insert the maintenance log record
    const { error: insertErr } = await supabase.from('equipment_maintenance').insert({
      brewery_id:           breweryId,
      asset_id:             form.asset_id,
      maintenance_type:     form.maintenance_type,
      maintenance_date:     form.maintenance_date,
      performed_by:         form.performed_by.trim() || null,
      description:          form.description.trim(),
      parts_replaced:       form.parts_replaced.trim() || null,
      cost:                 form.cost ? parseFloat(form.cost) : null,
      passed:               form.passed,
      next_maintenance_date: form.next_maintenance_date || null,
      notes:                form.notes.trim() || null,
    })

    if (insertErr) { setSaving(false); return setError(insertErr.message) }

    // If triggered from a schedule, update last_performed_date and next_due_date
    if (prefill.scheduleId) {
      let nextDue = form.next_maintenance_date || null
      if (!nextDue && prefill.frequencyDays) {
        nextDue = addDaysToDate(form.maintenance_date, prefill.frequencyDays)
      }
      await supabase.from('equipment_maintenance_schedules').update({
        last_performed_date: form.maintenance_date,
        next_due_date: nextDue,
      }).eq('id', prefill.scheduleId)
    }

    setSaving(false)
    draft.clearDraft()
    onSuccess()
  }

  const activeAssets = assets.filter(a => (a.status ?? 'active').toLowerCase() !== 'retired' && (a.status ?? 'active').toLowerCase() !== 'sold')

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Log Maintenance"
      isDirty={isDirty}
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 pb-2">
        {error && <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-3 py-2">{error}</p>}

        {/* If pre-filled from a schedule, show the asset name read-only */}
        {prefill.assetName ? (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Asset</label>
            <p className="text-sm font-semibold text-navy bg-gray-50 rounded-lg px-3 py-2">{prefill.assetName}</p>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Asset <span className="text-danger">*</span></label>
            <select value={form.asset_id} onChange={e => set('asset_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
              <option value="">Select asset…</option>
              {activeAssets.map(a => <option key={a.id} value={a.id}>{a.asset_name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Maintenance Type <span className="text-danger">*</span></label>
          <select value={form.maintenance_type} onChange={e => set('maintenance_type', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
            <option value="">Select type…</option>
            {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date Performed <span className="text-danger">*</span></label>
            <input type="date" value={form.maintenance_date} onChange={e => set('maintenance_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Performed By</label>
            <input type="text" value={form.performed_by} onChange={e => set('performed_by', e.target.value)}
              placeholder="Staff member or vendor"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-danger">*</span></label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={3} placeholder="Describe what was done…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Parts Replaced</label>
          <input type="text" value={form.parts_replaced} onChange={e => set('parts_replaced', e.target.value)}
            placeholder="e.g. Gasket, O-ring #12"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cost ($)</label>
            <input type="number" min="0" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Next Scheduled Date</label>
            <input type="date" value={form.next_maintenance_date} onChange={e => set('next_maintenance_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
          </div>
        </div>

        {/* Pass/Fail toggle — only shown for Inspection type */}
        {form.maintenance_type === 'Inspection' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Inspection Result</label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => set('passed', true)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                  form.passed ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                ✓ Pass
              </button>
              <button type="button"
                onClick={() => set('passed', false)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                  !form.passed ? 'bg-danger text-white border-danger' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                ✕ Fail
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Any additional notes…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Log Entry'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Modal: Add Maintenance Schedule ──────────────────────────────────────────
function AddScheduleModal({ breweryId, assets, prefill = null, editSchedule = null, onClose, onSuccess }) {
  const draft = useModalDraft('modal_draft_add_schedule')
  const isEdit = !!editSchedule

  const EMPTY_FORM = {
    asset_id: prefill?.asset_id ?? '',
    maintenance_type: prefill?.maintenance_type ?? '',
    frequency: 'Monthly',
    frequency_days: '',
    last_performed_date: '',
    next_due_date: '',
    alert_days_before: '14',
    notes: '',
  }

  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        asset_id:             editSchedule.asset_id ?? '',
        maintenance_type:     editSchedule.maintenance_type ?? '',
        frequency:            editSchedule.frequency ?? 'Monthly',
        frequency_days:       editSchedule.frequency_days != null ? String(editSchedule.frequency_days) : '',
        last_performed_date:  editSchedule.last_performed_date ?? '',
        next_due_date:        editSchedule.next_due_date ?? '',
        alert_days_before:    editSchedule.alert_days_before != null ? String(editSchedule.alert_days_before) : '14',
        notes:                editSchedule.notes ?? '',
      }
    }
    const saved = draft.loadDraft()
    return saved ?? EMPTY_FORM
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Only save draft for new schedules
  useEffect(() => { if (!isEdit) draft.saveDraft(form) }, [form])

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-calculate next_due_date when last_performed_date or frequency changes
      const base = field === 'last_performed_date' ? value : next.last_performed_date
      const freq = field === 'frequency' ? value : next.frequency
      const customDays = field === 'frequency_days' ? value : next.frequency_days
      if (base) {
        const days = freq === 'Every X Days' ? parseInt(customDays) : FREQUENCY_DAYS_MAP[freq]
        if (days && !isNaN(days)) {
          next.next_due_date = addDaysToDate(base, days)
        }
      }
      return next
    })
  }

  const isDirty = !isEdit && (form.asset_id !== '' || form.maintenance_type !== '')

  async function handleSave() {
    if (!form.asset_id) return setError('Please select an asset.')
    if (!form.maintenance_type) return setError('Please select a maintenance type.')
    if (!form.frequency) return setError('Please select a frequency.')
    if (form.frequency === 'Every X Days' && !parseInt(form.frequency_days)) return setError('Please enter a number of days.')
    setError('')
    setSaving(true)

    const payload = {
      asset_id:             form.asset_id,
      maintenance_type:     form.maintenance_type,
      frequency:            form.frequency,
      frequency_days:       form.frequency === 'Every X Days' ? parseInt(form.frequency_days) : (FREQUENCY_DAYS_MAP[form.frequency] ?? null),
      last_performed_date:  form.last_performed_date || null,
      next_due_date:        form.next_due_date || null,
      alert_days_before:    parseInt(form.alert_days_before) || 14,
      notes:                form.notes.trim() || null,
    }

    let res
    if (isEdit) {
      res = await supabase.from('equipment_maintenance_schedules').update(payload).eq('id', editSchedule.id)
    } else {
      res = await supabase.from('equipment_maintenance_schedules').insert({ ...payload, brewery_id: breweryId, is_active: true })
    }

    setSaving(false)
    if (res.error) return setError(res.error.message)
    if (!isEdit) draft.clearDraft()
    onSuccess()
  }

  const activeAssets = assets.filter(a => (a.status ?? 'active').toLowerCase() !== 'retired' && (a.status ?? 'active').toLowerCase() !== 'sold')

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit Maintenance Schedule' : 'Add Maintenance Schedule'}
      isDirty={isDirty}
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 pb-2">
        {error && <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Asset <span className="text-danger">*</span></label>
          <select value={form.asset_id} onChange={e => set('asset_id', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
            <option value="">Select asset…</option>
            {activeAssets.map(a => <option key={a.id} value={a.id}>{a.asset_name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Maintenance Type <span className="text-danger">*</span></label>
          <select value={form.maintenance_type} onChange={e => set('maintenance_type', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
            <option value="">Select type…</option>
            {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Frequency <span className="text-danger">*</span></label>
          <select value={form.frequency} onChange={e => set('frequency', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber">
            {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* Custom day count — only shown when "Every X Days" is selected */}
        {form.frequency === 'Every X Days' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Number of Days <span className="text-danger">*</span></label>
            <input type="number" min="1" value={form.frequency_days} onChange={e => set('frequency_days', e.target.value)}
              placeholder="e.g. 45"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Last Performed Date</label>
            <input type="date" value={form.last_performed_date} onChange={e => set('last_performed_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Next Due Date</label>
            <input type="date" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
            <p className="text-[10px] text-gray-400 mt-0.5">Auto-calculated from last performed + frequency</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Alert Days Before Due (default 14)</label>
          <input type="number" min="1" value={form.alert_days_before} onChange={e => set('alert_days_before', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber resize-none" />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
