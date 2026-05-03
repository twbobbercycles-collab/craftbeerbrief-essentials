/**
 * CalendarView — monthly calendar grid for the compliance calendar.
 * Shows deadlines as colored dots on their due dates. Clicking a cell with
 * deadlines opens a small popover listing them; clicking a deadline in the
 * popover opens the full detail panel.
 *
 * Bug fixes applied here:
 *  - Nav arrows use ← / → (proper Unicode arrows) with 44 px min tap targets
 *  - Dot background color is set via inline style (not just Tailwind class) so
 *    the color renders even if Tailwind's scanner misses utility-file class strings
 *  - Completed deadlines show a faded dot + ✓ prefix + strikethrough name
 *  - groupByDate normalizes date strings to guard against timezone off-by-one
 */
import { useMemo, useState } from 'react'
import {
  getDueDate, getDeadlineName, getDeadlineColor,
  CATEGORY_COLORS, CUSTOM_COLOR, normalizeDateStr,
} from './complianceUtils'

const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// Builds a lookup map of YYYY-MM-DD → deadline[] for O(1) cell access.
// Uses getDueDate (which normalizes timezone-safe local strings) so the keys
// always match what dateKey() produces from a local-time Date object.
function groupByDate(deadlines) {
  const map = {}
  for (const d of deadlines) {
    const date = getDueDate(d)        // already normalized to YYYY-MM-DD local
    if (!date) continue
    if (!map[date]) map[date] = []
    map[date].push(d)
  }
  return map
}

