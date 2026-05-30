/**
 * AccountPage — subscription management, team invites, and brewery profile editing.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'

// ─── Shared option lists (mirror OnboardingPage) ─────────────────────────────

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

const PRODUCTION_LICENSE_OPTIONS = [
  { value: 'nano', label: 'Nano Brewery License', hint: 'Typically under 500 barrels annually' },
  { value: 'microbrewery', label: 'Microbrewery License', hint: 'Typically under 15,000–60,000 barrels depending on state' },
  { value: 'manufacturer', label: 'Brewery / Manufacturer License', hint: 'Full production, no volume cap' },
  { value: 'brewpub', label: 'Brew Pub License', hint: 'Production with on-site food service requirement' },
  { value: 'other', label: 'Other / Not Sure', hint: '' },
]

const ON_PREMISE_OPTIONS = [
  { value: 'taproom', label: 'Taproom License' },
  { value: 'brewpub_restaurant', label: 'Brew Pub / Restaurant License' },
  { value: 'outdoor_seating', label: 'Outdoor Seating / Patio Endorsement' },
  { value: 'none', label: 'None of these' },
]

const OFF_PREMISE_OPTIONS = [
  { value: 'retailer_togo', label: 'Brewery Retailer / To-Go Sales License' },
  { value: 'farmers_market', label: 'Farmers Market Permit' },
  { value: 'none', label: 'None of these' },
]

const DISTRIBUTION_OPTIONS = [
  { value: 'self_distribute_license', label: 'Self-distribute under my brewery license (no separate distribution license)' },
  { value: 'separate_distribution', label: 'Hold a separate Self-Distribution or Wholesaler License' },
  { value: 'third_party', label: 'Use a third party licensed distributor' },
  { value: 'no_distribution', label: 'We do not currently distribute outside our taproom' },
]

const PRODUCTION_VOLUMES = [
  { value: 'under_500', label: 'Under 500 barrels per year' },
  { value: '500_1000', label: '500–1,000 barrels per year' },
  { value: '1000_5000', label: '1,000–5,000 barrels per year' },
  { value: 'over_5000', label: 'Over 5,000 barrels per year' },
]

const STAFF_COUNTS = [
  { value: '1_3', label: '1–3 staff members' },
  { value: '4_10', label: '4–10 staff members' },
  { value: '11_25', label: '11–25 staff members' },
  { value: '25_plus', label: '25+ staff members' },
]

// Maps subscription_tier values to human-readable plan names
const TIER_NAMES = { essentials: 'Essentials', operations: 'Operations', full_suite: 'Full Suite' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionDivider() {
  return <hr className="border-gray-100" />
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AccountPage() {
  const { user, profile, brewery, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // ── Subscription / billing state ──
  const [portalLoading, setPortalLoading] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  // Shows the data-retention confirmation step after the user clicks "Cancel Subscription"
  const [cancelConfirmed, setCancelConfirmed] = useState(false)

  // ── Team invite state ──
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  // ── Notification preferences state ──
  const [alertsEnabled, setAlertsEnabled]   = useState(true)
  const [alertsLoading, setAlertsLoading]   = useState(false)
  const [alertsSaved,   setAlertsSaved]     = useState(false)

  // ── Brewery profile form state ──
  const [profileForm, setProfileForm] = useState({
    name: '',
    state: '',
    production_license_type: '',
    on_premise_licenses: [],
    off_premise_licenses: [],
    distribution_type: [],
    production_volume: '',
    staff_count: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Load the user's current compliance alert preference from the database
  useEffect(() => {
    if (!user) return
    supabase
      .from('users')
      .select('compliance_alerts_enabled')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        // If the column is null (pre-migration row) treat it as enabled (default)
        if (data) setAlertsEnabled(data.compliance_alerts_enabled ?? true)
      })
  }, [user])

  // Saves the toggled compliance alert preference to the users table
  async function handleToggleAlerts() {
    const newValue = !alertsEnabled
    setAlertsLoading(true)
    setAlertsSaved(false)
    try {
      const { error } = await supabase
        .from('users')
        .update({ compliance_alerts_enabled: newValue })
        .eq('id', user.id)
      if (error) throw error
      setAlertsEnabled(newValue)
      setAlertsSaved(true)
      setTimeout(() => setAlertsSaved(false), 3000)
    } catch (err) {
      console.error('Failed to update alert preference:', err)
    } finally {
      setAlertsLoading(false)
    }
  }

  // Populate the form from the brewery row when context loads
  useEffect(() => {
    if (brewery) {
      setProfileForm({
        name: brewery.name ?? '',
        state: brewery.state ?? '',
        production_license_type: brewery.production_license_type ?? '',
        on_premise_licenses: brewery.on_premise_licenses ?? [],
        off_premise_licenses: brewery.off_premise_licenses ?? [],
        distribution_type: brewery.distribution_type ?? [],
        production_volume: brewery.production_volume ?? '',
        staff_count: brewery.staff_count ?? '',
      })
    }
  }, [brewery])

  // Checkbox toggle with mutual exclusion for a "none" value
  function toggleCheckbox(field, value, noneValue = 'none') {
    setProfileSuccess(false)
    setProfileForm((prev) => {
      const current = prev[field]
      if (value === noneValue) {
        return { ...prev, [field]: current.includes(noneValue) ? [] : [noneValue] }
      }
      const withoutNone = current.filter((v) => v !== noneValue)
      return {
        ...prev,
        [field]: withoutNone.includes(value)
          ? withoutNone.filter((v) => v !== value)
          : [...withoutNone, value],
      }
    })
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileSuccess(false)
    setProfileError('')

    try {
      const { error } = await supabase
        .from('breweries')
        .update({
          name: profileForm.name,
          state: profileForm.state,
          production_license_type: profileForm.production_license_type || null,
          on_premise_licenses: profileForm.on_premise_licenses,
          off_premise_licenses: profileForm.off_premise_licenses,
          distribution_type: profileForm.distribution_type,
          production_volume: profileForm.production_volume || null,
          staff_count: profileForm.staff_count || null,
        })
        .eq('id', brewery?.id)

      if (error) throw error

      await refreshProfile()
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 5000)
    } catch (err) {
      setProfileError(err.message || 'Failed to save. Please try again.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: {
          customerId: profile?.stripe_customer_id,
          returnUrl: `${window.location.origin}/account`,
        },
      })
      if (error) throw error
      window.location.href = data.url
    } catch {
      alert('Could not open billing portal. Please try again.')
      setPortalLoading(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviteLoading(true)
    setInviteMessage('')

    try {
      const { error } = await supabase.functions.invoke('invite-staff-member', {
        body: { email: inviteEmail, breweryId: brewery?.id, inviterName: user?.email },
      })
      if (error) throw error
      setInviteMessage(`✅ Invite sent to ${inviteEmail}. They'll receive an email with login instructions.`)
      setInviteEmail('')
    } catch {
      setInviteMessage('❌ Failed to send invite. Please try again.')
    } finally {
      setInviteLoading(false)
    }
  }

  // ── Data export state ──
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  // ── Delete account state ──
  const [deleteModalOpen, setDeleteModalOpen]     = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading]         = useState(false)
  const [deleteError, setDeleteError]             = useState('')
  // useModalDraft is required by convention even though delete has no draft state to persist
  const { draftRestored, dismissDraftBanner } = useModalDraft('delete-account-confirm')

  // Fetches all brewery data from every operational table and triggers a JSON download
  async function exportBreweryData() {
    setExportLoading(true)
    setExportMessage('')
    try {
      const breweryId = brewery?.id
      if (!breweryId) throw new Error('No brewery found')

      const tableNames = [
        'recipes', 'recipe_ingredients', 'ingredients', 'brew_days',
        'fermentations', 'gravity_readings', 'packaging_runs',
        'distribution_records', 'distribution_accounts', 'taproom_events',
        'wholesale_accounts', 'training_programs', 'staff_training_records',
        'taproom_metrics', 'tracked_bills', 'excise_tax_periods',
      ]

      // Fetch all tables in parallel; tables that error return an empty array
      const results = await Promise.all(
        tableNames.map(async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('brewery_id', breweryId)
          if (error) console.warn(`Export: could not fetch ${table}:`, error.message)
          return [table, data ?? []]
        })
      )

      const exportObj = {
        metadata: {
          brewery_name: brewery?.name ?? 'Unknown Brewery',
          export_date: new Date().toISOString(),
          app_version: 'The Craft Beer Brief Essentials',
        },
        ...Object.fromEntries(results),
      }

      // Build file name: craftbeerbrief-export-[brewery-name]-[date].json
      const slug = (brewery?.name ?? 'brewery').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      const date = new Date().toISOString().slice(0, 10)
      const fileName = `craftbeerbrief-export-${slug}-${date}.json`

      // Trigger browser download
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportMessage('Export complete — check your downloads.')
    } catch (err) {
      setExportMessage(`Export failed: ${err.message}`)
    } finally {
      setExportLoading(false)
    }
  }

  // Calls the delete-account Edge Function then signs out and redirects to login
  async function handleDeleteAccount() {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.message ?? data.error)
      await supabase.auth.signOut()
      window.location.href = '/login?deleted=1'
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account. Please try again.')
      setDeleteLoading(false)
    }
  }

  const statusColors = {
    active: 'bg-green-100 text-success',
    trialing: 'bg-amber/10 text-amber',
    cancelled: 'bg-red-100 text-danger',
    past_due: 'bg-orange-100 text-warning',
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-bold text-navy">⚙️ Account Settings</h2>

      {/* ── Subscription ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-navy mb-4">Subscription</h3>

        {/* Current plan name — shown prominently */}
        <div className="mb-4 p-3 bg-amber/5 rounded-lg border border-amber/20 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Current Plan</p>
            <p className="text-xl font-bold text-navy mt-0.5">
              {TIER_NAMES[profile?.subscription_tier] ?? 'Essentials'}
            </p>
          </div>
          {/* Upgrade Plan button — hidden for Full Suite subscribers who are already at the top */}
          {profile?.subscription_tier !== 'full_suite' && (
            <button
              onClick={() => navigate('/upgrade')}
              className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Upgrade Plan
            </button>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-600">
              Status:{' '}
              <span className={`font-semibold text-xs px-2 py-0.5 rounded-full ${statusColors[profile?.subscription_status] ?? 'bg-gray-100 text-gray-600'}`}>
                {profile?.subscription_status ?? 'Trial'}
              </span>
            </p>
            {profile?.trial_expires_at && !profile?.subscription_status && (
              <p className="text-xs text-gray-500 mt-1">
                Trial expires: {new Date(profile.trial_expires_at).toLocaleDateString()}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">Logged in as: {user?.email}</p>
          </div>
          <button
            onClick={openBillingPortal}
            disabled={portalLoading || !profile?.stripe_customer_id}
            className="text-sm bg-navy text-white px-4 py-2 rounded-lg hover:bg-navy-light transition-colors disabled:opacity-60"
          >
            {portalLoading ? 'Loading...' : 'Manage Billing'}
          </button>
        </div>
        {!profile?.stripe_customer_id && (
          <p className="text-xs text-gray-400 mt-3">
            Billing management is available after subscribing.
          </p>
        )}
        {profile?.subscription_status === 'active' && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setCancelModalOpen(true)}
              className="text-xs text-danger hover:underline"
            >
              Cancel subscription
            </button>
          </div>
        )}
      </div>

      {/* ── Invite Team Members ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-navy mb-2">Invite Team Members</h3>
        <p className="text-sm text-gray-500 mb-4">
          Staff members log in with their own email and password but share your brewery's data and subscription.
        </p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="staff@yourbrewery.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
          />
          <button
            type="submit"
            disabled={inviteLoading}
            className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {inviteLoading ? 'Sending...' : 'Send Invite'}
          </button>
        </form>
        {inviteMessage && <p className="text-sm mt-3 text-gray-700">{inviteMessage}</p>}
      </div>

      {/* ── Notifications ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-navy">Notifications</h3>
          {alertsSaved && (
            <span className="text-sm text-success font-medium">✓ Saved</span>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 pt-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-navy">Compliance Email Alerts</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Receive email reminders 30 days and 7 days before compliance deadlines,
              license renewals, and staff certification expirations.
            </p>
            <p className="text-xs mt-2 font-medium" style={{ color: alertsEnabled ? '#15803d' : '#6b7280' }}>
              {alertsEnabled
                ? 'Currently enabled — you will receive alerts for upcoming deadlines.'
                : 'Currently disabled — you will not receive compliance reminders.'}
            </p>
          </div>

          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={alertsEnabled}
            disabled={alertsLoading}
            onClick={handleToggleAlerts}
            className={`relative flex-shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber focus:ring-offset-2 disabled:opacity-60 ${
              alertsEnabled ? 'bg-amber' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                alertsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── Data & Privacy ── */}

      {/* Part A: Export Your Data */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-navy mb-1">Export Your Data</h3>
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          Download all your brewery data including recipes, brew days, fermentation records,
          inventory, and distribution history as a JSON file.
        </p>
        <button
          onClick={exportBreweryData}
          disabled={exportLoading}
          className="border border-navy text-navy text-sm font-semibold px-5 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors disabled:opacity-60"
        >
          {exportLoading ? 'Exporting...' : 'Export Data'}
        </button>
        {exportMessage && (
          <p className={`text-sm mt-3 font-medium ${exportMessage.startsWith('Export failed') ? 'text-danger' : 'text-success'}`}>
            {exportMessage}
          </p>
        )}
      </div>

      {/* Part B: Delete Account */}
      <div className="bg-white rounded-xl border-2 border-danger/40 p-5">
        <h3 className="font-semibold text-danger mb-1">Delete Account</h3>
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          Permanently delete your account and all brewery data. This cannot be undone. All recipes,
          brew logs, compliance records, and other data will be permanently removed immediately.
        </p>
        <button
          onClick={() => { setDeleteConfirmText(''); setDeleteError(''); setDeleteModalOpen(true) }}
          className="border border-danger text-danger text-sm font-semibold px-5 py-2 rounded-lg hover:bg-danger hover:text-white transition-colors"
        >
          Delete Account
        </button>
      </div>

      {/* ── Delete Account Modal ── */}
      <ModalShell
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        isDirty={deleteConfirmText.length > 0}
        title="⚠ Permanently Delete Account"
        draftRestored={draftRestored}
        onDismissDraft={dismissDraftBanner}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-danger rounded-lg px-4 py-3 text-sm text-danger leading-relaxed">
            <p className="font-semibold mb-2">This will immediately and permanently delete:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>All recipes and ingredients</li>
              <li>All brew day logs and fermentation records</li>
              <li>All packaging and distribution records</li>
              <li>All compliance data</li>
              <li>Your brewery profile and account</li>
            </ul>
            <p className="mt-3 font-semibold">This action cannot be undone and your data cannot be recovered.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-navy mb-1.5">
              Type <span className="font-mono text-danger">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-danger"
            />
          </div>

          {deleteError && (
            <p className="text-sm text-danger font-medium">{deleteError}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              onClick={() => setDeleteModalOpen(false)}
              className="flex-1 border border-gray-300 text-gray-600 font-semibold py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || deleteLoading}
              className="flex-1 bg-danger hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-40"
            >
              {deleteLoading ? 'Deleting...' : 'Delete Everything'}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Cancel Subscription Modal ── */}
      {cancelModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => { setCancelModalOpen(false); setCancelConfirmed(false) }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {cancelConfirmed ? (
              /* ── Step 2: data-retention success message ── */
              <>
                <div className="text-center">
                  <p className="text-3xl mb-3">✅</p>
                  <h3 className="text-lg font-bold text-navy mb-3">Subscription Cancelled</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Your subscription has been cancelled. Your data is saved for 90 days — resubscribe
                  any time to pick up right where you left off. After 90 days inactive accounts are
                  permanently deleted. You can export your data at any time in Account Settings.
                </p>
                <button
                  onClick={() => { setCancelModalOpen(false); setCancelConfirmed(false) }}
                  className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  Close
                </button>
              </>
            ) : (
              /* ── Step 1: confirmation with data-retention assurance ── */
              <>
                <h3 className="text-lg font-bold text-navy">Are you sure you want to cancel?</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  You will lose the ability to add or edit data at the end of your current billing
                  period. <strong>Your data is saved for 90 days</strong> — resubscribe any time to
                  pick up exactly where you left off. After 90 days inactive accounts are permanently
                  deleted.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    onClick={() => {
                      setCancelConfirmed(true)
                      openBillingPortal()
                    }}
                    className="flex-1 bg-danger hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                  >
                    Cancel Subscription
                  </button>
                  <button
                    onClick={() => setCancelModalOpen(false)}
                    className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                  >
                    Keep My Subscription
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Brewery Profile ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-navy">Brewery Profile</h3>
          {profileSuccess && (
            <span className="text-sm text-success font-medium">✓ Saved successfully</span>
          )}
        </div>

        {profileError && (
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm mb-4">
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSave} className="space-y-5">

          {/* Brewery name + state */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">Brewery Name</label>
              <input
                type="text"
                required
                value={profileForm.name}
                onChange={(e) => {
                  setProfileSuccess(false)
                  setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">State</label>
              <select
                required
                value={profileForm.state}
                onChange={(e) => {
                  setProfileSuccess(false)
                  setProfileForm((prev) => ({ ...prev, state: e.target.value }))
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
              >
                <option value="">Select state...</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <SectionDivider />

          {/* State production license type (radio — one) */}
          <div>
            <p className="text-sm font-semibold text-navy mb-2.5">State Production License Type</p>
            <div className="space-y-2.5">
              {PRODUCTION_LICENSE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="acc_productionLicenseType"
                    value={opt.value}
                    checked={profileForm.production_license_type === opt.value}
                    onChange={() => {
                      setProfileSuccess(false)
                      setProfileForm((prev) => ({ ...prev, production_license_type: opt.value }))
                    }}
                    className="mt-0.5 shrink-0 text-amber focus:ring-amber"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-medium group-hover:text-navy transition-colors">{opt.label}</span>
                    {opt.hint && <span className="block text-xs text-gray-400 mt-0.5">{opt.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <SectionDivider />

          {/* On-premise sales licenses */}
          <div>
            <p className="text-sm font-semibold text-navy mb-1">On-Premise Sales Licenses</p>
            <p className="text-xs text-gray-400 mb-2.5">Select all that apply</p>
            <div className="space-y-2.5">
              {ON_PREMISE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={profileForm.on_premise_licenses.includes(opt.value)}
                    onChange={() => toggleCheckbox('on_premise_licenses', opt.value)}
                    className="rounded border-gray-300 text-amber focus:ring-amber shrink-0"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-navy transition-colors">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <SectionDivider />

          {/* Off-premise sales licenses */}
          <div>
            <p className="text-sm font-semibold text-navy mb-1">Off-Premise Sales Licenses</p>
            <p className="text-xs text-gray-400 mb-2.5">Select all that apply</p>
            <div className="space-y-2.5">
              {OFF_PREMISE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={profileForm.off_premise_licenses.includes(opt.value)}
                    onChange={() => toggleCheckbox('off_premise_licenses', opt.value)}
                    className="rounded border-gray-300 text-amber focus:ring-amber shrink-0"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-navy transition-colors">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <SectionDivider />

          {/* Distribution */}
          <div>
            <p className="text-sm font-semibold text-navy mb-1">Distribution</p>
            <p className="text-xs text-gray-400 mb-2.5">Select all that apply</p>
            <div className="space-y-2.5">
              {DISTRIBUTION_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={profileForm.distribution_type.includes(opt.value)}
                    onChange={() => toggleCheckbox('distribution_type', opt.value, 'no_distribution')}
                    className="rounded border-gray-300 text-amber focus:ring-amber shrink-0"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-navy transition-colors">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <SectionDivider />

          {/* Production volume + staff count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">Annual Production Volume</label>
              <select
                value={profileForm.production_volume}
                onChange={(e) => {
                  setProfileSuccess(false)
                  setProfileForm((prev) => ({ ...prev, production_volume: e.target.value }))
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
              >
                <option value="">Select a range...</option>
                {PRODUCTION_VOLUMES.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy mb-1.5">Staff Count</label>
              <select
                value={profileForm.staff_count}
                onChange={(e) => {
                  setProfileSuccess(false)
                  setProfileForm((prev) => ({ ...prev, staff_count: e.target.value }))
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
              >
                <option value="">Select a range...</option>
                {STAFF_COUNTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={profileSaving}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
