/**
 * TierComparisonModal — full-screen modal comparing all three subscription tiers side by side.
 * Shown when the user clicks "See what's included" in a TierGate locked preview,
 * or when they click "Upgrade Plan" from Account Settings.
 *
 * Props:
 *   onClose — function called to close the modal
 */
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Feature lists kept in sync with 012_subscription_tiers.sql seed data.
// Each tier's list shows ONLY the features NEW to that tier —
// the card header communicates that higher tiers include everything below.
const ESSENTIALS_FEATURES = [
  'State Compliance Calendar with pre-loaded deadlines',
  'TTB Filing & Excise Tax Tracker',
  'Grant & Funding Finder (90+ curated programs)',
  'License Document Storage',
  'Staff Certification Tracker',
  'Insurance Policy Tracker',
  'Local Permit Tracker',
]

const OPERATIONS_FEATURES = [
  'Recipe Builder & Cost Calculator',
  'Ingredient Inventory & Purchase Tracker',
  'Brew Day Scheduler & Log',
  'Fermentation Tracker',
  'Batch-to-Sale Tracker',
  'Vendor & Supplier Price Tracker',
  'Draft Line Profitability Tracker',
]

const FULL_SUITE_FEATURES = [
  'Taproom Event Planner & ROI Tracker',
  'Wholesale Account Manager',
  'Staff Training & Development Tracker',
  'Taproom Revenue Benchmarking Dashboard',
  'Regulation, Policy & Advocacy Playbook (PDF)',
]

// Column configuration for the three tiers
const TIERS = [
  {
    key: 'essentials',
    name: 'Essentials',
    price: '$9.99',
    annual: '$99.99/yr',
    description: 'Compliance fundamentals for every brewery',
    newFeatures: ESSENTIALS_FEATURES,
    inheritedFrom: null,
    upgradeLabel: 'Get Started',
  },
  {
    key: 'operations',
    name: 'Operations',
    price: '$14.99',
    annual: '$149.99/yr',
    description: 'Add full brewing operations management',
    newFeatures: OPERATIONS_FEATURES,
    inheritedFrom: 'Essentials',
    upgradeLabel: 'Upgrade to Operations',
    popular: true,
  },
  {
    key: 'full_suite',
    name: 'Full Suite',
    price: '$19.99',
    annual: '$199.99/yr',
    description: 'Everything, including business intelligence',
    newFeatures: FULL_SUITE_FEATURES,
    inheritedFrom: 'Operations',
    upgradeLabel: 'Upgrade to Full Suite',
  },
]

export default function TierComparisonModal({ onClose }) {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const currentTier = profile?.subscription_tier ?? 'essentials'

  // Close modal then navigate to the upgrade page
  function handleUpgradeClick() {
    onClose()
    navigate('/upgrade')
  }

  return (
    // Full-screen backdrop — clicking outside the card closes the modal
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-6 px-4"
      onClick={onClose}
    >
      {/* Modal panel — stop click propagation so clicking inside doesn't close it */}
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-navy">Compare Plans</h2>
            <p className="text-gray-500 text-sm mt-0.5">Everything included in each tier</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none font-light transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Three-column tier grid — stacks to single column on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {TIERS.map((tier) => {
            const isCurrent = tier.key === currentTier

            return (
              <div
                key={tier.key}
                className={`flex flex-col p-6 relative ${
                  isCurrent ? 'ring-2 ring-amber ring-inset' : ''
                }`}
              >
                {/* Most popular badge — floats above the card on desktop */}
                {tier.popular && (
                  <div className="hidden md:block absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-amber text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Mobile popular badge */}
                {tier.popular && (
                  <div className="md:hidden mb-2">
                    <span className="bg-amber text-white text-xs font-bold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Current plan indicator */}
                {isCurrent && (
                  <div className="text-center mb-2">
                    <span className="bg-amber/10 text-amber text-xs font-semibold px-2 py-0.5 rounded-full">
                      Your current plan
                    </span>
                  </div>
                )}

                {/* Tier name and pricing */}
                <div className="text-center mb-5 mt-2">
                  <h3 className="font-bold text-navy text-lg">{tier.name}</h3>
                  <p className="text-3xl font-bold text-navy mt-1">
                    {tier.price}
                    <span className="text-base font-normal text-gray-400">/mo</span>
                  </p>
                  <p className="text-gray-400 text-xs mt-0.5">{tier.annual} billed annually</p>
                  <p className="text-gray-500 text-xs mt-2 leading-snug">{tier.description}</p>
                </div>

                {/* Feature list */}
                <div className="flex-1 space-y-2 mb-6">
                  {/* Inheritance note for non-essentials tiers */}
                  {tier.inheritedFrom && (
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2 pb-1 border-b border-gray-100">
                      Everything in {tier.inheritedFrom}, plus:
                    </p>
                  )}

                  {tier.newFeatures.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <span className="text-amber font-bold text-sm mt-0.5 shrink-0">✓</span>
                      <span className="text-gray-600 text-sm leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA button */}
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full bg-gray-100 text-gray-400 font-semibold py-2.5 rounded-lg text-sm cursor-default"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={handleUpgradeClick}
                    className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                  >
                    {tier.upgradeLabel}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <div className="px-6 py-4 border-t border-gray-100 text-center">
          <p className="text-gray-400 text-xs">
            All plans include a 14-day free trial. No credit card required to start. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
