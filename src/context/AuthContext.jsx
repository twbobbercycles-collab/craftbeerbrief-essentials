/**
 * AuthContext — makes the current user and their brewery available everywhere in the app.
 * Wrap your whole app in <AuthProvider> and then call useAuth() in any component to get the user.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

// Create the context object — this is what gets passed through the component tree
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)         // Supabase auth user
  const [profile, setProfile] = useState(null)   // Row from our users table (has brewery_id, subscription_status, etc.)
  const [brewery, setBrewery] = useState(null)   // Row from our breweries table
  const [loading, setLoading] = useState(true)   // True while we're checking if a session exists

  // Load the user's profile and brewery from our database
  async function loadProfile(authUser) {
    if (!authUser) {
      setProfile(null)
      setBrewery(null)
      return
    }

    const { data: profileData } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()

    setProfile(profileData)

    if (profileData?.brewery_id) {
      const { data: breweryData } = await supabase
        .from('breweries')
        .select('*')
        .eq('id', profileData.brewery_id)
        .single()
      setBrewery(breweryData)
    }
  }

  useEffect(() => {
    // Check if there's already a logged-in session when the app first loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      loadProfile(session?.user ?? null).finally(() => setLoading(false))
    })

    // Listen for login, logout, and token refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY fires when the user clicks a password reset email link.
      // We set the user so updateUser() will work on the reset page, then make sure
      // they are on the reset page (in case Supabase redirected them to the site root
      // instead of /reset-password because the URL wasn't in the Supabase allowlist).
      if (event === 'PASSWORD_RECOVERY') {
        setUser(session?.user ?? null)
        if (window.location.pathname !== '/reset-password') {
          window.location.replace('/reset-password')
        }
        return // Don't load profile or change loading state — not needed for password reset
      }

      setUser(session?.user ?? null)
      // On sign-in (signup or login), show loading until the profile is fetched.
      // Without this, ProtectedRoute renders with profile=null before the DB row is
      // loaded, causing isTrialActive() to return false and bouncing the user to /upgrade.
      if (event === 'SIGNED_IN') {
        setLoading(true)
        loadProfile(session?.user ?? null).finally(() => setLoading(false))
      } else {
        loadProfile(session?.user ?? null)
      }
    })

    // Clean up the listener when the component unmounts
    return () => subscription.unsubscribe()
  }, [])

  // Check if the user's free trial is still active
  function isTrialActive() {
    if (!profile) return false
    if (profile.subscription_status === 'active') return true
    if (!profile.trial_expires_at) return false
    // Date.parse returns UTC milliseconds; Date.now() is also UTC — timezone-safe comparison
    return Date.parse(profile.trial_expires_at) > Date.now()
  }

  // Check if the user has an active paid subscription
  function isSubscribed() {
    return profile?.subscription_status === 'active'
  }

  // Check if this user is the admin
  function isAdmin() {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
    return user?.email === adminEmail
  }

  // Returns the effective subscription tier for the current user.
  // During an active trial, everyone gets 'operations' tier access automatically.
  // Once the trial ends (or on a paid subscription), this returns the real tier.
  function getEffectiveTier() {
    // Paid subscriber — use their actual subscription tier
    if (profile?.subscription_status === 'active') {
      return profile.subscription_tier ?? 'essentials'
    }
    // Active trial — Model A: all trial users get Operations tier access
    if (profile?.trial_expires_at && Date.parse(profile.trial_expires_at) > Date.now()) {
      return 'operations'
    }
    return 'essentials'
  }

  // Returns true if the user's effective tier meets or exceeds the required tier.
  // Tier hierarchy: full_suite (2) > operations (1) > essentials (0)
  //
  // Key rules:
  //   - Trial users automatically get operations-level access (Model A trial system)
  //   - full_suite always requires a real paid full_suite subscription — trial does NOT unlock it
  //   - essentials always returns true
  function hasAccess(requiredTier) {
    const TIER_RANK = { essentials: 0, operations: 1, full_suite: 2 }
    // full_suite is gated behind a real subscription — trial does not grant it
    if (requiredTier === 'full_suite') {
      return profile?.subscription_tier === 'full_suite' && profile?.subscription_status === 'active'
    }
    // For essentials and operations, use the effective tier (trial counts as operations)
    const effectiveTier = getEffectiveTier()
    return (TIER_RANK[effectiveTier] ?? 0) >= (TIER_RANK[requiredTier] ?? 0)
  }

  // Refresh the profile from the database (call this after updating subscription status)
  async function refreshProfile() {
    await loadProfile(user)
  }

  const value = {
    user,
    profile,
    brewery,
    loading,
    isTrialActive,
    isSubscribed,
    isAdmin,
    hasAccess,
    getEffectiveTier,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Custom hook — call useAuth() in any component to get user/profile/brewery
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>. Wrap your app in AuthProvider.')
  }
  return context
}
