/**
 * UpgradePage — shown when a user's free trial has expired.
 * Shows pricing for monthly and annual plans and initiates Stripe checkout.
 * Also shows a resubscribe option for users whose subscription was cancelled.
 */
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'

const MONTHLY_PRICE = import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID
const ANNUAL_PRICE = import.meta.env.VITE_STRIPE_ANNUAL_PRICE_ID

export default function UpgradePage() {
  const { user, profile } = useAuth()
  const [billing, setBilling] = useState('annual') // 'monthly' or 'annual'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Determine if the trial expired or if subscription was cancelled
  const isCancelled = profile?.subscription_status === 'cancelled'
  const isExpired = !isCancelled

  async function handleCheckout() {
    setError('')
    setLoading(true)

    try {
      // Call our Supabase Edge Function to create a Stripe Checkout session
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId: billing === 'monthly' ? MONTHLY_PRICE : ANNUAL_PRICE,
          userId: user.id,
          email: user.email,
          successUrl: `${window.location.origin}/dashboard?checkout=success`,
          cancelUrl: `${window.location.origin}/upgrade`,
        },
      })

      if (fnError) throw fnError

      // Redirect to Stripe's hosted checkout page
      window.location.href = data.url
    } catch (err) {
      setError('Could not start checkout. Please try again or contact support.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-light flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-lg p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-navy">🍺 The Craft Beer Brief Essentials</h1>
          {isCancelled ? (
            <p className="text-gray-600 mt-2">Welcome back! Reactivate your subscription to regain full access.</p>
          ) : (
            <p className="text-warning font-semibold mt-2">Your free trial has ended.</p>
          )}
          <p className="text-gray-500 text-sm mt-1">
            Subscribe to keep access to your compliance calendar, TTB tracker, and grant finder.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              billing === 'monthly' ? 'bg-amber text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              billing === 'annual' ? 'bg-amber text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Annual
          </button>
        </div>

        {/* Pricing card */}
        <div className="border-2 border-amber rounded-xl p-6 mb-6 text-center">
          {billing === 'monthly' ? (
            <>
              <p className="text-3xl font-bold text-navy">$14.99<span className="text-lg font-normal text-gray-500">/mo</span></p>
              <p className="text-gray-500 text-sm mt-1">Billed monthly</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-navy">$149.99<span className="text-lg font-normal text-gray-500">/yr</span></p>
              <p className="text-success font-semibold text-sm mt-1">💰 Save $30 — get two months free</p>
              <p className="text-gray-500 text-xs mt-0.5">That's just $12.50/month</p>
            </>
          )}

          {/* Feature list */}
          <ul className="mt-4 space-y-2 text-left text-sm text-gray-600">
            {[
              'State Compliance Calendar with pre-loaded deadlines',
              'TTB Filing & Excise Tax Tracker',
              'Federal Grant Finder (auto-synced from Grants.gov)',
              'Multi-user access for your whole team',
              'Email notifications for upcoming deadlines',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="text-success mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-60"
        >
          {loading ? 'Redirecting to checkout...' : `Subscribe ${billing === 'monthly' ? '— $14.99/mo' : '— $149.99/yr'}`}
        </button>

        <p className="text-center text-gray-400 text-xs mt-3">
          Secured by Stripe. Cancel anytime.
        </p>
      </div>
    </div>
  )
}
