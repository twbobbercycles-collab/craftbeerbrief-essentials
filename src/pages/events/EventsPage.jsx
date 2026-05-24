/**
 * EventsPage — Taproom Event Planner & ROI Tracker.
 * Full Suite tier module. Allows breweries to plan events, track attendance,
 * and measure return on investment for every event they host.
 *
 * Layout:
 *   - Summary cards (month stats)
 *   - View toggle: List or Calendar (persisted to localStorage)
 *   - Plan New Event modal (ModalShell + useModalDraft)
 *   - Event Detail modal (Planning and Actuals tabs)
 *   - ROI Analysis section (collapsible, recharts)
 *   - Event Templates modal
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useModalDraft } from '../../hooks/useModalDraft'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import LoadingSpinner from '../../components/LoadingSpinner'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  'Live Music', 'Trivia Night', 'Beer Release', 'Festival', 'Private Party',
  'Fundraiser', 'Beer Dinner', 'Tap Takeover', 'Seasonal Event', 'Other',
]

const STATUS_OPTIONS = ['planned', 'confirmed', 'completed', 'cancelled']

// Label and Tailwind color class for each status badge
const STATUS_STYLES = {
  planned:   { label: 'Planned',   cls: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Confirmed', cls: 'bg-teal-100 text-teal-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
}

// Brand color per event type for calendar blocks and badges
const TYPE_COLORS = {
  'Live Music':     '#C8871A',
  'Trivia Night':   '#3B82F6',
  'Beer Release':   '#10B981',
  'Festival':       '#8B5CF6',
  'Private Party':  '#EC4899',
  'Fundraiser':     '#F59E0B',
  'Beer Dinner':    '#6366F1',
  'Tap Takeover':   '#EF4444',
  'Seasonal Event': '#14B8A6',
  'Other':          '#6B7280',
}

// Shared input and label class strings to match the app's existing form style
const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'
const SECTION_TITLE = 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3'

// Default empty form used when opening Plan New Event with no draft
const EMPTY_EVENT = {
  event_name: '',
  event_type: '',
  event_date: '',
  event_start_time: '',
  event_end_time: '',
  expected_attendance: '',
  ticket_price: '0',
  estimated_beer_revenue: '',
  estimated_food_revenue: '',
  entertainment_cost: '',
  marketing_cost: '',
  staffing_cost: '',
  supplies_cost: '',
  other_costs: '',
  notes: '',
  save_as_template: false,
  template_name: '',
}

// ── Utility helpers ────────────────────────────────────────────────────────────

// Format a YYYY-MM-DD string as "Jan 1, 2025"
function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Format a number as a dollar amount with no decimal places
function fmtMoney(n) {
  if (n == null || n === '' || isNaN(n)) return '—'
  const abs = Math.abs(Number(n))
  const sign = Number(n) < 0 ? '-' : ''
  return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Safely parse a form string value into a number, returning 0 on failure
function parseNum(v) {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// Calculate the total actual (or estimated) revenue from a saved event record
function totalRevenue(ev) {
  const beer = parseNum(ev.actual_beer_revenue) || parseNum(ev.estimated_beer_revenue)
  const food = parseNum(ev.actual_food_revenue) || parseNum(ev.estimated_food_revenue)
  return parseNum(ev.ticket_revenue) + beer + food + parseNum(ev.other_revenue)
}

// Calculate total costs from a saved event record
function totalCosts(ev) {
  return parseNum(ev.entertainment_cost) + parseNum(ev.marketing_cost) +
    parseNum(ev.staffing_cost) + parseNum(ev.supplies_cost) + parseNum(ev.other_costs)
}

// Calculate estimated revenue from new-event form fields (ticket price × attendance + beer + food)
function estimatedRevenue(form) {
  return (parseNum(form.ticket_price) * parseNum(form.expected_attendance)) +
    parseNum(form.estimated_beer_revenue) + parseNum(form.estimated_food_revenue)
}

// Calculate estimated costs from new-event form fields
function estimatedCosts(form) {
  return parseNum(form.entertainment_cost) + parseNum(form.marketing_cost) +
    parseNum(form.staffing_cost) + parseNum(form.supplies_cost) + parseNum(form.other_costs)
}

// Return ROI as a percentage, or null if costs are zero (would be division by zero)
function roiPct(revenue, costs) {
  if (!costs || costs === 0) return null
  return (revenue - costs) / costs * 100
}

// Return today's date as a YYYY-MM-DD string
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── Page root — TierGate wrapper ───────────────────────────────────────────────

export default function EventsPage() {
  return (
    <TierGate
      requiredTier="full_suite"
      featureKey="taproom_event_planner"
      featureName="Taproom Event Planner"
      featureDescription="Plan events, track attendance, and measure ROI. Know exactly which events drive revenue and which ones to repeat — or skip."
    >
      <EventPlanner />
    </TierGate>
  )
}

// ── EventPlanner — main state and UI orchestration ────────────────────────────

function EventPlanner() {
  const { brewery } = useAuth()

  // View preference: 'list' or 'calendar', persisted to localStorage
  const [view, setView] = usePersistedTab('events_view_preference', 'list')

  // Raw data from Supabase
  const [events, setEvents]       = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)

  // Modal visibility state
  const [newOpen, setNewOpen]           = useState(false)
  const [detailEvent, setDetailEvent]   = useState(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  // Calendar navigation: which year + month is displayed
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  // ROI analysis panel is collapsed by default
  const [roiOpen, setRoiOpen] = useState(false)

  // New event form state and error
  const [form, setForm]         = useState(EMPTY_EVENT)
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')

  // Draft persistence for Plan New Event modal
  const draft = useModalDraft('modal_draft_taproom_event')

  // Load all events and templates for this brewery from Supabase
  const loadAll = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [evRes, tmRes] = await Promise.all([
      supabase.from('taproom_events')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('event_date', { ascending: false }),
      supabase.from('taproom_event_templates')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('template_name'),
    ])
    setEvents(evRes.data ?? [])
    setTemplates(tmRes.data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  // Open the Plan New Event modal, restoring any saved draft
  function openNew() {
    const restored = draft.loadDraft()
    setForm(restored || EMPTY_EVENT)
    setSelectedTemplate('')
    setFormError('')
    setNewOpen(true)
  }

  // Apply a saved template to the current form, pre-populating shared fields
  function applyTemplate(templateId) {
    setSelectedTemplate(templateId)
    const tmpl = templates.find(t => t.id === templateId)
    if (!tmpl) return
    setForm(prev => ({
      ...prev,
      event_type:          tmpl.event_type || '',
      event_start_time:    tmpl.typical_start_time || '',
      expected_attendance: tmpl.typical_attendance?.toString() || '',
      ticket_price:        tmpl.typical_ticket_price?.toString() || '0',
      entertainment_cost:  tmpl.typical_entertainment_cost?.toString() || '',
      marketing_cost:      tmpl.typical_marketing_cost?.toString() || '',
      staffing_cost:       tmpl.typical_staffing_cost?.toString() || '',
    }))
  }

  // Update a single form field and immediately save the draft to sessionStorage
  function setField(key, value) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      draft.saveDraft(next)
      return next
    })
  }

  // Save a new event (and optionally a template) to Supabase
  async function handleSave() {
    setFormError('')
    if (!form.event_name.trim()) { setFormError('Event name is required.'); return }
    if (!form.event_date)        { setFormError('Event date is required.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('taproom_events').insert({
        brewery_id:              brewery.id,
        event_name:              form.event_name.trim(),
        event_type:              form.event_type || null,
        event_date:              form.event_date,
        event_start_time:        form.event_start_time || null,
        event_end_time:          form.event_end_time || null,
        status:                  'planned',
        expected_attendance:     parseNum(form.expected_attendance) || null,
        ticket_price:            parseNum(form.ticket_price),
        ticket_revenue:          parseNum(form.ticket_price) * parseNum(form.expected_attendance),
        estimated_beer_revenue:  parseNum(form.estimated_beer_revenue),
        estimated_food_revenue:  parseNum(form.estimated_food_revenue),
        entertainment_cost:      parseNum(form.entertainment_cost),
        marketing_cost:          parseNum(form.marketing_cost),
        staffing_cost:           parseNum(form.staffing_cost),
        supplies_cost:           parseNum(form.supplies_cost),
        other_costs:             parseNum(form.other_costs),
        notes:                   form.notes || null,
        updated_at:              new Date().toISOString(),
      })
      if (error) throw error

      // Optionally save the event's settings as a reusable template
      if (form.save_as_template && form.template_name.trim()) {
        await supabase.from('taproom_event_templates').insert({
          brewery_id:                 brewery.id,
          template_name:              form.template_name.trim(),
          event_type:                 form.event_type || null,
          typical_start_time:         form.event_start_time || null,
          typical_attendance:         parseNum(form.expected_attendance) || null,
          typical_ticket_price:       parseNum(form.ticket_price),
          typical_entertainment_cost: parseNum(form.entertainment_cost),
          typical_marketing_cost:     parseNum(form.marketing_cost),
          typical_staffing_cost:      parseNum(form.staffing_cost),
          updated_at:                 new Date().toISOString(),
        })
      }

      draft.clearDraft()
      setNewOpen(false)
      await loadAll()
    } catch (err) {
      setFormError(err.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // Duplicate an event as a new planned event with today's date
  async function handleDuplicate(ev) {
    const { id, created_at, updated_at, actual_attendance, actual_beer_revenue,
            actual_food_revenue, other_revenue, tickets_sold, lessons_learned,
            would_repeat, rating, ...rest } = ev
    await supabase.from('taproom_events').insert({
      ...rest,
      event_name: ev.event_name + ' (Copy)',
      status:     'planned',
      event_date: todayStr(),
      updated_at: new Date().toISOString(),
    })
    await loadAll()
  }

  // Mark an event as cancelled
  async function handleCancel(ev) {
    await supabase.from('taproom_events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ev.id)
    await loadAll()
    // If the cancelled event is open in the detail modal, update it there too
    if (detailEvent?.id === ev.id) setDetailEvent(prev => prev ? { ...prev, status: 'cancelled' } : prev)
  }

  // Save edits to an event (planning or actuals) from the detail modal
  async function handleDetailSave(eventId, patch) {
    await supabase.from('taproom_events')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', eventId)
    await loadAll()
    setDetailEvent(prev => prev ? { ...prev, ...patch } : prev)
  }

  // Delete a template from the templates manager
  async function handleDeleteTemplate(id) {
    await supabase.from('taproom_event_templates').delete().eq('id', id)
    await loadAll()
  }

  // ── Derived summary stats for the four header cards ──

  const today     = todayStr()
  const monthKey  = today.slice(0, 7) // 'YYYY-MM'

  const thisMonthEvents = useMemo(() =>
    events.filter(ev => ev.event_date.startsWith(monthKey)),
    [events, monthKey]
  )
  const completedEvents = useMemo(() =>
    events.filter(ev => ev.status === 'completed'),
    [events]
  )
  const avgRoi = useMemo(() => {
    const withCosts = completedEvents.filter(ev => totalCosts(ev) > 0)
    if (!withCosts.length) return null
    return withCosts.reduce((sum, ev) => sum + roiPct(totalRevenue(ev), totalCosts(ev)), 0) / withCosts.length
  }, [completedEvents])
  const monthRevenue = useMemo(() =>
    thisMonthEvents.reduce((s, ev) => s + totalRevenue(ev), 0),
    [thisMonthEvents]
  )
  const avgAttendance = useMemo(() => {
    const withAtt = thisMonthEvents.filter(ev => ev.actual_attendance > 0 || ev.expected_attendance > 0)
    if (!withAtt.length) return null
    return Math.round(withAtt.reduce((s, ev) => s + (ev.actual_attendance || ev.expected_attendance || 0), 0) / withAtt.length)
  }, [thisMonthEvents])

  // Show the draft notice bar when a draft exists but the modal is closed
  const showDraftNotice = draft.hasDraft && !newOpen

  return (
    <div className="max-w-[1100px] mx-auto pb-10">

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">Taproom Event Planner</h2>
          <p className="text-sm text-gray-500 mt-1">
            Plan events, track attendance, and measure ROI for every event you host.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTemplatesOpen(true)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Event Templates
          </button>
          <button
            onClick={openNew}
            className="px-4 py-2 text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg transition-colors"
          >
            + Plan New Event
          </button>
        </div>
      </div>

      {/* Draft notice bar — shown when a draft exists but the modal is not open */}
      {showDraftNotice && (
        <div className="mb-4">
          <DraftNoticeBar
            onContinue={openNew}
            onDiscard={() => { draft.clearDraft(); draft.dismissDraftBanner() }}
          />
        </div>
      )}

      {/* Summary cards — 2×2 on mobile, 4 across on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon="📅" label="Events This Month" value={thisMonthEvents.length} />
        <SummaryCard icon="👥" label="Avg Attendance"    value={avgAttendance != null ? avgAttendance : '—'} />
        <SummaryCard icon="💰" label="Revenue This Month" value={monthRevenue > 0 ? fmtMoney(monthRevenue) : '—'} />
        <SummaryCard icon="📈" label="Avg ROI %" value={avgRoi != null ? `${avgRoi.toFixed(0)}%` : '—'} sub="completed events" />
      </div>

      {/* View toggle — list / calendar */}
      <div className="flex items-center gap-2 mb-4">
        {[['list', 'List View'], ['calendar', 'Calendar View']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              view === key
                ? 'bg-navy text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main content — list or calendar */}
      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : view === 'list' ? (
        <EventListView
          events={events}
          onView={setDetailEvent}
          onDuplicate={handleDuplicate}
          onCancel={handleCancel}
        />
      ) : (
        <CalendarView
          events={events}
          calMonth={calMonth}
          onMonthChange={setCalMonth}
          onView={setDetailEvent}
        />
      )}

      {/* ROI Analysis — collapsible, only shown when there are completed events */}
      {!loading && completedEvents.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200">
          <button
            onClick={() => setRoiOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
          >
            <div>
              <p className="font-semibold text-navy text-sm">ROI Analysis</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Performance breakdown across all {completedEvents.length} completed event{completedEvents.length !== 1 ? 's' : ''}
              </p>
            </div>
            <span
              className="text-gray-400 text-lg"
              style={{ transform: roiOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}
            >
              ▾
            </span>
          </button>
          {roiOpen && <RoiAnalysis events={completedEvents} />}
        </div>
      )}

      {/* Plan New Event modal */}
      {newOpen && (
        <PlanEventModal
          form={form}
          setField={setField}
          formError={formError}
          saving={saving}
          templates={templates}
          selectedTemplate={selectedTemplate}
          onApplyTemplate={applyTemplate}
          onSave={handleSave}
          onClose={() => { draft.saveDraft(form); setNewOpen(false) }}
          draft={draft}
        />
      )}

      {/* Event detail modal */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onSave={handleDetailSave}
          onCancel={handleCancel}
          onDuplicate={handleDuplicate}
        />
      )}

      {/* Template manager modal */}
      {templatesOpen && (
        <TemplatesModal
          templates={templates}
          onClose={() => setTemplatesOpen(false)}
          onDelete={handleDeleteTemplate}
          onPlanFromTemplate={(tmpl) => {
            setTemplatesOpen(false)
            applyTemplate(tmpl.id)
            setForm(prev => ({ ...EMPTY_EVENT, ...prev }))
            setFormError('')
            setNewOpen(true)
          }}
        />
      )}
    </div>
  )
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-navy">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── EventListView ─────────────────────────────────────────────────────────────

