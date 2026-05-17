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
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import LoadingSpinner from '../../components/LoadingSpinner'
import WorkflowWarningBanner from '../../components/WorkflowWarningBanner'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Shared CSS helpers ─────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

// ── Static data ────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  'Restaurant', 'Bar', 'Taproom', 'Retail Store', 'Distributor', 'Event', 'Other',
]

// Determines if a package_type string represents a returnable keg
function isKegType(type) {
  return (type || '').toLowerCase().includes('keg')
}

// localStorage key for tab persistence
const TAB_KEY = 'distribution_active_tab'

// ── Utility helpers ────────────────────────────────────────────────────────────

// Format a YYYY-MM-DD date string to a human-readable short date
function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Return today's date as YYYY-MM-DD for use as a default input value
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Format a number as a USD dollar string
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

  // Restore last-used tab from localStorage; default to 'assign'
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem(TAB_KEY) || 'assign'
  )

  const [packagingRuns,    setPackagingRuns]    = useState([])
  const [accounts,         setAccounts]         = useState([])
  const [distRecords,      setDistRecords]      = useState([])
  const [loading,          setLoading]          = useState(true)
  const [addAccountOpen,   setAddAccountOpen]   = useState(false)

  // Persist the active tab to localStorage on every change
  function switchTab(tab) {
    setActiveTab(tab)
    localStorage.setItem(TAB_KEY, tab)
  }

  // Load all three relevant tables in parallel
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
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Distribution</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track deliveries and manage wholesale accounts
          </p>
        </div>

        {/* Show "+ Add Account" only on the Accounts tab */}
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
              onClick={() => switchTab(key)}
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

