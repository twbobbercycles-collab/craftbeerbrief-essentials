/**
 * TaproomPage — Taproom Profitability Tracker.
 *
 * Shows what's currently on tap, margin per handle, side-by-side comparison,
 * and a history of past tap handles. All data comes from existing tables —
 * no new database tables are needed.
 *
 * Sections:
 *   1. What's On Tap      — card grid of active tap handles
 *   2. Tap Handle Comparison — sortable table of all active handles
 *   3. Historical Performance — past handles (kegs returned / kicked)
 *   4. Real-Time Pour Tracking Coming Soon — informational card
 *
 * Data sources:
 *   - distribution_records  — the main source (price, cost, delivery date, quantity)
 *   - packaging_runs        — joined via batch_package_id to get beer name, style, batch#
 */

import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Constants ──────────────────────────────────────────────────────────────────

// Gross margin thresholds for color coding
// Above MARGIN_HIGH = green, between LOW and HIGH = amber, below LOW = red
const MARGIN_HIGH = 60  // percent
const MARGIN_LOW  = 40  // percent

// Default estimate of pints poured per day per tap handle
const DEFAULT_DAILY_POURS = 50

// Pints per gallon — used to convert quantity (pints) to gallons for display
const PINTS_PER_GALLON = 8

// ── Pure helper functions (no React state, safe to call anywhere) ──────────────

// Formats a YYYY-MM-DD date string into a readable label like "Jan 5, 2026"
function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Formats a number to a dollar string like "$4.25" — returns "—" for missing values
function fmtDollar(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toFixed(2)
}

// Returns how many full days have passed since the given YYYY-MM-DD delivery date
function calcDaysOnTap(deliveryDate) {
  if (!deliveryDate) return 0
  const tapped = new Date(deliveryDate + 'T00:00:00')
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today - tapped) / 86400000))
}

// Computes gross margin per pint and margin percentage for a distribution record.
// Returns { marginPerPint, marginPct, level } where level is 'green' | 'amber' | 'red'.
function calcMargin(record) {
  const sale    = parseFloat(record.sale_price_per_unit)      || 0
  const ingCost = parseFloat(record.ingredient_cost_per_unit) || 0
  const pkgCost = parseFloat(record.packaging_cost_per_unit)  || 0
  const cost    = ingCost + pkgCost
  const marginPerPint = sale - cost
  const marginPct     = sale > 0 ? (marginPerPint / sale) * 100 : 0
  const level =
    marginPct >= MARGIN_HIGH ? 'green' :
    marginPct >= MARGIN_LOW  ? 'amber' :
    'red'
  return { marginPerPint, marginPct, level }
}

// Estimates pints still remaining on a tap handle given a daily pour rate.
// Starts from total quantity and subtracts estimated pours since delivery date.
function estimatedRemaining(record, dailyPours) {
  const total = parseFloat(record.quantity) || 0
  const days  = calcDaysOnTap(record.delivery_date)
  return Math.max(0, total - days * dailyPours)
}

// Looks up beer name, style, and batch number for a distribution record
// by finding the matching packaging run via batch_package_id
function getRunInfo(record, runMap) {
  const run = runMap[record.batch_package_id] || {}
  return {
    beerName:    run.beer_name    || 'Unnamed Beer',
    beerStyle:   run.beer_style   || '—',
    batchNumber: run.batch_number || null,
  }
}

// Returns true if the record is a draft or taproom package type (case-insensitive)
function isDraftType(record) {
  const pt = (record.package_type || '').toLowerCase()
  return pt.includes('draft') || pt.includes('taproom')
}

// ── Page root — TierGate wrapper ───────────────────────────────────────────────

export default function TaproomPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="draft_line_tracker"
      featureName="Taproom Profitability"
      featureDescription="Track what's on tap and see your margin per handle at a glance. Know which beers are your most profitable and when it's time to rotate a handle."
    >
      <TaproomPageInner />
    </TierGate>
  )
}

// ── Inner page — only rendered when the tier check passes ─────────────────────

