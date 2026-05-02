/**
 * CompliancePage — State Compliance Calendar module.
 * Shows deadlines for the brewery's state, allows marking complete and adding custom deadlines.
 * Full implementation comes in Module 3 build-out.
 */
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'

export default function CompliancePage() {
  const { brewery } = useAuth()
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brewery?.id) return
    loadDeadlines()
  }, [brewery?.id])

  async function loadDeadlines() {
    const { data } = await supabase
      .from('brewery_deadlines')
      .select('*, compliance_deadlines(*)')
      .eq('brewery_id', brewery.id)
      .order('custom_date', { ascending: true })

    setDeadlines(data ?? [])
    setLoading(false)
  }

  if (loading) return <LoadingSpinner message="Loading your compliance calendar..." />

  return (
    <div className="space-y-4">
      <DismissibleDisclaimer
        storageKey="disclaimer_compliance_dismissed"
        text="Reference only — Compliance deadlines shown are for general reference and may not reflect your specific jurisdiction or circumstances. Requirements change frequently. Always verify deadlines and requirements with your state licensing authority before taking action."
      />

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy">📅 Compliance Calendar</h2>
        <button className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
          + Add Custom Deadline
        </button>
      </div>

      {deadlines.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No compliance deadlines yet"
          message={`We'll automatically load ${brewery?.state ?? 'your state'}'s compliance deadlines when you complete setup. Check back after your database is connected.`}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y">
          {deadlines.map((bd) => (
            <DeadlineRow key={bd.id} deadline={bd} onToggle={loadDeadlines} />
          ))}
        </div>
      )}
    </div>
  )
}

// Single deadline row with a completion checkbox
function DeadlineRow({ deadline, onToggle }) {
  const dl = deadline.compliance_deadlines

  async function toggleComplete() {
    await supabase
      .from('brewery_deadlines')
      .update({ is_complete: !deadline.is_complete })
      .eq('id', deadline.id)
    onToggle()
  }

  return (
    <div className={`flex items-center gap-4 px-5 py-4 ${deadline.is_complete ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={deadline.is_complete}
        onChange={toggleComplete}
        className="rounded border-gray-300 text-success focus:ring-success"
      />
      <div className="flex-1">
        <p className={`text-sm font-medium text-navy ${deadline.is_complete ? 'line-through' : ''}`}>
          {dl?.deadline_name ?? deadline.notes ?? 'Custom deadline'}
        </p>
        <p className="text-xs text-gray-500">{dl?.category} • Due {deadline.custom_date}</p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        dl?.is_federal ? 'bg-navy/10 text-navy' : 'bg-amber/10 text-amber'
      }`}>
        {dl?.is_federal ? 'Federal' : 'State'}
      </span>
    </div>
  )
}
