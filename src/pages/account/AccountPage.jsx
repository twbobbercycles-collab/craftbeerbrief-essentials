/**
 * AccountPage — subscription management, team invites, and brewery profile editing.
 */
import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionDivider() {
  return <hr className="border-gray-100" />
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AccountPage() {
  const { user, profile, brewery, refreshProfile } = useAuth()

  // ── Subscription / billing state ──
  const [portalLoading, setPortalLoading] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)

  // ── Team invite state ──
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

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

      {/* ── Cancel Subscription Modal ── */}
      {cancelModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setCancelModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-navy">Are you sure you want to cancel?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              You will lose access to all compliance tracking, grant finder, and TTB tracking tools
              at the end of your current billing period. Your data will be retained for 30 days
              after cancellation in case you choose to resubscribe.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                onClick={() => {
                  setCancelModalOpen(false)
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
