/**
 * OnboardingPage — shown after first signup (Step 2 of 2).
 * Collects: license structure, production volume, and staff count.
 * Saves structured license data to the breweries table via Supabase.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'

// ─── Data ────────────────────────────────────────────────────────────────────

const PRODUCTION_LICENSE_OPTIONS = [
  {
    value: 'nano',
    label: 'Nano Brewery License',
    hint: 'Typically under 500 barrels annually',
  },
  {
    value: 'microbrewery',
    label: 'Microbrewery License',
    hint: 'Typically under 15,000–60,000 barrels depending on state',
  },
  {
    value: 'manufacturer',
    label: 'Brewery / Manufacturer License',
    hint: 'Full production, no volume cap',
  },
  {
    value: 'brewpub',
    label: 'Brew Pub License',
    hint: 'Production with on-site food service requirement',
  },
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
  {
    value: 'self_distribute_license',
    label: 'Self-distribute under my brewery license (no separate distribution license)',
  },
  {
    value: 'separate_distribution',
    label: 'Hold a separate Self-Distribution or Wholesaler License',
  },
  { value: 'third_party', label: 'Use a third party licensed distributor' },
  {
    value: 'no_distribution',
    label: 'We do not currently distribute outside our taproom',
  },
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

// ─── Sub-components ──────────────────────────────────────────────────────────

// Info icon with a tooltip explaining why each section is collected
function InfoTooltip() {
  return (
    <span className="relative group inline-flex items-center ml-1.5 align-middle">
      <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center cursor-help font-bold select-none leading-none">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-navy text-white text-xs rounded-lg px-3 py-2 invisible group-hover:visible z-20 text-center shadow-lg">
        This helps us show you the most relevant compliance deadlines for your specific license types
        {/* Tooltip caret */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy" />
      </span>
    </span>
  )
}

