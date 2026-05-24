/**
 * UpgradePage — displays all three subscription tiers and initiates Stripe checkout.
 * Accessible from trial expiry, TierGate locked previews, and Account Settings.
 * Replaces the single-plan view with a full three-tier comparison layout.
 */
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'

// Price IDs pulled from Vite environment variables.
// Essentials reuses the existing env var names for backward compatibility.
const PRICE_IDS = {
  essentials: {
    monthly: import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID,
    annual:  import.meta.env.VITE_STRIPE_ANNUAL_PRICE_ID,
  },
  operations: {
    monthly: import.meta.env.VITE_STRIPE_OPERATIONS_MONTHLY_PRICE_ID,
    annual:  import.meta.env.VITE_STRIPE_OPERATIONS_ANNUAL_PRICE_ID,
  },
  full_suite: {
    monthly: import.meta.env.VITE_STRIPE_FULL_SUITE_MONTHLY_PRICE_ID,
    annual:  import.meta.env.VITE_STRIPE_FULL_SUITE_ANNUAL_PRICE_ID,
  },
}

// Annual billing is enabled only when at least one annual price ID is configured.
// Until annual IDs are added to Stripe and .env, the toggle shows "Coming soon".
const annualEnabled = !!(
  PRICE_IDS.operations.annual || PRICE_IDS.full_suite.annual
)

// Numeric rank so we can compare tiers and hide downgrade buttons
const TIER_RANK = { essentials: 0, operations: 1, full_suite: 2 }

// Features shown on each card — higher tiers include a null sentinel for a visual divider
const ESSENTIALS_LIST = [
  'State Compliance Calendar with pre-loaded deadlines',
  'TTB Filing & Excise Tax Tracker',
  'Grant & Funding Finder (90+ curated programs)',
  'License Document Storage',
  'Staff Certification Tracker',
  'Insurance Policy Tracker',
  'Local Permit Tracker',
]

const OPERATIONS_ONLY = [
  'Recipe Builder & Cost Calculator',
  'Ingredient Inventory & Purchase Tracker',
  'Brew Day Scheduler & Log',
  'Fermentation Tracker',
  'Batch-to-Sale Tracker',
  'Vendor & Supplier Price Tracker',
  'Draft Line Profitability Tracker',
]

const FULL_SUITE_ONLY = [
  'Taproom Event Planner & ROI Tracker',
  'Wholesale Account Manager',
  'Staff Training & Development Tracker',
  'Taproom Revenue Benchmarking Dashboard',
  'Regulation, Policy & Advocacy Playbook (PDF)',
]

// Each tier's complete feature list. null renders as a divider between inherited and new features.
const TIERS = [
  {
    key: 'essentials',
    name: 'Essentials',
    monthlyPrice: 14.99,
    annualPrice: 149.99,
    annualMonthly: 12.50,
    annualSavings: 30,
    features: ESSENTIALS_LIST,
  },
  {
    key: 'operations',
    name: 'Operations',
    monthlyPrice: 19.99,
    annualPrice: 199.99,
    annualMonthly: 16.67,
    annualSavings: 39.89,
    features: [...ESSENTIALS_LIST, null, ...OPERATIONS_ONLY],
    popular: true,
  },
  {
    key: 'full_suite',
    name: 'Full Suite',
    monthlyPrice: 24.99,
    annualPrice: 249.99,
    annualMonthly: 20.83,
    annualSavings: 49.89,
    features: [...ESSENTIALS_LIST, null, ...OPERATIONS_ONLY, null, ...FULL_SUITE_ONLY],
  },
]

