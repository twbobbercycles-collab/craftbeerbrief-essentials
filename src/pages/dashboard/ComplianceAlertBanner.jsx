/**
 * ComplianceAlertBanner — unified dashboard alert for documents, staff
 * certifications, insurance policies, and local permits expiring within 60 days.
 * Runs four queries in parallel. Shows a single red (expired) or amber
 * (expiring soon) banner. Message covers all combinations naturally.
 * Returns null until all queries complete to prevent a flash of content.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ComplianceAlertBanner() {
  const { brewery } = useAuth()

  // Separate expired vs. expiring-soon counts for each source
  const [expiredDocs,         setExpiredDocs]         = useState(0)
  const [expiringSoonDocs,    setExpiringSoonDocs]    = useState(0)
  const [expiredCerts,        setExpiredCerts]        = useState(0)
  const [expiringSoonCerts,   setExpiringSoonCerts]   = useState(0)
  const [expiredIns,          setExpiredIns]          = useState(0)
  const [expiringSoonIns,     setExpiringSoonIns]     = useState(0)
  const [expiredPermits,      setExpiredPermits]      = useState(0)
  const [expiringSoonPermits, setExpiringSoonPermits] = useState(0)

  // Prevents a flash of the banner before all queries resolve
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!brewery?.id) return
    checkExpirations()
  }, [brewery?.id])

  // Run all four expiration queries in parallel, then tally expired vs. expiring-soon for each
  async function checkExpirations() {
    const today    = new Date().toISOString().split('T')[0]
    const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [docsResult, certsResult, insResult, permitsResult] = await Promise.all([
      // Documents with an expiration date within the next 60 days
      supabase
        .from('brewery_documents')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),

      // Staff certifications with an expiration date within the next 60 days
      supabase
        .from('staff_certifications')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),

      // Insurance policies with an expiration date within the next 60 days
      supabase
        .from('insurance_policies')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),

      // Active local permits with an expiration date within the next 60 days
      supabase
        .from('local_permits')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),
    ])

    if (docsResult.data) {
      setExpiredDocs(docsResult.data.filter((d) => d.expiration_date < today).length)
      setExpiringSoonDocs(docsResult.data.filter((d) => d.expiration_date >= today).length)
    }
    if (certsResult.data) {
      setExpiredCerts(certsResult.data.filter((c) => c.expiration_date < today).length)
      setExpiringSoonCerts(certsResult.data.filter((c) => c.expiration_date >= today).length)
    }
    if (insResult.data) {
      setExpiredIns(insResult.data.filter((i) => i.expiration_date < today).length)
      setExpiringSoonIns(insResult.data.filter((i) => i.expiration_date >= today).length)
    }
    if (permitsResult.data) {
      setExpiredPermits(permitsResult.data.filter((p) => p.expiration_date < today).length)
      setExpiringSoonPermits(permitsResult.data.filter((p) => p.expiration_date >= today).length)
    }

    setReady(true)
  }

  // Don't render anything until all four queries are done
  if (!ready) return null

  const totalDocs    = expiredDocs    + expiringSoonDocs
  const totalCerts   = expiredCerts   + expiringSoonCerts
  const totalIns     = expiredIns     + expiringSoonIns
  const totalPermits = expiredPermits + expiringSoonPermits
  const totalExpired = expiredDocs + expiredCerts + expiredIns + expiredPermits

  // Nothing to show — no empty space added to the dashboard
  if (totalDocs + totalCerts + totalIns + totalPermits === 0) return null

  // Red banner if anything is already expired; amber if only expiring soon
  const isUrgent = totalExpired > 0

  const bannerClass = isUrgent
    ? 'block rounded-lg px-4 py-3 bg-red-50 border border-danger hover:bg-red-100 transition-colors'
    : 'block rounded-lg px-4 py-3 bg-amber/10 border border-amber hover:bg-amber/20 transition-colors'

  const textClass = isUrgent
    ? 'text-sm font-semibold text-danger'
    : 'text-sm font-semibold text-amber-dark'

  // Pluralise a word based on count
  function p(count, singular, plural) {
    return count === 1 ? singular : (plural ?? `${singular}s`)
  }

  // Build description strings for each affected source, then join as natural English
  const parts = []
  if (totalDocs    > 0) parts.push(`${totalDocs} ${p(totalDocs, 'document')}`)
  if (totalCerts   > 0) parts.push(`${totalCerts} staff ${p(totalCerts, 'certification')}`)
  if (totalIns     > 0) parts.push(`${totalIns} insurance ${p(totalIns, 'policy', 'policies')}`)
  if (totalPermits > 0) parts.push(`${totalPermits} local ${p(totalPermits, 'permit')}`)

  // Join: "A", "A and B", or "A, B, and C"
  function joinParts(arr) {
    if (arr.length === 1) return arr[0]
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
    return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`
  }

  const message = parts.length > 1
    ? `You have items requiring attention — ${joinParts(parts)} expiring within 60 days.`
    : `You have ${parts[0]} expiring within 60 days.`

  // Route the link to the most critical page: documents → permits → insurance → staff
  const hasDocs    = totalDocs    > 0
  const hasPermits = totalPermits > 0
  const hasIns     = totalIns     > 0
  const hasCerts   = totalCerts   > 0

  const linkTo =
    hasDocs    ? '/documents' :
    hasPermits ? '/permits'   :
    hasIns     ? '/insurance' :
                 '/staff'

  const linkLabel = parts.length > 1 ? 'Review now →' :
    hasDocs    ? 'Review your documents →'            :
    hasCerts   ? 'Review your staff certifications →' :
    hasIns     ? 'Review your insurance policies →'   :
                 'Review your local permits →'

  return (
    <Link to={linkTo} className={bannerClass}>
      <p className={textClass}>
        {isUrgent ? '⚠️' : '🔔'} {message} <span className="underline">{linkLabel}</span>
      </p>
    </Link>
  )
}
