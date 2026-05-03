/**
 * PastDueBanner — slim red banner shown when subscription_status is 'past_due'.
 * Notifies the user of a payment failure without locking them out of the app.
 * Dismissible for the current browser session only — reappears on next login.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function PastDueBanner() {
  // Read dismissal state from sessionStorage so it resets each login session
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('pastdue_banner_dismissed') === 'true'
  )

  // Record dismissal in sessionStorage and hide the banner for this session
  function dismiss() {
    sessionStorage.setItem('pastdue_banner_dismissed', 'true')
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div
      style={{ minHeight: 44 }}
      className="bg-red-50 border-b border-red-200 px-4 flex items-center justify-between gap-3 flex-shrink-0"
    >
      <p className="text-xs text-red-800 leading-snug py-2.5">
        <span className="font-semibold">Your payment failed.</span>{' '}
        Please update your payment method to keep your account active.
      </p>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to="/account"
          className="bg-white text-red-700 border border-red-300 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
        >
          Update Payment Method
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="text-red-500 hover:text-red-700 transition-colors p-1 leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
