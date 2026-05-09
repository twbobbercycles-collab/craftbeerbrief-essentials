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
  formatAmount, formatDeadline, isNationwide,
} from './grantsUtils'

// Government level badge styles
const GOV_LEVEL_STYLES = {
  'Federal':        'bg-navy text-white',
  'Federal/State':  'bg-navy/80 text-white',
  'State':          'bg-blue-100 text-blue-700',
  'Municipal':      'bg-purple-100 text-purple-700',
  'Regional':       'bg-teal-100 text-teal-700',
  'County':         'bg-indigo-100 text-indigo-700',
}

// Confidence level badge styles
const CONFIDENCE_STYLES = {
  'High':   'bg-green-100 text-green-700',
  'Medium': 'bg-amber/10 text-amber',
  'Low':    'bg-red-100 text-red-600',
}

const RELEVANCE_TOOLTIPS = {
  5: 'Highly Relevant — This program is specifically designed for or frequently used by craft breweries',
  4: 'Very Relevant — Strong fit for most craft breweries. Verify eligibility details.',
  3: 'Relevant — Moderate fit for breweries. Eligibility depends on your specific situation.',
  2: 'Potentially Relevant — May apply to some breweries in specific circumstances. Review carefully.',
  1: 'Low Relevance — Rarely applicable to breweries but included for completeness.',
}

const CONFIDENCE_TOOLTIPS = {
  'High':   'High Confidence — Program details verified directly from official government sources. Information is current and accurate.',
  'Medium': 'Medium Confidence — Program exists and is active but some details like amounts or deadlines require verification directly with the agency.',
  'Low':    'Low Confidence — Program information is preliminary. Verify all details directly with the agency before relying on this listing.',
}

function YesNoBadge({ value, label }) {
  if (value === null || value === undefined) return null
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      value ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {label}: {value ? 'Yes' : 'No'}
    </span>
  )
}

export default function GrantCard({ grant, saved, onToggleBookmark, onToggleAlert, showRemoveBookmark }) {
  const [expanded, setExpanded] = useState(false)

  const displayStatus = getDisplayStatus(grant)
  const isBookmarked  = !!saved
  const alertEnabled  = saved?.alert_enabled ?? false
  const deadline      = formatDeadline(grant.application_deadline)
  const nationwide    = isNationwide(grant)
  const states        = grant.states_eligible ?? []
  const visibleStates = states.slice(0, 4)
  const extraCount    = states.length - 4

  const reviewedDate = grant.last_reviewed_at
    ? new Date(grant.last_reviewed_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null

  const govLevelStyle    = GOV_LEVEL_STYLES[grant.government_level] ?? 'bg-gray-100 text-gray-600'
  const confidenceStyle  = CONFIDENCE_STYLES[grant.confidence_level] ?? 'bg-gray-100 text-gray-500'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-sm">

      {/* ── Title row with bookmark star ── */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">

          {/* Badge row */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {/* Loan vs Grant */}
            {grant.is_loan ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Loan</span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Grant</span>
            )}

            {/* Status */}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(displayStatus)}`}>
              {getStatusLabel(displayStatus)}
            </span>

            {/* Government level */}
            {grant.government_level && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${govLevelStyle}`}>
                {grant.government_level}
              </span>
            )}

            {/* Brewery relevance score */}
            {grant.brewery_relevance_score != null && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber/10 text-amber cursor-help"
                title={RELEVANCE_TOOLTIPS[grant.brewery_relevance_score]}
              >
                Relevance: {grant.brewery_relevance_score}/5
              </span>
            )}

            {/* Confidence level */}
            {grant.confidence_level && (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-help ${confidenceStyle}`}
                title={CONFIDENCE_TOOLTIPS[grant.confidence_level]}
              >
                {grant.confidence_level} Confidence
              </span>
            )}
          </div>

          {/* Program acronym + title */}
          {grant.program_acronym && (
            <p className="text-xs font-bold text-amber tracking-wide mb-0.5">{grant.program_acronym}</p>
          )}
          <h3 className="font-semibold text-navy text-sm leading-snug">{grant.title}</h3>
          {grant.program_acronym && grant.acronym_definition && (
            <p className="text-xs text-gray-400 mt-0.5 italic">{grant.acronym_definition}</p>
          )}
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

      {/* ── Eligibility summary ── */}
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
          deadline.isPast   ? 'text-gray-400 line-through' : 'text-gray-500'
        }`}>
          {deadline.text === 'No deadline' ? 'No deadline (rolling)' : `Deadline: ${deadline.text}`}
        </span>
        {grant.application_cycle && (
          <span className="text-xs text-gray-400">Cycle: {grant.application_cycle}</span>
        )}
      </div>

      {/* ── State eligibility badges ── */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {nationwide ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Nationwide</span>
        ) : (
          <>
            {visibleStates.map(s => (
              <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>
            ))}
            {extraCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">+{extraCount} more</span>
            )}
          </>
        )}
        {grant.municipality && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">{grant.municipality}</span>
        )}
        {grant.county && !grant.municipality && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{grant.county} County</span>
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

          {/* Full description */}
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

          {/* Program details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {grant.funding_agency && (
              <div>
                <p className="text-xs font-semibold text-navy">Funding Agency</p>
                <p className="text-xs text-gray-600">{grant.funding_agency}</p>
              </div>
            )}
            {grant.application_cycle && (
              <div>
                <p className="text-xs font-semibold text-navy">Application Cycle</p>
                <p className="text-xs text-gray-600">{grant.application_cycle}</p>
              </div>
            )}
            {grant.industry_focus && (
              <div>
                <p className="text-xs font-semibold text-navy">Industry Focus</p>
                <p className="text-xs text-gray-600">{grant.industry_focus}</p>
              </div>
            )}
            {grant.business_stage && (
              <div>
                <p className="text-xs font-semibold text-navy">Business Stage</p>
                <p className="text-xs text-gray-600">{grant.business_stage}</p>
              </div>
            )}
            {grant.matching_requirement && (
              <div className="col-span-2">
                <p className="text-xs font-semibold text-navy">Matching Requirement</p>
                <p className="text-xs text-gray-600">{grant.matching_requirement}</p>
              </div>
            )}
          </div>

          {/* Eligibility flags */}
          <div className="flex flex-wrap gap-1.5">
            <YesNoBadge value={grant.rural_eligible}            label="Rural Eligible" />
            <YesNoBadge value={grant.opportunity_zone_eligible} label="Opportunity Zone" />
            <YesNoBadge value={grant.forgivable_loan_eligible}  label="Forgivable" />
            <YesNoBadge value={grant.stackable}                 label="Stackable" />
          </div>

          {/* Full state list */}
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

          {/* Apply button */}
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

          {/* Source URL */}
          {grant.source_url && grant.source_url !== grant.application_url && (
            <p className="text-xs text-gray-400 break-all">
              Source:{' '}
              <a href={grant.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {grant.source_url}
              </a>
            </p>
          )}

          {/* Footer: last reviewed + badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {reviewedDate ? (
              <p className="text-xs text-gray-400">
                Last reviewed by The Craft Beer Brief team: {reviewedDate}
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                Updated:{' '}
                {new Date(grant.updated_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </p>
            )}
            {grant.is_manually_curated && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber/10 text-amber font-medium">
                Verified by The Craft Beer Brief
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
