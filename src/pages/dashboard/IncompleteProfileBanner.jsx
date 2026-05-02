/**
 * IncompleteProfileBanner — shown on the dashboard when production_license_type
 * is not yet set, prompting the user to complete their brewery profile.
 */
import { Link } from 'react-router-dom'

export default function IncompleteProfileBanner({ brewery }) {
  if (!brewery || brewery.production_license_type) return null

  return (
    <Link
      to="/account"
      className="block rounded-lg px-4 py-3 bg-amber/10 border border-amber hover:bg-amber/20 transition-colors"
    >
      <p className="text-sm font-semibold text-amber-dark">
        ⚠️ Your brewery profile is incomplete.{' '}
        <span className="underline">
          Complete your profile to get personalized compliance deadlines and grant matches →
        </span>
      </p>
    </Link>
  )
}
