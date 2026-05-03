/**
 * ProtectedRoute — wraps any page that requires login.
 * Redirect rules (checked in order):
 *
 *   1. Not logged in                                          → /login
 *   2. adminOnly page and not admin                           → /dashboard
 *   3. Profile incomplete (no production_license_type)        → /onboarding
 *      (exempt: /onboarding and /account so the user can reach those pages)
 *   4. subscription_status === 'active'                       → allow full access
 *   5. subscription_status is null + trial in the future      → allow full access
 *   6. subscription_status === 'cancelled'                    → allow read-only access
 *      (ReadOnlyBanner in AppLayout shows the inactive notice;
 *       useReadOnly hook disables action buttons on each page)
 *   7. subscription_status === 'past_due'                     → allow full access
 *      (PastDueBanner in AppLayout shows the payment-failure notice)
 *   8. subscription_status is null + trial expired (or no trial) → /upgrade
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, profile, brewery, isAdmin } = useAuth()
  const location = useLocation()

  // Show a spinner while the auth state and profile are being fetched
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Checking your session..." />
      </div>
    )
  }

  // Rule 1: user must be authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Rule 2: certain pages are restricted to the admin account
  if (adminOnly && !isAdmin()) {
    return <Navigate to="/dashboard" replace />
  }

  // Rules 3–8 require the profile row. If it is still loading after sign-in,
  // wait rather than incorrectly bouncing the user to /upgrade.
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading your account..." />
      </div>
    )
  }

  // Rule 3: brewery exists but onboarding was never finished — send the user
  // to the onboarding page so they can complete their profile.
  // /onboarding and /account are exempt so the user can actually reach those pages.
  const profileIncomplete = !!brewery && !brewery.production_license_type
  const onExemptPath =
    location.pathname === '/onboarding' || location.pathname === '/account'

  if (profileIncomplete && !onExemptPath) {
    return <Navigate to="/onboarding" replace />
  }

  const status = profile.subscription_status

  // Rule 4: active paid subscription — full access
  if (status === 'active') return children

  // Rule 5: free trial still running — full access
  if (!status && Date.parse(profile.trial_expires_at) > Date.now()) return children

  // Rule 6: cancelled subscription — allow in, read-only mode.
  // The ReadOnlyBanner (AppLayout) and ReadOnlyTooltip (each page) handle the UI;
  // this route must NOT redirect or the user loses access to their own data.
  if (status === 'cancelled') return children

  // Rule 7: payment failed but subscription not yet cancelled — full access.
  // The PastDueBanner (AppLayout) prompts the user to update their payment method.
  if (status === 'past_due') return children

  // Rule 8: trial expired with no subscription and no other recognised status
  return <Navigate to="/upgrade" replace />
}
