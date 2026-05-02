/**
 * ProtectedRoute — wraps any page that requires login.
 * Redirect rules (checked in order):
 *   1. Not logged in → /login
 *   2. adminOnly page and not admin → /dashboard
 *   3. Trial expired and no subscription → /upgrade
 *   4. Brewery profile incomplete (no production_license_type) → /onboarding
 *      (exempt: /onboarding and /account so the user can actually fix it)
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, brewery, isTrialActive, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Checking your session..." />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin()) {
    return <Navigate to="/dashboard" replace />
  }

  if (!isTrialActive()) {
    return <Navigate to="/upgrade" replace />
  }

  // If the brewery row exists but onboarding was never completed, push the user
  // back to onboarding. Skip this check on /onboarding itself and /account so
  // they can reach the page that lets them complete or edit their profile.
  const profileIncomplete = !!brewery && !brewery.production_license_type
  const onExemptPath =
    location.pathname === '/onboarding' || location.pathname === '/account'

  if (profileIncomplete && !onExemptPath) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}
