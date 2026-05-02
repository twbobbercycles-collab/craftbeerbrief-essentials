/**
 * ForgotPasswordPage — sends a password reset email via Supabase.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../services/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      // After clicking the link in the email, Supabase redirects here
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-gray-light flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-navy">Reset Your Password</h1>
          <p className="text-gray-500 text-sm mt-2">
            Enter your email and we'll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <p className="text-success font-medium">✅ Reset email sent!</p>
            <p className="text-gray-500 text-sm">
              Check your inbox for a link to reset your password. It may take a minute to arrive.
            </p>
            <Link to="/login" className="text-amber hover:underline text-sm block mt-4">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-navy mb-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="you@yourbrewery.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send Reset Email'}
            </button>

            <p className="text-center text-sm">
              <Link to="/login" className="text-amber hover:underline">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
