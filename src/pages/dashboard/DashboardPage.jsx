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

    // Fetch next scheduled brew and recent efficiency data
    const today = new Date().toISOString().split('T')[0]
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
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

    const [deadlinesResult, grantsResult, periodsResult, recipesResult, inventoryResult, brewDayResult, fermentationResult] = await Promise.all([
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
