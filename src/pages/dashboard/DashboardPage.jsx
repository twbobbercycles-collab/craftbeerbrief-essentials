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
  const { profile, brewery } = useAuth()
  const [loading, setLoading] = useState(true)
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([])
  const [openGrantsCount, setOpenGrantsCount] = useState(0)
  const [ttbStatus, setTtbStatus] = useState(null)  // 'open' | 'due_soon' | 'overdue' | 'filed' | null
  const [showTour, setShowTour] = useState(false)

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

    const [deadlinesResult, grantsResult, periodsResult] = await Promise.all([
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
    ])

    setUpcomingDeadlines(deadlinesResult.data ?? [])
    setOpenGrantsCount(grantsResult.count ?? 0)
    setTtbStatus(computeTtbStatus(brewery, periodsResult.data))
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
