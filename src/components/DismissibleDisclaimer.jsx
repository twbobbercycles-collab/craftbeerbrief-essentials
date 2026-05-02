/**
 * DismissibleDisclaimer — a notice bar that can be closed by the user.
 * Once dismissed, the preference is stored in localStorage so it does not
 * reappear on subsequent visits. Pass a unique storageKey per page.
 */
import { useState } from 'react'

export default function DismissibleDisclaimer({ storageKey, text }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === 'true'
  )

  if (dismissed) return null

  function handleDismiss() {
    localStorage.setItem(storageKey, 'true')
    setDismissed(true)
  }

  return (
    <div className="flex items-start gap-3 bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
      <p className="flex-1 leading-relaxed">{text}</p>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notice"
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5 text-base leading-none"
      >
        ✕
      </button>
    </div>
  )
}