// Lists all complete packaging runs. Each row has an "Assign Splits" button
// that opens AssignSplitsModal to map splits to distribution accounts.
function AssignTab({ packagingRuns, accounts, distRecords, breweryId, onRefresh, isReadOnly }) {
  const [assignTarget, setAssignTarget] = useState(null)

  // Compute workflow warnings for distribution
  const distributionWarnings = []

  // Required: kegs overdue for return
  const today = new Date().toISOString().slice(0, 10)
  const overdueKegs = distRecords.filter(r =>
    r.keg_return_expected && !r.keg_returned &&
    r.keg_return_date && r.keg_return_date < today
  )
  if (overdueKegs.length > 0) {
    distributionWarnings.push({
      message: `${overdueKegs.length} keg${overdueKegs.length > 1 ? 's' : ''} overdue for return`,
      severity: 'required',
    })
  }

  // Recommended: complete runs with no distribution records assigned
  const assignedBatchIds = new Set(distRecords.map(r => r.batch_package_id).filter(Boolean))
  const unassigned = packagingRuns.filter(r => r.batch_package_id && !assignedBatchIds.has(r.batch_package_id))
  if (unassigned.length > 0) {
    distributionWarnings.push({
      message: `${unassigned.length} packaged batch${unassigned.length > 1 ? 'es' : ''} not yet assigned to accounts`,
      severity: 'recommended',
    })
  }

  // Recommended: deliveries scheduled >7 days ago with no return confirmation
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const pendingDeliveries = distRecords.filter(r => r.delivery_date && r.delivery_date < sevenDaysAgo && !r.keg_returned && r.keg_return_expected)
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
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Batch', 'Beer', 'Style', 'Pkg Date', 'Total Packaged', 'Splits', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {packagingRuns.map(run => {
              // Use actual_splits if available, fall back to planned_splits
              const splits = (run.actual_splits?.length ? run.actual_splits : run.planned_splits) || []

              return (
                <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                  {/* Batch number badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="bg-navy/10 text-navy text-xs font-mono font-semibold px-2 py-1 rounded">
                      {run.batch_number || '—'}
                    </span>
                  </td>

                  {/* Beer name */}
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800">{run.beer_name}</div>
                  </td>

                  {/* Beer style */}
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {run.beer_style || '—'}
                  </td>

                  {/* Packaging date */}
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {fmtDate(run.packaging_date)}
                  </td>

                  {/* Total volume packaged */}
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {run.total_volume_packaged != null
                      ? `${run.total_volume_packaged} ${run.volume_unit || 'bbl'}`
                      : '—'}
                  </td>

                  {/* Split badge pills — one per package_type in the splits array */}
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

                  {/* Assign Splits action */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {!isReadOnly && (
                      <button
                        onClick={() => setAssignTarget(run)}
                        className="text-amber text-xs font-semibold hover:underline"
                      >
                        Assign Splits
                      </button>
                    )}
                    {isReadOnly && <span className="text-xs text-gray-400">Read only</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Assign splits modal */}
      {assignTarget && (
        <AssignSplitsModal
          run={assignTarget}
          accounts={accounts}
          distRecords={distRecords}
          breweryId={breweryId}
          onClose={() => setAssignTarget(null)}
          onSaved={() => { setAssignTarget(null); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── costPerUnit helper ─────────────────────────────────────────────────────────

// Converts a recipe cost-per-pint into a cost-per-unit for a given package type.
// Returns null if costPerPint is falsy or the package type is unknown.
function costPerUnit(packageType, costPerPint) {
  if (!costPerPint) return null
  // Pints of beer per unit, by package type
  const pints = {
    'Half Barrel':    248,
    'Quarter Barrel': 124,
    'Sixth Barrel':    82,
    '1/6 bbl':         82,
    '30L':             79,
    'Keg':            248,
    '12oz Cans':     0.75,
    '16oz Cans':     1,
    '22oz Bottles':  1.375,
    '750ml Bottles': 1.583,
    'Draft/Taproom': 1,
  }
  const p = pints[packageType] ?? 1
  return parseFloat(costPerPint) * p
}

// ── AssignSplitsModal ──────────────────────────────────────────────────────────

// For each split in the packaging run, shows a row where the user can choose
// an account, delivery date, and sale price, then saves distribution_records.
function AssignSplitsModal({ run, accounts, distRecords, breweryId, onClose, onSaved }) {
  // Use actual_splits if present, otherwise planned_splits
  const splits = (run.actual_splits?.length ? run.actual_splits : run.planned_splits) || []

  // Build initial row state: one entry per split
  const [rows, setRows] = useState(() =>
    splits.map((s, i) => ({
      key: i,
      package_type:        s.package_type || '',
      units_packaged:      s.units_packaged ?? '',
      volume:              s.total_volume ?? '',
      account_id:          '',
      delivery_date:       todayStr(),
      sale_price:          '',
      keg_return_expected: isKegType(s.package_type || ''),
      keg_return_date:     '',
    }))
  )

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  // When an account is selected, auto-populate sale price from the account's pricing array
  function handleAccountChange(idx, accountId) {
    const account = accounts.find(a => a.id === accountId)
    const packageType = rows[idx].package_type
    let autoPrice = ''
    if (account?.pricing) {
      // Fuzzy match: look for pricing row where package_type matches (case-insensitive, partial)
      const priceRow = account.pricing.find(p =>
        p.package_type && packageType &&
        (p.package_type.toLowerCase() === packageType.toLowerCase() ||
         packageType.toLowerCase().includes(p.package_type.toLowerCase()) ||
         p.package_type.toLowerCase().includes(packageType.toLowerCase()))
      )
      if (priceRow) autoPrice = String(priceRow.price_per_unit)
    }
    // Update the split row's accountId and salePrice
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, account_id: accountId, sale_price: autoPrice || r.sale_price } : r
    ))
  }

  // Check if a distribution_record already exists for this run + package_type
  function isAlreadyAssigned(packageType) {
    return distRecords.some(
      d => d.batch_package_id === run.batch_package_id && d.package_type === packageType
    )
  }

  // Update a single field in one row
  function updateRow(index, field, value) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  // Insert one distribution_record per row that has an account selected
  async function handleSave() {
    const toInsert = rows.filter(r => r.account_id)

    if (toInsert.length === 0) {
      setError('Select at least one account to assign a split.')
      return
    }

    setSaving(true)
    setError(null)

    const inserts = toInsert.map(r => {
      const units = parseFloat(r.units_packaged) || 0
      const price = parseFloat(r.sale_price) || 0
      return {
        brewery_id:          breweryId,
        batch_package_id:    run.batch_package_id || null,
        account_id:          r.account_id,
        delivery_date:       r.delivery_date || null,
        package_type:        r.package_type || null,
        units_delivered:     units || null,
        sale_price_per_unit: price || null,
        total_sale_value:    units && price ? units * price : null,
        keg_return_expected: r.keg_return_expected,
        keg_return_date:     r.keg_return_expected && r.keg_return_date ? r.keg_return_date : null,
        notes:               '',
      }
    })

    const { error: err } = await supabase.from('distribution_records').insert(inserts)

    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Assign Distribution — ${run.beer_name}`}
      maxWidth="max-w-4xl"
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
          <div className="space-y-4">
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-semibold uppercase tracking-wide px-1">
              <div className="col-span-2">Package Type</div>
              <div className="col-span-1 text-center">Units</div>
              <div className="col-span-3">Assign to Account</div>
              <div className="col-span-2">Delivery Date</div>
              <div className="col-span-2">Sale Price/Unit ($)</div>
              <div className="col-span-2">Keg Return</div>
            </div>

            {rows.map((row, i) => {
              const assigned = isAlreadyAssigned(row.package_type)
              return (
                <div
                  key={row.key}
                  className={`grid grid-cols-12 gap-2 items-start px-1 py-2 rounded-lg ${assigned ? 'bg-green-50' : 'bg-gray-50'}`}
                >
                  {/* Package type — read-only display */}
                  <div className="col-span-2">
                    <div className="text-sm font-medium text-gray-800">{row.package_type}</div>
                    {row.volume != null && row.volume !== '' && (
                      <div className="text-xs text-gray-400">{row.volume} {run.volume_unit || 'bbl'}</div>
                    )}
                  </div>

                  {/* Units */}
                  <div className="col-span-1 text-center text-sm text-gray-700 pt-1">
                    {row.units_packaged !== '' ? row.units_packaged : '—'}
                  </div>

                  {/* Account selector */}
                  <div className="col-span-3">
                    <select
                      className={INPUT_CLS}
                      value={row.account_id}
                      onChange={e => handleAccountChange(i, e.target.value)}
                      disabled={assigned}
                    >
                      <option value="">— Select account —</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.account_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Delivery date */}
                  <div className="col-span-2">
                    <input
                      type="date"
                      className={INPUT_CLS}
                      value={row.delivery_date}
                      onChange={e => updateRow(i, 'delivery_date', e.target.value)}
                      disabled={assigned}
                    />
                  </div>

                  {/* Sale price per unit */}
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={INPUT_CLS}
                      placeholder="e.g. 185.00"
                      value={row.sale_price}
                      onChange={e => updateRow(i, 'sale_price', e.target.value)}
                      disabled={assigned}
                    />
                    {parseFloat(row.sale_price) > 0 && parseFloat(row.units_packaged) > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Total: <span className="font-semibold text-navy">
                          ${(parseFloat(row.sale_price) * parseFloat(row.units_packaged)).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {/* ── Cost / profit breakdown ── */}
                    {parseFloat(row.sale_price) > 0 && run?.recipe_cost_per_pint && (() => {
                      const costPU   = costPerUnit(row.package_type, run.recipe_cost_per_pint)
                      const profitPU = costPU != null ? parseFloat(row.sale_price) - costPU : null
                      const qty      = parseFloat(row.units_packaged) || 0
                      return (
                        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1 mt-2">
                          <div className="flex justify-between text-gray-600">
                            <span>Cost per unit</span>
                            <span>${costPU?.toFixed(2) ?? '—'}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Sale price per unit</span>
                            <span>${parseFloat(row.sale_price).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-medium text-navy border-t pt-1 mt-1">
                            <span>Profit per unit</span>
                            <span className={profitPU >= 0 ? 'text-success' : 'text-danger'}>
                              ${profitPU?.toFixed(2) ?? '—'}
                            </span>
                          </div>
                          {qty > 0 && profitPU != null && (
                            <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                              <span>Total profit ({qty} units)</span>
                              <span className={profitPU >= 0 ? 'text-success' : 'text-danger'}>
                                ${(profitPU * qty).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Keg return toggle + expected return date */}
                  <div className="col-span-2 space-y-1.5">
                    {assigned ? (
                      <span className="bg-green-100 text-success text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                        Assigned
                      </span>
                    ) : (
                      <>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-amber"
                            checked={row.keg_return_expected}
                            onChange={e => updateRow(i, 'keg_return_expected', e.target.checked)}
                          />
                          <span className="text-xs text-gray-600">Return expected</span>
                        </label>
                        {/* Show expected return date when keg return is expected */}
                        {row.keg_return_expected && (
                          <div>
                            <label className={LBL}>Expected Return Date</label>
                            <input
                              type="date"
                              className={INPUT_CLS}
                              value={row.keg_return_date || ''}
                              onChange={e => updateRow(i, 'keg_return_date', e.target.value)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
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

// Full delivery log: summary stats, filterable table, inline keg return toggle,
// and edit/delete per row.
function DeliveriesTab({ distRecords, accounts, breweryId, onRefresh, isReadOnly }) {
  const [editTarget, setEditTarget] = useState(null)

  // Build account lookup map: id → account_name
  const accountMap = useMemo(() => {
    const m = {}
    for (const a of accounts) m[a.id] = a.account_name
    return m
  }, [accounts])

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalDeliveries = distRecords.length
  const totalRevenue    = distRecords.reduce((sum, d) => sum + (parseFloat(d.total_sale_value) || 0), 0)
  const kegsOut         = distRecords.filter(d => d.keg_return_expected && !d.keg_returned).length

  // ── Inline keg return toggle ───────────────────────────────────────────────
  // Records both the boolean and the actual return date when toggled
  async function handleKegReturned(recordId, returned) {
    const today = new Date().toISOString().slice(0, 10)
    await supabase
      .from('distribution_records')
      .update({
        keg_returned:      returned,
        keg_returned_date: returned ? today : null,
      })
      .eq('id', recordId)
    onRefresh()
  }

  // ── Delete a delivery record ───────────────────────────────────────────────
  async function handleDelete(record) {
    if (!window.confirm('Delete this delivery record? This cannot be undone.')) return
    await supabase.from('distribution_records').delete().eq('id', record.id)
    onRefresh()
  }

  return (
    <div className="space-y-6">

      {/* ── Summary stats bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Total Deliveries</div>
          <div className="text-2xl font-bold text-navy">{totalDeliveries}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-success">
            {totalRevenue > 0 ? fmtDollars(totalRevenue) : '—'}
          </div>
        </div>
        <div className={`bg-white border rounded-xl p-4 ${kegsOut > 0 ? 'border-amber' : 'border-gray-200'}`}>
          <div className="text-xs text-gray-500 mb-1">Kegs Out</div>
          <div className={`text-2xl font-bold ${kegsOut > 0 ? 'text-amber' : 'text-navy'}`}>
            {kegsOut}
          </div>
        </div>
      </div>

      {/* ── Delivery table ── */}
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
                {['Delivery Date', 'Account', 'Package Type', 'Units', 'Price/Unit', 'Total Value', 'Keg Return', 'Notes', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {distRecords.map(d => {
                const accountName = d.account_id ? (accountMap[d.account_id] || '—') : '—'
                return (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    {/* Delivery date */}
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {fmtDate(d.delivery_date)}
                    </td>

                    {/* Account name */}
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {accountName}
                    </td>

                    {/* Package type */}
                    <td className="px-4 py-3 text-gray-600">{d.package_type || '—'}</td>

                    {/* Units delivered */}
                    <td className="px-4 py-3 text-gray-700">{d.units_delivered ?? '—'}</td>

                    {/* Sale price per unit */}
                    <td className="px-4 py-3 text-gray-700">
                      {d.sale_price_per_unit != null ? fmtDollars(d.sale_price_per_unit) : '—'}
                    </td>

                    {/* Total sale value */}
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {fmtDollars(d.total_sale_value)}
                    </td>

                    {/* Keg return status + inline toggle */}
                    <td className="px-4 py-3">
                      {d.keg_return_expected ? (
                        d.keg_returned ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-success text-xs font-semibold">Returned ✓</span>
                            {/* Actual return date */}
                            {d.keg_returned_date && (
                              <span className="text-xs text-gray-400">
                                Returned on: {fmtDate(d.keg_returned_date)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {/* Expected return date with overdue/upcoming color coding */}
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

                    {/* Notes */}
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">
                      {d.notes || '—'}
                    </td>

                    {/* Edit / Delete actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {!isReadOnly && (
                        <div className="flex gap-3 items-center">
                          <button
                            onClick={() => setEditTarget(d)}
                            className="text-amber text-xs font-semibold hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(d)}
                            className="text-danger text-xs font-semibold hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit delivery modal */}
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

// Edit an existing distribution_record
function EditDeliveryModal({ record, accounts, onClose, onSaved }) {
  const [form, setForm] = useState({
    delivery_date:       record.delivery_date       || '',
    account_id:          record.account_id          || '',
    units_delivered:     record.units_delivered     ?? '',
    sale_price_per_unit: record.sale_price_per_unit ?? '',
    keg_return_expected: record.keg_return_expected || false,
    keg_return_date:     record.keg_return_date     || '',
    keg_returned:        record.keg_returned        || false,
    keg_returned_date:   record.keg_returned_date   || '',
    notes:               record.notes               || '',
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  // Computed total sale value shown as live read-only preview
  const computedTotal = form.units_delivered && form.sale_price_per_unit
    ? parseFloat(form.units_delivered) * parseFloat(form.sale_price_per_unit)
    : null

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
  }

  async function handleSave() {
    if (!form.delivery_date) { setError('Delivery date is required.'); return }
    setSaving(true)
    setError(null)

    const units = form.units_delivered !== '' ? parseFloat(form.units_delivered) : null
    const price = form.sale_price_per_unit !== '' ? parseFloat(form.sale_price_per_unit) : null

    const { error: err } = await supabase
      .from('distribution_records')
      .update({
        delivery_date:       form.delivery_date       || null,
        account_id:          form.account_id          || null,
        units_delivered:     units,
        sale_price_per_unit: price,
        total_sale_value:    units && price ? units * price : null,
        keg_return_expected: form.keg_return_expected,
        keg_return_date:     form.keg_return_expected && form.keg_return_date ? form.keg_return_date : null,
        keg_returned:        form.keg_returned,
        keg_returned_date:   form.keg_returned && form.keg_returned_date ? form.keg_returned_date : null,
        notes:               form.notes               || null,
      })
      .eq('id', record.id)

    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Edit Delivery Record"
      maxWidth="max-w-2xl"
      isDirty={true}
    >
      <div className="space-y-4">
        {error && (
          <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Delivery date */}
          <div>
            <label className={LBL}>Delivery Date *</label>
            <input
              type="date"
              className={INPUT_CLS}
              value={form.delivery_date}
              onChange={e => set('delivery_date', e.target.value)}
            />
          </div>

          {/* Account select */}
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

          {/* Units delivered */}
          <div>
            <label className={LBL}>Units Delivered</label>
            <input
              type="number"
              min="0"
              className={INPUT_CLS}
              placeholder="e.g. 10"
              value={form.units_delivered}
              onChange={e => set('units_delivered', e.target.value)}
            />
          </div>

          {/* Sale price per unit */}
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
        </div>

        {/* Computed total — read-only display */}
        <div>
          <label className={LBL}>Total Sale Value (computed)</label>
          <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-semibold">
            {computedTotal != null
              ? fmtDollars(computedTotal)
              : <span className="text-gray-400 font-normal">Set units + price above</span>}
          </div>
        </div>

        {/* Keg return expected toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="edit-keg-expected"
            className="w-4 h-4 accent-amber"
            checked={form.keg_return_expected}
            onChange={e => set('keg_return_expected', e.target.checked)}
          />
          <label htmlFor="edit-keg-expected" className="text-sm text-gray-700 font-medium">
            Keg Return Expected
          </label>
        </div>

        {/* Expected return date — only shown when keg return is expected */}
        {form.keg_return_expected && (
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

        {/* Keg returned toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="edit-keg-returned"
            className="w-4 h-4 accent-amber"
            checked={form.keg_returned}
            onChange={e => set('keg_returned', e.target.checked)}
          />
          <label htmlFor="edit-keg-returned" className="text-sm text-gray-700 font-medium">
            Kegs Returned
          </label>
        </div>

        {/* Actual return date — only shown when kegs have been returned */}
        {form.keg_returned && (
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

        {/* Notes */}
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

        {/* Action buttons */}
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

// Account cards grid — each card shows primary contact, address, notes, and action buttons.
function AccountsTab({ accounts, onRefresh, isReadOnly }) {
  const [editTarget,    setEditTarget]    = useState(null)
  const [expandedId,    setExpandedId]    = useState(null)  // which card is showing all contacts

  // Soft-delete: set is_active = false so the account stops appearing in selects
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
      {/* Account cards grid — 2 on md, 3 on xl */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map(account => {
          // Determine primary contact from the contacts jsonb array
          const contacts = account.contacts || []
          const primaryContact = contacts.find(c => c.is_primary) || contacts[0] || null
          const isExpanded = expandedId === account.id

          return (
            <div
              key={account.id}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow"
            >
              {/* Account name + type badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-gray-800 text-base leading-snug">{account.account_name}</div>
                <span className="bg-navy/10 text-navy text-xs font-medium px-2 py-0.5 rounded-full shrink-0">
                  {account.account_type || 'Other'}
                </span>
              </div>

              {/* Primary contact info */}
              {primaryContact && (
                <div className="space-y-0.5 text-sm text-gray-600">
                  {primaryContact.name  && <div>👤 {primaryContact.name}{primaryContact.title ? ` — ${primaryContact.title}` : ''}</div>}
                  {primaryContact.phone && <div>📞 {primaryContact.phone}</div>}
                  {primaryContact.email && <div>✉️ {primaryContact.email}</div>}
                </div>
              )}

              {/* Address */}
              {account.address && (
                <div className="text-xs text-gray-400">📍 {account.address}</div>
              )}

              {/* Notes (truncated) */}
              {account.notes && (
                <p className="text-xs text-gray-500 line-clamp-2">{account.notes}</p>
              )}

              {/* "View Contacts" — expands inline to list all contacts */}
              {contacts.length > 1 && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : account.id)}
                  className="text-xs text-amber font-semibold hover:underline"
                >
                  {isExpanded ? 'Hide Contacts' : `View All Contacts (${contacts.length})`}
                </button>
              )}

              {/* Expanded contacts list */}
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

              {/* Action buttons */}
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

      {/* Edit account modal */}
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

// ── PricingEditor ──────────────────────────────────────────────────────────────

// Package types that can have per-unit pricing set on a distribution account
const PRICEABLE_PACKAGE_TYPES = [
  'Can', 'Bottle', 'Keg Half Barrel', 'Keg Quarter Barrel', 'Keg Sixth Barrel',
  'Growler', 'Crowler', 'Draft',
]

// Reusable pricing editor used inside AddAccountModal and EditAccountModal.
// pricing: array of { package_type, price_per_unit }
// onChange: (newPricing) => void
function PricingEditor({ pricing, onChange }) {
  function addRow() {
    onChange([...pricing, { package_type: '', price_per_unit: '' }])
  }
  function updateRow(idx, field, val) {
    onChange(pricing.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }
  function removeRow(idx) {
    onChange(pricing.filter((_, i) => i !== idx))
  }
  return (
    <div className="space-y-2">
      {pricing.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <select
            value={row.package_type}
            onChange={e => updateRow(idx, 'package_type', e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">Package type…</option>
            {PRICEABLE_PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="relative w-32 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number" step="0.01" min="0"
              value={row.price_per_unit}
              onChange={e => updateRow(idx, 'price_per_unit', e.target.value)}
              placeholder="0.00"
              className={INPUT_CLS + ' pl-6'}
            />
          </div>
          <button onClick={() => removeRow(idx)} className="text-danger text-xs hover:underline shrink-0">Remove</button>
        </div>
      ))}
      <button onClick={addRow} className="text-amber text-sm font-medium hover:underline">
        + Add pricing row
      </button>
    </div>
  )
}

// ── ContactsEditor ─────────────────────────────────────────────────────────────

// Reusable inline contacts editor used inside AddAccountModal and EditAccountModal.
// contacts: array of { name, title, phone, email, is_primary }
// onChange: (newContacts) => void
function ContactsEditor({ contacts, onChange }) {
  // Add a blank contact row
  function addContact() {
    onChange([...contacts, { name: '', title: '', phone: '', email: '', is_primary: false }])
  }

  // Remove a contact by index
  function removeContact(i) {
    onChange(contacts.filter((_, idx) => idx !== i))
  }

  // Update one field on one contact
  function updateContact(i, field, value) {
    const updated = contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c)
    onChange(updated)
  }

  // Only one contact can be primary at a time — toggle clears others first
  function setPrimary(i) {
    const updated = contacts.map((c, idx) => ({ ...c, is_primary: idx === i }))
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</span>
        <button
          type="button"
          onClick={addContact}
          className="text-xs text-amber font-semibold hover:underline"
        >
          + Add Contact
        </button>
      </div>

      {contacts.length === 0 && (
        <p className="text-xs text-gray-400">No contacts added yet. Click "+ Add Contact" above.</p>
      )}

      {contacts.map((c, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Contact name */}
            <div>
              <label className={LBL}>Name</label>
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="Jane Smith"
                value={c.name}
                onChange={e => updateContact(i, 'name', e.target.value)}
              />
            </div>

            {/* Title */}
            <div>
              <label className={LBL}>Title</label>
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="Bar Manager"
                value={c.title}
                onChange={e => updateContact(i, 'title', e.target.value)}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={LBL}>Phone</label>
              <input
                type="tel"
                className={INPUT_CLS}
                placeholder="555-555-5555"
                value={c.phone}
                onChange={e => updateContact(i, 'phone', e.target.value)}
              />
            </div>

            {/* Email */}
            <div>
              <label className={LBL}>Email</label>
              <input
                type="email"
                className={INPUT_CLS}
                placeholder="jane@bar.com"
                value={c.email}
                onChange={e => updateContact(i, 'email', e.target.value)}
              />
            </div>
          </div>

          {/* Primary + Remove row */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-amber"
                checked={c.is_primary}
                onChange={() => setPrimary(i)}
              />
              Primary contact
            </label>
            <button
              type="button"
              onClick={() => removeContact(i)}
              className="text-danger text-xs font-semibold hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── AddAccountModal ────────────────────────────────────────────────────────────

// Modal for creating a new distribution account with multi-contact support
function AddAccountModal({ breweryId, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_name: '',
    account_type: ACCOUNT_TYPES[0],
    address:      '',
    notes:        '',
  })
  const [contacts, setContacts] = useState([])
  const [pricing,  setPricing]  = useState([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
  }

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
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Add Distribution Account"
      maxWidth="max-w-2xl"
      isDirty={!!form.account_name}
    >
      <div className="space-y-4">
        {error && (
          <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Account name */}
        <div>
          <label className={LBL}>Account Name *</label>
          <input
            type="text"
            className={INPUT_CLS}
            placeholder="e.g. The Rusty Tap"
            value={form.account_name}
            onChange={e => set('account_name', e.target.value)}
          />
        </div>

        {/* Account type */}
        <div>
          <label className={LBL}>Account Type</label>
          <select
            className={INPUT_CLS}
            value={form.account_type}
            onChange={e => set('account_type', e.target.value)}
          >
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Address */}
        <div>
          <label className={LBL}>Address</label>
          <input
            type="text"
            className={INPUT_CLS}
            placeholder="123 Main St, City, State"
            value={form.address}
            onChange={e => set('address', e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={LBL}>Notes</label>
          <textarea
            rows={3}
            className={INPUT_CLS}
            placeholder="Payment terms, delivery preferences, other notes…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        {/* Contacts section */}
        <ContactsEditor contacts={contacts} onChange={setContacts} />

        {/* Pricing section */}
        <div>
          <label className={LBL}>Pricing by Package Type</label>
          <PricingEditor pricing={pricing} onChange={setPricing} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Account'}
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

// ── EditAccountModal ───────────────────────────────────────────────────────────

// Modal for editing an existing distribution account — same fields as Add
function EditAccountModal({ account, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_name: account.account_name || '',
    account_type: account.account_type || ACCOUNT_TYPES[0],
    address:      account.address      || '',
    notes:        account.notes        || '',
  })
  const [contacts, setContacts] = useState(account.contacts || [])
  const [pricing,  setPricing]  = useState(account.pricing ?? [])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
  }

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
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Edit — ${account.account_name}`}
      maxWidth="max-w-2xl"
      isDirty={form.account_name !== (account.account_name || '')}
    >
      <div className="space-y-4">
        {error && (
          <div className="text-danger text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Account name */}
        <div>
          <label className={LBL}>Account Name *</label>
          <input
            type="text"
            className={INPUT_CLS}
            placeholder="e.g. The Rusty Tap"
            value={form.account_name}
            onChange={e => set('account_name', e.target.value)}
          />
        </div>

        {/* Account type */}
        <div>
          <label className={LBL}>Account Type</label>
          <select
            className={INPUT_CLS}
            value={form.account_type}
            onChange={e => set('account_type', e.target.value)}
          >
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Address */}
        <div>
          <label className={LBL}>Address</label>
          <input
            type="text"
            className={INPUT_CLS}
            placeholder="123 Main St, City, State"
            value={form.address}
            onChange={e => set('address', e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={LBL}>Notes</label>
          <textarea
            rows={3}
            className={INPUT_CLS}
            placeholder="Payment terms, delivery preferences, other notes…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        {/* Contacts section */}
        <ContactsEditor contacts={contacts} onChange={setContacts} />

        {/* Pricing section */}
        <div>
          <label className={LBL}>Pricing by Package Type</label>
          <PricingEditor pricing={pricing} onChange={setPricing} />
        </div>

        {/* Action buttons */}
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
