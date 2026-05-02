/**
 * ResetPasswordPage — the page the user lands on after clicking the email reset link.
 * Supabase fires a PASSWORD_RECOVERY event when it processes the recovery token from
 * the URL hash. We wait for that event before showing the form, so we can tell the
 * difference between a valid reset link and someone who typed this URL directly.
 */
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../services/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // true once we confirm a valid recovery token arrived from the email link
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  // true while we're waiting to see if the recovery event will fire
  const [checkingToken, setCheckingToken] = useState(true)

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when it reads the #access_token from the URL.
    // Register this listener first so we don't miss the event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true)
        setCheckingToken(false)
      }
    })

    // Fallback: the Supabase client processes the URL hash the moment it initializes,
    // so the PASSWORD_RECOVERY event might have already fired before this component
    // mounted. Check the URL hash directly as a backup.
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    if (hashParams.get('type') === 'recovery') {
      setIsRecoveryMode(true)
      setCheckingToken(false)
    }

    // If neither check found a recovery token after a short wait, stop the spinner
    // and show the "link expired" message instead.
    const timeout = setTimeout(() => setCheckingToken(false), 1500)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  // Handles submitting the new password
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    // updateUser changes the password using the recovery session Supabase established
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setLoading(false)
      setError(updateError.message)
      return
    }

    // Sign out the recovery session so the user starts fresh at the login page
    await supabase.auth.signOut()

    // Go to login with a flag so we can show a success message there
    navigate('/login?passwordReset=true')
  }

  // While waiting to see if a recovery token is present, show a brief loading message
  if (checkingToken) {
    return (
      <div className="min-h-screen bg-gray-light flex items-center justify-center px-4">
        <p className="text-gray-500 text-sm">Checking reset link...</p>
      </div>
    )
  }

  // If no recovery token was found, this page was opened without a valid reset link
  if (!isRecoveryMode) {
    return (
      <div className="min-h-screen bg-gray-light flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-bold text-navy mb-3">Link Expired or Invalid</h1>
          <p className="text-gray-500 text-sm mb-5">
            This password reset link has expired or is no longer valid. Please request a new one.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 px-6 rounded-lg text-sm transition-colors"
          >
            Request New Reset Link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-light flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-navy">Set New Password</h1>
          <p className="text-gray-500 text-sm mt-2">Choose a new password for your account.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy mb-1">New Password</label>
            <input
              type="password"
              required
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy mb-1">Confirm Password</label>
            <input
              type="password"
              required
              placeholder="Repeat your new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save New Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
