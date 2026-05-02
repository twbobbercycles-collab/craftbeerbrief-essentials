/**
 * TtbPage — TTB Filing & Excise Tax Tracker module.
 * Shows filing history, COLA tracker, and current period status.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'

export default function TtbPage() {
  const { brewery } = useAuth()
  const [filings, setFilings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brewery?.id) return
    loadFilings()
  }, [brewery?.id])

  async function loadFilings() {
    const { data } = await supabase
      .from('ttb_filings')
      .select('*')
      .eq('brewery_id', brewery.id)
      .order('period_start', { ascending: false })

    setFilings(data ?? [])
    setLoading(false)
  }

  if (loading) return <LoadingSpinner message="Loading TTB filings..." />

  return (
    <div className="space-y-4">
      <DismissibleDisclaimer
        storageKey="disclaimer_ttb_dismissed"
        text="Tracking tool only — This app helps you organize and track your TTB obligations. It does not file, submit, or communicate with the TTB on your behalf. All actual filings and payments remain your sole responsibility. Always verify requirements directly at ttb.gov."
      />

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy">📊 TTB Filing Tracker</h2>
        <button className="bg-amber text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-dark transition-colors">
          + Log New Filing
        </button>
      </div>

      {filings.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No TTB filings logged yet"
          message="Use the button above to log your first excise tax filing period. We'll track your payment history and help you calculate what you owe."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Barrels</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tax Owed</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filings.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 text-navy">{f.period_start} – {f.period_end}</td>
                  <td className="px-4 py-3 text-gray-600">{f.barrels_removed}</td>
                  <td className="px-4 py-3 text-gray-600">${f.tax_owed?.toFixed(2) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      f.status === 'paid' ? 'bg-green-100 text-success' :
                      f.status === 'pending' ? 'bg-orange-100 text-warning' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {f.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