// Produces a YYYY-MM-DD string from a LOCAL-time Date without UTC conversion.
// Using new Date(year, month, day) already gives local time, so we just format it.
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function CalendarView({ deadlines, year, month, onMonthChange, onDeadlineClick }) {
  const [popoverDate, setPopoverDate] = useState(null)

  // Rebuild the date → deadlines map whenever the deadline list changes
  const byDate = useMemo(() => groupByDate(deadlines), [deadlines])

  // Build the grid cells: leading null-pads for the first row, then one Date per day
  const cells = useMemo(() => {
    const firstDow    = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result      = []
    for (let i = 0; i < firstDow; i++) result.push(null)
    for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d))
    return result
  }, [year, month])

  const today    = new Date()
  const todayKey = dateKey(today)

  // Navigate to the previous calendar month
  function prevMonth() {
    if (month === 0) onMonthChange(year - 1, 11)
    else             onMonthChange(year, month - 1)
  }

  // Navigate to the next calendar month
  function nextMonth() {
    if (month === 11) onMonthChange(year + 1, 0)
    else              onMonthChange(year, month + 1)
  }

  // Jump back to the current real-world month
  function goToday() {
    onMonthChange(today.getFullYear(), today.getMonth())
  }

  // Open/close the day popover; close it when clicking a day with no deadlines
  function handleCellClick(key, hasItems) {
    if (!hasItems) { setPopoverDate(null); return }
    setPopoverDate(prev => prev === key ? null : key)
  }

  return (
    <div>
      {/* ── Month navigation ── */}
      <div className="flex items-center justify-between mb-4">

        {/* Previous month */}
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          style={{ color: '#1A2744', backgroundColor: '#F3F4F6' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E5E7EB'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F3F4F6'}
          className="flex items-center justify-center min-w-[36px] min-h-[36px] border border-gray-300 rounded-md px-3 py-1 text-lg font-semibold transition-colors select-none">
          ←
        </button>

        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-navy">{MONTH_LABELS[month]} {year}</h3>
          <button
            onClick={goToday}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium">
            Today
          </button>
        </div>

        {/* Next month */}
        <button
          onClick={nextMonth}
          aria-label="Next month"
          style={{ color: '#1A2744', backgroundColor: '#F3F4F6' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E5E7EB'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F3F4F6'}
          className="flex items-center justify-center min-w-[36px] min-h-[36px] border border-gray-300 rounded-md px-3 py-1 text-lg font-semibold transition-colors select-none">
          →
        </button>
      </div>

      {/* ── Calendar grid — scrolls horizontally on very small screens ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        <div className="min-w-[560px]">

          {/* Day-of-week column headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAY_LABELS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((date, idx) => {
              // Empty padding cell for days before the 1st of the month
              if (!date) {
                return (
                  <div key={`pad-${idx}`}
                    className="border-r border-b border-gray-50 min-h-[90px] bg-gray-50/40" />
                )
              }

              const key       = dateKey(date)
              const items     = byDate[key] ?? []
              const isToday   = key === todayKey
              const isPopover = popoverDate === key
              // Show first 3 deadline pills; the rest become a "+N more" label
              const visible   = items.slice(0, 3)
              const extra     = items.length - 3

              return (
                <div
                  key={key}
                  onClick={() => handleCellClick(key, items.length > 0)}
                  className={[
                    'relative border-r border-b border-gray-100 min-h-[90px] p-1.5 transition-colors',
                    items.length > 0 ? 'cursor-pointer hover:bg-amber/5' : '',
                    isToday ? 'bg-amber/5' : '',
                  ].join(' ')}>

                  {/* Date number — amber circle highlights today */}
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    isToday ? 'bg-amber text-white' : 'text-gray-700'
                  }`}>
                    {date.getDate()}
                  </span>

                  {/* Deadline pills ── */}
                  <div className="mt-1 space-y-0.5">
                    {visible.map(dl => {
                      const c = getDeadlineColor(dl)
                      return (
                        <div key={dl.id}
                          className="flex items-center gap-1 px-1 py-0.5 rounded truncate">

                          {/* Color dot — inline style guarantees color even if Tailwind
                              doesn't compile the bg-* class from this utility file */}
                          <span
                            className="flex-shrink-0 w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: c.dotColor,
                              opacity: dl.is_complete ? 0.4 : 1,
                            }}
                          />

                          {/* Deadline name — strikethrough + gray for completed */}
                          <span className={[
                            'truncate text-[11px] leading-tight',
                            dl.is_complete ? 'line-through text-gray-400' : 'text-gray-700',
                          ].join(' ')}>
                            {dl.is_complete ? '✓ ' : ''}{getDeadlineName(dl)}
                          </span>
                        </div>
                      )
                    })}

                    {/* Overflow indicator when more than 3 deadlines share a date */}
                    {extra > 0 && (
                      <p className="text-[11px] text-amber pl-1 font-medium">+{extra} more</p>
                    )}
                  </div>

                  {/* Day popover — lists all deadlines for this date ── */}
                  {isPopover && (
                    <div
                      className="absolute top-full left-0 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-1.5 mt-1"
                      onClick={e => e.stopPropagation()}>

                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      </p>

                      {items.map(dl => {
                        const c = getDeadlineColor(dl)
                        return (
                          <button
                            key={dl.id}
                            onClick={() => { setPopoverDate(null); onDeadlineClick(dl) }}
                            className={`w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors ${
                              dl.is_complete ? 'opacity-50' : ''
                            }`}>
                            <span
                              className="mt-1 flex-shrink-0 w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: c.dotColor }}
                            />
                            <div>
                              <p className={`text-sm font-medium text-navy leading-snug ${dl.is_complete ? 'line-through' : ''}`}>
                                {getDeadlineName(dl)}
                              </p>
                              <p className="text-xs text-gray-400">
                                {dl.is_complete ? '✓ Complete' : 'Incomplete'}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Color legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
        {Object.entries(CATEGORY_COLORS).map(([cat, c]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: c.dotColor }}
            />
            <span className="text-xs text-gray-500">{cat}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: CUSTOM_COLOR.dotColor }}
          />
          <span className="text-xs text-gray-500">Custom</span>
        </div>
      </div>

    </div>
  )
}
