/**
 * DashboardPage — the home screen after login.
 * Shows: upcoming deadlines, TTB status, open grants count, trial/subscription banner.
 * This is the first page users see every time they log in.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import TrialBanner from './TrialBanner'
import IncompleteProfileBanner from './IncompleteProfileBanner'
import ComplianceAlertBanner from './ComplianceAlertBanner'
import OnboardingTour from '../../components/OnboardingTour'

const TOUR_KEY = 'onboarding_tour_completed'

export default function DashboardPage() {
  const { profile, brewery, hasAccess } = useAuth()
  const [loading, setLoading] = useState(true)
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([])
  const [openGrantsCount, setOpenGrantsCount] = useState(0)
  const [ttbStatus, setTtbStatus] = useState(null)  // 'open' | 'due_soon' | 'overdue' | 'filed' | null
  const [showTour, setShowTour] = useState(false)
  const [recipeStats, setRecipeStats] = useState({ count: 0, recentName: null })
  const [inventoryAlerts, setInventoryAlerts] = useState({ lowStock: 0, outOfStock: 0, expiring: 0 })
  const [brewDayStats, setBrewDayStats] = useState({ nextBrew: null, thisMonthCount: 0, avgEfficiency: null })
  const [fermentationStats, setFermentationStats] = useState({ activeCount: 0, readyCount: 0, dryHopsDue: 0 })
  const [packagingStats, setPackagingStats] = useState({ inProgress: 0, planned: 0 })
  const [distributionStats, setDistributionStats] = useState({ batchesThisMonth: 0, kegsAwaitingReturn: 0 })
  const [taproomStats, setTaproomStats] = useState({ activeHandles: 0, longOnTap: 0, highestMarginPct: null })
  const [eventStats, setEventStats] = useState({ upcomingCount: 0, nextEvent: null, lastRoi: null })
  const [wholesaleStats, setWholesaleStats] = useState({ followupDue: 0, atRisk: 0, activeCount: 0 })
  const [trainingStats,    setTrainingStats]    = useState({ overdueCount: 0, expiringCount: 0, pendingCount: 0 })
  const [benchmarkStats,   setBenchmarkStats]   = useState({ currentRevenue: null, lastYearRevenue: null, laborPct: null })
  const [batchProfitStats, setBatchProfitStats] = useState({ recentBatch: null, avgCostDelta: null })

  useEffect(() => {
    if (!brewery?.id) return
    loadDashboardData()
  }, [brewery?.id])

  // Show the tour once, 1 second after data finishes loading, for first-time users
  useEffect(() => {
    if (loading) return
    if (localStorage.getItem(TOUR_KEY)) return
    const timer = setTimeout(() => setShowTour(true), 1000)
    return () => clearTimeout(timer)
  }, [loading])

  async function loadDashboardData() {
    setLoading(true)

    // Fetch deadlines due in the next 30 days that are not yet complete
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    // Declare date strings here so they are available to all promise builders below
    const today      = new Date().toISOString().split('T')[0]
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

    // Only query recipes and inventory if the user has Operations/Full Suite access
    const recipesPromise = hasAccess('operations')
      ? supabase
          .from('recipes')
          .select('name', { count: 'exact' })
          .eq('brewery_id', brewery.id)
          .eq('is_archived', false)
          .order('updated_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], count: 0 })

    const inventoryPromise = hasAccess('operations')
      ? supabase
          .from('ingredients')
          .select('current_stock_quantity, reorder_threshold, expiration_date, is_active')
          .eq('brewery_id', brewery.id)
          .eq('is_active', true)
      : Promise.resolve({ data: [] })

    // Fetch active fermentations for the dashboard widget
    const fermentationPromise = hasAccess('operations')
      ? supabase
          .from('fermentations')
          .select('id, status, dry_hop_scheduled, dry_hop_completed, dry_hop_date')
          .eq('brewery_id', brewery.id)
          .not('status', 'in', '("packaged","dumped")')
      : Promise.resolve({ data: [] })

    // Packaging stats: runs in progress + planned runs coming up
    const packagingPromise = hasAccess('operations')
      ? Promise.all([
          supabase
            .from('packaging_runs')
            .select('id', { count: 'exact' })
            .eq('brewery_id', brewery.id)
            .eq('status', 'in_progress'),
          supabase
            .from('packaging_runs')
            .select('id', { count: 'exact' })
            .eq('brewery_id', brewery.id)
            .eq('status', 'planned'),
          supabase
            .from('batch_packages')
            .select('id', { count: 'exact' })
            .eq('brewery_id', brewery.id)
            .gte('packaging_date', monthStart),
          supabase
            .from('distribution_records')
            .select('id', { count: 'exact' })
            .eq('brewery_id', brewery.id)
            .eq('returnable_kegs', true)
            .eq('kegs_returned', false),
        ])
      : Promise.resolve([{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }])

    // Active taproom handles: draft/taproom records not yet kicked, last 90 days
    // Staff training records for Full Suite users — expired and expiring in 30 days
    const thirtyFromNow = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const trainingPromise = hasAccess('full_suite')
      ? Promise.all([
          supabase
            .from('staff_training_records')
            .select('expiration_date')
            .eq('brewery_id', brewery.id)
            .not('expiration_date', 'is', null),
          supabase
            .from('training_assignments')
            .select('id')
            .eq('brewery_id', brewery.id)
            .eq('status', 'assigned'),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }])

    // Wholesale accounts for Full Suite users — follow-ups and at-risk counts
    const wholesalePromise = hasAccess('full_suite')
      ? Promise.all([
          supabase
            .from('wholesale_accounts')
            .select('id, account_name, status, next_followup_date')
            .eq('brewery_id', brewery.id)
            .neq('status', 'lost'),
          supabase
            .from('distribution_records')
            .select('account_name, account_id, delivery_date')
            .eq('brewery_id', brewery.id)
            .gte('delivery_date', new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }])

    // Upcoming and recent taproom events for Full Suite users
    const eventsPromise = hasAccess('full_suite')
      ? supabase
          .from('taproom_events')
          .select('id, event_name, event_date, status, actual_beer_revenue, actual_food_revenue, other_revenue, ticket_revenue, entertainment_cost, marketing_cost, staffing_cost, supplies_cost, other_costs')
          .eq('brewery_id', brewery.id)
          .not('status', 'eq', 'cancelled')
          .order('event_date', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] })

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const taproomPromise = hasAccess('operations')
      ? supabase
          .from('distribution_records')
          .select('id, package_type, delivery_date, sale_price_per_unit, ingredient_cost_per_unit, packaging_cost_per_unit')
          .eq('brewery_id', brewery.id)
          .or('kegs_returned.is.null,kegs_returned.eq.false')
          .gte('delivery_date', ninetyDaysAgo)
      : Promise.resolve({ data: [] })

    // Fetch next scheduled brew and recent efficiency data
    const brewDayPromise = hasAccess('operations')
      ? Promise.all([
          supabase
            .from('brew_days')
            .select('brew_date, recipe_name, beer_style, status')
            .eq('brewery_id', brewery.id)
            .eq('status', 'scheduled')
            .gte('brew_date', today)
            .order('brew_date', { ascending: true })
            .limit(1),
          supabase
            .from('brew_days')
            .select('id')
            .eq('brewery_id', brewery.id)
            .gte('brew_date', monthStart),
          supabase
            .from('brew_days')
            .select('actual_brewhouse_efficiency')
            .eq('brewery_id', brewery.id)
            .eq('status', 'completed')
            .not('actual_brewhouse_efficiency', 'is', null)
            .order('brew_date', { ascending: false })
            .limit(5),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }, { data: [] }])

    // Taproom benchmarking: current month and same month last year for Full Suite users
    const benchMonth     = monthStart
    const lastYearMonth  = new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1).toISOString().split('T')[0]
    const benchmarkPromise = hasAccess('full_suite')
      ? supabase
          .from('taproom_metrics')
          .select('metric_month, taproom_revenue, labor_cost')
          .eq('brewery_id', brewery.id)
          .in('metric_month', [benchMonth, lastYearMonth])
      : Promise.resolve({ data: [] })

    // Last 5 batches for the Batch Profitability dashboard widget (Operations+)
    const batchProfitPromise = hasAccess('operations')
      ? supabase
          .from('batch_profitability_summary')
          .select('brew_day_id, beer_name, batch_number, recipe_cost_per_pint, actual_cost_per_pint, packaging_yield_percentage, packaging_status')
          .order('brew_date', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] })

    const [deadlinesResult, grantsResult, periodsResult, recipesResult, inventoryResult, brewDayResult, fermentationResult, packagingResult, taproomResult, eventsResult, wholesaleResult, trainingResults, benchmarkResult, batchProfitResult] = await Promise.all([
      supabase
        .from('brewery_deadlines')
        .select('*, compliance_deadlines(*)')
        .eq('brewery_id', brewery.id)
        .eq('is_complete', false)
        .lte('custom_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .order('custom_date', { ascending: true })
        .limit(5),

      supabase
        .from('grants')
        .select('id', { count: 'exact' })
        .eq('approved', true)
        .eq('status', 'open')
        .or(`states_eligible.cs.{"${brewery?.state}"},states_eligible.cs.{"All States"}`),

      // Fetch the current period row (if the brewery has marked it as filed)
      supabase
        .from('ttb_filing_periods')
        .select('status, period_start, period_end')
        .eq('brewery_id', brewery.id)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle(),

      recipesPromise,
      inventoryPromise,
      brewDayPromise,
      fermentationPromise,
      packagingPromise,
      taproomPromise,
      eventsPromise,
      wholesalePromise,
      trainingPromise,
      benchmarkPromise,
      batchProfitPromise,
    ])

    setUpcomingDeadlines(deadlinesResult.data ?? [])
    setOpenGrantsCount(grantsResult.count ?? 0)
    setTtbStatus(computeTtbStatus(brewery, periodsResult.data))
    setRecipeStats({
      count: recipesResult.count ?? 0,
      recentName: recipesResult.data?.[0]?.name ?? null,
    })

    // Compute brew day stats (next scheduled, month count, avg efficiency)
    if (Array.isArray(brewDayResult)) {
      const [nextRes, monthRes, effRes] = brewDayResult
      const nextBrew = nextRes?.data?.[0] ?? null
      const thisMonthCount = monthRes?.data?.length ?? 0
      const effRows = effRes?.data ?? []
      const avgEfficiency = effRows.length > 0
        ? effRows.reduce((s, r) => s + parseFloat(r.actual_brewhouse_efficiency || 0), 0) / effRows.length
        : null
      setBrewDayStats({ nextBrew, thisMonthCount, avgEfficiency })
    }

    // Compute fermentation stats: active count, ready to package, dry hops due today or overdue
    const fermRows = fermentationResult.data ?? []
    const todayStr = new Date().toISOString().slice(0, 10)
    setFermentationStats({
      activeCount: fermRows.filter(f => ['fermenting', 'conditioning', 'lagering'].includes(f.status)).length,
      readyCount:  fermRows.filter(f => f.status === 'ready_to_package').length,
      dryHopsDue:  fermRows.filter(f => f.dry_hop_scheduled && !f.dry_hop_completed && f.dry_hop_date && f.dry_hop_date <= todayStr).length,
    })

    // Compute packaging and distribution stats
    if (Array.isArray(packagingResult)) {
      const [inProgressRes, plannedRes, batchesRes, kegsRes] = packagingResult
      setPackagingStats({
        inProgress: inProgressRes?.count ?? 0,
        planned:    plannedRes?.count    ?? 0,
      })
      setDistributionStats({
        batchesThisMonth:   batchesRes?.count ?? 0,
        kegsAwaitingReturn: kegsRes?.count    ?? 0,
      })
    }

    // Compute taproom stats — active handles and any that have been on 30+ days
    const taproomRows = (taproomResult.data ?? []).filter(r => {
      const pt = (r.package_type || '').toLowerCase()
      return pt.includes('draft') || pt.includes('taproom')
    })
    const longOnTap = taproomRows.filter(r => {
      if (!r.delivery_date) return false
      const days = Math.floor((new Date(today) - new Date(r.delivery_date + 'T00:00:00')) / 86400000)
      return days > 30
    }).length
    const highestMarginPct = taproomRows.length > 0
      ? Math.max(...taproomRows.map(r => {
          const sale = parseFloat(r.sale_price_per_unit) || 0
          const cost = (parseFloat(r.ingredient_cost_per_unit) || 0) + (parseFloat(r.packaging_cost_per_unit) || 0)
          return sale > 0 ? ((sale - cost) / sale) * 100 : 0
        }))
      : null
    setTaproomStats({ activeHandles: taproomRows.length, longOnTap, highestMarginPct })

    // Compute taproom event stats for Full Suite users
    const eventsRows = eventsResult.data ?? []
    const upcomingEvents = eventsRows
      .filter(e => e.event_date >= today && ['planned', 'confirmed'].includes(e.status))
    const completedEvents = eventsRows.filter(e => e.status === 'completed')
    const nextEvent = upcomingEvents[0] ?? null
    const lastCompleted = completedEvents[completedEvents.length - 1] ?? null
    let lastRoi = null
    if (lastCompleted) {
      const rev = (parseFloat(lastCompleted.actual_beer_revenue) || 0)
        + (parseFloat(lastCompleted.actual_food_revenue) || 0)
        + (parseFloat(lastCompleted.other_revenue) || 0)
        + (parseFloat(lastCompleted.ticket_revenue) || 0)
      const cost = (parseFloat(lastCompleted.entertainment_cost) || 0)
        + (parseFloat(lastCompleted.marketing_cost) || 0)
        + (parseFloat(lastCompleted.staffing_cost) || 0)
        + (parseFloat(lastCompleted.supplies_cost) || 0)
        + (parseFloat(lastCompleted.other_costs) || 0)
      lastRoi = cost > 0 ? ((rev - cost) / cost) * 100 : null
    }
    setEventStats({ upcomingCount: upcomingEvents.length, nextEvent, lastRoi })

    // Compute wholesale stats: follow-ups due today or overdue, active accounts at risk
    if (Array.isArray(wholesaleResult)) {
      const [acctRes, recentOrdersRes] = wholesaleResult
      const accts = acctRes.data ?? []
      const recentOrders = recentOrdersRes.data ?? []
      const recentNames = new Set(recentOrders.map(r => (r.account_name || '').toLowerCase()))
      const followupDue = accts.filter(a => a.next_followup_date && a.next_followup_date <= today).length
      const atRisk = accts.filter(a =>
        a.status === 'active' &&
        !recentNames.has((a.account_name || '').toLowerCase())
      ).length
      setWholesaleStats({ followupDue, atRisk, activeCount: accts.filter(a => a.status === 'active').length })
    }

    // Compute training stats: expired records, records expiring within 30 days, and pending assignments
    const [trainingRecordsResult, trainingAssignResult] = trainingResults
    const trainingRows = trainingRecordsResult.data ?? []
    setTrainingStats({
      overdueCount:  trainingRows.filter(r => r.expiration_date < today).length,
      expiringCount: trainingRows.filter(r => r.expiration_date >= today && r.expiration_date <= thirtyFromNow).length,
      pendingCount:  (trainingAssignResult.data ?? []).length,
    })

    // Compute benchmarking stats: current month revenue vs same month last year, and labor %
    const benchRows = benchmarkResult.data ?? []
    const curRow = benchRows.find(r => r.metric_month === benchMonth)
    const lyRow  = benchRows.find(r => r.metric_month === lastYearMonth)
    const curRev = curRow ? parseFloat(curRow.taproom_revenue) || null : null
    const lyRev  = lyRow  ? parseFloat(lyRow.taproom_revenue)  || null : null
    const curLabor = curRow ? parseFloat(curRow.labor_cost) || null : null
    setBenchmarkStats({
      currentRevenue:  curRev,
      lastYearRevenue: lyRev,
      laborPct: (curRev && curLabor) ? (curLabor / curRev) * 100 : null,
    })

    // Compute inventory alert counts from the raw ingredient rows
    const ings = inventoryResult.data ?? []
    setInventoryAlerts({
      lowStock:   ings.filter(i => i.reorder_threshold != null && (parseFloat(i.current_stock_quantity) || 0) <= parseFloat(i.reorder_threshold) && (parseFloat(i.current_stock_quantity) || 0) > 0).length,
      outOfStock: ings.filter(i => (parseFloat(i.current_stock_quantity) || 0) === 0).length,
      expiring:   ings.filter(i => {
        if (!i.expiration_date) return false
        return Math.ceil((new Date(i.expiration_date) - new Date()) / 86400000) <= 30
      }).length,
    })
    // Compute batch profitability widget stats from the last 5 batches
    const batchRows = batchProfitResult.data ?? []
    const withDeltas = batchRows.filter(b => b.recipe_cost_per_pint != null && b.actual_cost_per_pint != null)
    const avgCostDelta = withDeltas.length > 0
      ? withDeltas.reduce((s, b) => s + (parseFloat(b.actual_cost_per_pint) - parseFloat(b.recipe_cost_per_pint)), 0) / withDeltas.length
      : null
    setBatchProfitStats({ recentBatch: batchRows[0] ?? null, avgCostDelta })

    setLoading(false)
  }

  // Derives a simple status string for the dashboard TTB card.
  // Uses the brewery's filing frequency to compute the current period due date,
  // then checks whether that period has been marked as filed.
  function computeTtbStatus(bry, latestPeriod) {
    const freq = bry?.ttb_filing_frequency
    if (!freq) return null

    const now = new Date()
    const y   = now.getFullYear()
    const m   = now.getMonth()

    let dueDate
    let periodStart, periodEnd

    if (freq === 'quarterly') {
      const q  = Math.floor(m / 3)
      const qs = q * 3
      periodStart = new Date(y, qs, 1)
      periodEnd   = new Date(y, qs + 3, 0)
      dueDate     = new Date(y, qs + 3, 14)
    } else if (freq === 'monthly') {
      periodStart = new Date(y, m, 1)
      periodEnd   = new Date(y, m + 1, 0)
      dueDate     = new Date(y, m + 1, 14)
    } else {
      periodStart = new Date(y, 0, 1)
      periodEnd   = new Date(y, 11, 31)
      dueDate     = new Date(y + 1, 1, 14)
    }

    // Check if the latest filed period covers the current period
    if (latestPeriod?.status === 'filed') {
      const filedEnd = new Date(latestPeriod.period_end)
      if (filedEnd >= periodEnd) return 'filed'
    }

    const daysLeft = Math.ceil((dueDate - now) / 86400000)
    if (daysLeft < 0)   return 'overdue'
    if (daysLeft <= 14) return 'due_soon'
    return 'open'
  }

  // Calculate how many days until trial expires
  function daysUntilTrialExpires() {
    if (!profile?.trial_expires_at) return null
    const diff = new Date(profile.trial_expires_at) - new Date()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  function completeTour() {
    localStorage.setItem(TOUR_KEY, 'true')
    setShowTour(false)
  }

  if (loading) return <LoadingSpinner message="Loading your dashboard..." />

  const trialDaysLeft = daysUntilTrialExpires()

  return (
    <div className="space-y-6">
      {showTour && <OnboardingTour onComplete={completeTour} />}
      <h2 data-tour="dashboard-heading" className="text-xl font-bold text-navy">
        Welcome back{brewery?.name ? `, ${brewery.name}` : ''}! 👋
      </h2>

      {/* Incomplete profile warning — shown first so user knows what to do */}
      <IncompleteProfileBanner brewery={brewery} />

      {/* Combined document + certification expiration alert */}
      <ComplianceAlertBanner />

      {/* Inventory alerts — only shown to operations/full_suite subscribers when there are issues */}
      {hasAccess('operations') && (inventoryAlerts.lowStock > 0 || inventoryAlerts.outOfStock > 0 || inventoryAlerts.expiring > 0) && (
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 flex-wrap text-sm
          ${inventoryAlerts.outOfStock > 0 || inventoryAlerts.expiring > 0
            ? 'bg-red-50 border-danger'
            : 'bg-amber/10 border-amber'}`}>
          <div>
            <p className={`font-semibold ${inventoryAlerts.outOfStock > 0 || inventoryAlerts.expiring > 0 ? 'text-danger' : 'text-amber-dark'}`}>
              📦 Inventory Alerts
            </p>
            <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-gray-600">
              {inventoryAlerts.outOfStock > 0 && (
                <span className="text-danger font-medium">{inventoryAlerts.outOfStock} out of stock</span>
              )}
              {inventoryAlerts.expiring > 0 && (
                <span className="text-danger font-medium">{inventoryAlerts.expiring} expiring within 30 days</span>
              )}
              {inventoryAlerts.lowStock > 0 && (
                <span className="text-amber font-medium">{inventoryAlerts.lowStock} at reorder threshold</span>
              )}
            </div>
          </div>
          <Link to="/inventory" className="text-xs font-semibold text-amber hover:underline shrink-0">
            View Inventory →
          </Link>
        </div>
      )}

      {/* Trial / upgrade banner */}
      <TrialBanner trialDaysLeft={trialDaysLeft} profile={profile} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon="📅"
          title="Upcoming Deadlines"
          value={upcomingDeadlines.length}
          subtitle="due in the next 30 days"
          linkTo="/compliance"
          linkLabel="View calendar →"
        />
        <SummaryCard
          icon="💰"
          title="Open Grants"
          value={openGrantsCount}
          subtitle={`matching ${brewery?.state ?? 'your state'}`}
          linkTo="/grants"
          linkLabel="Browse grants →"
        />
        <SummaryCard
          icon="📊"
          title="TTB Filing"
          value={
            ttbStatus === 'filed'    ? 'Filed ✓' :
            ttbStatus === 'due_soon' ? 'Due Soon' :
            ttbStatus === 'overdue'  ? 'Overdue' :
            ttbStatus === 'open'     ? 'Open' :
            'Setup needed'
          }
          subtitle={
            ttbStatus === 'filed'    ? 'Current period filed' :
            ttbStatus === 'due_soon' ? 'Due within 14 days' :
            ttbStatus === 'overdue'  ? 'Past due — file now' :
            ttbStatus === 'open'     ? 'Current period open' :
            'Set your filing frequency'
          }
          linkTo="/ttb"
          linkLabel="View TTB tracker →"
        />
      </div>

      {/* Operations summary — only shown to operations/full_suite subscribers */}
      {hasAccess('operations') && (
        <div className="space-y-4">
          {/* Brew Day widget */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🗓️</span>
                <h3 className="font-semibold text-navy">Brew Day</h3>
              </div>
              <Link to="/brewday" className="text-amber text-sm hover:underline">View schedule →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Next scheduled brew</p>
                {brewDayStats.nextBrew ? (
                  <>
                    <p className="font-semibold text-navy text-sm">
                      {brewDayStats.nextBrew.recipe_name || brewDayStats.nextBrew.beer_style || 'Unnamed batch'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(brewDayStats.nextBrew.brew_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">None scheduled</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Brews this month</p>
                <p className="text-2xl font-bold text-navy">{brewDayStats.thisMonthCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Avg brewhouse efficiency</p>
                {brewDayStats.avgEfficiency != null ? (
                  <p className="text-2xl font-bold text-navy">{brewDayStats.avgEfficiency.toFixed(1)}%</p>
                ) : (
                  <p className="text-sm text-gray-400">No completed brews</p>
                )}
                {brewDayStats.avgEfficiency != null && (
                  <p className="text-xs text-gray-400">last 5 completed</p>
                )}
              </div>
            </div>
          </div>

          {/* Fermentation widget */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧪</span>
                <h3 className="font-semibold text-navy">Fermentation</h3>
              </div>
              <Link to="/fermentation" className="text-amber text-sm hover:underline">View tracker →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Active fermentations</p>
                <p className="text-2xl font-bold text-navy">{fermentationStats.activeCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Ready to package</p>
                <p className={`text-2xl font-bold ${fermentationStats.readyCount > 0 ? 'text-success' : 'text-navy'}`}>
                  {fermentationStats.readyCount}
                </p>
                {fermentationStats.readyCount > 0 && (
                  <p className="text-xs text-success font-medium">Ready now</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Dry hops due</p>
                <p className={`text-2xl font-bold ${fermentationStats.dryHopsDue > 0 ? 'text-amber' : 'text-navy'}`}>
                  {fermentationStats.dryHopsDue}
                </p>
                {fermentationStats.dryHopsDue > 0 && (
                  <p className="text-xs text-amber font-medium">Action needed</p>
                )}
              </div>
            </div>
          </div>

          {/* Packaging widget */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <h3 className="font-semibold text-navy">Packaging</h3>
              </div>
              <Link to="/packaging" className="text-amber text-sm hover:underline">View runs →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Runs in progress</p>
                <p className={`text-2xl font-bold ${packagingStats.inProgress > 0 ? 'text-amber' : 'text-navy'}`}>
                  {packagingStats.inProgress}
                </p>
                {packagingStats.inProgress > 0 && (
                  <p className="text-xs text-amber font-medium">Active now</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Planned runs</p>
                <p className="text-2xl font-bold text-navy">{packagingStats.planned}</p>
                {packagingStats.planned > 0 && (
                  <p className="text-xs text-gray-400">Ready to schedule</p>
                )}
              </div>
            </div>
          </div>

          {/* Distribution widget */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚚</span>
                <h3 className="font-semibold text-navy">Distribution</h3>
              </div>
              <Link to="/distribution" className="text-amber text-sm hover:underline">View log →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Batches shipped this month</p>
                <p className="text-2xl font-bold text-navy">{distributionStats.batchesThisMonth}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Kegs awaiting return</p>
                <p className={`text-2xl font-bold ${distributionStats.kegsAwaitingReturn > 0 ? 'text-amber' : 'text-navy'}`}>
                  {distributionStats.kegsAwaitingReturn}
                </p>
                {distributionStats.kegsAwaitingReturn > 0 && (
                  <p className="text-xs text-amber font-medium">Follow up needed</p>
                )}
              </div>
            </div>
          </div>

          {/* Taproom widget */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🍺</span>
                <h3 className="font-semibold text-navy">Taproom</h3>
              </div>
              <Link to="/taproom" className="text-amber text-sm hover:underline">View taproom →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Active tap handles</p>
                <p className="text-2xl font-bold text-navy">{taproomStats.activeHandles}</p>
                {taproomStats.activeHandles === 0 && (
                  <p className="text-xs text-gray-400">None on tap</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Handles 30+ days on tap</p>
                <p className={`text-2xl font-bold ${taproomStats.longOnTap > 0 ? 'text-amber' : 'text-navy'}`}>
                  {taproomStats.longOnTap}
                </p>
                {taproomStats.longOnTap > 0 && (
                  <p className="text-xs text-amber font-medium">May need rotating</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Best handle margin</p>
                {taproomStats.highestMarginPct != null ? (
                  <p className={`text-2xl font-bold ${taproomStats.highestMarginPct >= 60 ? 'text-success' : taproomStats.highestMarginPct >= 40 ? 'text-amber' : 'text-danger'}`}>
                    {taproomStats.highestMarginPct.toFixed(1)}%
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">No data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Recipes widget */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚗️</span>
                <h3 className="font-semibold text-navy">Recipes</h3>
                <span className="bg-amber/20 text-amber text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                  {profile?.subscription_tier === 'full_suite' ? 'Full Suite' : 'Operations'}
                </span>
              </div>
              <Link to="/recipes" className="text-amber text-sm hover:underline">View recipes →</Link>
            </div>
            <div className="flex items-center gap-8">
              <div>
                <p className="text-2xl font-bold text-navy">{recipeStats.count}</p>
                <p className="text-xs text-gray-500 mt-0.5">active recipes</p>
              </div>
              {recipeStats.recentName && (
                <div>
                  <p className="text-sm font-medium text-navy truncate max-w-xs">{recipeStats.recentName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">most recently updated</p>
                </div>
              )}
              {recipeStats.count === 0 && (
                <p className="text-sm text-gray-400">
                  No recipes yet — <Link to="/recipes" className="text-amber hover:underline">create your first one</Link>
                </p>
              )}
            </div>
          </div>

          {/* Batch Profitability widget */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">💹</span>
                <h3 className="font-semibold text-navy">Batch Profitability</h3>
              </div>
              <Link to="/reports/batch-profitability" className="text-amber text-sm hover:underline">View report →</Link>
            </div>
            {batchProfitStats.recentBatch ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Most recent batch</p>
                  <p className="font-semibold text-navy text-sm">
                    {batchProfitStats.recentBatch.beer_name || 'Unnamed batch'}
                  </p>
                  <p className="text-xs text-gray-400">#{batchProfitStats.recentBatch.batch_number}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Last batch actual cost/pint</p>
                  {batchProfitStats.recentBatch.actual_cost_per_pint != null ? (
                    <p className="text-2xl font-bold text-navy">
                      ${parseFloat(batchProfitStats.recentBatch.actual_cost_per_pint).toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">No packaging data</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Avg cost variance (last 5)</p>
                  {batchProfitStats.avgCostDelta != null ? (
                    <>
                      <p className={`text-2xl font-bold ${batchProfitStats.avgCostDelta <= 0 ? 'text-success' : 'text-danger'}`}>
                        {batchProfitStats.avgCostDelta >= 0 ? '+' : ''}${Math.abs(batchProfitStats.avgCostDelta).toFixed(2)}
                      </p>
                      <p className={`text-xs font-medium ${batchProfitStats.avgCostDelta <= 0 ? 'text-success' : 'text-danger'}`}>
                        {batchProfitStats.avgCostDelta <= 0 ? 'Under budget' : 'Over budget'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">No cost data yet</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No batches yet —{' '}
                <Link to="/brewday" className="text-amber hover:underline">schedule your first brew</Link>.
              </p>
            )}
          </div>

          {/* Wholesale Account Manager widget — Full Suite only */}
          {hasAccess('full_suite') && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤝</span>
                  <h3 className="font-semibold text-navy">Wholesale Accounts</h3>
                  <span className="bg-amber/20 text-amber text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Full Suite
                  </span>
                </div>
                <Link to="/wholesale" className="text-amber text-sm hover:underline">View accounts →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Active accounts</p>
                  <p className="text-2xl font-bold text-navy">{wholesaleStats.activeCount}</p>
                  {wholesaleStats.activeCount === 0 && (
                    <p className="text-xs text-gray-400">None yet</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Follow-ups due</p>
                  <p className={`text-2xl font-bold ${wholesaleStats.followupDue > 0 ? 'text-amber' : 'text-navy'}`}>
                    {wholesaleStats.followupDue}
                  </p>
                  {wholesaleStats.followupDue > 0 && (
                    <p className="text-xs text-amber font-medium">Action needed</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Accounts at risk</p>
                  <p className={`text-2xl font-bold ${wholesaleStats.atRisk > 0 ? 'text-danger' : 'text-navy'}`}>
                    {wholesaleStats.atRisk}
                  </p>
                  {wholesaleStats.atRisk > 0 && (
                    <p className="text-xs text-danger font-medium">No orders in 60+ days</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Staff Training widget — Full Suite only */}
          {hasAccess('full_suite') && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎓</span>
                  <h3 className="font-semibold text-navy">Staff Training</h3>
                  <span className="bg-amber/20 text-amber text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Full Suite
                  </span>
                </div>
                <Link to="/training" className="text-amber text-sm hover:underline">View tracker →</Link>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Overdue records</p>
                  <p className={`text-2xl font-bold ${trainingStats.overdueCount > 0 ? 'text-danger' : 'text-navy'}`}>
                    {trainingStats.overdueCount}
                  </p>
                  {trainingStats.overdueCount > 0 && (
                    <p className="text-xs text-danger font-medium">Renewal required</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Expiring (30d)</p>
                  <p className={`text-2xl font-bold ${trainingStats.expiringCount > 0 ? 'text-amber' : 'text-navy'}`}>
                    {trainingStats.expiringCount}
                  </p>
                  {trainingStats.expiringCount > 0 && (
                    <p className="text-xs text-amber font-medium">Schedule renewal</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Pending assignments</p>
                  <p className={`text-2xl font-bold ${trainingStats.pendingCount > 0 ? 'text-blue-600' : 'text-navy'}`}>
                    {trainingStats.pendingCount}
                  </p>
                  {trainingStats.pendingCount > 0 && (
                    <p className="text-xs text-blue-600 font-medium">Not yet completed</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Revenue Benchmarking widget — Full Suite only */}
          {hasAccess('full_suite') && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📈</span>
                  <h3 className="font-semibold text-navy">Revenue Benchmarking</h3>
                  <span className="bg-amber/20 text-amber text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Full Suite
                  </span>
                </div>
                <Link to="/benchmarking" className="text-amber text-sm hover:underline">View dashboard →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">This month's taproom revenue</p>
                  {benchmarkStats.currentRevenue != null ? (
                    <>
                      <p className="text-2xl font-bold text-navy">
                        ${benchmarkStats.currentRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </p>
                      {benchmarkStats.lastYearRevenue != null && (
                        <p className={`text-xs font-medium ${benchmarkStats.currentRevenue >= benchmarkStats.lastYearRevenue ? 'text-green-600' : 'text-danger'}`}>
                          {benchmarkStats.currentRevenue >= benchmarkStats.lastYearRevenue ? '▲' : '▼'}{' '}
                          {Math.abs(((benchmarkStats.currentRevenue - benchmarkStats.lastYearRevenue) / benchmarkStats.lastYearRevenue) * 100).toFixed(1)}% vs last year
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">No data entered yet</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Labor % of revenue (this month)</p>
                  {benchmarkStats.laborPct != null ? (
                    <>
                      <p className={`text-2xl font-bold ${benchmarkStats.laborPct <= 32 ? 'text-green-600' : benchmarkStats.laborPct <= 40 ? 'text-amber' : 'text-danger'}`}>
                        {benchmarkStats.laborPct.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-400">Benchmark median: 32%</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">Enter labor cost above</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* View Full Analytics link — Operations+ users */}
          <div className="text-center py-2">
            <Link
              to="/analytics"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber hover:underline"
            >
              📊 View Full Analytics Dashboard →
            </Link>
          </div>

          {/* Taproom Events widget — Full Suite only */}
          {hasAccess('full_suite') && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎪</span>
                  <h3 className="font-semibold text-navy">Taproom Events</h3>
                  <span className="bg-amber/20 text-amber text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Full Suite
                  </span>
                </div>
                <Link to="/events" className="text-amber text-sm hover:underline">View planner →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Upcoming events</p>
                  <p className="text-2xl font-bold text-navy">{eventStats.upcomingCount}</p>
                  {eventStats.upcomingCount === 0 && (
                    <p className="text-xs text-gray-400">None planned</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Next event</p>
                  {eventStats.nextEvent ? (
                    <>
                      <p className="font-semibold text-navy text-sm truncate">{eventStats.nextEvent.event_name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(eventStats.nextEvent.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">None scheduled</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Last event ROI</p>
                  {eventStats.lastRoi != null ? (
                    <p className={`text-2xl font-bold ${eventStats.lastRoi >= 50 ? 'text-success' : eventStats.lastRoi >= 0 ? 'text-amber' : 'text-danger'}`}>
                      {eventStats.lastRoi.toFixed(1)}%
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">No completed events</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming deadlines list */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-navy">Deadlines in the Next 30 Days</h3>
          <Link to="/compliance" className="text-amber text-sm hover:underline">
            View all →
          </Link>
        </div>

        {upcomingDeadlines.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm">No upcoming deadlines — you're all caught up!</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {upcomingDeadlines.map((bd) => {
              const deadline = bd.compliance_deadlines
              const dueDate = bd.custom_date
              const daysLeft = Math.ceil(
                (new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24)
              )
              return (
                <li key={bd.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-navy">
                      {deadline?.deadline_name ?? bd.notes ?? 'Custom deadline'}
                    </p>
                    <p className="text-xs text-gray-500">{deadline?.category}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    daysLeft <= 7 ? 'bg-red-100 text-danger' :
                    daysLeft <= 14 ? 'bg-orange-100 text-warning' :
                    'bg-green-100 text-success'
                  }`}>
                    {daysLeft === 0 ? 'Today!' : `${daysLeft}d`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// Small stat card used in the summary grid
function SummaryCard({ icon, title, value, subtitle, linkTo, linkLabel }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <p className="text-2xl font-bold text-navy">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      <Link to={linkTo} className="text-amber text-xs hover:underline mt-3 block">
        {linkLabel}
      </Link>
    </div>
  )
}