function SectionDivider() {
  return <hr className="border-gray-200" />
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, profile, brewery, refreshProfile } = useAuth()

  const [productionLicenseType, setProductionLicenseType] = useState('')
  const [onPremiseLicenses, setOnPremiseLicenses] = useState([])
  const [offPremiseLicenses, setOffPremiseLicenses] = useState([])
  const [distributionType, setDistributionType] = useState([])
  const [productionVolume, setProductionVolume] = useState('')
  const [staffCount, setStaffCount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Checkbox toggle with mutual exclusion for a designated "none" value.
  // Selecting the noneValue clears all others; selecting any other clears noneValue.
  function toggleCheckbox(currentValues, setValues, value, noneValue = 'none') {
    if (value === noneValue) {
      setValues(currentValues.includes(noneValue) ? [] : [noneValue])
    } else {
      const withoutNone = currentValues.filter((v) => v !== noneValue)
      setValues(
        withoutNone.includes(value)
          ? withoutNone.filter((v) => v !== value)
          : [...withoutNone, value]
      )
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!productionLicenseType) {
      setError('Please select your state production license type.')
      return
    }
    if (onPremiseLicenses.length === 0) {
      setError('Please select at least one on-premise option (or "None of these").')
      return
    }
    if (offPremiseLicenses.length === 0) {
      setError('Please select at least one off-premise option (or "None of these").')
      return
    }
    if (distributionType.length === 0) {
      setError('Please select at least one distribution option.')
      return
    }

    setLoading(true)

    try {
      const { error: breweryError } = await supabase
        .from('breweries')
        .update({
          brewers_notice: true,
          production_license_type: productionLicenseType,
          on_premise_licenses: onPremiseLicenses,
          off_premise_licenses: offPremiseLicenses,
          distribution_type: distributionType,
          production_volume: productionVolume,
          staff_count: staffCount,
        })
        .eq('id', brewery?.id)

      if (breweryError) throw breweryError

      // Fire welcome email — intentionally NOT awaited.
      // If this call fails for any reason the user is never blocked or shown an error.
      fetch('https://orjekijkixswvnzenilb.supabase.co/functions/v1/send-welcome-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          email:            user?.email ?? '',
          brewery_name:     brewery?.name ?? '',
          trial_expires_at: profile?.trial_expires_at ?? '',
        }),
      }).catch(() => {}) // Swallow silently — email must never block the user

      await refreshProfile()
      // Signal AppLayout to start the onboarding tour on the next render
      console.log('[OnboardingPage] About to set tour flag')
      localStorage.setItem('show_onboarding_tour', 'true')
      console.log('[OnboardingPage] Tour flag set, value:', localStorage.getItem('show_onboarding_tour'))
      console.log('[OnboardingPage] Navigating to dashboard')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">

      {/* Step progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
          <span>Brewery Setup</span>
          <span>Step 2 of 2</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full">
          <div className="h-1.5 bg-amber rounded-full w-full" />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          <span className="text-success font-medium">✓ Account created</span>
          <span className="text-amber font-medium">Brewery setup</span>
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-navy">One more step! 🍺</h2>
        <p className="text-gray-500 mt-2 text-sm">
          Tell us about your brewery's license structure so we can load the right compliance data for you.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">

        {/* ── Section 1: Federal License Confirmation ── */}
        <div>
          <p className="text-sm font-bold text-navy mb-2">Federal Registration Confirmation</p>
          <div className="bg-amber/10 border border-amber/30 rounded-lg px-4 py-3 text-sm text-gray-700 leading-relaxed">
            By continuing you confirm that your brewery holds an active <strong>Brewer's Notice</strong> issued
            by the TTB (Alcohol and Tobacco Tax and Trade Bureau). This confirmation is collected for
            documentation purposes only and is not verified by this app or submitted to any government agency.
          </div>
        </div>

        <SectionDivider />

        {/* ── Section 2: State Production License (radio — pick one) ── */}
        <div>
          <p className="text-sm font-bold text-navy mb-3 flex items-center flex-wrap gap-y-1">
            What is your state production license type?
            <InfoTooltip />
          </p>
          <div className="space-y-3">
            {PRODUCTION_LICENSE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="productionLicenseType"
                  value={opt.value}
                  checked={productionLicenseType === opt.value}
                  onChange={() => setProductionLicenseType(opt.value)}
                  className="mt-0.5 shrink-0 text-amber focus:ring-amber"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium group-hover:text-navy transition-colors">
                    {opt.label}
                  </span>
                  {opt.hint && (
                    <span className="block text-xs text-gray-400 mt-0.5">{opt.hint}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>

        <SectionDivider />

        {/* ── Section 3: On-Premise Sales Licenses (checkboxes) ── */}
        <div>
          <p className="text-sm font-bold text-navy mb-1 flex items-center flex-wrap gap-y-1">
            Which on-premise sales licenses do you hold?
            <InfoTooltip />
          </p>
          <p className="text-xs text-gray-400 mb-3">Select all that apply</p>
          <div className="space-y-3">
            {ON_PREMISE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={onPremiseLicenses.includes(opt.value)}
                  onChange={() =>
                    toggleCheckbox(onPremiseLicenses, setOnPremiseLicenses, opt.value)
                  }
                  className="rounded border-gray-300 text-amber focus:ring-amber shrink-0"
                />
                <span className="text-sm text-gray-700 group-hover:text-navy transition-colors">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <SectionDivider />

        {/* ── Section 4: Off-Premise Sales Licenses (checkboxes) ── */}
        <div>
          <p className="text-sm font-bold text-navy mb-1 flex items-center flex-wrap gap-y-1">
            Which off-premise sales licenses do you hold?
            <InfoTooltip />
          </p>
          <p className="text-xs text-gray-400 mb-3">Select all that apply</p>
          <div className="space-y-3">
            {OFF_PREMISE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={offPremiseLicenses.includes(opt.value)}
                  onChange={() =>
                    toggleCheckbox(offPremiseLicenses, setOffPremiseLicenses, opt.value)
                  }
                  className="rounded border-gray-300 text-amber focus:ring-amber shrink-0"
                />
                <span className="text-sm text-gray-700 group-hover:text-navy transition-colors">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <SectionDivider />

        {/* ── Section 5: Distribution (checkboxes) ── */}
        <div>
          <p className="text-sm font-bold text-navy mb-1 flex items-center flex-wrap gap-y-1">
            How do you handle distribution?
            <InfoTooltip />
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Many states include self-distribution rights within your brewery license. Select what applies to your situation.
          </p>
          <div className="space-y-3">
            {DISTRIBUTION_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={distributionType.includes(opt.value)}
                  onChange={() =>
                    toggleCheckbox(
                      distributionType,
                      setDistributionType,
                      opt.value,
                      'no_distribution'
                    )
                  }
                  className="rounded border-gray-300 text-amber focus:ring-amber shrink-0"
                />
                <span className="text-sm text-gray-700 group-hover:text-navy transition-colors">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <SectionDivider />

        {/* ── Production Volume ── */}
        <div>
          <label className="block text-sm font-bold text-navy mb-2">
            What is your annual production volume?
          </label>
          <select
            required
            value={productionVolume}
            onChange={(e) => setProductionVolume(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
          >
            <option value="">Select a range...</option>
            {PRODUCTION_VOLUMES.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* ── Staff Count ── */}
        <div>
          <label className="block text-sm font-bold text-navy mb-2">
            How many staff members does your brewery have?
          </label>
          <select
            required
            value={staffCount}
            onChange={(e) => setStaffCount(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white"
          >
            <option value="">Select a range...</option>
            {STAFF_COUNTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
        >
          {loading ? 'Saving...' : 'Finish Setup → Go to Dashboard'}
        </button>
      </form>
    </div>
  )
}
