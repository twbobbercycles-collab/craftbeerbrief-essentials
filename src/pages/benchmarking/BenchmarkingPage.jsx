// BenchmarkingPage — Full Suite Module 4: Taproom Revenue Benchmarking Dashboard
/**
 * Lets brewery owners enter monthly taproom metrics and compare their performance
 * against Brewers Association industry benchmark ranges.
 *
 * Two sections:
 *   1. Monthly Entry — month selector, input form with auto-save on blur, KPI bars
 *   2. Trends — 12-month rolling charts (revenue trend, key metrics, revenue composition)
 *      plus a summary table.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import LoadingSpinner from '../../components/LoadingSpinner'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Industry benchmark ranges ─────────────────────────────────────────────────
// Sourced from Brewers Association small-to-mid-size craft taproom data.
const INDUSTRY_BENCHMARKS = {
  revenue_per_sqft_annual:  { low: 180,  median: 285,  high: 420,  unit: '$/sq ft/year' },
  labor_pct_revenue:        { low: 25,   median: 32,   high: 40,   unit: '% of revenue' },
  avg_transaction:          { low: 14,   median: 19,   high: 28,   unit: '$/transaction' },
  revenue_per_operating_day:{ low: 800,  median: 1800, high: 4200, unit: '$/day' },
  food_pct_revenue:         { low: 0,    median: 12,   high: 28,   unit: '% of revenue' },
  event_pct_revenue:        { low: 2,    median: 8,    high: 18,   unit: '% of revenue' },
}

// ── Shared style tokens ───────────────────────────────────────────────────────
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-amber/40'
const LBL   = 'block text-xs font-semibold text-gray-500 mb-1'

// Brand colours used in charts
const AMBER  = '#C8871A'
const NAVY   = '#1A2744'
const GREEN  = '#16a34a'
const TEAL   = '#0d9488'
const PURPLE = '#7c3aed'
const ORANGE = '#ea580c'

// ── Utilities ─────────────────────────────────────────────────────────────────

// Returns the first day of the current month in YYYY-MM-DD format
function thisMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Formats a YYYY-MM-DD month string as "May 2026"
function fmtMonth(monthStr) {
  if (!monthStr) return ''
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Formats a dollar amount with commas, e.g. 1234 → "$1,234"
function fmtDollar(n) {
  if (n == null || n === '') return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Builds an array of the last N month strings in YYYY-MM-DD format, oldest first
function lastNMonths(n) {
  const months = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}

// Computes the four core KPIs from a metrics row; returns nulls if data is insufficient
function computeKpis(row) {
  if (!row) return {}
  const rev    = parseFloat(row.taproom_revenue) || 0
  const sqft   = parseFloat(row.taproom_sqft)    || 0
  const txns   = parseInt(row.total_transactions, 10) || 0
  const days   = parseInt(row.num_operating_days, 10) || 0
  const labor  = parseFloat(row.labor_cost)      || 0
  const food   = parseFloat(row.food_revenue)    || 0
  const events = parseFloat(row.event_revenue)   || 0
  return {
    revenue_per_sqft_annual:   sqft > 0 && rev > 0  ? (rev / sqft) * 12 : null,
    labor_pct_revenue:         rev > 0              ? (labor / rev) * 100 : null,
    avg_transaction:           txns > 0             ? rev / txns : null,
    revenue_per_operating_day: days > 0             ? rev / days : null,
    food_pct_revenue:          rev > 0              ? (food / rev) * 100 : null,
    event_pct_revenue:         rev > 0              ? (events / rev) * 100 : null,
  }
}

// Returns 'green' | 'amber' | 'red' based on where value sits vs. benchmark
function benchmarkColor(key, value) {
  if (value == null) return 'gray'
  const b = INDUSTRY_BENCHMARKS[key]
  if (!b) return 'gray'
  // For labor_pct_revenue: lower is better (reverse the colour logic)
  const inverseKeys = ['labor_pct_revenue']
  const isInverse = inverseKeys.includes(key)
  if (isInverse) {
    if (value <= b.median) return 'green'
    if (value <= b.high)   return 'amber'
    return 'red'
  }
  if (value >= b.median) return 'green'
  if (value >= b.low)    return 'amber'
  return 'red'
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function BenchmarkingPage() {
  return (
    <TierGate requiredTier="full_suite" featureKey="revenue_benchmarking">
      <BenchmarkingDashboard />
    </TierGate>
  )
}

// ── BenchmarkingDashboard ─────────────────────────────────────────────────────

function BenchmarkingDashboard() {
  const { brewery } = useAuth()
  const [activeTab, setTab] = usePersistedTab('benchmarking_tab', 'entry')

  // All 12 months of metrics loaded once; individual month data is sliced from this
  const [allMetrics, setAllMetrics] = useState([])
  const [loading,    setLoading]    = useState(true)

  // Load all taproom_metrics rows for the last 13 months in one query
  const loadMetrics = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const oldest = lastNMonths(13)[0]
    const { data } = await supabase
      .from('taproom_metrics')
      .select('*')
      .eq('brewery_id', brewery.id)
      .gte('metric_month', oldest)
      .order('metric_month', { ascending: true })
    setAllMetrics(data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadMetrics() }, [loadMetrics])

  if (loading) return <LoadingSpinner message="Loading benchmarking data…" />

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-navy">Taproom Revenue Benchmarking</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Track your taproom performance and compare against industry benchmarks.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['entry', 'Monthly Entry'], ['trends', 'Performance Trends']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-amber text-amber'
                : 'border-transparent text-gray-500 hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'entry' && (
        <MonthlyEntryTab
          allMetrics={allMetrics}
          brewery={brewery}
          onSaved={loadMetrics}
        />
      )}
      {activeTab === 'trends' && (
        <TrendsTab allMetrics={allMetrics} />
      )}
    </div>
  )
}

// ── TAB 1: Monthly Entry ──────────────────────────────────────────────────────

function MonthlyEntryTab({ allMetrics, brewery, onSaved }) {
  // Selected month defaults to the current month
  const [selectedMonth, setSelectedMonth] = useState(thisMonthStr())
  const [savedFlash,    setSavedFlash]    = useState(false)
  const saveTimer = useRef(null)

  // Find the existing row for the selected month (may be null)
  const existingRow = useMemo(
    () => allMetrics.find(m => m.metric_month === selectedMonth) ?? null,
    [allMetrics, selectedMonth]
  )

  // Carry taproom_sqft forward from the most recent row that has it
  const carriedSqft = useMemo(() => {
    const withSqft = [...allMetrics].reverse().find(m => m.taproom_sqft && m.metric_month <= selectedMonth)
    return withSqft?.taproom_sqft ?? ''
  }, [allMetrics, selectedMonth])

  const EMPTY_FORM = {
    taproom_revenue:      '',
    taproom_sqft:         '',
    total_transactions:   '',
    num_operating_days:   '',
    labor_hours:          '',
    labor_cost:           '',
    food_revenue:         '',
    merchandise_revenue:  '',
    event_revenue:        '',
    notes:                '',
  }

  const [form, setForm] = useState(EMPTY_FORM)

  // When the selected month or existing row changes, reload the form
  useEffect(() => {
    if (existingRow) {
      setForm({
        taproom_revenue:     existingRow.taproom_revenue     ?? '',
        taproom_sqft:        existingRow.taproom_sqft        ?? carriedSqft,
        total_transactions:  existingRow.total_transactions  ?? '',
        num_operating_days:  existingRow.num_operating_days  ?? '',
        labor_hours:         existingRow.labor_hours         ?? '',
        labor_cost:          existingRow.labor_cost          ?? '',
        food_revenue:        existingRow.food_revenue        ?? '',
        merchandise_revenue: existingRow.merchandise_revenue ?? '',
        event_revenue:       existingRow.event_revenue       ?? '',
        notes:               existingRow.notes               ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, taproom_sqft: carriedSqft })
    }
  }, [selectedMonth, existingRow])

  // Auto-save on blur: upsert the current form state into taproom_metrics
  async function autoSave(latestForm) {
    if (!latestForm.taproom_revenue && !latestForm.total_transactions) return // nothing meaningful yet
    const payload = {
      brewery_id:          brewery.id,
      metric_month:        selectedMonth,
      taproom_revenue:     parseFloat(latestForm.taproom_revenue)     || 0,
      taproom_sqft:        parseFloat(latestForm.taproom_sqft)        || null,
      total_transactions:  parseInt(latestForm.total_transactions, 10) || 0,
      num_operating_days:  parseInt(latestForm.num_operating_days, 10) || 0,
      labor_hours:         parseFloat(latestForm.labor_hours)          || 0,
      labor_cost:          parseFloat(latestForm.labor_cost)           || 0,
      food_revenue:        parseFloat(latestForm.food_revenue)         || 0,
      merchandise_revenue: parseFloat(latestForm.merchandise_revenue)  || 0,
      event_revenue:       parseFloat(latestForm.event_revenue)        || 0,
      notes:               latestForm.notes || null,
    }
    await supabase
      .from('taproom_metrics')
      .upsert(payload, { onConflict: 'brewery_id,metric_month' })

    // Flash "Saved ✓" briefly then refresh the parent list
    setSavedFlash(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSavedFlash(false), 2500)
    onSaved()
  }

  // Called on every input blur
  function handleBlur() {
    autoSave(form)
  }

  // Updates a single form field and stores the updated form for the next auto-save
  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  // Also pull event revenue for the selected month from taproom_events on mount/month change
  useEffect(() => {
    pullEventRevenue()
  }, [selectedMonth, brewery?.id])

  async function pullEventRevenue() {
    if (!brewery?.id) return
    // Month boundaries: e.g. 2026-05-01 to 2026-05-31
    const [y, m] = selectedMonth.split('-').map(Number)
    const start  = selectedMonth
    const end    = new Date(y, m, 0).toISOString().slice(0, 10) // last day of month
    const { data } = await supabase
      .from('taproom_events')
      .select('actual_beer_revenue, actual_food_revenue, ticket_revenue')
      .eq('brewery_id', brewery.id)
      .eq('status', 'completed')
      .gte('event_date', start)
      .lte('event_date', end)
    if (!data || data.length === 0) return
    const total = data.reduce((sum, e) => {
      return sum
        + (parseFloat(e.actual_beer_revenue) || 0)
        + (parseFloat(e.actual_food_revenue) || 0)
        + (parseFloat(e.ticket_revenue) || 0)
    }, 0)
    // Only pre-fill if the field is currently empty (don't overwrite manual entry)
    setForm(prev => ({
      ...prev,
      event_revenue: prev.event_revenue !== '' ? prev.event_revenue : total > 0 ? String(total) : '',
    }))
  }

  // Computed KPIs from the current form values
  const kpis = useMemo(() => computeKpis({
    taproom_revenue:    form.taproom_revenue,
    taproom_sqft:       form.taproom_sqft,
    total_transactions: form.total_transactions,
    num_operating_days: form.num_operating_days,
    labor_cost:         form.labor_cost,
    food_revenue:       form.food_revenue,
    event_revenue:      form.event_revenue,
  }), [form])

  // Build a list of the last 13 months for the month picker
  const monthOptions = useMemo(() => lastNMonths(13), [])

  return (
    <div className="space-y-6">
      {/* Month selector + saved indicator */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className={LBL}>Month</label>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className={`${INPUT} w-48`}
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>{fmtMonth(m)}</option>
            ))}
          </select>
        </div>
        {savedFlash && (
          <span className="text-sm text-green-600 font-semibold mt-4">Saved ✓</span>
        )}
      </div>

      {/* Data entry form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-navy mb-4">
          {fmtMonth(selectedMonth)} — Taproom Metrics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Revenue */}
          <div>
            <label className={LBL}>Taproom Revenue ($) *</label>
            <input
              type="number" min="0" step="0.01"
              value={form.taproom_revenue}
              onChange={e => setField('taproom_revenue', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="e.g. 18500"
            />
          </div>
          {/* Square footage */}
          <div>
            <label className={LBL}>Square Footage</label>
            <input
              type="number" min="0" step="1"
              value={form.taproom_sqft}
              onChange={e => setField('taproom_sqft', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="e.g. 1800"
            />
          </div>
          {/* Transactions */}
          <div>
            <label className={LBL}>Total Transactions</label>
            <input
              type="number" min="0" step="1"
              value={form.total_transactions}
              onChange={e => setField('total_transactions', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="e.g. 640"
            />
          </div>
          {/* Operating days */}
          <div>
            <label className={LBL}>Operating Days</label>
            <input
              type="number" min="0" max="31" step="1"
              value={form.num_operating_days}
              onChange={e => setField('num_operating_days', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="e.g. 26"
            />
          </div>
          {/* Labor hours */}
          <div>
            <label className={LBL}>Labor Hours</label>
            <input
              type="number" min="0" step="0.5"
              value={form.labor_hours}
              onChange={e => setField('labor_hours', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="e.g. 240"
            />
          </div>
          {/* Labor cost */}
          <div>
            <label className={LBL}>Labor Cost ($)</label>
            <input
              type="number" min="0" step="0.01"
              value={form.labor_cost}
              onChange={e => setField('labor_cost', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="e.g. 5600"
            />
          </div>
          {/* Food revenue */}
          <div>
            <label className={LBL}>Food Revenue ($)</label>
            <input
              type="number" min="0" step="0.01"
              value={form.food_revenue}
              onChange={e => setField('food_revenue', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="Optional"
            />
          </div>
          {/* Merch revenue */}
          <div>
            <label className={LBL}>Merchandise Revenue ($)</label>
            <input
              type="number" min="0" step="0.01"
              value={form.merchandise_revenue}
              onChange={e => setField('merchandise_revenue', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="Optional"
            />
          </div>
          {/* Event revenue */}
          <div>
            <label className={LBL}>Event Revenue ($)</label>
            <input
              type="number" min="0" step="0.01"
              value={form.event_revenue}
              onChange={e => setField('event_revenue', e.target.value)}
              onBlur={handleBlur}
              className={INPUT}
              placeholder="Optional"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Auto-pulled from Events module if events are logged for this month.
            </p>
          </div>
        </div>
        {/* Notes — full width */}
        <div className="mt-4">
          <label className={LBL}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            onBlur={handleBlur}
            rows={2}
            className={INPUT}
            placeholder="Anything noteworthy about this month…"
          />
        </div>
        <p className="text-xs text-gray-400 mt-3">Fields auto-save when you leave each input.</p>
      </div>

      {/* KPI comparison bars — only shown once revenue is entered */}
      {parseFloat(form.taproom_revenue) > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy">Benchmark Comparison — {fmtMonth(selectedMonth)}</h3>
            <p className="text-[10px] text-gray-400">
              Benchmarks from Brewers Association industry data. Ranges represent small to mid-size craft taprooms.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BenchmarkBar
              label="Revenue per Sq Ft (annualized)"
              value={kpis.revenue_per_sqft_annual}
              benchKey="revenue_per_sqft_annual"
              format={v => v != null ? `$${v.toFixed(0)}` : null}
            />
            <BenchmarkBar
              label="Labor % of Revenue"
              value={kpis.labor_pct_revenue}
              benchKey="labor_pct_revenue"
              format={v => v != null ? `${v.toFixed(1)}%` : null}
            />
            <BenchmarkBar
              label="Average Transaction Value"
              value={kpis.avg_transaction}
              benchKey="avg_transaction"
              format={v => v != null ? `$${v.toFixed(2)}` : null}
            />
            <BenchmarkBar
              label="Revenue per Operating Day"
              value={kpis.revenue_per_operating_day}
              benchKey="revenue_per_operating_day"
              format={v => v != null ? fmtDollar(v) : null}
            />
            {kpis.food_pct_revenue != null && (
              <BenchmarkBar
                label="Food % of Revenue"
                value={kpis.food_pct_revenue}
                benchKey="food_pct_revenue"
                format={v => `${v.toFixed(1)}%`}
              />
            )}
            {kpis.event_pct_revenue != null && (
              <BenchmarkBar
                label="Event % of Revenue"
                value={kpis.event_pct_revenue}
                benchKey="event_pct_revenue"
                format={v => `${v.toFixed(1)}%`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── BenchmarkBar component ────────────────────────────────────────────────────
/**
 * A horizontal progress-bar showing where the brewery's value falls within
 * the low–high benchmark range. A dot marks the exact position.
 * Color: green (≥ median), amber (≥ low), red (< low).
 * For inverse metrics (labor %) the colour logic is reversed.
 */
function BenchmarkBar({ label, value, benchKey, format }) {
  const bench = INDUSTRY_BENCHMARKS[benchKey]
  const color = benchmarkColor(benchKey, value)

  const colorMap = {
    green: { bar: 'bg-green-500', text: 'text-green-600' },
    amber: { bar: 'bg-amber',     text: 'text-amber' },
    red:   { bar: 'bg-danger',    text: 'text-danger' },
    gray:  { bar: 'bg-gray-300',  text: 'text-gray-400' },
  }
  const { bar: barColor, text: textColor } = colorMap[color]

  // Position as a percentage of the low-to-high range (clamped 0–100)
  const dotPct = value != null
    ? Math.min(100, Math.max(0, ((value - bench.low) / (bench.high - bench.low)) * 100))
    : null
  // Median position on the bar
  const medianPct = ((bench.median - bench.low) / (bench.high - bench.low)) * 100

  const displayValue = format ? format(value) : (value != null ? String(value) : null)
  const hasData = value != null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600">{label}</p>
        {hasData ? (
          <p className={`text-sm font-bold ${textColor}`}>{displayValue}</p>
        ) : (
          <p className="text-xs text-gray-400">Enter data above</p>
        )}
      </div>

      {/* Bar track */}
      <div className="relative h-3 bg-gray-100 rounded-full">
        {/* Filled portion from left edge to the value dot */}
        {hasData && (
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${dotPct}%` }}
          />
        )}
        {/* Median tick */}
        <div
          className="absolute top-0 h-full w-0.5 bg-navy/30"
          style={{ left: `${medianPct}%` }}
          title={`Median: ${bench.median} ${bench.unit}`}
        />
        {/* Value dot */}
        {hasData && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm ${barColor}`}
            style={{ left: `calc(${dotPct}% - 8px)` }}
          />
        )}
      </div>

      {/* Range labels */}
      <div className="flex justify-between mt-1 text-[10px] text-gray-400">
        <span>Low: {bench.unit.startsWith('$') || bench.unit.startsWith('$/') ? '$' : ''}{bench.low}{bench.unit.includes('%') ? '%' : ''}</span>
        <span className="text-navy/40 font-semibold">Median: {bench.unit.startsWith('$') || bench.unit.startsWith('$/') ? '$' : ''}{bench.median}{bench.unit.includes('%') ? '%' : ''}</span>
        <span>High: {bench.unit.startsWith('$') || bench.unit.startsWith('$/') ? '$' : ''}{bench.high}{bench.unit.includes('%') ? '%' : ''}</span>
      </div>
    </div>
  )
}

// ── TAB 2: Performance Trends ─────────────────────────────────────────────────

function TrendsTab({ allMetrics }) {
  // Build a full 12-month array; months with no data get null KPIs
  const months12 = useMemo(() => lastNMonths(12), [])

  // Join metrics rows into the 12-month scaffold
  const chartData = useMemo(() => {
    const map = Object.fromEntries(allMetrics.map(m => [m.metric_month, m]))
    return months12.map(month => {
      const row  = map[month] ?? null
      const kpis = computeKpis(row)
      const rev  = row ? parseFloat(row.taproom_revenue) || 0 : null
      const days = row ? parseInt(row.num_operating_days, 10) || 0 : 0
      return {
        month,
        label: fmtMonth(month),
        taproom_revenue:     rev,
        food_revenue:        row ? parseFloat(row.food_revenue)         || 0 : null,
        merchandise_revenue: row ? parseFloat(row.merchandise_revenue)  || 0 : null,
        event_revenue:       row ? parseFloat(row.event_revenue)        || 0 : null,
        // Beer revenue = taproom total minus food/merch/event (may be negative if data is wrong, clamp to 0)
        beer_revenue: rev != null
          ? Math.max(0, rev - (parseFloat(row.food_revenue)||0) - (parseFloat(row.merchandise_revenue)||0) - (parseFloat(row.event_revenue)||0))
          : null,
        labor_pct:     kpis.labor_pct_revenue,
        avg_txn:       kpis.avg_transaction,
        rev_per_day:   kpis.revenue_per_operating_day,
        // Benchmark reference: median revenue-per-day × operating days this month
        bench_rev:     days > 0 ? INDUSTRY_BENCHMARKS.revenue_per_operating_day.median * days : null,
      }
    })
  }, [allMetrics, months12])

  // 12-month summary statistics
  const summary = useMemo(() => {
    const rows = chartData.filter(d => d.taproom_revenue != null && d.taproom_revenue > 0)
    if (rows.length === 0) return null
    const revs     = rows.map(d => d.taproom_revenue)
    const total    = revs.reduce((a, b) => a + b, 0)
    const avg      = total / rows.length
    const best     = Math.max(...revs)
    const worst    = Math.min(...revs)
    const bestMon  = rows[revs.indexOf(best)].label
    const worstMon = rows[revs.indexOf(worst)].label

    const laborVals = rows.map(d => d.labor_pct).filter(v => v != null)
    const txnVals   = rows.map(d => d.avg_txn).filter(v => v != null)
    const dayVals   = rows.map(d => d.rev_per_day).filter(v => v != null)
    const avg12 = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    return {
      total, avg, best, worst, bestMon, worstMon, months: rows.length,
      avgLaborPct: avg12(laborVals),
      avgAvgTxn:   avg12(txnVals),
      avgRevDay:   avg12(dayVals),
    }
  }, [chartData])

  const hasAnyData = chartData.some(d => d.taproom_revenue != null)

  if (!hasAnyData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
        <p className="text-3xl mb-2">📈</p>
        <p className="text-sm">No monthly metrics yet. Enter data on the Monthly Entry tab to see trends here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── Chart 1: Monthly Revenue Trend ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-navy mb-1">Monthly Revenue Trend</h3>
        <p className="text-xs text-gray-400 mb-4">Your taproom revenue vs. the industry median benchmark (dotted).</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [fmtDollar(v), name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="taproom_revenue"
              name="Your Revenue"
              stroke={AMBER}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="bench_rev"
              name="Median Benchmark"
              stroke={NAVY}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Chart 2: Key Metrics Over Time ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-navy mb-1">Key Metrics Over Time</h3>
        <p className="text-xs text-gray-400 mb-4">
          Labor %, average transaction, and revenue per operating day — dotted lines show industry medians.
        </p>

        {/* Labor % chart */}
        <p className="text-xs font-semibold text-gray-500 mb-1">Labor % of Revenue</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 4, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 'auto']} />
            <Tooltip formatter={v => [`${v != null ? v.toFixed(1) : '—'}%`, 'Labor %']} />
            <ReferenceLine y={INDUSTRY_BENCHMARKS.labor_pct_revenue.median} stroke={NAVY} strokeDasharray="4 3" strokeOpacity={0.4} label={{ value: 'Median', fontSize: 10, fill: '#6b7280', position: 'right' }} />
            <Line type="monotone" dataKey="labor_pct" name="Labor %" stroke={ORANGE} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>

        {/* Avg transaction chart */}
        <p className="text-xs font-semibold text-gray-500 mt-5 mb-1">Average Transaction Value</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 4, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10 }} domain={[0, 'auto']} />
            <Tooltip formatter={v => [v != null ? `$${v.toFixed(2)}` : '—', 'Avg Transaction']} />
            <ReferenceLine y={INDUSTRY_BENCHMARKS.avg_transaction.median} stroke={NAVY} strokeDasharray="4 3" strokeOpacity={0.4} label={{ value: 'Median', fontSize: 10, fill: '#6b7280', position: 'right' }} />
            <Line type="monotone" dataKey="avg_txn" name="Avg Transaction" stroke={TEAL} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>

        {/* Rev/day chart */}
        <p className="text-xs font-semibold text-gray-500 mt-5 mb-1">Revenue per Operating Day</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 4, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => `$${(v/1000).toFixed(1)}k`} tick={{ fontSize: 10 }} domain={[0, 'auto']} />
            <Tooltip formatter={v => [v != null ? fmtDollar(v) : '—', 'Rev/Day']} />
            <ReferenceLine y={INDUSTRY_BENCHMARKS.revenue_per_operating_day.median} stroke={NAVY} strokeDasharray="4 3" strokeOpacity={0.4} label={{ value: 'Median', fontSize: 10, fill: '#6b7280', position: 'right' }} />
            <Line type="monotone" dataKey="rev_per_day" name="Rev/Day" stroke={PURPLE} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Chart 3: Revenue Composition ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-navy mb-1">Revenue Composition</h3>
        <p className="text-xs text-gray-400 mb-4">How your revenue breaks down by source each month.</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [fmtDollar(v), name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="beer_revenue"        name="Beer"        stackId="rev" fill={AMBER}  />
            <Bar dataKey="food_revenue"        name="Food"        stackId="rev" fill={GREEN}  />
            <Bar dataKey="merchandise_revenue" name="Merchandise" stackId="rev" fill={TEAL}   />
            <Bar dataKey="event_revenue"       name="Events"      stackId="rev" fill={PURPLE} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Summary table ── */}
      {summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-navy mb-4">12-Month Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Total Revenue"    value={fmtDollar(summary.total)}  />
            <SummaryCard label="Avg Monthly"      value={fmtDollar(summary.avg)}    />
            <SummaryCard label={`Best (${summary.bestMon})`}  value={fmtDollar(summary.best)}  highlight="green" />
            <SummaryCard label={`Worst (${summary.worstMon})`} value={fmtDollar(summary.worst)} highlight="red" />
          </div>

          {/* Avg metrics vs benchmarks */}
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">12-Month Averages vs. Benchmarks</h4>
          <div className="space-y-2">
            <BenchmarkRow label="Avg Labor % of Revenue"       value={summary.avgLaborPct} benchKey="labor_pct_revenue"         format={v => `${v.toFixed(1)}%`} />
            <BenchmarkRow label="Avg Transaction Value"        value={summary.avgAvgTxn}   benchKey="avg_transaction"            format={v => `$${v.toFixed(2)}`} />
            <BenchmarkRow label="Avg Revenue per Op. Day"      value={summary.avgRevDay}   benchKey="revenue_per_operating_day"  format={v => fmtDollar(v)} />
          </div>

          <p className="text-[10px] text-gray-400 mt-4">
            Benchmarks sourced from Brewers Association industry data. Ranges represent small to mid-size craft taprooms.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Small summary card ────────────────────────────────────────────────────────
function SummaryCard({ label, value, highlight }) {
  const textColor = highlight === 'green' ? 'text-green-600' : highlight === 'red' ? 'text-danger' : 'text-navy'
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${textColor}`}>{value}</p>
    </div>
  )
}

// ── Summary benchmark row ─────────────────────────────────────────────────────
function BenchmarkRow({ label, value, benchKey, format }) {
  const color   = benchmarkColor(benchKey, value)
  const bench   = INDUSTRY_BENCHMARKS[benchKey]
  const display = value != null ? format(value) : '—'
  const pillMap = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber/20 text-amber',
    red:   'bg-red-100 text-danger',
    gray:  'bg-gray-100 text-gray-500',
  }
  const pill = color !== 'gray' ? (
    color === 'green' ? 'At or above median' :
    color === 'amber' ? 'Below median' : 'Below low benchmark'
  ) : 'No data'

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <p className="text-sm text-gray-700">{label}</p>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-navy">{display}</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pillMap[color]}`}>{pill}</span>
        {value != null && (
          <span className="text-[10px] text-gray-400 hidden sm:inline">
            Median: {bench.unit.startsWith('$') ? '$' : ''}{bench.median}{bench.unit.includes('%') ? '%' : ''}
          </span>
        )}
      </div>
    </div>
  )
}
