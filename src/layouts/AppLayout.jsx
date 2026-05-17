/**
 * AppLayout — the outer shell of every protected page.
 * Renders the sidebar navigation and top bar, then places page content in the main area.
 * On mobile (< 768px) the sidebar collapses to a hamburger menu.
 */
import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'
import ReadOnlyBanner from '../components/ReadOnlyBanner'
import PastDueBanner from '../components/PastDueBanner'

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
  { path: '/inventory', label: 'Inventory', icon: '📦' },
  { path: '/brewday',   label: 'Brew Day',  icon: '🗓️' },
  { path: '/recipes',   label: 'Recipes',   icon: '⚗️' },
]

// Bottom nav items — always shown
const BOTTOM_NAV = [
  { path: '/help',    label: 'Help & FAQ',       icon: '❓' },
  { path: '/account', label: 'Account Settings', icon: '⚙️' },
]

export default function AppLayout() {
  const { user, brewery, isAdmin, profile, refreshProfile, hasAccess } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

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
        {/* Show a tier badge for Operations and Full Suite subscribers; plain text for Essentials */}
        <p className="text-xs mt-0.5">
          {profile?.subscription_tier === 'operations' ? (
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
              {OPS_NAV.map((item) => (
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

          {/* Trial badge if still in trial */}
          {profile && !profile.subscription_status && profile.trial_expires_at && (
            <span className="bg-amber/10 text-amber text-xs font-medium px-2 py-1 rounded-full">
              Trial
            </span>
          )}
        </header>

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
    </div>
  )
}
