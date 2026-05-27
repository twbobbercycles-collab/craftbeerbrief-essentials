/**
 * SignupPage — new user registration.
 * Collects brewery name, state, email, and password.
 * Sets up the 14-day free trial in Supabase on submit.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'

// List of US states for the state dropdown
const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
]

export default function SignupPage() {
  const navigate = useNavigate()

  // Form field values
  const [breweryName, setBreweryName] = useState('')
  const [state, setState] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!termsAccepted) {
      setError('Please accept the terms to continue.')
      return
    }

    setLoading(true)

    try {
      // Check if this email has already used a free trial — block a second trial
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, trial_started_at')
        .eq('email', email)
        .maybeSingle()

      if (existingUser?.trial_started_at) {
        setError(
          'This email has already used a free trial. Please log in to your existing account or contact support.'
        )
        setLoading(false)
        return
      }

      // Create the Supabase auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Pass brewery info so the database trigger can create the brewery and user rows
          data: { brewery_name: breweryName, state },
        },
      })

      if (authError) throw authError

      // Supabase sends a confirmation email. After sign up succeeds, go to onboarding.
      // If email confirmation is disabled in your Supabase project settings, they're logged in immediately.
      navigate('/onboarding')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-light flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-md p-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-navy">🍺 The Craft Beer Brief</h1>
          <p className="text-amber font-semibold text-sm mt-1">Essentials</p>
          <p className="text-gray-500 text-sm mt-3">
            Start your free 14-day trial — no credit card required.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Brewery name */}
          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              Brewery Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Blue Ridge Brewing Co."
              value={breweryName}
              onChange={(e) => setBreweryName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {/* State */}
          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              State
            </label>
            <select
              required
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
            >
              <option value="">Select your state...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="you@yourbrewery.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {/* Terms of Service */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 shrink-0 rounded border-gray-300 text-amber focus:ring-amber"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                I understand that The Craft Beer Brief Essentials is a tracking and information tool only.
                It does not provide legal or tax advice, file documents on my behalf, or guarantee the
                accuracy of any deadline, rate, or requirement. I agree to verify all compliance obligations
                directly with the relevant government agency. By signing up I agree to the{' '}
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber hover:underline"
                >
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link
                  to="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber hover:underline"
                >
                  Privacy Policy
                </Link>.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating your account...' : 'Start Free Trial'}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-amber font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
