/**
 * AdminPage — visible only to the admin email (VITE_ADMIN_EMAIL).
 * Shows: pending user-submitted grants, recent sync log, and a manual sync trigger button.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'

export default function AdminPage() {
  const [pendingGrants, setPendingGrants] = useState([])
  const [syncLogs, setSyncLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    loadAdminData()
  }, [])

  async function loadAdminData() {
    const [grantsResult, logsResult] = await Promise.all([
      // All user-submitted grants not yet approved or rejected
      supabase
        .from('grants')
        .select('*, users(email)')
        .eq('grant_source', 'user_submitted')
        .eq('approved', false)
        .order('created_at', { ascending: false }),

      // Last 10 automated sync records
      supabase
        .from('grants')
        .select('last_synced_at')
        .eq('grant_source', 'grants_gov')
        .not('last_synced_at', 'is', null)
        .order('last_synced_at', { ascending: false })
        .limit(10),
    ])

    setPendingGrants(grantsResult.data ?? [])
    setSyncLogs(logsResult.data ?? [])
    setLoading(false)
  }

  // Approve a user-submitted grant — sets approved=true so all users can see it
  async function approveGrant(grantId) {
    await supabase.from('grants').update({ approved: true }).eq('id', grantId)
    loadAdminData()
  }

  // Reject a user-submitted grant — deletes it and notifies the submitter
  async function rejectGrant(grantId, submittedByUserId) {
    await supabase.functions.invoke('reject-grant-submission', {
      body: { grantId, submittedByUserId },
    })
    loadAdminData()
  }

  // Manually trigger the Grants.gov sync without waiting for the 24-hour cron
  async function triggerManualSync() {
    setSyncing(true)
    setSyncMessage('')
    try {
      const { data, error } = await supabase.functions.invoke('grants-sync')
      if (error) throw error
      setSyncMessage(`✅ Sync complete — ${data?.added ?? 0} grants added, ${data?.updated ?? 0} updated.`)
      loadAdminData()
    } catch (err) {
      setSyncMessage(`❌ Sync failed: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading admin panel..." />

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-bold text-navy">🔧 Admin Panel</h2>

      {/* Grants.gov sync control */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-navy">Grants.gov Auto-Sync</h3>
          <button
            onClick={triggerManualSync}
            disabled={syncing}
            className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors disabled:opacity-60"
          >
            {syncing ? 'Syncing...' : '▶ Run Sync Now'}
          </button>
        </div>

        {syncMessage && (
          <p className="text-sm mb-4 font-medium text-navy">{syncMessage}</p>
        )}

        <p className="text-xs text-gray-500 mb-3">Last 10 synced grants (most recent first):</p>
        {syncLogs.length === 0 ? (
          <p className="text-sm text-gray-400">No sync history yet. Run a sync to see results.</p>
        ) : (
          <ul className="space-y-1">
            {syncLogs.map((log, i) => (
              <li key={i} className="text-xs text-gray-600">
                {new Date(log.last_synced_at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending user-submitted grants */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-navy mb-4">
          Pending Grant Submissions ({pendingGrants.length})
        </h3>

        {pendingGrants.length === 0 ? (
          <EmptyState
            icon="✅"
            title="No pending submissions"
            message="When brewery users submit grants for review, they'll appear here."
          />
        ) : (
          <div className="space-y-4">
            {pendingGrants.map((grant) => (
              <div key={grant.id} className="border border-gray-200 rounded-lg p-4">
                <p className="font-semibold text-navy text-sm">{grant.title}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Submitted by: {grant.users?.email ?? 'unknown'} •{' '}
                  {new Date(grant.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-600 mt-2 line-clamp-2">{grant.eligibility_summary}</p>
                {grant.application_url && (
                  <a
                    href={grant.application_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber text-xs hover:underline block mt-1"
                  >
                    {grant.application_url}
                  </a>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => approveGrant(grant.id)}
                    className="text-xs bg-success text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => rejectGrant(grant.id, grant.submitted_by_user_id)}
                    className="text-xs bg-danger text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
