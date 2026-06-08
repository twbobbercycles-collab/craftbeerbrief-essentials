/**
 * BatchProfitabilityPage — Planned vs actual production cost and yield report.
 * Pulls from the batch_profitability_summary VIEW which joins:
 *   brew_days → fermentations → packaging_runs → recipes
 * No new data entry required — all values come from the Operations modules.
 */
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import TierGate from '../../components/TierGate'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt$(val) {
  if (val == null || isNaN(parseFloat(val))) return '—'
  return '$' + parseFloat(val).toFixed(2)
}

function fmtPct(val) {
  if (val == null || isNaN(parseFloat(val))) return '—'
  return parseFloat(val).toFixed(1) + '%'
}

function fmtBbl(val) {
  if (val == null || isNaN(parseFloat(val))) return '—'
  return parseFloat(val).toFixed(2) + ' bbl'
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtCurrency(val) {
  if (val == null || isNaN(parseFloat(val))) return '—'
  return '$' + parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Status pipeline ───────────────────────────────────────────────────────────

function deriveBatchStatus(batch) {
  if (batch.packaging_status === 'complete')              return 'complete'
  if (batch.packaging_status === 'in_progress')           return 'packaging'
  if (batch.packaging_status === 'planned')               return 'packaging_planned'
  if (batch.fermentation_id)                              return 'fermenting'
  if (batch.brew_day_status === 'in_progress')            return 'brewing'
  if (batch.brew_day_status === 'completed')              return 'brew_complete'
  return 'scheduled'
}

const STATUS_STYLES = {
  scheduled:        { label: 'Scheduled',         cls: 'bg-gray-100 text-gray-600' },
  brewing:          { label: 'Brewing',            cls: 'bg-blue-100 text-blue-700' },
  brew_complete:    { label: 'Brew Complete',      cls: 'bg-blue-100 text-blue-700' },
  fermenting:       { label: 'Fermenting',         cls: 'bg-purple-100 text-purple-700' },
  packaging_planned:{ label: 'Ready to Package',  cls: 'bg-amber-100 text-amber-700' },
  packaging:        { label: 'Packaging',          cls: 'bg-amber-100 text-amber-700' },
  complete:         { label: 'Complete',           cls: 'bg-green-100 text-green-700' },
}

// ── Financial helper ──────────────────────────────────────────────────────────
// Planned selling price per pint: price = cost / (1 - margin).
// Example: cost = $1.50, margin = 65% → price = $1.50 / 0.35 = $4.29
function calcPricePerPint(costPerPint, marginPct) {
  if (costPerPint == null || marginPct == null) return null
  const margin = parseFloat(marginPct) / 100
  if (margin >= 1 || margin < 0) return null
  return parseFloat(costPerPint) / (1 - margin)
}

// ── Small reusable UI components ──────────────────────────────────────────────

function SummaryCard({ label, value, subtext, subtextGood }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-navy">{value}</p>
      {subtext && (
        <p className={`text-xs mt-0.5 ${subtextGood === true ? 'text-green-600' : subtextGood === false ? 'text-danger' : 'text-gray-400'}`}>
          {subtext}
        </p>
      )}
    </div>
  )
}

function MetricCell({ label, value, highlight }) {
  const valueColor = highlight === 'green' ? 'text-green-600' : highlight === 'red' ? 'text-danger' : 'text-navy'
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`font-semibold ${valueColor}`}>{value}</p>
    </div>
  )
}

function VarianceCard({ label, planned, actual, variance, formatFn, goodWhenNegative }) {
  const isGood = variance == null ? null
    : goodWhenNegative ? variance <= 0 : variance >= 0

  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</p>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">Planned</span>
        <span className="font-medium text-navy">{planned}</span>
      </div>
      <div className="flex justify-between text-sm mb-3">
        <span className="text-gray-400">Actual</span>
        <span className="font-medium text-navy">{actual}</span>
      </div>
      <div className={`text-center py-1.5 rounded text-sm font-semibold ${
        variance == null
          ? 'bg-gray-50 text-gray-400'
          : isGood
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-danger'
      }`}>
        {variance == null
          ? 'No data'
          : `${variance >= 0 ? '+' : '−'}${formatFn(Math.abs(variance))}`}
      </div>
    </div>
  )
}

// ── Batch detail panel ────────────────────────────────────────────────────────