function EventListView({ events, onView, onDuplicate, onCancel }) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
        <p className="text-3xl mb-3">🎪</p>
        <p className="text-sm font-medium text-navy">No events yet</p>
        <p className="text-xs text-gray-500 mt-1">Click Plan New Event to schedule your first event.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Attendance</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Revenue</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Costs</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Net ROI</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">ROI %</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {events.map(ev => {
              const rev    = totalRevenue(ev)
              const costs  = totalCosts(ev)
              const net    = rev - costs
              const roi    = roiPct(rev, costs)
              const status = STATUS_STYLES[ev.status] ?? STATUS_STYLES.planned
              const typeColor = TYPE_COLORS[ev.event_type] || '#6b7280'
              return (
                <tr key={ev.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy">{ev.event_name}</p>
                    {ev.event_type && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: typeColor + '22', color: typeColor }}
                      >
                        {ev.event_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(ev.event_date)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-gray-600">
                    {ev.actual_attendance
                      ? `${ev.actual_attendance} / ${ev.expected_attendance || '?'}`
                      : ev.expected_attendance ? `Est. ${ev.expected_attendance}` : '—'
                    }
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-gray-600">{rev > 0 ? fmtMoney(rev) : '—'}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-600">{costs > 0 ? fmtMoney(costs) : '—'}</td>
                  <td className={`px-4 py-3 text-right hidden lg:table-cell font-medium ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {costs > 0 || rev > 0 ? fmtMoney(net) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right hidden lg:table-cell font-semibold ${roi != null && roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {roi != null ? `${roi.toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => onView(ev)} className="text-amber text-xs hover:underline whitespace-nowrap">View</button>
                      <button onClick={() => onDuplicate(ev)} className="text-gray-400 text-xs hover:text-gray-600 whitespace-nowrap">Dupe</button>
                      {ev.status !== 'cancelled' && ev.status !== 'completed' && (
                        <button onClick={() => onCancel(ev)} className="text-red-400 text-xs hover:text-red-600 whitespace-nowrap">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── CalendarView ──────────────────────────────────────────────────────────────

function CalendarView({ events, calMonth, onMonthChange, onView }) {
  const { year, month } = calMonth

  // Build the grid: offset cells for the previous month, then current month days, then padding
  const firstWeekday  = new Date(year, month, 1).getDay()     // 0 = Sunday
  const daysInMonth   = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const cells = []
  // Fill leading cells with days from the previous month
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ day: prevMonthDays - firstWeekday + 1 + i, currentMonth: false })
  }
  // Fill current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true })
  }
  // Pad trailing cells to complete the final row
  let pad = 1
  while (cells.length % 7 !== 0) {
    cells.push({ day: pad++, currentMonth: false })
  }

  // Group events by day number for O(1) lookup during render
  const eventsByDay = {}
  events.forEach(ev => {
    const [y, m, d] = ev.event_date.split('-').map(Number)
    if (y === year && m - 1 === month) {
      if (!eventsByDay[d]) eventsByDay[d] = []
      eventsByDay[d].push(ev)
    }
  })

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]

  function prevMonth() {
    onMonthChange(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })
  }
  function nextMonth() {
    onMonthChange(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })
  }

  const now = new Date()

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Month navigation header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="font-semibold text-navy text-sm">{monthNames[month]} {year}</h3>
        <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-2 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const evs     = cell.currentMonth ? (eventsByDay[cell.day] || []) : []
          const isToday = cell.currentMonth &&
            now.getDate() === cell.day &&
            now.getMonth() === month &&
            now.getFullYear() === year
          return (
            <div
              key={i}
              className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 ${!cell.currentMonth ? 'bg-gray-50/60' : ''}`}
            >
              <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                isToday ? 'bg-amber text-white' : cell.currentMonth ? 'text-gray-700' : 'text-gray-300'
              }`}>
                {cell.day}
              </span>
              {evs.slice(0, 3).map(ev => {
                const color = TYPE_COLORS[ev.event_type] || '#6b7280'
                return (
                  <button
                    key={ev.id}
                    onClick={() => onView(ev)}
                    className="block w-full text-left text-[10px] font-medium px-1 py-0.5 rounded mb-0.5 truncate"
                    style={{ background: color + '22', color }}
                  >
                    {ev.event_name}
                  </button>
                )
              })}
              {evs.length > 3 && (
                <p className="text-[9px] text-gray-400 px-1">+{evs.length - 3} more</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PlanEventModal ────────────────────────────────────────────────────────────

function PlanEventModal({ form, setField, formError, saving, templates, selectedTemplate, onApplyTemplate, onSave, onClose, draft }) {
  const estRev   = estimatedRevenue(form)
  const estCosts = estimatedCosts(form)
  const estNet   = estRev - estCosts
  const estRoi   = roiPct(estRev, estCosts)
  const isDirty  = JSON.stringify(form) !== JSON.stringify(EMPTY_EVENT)

  return (
    <ModalShell
      isOpen={true}
      onClose={onClose}
      isDirty={isDirty}
      title="Plan New Event"
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <div className="p-5 space-y-5">

        {formError && (
          <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-2.5 text-sm">{formError}</div>
        )}

        {/* Start from a saved template */}
        {templates.length > 0 && (
          <div>
            <label className={LBL}>Start from a template (optional)</label>
            <select
              className={INPUT_CLS}
              value={selectedTemplate}
              onChange={e => onApplyTemplate(e.target.value)}
            >
              <option value="">— No template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.template_name}</option>)}
            </select>
          </div>
        )}

        {/* Core event details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={LBL}>Event Name *</label>
            <input
              className={INPUT_CLS}
              value={form.event_name}
              onChange={e => setField('event_name', e.target.value)}
              placeholder="e.g. Friday Night Live Music"
            />
          </div>
          <div>
            <label className={LBL}>Event Type</label>
            <select className={INPUT_CLS} value={form.event_type} onChange={e => setField('event_type', e.target.value)}>
              <option value="">— Select type —</option>
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Event Date *</label>
            <input type="date" className={INPUT_CLS} value={form.event_date} onChange={e => setField('event_date', e.target.value)} />
          </div>
          <div>
            <label className={LBL}>Start Time</label>
            <input type="time" className={INPUT_CLS} value={form.event_start_time} onChange={e => setField('event_start_time', e.target.value)} />
          </div>
          <div>
            <label className={LBL}>End Time</label>
            <input type="time" className={INPUT_CLS} value={form.event_end_time} onChange={e => setField('event_end_time', e.target.value)} />
          </div>
          <div>
            <label className={LBL}>Expected Attendance</label>
            <input type="number" min="0" className={INPUT_CLS} value={form.expected_attendance} onChange={e => setField('expected_attendance', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={LBL}>Ticket Price ($) — 0 for free events</label>
            <input type="number" min="0" step="0.01" className={INPUT_CLS} value={form.ticket_price} onChange={e => setField('ticket_price', e.target.value)} placeholder="0" />
          </div>
        </div>

        {/* Revenue estimates */}
        <div>
          <p className={SECTION_TITLE}>Estimated Revenue</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Beer Revenue ($)</label>
              <input type="number" min="0" step="0.01" className={INPUT_CLS} value={form.estimated_beer_revenue} onChange={e => setField('estimated_beer_revenue', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={LBL}>Food Revenue ($)</label>
              <input type="number" min="0" step="0.01" className={INPUT_CLS} value={form.estimated_food_revenue} onChange={e => setField('estimated_food_revenue', e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        {/* Cost estimates */}
        <div>
          <p className={SECTION_TITLE}>Estimated Costs</p>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['entertainment_cost', 'Entertainment ($)'],
              ['marketing_cost',     'Marketing ($)'],
              ['staffing_cost',      'Staffing ($)'],
              ['supplies_cost',      'Supplies ($)'],
              ['other_costs',        'Other Costs ($)'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className={LBL}>{label}</label>
                <input
                  type="number" min="0" step="0.01"
                  className={INPUT_CLS}
                  value={form[key]}
                  onChange={e => setField(key, e.target.value)}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Live ROI preview — shown as soon as any revenue or cost is entered */}
        {(estRev > 0 || estCosts > 0) && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className={SECTION_TITLE}>ROI Preview</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-gray-500">Est. Revenue</p>
                <p className="font-semibold text-navy text-sm">{fmtMoney(estRev)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Est. Costs</p>
                <p className="font-semibold text-navy text-sm">{fmtMoney(estCosts)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Est. Net ROI</p>
                <p className={`font-semibold text-sm ${estNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(estNet)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Est. ROI %</p>
                <p className={`font-semibold text-sm ${estRoi != null && estRoi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {estRoi != null ? `${estRoi.toFixed(0)}%` : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className={LBL}>Notes</label>
          <textarea
            rows={2}
            className={INPUT_CLS}
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            placeholder="Anything to know before the event..."
          />
        </div>

        {/* Save as template toggle */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.save_as_template}
              onChange={e => setField('save_as_template', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Save as a reusable event template</span>
          </label>
          {form.save_as_template && (
            <div className="mt-2">
              <label className={LBL}>Template Name</label>
              <input
                className={INPUT_CLS}
                value={form.template_name}
                onChange={e => setField('template_name', e.target.value)}
                placeholder="e.g. Standard Friday Trivia Night"
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer buttons */}
      <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Event'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── EventDetailModal ──────────────────────────────────────────────────────────

function EventDetailModal({ event: initialEvent, onClose, onSave, onCancel, onDuplicate }) {
  // Local editable copies of planning and actuals fields
  const [planForm, setPlanForm] = useState({
    event_name:             initialEvent.event_name || '',
    event_type:             initialEvent.event_type || '',
    event_date:             initialEvent.event_date || '',
    event_start_time:       initialEvent.event_start_time || '',
    event_end_time:         initialEvent.event_end_time || '',
    expected_attendance:    initialEvent.expected_attendance?.toString() || '',
    ticket_price:           initialEvent.ticket_price?.toString() || '0',
    estimated_beer_revenue: initialEvent.estimated_beer_revenue?.toString() || '',
    estimated_food_revenue: initialEvent.estimated_food_revenue?.toString() || '',
    entertainment_cost:     initialEvent.entertainment_cost?.toString() || '',
    marketing_cost:         initialEvent.marketing_cost?.toString() || '',
    staffing_cost:          initialEvent.staffing_cost?.toString() || '',
    supplies_cost:          initialEvent.supplies_cost?.toString() || '',
    other_costs:            initialEvent.other_costs?.toString() || '',
    notes:                  initialEvent.notes || '',
    status:                 initialEvent.status || 'planned',
  })

  const [actForm, setActForm] = useState({
    actual_attendance:   initialEvent.actual_attendance?.toString() || '',
    tickets_sold:        initialEvent.tickets_sold?.toString() || '',
    ticket_revenue:      initialEvent.ticket_revenue?.toString() || '',
    actual_beer_revenue: initialEvent.actual_beer_revenue?.toString() || '',
    actual_food_revenue: initialEvent.actual_food_revenue?.toString() || '',
    other_revenue:       initialEvent.other_revenue?.toString() || '',
    entertainment_cost:  initialEvent.entertainment_cost?.toString() || '',
    marketing_cost:      initialEvent.marketing_cost?.toString() || '',
    staffing_cost:       initialEvent.staffing_cost?.toString() || '',
    supplies_cost:       initialEvent.supplies_cost?.toString() || '',
    other_costs:         initialEvent.other_costs?.toString() || '',
    lessons_learned:     initialEvent.lessons_learned || '',
    would_repeat:        initialEvent.would_repeat ?? null,
    rating:              initialEvent.rating || 0,
  })

  const [activeTab, setActiveTab] = useState('planning')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')

  // Actuals tab is fully active only after the event date has passed
  const eventIsPast = initialEvent.event_date <= todayStr()

  // ROI numbers derived from the current form values for the projection / comparison panels
  const planRev   = parseNum(planForm.estimated_beer_revenue) + parseNum(planForm.estimated_food_revenue) + (parseNum(planForm.ticket_price) * parseNum(planForm.expected_attendance))
  const planCosts = parseNum(planForm.entertainment_cost) + parseNum(planForm.marketing_cost) + parseNum(planForm.staffing_cost) + parseNum(planForm.supplies_cost) + parseNum(planForm.other_costs)
  const actRev    = parseNum(actForm.ticket_revenue) + parseNum(actForm.actual_beer_revenue) + parseNum(actForm.actual_food_revenue) + parseNum(actForm.other_revenue)
  const actCosts  = parseNum(actForm.entertainment_cost) + parseNum(actForm.marketing_cost) + parseNum(actForm.staffing_cost) + parseNum(actForm.supplies_cost) + parseNum(actForm.other_costs)

  // Save the planning tab fields back to Supabase
  async function savePlanning() {
    setSaveError('')
    setSaving(true)
    try {
      await onSave(initialEvent.id, {
        event_name:             planForm.event_name.trim(),
        event_type:             planForm.event_type || null,
        event_date:             planForm.event_date,
        event_start_time:       planForm.event_start_time || null,
        event_end_time:         planForm.event_end_time || null,
        expected_attendance:    parseNum(planForm.expected_attendance) || null,
        ticket_price:           parseNum(planForm.ticket_price),
        estimated_beer_revenue: parseNum(planForm.estimated_beer_revenue),
        estimated_food_revenue: parseNum(planForm.estimated_food_revenue),
        entertainment_cost:     parseNum(planForm.entertainment_cost),
        marketing_cost:         parseNum(planForm.marketing_cost),
        staffing_cost:          parseNum(planForm.staffing_cost),
        supplies_cost:          parseNum(planForm.supplies_cost),
        other_costs:            parseNum(planForm.other_costs),
        notes:                  planForm.notes || null,
        status:                 planForm.status,
      })
    } catch (err) {
      setSaveError(err.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // Save the actuals tab fields, marking the event as completed
  async function saveActuals() {
    setSaveError('')
    setSaving(true)
    try {
      await onSave(initialEvent.id, {
        actual_attendance:   parseNum(actForm.actual_attendance) || null,
        tickets_sold:        parseNum(actForm.tickets_sold) || null,
        ticket_revenue:      parseNum(actForm.ticket_revenue),
        actual_beer_revenue: parseNum(actForm.actual_beer_revenue),
        actual_food_revenue: parseNum(actForm.actual_food_revenue),
        other_revenue:       parseNum(actForm.other_revenue),
        entertainment_cost:  parseNum(actForm.entertainment_cost),
        marketing_cost:      parseNum(actForm.marketing_cost),
        staffing_cost:       parseNum(actForm.staffing_cost),
        supplies_cost:       parseNum(actForm.supplies_cost),
        other_costs:         parseNum(actForm.other_costs),
        lessons_learned:     actForm.lessons_learned || null,
        would_repeat:        actForm.would_repeat,
        rating:              actForm.rating || null,
        status:              'completed',
      })
    } catch (err) {
      setSaveError(err.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const status    = STATUS_STYLES[initialEvent.status] ?? STATUS_STYLES.planned
  const typeColor = TYPE_COLORS[initialEvent.event_type] || '#6b7280'

  return (
    <ModalShell isOpen={true} onClose={onClose} isDirty={false} title={initialEvent.event_name} maxWidth="max-w-2xl">

      {/* Status / type / date row with action buttons */}
      <div className="px-5 pb-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
        {initialEvent.event_type && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: typeColor + '22', color: typeColor }}>
            {initialEvent.event_type}
          </span>
        )}
        <span className="text-xs text-gray-500">{fmtDate(initialEvent.event_date)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {initialEvent.status !== 'cancelled' && initialEvent.status !== 'completed' && (
            <button
              onClick={() => setPlanForm(p => ({ ...p, status: 'confirmed' }))}
              className="text-xs px-2 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
            >
              Confirm Event
            </button>
          )}
          {initialEvent.status !== 'cancelled' && initialEvent.status !== 'completed' && (
            <button
              onClick={() => onCancel(initialEvent)}
              className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              Cancel Event
            </button>
          )}
          <button
            onClick={() => onDuplicate(initialEvent)}
            className="text-xs px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Duplicate
          </button>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex border-b border-gray-100">
        {[['planning', 'Planning'], ['actuals', 'Actuals']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key ? 'border-b-2 border-amber text-amber' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {key === 'actuals' && !eventIsPast && (
              <span className="ml-1.5 text-[9px] text-gray-400 font-normal">(after event)</span>
            )}
          </button>
        ))}
      </div>

      {saveError && (
        <div className="mx-5 mt-4 bg-red-50 border border-danger text-danger rounded-lg px-4 py-2.5 text-sm">{saveError}</div>
      )}

      {/* ── Planning tab ── */}
      {activeTab === 'planning' && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={LBL}>Event Name</label>
              <input className={INPUT_CLS} value={planForm.event_name} onChange={e => setPlanForm(p => ({ ...p, event_name: e.target.value }))} />
            </div>
            <div>
              <label className={LBL}>Status</label>
              <select className={INPUT_CLS} value={planForm.status} onChange={e => setPlanForm(p => ({ ...p, status: e.target.value }))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_STYLES[s]?.label || s}</option>)}
              </select>
            </div>
            <div>
              <label className={LBL}>Event Date</label>
              <input type="date" className={INPUT_CLS} value={planForm.event_date} onChange={e => setPlanForm(p => ({ ...p, event_date: e.target.value }))} />
            </div>
            <div>
              <label className={LBL}>Start Time</label>
              <input type="time" className={INPUT_CLS} value={planForm.event_start_time} onChange={e => setPlanForm(p => ({ ...p, event_start_time: e.target.value }))} />
            </div>
            <div>
              <label className={LBL}>End Time</label>
              <input type="time" className={INPUT_CLS} value={planForm.event_end_time} onChange={e => setPlanForm(p => ({ ...p, event_end_time: e.target.value }))} />
            </div>
            <div>
              <label className={LBL}>Expected Attendance</label>
              <input type="number" min="0" className={INPUT_CLS} value={planForm.expected_attendance} onChange={e => setPlanForm(p => ({ ...p, expected_attendance: e.target.value }))} />
            </div>
            <div>
              <label className={LBL}>Ticket Price ($)</label>
              <input type="number" min="0" step="0.01" className={INPUT_CLS} value={planForm.ticket_price} onChange={e => setPlanForm(p => ({ ...p, ticket_price: e.target.value }))} />
            </div>
          </div>

          <p className={SECTION_TITLE}>Revenue Estimates</p>
          <div className="grid grid-cols-2 gap-4">
            {[['estimated_beer_revenue','Beer Revenue ($)'],['estimated_food_revenue','Food Revenue ($)']].map(([k,l]) => (
              <div key={k}>
                <label className={LBL}>{l}</label>
                <input type="number" min="0" step="0.01" className={INPUT_CLS} value={planForm[k]} onChange={e => setPlanForm(p => ({ ...p, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>

          <p className={SECTION_TITLE}>Cost Estimates</p>
          <div className="grid grid-cols-2 gap-4">
            {[['entertainment_cost','Entertainment ($)'],['marketing_cost','Marketing ($)'],['staffing_cost','Staffing ($)'],['supplies_cost','Supplies ($)'],['other_costs','Other Costs ($)']].map(([k,l]) => (
              <div key={k}>
                <label className={LBL}>{l}</label>
                <input type="number" min="0" step="0.01" className={INPUT_CLS} value={planForm[k]} onChange={e => setPlanForm(p => ({ ...p, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>

          {/* ROI projection */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className={SECTION_TITLE}>ROI Projection</p>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[10px] text-gray-500">Est. Revenue</p><p className="font-semibold text-navy text-sm">{fmtMoney(planRev)}</p></div>
              <div><p className="text-[10px] text-gray-500">Est. Costs</p><p className="font-semibold text-navy text-sm">{fmtMoney(planCosts)}</p></div>
              <div>
                <p className="text-[10px] text-gray-500">Net ROI</p>
                <p className={`font-semibold text-sm ${planRev - planCosts >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(planRev - planCosts)}</p>
              </div>
            </div>
          </div>

          <div>
            <label className={LBL}>Notes</label>
            <textarea rows={2} className={INPUT_CLS} value={planForm.notes} onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
            <button onClick={savePlanning} disabled={saving} className="px-5 py-2 text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Actuals tab ── */}
      {activeTab === 'actuals' && (
        <div className="p-5 space-y-4">
          {!eventIsPast && (
            <div className="bg-amber/10 border border-amber/30 rounded-lg px-4 py-3 text-sm text-amber-dark">
              The Actuals tab is fully active after the event date. You can still enter values early if needed.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Actual Attendance</label>
              <input type="number" min="0" className={INPUT_CLS} value={actForm.actual_attendance} onChange={e => setActForm(p => ({ ...p, actual_attendance: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className={LBL}>Tickets Sold</label>
              <input type="number" min="0" className={INPUT_CLS} value={actForm.tickets_sold} onChange={e => setActForm(p => ({ ...p, tickets_sold: e.target.value }))} placeholder="0" />
            </div>
          </div>

          <p className={SECTION_TITLE}>Actual Revenue</p>
          <div className="grid grid-cols-2 gap-4">
            {[['ticket_revenue','Ticket Revenue ($)'],['actual_beer_revenue','Beer Revenue ($)'],['actual_food_revenue','Food Revenue ($)'],['other_revenue','Other Revenue ($)']].map(([k,l]) => (
              <div key={k}>
                <label className={LBL}>{l}</label>
                <input type="number" min="0" step="0.01" className={INPUT_CLS} value={actForm[k]} onChange={e => setActForm(p => ({ ...p, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>

          <p className={SECTION_TITLE}>Actual Costs</p>
          <div className="grid grid-cols-2 gap-4">
            {[['entertainment_cost','Entertainment ($)'],['marketing_cost','Marketing ($)'],['staffing_cost','Staffing ($)'],['supplies_cost','Supplies ($)'],['other_costs','Other Costs ($)']].map(([k,l]) => (
              <div key={k}>
                <label className={LBL}>{l}</label>
                <input type="number" min="0" step="0.01" className={INPUT_CLS} value={actForm[k]} onChange={e => setActForm(p => ({ ...p, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>

          {/* Plan vs Actual comparison — shown once actuals start being entered */}
          {(actRev > 0 || actCosts > 0) && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className={SECTION_TITLE}>Plan vs. Actual</p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm items-center">
                <div />
                <div className="text-[10px] font-semibold text-gray-400 text-center">PLAN</div>
                <div className="text-[10px] font-semibold text-gray-400 text-center">ACTUAL</div>
                {[
                  { label: 'Revenue', plan: planRev,              actual: actRev,              isNet: false },
                  { label: 'Costs',   plan: planCosts,            actual: actCosts,            isNet: false },
                  { label: 'Net ROI', plan: planRev - planCosts,  actual: actRev - actCosts,   isNet: true  },
                ].map(({ label, plan, actual, isNet }) => (
                  <div key={label} className="contents">
                    <div className="text-[11px] text-gray-500">{label}</div>
                    <div className="text-center font-medium text-gray-600 text-xs">{fmtMoney(plan)}</div>
                    <div className={`text-center font-semibold text-xs ${isNet ? (actual >= 0 ? 'text-green-600' : 'text-red-500') : 'text-navy'}`}>{fmtMoney(actual)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Retrospective fields */}
          <div>
            <label className={LBL}>Lessons Learned</label>
            <textarea rows={3} className={INPUT_CLS} value={actForm.lessons_learned} onChange={e => setActForm(p => ({ ...p, lessons_learned: e.target.value }))} placeholder="What worked? What would you change next time?" />
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={actForm.would_repeat === true}
                onChange={e => setActForm(p => ({ ...p, would_repeat: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Would repeat this event</span>
            </label>
            <div>
              <p className={LBL}>Internal Rating</p>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => setActForm(p => ({ ...p, rating: n }))}
                    className={`text-xl transition-colors ${actForm.rating >= n ? 'text-amber' : 'text-gray-300 hover:text-amber/50'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
            <button onClick={saveActuals} disabled={saving} className="px-5 py-2 text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Actuals'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ── RoiAnalysis ───────────────────────────────────────────────────────────────

function RoiAnalysis({ events }) {
  // Group completed events by type and compute per-type averages
  const byType = useMemo(() => {
    const map = {}
    events.forEach(ev => {
      const type = ev.event_type || 'Other'
      if (!map[type]) map[type] = []
      map[type].push(ev)
    })
    return Object.entries(map).map(([type, evs]) => {
      const avgRev  = evs.reduce((s, e) => s + totalRevenue(e), 0) / evs.length
      const avgCost = evs.reduce((s, e) => s + totalCosts(e),   0) / evs.length
      const roi     = roiPct(avgRev, avgCost)
      const best    = evs.reduce((a, b) =>
        (roiPct(totalRevenue(a), totalCosts(a)) ?? -Infinity) > (roiPct(totalRevenue(b), totalCosts(b)) ?? -Infinity) ? a : b
      )
      return { type, count: evs.length, avgRev, avgCost, roi, best }
    }).sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity))
  }, [events])

  // Build monthly revenue + ROI trend for the last 12 months
  const monthlyTrend = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d   = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      const monthEvs = events.filter(ev => ev.event_date.startsWith(key))
      const rev   = monthEvs.reduce((s, e) => s + totalRevenue(e), 0)
      const costs = monthEvs.reduce((s, e) => s + totalCosts(e),   0)
      return {
        label,
        revenue: Math.round(rev),
        roi:     costs > 0 ? Math.round(roiPct(rev, costs)) : null,
        count:   monthEvs.length,
      }
    })
  }, [events])

  // Top 5 events by ROI %
  const topEvents = useMemo(() =>
    [...events]
      .filter(ev => totalCosts(ev) > 0)
      .sort((a, b) => (roiPct(totalRevenue(b), totalCosts(b)) ?? -Infinity) - (roiPct(totalRevenue(a), totalCosts(a)) ?? -Infinity))
      .slice(0, 5),
    [events]
  )

  // Bottom 3 events by ROI % — the ones to reconsider
  const bottomEvents = useMemo(() =>
    [...events]
      .filter(ev => totalCosts(ev) > 0)
      .sort((a, b) => (roiPct(totalRevenue(a), totalCosts(a)) ?? Infinity) - (roiPct(totalRevenue(b), totalCosts(b)) ?? Infinity))
      .slice(0, 3),
    [events]
  )

  return (
    <div className="px-5 pb-6 pt-1 space-y-7 border-t border-gray-100">

      {/* Performance by event type */}
      <div>
        <p className={SECTION_TITLE + ' mt-4'}>Performance by Event Type</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Type','Events','Avg Revenue','Avg Costs','Avg ROI %','Best Event'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byType.map(row => (
                <tr key={row.type} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: (TYPE_COLORS[row.type] || '#6b7280') + '22', color: TYPE_COLORS[row.type] || '#6b7280' }}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{row.count}</td>
                  <td className="px-3 py-2.5 text-gray-600">{fmtMoney(row.avgRev)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{fmtMoney(row.avgCost)}</td>
                  <td className={`px-3 py-2.5 font-semibold ${row.roi != null && row.roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {row.roi != null ? `${row.roi.toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs truncate max-w-[160px]">{row.best?.event_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly trend chart */}
      {monthlyTrend.some(m => m.revenue > 0) && (
        <div>
          <p className={SECTION_TITLE}>Monthly Revenue & ROI — Last 12 Months</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={monthlyTrend} margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} width={52} />
              <YAxis yAxisId="roi" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} width={36} />
              <Tooltip
                formatter={(value, name) =>
                  name === 'Revenue' ? [`$${Number(value).toLocaleString()}`, name] : [`${value}%`, name]
                }
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="#C8871A" opacity={0.85} radius={[3,3,0,0]} />
              <Line yAxisId="roi" type="monotone" dataKey="roi" name="ROI %" stroke="#1A2744" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top 5 performers */}
      {topEvents.length > 0 && (
        <div>
          <p className={SECTION_TITLE}>Top 5 Events by ROI %</p>
          <div className="space-y-2">
            {topEvents.map((ev, i) => {
              const roi = roiPct(totalRevenue(ev), totalCosts(ev))
              return (
                <div key={ev.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <span className="text-sm font-bold text-gray-400 w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{ev.event_name}</p>
                    <p className="text-xs text-gray-500">{ev.event_type} · {fmtDate(ev.event_date)} · {ev.actual_attendance || ev.expected_attendance || '?'} attendees</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600 whitespace-nowrap">
                    {roi != null ? `${roi.toFixed(0)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom 3 — events to reconsider */}
      {bottomEvents.length > 0 && (
        <div>
          <p className={SECTION_TITLE}>Bottom 3 Events — Consider Not Repeating</p>
          <div className="space-y-2">
            {bottomEvents.map(ev => {
              const roi = roiPct(totalRevenue(ev), totalCosts(ev))
              return (
                <div key={ev.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{ev.event_name}</p>
                    <p className="text-xs text-gray-500">{ev.event_type} · {fmtDate(ev.event_date)}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-500 whitespace-nowrap">
                    {roi != null ? `${roi.toFixed(0)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TemplatesModal ────────────────────────────────────────────────────────────

function TemplatesModal({ templates, onClose, onDelete, onPlanFromTemplate }) {
  return (
    <ModalShell isOpen={true} onClose={onClose} isDirty={false} title="Event Templates" maxWidth="max-w-lg">
      <div className="p-5">
        {templates.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm font-medium text-navy">No templates yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Check "Save as template" when planning an event to create one.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(tmpl => {
              const typeColor = TYPE_COLORS[tmpl.event_type] || '#6b7280'
              return (
                <div key={tmpl.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy text-sm">{tmpl.template_name}</p>
                      {tmpl.event_type && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 inline-block"
                          style={{ background: typeColor + '22', color: typeColor }}
                        >
                          {tmpl.event_type}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                        {tmpl.typical_attendance && <span>~{tmpl.typical_attendance} attendees</span>}
                        {tmpl.typical_ticket_price > 0 && <span>${tmpl.typical_ticket_price} ticket</span>}
                        {tmpl.typical_entertainment_cost > 0 && <span>Ent. ${tmpl.typical_entertainment_cost}</span>}
                        {tmpl.typical_marketing_cost > 0 && <span>Mktg. ${tmpl.typical_marketing_cost}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <button
                        onClick={() => onPlanFromTemplate(tmpl)}
                        className="text-xs px-3 py-1.5 bg-amber text-white rounded-lg font-semibold hover:bg-amber-dark transition-colors whitespace-nowrap"
                      >
                        Quick Plan
                      </button>
                      <button
                        onClick={() => onDelete(tmpl.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
          Close
        </button>
      </div>
    </ModalShell>
  )
}