export default function UpgradePage() {
  const { user, profile } = useAuth()
  const [billing, setBilling] = useState('monthly')
  const [loading, setLoading] = useState('')   // set to a tierKey while that checkout is loading
  const [error, setError] = useState('')

  const currentTier = profile?.subscription_tier ?? 'essentials'
  const subscriptionStatus = profile?.subscription_status
  const isActiveSub = subscriptionStatus === 'active'
  const isCancelled = subscriptionStatus === 'cancelled'

  // True when the user had a trial that is now expired and they haven't subscribed yet.
  // Used to tailor card labels and show a retention warning on the Essentials card.
  const isTrialExpired = !isActiveSub
    && !!profile?.trial_expires_at
    && new Date(profile.trial_expires_at) <= new Date()

  // Kick off Stripe checkout for the selected tier and billing cycle
  async function handleCheckout(tierKey) {
    const priceId = PRICE_IDS[tierKey]?.[billing]

    if (!priceId) {
      setError(
        `${billing === 'annual' ? 'Annual' : 'Monthly'} pricing for ${TIERS.find(t => t.key === tierKey)?.name} is not configured yet. Please choose monthly or contact support.`
      )
      return
    }

    setError('')
    setLoading(tierKey)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId,
          userId: user.id,
          email: user.email,
          successUrl: `${window.location.origin}/dashboard?checkout=success`,
          cancelUrl:  `${window.location.origin}/upgrade`,
        },
      })

      if (fnError) throw fnError
      window.location.href = data.url
    } catch {
      setError('Could not start checkout. Please try again or contact support.')
      setLoading('')
    }
  }

  // Returns the CTA element for a given tier card
  function renderButton(tier) {
    const tierRank = TIER_RANK[tier.key] ?? 0
    const userRank = TIER_RANK[currentTier] ?? 0
    const isCurrentTier = tier.key === currentTier && isActiveSub

    // Already on this plan
    if (isCurrentTier) {
      return (
        <button
          disabled
          className="w-full py-3 rounded-lg text-sm font-semibold bg-gray-100 text-gray-400 cursor-default"
        >
          Current Plan
        </button>
      )
    }

    // Downgrade — don't show a checkout button, just a contact note
    if (isActiveSub && tierRank < userRank) {
      return (
        <p className="text-xs text-center text-gray-400 py-3">
          Contact us to switch to a lower tier
        </p>
      )
    }

    // Determine button label based on context
    let label
    if (tier.key === 'essentials') {
      label = isCancelled ? 'Resubscribe' : 'Get Started'
    } else if (isActiveSub) {
      label = `Upgrade to ${tier.name}`
    } else {
      label = `Start with ${tier.name}`
    }

    const isLoading = loading === tier.key

    return (
      <button
        onClick={() => handleCheckout(tier.key)}
        disabled={!!loading}
        className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-60"
      >
        {isLoading ? 'Redirecting to checkout...' : label}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-light py-10 px-4">

      {/* Page header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-navy">🍺 The Craft Beer Brief Essentials</h1>
        {isCancelled ? (
          <p className="text-gray-600 mt-2">Welcome back — reactivate to regain full access.</p>
        ) : isActiveSub ? (
          <p className="text-gray-600 mt-2">Upgrade your plan to unlock more tools.</p>
        ) : isTrialExpired ? (
          <p className="text-warning font-semibold mt-2">
            Your 14-day Operations trial has ended — subscribe to keep access.
          </p>
        ) : (
          <p className="text-gray-600 mt-2">Choose the plan that fits your brewery.</p>
        )}
        <p className="text-gray-500 text-sm mt-1">Choose the plan that fits your brewery.</p>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <button
          onClick={() => setBilling('monthly')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            billing === 'monthly'
              ? 'bg-amber text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Monthly
        </button>

        {/* Annual toggle — disabled with "Coming soon" label if price IDs are not yet configured */}
        <button
          onClick={() => annualEnabled && setBilling('annual')}
          title={annualEnabled ? undefined : 'Annual plans coming soon'}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            billing === 'annual'
              ? 'bg-amber text-white'
              : annualEnabled
                ? 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                : 'bg-white text-gray-400 border border-gray-200 cursor-not-allowed'
          }`}
        >
          Annual
          {annualEnabled ? (
            <span className="ml-1.5 text-xs font-semibold text-green-600">Save up to $60</span>
          ) : (
            <span className="ml-1.5 text-xs text-gray-400">(Coming soon)</span>
          )}
        </button>
      </div>

      {/* Global error message */}
      {error && (
        <div className="max-w-5xl mx-auto mb-6">
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Three tier cards — side by side on desktop, stacked on mobile */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {TIERS.map((tier) => {
          const isCurrentTier = tier.key === currentTier && isActiveSub

          // When the trial has just expired, Operations is the user's "familiar" plan
          const isTrialPlan = isTrialExpired && tier.key === 'operations'

          // Card border highlight
          const borderCls = isCurrentTier
            ? 'border-amber'
            : isTrialPlan
              ? 'border-amber'
              : tier.popular && !isTrialExpired
                ? 'border-navy'
                : 'border-gray-200'

          return (
            <div key={tier.key} className="flex flex-col gap-3">
            <div
              className={`bg-white rounded-xl shadow-sm flex flex-col relative border-2 ${borderCls}`}
            >
              {/* Badge — "Your Trial Plan" for trial-expired Operations, "Most Popular" otherwise */}
              {(isTrialPlan || (tier.popular && !isTrialExpired)) && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-amber text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    {isTrialPlan ? 'Your Trial Plan — Recommended' : 'Most Popular'}
                  </span>
                </div>
              )}

              {/* Card header */}
              <div className={`px-6 pt-6 pb-4 border-b border-gray-100 ${isTrialPlan || (tier.popular && !isTrialExpired) ? 'pt-8' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-bold text-navy text-lg">{tier.name}</h2>
                  {isCurrentTier && (
                    <span className="bg-amber/10 text-amber text-xs font-semibold px-2 py-0.5 rounded-full">
                      Your Plan
                    </span>
                  )}
                  {/* Contextual label when trial expired */}
                  {isTrialExpired && !isCurrentTier && (
                    <span className="text-xs text-gray-400 font-medium">
                      {tier.key === 'essentials' ? 'Basic Plan' : tier.key === 'full_suite' ? 'Everything Included' : ''}
                    </span>
                  )}
                </div>

                {billing === 'monthly' || !annualEnabled ? (
                  <p className="text-3xl font-bold text-navy">
                    ${tier.monthlyPrice.toFixed(2)}
                    <span className="text-base font-normal text-gray-400">/mo</span>
                  </p>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-navy">
                      ${tier.annualPrice.toFixed(2)}
                      <span className="text-base font-normal text-gray-400">/yr</span>
                    </p>
                    <p className="text-xs text-success font-semibold mt-0.5">
                      ${tier.annualMonthly.toFixed(2)}/mo — save ${tier.annualSavings.toFixed(2)}
                    </p>
                  </>
                )}
              </div>

              {/* Feature checklist */}
              <div className="px-6 py-5 flex-1 space-y-2">
                {tier.features.map((feature, i) => {
                  // null is a divider between inherited and new features
                  if (feature === null) {
                    return <div key={i} className="border-t border-gray-100 my-3" />
                  }
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-amber font-bold text-sm shrink-0 mt-0.5">✓</span>
                      <span className="text-gray-600 text-sm leading-snug">{feature}</span>
                    </div>
                  )
                })}
              </div>

              {/* CTA button */}
              <div className="px-6 pb-6">
                {renderButton(tier)}
              </div>
            </div>

            {/* Retention warning below Essentials card — only shown when trial has expired */}
            {isTrialExpired && tier.key === 'essentials' && (
              <div className="bg-red-50 border border-danger rounded-lg px-4 py-3 text-xs text-danger leading-relaxed">
                <p className="font-semibold mb-1">Heads up before choosing Essentials:</p>
                <p>You will lose access to the Recipe Builder, Brew Day Scheduler, Fermentation Tracker, Packaging, Distribution, and Taproom Profitability tools you used during your trial.</p>
              </div>
            )}
            </div>
          )
        })}
      </div>

      <p className="text-center text-gray-400 text-xs mt-8">
        Secured by Stripe. No credit card required for trial. Cancel anytime. Your data is never deleted.
      </p>
    </div>
  )
}
