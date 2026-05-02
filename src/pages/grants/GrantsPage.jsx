/**
 * GrantsPage — Grant & Funding Finder module.
 * Shows federal grants (auto-synced from Grants.gov) and user-submitted state/local programs.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'

export default function GrantsPage() {
  const { brewery } = useAuth()
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'federal', 'state'

  useEffect(() => {
    loadGrants()
  }, [brewery])

  async function loadGrants() {
    let query = supabase
      .from('grants')
      .select('*')
      .eq('approved', true)
      .eq('status', 'open')
      .order('application_deadline', { ascending: true })

    if (filter === 'federal') query = query.eq('is_federal', true)
    if (filter === 'state') query = query.eq('is_federal', false)

    const { data } = await query
    setGrants(data ?? [])
    setLoading(false)
  }

  // Re-fetch when the filter changes
  useEffect(() => { loadGrants() }, [filter])

  if (loading) return <LoadingSpinner message="Loading grants..." />

  return (
    <div className="space-y-4">
      <DismissibleDisclaimer
        storageKey="disclaimer_grants_dismissed"
        text="Reference only — Grant and funding information is provided for informational purposes only. Eligibility requirements, deadlines, and program availability change frequently and cannot be guaranteed. Always verify details directly with the funding source before applying."
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">💰 Grant & Funding Finder</h2>
        <button className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
          + Submit a Grant
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { value: 'all', label: 'All Grants' },
          { value: 'federal', label: 'Federal' },
          { value: 'state', label: 'State / Local' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === tab.value ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {grants.length === 0 ? (
        <EmptyState
          icon="💰"
          title="No grants found yet"
          message="Federal grants are synced automatically from Grants.gov every 24 hours. Check back soon, or submit a state or local grant you know about."
        />
      ) : (
        <div className="space-y-3">
          {grants.map((grant) => (
            <GrantCard key={grant.id} grant={grant} breweryId={brewery?.id} />
          ))}
        </div>
      )}
    </div>
  )
}

// Card for a single grant opportunity
function GrantCard({ grant, breweryId }) {
  async function saveGrant() {
    await supabase
      .from('brewery_saved_grants')
      .upsert({ brewery_id: breweryId, grant_id: grant.id }, { onConflict: 'brewery_id,grant_id' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              grant.is_federal ? 'bg-navy/10 text-navy' : 'bg-amber/10 text-amber'
            }`}>
              {grant.is_federal ? 'Federal' : 'State / Local'}
            </span>
            {grant.application_deadline && (
              <span className="text-xs text-gray-500">
                Deadline: {grant.application_deadline}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-navy text-sm">{grant.title}</h3>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{grant.eligibility_summary}</p>
          {(grant.amount_min || grant.amount_max) && (
            <p className="text-xs text-success font-medium mt-2">
              💵 {grant.amount_min ? `$${grant.amount_min.toLocaleString()}` : ''}
              {grant.amount_min && grant.amount_max ? ' – ' : ''}
              {grant.amount_max ? `$${grant.amount_max.toLocaleString()}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {grant.application_url && (
            <a
              href={grant.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-amber text-white px-3 py-1.5 rounded-lg hover:bg-amber-dark transition-colors text-center"
            >
              Apply →
            </a>
          )}
          <button
            onClick={saveGrant}
            className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
