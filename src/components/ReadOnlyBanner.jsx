/**
 * ReadOnlyBanner — slim amber banner shown when subscription_status is 'cancelled'.
 * Sits below the top nav bar and above page content.
 * Tells the user their data is preserved and gives them a direct resubscribe link.
 * Dismissible for the current browser session only — reappears on next login.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function ReadOnlyBanner() {
  // Read dismissal state from sessionStorage so it resets each login session
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('readonly_banner_dismissed') === 'true'
  )

  // Record dismissal in sessionStorage and hide the banner for this session
  function dismiss() {
    sessionStorage.setItem('readonly_banner_dismissed', 'true')
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div
      style={{ minHeight: 44 }}
      className="bg-amber/10 border-b border-amber/30 px-4 flex items-center justify-between gap-3 flex-shrink-0"
    >
      <p className="text-xs text-amber-900 leading-snug py-2.5">
        <span className="font-semibold">Your subscription is inactive.</span>{' '}
        Your data is safe and preserved. Resubscribe anytime to continue where you left off.
      </p>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to="/upgrade"
          className="bg-navy text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-navy-light transition-colors whitespace-nowrap"
        >
          Resubscribe Now
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="text-amber-700 hover:text-amber-900 transition-colors p-1 leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