function TaproomPageInner() {
  const { brewery } = useAuth()
  const { isReadOnly } = useReadOnly()

  // ── Data ──
  // Active tap handles: distribution records that are still on tap
  const [tapHandles, setTapHandles] = useState([])
  // Past tap handles: records that have been kicked (kegs_returned = true)
  const [historical, setHistorical] = useState([])
  // Lookup map: batch_package_id → packaging_run row (for beer name / style / batch#)
  const [runMap,     setRunMap]     = useState({})
  const [loading,    setLoading]    = useState(true)

  // ── UI ──
  // Which date range to show in the historical section
  const [histFilter, setHistFilter] = useState('last90')
  // Sort order for the comparison table
  const [sortBy,     setSortBy]     = useState('margin_high')
  // Per-handle daily pour estimate for projected revenue — { [recordId]: number }
  const [dailyPours, setDailyPours] = useState({})
  // Which record is open in the Edit Price modal (or null if closed)
  const [editTarget, setEditTarget] = useState(null)
  // ID of the record currently being marked as kicked (to show loading state)
  const [kicking,    setKicking]    = useState(null)
  const [pageError,  setPageError]  = useState('')

  // Load all data when the brewery is known
  useEffect(() => {
    if (!brewery?.id) return
    loadData()
  }, [brewery?.id])

  // Fetches active tap handles, all packaging runs (for beer names), and history
  async function loadData() {
    setLoading(true)
    // Only fetch records from the last 90 days for active handles
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

    const [activeRes, runsRes, historicalRes] = await Promise.all([
      // Active: not kicked, delivered within last 90 days
      supabase
        .from('distribution_records')
        .select('*')
        .eq('brewery_id', brewery.id)
        .or('kegs_returned.is.null,kegs_returned.eq.false')
        .gte('delivery_date', ninetyDaysAgo)
        .order('delivery_date', { ascending: false }),

      // All packaging runs — used to resolve beer name from batch_package_id
      supabase
        .from('packaging_runs')
        .select('id, beer_name, beer_style, batch_number, batch_package_id')
        .eq('brewery_id', brewery.id),

      // Historical: kicked handles (kegs_returned = true), newest first
      supabase
        .from('distribution_records')
        .select('*')
        .eq('brewery_id', brewery.id)
        .eq('kegs_returned', true)
        .order('keg_returned_date', { ascending: false }),
    ])

    // Build the batch_package_id → run lookup table
    const map = {}
    for (const run of runsRes.data ?? []) {
      if (run.batch_package_id) map[run.batch_package_id] = run
    }
    setRunMap(map)

    // Only keep draft/taproom package types
    setTapHandles((activeRes.data     ?? []).filter(isDraftType))
    setHistorical((historicalRes.data ?? []).filter(isDraftType))
    setLoading(false)
  }

  // Returns the daily pour estimate for a given record, defaulting to 50
  function getDailyPours(recordId) {
    return dailyPours[recordId] ?? DEFAULT_DAILY_POURS
  }

  // Updates the daily pour estimate for a given record (local state only, not persisted)
  function setPoursForRecord(recordId, value) {
    const n = Math.max(1, parseInt(value, 10) || DEFAULT_DAILY_POURS)
    setDailyPours(prev => ({ ...prev, [recordId]: n }))
  }

  // Marks a tap handle as kicked — sets kegs_returned = true and records today's date
  async function handleMarkKicked(record) {
    setKicking(record.id)
    const today = new Date().toISOString().slice(0, 10)
    const { error: err } = await supabase
      .from('distribution_records')
      .update({ kegs_returned: true, keg_returned_date: today })
      .eq('id', record.id)
    if (err) {
      setPageError('Failed to mark as kicked: ' + err.message)
    } else {
      await loadData()
    }
    setKicking(null)
  }

  // Called after the Edit Price modal successfully saves — close modal and refresh
  async function handlePriceSaved() {
    setEditTarget(null)
    await loadData()
  }

  // ── Sorted comparison table ────────────────────────────────────────────────

  // Builds the sorted list of active handles for the comparison table.
  // Computes margin and beer name for each row so we can sort by them.
  const sortedHandles = useMemo(() => {
    const rows = tapHandles.map(r => {
      const run = runMap[r.batch_package_id] || {}
      const { marginPerPint, marginPct } = calcMargin(r)
      return {
        ...r,
        _beerName:  run.beer_name || 'Unnamed Beer',
        _marginPct: marginPct,
        _margin:    marginPerPint,
        _days:      calcDaysOnTap(r.delivery_date),
      }
    })

    switch (sortBy) {
      case 'margin_high': return [...rows].sort((a, b) => b._marginPct - a._marginPct)
      case 'margin_low':  return [...rows].sort((a, b) => a._marginPct - b._marginPct)
      case 'days_on_tap': return [...rows].sort((a, b) => b._days - a._days)
      case 'beer_name':   return [...rows].sort((a, b) => a._beerName.localeCompare(b._beerName))
      default:            return rows
    }
  }, [tapHandles, sortBy, runMap])

  // ── Date-filtered historical records ──────────────────────────────────────

  // Filters the historical list based on the selected date range.
  // Uses keg_returned_date if available, otherwise falls back to delivery_date.
  const filteredHistorical = useMemo(() => {
    const cutoffMap = {
      last30:      new Date(Date.now() - 30  * 86400000).toISOString().slice(0, 10),
      last90:      new Date(Date.now() - 90  * 86400000).toISOString().slice(0, 10),
      last6months: new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10),
      all:         '1970-01-01',
    }
    const cutoff = cutoffMap[histFilter] ?? cutoffMap.last90
    return historical.filter(r => {
      const date = r.keg_returned_date || r.delivery_date || ''
      return date >= cutoff
    })
  }, [historical, histFilter])

  if (loading) return <LoadingSpinner message="Loading taproom data…" />

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Taproom Profitability</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Track what's on tap and see your margin per handle at a glance.
        </p>
      </div>

      {/* Error banner — shown when a server action fails */}
      {pageError && (
        <div className="bg-red-50 border border-danger text-danger text-sm rounded-lg px-4 py-3 flex items-center justify-between">
          <span>{pageError}</span>
          <button
            onClick={() => setPageError('')}
            className="text-danger hover:text-red-700 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Section 1: What's On Tap ── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-navy flex items-center gap-2">
            <span>🍺</span> What's On Tap
          </h2>
          {tapHandles.length > 0 && (
            <span className="bg-amber/20 text-amber text-xs font-semibold px-2 py-0.5 rounded">
              {tapHandles.length} {tapHandles.length === 1 ? 'handle' : 'handles'} active
            </span>
          )}
        </div>

        {tapHandles.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
            <p className="text-5xl mb-3">🍺</p>
            <p className="font-semibold text-navy mb-2">No Active Taproom Allocations</p>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              When you assign Draft/Taproom splits in the Distribution module they will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tapHandles.map(record => (
              <TapHandleCard
                key={record.id}
                record={record}
                runInfo={getRunInfo(record, runMap)}
                isReadOnly={isReadOnly}
                kicking={kicking === record.id}
                onEdit={() => setEditTarget(record)}
                onKick={() => handleMarkKicked(record)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: Tap Handle Comparison ── */}
      {tapHandles.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-navy flex items-center gap-2">
              <span>📊</span> Tap Handle Comparison
            </h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">Sort by:</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              >
                <option value="margin_high">Highest Margin</option>
                <option value="margin_low">Lowest Margin</option>
                <option value="days_on_tap">Days on Tap</option>
                <option value="beer_name">Beer Name</option>
              </select>
            </div>
          </div>

          {/* Table scrolls horizontally on small screens */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    'Beer', 'Days on Tap', 'Sale / Pint', 'Cost / Pint',
                    'Margin / Pint', 'Margin %', 'Daily Pours',
                    'Est. Pints Remaining', 'Proj. Revenue Remaining',
                  ].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedHandles.map(record => {
                  const { marginPerPint, marginPct, level } = calcMargin(record)
                  const pours       = getDailyPours(record.id)
                  const remaining   = estimatedRemaining(record, pours)
                  const projRevenue = remaining * (parseFloat(record.sale_price_per_unit) || 0)
                  const cost        = (parseFloat(record.ingredient_cost_per_unit) || 0) + (parseFloat(record.packaging_cost_per_unit) || 0)
                  const { beerName, beerStyle } = getRunInfo(record, runMap)
                  const marginColor = level === 'green' ? 'text-success' : level === 'amber' ? 'text-amber-dark' : 'text-danger'

                  return (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                      {/* Beer name + style */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{beerName}</p>
                        <p className="text-xs text-gray-400">{beerStyle}</p>
                      </td>

                      {/* Days on tap — amber warning if over 30 days */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={record._days > 30 ? 'text-amber-dark font-semibold' : 'text-gray-700'}>
                          {record._days}d
                        </span>
                        {record._days > 30 && (
                          <span className="ml-1 text-[10px] text-amber font-medium">⚠ rotate?</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {fmtDollar(record.sale_price_per_unit)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {fmtDollar(cost)}
                      </td>

                      {/* Margin per pint — color coded by tier */}
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${marginColor}`}>
                        {fmtDollar(marginPerPint)}
                      </td>
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${marginColor}`}>
                        {marginPct.toFixed(1)}%
                      </td>

                      {/* Editable daily pours estimate */}
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="1"
                          value={getDailyPours(record.id)}
                          onChange={e => setPoursForRecord(record.id, e.target.value)}
                          className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-amber"
                        />
                      </td>

                      {/* Projected pints remaining */}
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {remaining > 0
                          ? Math.round(remaining).toLocaleString()
                          : <span className="text-gray-400 text-xs">~Empty</span>
                        }
                      </td>

                      {/* Projected revenue remaining */}
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
                        {remaining > 0 ? fmtDollar(projRevenue) : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Section 3: Historical Performance ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-navy flex items-center gap-2">
            <span>📈</span> Historical Performance
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium">Date range:</label>
            <select
              value={histFilter}
              onChange={e => setHistFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            >
              <option value="last30">Last 30 Days</option>
              <option value="last90">Last 90 Days</option>
              <option value="last6months">Last 6 Months</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>

        {filteredHistorical.length === 0 ? (
          <div className="border border-gray-200 rounded-xl p-8 text-center text-gray-400">
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm font-medium">No historical taproom records for this period.</p>
            <p className="text-xs mt-1">Tap handles you mark as kicked will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Beer', 'Style', 'Date Tapped', 'Date Kicked', 'Days on Tap', 'Sale / Pint', 'Margin / Pint', 'Notes'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHistorical.map(record => {
                  const { marginPerPint, level } = calcMargin(record)
                  const { beerName, beerStyle }  = getRunInfo(record, runMap)
                  const marginColor = level === 'green' ? 'text-success' : level === 'amber' ? 'text-amber-dark' : 'text-danger'

                  // Calculate how many days it was on tap
                  // Use actual kicked date if available, otherwise fall back to today
                  const daysOnTap =
                    record.keg_returned_date && record.delivery_date
                      ? Math.max(0, Math.floor(
                          (new Date(record.keg_returned_date) - new Date(record.delivery_date + 'T00:00:00')) / 86400000
                        ))
                      : calcDaysOnTap(record.delivery_date)

                  return (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-800">{beerName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{beerStyle}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(record.delivery_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(record.keg_returned_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{daysOnTap}d</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {fmtDollar(record.sale_price_per_unit)}
                      </td>
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${marginColor}`}>
                        {fmtDollar(marginPerPint)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                        {record.notes || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 4: Future Integration Note ── */}
      <section>
        <div className="bg-navy/5 border border-navy/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0">📡</span>
            <div>
              <h3 className="font-semibold text-navy mb-1">Real-Time Pour Tracking Coming Soon</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Connect BarTrack, BeerSAVER, or other flow meter systems to get ounce-by-ounce pour
                data automatically. For now, track tap handles manually by marking kegs as kicked
                when they finish.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Edit Price modal — renders only when a record is selected for editing */}
      {editTarget && (
        <EditPriceModal
          record={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handlePriceSaved}
        />
      )}
    </div>
  )
}

// ── TapHandleCard — one card per active tap handle ────────────────────────────

// Displays profitability data for a single tap handle.
// Color-codes the margin badge: green ≥ 60%, amber 40–60%, red < 40%.
function TapHandleCard({ record, runInfo, isReadOnly, kicking, onEdit, onKick }) {
  const { beerName, beerStyle, batchNumber } = runInfo
  const { marginPerPint, marginPct, level }  = calcMargin(record)
  const daysOnTap = calcDaysOnTap(record.delivery_date)
  const cost      = (parseFloat(record.ingredient_cost_per_unit) || 0) + (parseFloat(record.packaging_cost_per_unit) || 0)
  const gallons   = ((parseFloat(record.quantity) || 0) / PINTS_PER_GALLON).toFixed(1)

  // Pick border + background color for the margin badge
  const marginBadgeCls = level === 'green'
    ? 'bg-green-50 border-success'
    : level === 'amber'
    ? 'bg-amber/10 border-amber'
    : 'bg-red-50 border-danger'

  // Text color for margin values
  const marginTextCls = level === 'green' ? 'text-success' : level === 'amber' ? 'text-amber-dark' : 'text-danger'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">

      {/* Card header: beer name + optional batch number badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-navy text-base leading-snug truncate">{beerName}</h3>
          {beerStyle !== '—' && (
            <p className="text-xs text-gray-400 mt-0.5">{beerStyle}</p>
          )}
        </div>
        {batchNumber && (
          <span className="bg-navy text-white text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0">
            {batchNumber}
          </span>
        )}
      </div>

      {/* Stats grid: 2 columns */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Date Tapped</p>
          <p className="font-medium text-gray-700 text-xs">{fmtDate(record.delivery_date)}</p>
        </div>

        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Days on Tap</p>
          <p className={`font-bold text-sm ${daysOnTap > 30 ? 'text-amber-dark' : 'text-navy'}`}>
            {daysOnTap}d
            {daysOnTap > 30 && (
              <span className="text-[10px] font-normal ml-1">⚠ rotate?</span>
            )}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Volume Allocated</p>
          <p className="font-medium text-gray-700 text-xs">
            {record.quantity
              ? <>{Math.round(record.quantity).toLocaleString()} pts <span className="text-gray-400">({gallons} gal)</span></>
              : '—'
            }
          </p>
        </div>

        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Sale Price / Pint</p>
          <p className="font-medium text-gray-700 text-xs">{fmtDollar(record.sale_price_per_unit)}</p>
        </div>

        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Cost / Pint</p>
          <p className="font-medium text-gray-700 text-xs">{fmtDollar(cost)}</p>
        </div>

        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Margin / Pint</p>
          <p className={`font-bold text-sm ${marginTextCls}`}>{fmtDollar(marginPerPint)}</p>
        </div>
      </div>

      {/* Gross margin percentage badge — prominently color coded */}
      <div className={`rounded-lg border px-3 py-2 flex items-center justify-between ${marginBadgeCls}`}>
        <span className="text-xs font-medium text-gray-600">Gross Margin</span>
        <span className={`text-xl font-bold ${marginTextCls}`}>{marginPct.toFixed(1)}%</span>
      </div>

      {/* Action buttons — hidden in read-only mode */}
      {!isReadOnly && (
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 border border-amber text-amber font-medium py-1.5 rounded-lg text-xs hover:bg-amber hover:text-white transition-colors"
          >
            Edit Price
          </button>
          <button
            onClick={onKick}
            disabled={kicking}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-1.5 rounded-lg text-xs hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {kicking ? 'Marking…' : 'Mark as Kicked'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── EditPriceModal — update sale price per pint for a tap handle ──────────────

// Lets the brewer update the sale_price_per_unit stored on a distribution record.
// Uses ModalShell for the discard guard and useModalDraft for draft persistence.
function EditPriceModal({ record, onClose, onSaved }) {
  const {
    loadDraft, saveDraft, clearDraft,
    draftRestored, dismissDraftBanner,
  } = useModalDraft('modal_draft_taproom_edit_price')

  // Load the draft price if one was saved, otherwise start from the record's current price
  const [price,  setPrice]  = useState(() => {
    const d = loadDraft(false)
    return d?.price ?? String(record.sale_price_per_unit ?? '')
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Log once when the modal mounts to confirm ModalShell + useModalDraft are wired up
  useEffect(() => {
    console.log('[EditPriceModal] ModalShell + useModalDraft active')
  }, [])

  // Update local state and save a draft on every keystroke
  function handlePriceChange(val) {
    setPrice(val)
    saveDraft({ price: val })
  }

  // Saves the new price to the database and calls onSaved to close and reload
  async function handleSave() {
    const newPrice = parseFloat(price)
    if (isNaN(newPrice) || newPrice < 0) {
      setError('Please enter a valid price greater than $0.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('distribution_records')
      .update({ sale_price_per_unit: newPrice })
      .eq('id', record.id)
    if (err) {
      setError('Save failed: ' + err.message)
      setSaving(false)
      return
    }
    clearDraft()
    onSaved()
  }

  // The modal is "dirty" (has unsaved changes) when the price differs from the DB value
  const isDirty = String(price) !== String(record.sale_price_per_unit ?? '')

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      isDirty={isDirty}
      title="Edit Tap Price"
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Update the sale price per pint for this tap handle. The new price will be reflected in
          the margin calculations immediately.
        </p>

        {error && (
          <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Sale Price per Pint ($)</label>
          <input
            type="number"
            step="0.25"
            min="0"
            value={price}
            onChange={e => handlePriceChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            placeholder="e.g. 6.50"
            autoFocus
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-amber text-white font-semibold py-2 rounded-lg text-sm hover:bg-amber-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Price'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
