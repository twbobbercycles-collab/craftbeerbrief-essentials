// Shared helpers and constants for the Compliance Calendar module.

export const CATEGORIES = [
  'License Renewal',
  'Tax Filing',
  'Reporting Requirement',
  'Federal Deadline',
  'Optional/Recommended',
  'Other',
]

// Tailwind color classes + explicit hex colors keyed by category name.
// dotColor is used for inline styles so dot colors render even if Tailwind's
// class scanner misses string-literal class names inside utility objects.
export const CATEGORY_COLORS = {
  'License Renewal':       { dot: 'bg-red-500',    dotColor: '#ef4444', badge: 'bg-red-100 text-red-700'       },
  'Tax Filing':            { dot: 'bg-orange-500', dotColor: '#f97316', badge: 'bg-orange-100 text-orange-700'  },
  'Reporting Requirement': { dot: 'bg-yellow-500', dotColor: '#eab308', badge: 'bg-yellow-100 text-yellow-700'  },
  'Federal Deadline':      { dot: 'bg-blue-500',   dotColor: '#3b82f6', badge: 'bg-blue-100 text-blue-700'      },
  'Optional/Recommended':  { dot: 'bg-green-500',  dotColor: '#22c55e', badge: 'bg-green-100 text-green-700'    },
  'Other':                 { dot: 'bg-gray-400',   dotColor: '#9ca3af', badge: 'bg-gray-100 text-gray-600'      },
}

// Custom (user-added) deadlines always render in purple
export const CUSTOM_COLOR = { dot: 'bg-purple-500', dotColor: '#a855f7', badge: 'bg-purple-100 text-purple-700' }

// Returns the color object for a brewery_deadlines row
export function getDeadlineColor(deadline) {
  if (deadline.is_custom) return CUSTOM_COLOR
  const cat = deadline.category ?? deadline.compliance_deadlines?.category
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Other']
}

// Returns the human-readable category string for a deadline row
export function getDeadlineCategory(deadline) {
  return deadline.category ?? deadline.compliance_deadlines?.category ?? 'Other'
}

// Returns the deadline name, preferring the local override for custom rows
export function getDeadlineName(deadline) {
  return deadline.deadline_name ?? deadline.compliance_deadlines?.deadline_name ?? 'Unnamed Deadline'
}

// Returns the description, falling back to the master template's description
export function getDeadlineDescription(deadline) {
  return deadline.description ?? deadline.compliance_deadlines?.description ?? ''
}

// Normalizes any date value to a plain YYYY-MM-DD local string.
// Guards against two problems:
//   1. Supabase returning ISO timestamps ('2026-05-15T00:00:00+00:00') — slicing
//      the UTC string directly would give the wrong local date in negative-UTC-offset
//      timezones, so we parse and re-format using local year/month/day.
//   2. Completely blank / null values — returns null so callers can skip them.
export function normalizeDateStr(raw) {
  if (!raw) return null
  // Already a plain 10-char date string — use it directly, no parsing needed
  if (typeof raw === 'string' && raw.length === 10 && raw[4] === '-') return raw
  // Parse as a Date and extract LOCAL year/month/day to avoid UTC offset issues
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Returns the effective due date string (custom_date overrides the template date).
// Always normalizes to YYYY-MM-DD local time so calendar date comparisons are correct.
export function getDueDate(deadline) {
  const raw = deadline.custom_date ?? deadline.compliance_deadlines?.deadline_date ?? null
  return normalizeDateStr(raw)
}

// Returns the number of days until (positive) or since (negative) the due date
export function daysUntilDue(dueDateStr) {
  if (!dueDateStr) return null
  const due   = new Date(dueDateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((due - today) / 86400000)
}

// Returns a CSS class and text label for the days-remaining indicator
export function getDaysBadge(days) {
  if (days === null) return { cls: 'text-gray-400',                label: '—'                          }
  if (days < 0)      return { cls: 'text-danger font-semibold',    label: `${Math.abs(days)}d overdue`  }
  if (days === 0)    return { cls: 'text-danger font-semibold',    label: 'Today'                       }
  if (days <= 7)     return { cls: 'text-danger font-semibold',    label: `${days}d`                    }
  if (days <= 30)    return { cls: 'text-warning font-medium',     label: `${days}d`                    }
  return               { cls: 'text-success',                    label: `${days}d`                    }
}

// Formats a YYYY-MM-DD string for display (e.g. "Apr 15, 2026")
export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Returns a YYYY-MM string for a Date object (used for localStorage and grouping)
export function toYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Returns a YYYY-MM-DD string for a Date object
export function toISODate(date) {
  return date.toISOString().split('T')[0]
}
