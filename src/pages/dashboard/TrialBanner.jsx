/**
 * TrialBanner — shown on the dashboard when the user is in a free trial.
 * Turns red/urgent when 3 or fewer days remain.
 * Hidden entirely if the user has an active paid subscription.
 */
import { Link } from 'react-router-dom'

export default function TrialBanner({ trialDaysLeft, profile }) {
  // Don't show the banner for paying subscribers
  if (profile?.subscription_status === 'active') return null

  // If trial has ended (0 days left), the ProtectedRoute would have redirected already,
  // but show the banner as a fallback
  if (trialDaysLeft === null) return null

  const isUrgent = trialDaysLeft <= 3

  return (
    <div className={`rounded-lg px-4 py-3 flex items-center justify-between gap-4 ${
      isUrgent ? 'bg-red-50 border border-danger' : 'bg-amber/10 border border-amber'
    }`}>
      <p className={`text-sm font-medium ${isUrgent ? 'text-danger' : 'text-amber-dark'}`}>
        {isUrgent
          ? `⚠️ Your free trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}. Don't lose access to your data.`
          : `🕐 Free trial: ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining`
        }
      </p>
      <Link
        to="/upgrade"
        className={`text-sm font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg transition-colors ${
          isUrgent
            ? 'bg-danger text-white hover:bg-red-700'
            : 'bg-amber text-white hover:bg-amber-dark'
        }`}
      >
        Upgrade Now
      </Link>
    </div>
  )
}
