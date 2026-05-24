/**
 * AppLayout — the outer shell of every protected page.
 * Renders the sidebar navigation and top bar, then places page content in the main area.
 * On mobile (< 768px) the sidebar collapses to a hamburger menu.
 */
import { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'
import ReadOnlyBanner from '../components/ReadOnlyBanner'
import PastDueBanner from '../components/PastDueBanner'
import OnboardingTour from '../components/OnboardingTour'

// Main nav items — always shown to all users
const MAIN_NAV = [
  { path: '/dashboard',  label: 'Dashboard',           icon: '🏠' },
  { path: '/compliance', label: 'Compliance Calendar', icon: '📅' },
  { path: '/documents',  label: 'Documents',           icon: '📁' },
  { path: '/staff',      label: 'Staff & Certs',       icon: '👥' },
  { path: '/insurance',  label: 'Insurance',           icon: '🛡️' },
  { path: '/permits',    label: 'Local Permits',       icon: '📍' },
  { path: '/ttb',        label: 'TTB Tracker',         icon: '📊' },
  { path: '/grants',     label: 'Grant Finder',        icon: '💰' },
]

// Operations tier nav items — only shown to operations/full_suite subscribers
const OPS_NAV = [
  { path: '/inventory',     label: 'Inventory',    icon: '📦' },
  { path: '/recipes',       label: 'Recipes',      icon: '⚗️' },
  { path: '/brewday',       label: 'Brew Day',     icon: '🗓️' },
  { path: '/fermentation',  label: 'Fermentation', icon: '🫧' },
  { path: '/packaging',     label: 'Packaging',    icon: '📋' },
  { path: '/distribution',  label: 'Distribution', icon: '🚚' },
  { path: '/taproom',       label: 'Taproom',      icon: '🍺' },
]

// Bottom nav items — always shown
const BOTTOM_NAV = [
  { path: '/help',    label: 'Help & FAQ',       icon: '❓' },
  { path: '/account', label: 'Account Settings', icon: '⚙️' },
]

// Maps OPS_NAV paths to sidebar warning keys
const WARNING_KEYS = {
  '/inventory':    'inventory',
  '/fermentation': 'fermentation',
  '/packaging':    'packaging',
  '/distribution': 'distribution',
}

export default function AppLayout() {
  const { user, brewery, isAdmin, profile, refreshProfile, hasAccess, isTrialActive } = useAuth()
  const location = useLocation()

  // How many days remain in the trial (0 if expired or no trial)
  const trialDaysLeft = profile?.trial_expires_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_expires_at) - new Date()) / 86400000))
    : 0

  // True only when the user is genuinely on trial (not a paid subscriber)
  const onActiveTrial = isTrialActive() && !profile?.subscription_status
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  // Onboarding tour — shown once after a new user completes brewery setup
  const [showTour, setShowTour] = useState(false)

  // Mount check — catches the case where AppLayout was already mounted when the flag
  // was set (since /onboarding is a child route inside AppLayout, no remount happens)
  useEffect(() => {
    const flag = localStorage.getItem('show_onboarding_tour')
    const done = localStorage.getItem('onboarding_tour_completed')
    console.log('[AppLayout] MOUNT - show_onboarding_tour:', flag, '| completed:', done)
    if (flag === 'true' && done !== 'true') {
      console.log('[AppLayout] MOUNT - triggering tour')
      setShowTour(true)
      localStorage.removeItem('show_onboarding_tour')
    }
  }, [])

  // Route-change check — catches navigation that happens after mount
  useEffect(() => {
    const flag = localStorage.getItem('show_onboarding_tour')
    const done = localStorage.getItem('onboarding_tour_completed')
    console.log('[AppLayout] Route changed to:', location.pathname, '| show_onboarding_tour:', flag, '| completed:', done)
    if (flag === 'true' && done !== 'true') {
      console.log('[AppLayout] TOUR TRIGGERED by route change')
      setShowTour(true)
      localStorage.removeItem('show_onboarding_tour')
    } else if (flag !== 'true') {
      console.log('[AppLayout] Tour NOT triggered — flag not set')
    } else if (done === 'true') {
      console.log('[AppLayout] Tour NOT triggered — already completed')
    }
  }, [location.pathname])

  function handleTourComplete() {
    localStorage.setItem('onboarding_tour_completed', 'true')
    localStorage.removeItem('show_onboarding_tour')
    setShowTour(false)
    console.log('[AppLayout] Onboarding tour completed and dismissed')
  }

  // Warning counts for sidebar dots — loaded once and refreshed every 5 minutes
  const [sidebarWarnings, setSidebarWarnings] = useState({})

  const loadSidebarWarnings = useCallback(async () => {
    if (!brewery?.id) return
    const today = new Date().toISOString().slice(0, 10)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
    const twentyOneDaysAgo = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10)

    const [
      invRes,
      fermRes,
      readingsRes,
      packagingRes,
      distRes,
    ] = await Promise.all([
      // Inventory: items with zero or low stock
      supabase.from('ingredients').select('id, current_stock_quantity, reorder_threshold')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true),
      // Fermentation: active fermentations
      supabase.from('fermentations').select('id, status, pitch_date')
        .eq('brewery_id', brewery.id)
        .in('status', ['fermenting', 'conditioning', 'lagering', 'ready_to_package']),
      // Gravity readings: to find fermentations without recent readings
      supabase.from('gravity_readings').select('fermentation_id, reading_date')
        .eq('brewery_id', brewery.id)
        .gte('reading_date', threeDaysAgo),
      // Packaging: in-progress runs
      supabase.from('packaging_runs').select('id, status')
        .eq('brewery_id', brewery.id)
        .in('status', ['in_progress', 'planned']),
      // Distribution: overdue keg returns (keg_return_date is the expected return date column)
      supabase.from('distribution_records').select('id, keg_return_date, kegs_returned, keg_returned_date')
        .eq('brewery_id', brewery.id)
        .not('keg_return_date', 'is', null)
        .eq('kegs_returned', false),
    ])

    const warnings = {}

    // Inventory
    const invItems = invRes.data ?? []
    const outOfStock = invItems.filter(i => (parseFloat(i.current_stock_quantity) || 0) <= 0)
    const lowStock = invItems.filter(i => {
      const qty = parseFloat(i.current_stock_quantity) || 0
      const reorder = parseFloat(i.reorder_threshold) || 0
      return reorder > 0 && qty <= reorder && qty > 0
    })
    if (outOfStock.length > 0) warnings.inventory = 'red'
    else if (lowStock.length > 0) warnings.inventory = 'amber'

    // Fermentation: check for active fermentations with no recent reading
    const recentReadingIds = new Set((readingsRes.data ?? []).map(r => r.fermentation_id))
    const missingReadings = (fermRes.data ?? []).filter(f =>
      ['fermenting', 'conditioning', 'lagering'].includes(f.status) && !recentReadingIds.has(f.id)
    )
    const pastLimit = (fermRes.data ?? []).filter(f =>
      f.status === 'fermenting' && f.pitch_date && f.pitch_date <= twentyOneDaysAgo
    )
    if (missingReadings.length > 0 || pastLimit.length > 0) warnings.fermentation = 'red'

    // Packaging
    const inProgressPkg = (packagingRes.data ?? []).filter(r => r.status === 'in_progress')
    if (inProgressPkg.length > 0) warnings.packaging = 'amber'

    // Distribution: overdue keg returns
    const overdueKegs = (distRes.data ?? []).filter(r =>
      r.keg_return_date && r.keg_return_date < today
    )
    if (overdueKegs.length > 0) warnings.distribution = 'red'

    setSidebarWarnings(warnings)
  }, [brewery?.id])

  useEffect(() => {
    loadSidebarWarnings()
    const interval = setInterval(loadSidebarWarnings, 5 * 60 * 1000) // refresh every 5 min
    return () => clearInterval(interval)
  }, [loadSidebarWarnings])

  // Re-fetch the profile once on mount so subscription_status is always current.
  // AuthContext only loads the profile on auth events (login/logout), which means
  // a subscription cancelled externally (e.g. via Stripe) won't be reflected until
  // the user re-opens the app — this one DB read closes that gap.
  useEffect(() => { refreshProfile() }, [])

  // Log the user out and redirect to the login page
  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // Build the main nav, adding Admin panel for admins
  const mainItems = isAdmin()
    ? [...MAIN_NAV, { path: '/admin', label: 'Admin Panel', icon: '🔧' }]
    : MAIN_NAV

  // Shared styles for nav links — active state gets amber highlight
  function navLinkClass({ isActive }) {
    return [
      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
      isActive
        ? 'bg-amber text-white'
        : 'text-gray-300 hover:bg-navy-light hover:text-white',
    ].join(' ')
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo / brand */}
      <div className="px-4 py-5 border-b border-navy-light">
        <h1 className="text-white font-bold text-base leading-tight">
          🍺 The Craft Beer Brief
        </h1>
        {/* Tier badge — shows trial status or actual subscription tier */}
        <p className="text-xs mt-0.5">
          {onActiveTrial ? (
            <span className="bg-amber/20 text-amber font-semibold px-1.5 py-0.5 rounded">
              Operations Trial
            </span>
          ) : profile?.subscription_tier === 'operations' ? (
            <span className="bg-amber/20 text-amber font-semibold px-1.5 py-0.5 rounded">
              Operations
            </span>
          ) : profile?.subscription_tier === 'full_suite' ? (
            <span className="bg-amber/20 text-amber font-semibold px-1.5 py-0.5 rounded">
              Full Suite
            </span>
          ) : (
            <span className="text-amber">Essentials</span>
          )}
        </p>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {/* Main nav */}
        <div className="space-y-1">
          {mainItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={navLinkClass}
              onClick={() => setSidebarOpen(false)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Operations section — only shown to operations/full_suite subscribers */}
        {hasAccess('operations') && (
          <div className="mt-5">
            <p className="px-4 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Operations
            </p>
            <div className="space-y-1">
              {OPS_NAV.map((item) => {
                const warningKey = WARNING_KEYS[item.path]
                const warnLevel  = warningKey ? sidebarWarnings[warningKey] : null
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={navLinkClass}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {warnLevel && (
                      <span className={`ml-auto w-2 h-2 rounded-full shrink-0 ${
                        warnLevel === 'red' ? 'bg-danger' : 'bg-amber'
                      }`} />
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        )}

        {/* Bottom nav — Help & Account */}
        <div className="mt-5 space-y-1">
          {BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={navLinkClass}
              onClick={() => setSidebarOpen(false)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User info at the bottom of the sidebar */}
      <div className="px-4 py-4 border-t border-navy-light">
        <p className="text-gray-400 text-xs truncate">{user?.email}</p>
        <button
          onClick={handleSignOut}
          className="mt-2 text-xs text-gray-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-light">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex md:w-60 md:flex-shrink-0 bg-navy flex-col">
        {sidebarContent}
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Dark background behind the sidebar */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar panel */}
          <aside className="relative w-60 h-full bg-navy flex flex-col z-50">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          {/* Hamburger button — only visible on mobile */}
          <button
            className="md:hidden p-2 rounded-md text-navy hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span className="block w-5 h-0.5 bg-current mb-1" />
            <span className="block w-5 h-0.5 bg-current mb-1" />
            <span className="block w-5 h-0.5 bg-current" />
          </button>

          {/* Brewery name */}
          <div className="flex-1">
            <p className="font-semibold text-navy text-sm">
              {brewery?.name ?? 'Your Brewery'}
            </p>
          </div>

          {/* Logged-in user email — right side */}
          <p className="text-gray-500 text-xs hidden sm:block">{user?.email}</p>

          {/* Trial badge shown in the top bar */}
          {onActiveTrial && (
            <span className="bg-amber/10 text-amber text-xs font-medium px-2 py-1 rounded-full shrink-0">
              {trialDaysLeft}d left
            </span>
          )}
        </header>

        {/* Operations trial banner — shown for the full 14-day trial window */}
        {onActiveTrial && (
          <div className="bg-amber/10 border-b border-amber/30 px-4 py-2.5 flex flex-wrap items-start gap-x-4 gap-y-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-dark">
                You are on a free 14-day Operations trial — {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} remaining.
                You have full access to all Essentials and Operations features.
              </p>
              <p className="text-xs text-amber-dark/80 mt-0.5">
                The Regulation Playbook requires a paid Full Suite subscription.
              </p>
            </div>
            <Link
              to="/upgrade"
              className="shrink-0 bg-amber text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-dark transition-colors whitespace-nowrap"
            >
              Upgrade Now
            </Link>
          </div>
        )}

        {/* Subscription status banners — only one shows at a time, never for active/trial users */}
        {profile?.subscription_status === 'cancelled' && <ReadOnlyBanner />}
        {profile?.subscription_status === 'past_due'  && <PastDueBanner />}

        {/* Page content scrolls independently */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>

        {/* Global footer */}
        <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            © 2026 The Craft Beer Brief. All rights reserved. Content including compliance data, grant
            listings, and database information is proprietary and may not be reproduced, scraped, or
            redistributed without written permission. This app is a tracking and information tool only
            and does not constitute legal, tax, or compliance advice.{' '}
            <Link to="/privacy-policy" className="text-gray-500 hover:text-gray-700 underline">
              Privacy Policy
            </Link>
          </p>
        </footer>
      </div>

      {/* Onboarding tour — portalled to body, shown once after brewery setup */}
      {showTour && <OnboardingTour onComplete={handleTourComplete} />}
    </div>
  )
}
