/**
 * grantsUtils.js — shared constants and helper functions for the Grant & Funding Finder.
 * Imported by GrantsPage, GrantCard, and SubmitGrantModal.
 */

/**
 * Maps every snake_case funding_type database value to its human-readable display label.
 * This is the single source of truth — card badges, filter dropdowns, and the
 * submission form all pull from here so labels are always consistent.
 */
export const FUNDING_TYPE_LABELS = {
  federal_grant:        'Federal Grant',
  state_grant:          'State Grant',
  local_grant:          'Local Grant',
  loan:                 'Loan',
  tax_incentive:        'Tax Incentive',
  export_assistance:    'Export Assistance',
  rural_development:    'Rural Development',
  agricultural_program: 'Agricultural Program',
}

// Array of { value, label } objects for filter dropdowns and the submission form select
export const FUNDING_TYPES = Object.entries(FUNDING_TYPE_LABELS).map(([value, label]) => ({ value, label }))

// Converts a snake_case database funding_type value to a display label (e.g. 'federal_grant' → 'Federal Grant')
export function getFundingTypeLabel(dbValue) {
  return FUNDING_TYPE_LABELS[dbValue] ?? dbValue ?? ''
}

// Maps full state names to two-letter codes. Used to normalise brewery.state
// (which may be stored as a full name) before comparing to states_eligible
// values in the grants table (which are stored as two-letter codes).
export const STATE_NAME_TO_CODE = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
  'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME',
  'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
  'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE',
  'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
  'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
  'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
}

/**
 * Normalises a state value to a two-letter uppercase code.
 * Accepts either a two-letter code ('pa' → 'PA') or a full name ('Pennsylvania' → 'PA').
 * Returns the original value unchanged when no match is found.
 */
export function getStateCode(stateValue) {
  if (!stateValue) return stateValue
  const trimmed = stateValue.trim()
  if (trimmed.length === 2) return trimmed.toUpperCase()
  return STATE_NAME_TO_CODE[trimmed] ?? trimmed
}

// All 50 US state abbreviations (used in filters and the submission form checklist)
export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

// Full state names for the submission form checklist labels
export const US_STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
  HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
  KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
  MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri',
  MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey',
  NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio',
  OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
}

/**
 * Derives the display status for a grant card badge.
 * The database only stores 'open' / 'closed' / 'archived' — we compute
 * 'closing_soon' and 'rolling' from the deadline date at render time.
 */
export function getDisplayStatus(grant) {
  if (grant.status === 'closed' || grant.status === 'archived') return 'closed'
  if (!grant.application_deadline) return 'rolling'
  const deadline = new Date(grant.application_deadline)
  const now = new Date()
  if (deadline < now) return 'closed'
  const thirtyDaysOut = new Date()
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
  if (deadline <= thirtyDaysOut) return 'closing_soon'
  return 'open'
}

// Returns Tailwind classes for the colored status badge
export function getStatusColor(status) {
  const colors = {
    open:         'bg-green-100 text-green-700',
    closing_soon: 'bg-orange-100 text-orange-700',
    closed:       'bg-gray-100 text-gray-500',
    upcoming:     'bg-blue-100 text-blue-700',
    rolling:      'bg-teal-100 text-teal-700',
  }
  return colors[status] ?? 'bg-gray-100 text-gray-500'
}

// Human-readable label for each display status
export function getStatusLabel(status) {
  const labels = {
    open:         'Open Now',
    closing_soon: 'Closing Soon',
    closed:       'Closed',
    upcoming:     'Upcoming',
    rolling:      'Rolling',
  }
  return labels[status] ?? status
}

// Formats amount_min / amount_max into a readable string
export function formatAmount(grant) {
  if (!grant.amount_min && !grant.amount_max) return 'Amount varies — see program details'
  const fmt = (n) => '$' + Number(n).toLocaleString()
  if (grant.amount_min && grant.amount_max) return `${fmt(grant.amount_min)} – ${fmt(grant.amount_max)}`
  if (grant.amount_min) return `From ${fmt(grant.amount_min)}`
  return `Up to ${fmt(grant.amount_max)}`
}

/**
 * Formats a deadline date for display. Returns an object with:
 *   text     — human-readable date string, or "No deadline" for rolling programs
 *   isUrgent — true when the deadline is within 30 days (rendered in red)
 *   isPast   — true when the deadline has already passed
 */
export function formatDeadline(deadline) {
  if (!deadline) return { text: 'No deadline', isUrgent: false, isPast: false }
  const date = new Date(deadline)
  const now = new Date()
  const daysUntil = Math.ceil((date - now) / (1000 * 60 * 60 * 24))
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return { text: formatted, isUrgent: daysUntil >= 0 && daysUntil <= 30, isPast: daysUntil < 0 }
}

// Returns true if the grant is available nationwide (empty states list, or contains a nationwide marker)
export function isNationwide(grant) {
  const states = grant.states_eligible ?? []
  return states.length === 0 || states.some(s => {
    const lower = s.toLowerCase()
    return lower === 'all states' || lower === 'nationwide'
  })
}

// Returns true if the grant is available in the given state (or is nationwide).
// Normalises both the incoming state value and each entry in states_eligible to
// two-letter codes before comparing, so 'Pennsylvania' == 'PA' works correctly.
export function isAvailableInState(grant, state) {
  if (!state) return true
  const stateCode = getStateCode(state)
  const states = grant.states_eligible ?? []
  if (states.length === 0) return true
  return states.some(s => {
    const lower = s.toLowerCase()
    if (lower === 'all states' || lower === 'nationwide') return true
    return getStateCode(s) === stateCode
  })
}

/**
 * Returns true if the grant's dollar amount falls within the selected filter bucket.
 * Specific range filters (under_10k, 10k_50k, etc.) only match grants that have
 * amount data — grants with no amount data are excluded from range filters.
 * Use 'no_amount' to show only grants with unspecified amounts.
 */
export function matchesAmountFilter(grant, filter) {
  if (filter === 'all') return true
  const { amount_min: min, amount_max: max } = grant
  if (filter === 'no_amount') return min == null && max == null
  // Range filters: grants without amount data do NOT appear (they belong in 'no_amount')
  if (min == null && max == null) return false
  const value = max ?? min
  switch (filter) {
    case 'under_10k':  return value < 10_000
    case '10k_50k':    return value >= 10_000 && value <= 50_000
    case '50k_100k':   return value > 50_000  && value <= 100_000
    case '100k_500k':  return value > 100_000 && value <= 500_000
    case 'over_500k':  return value > 500_000
    default:           return true
  }
}
