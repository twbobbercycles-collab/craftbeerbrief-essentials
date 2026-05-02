/**
 * DocumentExpirationAlert — shown on the dashboard when any brewery documents
 * are expired or expiring within the next 60 days.
 * Red banner for already-expired docs; amber banner for expiring soon.
 * Returns null when there is nothing to show.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'

export default function DocumentExpirationAlert() {
  const { brewery } = useAuth()
  const [expiredCount, setExpiredCount]         = useState(0)
  const [expiringSoonCount, setExpiringSoonCount] = useState(0)
  // Track whether the query has completed so we don't flash the banner before data arrives
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!brewery?.id) return
    checkExpiringDocs()
  }, [brewery?.id])

  // Query documents that are already expired or will expire within 60 days
  async function checkExpiringDocs() {
    const today    = new Date().toISOString().split('T')[0]
    const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const { data } = await supabase
      .from('brewery_documents')
      .select('expiration_date')
      .eq('brewery_id', brewery.id)
      .not('expiration_date', 'is', null)
      .lte('expiration_date', in60Days)

    if (data) {
      setExpiredCount(data.filter((d) => d.expiration_date < today).length)
      setExpiringSoonCount(data.filter((d) => d.expiration_date >= today).length)
    }
    setReady(true)
  }

  // Don't render until the query is done — prevents a flash of the banner followed by nothing
  if (!ready) return null

  const totalCount = expiredCount + expiringSoonCount
  if (totalCount === 0) return null

  // Expired documents get a red banner (more urgent than just expiring soon)
  if (expiredCount > 0) {
    return (
      <Link
        to="/documents"
        className="block rounded-lg px-4 py-3 bg-red-50 border border-danger hover:bg-red-100 transition-colors"
      >
        <p className="text-sm font-semibold text-danger">
          ⚠️{' '}
          {expiredCount} document{expiredCount !== 1 ? 's' : ''}{' '}
          {expiredCount === 1 ? 'has' : 'have'} expired.
          {expiringSoonCount > 0 && ` ${expiringSoonCount} more expiring within 60 days.`}
          {' '}<span className="underline">Review your documents →</span>
        </p>
      </Link>
    )
  }

  // Only expiring-soon documents — amber banner
  return (
    <Link
      to="/documents"
      className="block rounded-lg px-4 py-3 bg-amber/10 border border-amber hover:bg-amber/20 transition-colors"
    >
      <p className="text-sm font-semibold text-amber-dark">
        🔔 You have {expiringSoonCount} document{expiringSoonCount !== 1 ? 's' : ''} expiring
        within 60 days.{' '}
        <span className="underline">Review your documents →</span>
      </p>
    </Link>
  )
}