function BatchDetail({ batch }) {
  const plannedPrice = calcPricePerPint(batch.recipe_cost_per_pint, batch.target_margin_percentage)
  const actualPrice  = calcPricePerPint(batch.actual_cost_per_pint, batch.target_margin_percentage)

  const effVariance = batch.actual_brewhouse_efficiency != null && batch.target_brewhouse_efficiency != null
    ? parseFloat(batch.actual_brewhouse_efficiency) - parseFloat(batch.target_brewhouse_efficiency)
    : null

  // Volume variance: total packaged vs planned batch size (both in barrels)
  const volVariance = batch.total_volume_packaged != null && batch.planned_batch_size != null
    ? parseFloat(batch.total_volume_packaged) - parseFloat(batch.planned_batch_size)
    : null

  // Cost variance: actual - planned. Positive = over budget (bad).
  const costVariance = batch.actual_cost_per_pint != null && batch.recipe_cost_per_pint != null
    ? parseFloat(batch.actual_cost_per_pint) - parseFloat(batch.recipe_cost_per_pint)
    : null

  // Revenue and profit from distribution records
  const actualRevenue     = parseFloat(batch.actual_revenue || 0) > 0 ? parseFloat(batch.actual_revenue) : null
  const actualGrossProfit = actualRevenue != null && batch.actual_gross_profit != null
    ? parseFloat(batch.actual_gross_profit)
    : null
  const actualGrossMarginPct = actualRevenue != null && actualGrossProfit != null
    ? (actualGrossProfit / actualRevenue) * 100
    : null

  // Planned revenue = planned price per pint × packaged pints
  const plannedRevenue = plannedPrice != null && batch.total_volume_packaged != null
    ? plannedPrice * parseFloat(batch.total_volume_packaged) * 124
    : null
  const plannedGrossProfit = plannedRevenue != null && batch.total_planned_cost != null
    ? plannedRevenue - parseFloat(batch.total_planned_cost)
    : null
  const revenueVariance = plannedRevenue != null && actualRevenue != null
    ? actualRevenue - plannedRevenue
    : null
  const profitVariance = plannedGrossProfit != null && actualGrossProfit != null
    ? actualGrossProfit - plannedGrossProfit
    : null

  // Build a merged list of container types from planned and actual splits
  const plannedSplits = Array.isArray(batch.planned_splits) ? batch.planned_splits : []
  const actualSplits  = Array.isArray(batch.actual_splits)  ? batch.actual_splits  : []
  const allTypes = [...new Set([
    ...plannedSplits.map(s => s.container_type),
    ...actualSplits.map(s => s.container_type),
  ])]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Detail header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-navy text-base">
            {batch.beer_name || 'Unnamed Batch'} — #{batch.batch_number}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Brewed {fmtDate(batch.brew_date)}
            {batch.beer_style ? ` · ${batch.beer_style}` : ''}
          </p>
        </div>
        <Link
          to={`/brewday/${batch.brew_day_id}`}
          className="text-sm text-amber hover:underline font-medium"
        >
          View Brew Day Log →
        </Link>
      </div>

      <div className="p-5 space-y-6">

        {/* ── Section 1: Production Metrics ───────────────────────────────── */}
        <section>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Production Metrics
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <MetricCell
              label="Planned Batch Size"
              value={batch.planned_batch_size
                ? `${parseFloat(batch.planned_batch_size).toFixed(2)} ${batch.planned_batch_unit ?? 'bbl'}`
                : '—'}
            />
            <MetricCell
              label="Volume Into Fermenter"
              value={fmtBbl(batch.volume_into_fermenter)}
            />
            <MetricCell
              label="Volume From Fermenter"
              value={fmtBbl(batch.volume_from_fermenter)}
            />
            <MetricCell
              label="Total Volume Packaged"
              value={fmtBbl(batch.total_volume_packaged)}
            />
            <MetricCell
              label="Packaging Yield"
              value={fmtPct(batch.packaging_yield_percentage)}
              highlight={
                batch.packaging_yield_percentage == null ? null :
                parseFloat(batch.packaging_yield_percentage) >= 90 ? 'green' : 'red'
              }
            />
            <MetricCell
              label="Yield Loss"
              value={fmtBbl(batch.yield_loss_volume)}
            />
            <MetricCell
              label="OG — Target / Actual"
              value={`${batch.target_og ?? '—'} / ${batch.actual_og ?? '—'}`}
              highlight={
                batch.actual_og != null && batch.target_og != null
                  ? parseFloat(batch.actual_og) >= parseFloat(batch.target_og) ? 'green' : 'red'
                  : null
              }
            />
            <MetricCell
              label="FG — Target / Actual"
              value={`${batch.target_fg ?? '—'} / ${batch.actual_fg ?? '—'}`}
            />
            <MetricCell
              label="ABV (Actual)"
              value={batch.actual_abv != null ? `${parseFloat(batch.actual_abv).toFixed(1)}%` : '—'}
            />
          </div>
        </section>

        {/* ── Section 2: Package Split Comparison ─────────────────────────── */}
        {allTypes.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Package Split Comparison
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Container</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Planned %</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Actual %</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {allTypes.map(type => {
                    const p = plannedSplits.find(s => s.container_type === type)
                    const a = actualSplits.find(s => s.container_type === type)
                    const pPct = p ? parseFloat(p.percentage) : null
                    const aPct = a ? parseFloat(a.percentage) : null
                    const diff = pPct != null && aPct != null ? aPct - pPct : null
                    return (
                      <tr key={type} className="border-b border-gray-50">
                        <td className="px-3 py-2.5 font-medium text-navy">{type}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {pPct != null ? fmtPct(pPct) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {aPct != null ? fmtPct(aPct) : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                          diff == null ? 'text-gray-400' :
                          Math.abs(diff) < 2 ? 'text-gray-500' :
                          'text-amber'
                        }`}>
                          {diff != null ? `${diff >= 0 ? '+' : ''}${fmtPct(diff)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Section 3: Financial Analysis ────────────────────────────────── */}
        <section>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Financial Analysis
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <MetricCell label="Planned Cost/Pint" value={fmt$(batch.recipe_cost_per_pint)} />
            <MetricCell
              label="Actual Cost/Pint"
              value={fmt$(batch.actual_cost_per_pint)}
              highlight={
                costVariance == null ? null :
                costVariance <= 0 ? 'green' : 'red'
              }
            />
            <MetricCell
              label="Cost Variance"
              value={
                costVariance == null ? '—' :
                `${costVariance >= 0 ? '+' : ''}${fmt$(costVariance)}`
              }
              highlight={
                costVariance == null ? null :
                costVariance <= 0 ? 'green' : 'red'
              }
            />
            <MetricCell label="Target Margin" value={fmtPct(batch.target_margin_percentage)} />
            <MetricCell
              label="Planned Price/Pint"
              value={fmt$(plannedPrice)}
            />
            <MetricCell
              label="Est. Actual Price/Pint"
              value={fmt$(actualPrice)}
            />
          </div>
          {actualRevenue != null && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Distribution Revenue
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                <MetricCell label="Actual Revenue"      value={fmtCurrency(actualRevenue)} highlight="green" />
                <MetricCell
                  label="Actual Gross Profit"
                  value={actualGrossProfit != null ? fmtCurrency(actualGrossProfit) : '—'}
                  highlight={actualGrossProfit != null ? (actualGrossProfit >= 0 ? 'green' : 'red') : null}
                />
                <MetricCell
                  label="Actual Gross Margin"
                  value={actualGrossMarginPct != null ? fmtPct(actualGrossMarginPct) : '—'}
                  highlight={actualGrossMarginPct != null ? (actualGrossMarginPct >= 40 ? 'green' : 'red') : null}
                />
                <MetricCell
                  label="Units Sold"
                  value={`${batch.total_units_sold ?? 0} units · ${batch.delivery_count ?? 0} ${parseInt(batch.delivery_count ?? 0) === 1 ? 'delivery' : 'deliveries'}`}
                />
              </div>
            </div>
          )}
          {batch.target_margin_percentage != null && plannedPrice != null && (
            <p className="text-xs text-gray-400 mt-3">
              Price estimates use the recipe's target margin ({fmtPct(batch.target_margin_percentage)}) applied to actual cost.
              {actualRevenue == null && ' No distribution records found for this batch — assign distribution in the Distribution module to track real revenue.'}
            </p>
          )}
        </section>

        {/* ── Section 4: Variance Analysis ─────────────────────────────────── */}
        <section>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Variance Analysis
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <VarianceCard
              label="Brewhouse Efficiency"
              planned={fmtPct(batch.target_brewhouse_efficiency)}
              actual={fmtPct(batch.actual_brewhouse_efficiency)}
              variance={effVariance}
              formatFn={v => fmtPct(v)}
              goodWhenNegative={false}
            />
            <VarianceCard
              label="Volume Packaged"
              planned={
                batch.planned_batch_size
                  ? `${parseFloat(batch.planned_batch_size).toFixed(2)} ${batch.planned_batch_unit ?? 'bbl'}`
                  : '—'
              }
              actual={fmtBbl(batch.total_volume_packaged)}
              variance={volVariance}
              formatFn={v => `${v.toFixed(2)} bbl`}
              goodWhenNegative={false}
            />
            <VarianceCard
              label="Cost Per Pint"
              planned={fmt$(batch.recipe_cost_per_pint)}
              actual={fmt$(batch.actual_cost_per_pint)}
              variance={costVariance}
              formatFn={v => fmt$(v)}
              goodWhenNegative={true}
            />
          </div>
          {(revenueVariance != null || plannedRevenue != null) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <VarianceCard
                label="Revenue vs Target"
                planned={plannedRevenue != null ? fmtCurrency(plannedRevenue) : '—'}
                actual={actualRevenue != null ? fmtCurrency(actualRevenue) : '—'}
                variance={revenueVariance}
                formatFn={v => fmtCurrency(v)}
                goodWhenNegative={false}
              />
              <VarianceCard
                label="Gross Profit vs Target"
                planned={plannedGrossProfit != null ? fmtCurrency(plannedGrossProfit) : '—'}
                actual={actualGrossProfit != null ? fmtCurrency(actualGrossProfit) : '—'}
                variance={profitVariance}
                formatFn={v => fmtCurrency(v)}
                goodWhenNegative={false}
              />
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BatchProfitabilityPage() {
  const { brewery } = useAuth()
  const [batches, setBatches] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brewery?.id) return
    loadBatches()
  }, [brewery?.id])

  async function loadBatches() {
    setLoading(true)
    const { data, error } = await supabase
      .from('batch_profitability_summary')
      .select('*')
      .order('brew_date', { ascending: false })
    if (error) {
      console.error('Error loading batch profitability:', error)
    } else {
      setBatches(data ?? [])
    }
    setLoading(false)
  }

  const selectedBatch = batches.find(b => b.brew_day_id === selectedId) ?? null

  // Portfolio summary computed from all batches that have cost data
  const portfolioStats = useMemo(() => {
    const withPlanCost   = batches.filter(b => b.recipe_cost_per_pint != null)
    const withActualCost = batches.filter(b => b.actual_cost_per_pint != null)
    const withYield      = batches.filter(b => b.packaging_yield_percentage != null)
    const completed      = batches.filter(b => b.packaging_status === 'complete')
    const withRevenue    = batches.filter(b => parseFloat(b.actual_revenue || 0) > 0)

    function avg(arr, key) {
      return arr.length > 0
        ? arr.reduce((s, b) => s + parseFloat(b[key] || 0), 0) / arr.length
        : null
    }

    const avgPlanCost   = avg(withPlanCost, 'recipe_cost_per_pint')
    const avgActualCost = avg(withActualCost, 'actual_cost_per_pint')
    const totalRevenue  = withRevenue.length > 0
      ? withRevenue.reduce((s, b) => s + parseFloat(b.actual_revenue), 0)
      : null

    const withGrossProfit = batches.filter(b =>
      parseFloat(b.actual_revenue || 0) > 0 && b.actual_gross_profit != null
    )
    const avgGrossMarginPct = withGrossProfit.length > 0
      ? withGrossProfit.reduce((s, b) =>
          s + (parseFloat(b.actual_gross_profit) / parseFloat(b.actual_revenue) * 100), 0
        ) / withGrossProfit.length
      : null

    const bestBatch = withGrossProfit.length > 0
      ? withGrossProfit.reduce((best, b) =>
          parseFloat(b.actual_gross_profit) > parseFloat(best.actual_gross_profit) ? b : best
        )
      : null

    return {
      totalBatches:     batches.length,
      completedBatches: completed.length,
      avgPlanCost,
      avgActualCost,
      costDelta: avgPlanCost != null && avgActualCost != null
        ? avgActualCost - avgPlanCost
        : null,
      avgYield:          avg(withYield, 'packaging_yield_percentage'),
      totalRevenue,
      avgGrossMarginPct,
      bestBatch,
    }
  }, [batches])

  if (loading) return <LoadingSpinner message="Loading batch report..." />

  return (
    <TierGate
      requiredTier="operations"
      featureKey="batch_profitability"
      featureName="Batch Profitability Report"
      featureDescription="Track planned vs actual production costs and yields across every batch — automatically pulled from your Brew Day, Fermentation, and Packaging data. No extra data entry required."
    >
      <div className="space-y-6">

        {/* Page header */}
        <div>
          <h2 className="text-xl font-bold text-navy">Batch Profitability Report</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Planned vs actual costs and yields for every batch. Data pulled automatically from Brew Day, Fermentation, and Packaging.
          </p>
        </div>

        {/* Portfolio summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Batches"
            value={portfolioStats.totalBatches}
          />
          <SummaryCard
            label="Completed Batches"
            value={portfolioStats.completedBatches}
          />
          <SummaryCard
            label="Avg Planned Cost/Pint"
            value={fmt$(portfolioStats.avgPlanCost)}
          />
          <SummaryCard
            label="Avg Actual Cost/Pint"
            value={fmt$(portfolioStats.avgActualCost)}
            subtext={
              portfolioStats.costDelta != null
                ? `${portfolioStats.costDelta >= 0 ? '+' : ''}${fmt$(portfolioStats.costDelta)} vs plan`
                : portfolioStats.avgYield != null
                  ? `${fmtPct(portfolioStats.avgYield)} avg yield`
                  : null
            }
            subtextGood={
              portfolioStats.costDelta != null
                ? portfolioStats.costDelta <= 0
                : null
            }
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Total Actual Revenue"
            value={portfolioStats.totalRevenue != null ? fmtCurrency(portfolioStats.totalRevenue) : '—'}
            subtext={portfolioStats.totalRevenue != null ? 'from distribution records' : 'No sales recorded yet'}
          />
          <SummaryCard
            label="Avg Gross Margin"
            value={portfolioStats.avgGrossMarginPct != null ? fmtPct(portfolioStats.avgGrossMarginPct) : '—'}
            subtext={portfolioStats.avgGrossMarginPct != null ? 'across batches with sales' : null}
          />
          <SummaryCard
            label="Best Batch Profit"
            value={portfolioStats.bestBatch?.actual_gross_profit != null
              ? fmtCurrency(portfolioStats.bestBatch.actual_gross_profit)
              : '—'}
            subtext={portfolioStats.bestBatch?.beer_name ?? null}
          />
        </div>

        {/* Batch list */}
        {batches.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-3xl mb-3">🍺</p>
            <p className="font-semibold text-navy mb-1">No batches yet</p>
            <p className="text-sm text-gray-500 mb-4">
              Schedule your first brew day to start tracking batch profitability.
            </p>
            <Link to="/brewday" className="text-sm font-medium text-amber hover:underline">
              Go to Brew Day →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-navy">All Batches</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Click a row to see the full batch report.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Batch</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Style</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Brew Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Plan $/pt</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actual $/pt</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Yield</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(batch => {
                    const statusKey = deriveBatchStatus(batch)
                    const { label, cls } = STATUS_STYLES[statusKey] ?? STATUS_STYLES.scheduled
                    const isSelected = batch.brew_day_id === selectedId
                    const plannedCost = batch.recipe_cost_per_pint
                    const actualCost  = batch.actual_cost_per_pint
                    const costDelta   = plannedCost != null && actualCost != null
                      ? parseFloat(actualCost) - parseFloat(plannedCost)
                      : null

                    return (
                      <tr
                        key={batch.brew_day_id}
                        onClick={() => setSelectedId(isSelected ? null : batch.brew_day_id)}
                        className={`border-b border-gray-50 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber/5 border-l-2 border-l-amber'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-navy">{batch.beer_name || '—'}</p>
                          <p className="text-xs text-gray-400">#{batch.batch_number}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{batch.beer_style || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(batch.brew_date)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {fmt$(plannedCost)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {actualCost != null ? (
                            <>
                              <span className={costDelta != null
                                ? costDelta <= 0 ? 'text-green-600 font-medium' : 'text-danger font-medium'
                                : 'text-navy'
                              }>
                                {fmt$(actualCost)}
                              </span>
                              {costDelta != null && (
                                <span className={`block text-[10px] ${costDelta <= 0 ? 'text-green-500' : 'text-danger'}`}>
                                  {costDelta <= 0 ? '▼' : '▲'} {fmt$(Math.abs(costDelta))}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {batch.packaging_yield_percentage != null ? (
                            <span className={
                              parseFloat(batch.packaging_yield_percentage) >= 90 ? 'text-green-600 font-medium' :
                              parseFloat(batch.packaging_yield_percentage) >= 80 ? 'text-amber font-medium' :
                              'text-danger font-medium'
                            }>
                              {fmtPct(batch.packaging_yield_percentage)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Batch detail — shown when a row is selected */}
        {selectedBatch && <BatchDetail batch={selectedBatch} />}

      </div>
    </TierGate>
  )
}
