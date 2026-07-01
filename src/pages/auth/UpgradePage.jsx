/**
 * UpgradePage — displays all three subscription tiers and initiates Stripe checkout.
 * Accessible from trial expiry, TierGate locked previews, and Account Settings.
 * Renders a sticky-header comparison table with alternating row stripes and
 * green check / gray dash indicators for each feature × tier combination.
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
    annual:  import.meta.env.VITE_STRIPE_FULL_SUITE_YEARLY_PRICE_ID,
  },
}

// Annual billing is enabled only when at least one annual price ID is configured.
const annualEnabled = !!(
  PRICE_IDS.operations.annual || PRICE_IDS.full_suite.annual
)

// Numeric rank so we can compare tiers and hide downgrade buttons
const TIER_RANK = { essentials: 0, operations: 1, full_suite: 2 }

// Feature lists — kept separate so the comparison table can build inclusion patterns
const ESSENTIALS_LIST = [
  'State Compliance Calendar with pre-loaded deadlines',
  'TTB Filing & Excise Tax Tracker',
  'Grant & Funding Finder (90+ curated programs)',
  'License Document Storage',
  'Staff Certification Tracker',
  'Staff Training & Development Tracker',
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
  'Taproom Revenue Benchmarking Dashboard',
  'Regulation, Policy & Advocacy Playbook (PDF)',
]

const TIERS = [
  {
    key: 'essentials',
    name: 'Essentials',
    monthlyPrice: 9.99,
    annualPrice: 99.99,
    annualMonthly: 8.33,
    annualSavings: 19.89,
  },
  {
    key: 'operations',
    name: 'Operations',
    monthlyPrice: 14.99,
    annualPrice: 149.99,
    annualMonthly: 12.50,
    annualSavings: 29.89,
    popular: true,
  },
  {
    key: 'full_suite',
    name: 'Full Suite',
    monthlyPrice: 19.99,
    annualPrice: 199.99,
    annualMonthly: 16.67,
    annualSavings: 39.89,
  },
]

// ── Check / dash cell used in every feature row ───────────────────────────────
function CheckCell({ included }) {
  return (
    <div className="flex items-center justify-center border-l border-gray-200 py-3 px-2">
      {included ? (
        <span className="inline-flex items-center justify-center w-6 h-6 bg-green-500 rounded-full shrink-0">
          <span className="text-white text-xs font-bold leading-none">✓</span>
        </span>
      ) : (
        <span className="text-gray-300 text-base leading-none select-none">—</span>
      )}
    </div>
  )
}

// ── Section header row spanning the full table width ──────────────────────────
function SectionHeader({ title, className = 'bg-gray-100 text-gray-500' }) {
  return (
    <div className={`px-6 py-2 border-b border-gray-200 ${className}`}>
      <span className="text-sm font-bold uppercase tracking-wider">{title}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UpgradePage() {
  const { user, profile } = useAuth()
  const [billing, setBilling] = useState('monthly')
  const [loading, setLoading] = useState('')   // set to a tierKey while that checkout is loading
  const [error, setError]     = useState('')

  const currentTier        = profile?.subscription_tier ?? 'essentials'
  const subscriptionStatus = profile?.subscription_status
  const isActiveSub        = subscriptionStatus === 'active'
  const isCancelled        = subscriptionStatus === 'cancelled'

  const isTrialExpired = !isActiveSub
    && !!profile?.trial_expires_at
    && new Date(profile.trial_expires_at) <= new Date()

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
          userId:     user.id,
          email:      user.email,
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

  function renderButton(tier) {
    const tierRank    = TIER_RANK[tier.key] ?? 0
    const userRank    = TIER_RANK[currentTier] ?? 0
    const isCurrentTier = tier.key === currentTier && isActiveSub

    if (isCurrentTier) {
      return (
        <button disabled className="w-full py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-400 cursor-default">
          Current Plan
        </button>
      )
    }

    if (isActiveSub && tierRank < userRank) {
      return (
        <p className="text-xs text-center text-gray-400 py-2 leading-snug">
          Contact us to switch to a lower tier
        </p>
      )
    }

    let label
    if (tier.key === 'essentials') {
      label = isCancelled ? 'Resubscribe' : 'Get Started'
    } else if (isActiveSub) {
      label = `Upgrade to ${tier.name}`
    } else {
      label = `Start with ${tier.name}`
    }

    const isLoading = loading === tier.key

    const buttonColor = {
      essentials: 'bg-[#1A2744] hover:bg-[#243562] text-white',
      operations: 'bg-[#C8871A] hover:bg-[#A06E15] text-white',
      full_suite:  'bg-[#0D9488] hover:bg-[#0A7A70] text-white',
    }[tier.key] ?? 'bg-[#1A2744] hover:bg-[#243562] text-white'

    return (
      <button
        onClick={() => handleCheckout(tier.key)}
        disabled={!!loading}
        className={`w-full font-semibold py-2 rounded-lg text-xs transition-colors disabled:opacity-60 ${buttonColor}`}
      >
        {isLoading ? 'Redirecting…' : label}
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
        </button>
      </div>

      {/* Global error */}
      {error && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Trial-expired retention warning */}
      {isTrialExpired && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="bg-red-50 border border-danger rounded-lg px-4 py-3 text-xs text-danger leading-relaxed">
            <p className="font-semibold mb-1">Heads up before choosing Essentials:</p>
            <p>You will lose access to the Recipe Builder, Brew Day Scheduler, Fermentation Tracker, Packaging, Distribution, and Taproom Profitability tools you used during your trial.</p>
          </div>
        </div>
      )}

      {/* ── Comparison table ─────────────────────────────────────────────────── */}
      {/* Note: no overflow-x-auto here — any overflow value breaks position:sticky on children */}
      <div className="max-w-4xl mx-auto rounded-xl shadow-sm border border-gray-200">
        <div className="min-w-[580px]">

          {/* Sticky header — tier names, prices, CTA buttons */}
          <div className="sticky top-0 z-20 grid grid-cols-[1fr_160px_160px_160px] bg-white border-b-2 border-gray-200 shadow-sm">

            {/* Feature column label */}
            <div className="px-6 py-6 flex items-end">
              <span className="text-xl font-extrabold text-navy">Features</span>
            </div>

            {TIERS.map((tier) => {
              const isCurrentTier = tier.key === currentTier && isActiveSub
              const isTrialPlan   = isTrialExpired && tier.key === 'operations'
              const isHighlighted = tier.popular || isTrialPlan || isCurrentTier

              // Each tier gets a distinct color so the columns are immediately distinguishable
              const tierColor =
                tier.key === 'operations' ? 'text-amber'
                : tier.key === 'full_suite' ? 'text-navy'
                : 'text-gray-800'

              return (
                <div
                  key={tier.key}
                  className={`px-3 py-6 text-center border-l border-gray-200 ${isHighlighted ? 'bg-amber/5' : ''}`}
                >
                  {/* Tier name */}
                  <div className={`text-xl font-extrabold ${tierColor}`}>{tier.name}</div>

                  {/* Status badges */}
                  {isCurrentTier && (
                    <span className="inline-block text-xs text-amber font-semibold bg-amber/10 px-2 py-0.5 rounded-full mt-1">
                      Your Plan
                    </span>
                  )}
                  {isTrialPlan && !isCurrentTier && (
                    <span className="inline-block text-xs text-amber font-semibold bg-amber/10 px-2 py-0.5 rounded-full mt-1">
                      Trial Plan
                    </span>
                  )}
                  {tier.popular && !isTrialExpired && !isCurrentTier && (
                    <span className="inline-block text-xs text-amber font-semibold bg-amber/10 px-2 py-0.5 rounded-full mt-1">
                      Most Popular
                    </span>
                  )}

                  {/* Price */}
                  <div className="mt-2">
                    {billing === 'monthly' || !annualEnabled ? (
                      <div>
                        <span className="text-xl font-bold text-navy">${tier.monthlyPrice.toFixed(2)}</span>
                        <span className="text-xs text-gray-400">/mo</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xl font-bold text-navy">${tier.annualPrice.toFixed(2)}</span>
                        <span className="text-xs text-gray-400">/yr</span>
                        <div className="text-xs text-green-600 font-semibold mt-0.5">
                          Save ${tier.annualSavings.toFixed(2)} vs monthly
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="mt-3">{renderButton(tier)}</div>
                </div>
              )
            })}
          </div>

          {/* ── Essentials features ── */}
          <SectionHeader title="Essentials" className="bg-navy text-white" />
          {ESSENTIALS_LIST.map((feat, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_160px_160px_160px] items-center border-b border-gray-200 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              <div className="px-6 py-3 text-sm text-gray-700 leading-snug">{feat}</div>
              <CheckCell included />
              <CheckCell included />
              <CheckCell included />
            </div>
          ))}

          {/* ── Operations add-ons ── */}
          <SectionHeader title="Operations Add-ons" className="bg-amber text-white" />
          {OPERATIONS_ONLY.map((feat, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_160px_160px_160px] items-center border-b border-gray-200 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              <div className="px-6 py-3 text-sm text-gray-700 leading-snug">{feat}</div>
              <CheckCell />
              <CheckCell included />
              <CheckCell included />
            </div>
          ))}

          {/* ── Full Suite add-ons ── */}
          <SectionHeader title="Full Suite Add-ons" className="bg-[#0D9488] text-white" />
          {FULL_SUITE_ONLY.map((feat, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_160px_160px_160px] items-center ${i < FULL_SUITE_ONLY.length - 1 ? 'border-b border-gray-200' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              <div className="px-6 py-3 text-sm text-gray-700 leading-snug">{feat}</div>
              <CheckCell />
              <CheckCell />
              <CheckCell included />
            </div>
          ))}

        </div>
      </div>

      <p className="text-center text-gray-400 text-xs mt-8 max-w-xl mx-auto leading-relaxed">
        Secured by Stripe. No credit card required for trial. Cancel anytime. Your data is saved for 90 days so you can reactivate and pick up right where you left off. After 90 days inactive accounts are permanently deleted. You can export or delete your data at any time in Account Settings.
      </p>
    </div>
  )
}
