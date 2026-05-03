/**
 * ListView — chronological list view for the compliance calendar.
 * Shows overdue incomplete deadlines first in a red section, then upcoming
 * deadlines grouped by month, then a collapsed "Completed" section at the bottom.
 */
import { useMemo } from 'react'
import {
  getDueDate, getDeadlineName, getDeadlineCategory, getDeadlineColor,
  daysUntilDue, getDaysBadge, fmtDate,
} from './complianceUtils'

// Returns a "Month YYYY" label from a YYYY-MM string (e.g. "April 2026")
function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Single deadline row used in all sections
function DeadlineRow({ deadline, onCheck, onEdit, onDelete, onReset }) {
  const dueDate = getDueDate(deadline)
  const days    = daysUntilDue(dueDate)
  const badge   = getDaysBadge(days)
  const color   = getDeadlineColor(deadline)
  const cat     = getDeadlineCategory(deadline)

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${deadline.is_complete ? 'opacity-60' : ''}`}>

      {/* Completion checkbox */}
      <input type="checkbox" checked={deadline.is_complete} onChange={() => onCheck(deadline)}
        className="flex-shrink-0 w-4 h-4 rounded border-gray-300 text-success focus:ring-success cursor-pointer" />

      {/* Category color dot */}
      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${color.dot}`} />

      {/* Name and due date */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium text-navy truncate ${deadline.is_complete ? 'line-through' : ''}`}>
          {getDeadlineName(deadline)}
        </p>
        <p className="text-xs text-gray-400">{fmtDate(dueDate)}</p>
      </div>

      {/* Days remaining badge — hidden for completed items */}
      {!deadline.is_complete && (
        <span className={`text-xs whitespace-nowrap flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
      )}

      {/* Category badge — hidden on very small screens to avoid cramping */}
      <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 ${color.badge}`}>
        {cat}
      </span>

      {/* Row actions */}
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={() => onEdit(deadline)} className="text-xs text-amber hover:underline">Edit</button>
        {deadline.is_custom
          ? <button onClick={() => onDelete(deadline)} className="text-xs text-danger hover:underline">Delete</button>
          : <button onClick={() => onReset(deadline)}  className="text-xs text-gray-400 hover:underline">Reset</button>
        }
      </div>
    </div>
  )
}

export default function ListView({ deadlines, onCheck, onEdit, onDelete, onReset }) {
  const today = new Date().toISOString().split('T')[0]

  // Split into three buckets: overdue (incomplete + past due), upcoming, complete
  const { overdue, upcoming, complete } = useMemo(() => {
    const o = [], u = [], c = []
    for (const d of deadlines) {
      if (d.is_complete) { c.push(d); continue }
      const date = getDueDate(d)
      if (date && date < today) o.push(d)
      else u.push(d)
    }
    o.sort((a, b) => (getDueDate(a) ?? '').localeCompare(getDueDate(b) ?? ''))
    u.sort((a, b) => (getDueDate(a) ?? '').localeCompare(getDueDate(b) ?? ''))
    c.sort((a, b) => (getDueDate(b) ?? '').localeCompare(getDueDate(a) ?? ''))
    return { overdue: o, upcoming: u, complete: c }
  }, [deadlines, today])

  // Group upcoming deadlines by YYYY-MM for the monthly sections
  const byMonth = useMemo(() => {
    const map = {}
    for (const d of upcoming) {
      const date = getDueDate(d)
      if (!date) continue
      const key = date.slice(0, 7)
      if (!map[key]) map[key] = []
      map[key].push(d)
    }
    return map
  }, [upcoming])

  const months = Object.keys(byMonth).sort()

  const rowProps = { onCheck, onEdit, onDelete, onReset }

  if (deadlines.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-3xl mb-2">📅</p>
        <p className="text-sm">No deadlines match your current filters.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Overdue section ── */}
      {overdue.length > 0 && (
        <div className="bg-white rounded-xl border border-danger overflow-hidden">
          <div className="bg-red-50 px-4 py-2.5 border-b border-danger">
            <p className="text-sm font-semibold text-danger">
              ⚠️ Overdue — {overdue.length} deadline{overdue.length !== 1 ? 's' : ''}
            </p>
          </div>
          {overdue.map(d => <DeadlineRow key={d.id} deadline={d} {...rowProps} />)}
        </div>
      )}

      {/* ── Monthly upcoming sections ── */}
      {months.map(ym => (
        <div key={ym} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            <p className="text-sm font-semibold text-navy">{monthLabel(ym)}</p>
          </div>
          {byMonth[ym].map(d => <DeadlineRow key={d.id} deadline={d} {...rowProps} />)}
        </div>
      ))}

      {/* ── Completed section — collapsed by default ── */}
      {complete.length > 0 && (
        <details className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
          <summary className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 cursor-pointer list-none flex items-center justify-between hover:bg-gray-100 transition-colors">
            <span className="text-sm font-semibold text-gray-500">✓ Completed ({complete.length})</span>
            <span className="text-xs text-gray-400 group-open:hidden">Click to expand</span>
          </summary>
          {complete.map(d => <DeadlineRow key={d.id} deadline={d} {...rowProps} />)}
        </details>
      )}
    </div>
  )
}
