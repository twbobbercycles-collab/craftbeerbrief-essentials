/**
 * GrantCard — displays one grant opportunity.
 * Shows a summary by default; clicking "View Details" expands the full description,
 * state list, and application link.
 *
 * Props:
 *   grant              — the grant row from the database
 *   saved              — the brewery_saved_grants row if bookmarked (undefined if not)
 *   onToggleBookmark   — fn(grantId) called to add or remove a bookmark
 *   onToggleAlert      — fn(grantId) called to toggle the 30-day deadline email alert
 *   showRemoveBookmark — when true (Bookmarked tab), shows a red "Remove Bookmark" button
 */
import { useState } from 'react'
import {
  getDisplayStatus, getStatusColor, getStatusLabel,
  formatAmount, formatDeadline, isNationwide, getFundingTypeLabel,
} from './grantsUtils'

export default function GrantCard({ grant, saved, onToggleBookmark, onToggleAlert, showRemoveBookmark }) {
  const [expanded, setExpanded] = useState(false)

  const displayStatus = getDisplayStatus(grant)
  const isBookmarked  = !!saved
  const alertEnabled  = saved?.alert_enabled ?? false
  const deadline      = formatDeadline(grant.application_deadline)
  const nationwide    = isNationwide(grant)
  const states        = grant.states_eligible ?? []
  // Show the first 4 state badges; "+X more" badge for the rest
  const visibleStates = states.slice(0, 4)
  const extraCount    = states.length - 4

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-sm">

      {/* ── Title row with bookmark star ── */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">

          {/* Badge row: funding type (label from db key) + status */}
          <div className="flex flex-wrap gap-2 mb-2">
            {grant.funding_type && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber/10 text-amber">
                {getFundingTypeLabel(grant.funding_type)}
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(displayStatus)}`}>
              {getStatusLabel(displayStatus)}
            </span>
          </div>

          {/* Grant title */}
          <h3 className="font-semibold text-navy text-sm leading-snug">{grant.title}</h3>
        </div>

        {/* Star bookmark toggle */}
        <button
          onClick={() => onToggleBookmark(grant.id)}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this grant'}
          className={`text-2xl flex-shrink-0 leading-none transition-colors mt-0.5 ${
            isBookmarked ? 'text-amber' : 'text-gray-300 hover:text-amber/70'
          }`}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
      </div>

      {/* ── Eligibility summary (3-line clamp, expands with card) ── */}
      {grant.eligibility_summary && (
        <p className={`text-xs text-gray-600 mt-2 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
          {grant.eligibility_summary}
        </p>
      )}

      {/* ── Amount + Deadline row ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3">
        <span className="text-xs font-medium text-success">{formatAmount(grant)}</span>
        <span className={`text-xs ${
          deadline.isUrgent ? 'text-danger font-semibold' :
          deadline.isPast   ? 'text-gray-400 line-through' :
                              'text-gray-500'
        }`}>
          {deadline.text === 'No deadline' ? 'No deadline (rolling)' : `Deadline: ${deadline.text}`}
        </span>
      </div>

      {/* ── State eligibility badges ── */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {nationwide ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            Nationwide
          </span>
        ) : (
          <>
            {visibleStates.map(s => (
              <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>
            ))}
            {extraCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                +{extraCount} more
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {expanded ? 'Hide Details' : 'View Details'}
        </button>

        {/* Alert Me button — only shown when bookmarked AND a deadline exists */}
        {isBookmarked && grant.application_deadline && (
          <button
            onClick={() => onToggleAlert(grant.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              alertEnabled
                ? 'bg-amber/10 text-amber border-amber/30 hover:bg-amber/20'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {alertEnabled ? '🔔 Alert On' : '🔔 Alert Me'}
          </button>
        )}

        {/* Remove Bookmark button — only shown on the Bookmarked tab */}
        {showRemoveBookmark && (
          <button
            onClick={() => onToggleBookmark(grant.id)}
            className="text-xs text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Remove Bookmark
          </button>
        )}
      </div>

      {/* ── Expanded details panel ── */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">

          {/* Full description (only shown if different from eligibility_summary) */}
          {grant.description && grant.description !== grant.eligibility_summary && (
            <div>
              <p className="text-xs font-semibold text-navy mb-1">Description</p>
              <p className="text-xs text-gray-600 leading-relaxed">{grant.description}</p>
            </div>
          )}

          {/* Award amount */}
          <div>
            <p className="text-xs font-semibold text-navy mb-1">Award Amount</p>
            <p className="text-xs text-gray-600">{formatAmount(grant)}</p>
          </div>

          {/* Full state list (only for non-nationwide grants) */}
          {!nationwide && states.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-navy mb-1">Eligible States</p>
              <div className="flex flex-wrap gap-1.5">
                {states.map(s => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Apply button — opens official application page in a new tab */}
          {grant.application_url && (
            <a
              href={grant.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-2"
            >
              Visit Official Application Page →
            </a>
          )}

          {/* Source URL (shown below the button if different from the apply URL) */}
          {grant.source_url && grant.source_url !== grant.application_url && (
            <p className="text-xs text-gray-400 break-all">
              Source:{' '}
              <a href={grant.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {grant.source_url}
              </a>
            </p>
          )}

          {/* Last updated date + auto-sync or community source badge */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <p className="text-xs text-gray-400">
              Updated:{' '}
              {new Date(grant.updated_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
            {grant.grant_source === 'grants_gov' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                Auto-synced from Grants.gov
              </span>
            )}
            {grant.grant_source === 'user_submitted' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">
                Submitted by community
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
