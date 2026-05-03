/**
 * ComplianceAlertBanner — unified dashboard alert for:
 *   - Documents, staff certifications, insurance policies, and local permits expiring within 60 days
 *   - Compliance calendar deadlines due within 14 days (overdue or due soon)
 * Runs all five queries in parallel. Shows a single red (expired/overdue) or
 * amber (expiring/due-soon) banner. Returns null until all queries complete.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ComplianceAlertBanner() {
  const { brewery } = useAuth()

  // Expiration counts for documents, certs, insurance, permits
  const [expiredDocs,         setExpiredDocs]         = useState(0)
  const [expiringSoonDocs,    setExpiringSoonDocs]    = useState(0)
  const [expiredCerts,        setExpiredCerts]        = useState(0)
  const [expiringSoonCerts,   setExpiringSoonCerts]   = useState(0)
  const [expiredIns,          setExpiredIns]          = useState(0)
  const [expiringSoonIns,     setExpiringSoonIns]     = useState(0)
  const [expiredPermits,      setExpiredPermits]      = useState(0)
  const [expiringSoonPermits, setExpiringSoonPermits] = useState(0)

  // Compliance calendar deadline counts (overdue vs. due within 14 days)
  const [overdueDeadlines,  setOverdueDeadlines]  = useState(0)
  const [dueSoonDeadlines,  setDueSoonDeadlines]  = useState(0)

  // Prevents a flash of the banner before all queries resolve
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!brewery?.id) return
    checkExpirations()
  }, [brewery?.id])

  // Run all five queries in parallel
  async function checkExpirations() {
    const today    = new Date().toISOString().split('T')[0]
    const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [docsResult, certsResult, insResult, permitsResult, deadlinesResult] = await Promise.all([
      // Documents expiring within 60 days
      supabase
        .from('brewery_documents')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),

      // Staff certifications expiring within 60 days
      supabase
        .from('staff_certifications')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),

      // Insurance policies expiring within 60 days
      supabase
        .from('insurance_policies')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),

      // Active local permits expiring within 60 days
      supabase
        .from('local_permits')
        .select('expiration_date')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in60Days),

      // Incomplete compliance deadlines that are overdue or due within 14 days
      supabase
        .from('brewery_deadlines')
        .select('custom_date')
        .eq('brewery_id', brewery.id)
        .eq('is_complete', false)
        .not('custom_date', 'is', null)
        .lte('custom_date', in14Days),
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
    if (deadlinesResult.data) {
      setOverdueDeadlines(deadlinesResult.data.filter((d) => d.custom_date < today).length)
      setDueSoonDeadlines(deadlinesResult.data.filter((d) => d.custom_date >= today).length)
    }

    setReady(true)
  }

  if (!ready) return null

  const totalDocs      = expiredDocs      + expiringSoonDocs
  const totalCerts     = expiredCerts     + expiringSoonCerts
  const totalIns       = expiredIns       + expiringSoonIns
  const totalPermits   = expiredPermits   + expiringSoonPermits
  const totalDeadlines = overdueDeadlines + dueSoonDeadlines
  const totalExpired   = expiredDocs + expiredCerts + expiredIns + expiredPermits + overdueDeadlines

  if (totalDocs + totalCerts + totalIns + totalPermits + totalDeadlines === 0) return null

  const isUrgent = totalExpired > 0

  const bannerClass = isUrgent
    ? 'block rounded-lg px-4 py-3 bg-red-50 border border-danger hover:bg-red-100 transition-colors'
    : 'block rounded-lg px-4 py-3 bg-amber/10 border border-amber hover:bg-amber/20 transition-colors'

  const textClass = isUrgent
    ? 'text-sm font-semibold text-danger'
    : 'text-sm font-semibold text-amber-dark'

  function p(count, singular, plural) {
    return count === 1 ? singular : (plural ?? `${singular}s`)
  }

  function joinParts(arr) {
    if (arr.length === 1) return arr[0]
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
    return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`
  }

  const parts = []
  if (totalDeadlines > 0) parts.push(`${totalDeadlines} compliance ${p(totalDeadlines, 'deadline')}`)
  if (totalDocs      > 0) parts.push(`${totalDocs} ${p(totalDocs, 'document')}`)
  if (totalCerts     > 0) parts.push(`${totalCerts} staff ${p(totalCerts, 'certification')}`)
  if (totalIns       > 0) parts.push(`${totalIns} insurance ${p(totalIns, 'policy', 'policies')}`)
  if (totalPermits   > 0) parts.push(`${totalPermits} local ${p(totalPermits, 'permit')}`)

  const deadlineMsg = overdueDeadlines > 0 ? 'overdue or ' : ''
  const message = parts.length > 1
    ? `You have items requiring attention — ${joinParts(parts)} ${deadlineMsg}expiring within 60 days.`
    : totalDeadlines > 0
      ? `You have ${parts[0]} ${overdueDeadlines > 0 ? 'overdue or ' : ''}due within 14 days.`
      : `You have ${parts[0]} expiring within 60 days.`

  // Route to the most critical destination
  const linkTo = totalDeadlines > 0 ? '/compliance' :
    totalDocs    > 0 ? '/documents' :
    totalPermits > 0 ? '/permits'   :
    totalIns     > 0 ? '/insurance' :
                       '/staff'

  const linkLabel = totalDeadlines > 0 ? 'Review compliance calendar →' :
    parts.length > 1 ? 'Review now →' :
    totalDocs    > 0 ? 'Review your documents →'            :
    totalCerts   > 0 ? 'Review your staff certifications →' :
    totalIns     > 0 ? 'Review your insurance policies →'   :
                       'Review your local permits →'

  return (
    <Link to={linkTo} className={bannerClass}>
      <p className={textClass}>
        {isUrgent ? '⚠️' : '🔔'} {message} <span className="underline">{linkLabel}</span>
      </p>
    </Link>
  )
}
