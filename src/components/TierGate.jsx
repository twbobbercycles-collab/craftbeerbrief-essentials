/**
 * TierGate — wraps any module and shows a polished frosted-glass locked preview
 * when the user's subscription tier is below the required tier.
 *
 * Usage:
 *   <TierGate
 *     requiredTier="operations"
 *     featureName="Recipe Builder & Cost Calculator"
 *     featureDescription="Build and store recipes..."
 *   >
 *     <RecipeBuilderPage />
 *   </TierGate>
 *
 * Props:
 *   requiredTier       — 'operations' or 'full_suite'
 *   featureKey         — machine-readable key matching tier_features.feature_key
 *   featureName        — display name shown in the lock card heading
 *   featureDescription — 2-3 sentence description shown in the lock card body
 *   children           — the actual module UI, rendered but non-interactive when locked
 */
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import TierComparisonModal from './TierComparisonModal'

// Human-readable display info for each lockable tier
const TIER_DISPLAY = {
  operations: { name: 'Operations Tier', price: '$19.99/month' },
  full_suite:  { name: 'Full Suite',      price: '$24.99/month' },
}

export default function TierGate({ requiredTier, featureKey, featureName, featureDescription, children }) {
  const { hasAccess } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)

  // User's tier meets or exceeds the requirement — render children normally with no gate
  if (hasAccess(requiredTier)) {
    return <>{children}</>
  }

  const tierInfo = TIER_DISPLAY[requiredTier] ?? TIER_DISPLAY.operations

  return (
    <>
      {/*
        Outer container with isolation:isolate so the backdrop-filter only blurs
        content inside this component, not the rest of the page.
      */}
      <div
        className="relative min-h-96"
        style={{ isolation: 'isolate' }}
        data-feature-key={featureKey}
      >
        {/* Children render at full fidelity — pointer-events:none makes them non-interactive */}
        <div style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {children}
        </div>

        {/* Frosted glass overlay — sits above children in z-order */}
        <div
          className="absolute inset-0 flex items-center justify-center p-4 z-10"
          style={{
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(255, 255, 255, 0.72)',
          }}
        >
          {/* Lock card — centered on the overlay */}
          <div
            className="bg-white rounded-xl shadow-lg w-full text-center p-6 sm:p-8"
            style={{
              maxWidth: '420px',
              border: '2px solid #1A2744',
              borderTop: '4px solid #C8871A',
            }}
          >
            {/* Lock icon */}
            <div className="text-4xl mb-3" role="img" aria-label="Locked">🔒</div>

            {/* Feature name */}
            <h3 className="text-lg font-bold text-navy mb-2">{featureName}</h3>

            {/* Feature description */}
            <p className="text-gray-500 text-sm leading-relaxed mb-4">{featureDescription}</p>

            {/* Required tier and price */}
            <p className="text-amber font-semibold text-sm mb-5">
              {tierInfo.name} — {tierInfo.price}
            </p>

            {/* Primary CTA — navigate to upgrade page */}
            <a
              href="/upgrade"
              className="block w-full bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors mb-3"
            >
              Upgrade Now
            </a>

            {/* Secondary link — opens the full tier comparison modal */}
            <button
              onClick={() => setModalOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xs transition-colors"
            >
              See what&apos;s included →
            </button>
          </div>
        </div>
      </div>

      {/* Tier comparison modal — rendered outside the locked area so it isn't blurred */}
      {modalOpen && <TierComparisonModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
