/**
 * DistributionPage — Distribution Tracker for The Craft Beer Brief.
 *
 * Three tabs:
 *   1. Assign Distribution — shows complete packaging runs; assign splits to accounts
 *   2. Deliveries          — full delivery log with keg return tracking and edit/delete
 *   3. Accounts            — manage wholesale/retail accounts with multi-contact support
 *
 * Wrapped in TierGate so only Operations and Full Suite subscribers can access it.
 * Data lives in: packaging_runs, distribution_records, distribution_accounts.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import LoadingSpinner from '../../components/LoadingSpinner'
import WorkflowWarningBanner from '../../components/WorkflowWarningBanner'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Shared CSS helpers ─────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

// ── Static data ────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  'Restaurant', 'Bar', 'Taproom', 'Retail Store', 'Distributor', 'Event', 'Other',
]

// Package types must match the exact names used by the recipe builder so that
// account pricing entries auto-populate when assigning distribution splits.
const PRICEABLE_PACKAGE_TYPES = [
  'Can', 'Bottle',
  'Keg Sixth Barrel', 'Keg Quarter Barrel', 'Keg Half Barrel',
  'Draft/Taproom',
  'Growler', 'Crowler',
  '4-Pack', '6-Pack', '12-Pack', '24-Pack/Case',
]

// Size specs per package type — values mirror what the recipe builder stores in splits
// so that exact matching works in handleAccountChange.
// Keg types omitted: their size is already encoded in the package_type name.
const SIZE_SPECS = {
  'Can':           ['8oz', '10oz', '12oz', '16oz', '19.2oz', '32oz'],
  'Bottle':        ['12oz', '16oz', '22oz', '375ml', '500ml', '750ml'],
  'Draft/Taproom': ['12oz pour', '16oz pint', '20oz imperial pint'],
  'Growler':       ['32oz', '64oz'],
  'Crowler':       ['16oz', '32oz'],
  '4-Pack':        ['4-pack 12oz', '4-pack 16oz'],
  '6-Pack':        ['6-pack 12oz', '6-pack 16oz'],
  '12-Pack':       ['12-pack 12oz'],
  '24-Pack/Case':  ['24-pack 12oz'],
}

// Determines if a package_type string represents a returnable keg
function isKegType(type) {
  return (type || '').toLowerCase().includes('keg')
}

// ── Utility helpers ────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDollars(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Page root — TierGate wrapper ───────────────────────────────────────────────

export default function DistributionPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="batch_to_sale"
      featureName="Distribution"
      featureDescription="Track deliveries, manage accounts, and record keg returns."
    >
      <DistributionTracker />
    </TierGate>
  )
}

// ── DistributionTracker — main state and tab orchestration ─────────────────────

function DistributionTracker() {
  const { brewery } = useAuth()
  const { isReadOnly } = useReadOnly()

  const [activeTab, setActiveTab] = usePersistedTab('distribution_active_tab', 'assign')

  const [packagingRuns,    setPackagingRuns]    = useState([])
  const [accounts,         setAccounts]         = useState([])
  const [distRecords,      setDistRecords]      = useState([])
  const [loading,          setLoading]          = useState(true)
  const [addAccountOpen,   setAddAccountOpen]   = useState(false)

  // Draft tracking for Add Account modal — shown as DraftNoticeBar in Accounts tab
  const addAccountDraft = useModalDraft('modal_draft_distribution_add_account')

  const loadAll = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)

    const [runsRes, accRes, distRes] = await Promise.all([
      supabase
        .from('packaging_runs')
        .select('*')
        .eq('brewery_id', brewery.id)
        .eq('status', 'complete')
        .order('packaging_date', { ascending: false }),
      supabase
        .from('distribution_accounts')
        .select('*')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true)
        .order('account_name'),
      supabase
        .from('distribution_records')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('delivery_date', { ascending: false }),
    ])

    setPackagingRuns(runsRes.data ?? [])
    setAccounts(accRes.data ?? [])
    setDistRecords(distRes.data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  if (!brewery?.id || loading) return <LoadingSpinner message="Loading distribution data…" />

  return (
    // Fix 1: full browser width minus sidebar — no max-w constraint
    <div className="w-full px-4 py-6 space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Distribution</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track deliveries and manage wholesale accounts
          </p>
        </div>

        {activeTab === 'accounts' && !isReadOnly && (
          <button
            onClick={() => setAddAccountOpen(true)}
            className="bg-amber text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors"
          >
            + Add Account
          </button>
        )}
      </div>

      {/* ── Tab navigation ── */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-gray-200 whitespace-nowrap min-w-max">
          {[
            { key: 'assign',     label: 'Assign Distribution' },
            { key: 'deliveries', label: 'Deliveries' },
            { key: 'accounts',   label: 'Accounts' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-amber text-amber'
                  : 'border-transparent text-gray-500 hover:text-navy'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* DraftNoticeBar for Add Account modal — shown only on Accounts tab */}
      {activeTab === 'accounts' && addAccountDraft.hasDraft && !addAccountOpen && (
        <DraftNoticeBar
          onContinue={() => { setAddAccountOpen(true) }}
          onDiscard={() => { addAccountDraft.clearDraft() }}
        />
      )}

      {/* ── Tab content ── */}
      {activeTab === 'assign' && (
        <AssignTab
          packagingRuns={packagingRuns}
          accounts={accounts}
          distRecords={distRecords}
          breweryId={brewery.id}
          onRefresh={loadAll}
          isReadOnly={isReadOnly}
        />
      )}
      {activeTab === 'deliveries' && (
        <DeliveriesTab
          distRecords={distRecords}
          accounts={accounts}
          breweryId={brewery.id}
          onRefresh={loadAll}
          isReadOnly={isReadOnly}
        />
      )}
      {activeTab === 'accounts' && (
        <AccountsTab
          accounts={accounts}
          onRefresh={loadAll}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Add Account modal */}
      {addAccountOpen && (
        <AddAccountModal
          breweryId={brewery.id}
          onClose={() => setAddAccountOpen(false)}
          onSaved={() => { setAddAccountOpen(false); loadAll() }}
        />
      )}
    </div>
  )
}

// ── AssignTab ──────────────────────────────────────────────────────────────────

function AssignTab({ packagingRuns, accounts, distRecords, breweryId, onRefresh, isReadOnly }) {
  const [assignTarget, setAssignTarget] = useState(null)
  const [reAssign,     setReAssign]     = useState(false)

  const distributionWarnings = []

  const today = new Date().toISOString().slice(0, 10)
  const overdueKegs = distRecords.filter(r =>
    r.returnable_kegs && !r.kegs_returned &&
    r.keg_return_date && r.keg_return_date < today
  )
  if (overdueKegs.length > 0) {
    distributionWarnings.push({
      message: `${overdueKegs.length} keg${overdueKegs.length > 1 ? 's' : ''} overdue for return`,
      severity: 'required',
    })
  }

  const assignedBatchIds = new Set(distRecords.map(r => r.batch_package_id).filter(Boolean))
  const unassigned = packagingRuns.filter(r => r.batch_package_id && !assignedBatchIds.has(r.batch_package_id))
  if (unassigned.length > 0) {
    distributionWarnings.push({
      message: `${unassigned.length} packaged batch${unassigned.length > 1 ? 'es' : ''} not yet assigned to accounts`,
      severity: 'recommended',
    })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const pendingDeliveries = distRecords.filter(r => r.delivery_date && r.delivery_date < sevenDaysAgo && !r.kegs_returned && r.returnable_kegs)
  if (pendingDeliveries.length > 0) {
    distributionWarnings.push({
      message: `${pendingDeliveries.length} keg deliver${pendingDeliveries.length > 1 ? 'ies' : 'y'} pending return confirmation`,
      severity: 'recommended',
    })
  }

  if (packagingRuns.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
        <div className="text-4xl mb-3">📦</div>
        <h3 className="text-lg font-bold text-navy mb-2">No Complete Packaging Runs</h3>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Complete a packaging run in the Packaging module to assign its splits to distribution accounts.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <WorkflowWarningBanner warnings={distributionWarnings} />

      {/* Fix 1: table-layout fixed with specified column widths */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th style={{ width: '8%' }}  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Batch</th>
              <th style={{ width: '15%' }} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Beer</th>
              <th style={{ width: '10%' }} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Style</th>
              <th style={{ width: '9%' }}  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Pkg Date</th>
              <th style={{ width: '10%' }} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Total Packaged</th>
              <th style={{ width: '28%' }} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Splits</th>
              <th style={{ width: '10%' }} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {packagingRuns.map(run => {
              const splits = (run.actual_splits?.length ? run.actual_splits : run.planned_splits) || []

              return (
                <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="bg-navy/10 text-navy text-xs font-mono font-semibold px-2 py-1 rounded">
                      {run.batch_number || '—'}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 truncate">{run.beer_name}</div>
                  </td>

                  <td className="px-4 py-3 text-gray-500 text-xs truncate">
                    {run.beer_style || '—'}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                    {fmtDate(run.packaging_date)}
                  </td>

                  {/* Fix 2: toFixed(2) for total volume */}
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                    {run.total_volume_packaged != null
                      ? `${Number(run.total_volume_packaged).toFixed(2)} ${run.volume_unit || 'bbl'}`
                      : '—'}
                  </td>

                  <td className="px-4 py-3">
                    {splits.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {splits.slice(0, 4).map((s, i) => (
                          <span key={i} className="bg-navy/10 text-navy text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                            {s.package_type}{s.units_packaged != null ? ` ×${s.units_packaged}` : ''}
                          </span>
                        ))}
                        {splits.length > 4 && (
                          <span className="text-xs text-gray-400">+{splits.length - 4} more</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No splits</span>
                    )}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    {isReadOnly && <span className="text-xs text-gray-400">Read only</span>}
                    {!isReadOnly && (() => {
                      const hasAssigned = splits.some(s =>
                        distRecords.some(d =>
                          d.batch_package_id === run.batch_package_id &&
                          d.package_type === s.package_type
                        )
                      )
                      return (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => { setAssignTarget(run); setReAssign(false) }}
                            className="text-amber text-xs font-semibold hover:underline whitespace-nowrap"
                          >
                            Assign Splits
                          </button>
                          {hasAssigned && (
                            <button
                              onClick={() => { setAssignTarget(run); setReAssign(true) }}
                              className="text-blue-600 text-xs font-semibold hover:underline whitespace-nowrap"
                            >
                              Re-assign
                            </button>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {assignTarget && (
        <AssignSplitsModal
          run={assignTarget}
          accounts={accounts}
          distRecords={distRecords}
          breweryId={breweryId}
          reAssign={reAssign}
          onClose={() => { setAssignTarget(null); setReAssign(false) }}
          onSaved={() => { setAssignTarget(null); setReAssign(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── getPintsPerUnit ────────────────────────────────────────────────────────────
// Returns pints of beer in one unit. Searches packageType + sizeSpec together.

function getPintsPerUnit(packageType, sizeSpec) {
  const type     = (packageType || '').toLowerCase()
  const spec     = (sizeSpec    || '').toLowerCase()
  const combined = (type + ' ' + spec).trim()

  // 1. Kegs — size may be embedded in the package_type name or in sizeSpec
  if (combined.includes('sixth')   || combined.includes('5.16') || combined.includes('1/6'))  return 41.28
  if (combined.includes('quarter') || combined.includes('7.75') || combined.includes('1/4'))  return 62
  if (combined.includes('half')    || combined.includes('15.5') || combined.includes('1/2'))  return 124
  if (combined.includes('50l')     || combined.includes('european'))                          return 105.6
  if (type.includes('keg'))                                                                   return 124  // fallback: half barrel

  // 2. Multi-packs — must run before the oz regex so we multiply correctly
  //    package_type '6-Pack' + sizeSpec '6-pack 16oz' → (6 × 16) / 16 = 6 pints
  if (type.includes('pack') || type.includes('case')) {
    const packCount = type.match(/(\d+)[\s-]pack/)            // count from type name
    const ozPerUnit = combined.match(/(\d+(?:\.\d+)?)oz/)    // oz value anywhere
    if (packCount && ozPerUnit) {
      return (Number(packCount[1]) * Number(ozPerUnit[1])) / 16
    }
  }

  // 3. Draft / taproom — handle before ozMatch; spec may contain "oz" but unit is per pour
  if (type.includes('draft') || type.includes('taproom')) {
    if (combined.includes('20') || combined.includes('imperial')) return 1.25
    if (combined.includes('12'))                                  return 0.75
    return 1  // default 16oz pint
  }

  // 4. Single-serve cans, bottles, growlers, crowlers — oz or ml spec
  const ozMatch = spec.match(/(\d+(?:\.\d+)?)\s*oz/)
  if (ozMatch) return Number(ozMatch[1]) / 16

  const mlMatch = spec.match(/(\d+)\s*ml/)
  if (mlMatch) return Number(mlMatch[1]) / 473.2   // 1 pint = 473.2 ml

  return 1  // default 1 pint
}

// Ingredient cost per unit = recipe_cost_per_pint × pints_per_unit
function ingCostPerUnit(packageType, sizeSpec, recipeCostPerPint) {
  if (!recipeCostPerPint) return 0
  const pints = getPintsPerUnit(packageType, sizeSpec)
  const cost  = parseFloat(recipeCostPerPint) * pints
  console.log('[ingCostPerUnit]', {
    packageType,
    sizeSpec,
    pintsPerUnit: pints,
    recipeCostPerPint: parseFloat(recipeCostPerPint),
    ingredientCostPerUnit: cost,
  })
  return cost
}

// ── AssignSplitsModal ──────────────────────────────────────────────────────────

function AssignSplitsModal({ run, accounts, distRecords, breweryId, reAssign = false, onClose, onSaved }) {
  const DRAFT_KEY = `modal_draft_distribution_assign_${run.id}`
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft(DRAFT_KEY)

  const splits = (run.actual_splits?.length ? run.actual_splits : run.planned_splits) || []

  // Log all split data so the profit calculation can be verified in the browser console
  useEffect(() => {
    console.log('[AssignSplitsModal] ModalShell + useModalDraft active')
    console.log('[AssignSplitsModal] opened', {
      beer_name:            run.beer_name,
      recipe_cost_per_pint: run.recipe_cost_per_pint,
      reAssign,
      splits: splits.map(s => ({
        package_type:            s.package_type,
        size_spec:               s.size_spec,
        units_packaged:          s.units_packaged,
        packaging_cost_per_unit: s.packaging_cost_per_unit,
        label_cost_per_unit:     s.label_cost_per_unit,
        carrier_cost_per_unit:   s.carrier_cost_per_unit,
      })),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildDefaultRows = () =>
    splits.map((s, i) => {
      // Pre-populate from any existing distribution record for this split
      const existing = distRecords.find(
        d => d.batch_package_id === run.batch_package_id &&
             d.package_type     === (s.package_type || '')
      )
      return {
        key:                   i,
        package_type:          s.package_type || '',
        size_spec:             s.size_spec    || '',
        units_packaged:        s.units_packaged ?? '',
        volume:                s.total_volume ?? '',
        pkg_cost_per_unit:     parseFloat(s.packaging_cost_per_unit || 0),
        label_cost_per_unit:   parseFloat(s.label_cost_per_unit     || 0),
        carrier_cost_per_unit: parseFloat(s.carrier_cost_per_unit   || 0),
        // Pre-fill from existing record when re-assigning
        account_id:            existing?.account_id || '',
        delivery_date:         existing?.delivery_date || todayStr(),
        sale_price:            existing?.sale_price_per_unit != null ? String(existing.sale_price_per_unit) : '',
        distribution_cost:     existing?.distribution_cost_per_unit != null ? String(existing.distribution_cost_per_unit) : '0',
        notes:                 existing?.notes || '',
        keg_return_expected:   existing != null ? existing.returnable_kegs : isKegType(s.package_type || ''),
        keg_return_date:       existing?.keg_return_date || '',
        existing_record_id:    existing?.id || null,
      }
    })

  const [rows, setRows] = useState(() => {
    // Re-assign mode always uses fresh rows pre-populated from existing records
    if (reAssign) return buildDefaultRows()
    const draft = loadDraft(false)
    if (draft?.rows) return draft.rows
    return buildDefaultRows()
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  // Persist rows to draft on every change
  useEffect(() => {
    saveDraft({ rows })
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAccountChange(idx, accountId) {
    const account     = accounts.find(a => a.id === accountId)
    const packageType = rows[idx].package_type
    const sizeSpec    = rows[idx].size_spec || ''
    const ptLower     = (packageType || '').toLowerCase()
    const ssLower     = sizeSpec.toLowerCase()
    // First word of package_type for loose matching: 'Draft/Taproom' → 'draft', 'Keg Half Barrel' → 'keg'
    const ptFirst     = ptLower.split(/[\s/\-]/)[0]
    let autoPrice = ''

    console.log('[handleAccountChange]', {
      splitPackageType: packageType,
      sizeSpec,
      accountPricing: account?.pricing ?? [],
    })

    if (account?.pricing?.length) {
      let priceRow

      // 1. Exact match on both package_type AND size_spec
      priceRow = account.pricing.find(p =>
        p.package_type?.toLowerCase() === ptLower &&
        (p.size_spec || '').toLowerCase() === ssLower
      )

      // 2. Exact match on package_type only
      if (!priceRow) {
        priceRow = account.pricing.find(p =>
          p.package_type?.toLowerCase() === ptLower
        )
      }

      // 3. Draft/Taproom normalization — 'Draft/Taproom', 'Draft Pint', 'Draft', 'Taproom'
      //    all treated as equivalent regardless of which side set the name
      if (!priceRow) {
        const isDraft = ptLower.includes('draft') || ptLower.includes('taproom')
        if (isDraft) {
          priceRow = account.pricing.find(p => {
            const pl = (p.package_type || '').toLowerCase()
            return pl.includes('draft') || pl.includes('taproom')
          })
        }
      }

      // 4. Substring match (e.g. pricing 'Keg' matches split 'Keg Half Barrel')
      if (!priceRow) {
        priceRow = account.pricing.find(p => {
          const pl = (p.package_type || '').toLowerCase()
          return ptLower.includes(pl) || pl.includes(ptLower)
        })
      }

      // 5. First-word match (last resort): 'Keg Half Barrel' → 'keg', 'Can' → 'can'
      if (!priceRow && ptFirst) {
        priceRow = account.pricing.find(p => {
          const pl      = (p.package_type || '').toLowerCase()
          const plFirst = pl.split(/[\s/\-]/)[0]
          return plFirst === ptFirst
        })
      }

      console.log('[handleAccountChange] match result:', priceRow ?? 'no match found')
      if (priceRow) autoPrice = String(priceRow.price_per_unit)
    }

    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, account_id: accountId, sale_price: autoPrice || r.sale_price } : r
    ))
  }

  function isAlreadyAssigned(packageType) {
    return distRecords.some(
      d => d.batch_package_id === run.batch_package_id && d.package_type === packageType
    )
  }

  function updateRow(index, field, value) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    const toProcess = rows.filter(r => r.account_id)

    if (toProcess.length === 0) {
      setError('Select at least one account to assign a split.')
      return
    }

    setSaving(true)
    setError(null)

    const toInsert = []
    const toUpdate = []

    for (const r of toProcess) {
      const account  = accounts.find(a => a.id === r.account_id) || {}
      const contacts = account.contacts || []
      const primary  = contacts.find(c => c.is_primary) || contacts[0] || {}
      const qty      = Math.round(parseFloat(r.units_packaged)) || 1
      const price    = parseFloat(r.sale_price) || null
      const distCost = parseFloat(r.distribution_cost) || null
      const ingCost  = ingCostPerUnit(r.package_type, r.size_spec || '', run.recipe_cost_per_pint) || null
      const pkgCost  = pkgCostForRow(r) || null

      const payload = {
        account_id:                  r.account_id,
        account_name:                account.account_name || 'Unknown',
        account_type:                account.account_type || null,
        contact_name:                primary.name  || null,
        contact_email:               primary.email || null,
        contact_phone:               primary.phone || null,
        package_type:                r.package_type || null,
        quantity:                    qty,
        delivery_date:               r.delivery_date || null,
        sale_price_per_unit:         price,
        ingredient_cost_per_unit:    ingCost,
        packaging_cost_per_unit:     pkgCost,
        distribution_cost_per_unit:  distCost,
        notes:                       r.notes || null,
        returnable_kegs:             r.keg_return_expected,
        keg_return_date:             r.keg_return_expected && r.keg_return_date ? r.keg_return_date : null,
      }

      if (r.existing_record_id) {
        toUpdate.push({ id: r.existing_record_id, ...payload })
      } else {
        toInsert.push({
          brewery_id:       breweryId,
          batch_package_id: run.batch_package_id || null,
          package_split_id: null,
          ...payload,
        })
      }
    }

    const ops = []
    if (toInsert.length > 0) {
      ops.push(supabase.from('distribution_records').insert(toInsert))
    }
    for (const { id, ...updateData } of toUpdate) {
      ops.push(supabase.from('distribution_records').update(updateData).eq('id', id))
    }

    const results = await Promise.all(ops)
    const firstErr = results.find(r => r.error)
    if (firstErr) { setError(firstErr.error.message); setSaving(false); return }
    clearDraft()
    onSaved()
  }

  // Compute total packaging material cost for a row
  function pkgCostForRow(row) {
    return (row.pkg_cost_per_unit || 0) + (row.label_cost_per_unit || 0) + (row.carrier_cost_per_unit || 0)
  }

  const isDirty = rows.some(r => r.account_id || r.sale_price || r.notes || r.distribution_cost !== '0')

  return (
    <ModalShell
      isOpen
      onClose={() => { onClose() }}
      title={reAssign ? `Re-assign Distribution — ${run.beer_name}` : `Assign Distribution — ${run.beer_name}`}
      maxWidth="max-w-5xl"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <div className="space-y-5">
        {error && (
          <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        {splits.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            This packaging run has no splits recorded. Add splits in the Packaging module first.
          </div>
        ) : (
          <div className="space-y-5">
            {rows.map((row, i) => {
              // In re-assign mode all splits show the form; otherwise hide already-assigned ones
              const assigned  = !reAssign && isAlreadyAssigned(row.package_type)
              const salePrice = parseFloat(row.sale_price) || 0
              const qty       = parseFloat(row.units_packaged) || 0
              // Fix 2: use getPintsPerUnit-based calculation
              const ingCost   = ingCostPerUnit(row.package_type, row.size_spec || '', run.recipe_cost_per_pint)
              const pkgCost   = pkgCostForRow(row)
              const distCost  = parseFloat(row.distribution_cost) || 0
              const totalCost = ingCost + pkgCost + distCost
              const profitPU  = salePrice > 0 ? salePrice - totalCost : null
              const margin    = salePrice > 0 && profitPU != null ? (profitPU / salePrice) * 100 : null

              return (
                <div
                  key={row.key}
                  className={`rounded-xl border ${assigned ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'} p-4 space-y-3`}
                >
                  {/* Row header: package type + units */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">{row.package_type || 'Unknown'}</span>
                    {row.units_packaged !== '' && (
                      <span className="bg-navy/10 text-navy text-xs px-2 py-0.5 rounded-full">
                        {row.units_packaged} units
                      </span>
                    )}
                    {row.volume != null && row.volume !== '' && (
                      <span className="text-xs text-gray-400">{row.volume} {run.volume_unit || 'bbl'}</span>
                    )}
                    {assigned && (
                      <span className="bg-green-100 text-success text-xs font-semibold px-2 py-0.5 rounded-full ml-auto">
                        Already Assigned ✓
                      </span>
                    )}
                    {!assigned && row.existing_record_id && (
                      <span className="bg-blue-50 text-blue-600 text-xs font-semibold px-2 py-0.5 rounded-full ml-auto">
                        Re-assigning ✎
                      </span>
                    )}
                  </div>

                  {!assigned && (
                    <>
                      {/* Assignment fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Account */}
                        <div>
                          <label className={LBL}>Assign to Account</label>
                          <select
                            className={INPUT_CLS}
                            value={row.account_id}
                            onChange={e => handleAccountChange(i, e.target.value)}
                          >
                            <option value="">— Select account —</option>
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>{a.account_name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Delivery date */}
                        <div>
                          <label className={LBL}>Delivery Date</label>
                          <input
                            type="date"
                            className={INPUT_CLS}
                            value={row.delivery_date}
                            onChange={e => updateRow(i, 'delivery_date', e.target.value)}
                          />
                        </div>

                        {/* Sale price */}
                        <div>
                          <label className={LBL}>Sale Price / Unit ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={INPUT_CLS}
                            placeholder="e.g. 185.00"
                            value={row.sale_price}
                            onChange={e => updateRow(i, 'sale_price', e.target.value)}
                          />
                        </div>

                        {/* Distribution cost */}
                        <div>
                          <label className={LBL}>Delivery Cost / Unit ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={INPUT_CLS}
                            placeholder="0.00"
                            value={row.distribution_cost}
                            onChange={e => updateRow(i, 'distribution_cost', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Keg return */}
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-amber"
                            checked={row.keg_return_expected}
                            onChange={e => updateRow(i, 'keg_return_expected', e.target.checked)}
                          />
                          <span className="text-xs text-gray-600">Keg return expected</span>
                        </label>
                        {row.keg_return_expected && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">Return by:</label>
                            <input
                              type="date"
                              className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber"
                              value={row.keg_return_date || ''}
                              onChange={e => updateRow(i, 'keg_return_date', e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      <div>
                        <label className={LBL}>Notes (optional)</label>
                        <input
                          type="text"
                          className={INPUT_CLS}
                          placeholder="Delivery notes, special instructions…"
                          value={row.notes}
                          onChange={e => updateRow(i, 'notes', e.target.value)}
                        />
                      </div>

                      {/* Fix 4: True profit breakdown */}
                      {salePrice > 0 && (
                        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-sm space-y-1.5">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Profit Breakdown</div>

                          <div className="flex justify-between text-gray-600">
                            <span>Sale price per unit</span>
                            <span className="font-medium text-navy">{fmtDollars(salePrice)}</span>
                          </div>

                          <div className="flex justify-between text-gray-500">
                            <span>Total production cost <span className="text-xs text-gray-400">(from recipe)</span></span>
                            <span>− {ingCost > 0 ? fmtDollars(ingCost) : <span className="text-gray-400 text-xs">no recipe cost</span>}</span>
                          </div>

                          <div className="flex justify-between text-gray-500">
                            <span>Packaging materials</span>
                            <span>− {fmtDollars(pkgCost)}</span>
                          </div>

                          <div className="flex justify-between text-gray-500">
                            <span>Distribution / delivery cost</span>
                            <span>− {fmtDollars(distCost)}</span>
                          </div>

                          <div className={`flex justify-between font-semibold border-t border-gray-200 pt-1.5 mt-1.5 ${profitPU != null && profitPU >= 0 ? 'text-success' : 'text-danger'}`}>
                            <span>Net profit per unit</span>
                            <span>{profitPU != null ? fmtDollars(profitPU) : '—'}</span>
                          </div>

                          {margin != null && (
                            <div className="flex justify-between text-xs text-gray-400">
                              <span>Net margin</span>
                              <span>{margin.toFixed(1)}%</span>
                            </div>
                          )}

                          {qty > 0 && profitPU != null && (
                            <div className={`flex justify-between font-bold border-t border-gray-200 pt-1.5 mt-1.5 ${profitPU >= 0 ? 'text-success' : 'text-danger'}`}>
                              <span>Total profit ({qty} units)</span>
                              <span>{fmtDollars(profitPU * qty)}</span>
                            </div>
                          )}

                          {qty > 0 && salePrice > 0 && (
                            <div className="flex justify-between text-xs text-gray-500 font-medium">
                              <span>Total revenue</span>
                              <span>{fmtDollars(salePrice * qty)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || splits.length === 0}
            className="bg-amber text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Assignments'}
          </button>
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── DeliveriesTab ──────────────────────────────────────────────────────────────

function DeliveriesTab({ distRecords, accounts, onRefresh, isReadOnly }) {
  const [editTarget, setEditTarget] = useState(null)

  const accountMap = useMemo(() => {
    const m = {}
    for (const a of accounts) m[a.id] = a.account_name
    return m
  }, [accounts])

  const totalDeliveries = distRecords.length
  const totalRevenue    = distRecords.reduce((sum, d) => sum + (parseFloat(d.total_sale_value) || 0), 0)
  const kegsOut         = distRecords.filter(d => d.returnable_kegs && !d.kegs_returned).length

  // Per-record profit helper
  function recordProfit(d) {
    const sale     = parseFloat(d.sale_price_per_unit)   || 0
    const ing      = parseFloat(d.ingredient_cost_per_unit)  || 0
    const pkg      = parseFloat(d.packaging_cost_per_unit)   || 0
    const dist     = parseFloat(d.distribution_cost_per_unit) || 0
    const qty      = parseFloat(d.quantity) || 0
    const profitPU = sale > 0 ? sale - ing - pkg - dist : null
    const total    = profitPU != null ? profitPU * qty : null
    const margin   = sale > 0 && profitPU != null ? (profitPU / sale) * 100 : null
    return { sale, ing, pkg, dist, qty, profitPU, total, margin }
  }

  // Summary profit aggregates
  const totalCost = distRecords.reduce((sum, d) => {
    const { ing, pkg, dist, qty } = recordProfit(d)
    return sum + (ing + pkg + dist) * qty
  }, 0)
  const totalProfit  = totalRevenue - totalCost
  const avgMargin    = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null

  async function handleKegReturned(recordId, returned) {
    const today = new Date().toISOString().slice(0, 10)
    await supabase
      .from('distribution_records')
      .update({
        kegs_returned:     returned,
        keg_returned_date: returned ? today : null,
      })
      .eq('id', recordId)
    onRefresh()
  }

  async function handleDelete(record) {
    if (!window.confirm('Delete this delivery record? This cannot be undone.')) return
    await supabase.from('distribution_records').delete().eq('id', record.id)
    onRefresh()
  }

  return (
    <div className="space-y-6">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Deliveries</div>
          <div className="text-2xl font-bold text-navy">{totalDeliveries}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Total Revenue</div>
          <div className="text-xl font-bold text-navy">
            {totalRevenue > 0 ? fmtDollars(totalRevenue) : '—'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Total Cost</div>
          <div className="text-xl font-bold text-gray-700">
            {totalCost > 0 ? fmtDollars(totalCost) : '—'}
          </div>
        </div>
        <div className={`bg-white border rounded-xl p-4 ${totalProfit < 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="text-xs text-gray-500 mb-1">Total Profit</div>
          <div className={`text-xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            {totalRevenue > 0 ? fmtDollars(totalProfit) : '—'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Avg Margin</div>
          <div className={`text-xl font-bold ${avgMargin != null && avgMargin >= 0 ? 'text-success' : 'text-danger'}`}>
            {avgMargin != null ? `${avgMargin.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* ── Kegs out alert ── */}
      {kegsOut > 0 && (
        <div className="flex items-center gap-2 bg-amber/10 border border-amber rounded-lg px-4 py-2 text-sm text-amber font-medium">
          {kegsOut} keg{kegsOut > 1 ? 's' : ''} currently out — awaiting return
        </div>
      )}

      {distRecords.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">🚚</div>
          <h3 className="text-lg font-bold text-navy mb-2">No Delivery Records Yet</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Use the "Assign Distribution" tab to assign packaging splits to accounts.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Account', 'Package', 'Units', 'Sale/Unit', 'Net Profit/Unit', 'Total Profit', 'Margin', 'Keg Return', 'Notes', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {distRecords.map(d => {
                const { sale, profitPU, total, margin } = recordProfit(d)
                return (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                      {fmtDate(d.delivery_date)}
                    </td>

                    <td className="px-4 py-3 font-medium text-gray-800 text-xs">
                      {d.account_name || accountMap[d.account_id] || '—'}
                    </td>

                    <td className="px-4 py-3 text-gray-600 text-xs">{d.package_type || '—'}</td>

                    <td className="px-4 py-3 text-gray-700 text-xs">{d.quantity ?? '—'}</td>

                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {sale > 0 ? fmtDollars(sale) : '—'}
                    </td>

                    {/* Net Profit/Unit — green if positive, red if negative */}
                    <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap">
                      {profitPU != null ? (
                        <span className={profitPU >= 0 ? 'text-success' : 'text-danger'}>
                          {fmtDollars(profitPU)}
                        </span>
                      ) : '—'}
                    </td>

                    <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap">
                      {total != null ? (
                        <span className={total >= 0 ? 'text-success' : 'text-danger'}>
                          {fmtDollars(total)}
                        </span>
                      ) : '—'}
                    </td>

                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {margin != null ? (
                        <span className={margin >= 0 ? 'text-success' : 'text-danger'}>
                          {margin.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>

                    {/* returnable_kegs / kegs_returned = correct column names */}
                    <td className="px-4 py-3">
                      {d.returnable_kegs ? (
                        d.kegs_returned ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-success text-xs font-semibold">Returned ✓</span>
                            {d.keg_returned_date && (
                              <span className="text-xs text-gray-400">
                                on: {fmtDate(d.keg_returned_date)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {d.keg_return_date && (() => {
                              const today = new Date().toISOString().slice(0, 10)
                              const isOverdue = d.keg_return_date < today
                              return isOverdue ? (
                                <span className="text-xs font-semibold text-red-600">
                                  Due: {fmtDate(d.keg_return_date)} — OVERDUE
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-amber-600">
                                  Due: {fmtDate(d.keg_return_date)}
                                </span>
                              )
                            })()}
                            {!isReadOnly && (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-3.5 h-3.5 accent-amber"
                                  checked={false}
                                  onChange={() => handleKegReturned(d.id, true)}
                                />
                                <span className="text-xs text-gray-500">Mark returned</span>
                              </label>
                            )}
                            {isReadOnly && <span className="text-xs text-amber">Out</span>}
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">
                      {d.notes || '—'}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-3 items-center">
                        <button
                          onClick={() => setEditTarget(d)}
                          className="text-amber text-xs font-semibold hover:underline"
                        >
                          {isReadOnly ? 'View' : 'Edit'}
                        </button>
                        {!isReadOnly && (
                          <button
                            onClick={() => handleDelete(d)}
                            className="text-danger text-xs font-semibold hover:underline"
                          >
                            Delete
                          </button>
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

      {editTarget && (
        <EditDeliveryModal
          record={editTarget}
          accounts={accounts}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── EditDeliveryModal ──────────────────────────────────────────────────────────

function EditDeliveryModal({ record, accounts, onClose, onSaved }) {
  const DRAFT_KEY = `modal_draft_distribution_edit_delivery_${record.id}`
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft(DRAFT_KEY)

  const defaultForm = {
    delivery_date:               record.delivery_date              || '',
    account_id:                  record.account_id                 || '',
    quantity:                    record.quantity                   ?? '',
    sale_price_per_unit:         record.sale_price_per_unit        ?? '',
    distribution_cost_per_unit:  record.distribution_cost_per_unit ?? '',
    returnable_kegs:             record.returnable_kegs            || false,
    keg_return_date:             record.keg_return_date            || '',
    kegs_returned:               record.kegs_returned              || false,
    keg_returned_date:           record.keg_returned_date          || '',
    notes:                       record.notes                      || '',
  }

  const [form, setForm] = useState(() => {
    const draft = loadDraft(false)
    return draft?.form ?? defaultForm
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  useEffect(() => {
    console.log('[EditDeliveryModal] ModalShell + useModalDraft active')
  }, [])

  // Read-only costs stored on the record at insert time
  const ingCost  = parseFloat(record.ingredient_cost_per_unit)  || 0
  const pkgCost  = parseFloat(record.packaging_cost_per_unit)   || 0

  // Live profit — recalculates as sale price or dist cost changes
  const salePrice  = parseFloat(form.sale_price_per_unit)       || 0
  const distCost   = parseFloat(form.distribution_cost_per_unit) || 0
  const qty        = parseFloat(form.quantity)                  || 0
  const totalCost  = ingCost + pkgCost + distCost
  const profitPU   = salePrice > 0 ? salePrice - totalCost : null
  const margin     = salePrice > 0 && profitPU != null ? (profitPU / salePrice) * 100 : null
  const totalProfit = profitPU != null && qty > 0 ? profitPU * qty : null

  function set(field, val) {
    const next = { ...form, [field]: val }
    setForm(next)
    saveDraft({ form: next })
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(defaultForm)

  async function handleSave() {
    if (!form.delivery_date) { setError('Delivery date is required.'); return }
    setSaving(true)
    setError(null)

    const units     = form.quantity !== ''                   ? parseFloat(form.quantity)                   : null
    const price     = form.sale_price_per_unit !== ''        ? parseFloat(form.sale_price_per_unit)        : null
    const distCostV = form.distribution_cost_per_unit !== '' ? parseFloat(form.distribution_cost_per_unit) : null

    const { error: err } = await supabase
      .from('distribution_records')
      .update({
        delivery_date:               form.delivery_date      || null,
        account_id:                  form.account_id         || null,
        quantity:                    units,
        sale_price_per_unit:         price,
        distribution_cost_per_unit:  distCostV,
        returnable_kegs:             form.returnable_kegs,
        keg_return_date:             form.returnable_kegs && form.keg_return_date ? form.keg_return_date : null,
        kegs_returned:               form.kegs_returned,
        keg_returned_date:           form.kegs_returned && form.keg_returned_date ? form.keg_returned_date : null,
        notes:                       form.notes || null,
      })
      .eq('id', record.id)

    if (err) { setError(err.message); setSaving(false); return }
    clearDraft()
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Edit Delivery Record"
      maxWidth="max-w-2xl"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <div className="space-y-4">
        {error && (
          <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Read-only context row */}
        <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Account</div>
            <div className="font-medium text-gray-800">{record.account_name || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Package Type</div>
            <div className="font-medium text-gray-800">{record.package_type || '—'}</div>
          </div>
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Delivery Date *</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={form.delivery_date}
              onChange={e => set('delivery_date', e.target.value)}
            />
          </div>

          <div>
            <label className={LBL}>Account</label>
            <select
              className={INPUT_CLS}
              value={form.account_id}
              onChange={e => set('account_id', e.target.value)}
            >
              <option value="">— Select account —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.account_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={LBL}>Units Delivered</label>
            <input
              type="number"
              min="0"
              className={INPUT_CLS}
              placeholder="e.g. 10"
              value={form.quantity}
              onChange={e => set('quantity', e.target.value)}
            />
          </div>

          <div>
            <label className={LBL}>Sale Price per Unit ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={INPUT_CLS}
              placeholder="e.g. 185.00"
              value={form.sale_price_per_unit}
              onChange={e => set('sale_price_per_unit', e.target.value)}
            />
          </div>

          <div>
            <label className={LBL}>Distribution / Delivery Cost per Unit ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={INPUT_CLS}
              placeholder="0.00"
              value={form.distribution_cost_per_unit}
              onChange={e => set('distribution_cost_per_unit', e.target.value)}
            />
          </div>
        </div>

        {/* Profit breakdown — recalculates live */}
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-sm space-y-1.5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Profit Breakdown</div>

          <div className="flex justify-between text-gray-600">
            <span>Sale price per unit</span>
            <span className="font-medium text-navy">{salePrice > 0 ? fmtDollars(salePrice) : <span className="text-gray-400 text-xs">not set</span>}</span>
          </div>

          <div className="flex justify-between text-gray-500">
            <span>Total production cost <span className="text-xs text-gray-400">(from recipe)</span></span>
            <span>− {ingCost > 0 ? fmtDollars(ingCost) : <span className="text-gray-400 text-xs">no recipe cost</span>}</span>
          </div>

          <div className="flex justify-between text-gray-500">
            <span>Packaging materials <span className="text-xs text-gray-400">(from run)</span></span>
            <span>− {fmtDollars(pkgCost)}</span>
          </div>

          <div className="flex justify-between text-gray-500">
            <span>Distribution / delivery cost</span>
            <span>− {fmtDollars(distCost)}</span>
          </div>

          <div className={`flex justify-between font-semibold border-t border-gray-200 pt-1.5 mt-1.5 ${profitPU != null && profitPU >= 0 ? 'text-success' : profitPU != null ? 'text-danger' : 'text-gray-400'}`}>
            <span>Net profit per unit</span>
            <span>{profitPU != null ? fmtDollars(profitPU) : '—'}</span>
          </div>

          {margin != null && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Net margin</span>
              <span>{margin.toFixed(1)}%</span>
            </div>
          )}

          {totalProfit != null && qty > 0 && (
            <div className={`flex justify-between font-bold border-t border-gray-200 pt-1.5 mt-1.5 ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
              <span>Total profit ({qty} units)</span>
              <span>{fmtDollars(totalProfit)}</span>
            </div>
          )}

          {salePrice > 0 && qty > 0 && (
            <div className="flex justify-between text-xs text-gray-500 font-medium">
              <span>Total revenue</span>
              <span>{fmtDollars(salePrice * qty)}</span>
            </div>
          )}
        </div>

        {/* Keg return tracking */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="edit-keg-expected"
            className="w-4 h-4 accent-amber"
            checked={form.returnable_kegs}
            onChange={e => set('returnable_kegs', e.target.checked)}
          />
          <label htmlFor="edit-keg-expected" className="text-sm text-gray-700 font-medium">
            Keg Return Expected
          </label>
        </div>

        {form.returnable_kegs && (
          <div>
            <label className={LBL}>Expected Return Date</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={form.keg_return_date}
              onChange={e => set('keg_return_date', e.target.value)}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="edit-keg-returned"
            className="w-4 h-4 accent-amber"
            checked={form.kegs_returned}
            onChange={e => set('kegs_returned', e.target.checked)}
          />
          <label htmlFor="edit-keg-returned" className="text-sm text-gray-700 font-medium">
            Kegs Returned
          </label>
        </div>

        {form.kegs_returned && (
          <div>
            <label className={LBL}>Actual Return Date</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={form.keg_returned_date}
              onChange={e => set('keg_returned_date', e.target.value)}
            />
          </div>
        )}

        <div>
          <label className={LBL}>Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            placeholder="Any delivery notes…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── AccountsTab ────────────────────────────────────────────────────────────────

function AccountsTab({ accounts, onRefresh, isReadOnly }) {
  const [editTarget, setEditTarget] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  async function handleDeactivate(account) {
    if (!window.confirm(`Deactivate "${account.account_name}"? They won't appear in new distribution forms.`)) return
    await supabase.from('distribution_accounts').update({ is_active: false }).eq('id', account.id)
    onRefresh()
  }

  if (accounts.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
        <div className="text-4xl mb-3">🏪</div>
        <h3 className="text-lg font-bold text-navy mb-2">No Distribution Accounts Yet</h3>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Add your wholesale accounts, taprooms, restaurants, and distributors using the "+ Add Account" button above.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map(account => {
          const contacts = account.contacts || []
          const primaryContact = contacts.find(c => c.is_primary) || contacts[0] || null
          const isExpanded = expandedId === account.id

          return (
            <div
              key={account.id}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-gray-800 text-base leading-snug">{account.account_name}</div>
                <span className="bg-navy/10 text-navy text-xs font-medium px-2 py-0.5 rounded-full shrink-0">
                  {account.account_type || 'Other'}
                </span>
              </div>

              {primaryContact && (
                <div className="space-y-0.5 text-sm text-gray-600">
                  {primaryContact.name  && <div>👤 {primaryContact.name}{primaryContact.title ? ` — ${primaryContact.title}` : ''}</div>}
                  {primaryContact.phone && <div>📞 {primaryContact.phone}</div>}
                  {primaryContact.email && <div>✉️ {primaryContact.email}</div>}
                </div>
              )}

              {account.address && (
                <div className="text-xs text-gray-400">📍 {account.address}</div>
              )}

              {account.notes && (
                <p className="text-xs text-gray-500 line-clamp-2">{account.notes}</p>
              )}

              {/* Pricing summary */}
              {account.pricing?.length > 0 && (
                <div className="border-t border-gray-100 pt-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Pricing</div>
                  <div className="space-y-0.5">
                    {account.pricing.slice(0, 3).map((p, idx) => (
                      <div key={idx} className="text-xs text-gray-600 flex justify-between">
                        <span>{p.package_type}{p.size_spec ? ` — ${p.size_spec}` : ''}</span>
                        <span className="font-medium">{fmtDollars(p.price_per_unit)}</span>
                      </div>
                    ))}
                    {account.pricing.length > 3 && (
                      <div className="text-xs text-gray-400">+{account.pricing.length - 3} more</div>
                    )}
                  </div>
                </div>
              )}

              {contacts.length > 1 && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : account.id)}
                  className="text-xs text-amber font-semibold hover:underline"
                >
                  {isExpanded ? 'Hide Contacts' : `View All Contacts (${contacts.length})`}
                </button>
              )}

              {isExpanded && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  {contacts.map((c, idx) => (
                    <div key={idx} className="text-xs text-gray-600 space-y-0.5 pb-2 border-b border-gray-50 last:border-0">
                      <div className="font-semibold text-gray-700">
                        {c.name || '—'}
                        {c.is_primary && <span className="ml-1 text-amber text-xs">(Primary)</span>}
                        {c.title && <span className="font-normal text-gray-400 ml-1">— {c.title}</span>}
                      </div>
                      {c.phone && <div>📞 {c.phone}</div>}
                      {c.email && <div>✉️ {c.email}</div>}
                    </div>
                  ))}
                </div>
              )}

              {!isReadOnly && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditTarget(account)}
                    className="flex-1 border border-gray-200 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeactivate(account)}
                    className="flex-1 border border-danger/30 text-danger text-xs font-medium py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Deactivate
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editTarget && (
        <EditAccountModal
          account={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── PricingEditor — Fix 3: size-specific pricing ───────────────────────────────

function PricingEditor({ pricing, onChange }) {
  function addRow() {
    onChange([...pricing, { package_type: '', size_spec: '', price_per_unit: '' }])
  }
  function updateRow(idx, field, val) {
    const next = pricing.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: val }
      // Reset size_spec when package_type changes
      if (field === 'package_type') updated.size_spec = ''
      return updated
    })
    onChange(next)
  }
  function removeRow(idx) {
    onChange(pricing.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {pricing.length > 0 && (
        <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1">
          <div className="col-span-4">Package Type</div>
          <div className="col-span-4">Size / Spec</div>
          <div className="col-span-3">Price / Unit</div>
          <div className="col-span-1" />
        </div>
      )}
      {pricing.map((row, idx) => {
        const sizeOptions = SIZE_SPECS[row.package_type] || []
        return (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
            {/* Package type */}
            <div className="col-span-4">
              <select
                value={row.package_type}
                onChange={e => updateRow(idx, 'package_type', e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">Type…</option>
                {PRICEABLE_PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Size / spec */}
            <div className="col-span-4">
              {sizeOptions.length > 0 ? (
                <select
                  value={row.size_spec}
                  onChange={e => updateRow(idx, 'size_spec', e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Size…</option>
                  {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={row.size_spec}
                  onChange={e => updateRow(idx, 'size_spec', e.target.value)}
                  placeholder="Spec…"
                  className={INPUT_CLS}
                />
              )}
            </div>

            {/* Price per unit */}
            <div className="col-span-3 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number" step="0.01" min="0"
                value={row.price_per_unit}
                onChange={e => updateRow(idx, 'price_per_unit', e.target.value)}
                placeholder="0.00"
                className={INPUT_CLS + ' pl-6'}
              />
            </div>

            {/* Remove */}
            <div className="col-span-1 flex justify-center">
              <button onClick={() => removeRow(idx)} className="text-danger text-xs hover:underline">✕</button>
            </div>
          </div>
        )
      })}
      <button onClick={addRow} className="text-amber text-sm font-medium hover:underline">
        + Add pricing row
      </button>
    </div>
  )
}

// ── ContactsEditor ─────────────────────────────────────────────────────────────

function ContactsEditor({ contacts, onChange }) {
  function addContact() {
    onChange([...contacts, { name: '', title: '', phone: '', email: '', is_primary: false }])
  }

  function removeContact(i) {
    onChange(contacts.filter((_, idx) => idx !== i))
  }

  function updateContact(i, field, value) {
    onChange(contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  function setPrimary(i) {
    onChange(contacts.map((c, idx) => ({ ...c, is_primary: idx === i })))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</span>
        <button type="button" onClick={addContact} className="text-xs text-amber font-semibold hover:underline">
          + Add Contact
        </button>
      </div>

      {contacts.length === 0 && (
        <p className="text-xs text-gray-400">No contacts added yet. Click "+ Add Contact" above.</p>
      )}

      {contacts.map((c, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={LBL}>Name</label>
              <input type="text" className={INPUT_CLS} placeholder="Jane Smith" value={c.name} onChange={e => updateContact(i, 'name', e.target.value)} />
            </div>
            <div>
              <label className={LBL}>Title</label>
              <input type="text" className={INPUT_CLS} placeholder="Bar Manager" value={c.title} onChange={e => updateContact(i, 'title', e.target.value)} />
            </div>
            <div>
              <label className={LBL}>Phone</label>
              <input type="tel" className={INPUT_CLS} placeholder="555-555-5555" value={c.phone} onChange={e => updateContact(i, 'phone', e.target.value)} />
            </div>
            <div>
              <label className={LBL}>Email</label>
              <input type="email" className={INPUT_CLS} placeholder="jane@bar.com" value={c.email} onChange={e => updateContact(i, 'email', e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
              <input type="checkbox" className="w-3.5 h-3.5 accent-amber" checked={c.is_primary} onChange={() => setPrimary(i)} />
              Primary contact
            </label>
            <button type="button" onClick={() => removeContact(i)} className="text-danger text-xs font-semibold hover:underline">
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── AddAccountModal ────────────────────────────────────────────────────────────

function AddAccountModal({ breweryId, onClose, onSaved }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } =
    useModalDraft('modal_draft_distribution_add_account')

  const defaultForm = {
    account_name: '',
    account_type: ACCOUNT_TYPES[0],
    address:      '',
    notes:        '',
  }

  const [form, setForm]         = useState(() => {
    const draft = loadDraft(false)
    return draft?.form ?? defaultForm
  })
  const [contacts, setContacts] = useState(() => {
    const draft = loadDraft(false)
    return draft?.contacts ?? []
  })
  const [pricing, setPricing]   = useState(() => {
    const draft = loadDraft(false)
    return draft?.pricing ?? []
  })
  const [saving, setSaving]     = useState(false)
  const [error,  setError]      = useState(null)

  useEffect(() => {
    console.log('[AddAccountModal] ModalShell + useModalDraft active')
  }, [])

  function set(field, val) {
    const next = { ...form, [field]: val }
    setForm(next)
    saveDraft({ form: next, contacts, pricing })
  }

  function handleContactsChange(next) {
    setContacts(next)
    saveDraft({ form, contacts: next, pricing })
  }

  function handlePricingChange(next) {
    setPricing(next)
    saveDraft({ form, contacts, pricing: next })
  }

  const isDirty = !!form.account_name || contacts.length > 0 || pricing.length > 0

  async function handleSave() {
    if (!form.account_name.trim()) { setError('Account name is required.'); return }
    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('distribution_accounts').insert({
      brewery_id:   breweryId,
      account_name: form.account_name.trim(),
      account_type: form.account_type || null,
      address:      form.address      || null,
      notes:        form.notes        || null,
      contacts:     contacts,
      pricing:      pricing.filter(r => r.package_type && r.price_per_unit),
      is_active:    true,
    })

    if (err) { setError(err.message); setSaving(false); return }
    clearDraft()
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Add Distribution Account"
      maxWidth="max-w-2xl"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <div className="space-y-4">
        {error && (
          <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <div>
          <label className={LBL}>Account Name *</label>
          <input type="text" className={INPUT_CLS} placeholder="e.g. The Rusty Tap" value={form.account_name} onChange={e => set('account_name', e.target.value)} />
        </div>

        <div>
          <label className={LBL}>Account Type</label>
          <select className={INPUT_CLS} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className={LBL}>Address</label>
          <input type="text" className={INPUT_CLS} placeholder="123 Main St, City, State" value={form.address} onChange={e => set('address', e.target.value)} />
        </div>

        <div>
          <label className={LBL}>Notes</label>
          <textarea rows={3} className={INPUT_CLS} placeholder="Payment terms, delivery preferences…" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <ContactsEditor contacts={contacts} onChange={handleContactsChange} />

        <div>
          <label className={LBL}>Pricing by Package Type &amp; Size</label>
          <PricingEditor pricing={pricing} onChange={handlePricingChange} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="bg-amber text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Account'}
          </button>
          <button onClick={onClose} className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── EditAccountModal ───────────────────────────────────────────────────────────

function EditAccountModal({ account, onClose, onSaved }) {
  const DRAFT_KEY = `modal_draft_distribution_edit_account_${account.id}`
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner } = useModalDraft(DRAFT_KEY)

  const defaultForm = {
    account_name: account.account_name || '',
    account_type: account.account_type || ACCOUNT_TYPES[0],
    address:      account.address      || '',
    notes:        account.notes        || '',
  }

  const [form, setForm]         = useState(() => {
    const draft = loadDraft(false)
    return draft?.form ?? defaultForm
  })
  const [contacts, setContacts] = useState(() => {
    const draft = loadDraft(false)
    return draft?.contacts ?? (account.contacts || [])
  })
  const [pricing, setPricing]   = useState(() => {
    const draft = loadDraft(false)
    return draft?.pricing ?? (account.pricing ?? [])
  })
  const [saving, setSaving]     = useState(false)
  const [error,  setError]      = useState(null)

  useEffect(() => {
    console.log('[EditAccountModal] ModalShell + useModalDraft active')
  }, [])

  function set(field, val) {
    const next = { ...form, [field]: val }
    setForm(next)
    saveDraft({ form: next, contacts, pricing })
  }

  function handleContactsChange(next) {
    setContacts(next)
    saveDraft({ form, contacts: next, pricing })
  }

  function handlePricingChange(next) {
    setPricing(next)
    saveDraft({ form, contacts, pricing: next })
  }

  const isDirty = form.account_name !== defaultForm.account_name || contacts.length !== (account.contacts?.length || 0)

  async function handleSave() {
    if (!form.account_name.trim()) { setError('Account name is required.'); return }
    setSaving(true)
    setError(null)

    const { error: err } = await supabase
      .from('distribution_accounts')
      .update({
        account_name: form.account_name.trim(),
        account_type: form.account_type || null,
        address:      form.address      || null,
        notes:        form.notes        || null,
        contacts:     contacts,
        pricing:      pricing.filter(r => r.package_type && r.price_per_unit),
      })
      .eq('id', account.id)

    if (err) { setError(err.message); setSaving(false); return }
    clearDraft()
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Edit — ${account.account_name}`}
      maxWidth="max-w-2xl"
      isDirty={isDirty}
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <div className="space-y-4">
        {error && (
          <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <div>
          <label className={LBL}>Account Name *</label>
          <input type="text" className={INPUT_CLS} placeholder="e.g. The Rusty Tap" value={form.account_name} onChange={e => set('account_name', e.target.value)} />
        </div>

        <div>
          <label className={LBL}>Account Type</label>
          <select className={INPUT_CLS} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className={LBL}>Address</label>
          <input type="text" className={INPUT_CLS} placeholder="123 Main St, City, State" value={form.address} onChange={e => set('address', e.target.value)} />
        </div>

        <div>
          <label className={LBL}>Notes</label>
          <textarea rows={3} className={INPUT_CLS} placeholder="Payment terms, delivery preferences…" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <ContactsEditor contacts={contacts} onChange={handleContactsChange} />

        <div>
          <label className={LBL}>Pricing by Package Type &amp; Size</label>
          <PricingEditor pricing={pricing} onChange={handlePricingChange} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="bg-amber text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
