// AnalyticsPage — Full Suite Module: Brewery Analytics Dashboard
/**
 * Read-only visualization page pulling from existing operational tables.
 * Six collapsible sections: Production, Cost/Profitability, Packaging,
 * Distribution, Taproom, and Inventory. All queries filter by brewery_id
 * via Supabase RLS. Global time-period filter persisted to localStorage.
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import { packageTypeLabel } from '../../utils/packagingTypes'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Brand colour tokens ───────────────────────────────────────────────────────
const AMBER  = '#C8871A'
const NAVY   = '#1A2744'
const TEAL   = '#0D9488'
const GREEN  = '#16A34A'
const PURPLE = '#7C3AED'
const ORANGE = '#EA580C'
const RED    = '#EF4444'
const PIE_COLORS = [AMBER, NAVY, TEAL, GREEN, PURPLE, ORANGE, '#E11D48', '#0891B2']

// ── Time period config ────────────────────────────────────────────────────────
const TIME_PERIODS = [
  { value: 'last_30_days',   label: 'Last 30 Days' },
  { value: 'last_90_days',   label: 'Last 90 Days' },
  { value: 'last_6_months',  label: 'Last 6 Months' },
  { value: 'last_12_months', label: 'Last 12 Months' },
  { value: 'year_to_date',   label: 'Year to Date' },
  { value: 'all_time',       label: 'All Time' },
]

function getStartDate(period) {
  const now = new Date()
  switch (period) {
    case 'last_30_days':   { const d = new Date(now); d.setDate(d.getDate() - 30);   return d.toISOString().slice(0, 10) }
    case 'last_90_days':   { const d = new Date(now); d.setDate(d.getDate() - 90);   return d.toISOString().slice(0, 10) }
    case 'last_6_months':  { const d = new Date(now); d.setMonth(d.getMonth() - 6);  return d.toISOString().slice(0, 10) }
    case 'last_12_months': { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d.toISOString().slice(0, 10) }
    case 'year_to_date':   return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
    default:               return '2000-01-01'
  }
}

// ── Shared formatters ─────────────────────────────────────────────────────────
const fmtDollar  = v => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDollarK = v => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtPct     = v => v == null ? '—' : Number(v).toFixed(1) + '%'
const fmtBbl     = v => v == null ? '—' : Number(v).toFixed(2) + ' bbl'
const fmtMonth   = s => { if (!s) return ''; const d = new Date(String(s).slice(0,7) + '-02'); return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) }

function effColor(pct)    { return pct >= 72 ? GREEN : pct >= 65 ? AMBER : RED }
function marginColor(pct) { return pct >= 60 ? GREEN : pct >= 40 ? AMBER : RED }
function costColor(c)     { return c <= 1.00 ? GREEN : c <= 1.50 ? AMBER : RED }
function utilColor(pct)   { return pct < 70 ? GREEN : pct < 90 ? AMBER : RED }

// ── Shared UI primitives ──────────────────────────────────────────────────────

function ChartCard({ title, children, minHeight = 300 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="text-sm font-semibold text-navy mb-3">{title}</h4>
      <div style={{ minHeight }}>{children}</div>
    </div>
  )
}

function SectionSkeleton({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-4 animate-pulse" />
          <div className="h-52 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ message, linkLabel, linkTo }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center text-gray-400">
      <p className="text-sm max-w-xs">{message}</p>
      {linkTo && (
        <Link to={linkTo} className="mt-3 text-sm font-medium text-amber hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  )
}

function CollapsibleSection({ id, title, chartCount, headerColor, expanded, onToggle, children }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ backgroundColor: headerColor }}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-white text-base">{title}</h3>
          <span className="text-[11px] bg-white/20 text-white px-2 py-0.5 rounded-full">
            {chartCount} charts
          </span>
        </div>
        <span className="text-white text-xl leading-none">{expanded ? '▾' : '▸'}</span>
      </button>
      <div style={{ overflow: 'hidden', maxHeight: expanded ? '9999px' : '0', transition: 'max-height 0.3s ease-in-out' }}>
        <div className="p-4 bg-gray-50 space-y-4">{children}</div>
      </div>
    </div>
  )
}

// Custom dot renderer for efficiency trend — green/amber/red by value
function EffDot(props) {
  const { cx, cy, payload } = props
  const color = effColor(payload?.actual_brewhouse_efficiency ?? 0)
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1} />
}

// ── Default export: TierGate wrapper ─────────────────────────────────────────

export default function AnalyticsPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="analytics_dashboard"
      featureName="Brewery Analytics"
      featureDescription="Visualize your brewery's performance across production, profitability, packaging, and distribution."
    >
      <AnalyticsDashboard />
    </TierGate>
  )
}

// ── Main dashboard component ─────────────────────────────────────────────────

function AnalyticsDashboard() {
  const { brewery } = useAuth()

  // Global time period filter — persisted to localStorage
  const [timePeriod, setTimePeriod] = useState(
    () => localStorage.getItem('analytics_time_period') || 'last_12_months'
  )
  const [refreshKey, setRefreshKey] = useState(0)

  // Section expanded states — all open by default, persisted to localStorage
  const [sections, setSections] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('analytics_sections') || '{}')
      return { production: true, cost: true, packaging: true, distribution: true, taproom: true, inventory: true, ...saved }
    } catch { return { production: true, cost: true, packaging: true, distribution: true, taproom: true, inventory: true } }
  })

  function handleTimePeriod(val) {
    setTimePeriod(val)
    localStorage.setItem('analytics_time_period', val)
  }

  function toggleSection(id) {
    setSections(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem('analytics_sections', JSON.stringify(next))
      return next
    })
  }

  const startDate = getStartDate(timePeriod)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-navy">Brewery Analytics</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Visualize your brewery's performance across production, profitability, packaging, and distribution.
        </p>
      </div>

      {/* Global controls */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-navy shrink-0">Time Period:</span>
        <div className="flex flex-wrap gap-2">
          {TIME_PERIODS.map(tp => (
            <button
              key={tp.value}
              onClick={() => handleTimePeriod(tp.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                timePeriod === tp.value
                  ? 'bg-amber text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-navy text-white hover:bg-navy/90 transition-colors"
        >
          Refresh Data
        </button>
      </div>

      {/* Section 1 — Production */}
      <CollapsibleSection id="production" title="Production" chartCount={6} headerColor={AMBER} expanded={sections.production} onToggle={toggleSection}>
        <ProductionSection brewery={brewery} startDate={startDate} refreshKey={refreshKey} />
      </CollapsibleSection>

      {/* Section 2 — Cost & Profitability */}
      <CollapsibleSection id="cost" title="Cost & Profitability" chartCount={6} headerColor={NAVY} expanded={sections.cost} onToggle={toggleSection}>
        <CostSection brewery={brewery} startDate={startDate} refreshKey={refreshKey} />
      </CollapsibleSection>

      {/* Section 3 — Packaging & Yield */}
      <CollapsibleSection id="packaging" title="Packaging & Yield" chartCount={4} headerColor={TEAL} expanded={sections.packaging} onToggle={toggleSection}>
        <PackagingSection brewery={brewery} startDate={startDate} refreshKey={refreshKey} />
      </CollapsibleSection>

      {/* Section 4 — Distribution & Sales */}
      <CollapsibleSection id="distribution" title="Distribution & Sales" chartCount={5} headerColor={GREEN} expanded={sections.distribution} onToggle={toggleSection}>
        <DistributionSection brewery={brewery} startDate={startDate} refreshKey={refreshKey} />
      </CollapsibleSection>

      {/* Section 5 — Taproom Performance */}
      <CollapsibleSection id="taproom" title="Taproom Performance" chartCount={5} headerColor={PURPLE} expanded={sections.taproom} onToggle={toggleSection}>
        <TaproomSection brewery={brewery} startDate={startDate} refreshKey={refreshKey} />
      </CollapsibleSection>

      {/* Section 6 — Inventory & Ingredients */}
      <CollapsibleSection id="inventory" title="Inventory & Ingredients" chartCount={3} headerColor={ORANGE} expanded={sections.inventory} onToggle={toggleSection}>
        <InventorySection brewery={brewery} startDate={startDate} refreshKey={refreshKey} />
      </CollapsibleSection>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function ProductionSection({ brewery, startDate, refreshKey }) {
  const [loading, setLoading] = useState(true)
  const [brewDays, setBrewDays]       = useState([])
  const [monthly,  setMonthly]        = useState([])
  const [ferms,    setFerms]          = useState([])
  const [drillStyle, setDrillStyle]   = useState(null)

  const load = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    // Load brew days and fermentations in parallel for all production charts
    const [bdRes, fRes, mRes] = await Promise.all([
      supabase
        .from('brew_days')
        .select('id, batch_number, recipe_name, beer_style, brew_date, actual_batch_size, planned_batch_size, actual_brewhouse_efficiency, target_brewhouse_efficiency, target_og, actual_og')
        .eq('brewery_id', brewery.id)
        .eq('status', 'complete')
        .gte('brew_date', startDate)
        .order('brew_date', { ascending: true }),
      supabase
        .from('fermentations')
        .select('id, brew_day_id, pitch_date, end_date, vessel_name, yeast_strain, status')
        .eq('brewery_id', brewery.id)
        .gte('pitch_date', startDate),
      supabase
        .from('analytics_monthly_production')
        .select('*')
        .eq('brewery_id', brewery.id)
        .gte('month', startDate)
        .order('month', { ascending: true }),
    ])
    setBrewDays(bdRes.data ?? [])
    setFerms(fRes.data ?? [])
    // Aggregate monthly data — sum barrels and batch counts across styles per month
    const monthMap = {}
    ;(mRes.data ?? []).forEach(r => {
      const key = String(r.month).slice(0, 7)
      if (!monthMap[key]) monthMap[key] = { month: key, total_barrels: 0, batch_count: 0 }
      monthMap[key].total_barrels += parseFloat(r.total_barrels || 0)
      monthMap[key].batch_count   += parseInt(r.batch_count  || 0, 10)
    })
    setMonthly(Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)))
    setLoading(false)
  }, [brewery?.id, startDate, refreshKey])

  useEffect(() => { load() }, [load])

  if (loading) return <SectionSkeleton count={6} />

  if (brewDays.length === 0) {
    return (
      <EmptyState
        message="No production data yet. Complete your first brew day to see analytics here."
        linkLabel="Go to Brew Day"
        linkTo="/brewday"
      />
    )
  }

  // ── 1A: Monthly Barrels ───────────────────────────────────────────────────
  const avgBarrels = monthly.length > 0
    ? monthly.reduce((s, r) => s + r.total_barrels, 0) / monthly.length
    : 0

  // ── 1B: Efficiency Trend ──────────────────────────────────────────────────
  const effData = brewDays
    .filter(b => b.actual_brewhouse_efficiency != null)
    .map(b => ({
      label:  `#${b.batch_number}`,
      name:   b.recipe_name || b.beer_style || 'Batch',
      date:   b.brew_date,
      actual_brewhouse_efficiency: parseFloat(b.actual_brewhouse_efficiency),
    }))

  // ── 1C: Batch Count by Style ──────────────────────────────────────────────
  const styleMap = {}
  brewDays.forEach(b => { const s = b.beer_style || 'Unknown'; styleMap[s] = (styleMap[s] || 0) + 1 })
  const styleData  = Object.entries(styleMap).map(([name, value]) => ({ name, value }))
  const totalBatch = styleData.reduce((s, r) => s + r.value, 0)

  // ── 1D: OG Accuracy ───────────────────────────────────────────────────────
  const ogData = brewDays
    .filter(b => b.target_og != null && b.actual_og != null)
    .map(b => ({
      target:   parseFloat(b.target_og),
      actual:   parseFloat(b.actual_og),
      name:     b.recipe_name || b.beer_style || 'Batch',
      date:     b.brew_date,
      batch:    b.batch_number,
      variance: (parseFloat(b.actual_og) - parseFloat(b.target_og)).toFixed(3),
    }))
  // Perfect accuracy reference: min/max for diagonal line
  const ogMin = ogData.length > 0 ? Math.min(...ogData.map(d => Math.min(d.target, d.actual))) - 0.005 : 1.040
  const ogMax = ogData.length > 0 ? Math.max(...ogData.map(d => Math.max(d.target, d.actual))) + 0.005 : 1.080
  const ogLine = [{ target: ogMin, actual: ogMin }, { target: ogMax, actual: ogMax }]

  // ── 1E: Fermentation Duration by Style (with yeast drill-down) ────────────
  const fermMap = {}
  ferms.forEach(f => {
    const bd = brewDays.find(b => b.id === f.brew_day_id)
    if (!bd) return
    const style = bd.beer_style || 'Unknown'
    const yeast = f.yeast_strain || 'Unknown Yeast'
    const days  = (f.pitch_date && f.end_date)
      ? Math.round((new Date(f.end_date) - new Date(f.pitch_date)) / 86400000)
      : null
    if (!days || days <= 0) return
    if (!fermMap[style]) fermMap[style] = { style, totalDays: 0, count: 0, strains: {} }
    fermMap[style].totalDays += days
    fermMap[style].count++
    if (!fermMap[style].strains[yeast]) fermMap[style].strains[yeast] = { days: [], strain: yeast }
    fermMap[style].strains[yeast].days.push(days)
  })
  const fermByStyle = Object.values(fermMap).map(r => ({
    style: r.style,
    avg_days: r.count > 0 ? +(r.totalDays / r.count).toFixed(1) : 0,
    count:    r.count,
    strains:  Object.values(r.strains).map(s => ({
      strain:    s.strain,
      avg_days:  +(s.days.reduce((a, b) => a + b, 0) / s.days.length).toFixed(1),
      min_days:  Math.min(...s.days),
      max_days:  Math.max(...s.days),
      count:     s.days.length,
    })),
  }))
  const drillData = drillStyle ? (fermByStyle.find(r => r.style === drillStyle)?.strains ?? []) : []

  // ── 1F: Vessel Utilization ────────────────────────────────────────────────
  const periodDays = Math.max(1, Math.round((new Date() - new Date(startDate)) / 86400000))
  const vesselMap  = {}
  ferms.forEach(f => {
    const v = f.vessel_name || 'Unknown Vessel'
    if (!vesselMap[v]) vesselMap[v] = { vessel: v, occupiedDays: 0 }
    if (f.pitch_date) {
      const start = new Date(f.pitch_date)
      const end   = f.end_date ? new Date(f.end_date) : new Date()
      vesselMap[v].occupiedDays += Math.max(0, Math.round((end - start) / 86400000))
    }
  })
  const vesselData = Object.values(vesselMap).map(r => ({
    vessel:      r.vessel,
    utilization: Math.min(100, +(r.occupiedDays / periodDays * 100).toFixed(1)),
    days:        r.occupiedDays,
  })).sort((a, b) => b.utilization - a.utilization)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* 1A — Monthly Barrels Brewed */}
      <ChartCard title="1A — Monthly Barrels Brewed">
        {monthly.length === 0 ? (
          <EmptyState message="No monthly data in this period." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthly} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}bbl`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n) => [fmtBbl(v), n === 'total_barrels' ? 'Barrels' : n]} labelFormatter={fmtMonth} />
              <ReferenceLine y={avgBarrels} stroke={AMBER} strokeDasharray="4 2" label={{ value: 'Avg', position: 'right', fontSize: 10, fill: AMBER }} />
              <Bar dataKey="total_barrels" name="Barrels" fill={AMBER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 1B — Brewhouse Efficiency Trend */}
      <ChartCard title="1B — Brewhouse Efficiency Trend">
        {effData.length === 0 ? (
          <EmptyState message="No efficiency data recorded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={effData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[50, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, n) => [fmtPct(v), 'Efficiency']}
                labelFormatter={(l, payload) => payload?.[0]?.payload?.name ?? l}
              />
              <ReferenceLine y={72} stroke={GREEN}  strokeDasharray="4 2" label={{ value: '72% target', position: 'right', fontSize: 9, fill: GREEN }} />
              <Line
                type="monotone"
                dataKey="actual_brewhouse_efficiency"
                name="Efficiency"
                stroke={AMBER}
                strokeWidth={2}
                dot={<EffDot />}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 1C — Batch Count by Style */}
      <ChartCard title="1C — Batches by Beer Style">
        {styleData.length === 0 ? (
          <EmptyState message="No style data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={styleData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {styleData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} batches (${((v / totalBatch) * 100).toFixed(1)}%)`, n]} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 1D — OG Accuracy Scatter */}
      <ChartCard title="1D — OG Accuracy by Batch">
        {ogData.length === 0 ? (
          <EmptyState message="No OG data recorded yet. Log target and actual OG in brew day logs." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 5, right: 16, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="target" type="number" domain={['dataMin - 0.005', 'dataMax + 0.005']} name="Target OG" tickFormatter={v => v.toFixed(3)} tick={{ fontSize: 10 }} label={{ value: 'Target OG', position: 'insideBottom', offset: -10, fontSize: 11 }} />
              <YAxis dataKey="actual" type="number" domain={['dataMin - 0.005', 'dataMax + 0.005']} name="Actual OG"  tickFormatter={v => v.toFixed(3)} tick={{ fontSize: 10 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload
                return (
                  <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow">
                    <p className="font-semibold">{d.name}</p>
                    <p>Target: {d.target?.toFixed(3)}</p>
                    <p>Actual: {d.actual?.toFixed(3)}</p>
                    <p>Variance: {d.variance > 0 ? '+' : ''}{d.variance}</p>
                    <p className="text-gray-400">{d.date}</p>
                  </div>
                )
              }} />
              {/* Perfect accuracy line */}
              <Scatter data={ogLine} line={{ stroke: NAVY, strokeDasharray: '4 2' }} shape={() => null} legendType="none" />
              <Scatter data={ogData} fill={AMBER} opacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 1E — Fermentation Duration by Style with yeast drill-down */}
      <ChartCard title="1E — Fermentation Duration by Style">
        {fermByStyle.length === 0 ? (
          <EmptyState message="No fermentation duration data yet." linkLabel="Go to Fermentation" linkTo="/fermentation" />
        ) : drillStyle ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setDrillStyle(null)} className="text-xs text-amber hover:underline font-medium">← All Styles</button>
              <span className="text-xs font-semibold text-navy">{drillStyle} — by Yeast Strain</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={drillData} margin={{ top: 5, right: 16, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="strain" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'Days', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip formatter={(v, n) => [`${v} days`, n]} content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow">
                      <p className="font-semibold">{d.strain}</p>
                      <p>Avg: {d.avg_days} days</p>
                      <p>Min: {d.min_days} / Max: {d.max_days}</p>
                      <p>{d.count} batches</p>
                    </div>
                  )
                }} />
                <Bar dataKey="avg_days" name="Avg Days" fill={TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={fermByStyle} margin={{ top: 5, right: 16, bottom: 40, left: 0 }} onClick={d => d?.activePayload?.[0] && setDrillStyle(d.activePayload[0].payload.style)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="style" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'Days', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v} days`, 'Avg Fermentation']}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow">
                      <p className="font-semibold">{d.style}</p>
                      <p>Avg: {d.avg_days} days</p>
                      <p>{d.count} batches — click to see yeast breakdown</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="avg_days" name="Avg Days" fill={PURPLE} radius={[4, 4, 0, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 1F — Vessel Utilization */}
      <ChartCard title="1F — Vessel Utilization Rate">
        {vesselData.length === 0 ? (
          <EmptyState message="No vessel data found. Assign fermentation vessels to see utilization." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vesselData} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="vessel" tick={{ fontSize: 11 }} width={55} />
              <Tooltip formatter={(v) => [`${v}%`, 'Utilization']}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow">
                      <p className="font-semibold">{d.vessel}</p>
                      <p>Utilization: {d.utilization}%</p>
                      <p>Days occupied: {d.days}</p>
                    </div>
                  )
                }}
              />
              <ReferenceLine x={90} stroke={RED}   strokeDasharray="4 2" />
              <ReferenceLine x={70} stroke={AMBER} strokeDasharray="4 2" />
              <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
                {vesselData.map((r, i) => <Cell key={i} fill={utilColor(r.utilization)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — COST & PROFITABILITY
// ═══════════════════════════════════════════════════════════════════════════════

function CostSection({ brewery, startDate, refreshKey }) {
  const [loading, setLoading]       = useState(true)
  const [batchCosts, setBatchCosts] = useState([])
  const [tapMetrics, setTapMetrics] = useState([])
  const [distRevenue, setDistRev]   = useState([])

  const load = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    // Load batch cost view, taproom metrics, and distribution revenue in parallel
    const [bcRes, tmRes, drRes] = await Promise.all([
      supabase
        .from('analytics_batch_costs')
        .select('*')
        .gte('brew_date', startDate)
        .order('brew_date', { ascending: false }),
      supabase
        .from('taproom_metrics')
        .select('metric_month, taproom_revenue, beer_revenue, food_revenue, event_revenue, total_revenue, labor_cost')
        .eq('brewery_id', brewery.id)
        .gte('metric_month', startDate)
        .order('metric_month', { ascending: true }),
      supabase
        .from('analytics_distribution_revenue')
        .select('*')
        .eq('brewery_id', brewery.id)
        .gte('month', startDate)
        .order('month', { ascending: true }),
    ])
    setBatchCosts(bcRes.data ?? [])
    setTapMetrics(tmRes.data ?? [])
    setDistRev(drRes.data ?? [])
    setLoading(false)
  }, [brewery?.id, startDate, refreshKey])

  useEffect(() => { load() }, [load])

  if (loading) return <SectionSkeleton count={6} />

  if (batchCosts.length === 0 && tapMetrics.length === 0) {
    return (
      <EmptyState
        message="No cost data yet. Complete a packaging run to see profitability analytics."
        linkLabel="Go to Packaging"
        linkTo="/packaging"
      />
    )
  }

  // ── 2A: Cost per pint by beer (average across batches) ───────────────────
  const costByBeer = {}
  batchCosts.forEach(b => {
    const name = b.beer_name || 'Unknown'
    if (!costByBeer[name]) costByBeer[name] = { name, total: 0, count: 0 }
    if (b.recipe_cost_per_pint != null) {
      costByBeer[name].total += parseFloat(b.recipe_cost_per_pint)
      costByBeer[name].count++
    }
  })
  const costPerPintData = Object.values(costByBeer)
    .filter(r => r.count > 0)
    .map(r => ({ name: r.name, cost: +(r.total / r.count).toFixed(2), count: r.count }))
    .sort((a, b) => b.cost - a.cost)

  // ── 2B: Planned vs actual cost (last 10 batches with both values) ─────────
  const last10 = batchCosts
    .filter(b => b.recipe_cost_per_pint != null)
    .slice(0, 10)
    .reverse()
    .map(b => ({
      label:   `#${b.batch_number}`,
      name:    b.beer_name || 'Batch',
      planned: parseFloat(b.recipe_cost_per_pint),
      actual:  b.recipe_cost_per_pint != null ? parseFloat(b.recipe_cost_per_pint) : null,
    }))

  // ── 2C: Gross margin (estimate: assume $4–6 sale price — use avg dist price) ─
  const avgDistPrice = distRevenue.reduce((s, r) => s + (r.units_sold > 0 ? r.revenue / r.units_sold : 0), 0) / Math.max(1, distRevenue.length)
  const marginData = costPerPintData
    .filter(r => r.cost > 0)
    .map(r => {
      const salePrice  = avgDistPrice > 0 ? avgDistPrice / 16 : 4.50 // per pint estimate
      const margin     = +((1 - r.cost / salePrice) * 100).toFixed(1)
      return { name: r.name, margin, revenue: salePrice, cost: r.cost }
    })
    .sort((a, b) => b.margin - a.margin)

  // ── 2D/2E: Revenue by channel ─────────────────────────────────────────────
  const totalTap  = tapMetrics.reduce((s, r) => s + parseFloat(r.taproom_revenue || r.beer_revenue || 0), 0)
  const totalDist = distRevenue.reduce((s, r) => s + parseFloat(r.revenue || 0), 0)
  const channelPie = [
    { name: 'Taproom',      value: +totalTap.toFixed(2) },
    { name: 'Distribution', value: +totalDist.toFixed(2) },
  ].filter(c => c.value > 0)

  // Monthly revenue by channel
  const monthlyRevMap = {}
  tapMetrics.forEach(r => {
    const m = String(r.metric_month).slice(0, 7)
    if (!monthlyRevMap[m]) monthlyRevMap[m] = { month: m, taproom: 0, distribution: 0 }
    monthlyRevMap[m].taproom += parseFloat(r.taproom_revenue || r.beer_revenue || 0)
  })
  distRevenue.forEach(r => {
    const m = String(r.month).slice(0, 7)
    if (!monthlyRevMap[m]) monthlyRevMap[m] = { month: m, taproom: 0, distribution: 0 }
    monthlyRevMap[m].distribution += parseFloat(r.revenue || 0)
  })
  const monthlyRevData = Object.values(monthlyRevMap).sort((a, b) => a.month.localeCompare(b.month))

  // ── 2F: Profit per barrel by channel (simplified) ─────────────────────────
  const bblProduced = batchCosts.reduce((s, b) => s + parseFloat(b.volume_from_fermenter || 0), 0)
  const profitPerBbl = [
    { channel: 'Taproom',      profit: bblProduced > 0 ? +(totalTap / bblProduced).toFixed(0) : 0 },
    { channel: 'Distribution', profit: bblProduced > 0 ? +(totalDist / bblProduced).toFixed(0) : 0 },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* 2A — Cost Per Pint by Beer */}
      <ChartCard title="2A — Cost Per Pint by Beer">
        {costPerPintData.length === 0 ? (
          <EmptyState message="No cost per pint data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={costPerPintData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
              <Tooltip formatter={v => [fmtDollar(v), 'Cost/pint']}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{d.name}</p><p>Cost/pint: {fmtDollar(d.cost)}</p><p>{d.count} batch(es)</p></div>
                }}
              />
              <ReferenceLine x={1.50} stroke={RED}   strokeDasharray="4 2" />
              <ReferenceLine x={1.00} stroke={AMBER} strokeDasharray="4 2" />
              <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                {costPerPintData.map((r, i) => <Cell key={i} fill={costColor(r.cost)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2B — Planned vs Actual Cost Per Pint */}
      <ChartCard title="2B — Planned vs Actual Cost/Pint">
        {last10.length === 0 ? (
          <EmptyState message="No cost data yet. Complete a packaging run." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={last10} margin={{ top: 5, right: 16, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollar(v)]}
                content={({ payload, label }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{d.name} ({label})</p>{payload.map(p => <p key={p.name}>{p.name}: {fmtDollar(p.value)}</p>)}</div>
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="planned" name="Planned" fill={NAVY}  radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual"  name="Actual"  fill={AMBER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2C — Gross Margin by Beer */}
      <ChartCard title="2C — Est. Gross Margin by Beer">
        {marginData.length === 0 ? (
          <EmptyState message="No margin data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={marginData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
              <Tooltip formatter={(v) => [`${v}%`, 'Gross Margin']} />
              <ReferenceLine x={60} stroke={GREEN} strokeDasharray="4 2" />
              <ReferenceLine x={40} stroke={AMBER} strokeDasharray="4 2" />
              <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                {marginData.map((r, i) => <Cell key={i} fill={marginColor(r.margin)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2D — Revenue by Channel */}
      <ChartCard title="2D — Revenue by Sales Channel">
        {channelPie.length === 0 ? (
          <EmptyState message="No revenue data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={channelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {channelPie.map((_, i) => <Cell key={i} fill={[AMBER, TEAL, NAVY][i % 3]} />)}
              </Pie>
              <Tooltip formatter={v => [fmtDollarK(v), 'Revenue']} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2E — Revenue Trend by Channel */}
      <ChartCard title="2E — Revenue Trend by Channel">
        {monthlyRevData.length === 0 ? (
          <EmptyState message="No monthly revenue data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyRevData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="colorTap"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={AMBER} stopOpacity={0.3} /><stop offset="95%" stopColor={AMBER} stopOpacity={0} /></linearGradient>
                <linearGradient id="colorDist" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={TEAL}  stopOpacity={0.3} /><stop offset="95%" stopColor={TEAL}  stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollarK(v)]} labelFormatter={fmtMonth} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="taproom"      name="Taproom"      stroke={AMBER} fill="url(#colorTap)"  stackId="1" />
              <Area type="monotone" dataKey="distribution" name="Distribution" stroke={TEAL}  fill="url(#colorDist)" stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2F — Profit Per Barrel by Channel */}
      <ChartCard title="2F — Profit Per Barrel by Channel">
        {profitPerBbl.every(r => r.profit === 0) ? (
          <EmptyState message="No profit per barrel data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={profitPerBbl} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollarK(v), 'Profit/bbl']} />
              <ReferenceLine y={600}  stroke={AMBER} strokeDasharray="4 2" label={{ value: 'Taproom ~$600', position: 'right', fontSize: 9, fill: AMBER }} />
              <ReferenceLine y={60}   stroke={TEAL}  strokeDasharray="4 2" label={{ value: 'Dist ~$60',    position: 'right', fontSize: 9, fill: TEAL }} />
              <Bar dataKey="profit" fill={NAVY} radius={[4, 4, 0, 0]}>
                <Cell fill={AMBER} />
                <Cell fill={TEAL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — PACKAGING & YIELD
// ═══════════════════════════════════════════════════════════════════════════════

function PackagingSection({ brewery, startDate, refreshKey }) {
  const [loading, setLoading]     = useState(true)
  const [runs, setRuns]           = useState([])
  const [brewDays, setBrewDays]   = useState([])

  const load = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [prRes, bdRes] = await Promise.all([
      supabase
        .from('packaging_runs')
        .select('id, fermentation_id, status, package_type, planned_volume, actual_volume, units_planned, units_actual, recipe_cost_per_pint, volume_from_fermenter, actual_splits, created_at, packaging_yield_percentage')
        .eq('brewery_id', brewery.id)
        .eq('status', 'complete')
        .gte('created_at', startDate)
        .order('created_at', { ascending: true }),
      supabase
        .from('brew_days')
        .select('id, batch_number, recipe_name, brew_date, actual_batch_size, planned_batch_size')
        .eq('brewery_id', brewery.id)
        .eq('status', 'complete')
        .gte('brew_date', startDate),
    ])
    setRuns(prRes.data ?? [])
    setBrewDays(bdRes.data ?? [])
    setLoading(false)
  }, [brewery?.id, startDate, refreshKey])

  useEffect(() => { load() }, [load])

  if (loading) return <SectionSkeleton count={4} />

  if (runs.length === 0) {
    return (
      <EmptyState
        message="No packaging data yet. Complete a packaging run to see yield analytics."
        linkLabel="Go to Packaging"
        linkTo="/packaging"
      />
    )
  }

  // ── 3A: Packaging yield trend ─────────────────────────────────────────────
  const yieldData = runs
    .filter(r => r.packaging_yield_percentage != null)
    .map((r, i) => ({
      label:  `Run ${i + 1}`,
      date:   r.created_at?.slice(0, 10),
      yield:  parseFloat(r.packaging_yield_percentage),
    }))

  // ── 3B: Units by package type per month ───────────────────────────────────
  const pkgMonthMap = {}
  const pkgTypes    = new Set()
  runs.forEach(r => {
    const m = r.created_at?.slice(0, 7) ?? 'Unknown'
    const t = r.package_type || 'Other'
    pkgTypes.add(t)
    if (!pkgMonthMap[m]) pkgMonthMap[m] = { month: m }
    pkgMonthMap[m][t] = (pkgMonthMap[m][t] || 0) + (parseFloat(r.actual_splits || r.units_actual || 0))
  })
  const pkgMonthData = Object.values(pkgMonthMap).sort((a, b) => a.month.localeCompare(b.month))
  const pkgTypeArr   = [...pkgTypes]
  const pkgPalette   = [AMBER, TEAL, NAVY, GREEN, PURPLE]

  // ── 3C: Planned vs Actual Units (last 10) ─────────────────────────────────
  const last10runs = runs.slice(-10).map((r, i) => ({
    label:   `Run ${i + 1}`,
    planned: parseFloat(r.units_planned || r.planned_volume || 0),
    actual:  parseFloat(r.units_actual  || r.actual_splits  || 0),
  }))

  // ── 3D: Yield loss by stage (brewhouse → fermenter → packaged) ────────────
  const lossData = runs
    .slice(-10)
    .map((r, i) => {
      const bd = brewDays.find(b => b.id)
      const brewSize  = parseFloat(bd?.actual_batch_size || bd?.planned_batch_size || 0)
      const fermSize  = parseFloat(r.volume_from_fermenter || 0)
      const pkgdSize  = parseFloat(r.actual_splits || 0) * 0.03125 // splits → bbl (approx)
      const brLoss    = brewSize > 0 ? +(brewSize - fermSize).toFixed(2) : 0
      const fermLoss  = fermSize > 0 ? +(fermSize - pkgdSize).toFixed(2) : 0
      const pkgLoss   = 0
      return { label: `Run ${i + 1}`, brewhouse: brLoss, fermentation: fermLoss, packaging: pkgLoss }
    })
    .filter(r => r.brewhouse + r.fermentation > 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* 3A — Packaging Yield Trend */}
      <ChartCard title="3A — Packaging Yield Trend">
        {yieldData.length === 0 ? (
          <EmptyState message="No yield percentage recorded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={yieldData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[60, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtPct(v), 'Yield']} labelFormatter={(l, p) => p?.[0]?.payload?.date ?? l} />
              <ReferenceLine y={85} stroke={GREEN} strokeDasharray="4 2" label={{ value: '85% target', position: 'right', fontSize: 9, fill: GREEN }} />
              <Line type="monotone" dataKey="yield" stroke={TEAL} strokeWidth={2} dot={{ r: 4, fill: TEAL }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 3B — Units by Package Type per Month */}
      <ChartCard title="3B — Units Produced by Package Type">
        {pkgMonthData.length === 0 ? (
          <EmptyState message="No units data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pkgMonthData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={fmtMonth} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {pkgTypeArr.map((t, i) => (
                <Bar key={t} dataKey={t} stackId="units" fill={pkgPalette[i % pkgPalette.length]} radius={i === pkgTypeArr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 3C — Planned vs Actual Units */}
      <ChartCard title="3C — Planned vs Actual Units (Last 10)">
        {last10runs.length === 0 ? (
          <EmptyState message="No units data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={last10runs} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="planned" name="Planned" fill={NAVY}  radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual"  name="Actual"  fill={TEAL}  radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 3D — Yield Loss by Stage */}
      <ChartCard title="3D — Volume Loss by Stage (Last 10 Runs)">
        {lossData.length === 0 ? (
          <EmptyState message="Not enough batch volume data to calculate losses." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={lossData} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v}bbl`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={38} />
              <Tooltip formatter={v => [fmtBbl(v)]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="brewhouse"   name="Brewhouse Loss"   fill={RED}    stackId="loss" />
              <Bar dataKey="fermentation" name="Fermentation Loss" fill={AMBER}  stackId="loss" />
              <Bar dataKey="packaging"   name="Packaging Loss"   fill={ORANGE} stackId="loss" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — DISTRIBUTION & SALES
// ═══════════════════════════════════════════════════════════════════════════════

function DistributionSection({ brewery, startDate, refreshKey }) {
  const [loading, setLoading]   = useState(true)
  const [records, setRecords]   = useState([])
  const [distRev, setDistRev]   = useState([])

  const load = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [recRes, revRes] = await Promise.all([
      supabase
        .from('distribution_records')
        .select('*')
        .eq('brewery_id', brewery.id)
        .gte('delivery_date', startDate)
        .order('delivery_date', { ascending: true }),
      supabase
        .from('analytics_distribution_revenue')
        .select('*')
        .eq('brewery_id', brewery.id)
        .gte('month', startDate)
        .order('month', { ascending: true }),
    ])
    setRecords(recRes.data ?? [])
    setDistRev(revRes.data ?? [])
    setLoading(false)
  }, [brewery?.id, startDate, refreshKey])

  useEffect(() => { load() }, [load])

  if (loading) return <SectionSkeleton count={5} />

  if (records.length === 0) {
    return (
      <EmptyState
        message="No distribution data yet. Log deliveries in the Distribution module to see sales analytics."
        linkLabel="Go to Distribution"
        linkTo="/distribution"
      />
    )
  }

  // ── 4A: Top 10 accounts by revenue ───────────────────────────────────────
  const acctMap = {}
  records.forEach(r => {
    const a = r.account_name || 'Unknown'
    if (!acctMap[a]) acctMap[a] = { account: a, revenue: 0, deliveries: 0, units: 0 }
    acctMap[a].revenue    += parseFloat(r.quantity || 0) * parseFloat(r.sale_price_per_unit || 0)
    acctMap[a].deliveries += 1
    acctMap[a].units      += parseFloat(r.quantity || 0)
  })
  const topAccounts = Object.values(acctMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(a => ({ ...a, revenue: +a.revenue.toFixed(2), avgOrder: a.deliveries > 0 ? +(a.revenue / a.deliveries).toFixed(2) : 0 }))

  // ── 4B: Revenue by package type ───────────────────────────────────────────
  // Keyed by type+size (not type alone) so different sizes of one type don't collapse
  // into a single slice — packageTypeLabel is null-safe for size_spec and unique per pair.
  const pkgRevMap = {}
  records.forEach(r => {
    const t = packageTypeLabel(r.package_type, r.size_spec)
    pkgRevMap[t] = (pkgRevMap[t] || 0) + parseFloat(r.quantity || 0) * parseFloat(r.sale_price_per_unit || 0)
  })
  const pkgRevData = Object.entries(pkgRevMap).map(([name, value]) => ({ name, value: +value.toFixed(2) }))
  const totalPkgRev = pkgRevData.reduce((s, r) => s + r.value, 0)

  // ── 4C: Monthly distribution revenue ─────────────────────────────────────
  const monthRevMap = {}
  distRev.forEach(r => {
    const m = String(r.month).slice(0, 7)
    if (!monthRevMap[m]) monthRevMap[m] = { month: m, revenue: 0 }
    monthRevMap[m].revenue += parseFloat(r.revenue || 0)
  })
  const monthRevData = Object.values(monthRevMap).sort((a, b) => a.month.localeCompare(b.month))

  // ── 4D/4E: Keg return rate and days out ───────────────────────────────────
  const kegAcctMap = {}
  records.forEach(r => {
    if (!r.keg_return_date) return
    const a = r.account_name || 'Unknown'
    if (!kegAcctMap[a]) kegAcctMap[a] = { account: a, sent: 0, returned: 0, daysOut: [] }
    kegAcctMap[a].sent += parseFloat(r.quantity || 1)
    if (r.kegs_returned) {
      kegAcctMap[a].returned += parseFloat(r.quantity || 1)
      if (r.keg_returned_date && r.delivery_date) {
        const days = Math.round((new Date(r.keg_returned_date) - new Date(r.delivery_date)) / 86400000)
        if (days > 0) kegAcctMap[a].daysOut.push(days)
      }
    }
  })
  const kegData = Object.values(kegAcctMap)
    .filter(a => a.sent > 0)
    .map(a => ({
      account:     a.account,
      returnRate:  +(a.returned / a.sent * 100).toFixed(1),
      sent:        a.sent,
      returned:    a.returned,
      avgDays:     a.daysOut.length > 0 ? +(a.daysOut.reduce((s, v) => s + v, 0) / a.daysOut.length).toFixed(1) : null,
    }))
    .sort((a, b) => b.returnRate - a.returnRate)

  function kegReturnColor(pct) { return pct >= 90 ? GREEN : pct >= 70 ? AMBER : RED }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* 4A — Top Accounts by Revenue */}
      <ChartCard title="4A — Top 10 Accounts by Revenue">
        {topAccounts.length === 0 ? (
          <EmptyState message="No account data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topAccounts} layout="vertical" margin={{ top: 5, right: 70, bottom: 5, left: 90 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="account" tick={{ fontSize: 10 }} width={85} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload
                return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{d.account}</p><p>Revenue: {fmtDollarK(d.revenue)}</p><p>Deliveries: {d.deliveries}</p><p>Avg order: {fmtDollarK(d.avgOrder)}</p></div>
              }} />
              <Bar dataKey="revenue" fill={GREEN} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 4B — Revenue by Package Type */}
      <ChartCard title="4B — Distribution Revenue by Package Type">
        {pkgRevData.length === 0 ? (
          <EmptyState message="No package type revenue data." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pkgRevData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {pkgRevData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => [fmtDollarK(v), 'Revenue']} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 4C — Monthly Distribution Revenue */}
      <ChartCard title="4C — Monthly Distribution Revenue">
        {monthRevData.length === 0 ? (
          <EmptyState message="No monthly distribution revenue data." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthRevData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="colorDistRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollarK(v), 'Revenue']} labelFormatter={fmtMonth} />
              <Area type="monotone" dataKey="revenue" stroke={GREEN} fill="url(#colorDistRev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 4D — Keg Return Rate by Account */}
      <ChartCard title="4D — Keg Return Rate by Account">
        {kegData.length === 0 ? (
          <EmptyState message="No keg return data yet. Log keg deliveries with return dates." linkLabel="Go to Distribution" linkTo="/distribution" />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={kegData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 90 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="account" tick={{ fontSize: 10 }} width={85} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload
                return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{d.account}</p><p>Return rate: {d.returnRate}%</p><p>Sent: {d.sent} / Returned: {d.returned}</p></div>
              }} />
              <ReferenceLine x={90} stroke={GREEN} strokeDasharray="4 2" />
              <ReferenceLine x={70} stroke={AMBER} strokeDasharray="4 2" />
              <Bar dataKey="returnRate" radius={[0, 4, 4, 0]}>
                {kegData.map((r, i) => <Cell key={i} fill={kegReturnColor(r.returnRate)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 4E — Avg Days Kegs Out by Account */}
      <ChartCard title="4E — Avg Days Kegs Out by Account">
        {kegData.filter(k => k.avgDays != null).length === 0 ? (
          <EmptyState message="No keg return date data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={kegData.filter(k => k.avgDays != null).sort((a, b) => (b.avgDays ?? 0) - (a.avgDays ?? 0))}
              layout="vertical"
              margin={{ top: 5, right: 60, bottom: 5, left: 90 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v}d`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="account" tick={{ fontSize: 10 }} width={85} />
              <Tooltip formatter={v => [`${v} days`, 'Avg Days Out']} />
              <ReferenceLine x={30} stroke={AMBER} strokeDasharray="4 2" label={{ value: '30d standard', position: 'top', fontSize: 9, fill: AMBER }} />
              <Bar dataKey="avgDays" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — TAPROOM PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

const TAPROOM_BENCHMARKS = {
  revenue_per_day:  { median: 1800 },
  labor_pct:        { median: 32 },
  avg_transaction:  { median: 19 },
}

function TaproomSection({ brewery, startDate, refreshKey }) {
  const [loading, setLoading]     = useState(true)
  const [metrics, setMetrics]     = useState([])
  const [events,  setEvents]      = useState([])

  const load = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [tmRes, evRes] = await Promise.all([
      supabase
        .from('taproom_metrics')
        .select('metric_month, taproom_revenue, beer_revenue, food_revenue, event_revenue, total_revenue, labor_cost, avg_transaction_value, operating_days')
        .eq('brewery_id', brewery.id)
        .gte('metric_month', startDate)
        .order('metric_month', { ascending: true }),
      supabase
        .from('events')
        .select('event_name, event_type, event_date, revenue, expenses')
        .eq('brewery_id', brewery.id)
        .gte('event_date', startDate)
        .order('event_date', { ascending: true }),
    ])
    setMetrics(tmRes.data ?? [])
    setEvents(evRes.data ?? [])
    setLoading(false)
  }, [brewery?.id, startDate, refreshKey])

  useEffect(() => { load() }, [load])

  if (loading) return <SectionSkeleton count={5} />

  if (metrics.length === 0 && events.length === 0) {
    return (
      <EmptyState
        message="No taproom data yet. Enter monthly metrics in Revenue Benchmarking to see taproom analytics."
        linkLabel="Go to Benchmarking"
        linkTo="/benchmarking"
      />
    )
  }

  // ── 5A: Monthly taproom revenue vs benchmark ──────────────────────────────
  const revenueChartData = metrics.map(r => ({
    month:     String(r.metric_month).slice(0, 7),
    revenue:   parseFloat(r.taproom_revenue || r.total_revenue || r.beer_revenue || 0),
    benchmark: null, // benchmark is a median range, shown as reference line
  }))
  const avgMonthlyRev = revenueChartData.length > 0
    ? revenueChartData.reduce((s, r) => s + r.revenue, 0) / revenueChartData.length
    : 0

  // ── 5B: Revenue per operating day ─────────────────────────────────────────
  const revPerDay = metrics.map(r => ({
    month:   String(r.metric_month).slice(0, 7),
    perDay:  r.operating_days > 0
      ? +(parseFloat(r.taproom_revenue || r.total_revenue || 0) / parseFloat(r.operating_days)).toFixed(0)
      : null,
    days:    r.operating_days,
  })).filter(r => r.perDay != null)

  // ── 5C: Labor % of revenue ────────────────────────────────────────────────
  const laborPctData = metrics
    .filter(r => r.labor_cost != null && parseFloat(r.taproom_revenue || r.total_revenue || 0) > 0)
    .map(r => ({
      month:    String(r.metric_month).slice(0, 7),
      laborPct: +(parseFloat(r.labor_cost) / parseFloat(r.taproom_revenue || r.total_revenue) * 100).toFixed(1),
      labor:    r.labor_cost,
      revenue:  r.taproom_revenue || r.total_revenue,
    }))

  // ── 5D: Event ROI by type ─────────────────────────────────────────────────
  const eventTypeMap = {}
  events.forEach(e => {
    const t   = e.event_type || 'Other'
    const rev = parseFloat(e.revenue || 0)
    const exp = parseFloat(e.expenses || 0)
    if (!eventTypeMap[t]) eventTypeMap[t] = { type: t, revenue: 0, expenses: 0, count: 0, best: 0 }
    eventTypeMap[t].revenue  += rev
    eventTypeMap[t].expenses += exp
    eventTypeMap[t].count++
    const roi = exp > 0 ? ((rev - exp) / exp * 100) : 0
    if (roi > eventTypeMap[t].best) eventTypeMap[t].best = roi
  })
  const eventROIData = Object.values(eventTypeMap).map(e => ({
    type:  e.type,
    roi:   e.expenses > 0 ? +((e.revenue - e.expenses) / e.expenses * 100).toFixed(1) : 0,
    count: e.count,
    best:  +e.best.toFixed(1),
  })).sort((a, b) => b.roi - a.roi)

  // ── 5E: Avg transaction value ─────────────────────────────────────────────
  const txnData = metrics
    .filter(r => r.avg_transaction_value != null)
    .map(r => ({
      month:   String(r.metric_month).slice(0, 7),
      txn:     parseFloat(r.avg_transaction_value),
    }))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* 5A — Monthly Taproom Revenue */}
      <ChartCard title="5A — Monthly Taproom Revenue">
        {revenueChartData.length === 0 ? (
          <EmptyState message="No taproom revenue data yet." linkLabel="Enter metrics" linkTo="/benchmarking" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={revenueChartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollarK(v)]} labelFormatter={fmtMonth} />
              <ReferenceLine y={avgMonthlyRev} stroke={AMBER} strokeDasharray="4 2" label={{ value: 'Your avg', position: 'right', fontSize: 9, fill: AMBER }} />
              <Bar dataKey="revenue" name="Revenue" fill={PURPLE} radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 5B — Revenue Per Operating Day */}
      <ChartCard title="5B — Revenue Per Operating Day">
        {revPerDay.length === 0 ? (
          <EmptyState message="No revenue per day data. Enter operating days in benchmarking." linkLabel="Enter metrics" linkTo="/benchmarking" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revPerDay} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollarK(v), 'Revenue/Day']} labelFormatter={fmtMonth} />
              <ReferenceLine y={TAPROOM_BENCHMARKS.revenue_per_day.median} stroke={GREEN} strokeDasharray="4 2" label={{ value: '$1,800 median', position: 'right', fontSize: 9, fill: GREEN }} />
              <Line type="monotone" dataKey="perDay" stroke={PURPLE} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 5C — Labor % of Revenue */}
      <ChartCard title="5C — Labor % of Revenue">
        {laborPctData.length === 0 ? (
          <EmptyState message="No labor cost data yet. Enter labor costs in benchmarking." linkLabel="Enter metrics" linkTo="/benchmarking" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={laborPctData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 60]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtPct(v), 'Labor %']}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{fmtMonth(d.month)}</p><p>Labor %: {d.laborPct}%</p><p>Labor: {fmtDollarK(d.labor)}</p><p>Revenue: {fmtDollarK(d.revenue)}</p></div>
                }}
              />
              <ReferenceLine y={TAPROOM_BENCHMARKS.labor_pct.median} stroke={GREEN} strokeDasharray="4 2" label={{ value: '32% median', position: 'right', fontSize: 9, fill: GREEN }} />
              <ReferenceLine y={40} stroke={RED} strokeDasharray="4 2" label={{ value: '40% warning', position: 'right', fontSize: 9, fill: RED }} />
              <Line type="monotone" dataKey="laborPct" stroke={PURPLE} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 5D — Event ROI by Type */}
      <ChartCard title="5D — Event ROI by Type">
        {eventROIData.length === 0 ? (
          <EmptyState message="No event data yet." linkLabel="Go to Events" linkTo="/events" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={eventROIData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 70 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} width={65} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload
                return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{d.type}</p><p>Avg ROI: {d.roi}%</p><p>Events: {d.count}</p><p>Best: {d.best}%</p></div>
              }} />
              <ReferenceLine x={0} stroke={NAVY} strokeWidth={1.5} />
              <Bar dataKey="roi" radius={[0, 4, 4, 0]}>
                {eventROIData.map((r, i) => <Cell key={i} fill={r.roi >= 0 ? GREEN : RED} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 5E — Average Transaction Value */}
      <ChartCard title="5E — Average Transaction Value">
        {txnData.length === 0 ? (
          <EmptyState message="No transaction data yet. Enter avg transaction in benchmarking." linkLabel="Enter metrics" linkTo="/benchmarking" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={txnData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollar(v), 'Avg Transaction']} labelFormatter={fmtMonth} />
              <ReferenceLine y={TAPROOM_BENCHMARKS.avg_transaction.median} stroke={GREEN} strokeDasharray="4 2" label={{ value: '$19 median', position: 'right', fontSize: 9, fill: GREEN }} />
              <Line type="monotone" dataKey="txn" stroke={PURPLE} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — INVENTORY & INGREDIENTS
// ═══════════════════════════════════════════════════════════════════════════════

function InventorySection({ brewery, startDate, refreshKey }) {
  const [loading, setLoading]         = useState(true)
  const [ingredients, setIngredients] = useState([])
  const [usage, setUsage]             = useState([])

  const load = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [ingRes, useRes] = await Promise.all([
      supabase
        .from('ingredients')
        .select('id, name, category, current_stock_quantity, reorder_threshold, unit_of_measure, average_cost_per_unit')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true),
      supabase
        .from('ingredient_usage_log')
        .select('ingredient_id, quantity_used, used_date, unit_cost')
        .eq('brewery_id', brewery.id)
        .gte('used_date', startDate)
        .order('used_date', { ascending: true }),
    ])
    setIngredients(ingRes.data ?? [])
    setUsage(useRes.data ?? [])
    setLoading(false)
  }, [brewery?.id, startDate, refreshKey])

  useEffect(() => { load() }, [load])

  if (loading) return <SectionSkeleton count={3} />

  if (ingredients.length === 0) {
    return (
      <EmptyState
        message="No inventory data yet. Add ingredients in the Inventory module."
        linkLabel="Go to Inventory"
        linkTo="/inventory"
      />
    )
  }

  // ── 6A: Inventory turnover (turns per year) ───────────────────────────────
  const periodDays = Math.max(1, Math.round((new Date() - new Date(startDate)) / 86400000))
  const usageByIng = {}
  usage.forEach(u => {
    if (!usageByIng[u.ingredient_id]) usageByIng[u.ingredient_id] = 0
    usageByIng[u.ingredient_id] += parseFloat(u.quantity_used || 0)
  })
  const turnoverData = ingredients
    .map(i => {
      const totalUsed = usageByIng[i.id] || 0
      const annualUsed = totalUsed * (365 / periodDays)
      const avgStock   = parseFloat(i.current_stock_quantity || 0)
      const turns      = avgStock > 0 ? +(annualUsed / avgStock).toFixed(1) : 0
      return { name: i.name, turns, avgStock, totalUsed: +totalUsed.toFixed(1) }
    })
    .filter(i => i.totalUsed > 0)
    .sort((a, b) => b.totalUsed - a.totalUsed)
    .slice(0, 15)

  // ── 6B: Ingredient cost trend (top 5 by spend) ────────────────────────────
  const spendByIng = {}
  usage.forEach(u => {
    if (!spendByIng[u.ingredient_id]) spendByIng[u.ingredient_id] = 0
    spendByIng[u.ingredient_id] += parseFloat(u.quantity_used || 0) * parseFloat(u.unit_cost || 0)
  })
  const top5ids = Object.entries(spendByIng)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)
  const top5names = top5ids.reduce((acc, id) => {
    const ing = ingredients.find(i => i.id === id)
    acc[id] = ing?.name ?? id
    return acc
  }, {})

  // Build monthly cost data per ingredient
  const costMonthMap = {}
  usage.filter(u => top5ids.includes(u.ingredient_id)).forEach(u => {
    const m    = u.used_date?.slice(0, 7)
    const cost = parseFloat(u.unit_cost || 0)
    const ing  = top5names[u.ingredient_id]
    if (!m || !ing) return
    if (!costMonthMap[m]) costMonthMap[m] = { month: m }
    costMonthMap[m][ing] = cost > 0 ? cost : costMonthMap[m][ing]
  })
  const costTrendData = Object.values(costMonthMap).sort((a, b) => a.month.localeCompare(b.month))
  const top5names_arr = Object.values(top5names)
  const ingPalette    = [AMBER, TEAL, PURPLE, GREEN, ORANGE]

  // ── 6C: Low stock frequency (times hit reorder threshold) ─────────────────
  const lowStockData = ingredients
    .filter(i => {
      const qty     = parseFloat(i.current_stock_quantity || 0)
      const reorder = parseFloat(i.reorder_threshold || 0)
      return reorder > 0 && qty <= reorder
    })
    .map(i => ({
      name:    i.name,
      current: parseFloat(i.current_stock_quantity || 0),
      reorder: parseFloat(i.reorder_threshold || 0),
      unit:    i.unit_of_measure || '',
    }))
    .sort((a, b) => (a.current / a.reorder) - (b.current / b.reorder))
    .slice(0, 15)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* 6A — Inventory Turnover */}
      <ChartCard title="6A — Inventory Turnover (Top 15 by Usage)">
        {turnoverData.length === 0 ? (
          <EmptyState message="No ingredient usage data in this period." />
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={turnoverData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: 'Turns/year', position: 'insideBottom', offset: -2, fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={95} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload
                return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{d.name}</p><p>Turns/year: {d.turns}</p><p>Avg stock: {d.avgStock}</p><p>Total used: {d.totalUsed}</p></div>
              }} />
              <ReferenceLine x={4} stroke={GREEN} strokeDasharray="4 2" label={{ value: '4 turns', position: 'top', fontSize: 9, fill: GREEN }} />
              <Bar dataKey="turns" fill={ORANGE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 6B — Ingredient Cost Trend */}
      <ChartCard title="6B — Cost Trend (Top 5 by Spend)">
        {costTrendData.length === 0 || top5names_arr.length === 0 ? (
          <EmptyState message="No ingredient cost trend data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={costTrendData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmtDollar(v), 'Unit Cost']} labelFormatter={fmtMonth} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {top5names_arr.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={ingPalette[i % ingPalette.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 6C — Current Low Stock Items */}
      <ChartCard title="6C — Items At or Below Reorder Threshold">
        {lowStockData.length === 0 ? (
          <EmptyState message="All ingredients are above reorder thresholds." />
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={lowStockData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={95} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload
                return <div className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow"><p className="font-semibold">{d.name}</p><p>Current: {d.current} {d.unit}</p><p>Reorder at: {d.reorder} {d.unit}</p></div>
              }} />
              <ReferenceLine x={0} stroke={RED} />
              <Bar dataKey="current" name="Current Stock" fill={ORANGE} radius={[0, 4, 4, 0]} />
              <Bar dataKey="reorder" name="Reorder Level" fill="#FED7AA" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}
