/**
 * CompliancePage — State Compliance Calendar module.
 *
 * Features:
 *  - Calendar view (monthly grid) and List view (grouped by month)
 *  - Pre-populates federal + state deadlines on first visit
 *  - Filter by category, status, and month
 *  - Add custom deadlines with optional recurrence
 *  - Deadline detail slide-out panel with inline editing and notes auto-save
 *  - All view/filter/month state persisted to localStorage
 *  - Add Deadline modal uses ModalShell + useModalDraft (draft-safe)
 *  - Export current view to CSV
 */
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useModalDraft } from '../../hooks/useModalDraft'
import {
  getDueDate, getDeadlineName, getDeadlineCategory, daysUntilDue,
  CATEGORIES, toYearMonth,
} from './complianceUtils'
import AddDeadlineModal   from './AddDeadlineModal'
import DeadlineDetailPanel from './DeadlineDetailPanel'
import CalendarView       from './CalendarView'
import ListView           from './ListView'

const DRAFT_KEY = 'modal_draft_compliance_deadline'

// Reads a value from localStorage, returning fallback if missing
function lsGet(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val) } catch {}
}

export default function CompliancePage() {
  const { brewery } = useAuth()

  // ── Persistent view + filter state ──────────────────────────────────────────
  const [view,         setView]         = useState(() => lsGet('compliance_active_view', 'list'))
  const [catFilter,    setCatFilter]    = useState(() => lsGet('compliance_filter_category', 'all'))
  const [statusFilter, setStatusFilter] = useState(() => lsGet('compliance_filter_status', 'all'))
  const [monthFilter,  setMonthFilter]  = useState(() => lsGet('compliance_filter_month', 'all'))

  // Calendar month — stored as YYYY-MM in localStorage
  const [calYear,  setCalYear]  = useState(() => {
    const stored = lsGet('compliance_active_month', null)
    return stored ? parseInt(stored.split('-')[0]) : new Date().getFullYear()
  })
  const [calMonth, setCalMonth] = useState(() => {
    const stored = lsGet('compliance_active_month', null)
    return stored ? parseInt(stored.split('-')[1]) - 1 : new Date().getMonth()
  })

  // ── Data state ───────────────────────────────────────────────────────────────
  const [deadlines,        setDeadlines]        = useState([])
  const [documents,        setDocuments]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [loadError,        setLoadError]        = useState('')
  const [autoLoadedBanner, setAutoLoadedBanner] = useState(false)

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [selectedDeadline, setSelectedDeadline] = useState(null)
  const [showAddModal,     setShowAddModal]     = useState(false)

  // Draft management for the Add Deadline modal
  const addDraft = useModalDraft(DRAFT_KEY)

  // ── Persist view + filters to localStorage whenever they change ──────────────
  useEffect(() => { lsSet('compliance_active_view',     view)         }, [view])
  useEffect(() => { lsSet('compliance_filter_category', catFilter)    }, [catFilter])
  useEffect(() => { lsSet('compliance_filter_status',   statusFilter) }, [statusFilter])
  useEffect(() => { lsSet('compliance_filter_month',    monthFilter)  }, [monthFilter])
  useEffect(() => {
    lsSet('compliance_active_month', `${calYear}-${String(calMonth + 1).padStart(2, '0')}`)
  }, [calYear, calMonth])

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!brewery?.id) return
    loadAll()
  }, [brewery?.id])

  async function loadAll() {
    setLoading(true)
    setLoadError('')

    const [dlRes, docRes] = await Promise.all([
      supabase.from('brewery_deadlines')
        .select('*, compliance_deadlines(*)')
        .eq('brewery_id', brewery.id)
        .order('custom_date', { ascending: true }),
      supabase.from('brewery_documents')
        .select('id, document_name')
        .eq('brewery_id', brewery.id)
        .order('document_name', { ascending: true }),
    ])

    if (dlRes.error) { setLoadError('Failed to load deadlines. Try refreshing the page.') }
    setDocuments(docRes.data ?? [])

    const list = dlRes.data ?? []

    // Auto-populate federal + state deadlines on first visit
    if (list.length === 0 && brewery.state) {
      await autoPopulate()
      const { data: fresh } = await supabase.from('brewery_deadlines')
        .select('*, compliance_deadlines(*)')
        .eq('brewery_id', brewery.id)
        .order('custom_date', { ascending: true })
      const freshList = fresh ?? []
      setDeadlines(freshList)
      if (freshList.length > 0) setAutoLoadedBanner(true)
    } else {
      setDeadlines(list)
    }

    setLoading(false)
  }

  // Queries federal + state compliance_deadlines templates and inserts current-year
  // brewery_deadlines rows for this brewery. Adjusts dates to the current year;
  // if a date already passed this year it rolls forward to next year.
  async function autoPopulate() {
    const { data: templates } = await supabase
      .from('compliance_deadlines')
      .select('*')
      .or(`is_federal.eq.true,state.eq.${brewery.state}`)

    if (!templates?.length) return

    const today       = new Date()
    today.setHours(0, 0, 0, 0)
    const currentYear = today.getFullYear()

    const rows = templates.map(t => {
      let iso
      if (t.deadline_date) {
        const ref    = new Date(t.deadline_date + 'T00:00:00')
        let target   = new Date(currentYear, ref.getMonth(), ref.getDate())
        if (target < today) target = new Date(currentYear + 1, ref.getMonth(), ref.getDate())
        // Use LOCAL year/month/day — NOT toISOString() which converts to UTC and
        // produces the previous calendar date in UTC+ timezones (e.g. UTC+5:30).
        iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
      }
      return {
        brewery_id:            brewery.id,
        compliance_deadline_id: t.id,
        custom_date:           iso ?? null,
        original_date:         iso ?? null,
        is_complete:           false,
        is_custom:             false,
        recurrence:            'none',
      }
    })

    await supabase.from('brewery_deadlines').insert(rows)
  }

  // ── Deadline actions ─────────────────────────────────────────────────────────

  async function handleCheck(deadline) {
    const nowComplete = !deadline.is_complete
    await supabase.from('brewery_deadlines').update({
      is_complete:     nowComplete,
      completion_date: nowComplete ? new Date().toISOString() : null,
    }).eq('id', deadline.id)
    await loadAll()
  }

  async function handleReset(deadline) {
    if (!window.confirm('Reset this deadline to its original date and clear any custom changes?')) return
    const origDate = deadline.original_date ?? deadline.compliance_deadlines?.deadline_date
    await supabase.from('brewery_deadlines').update({
      custom_date: origDate ?? null,
      notes:       null,
      document_id: null,
    }).eq('id', deadline.id)
    await loadAll()
  }

  async function handleDelete(deadline) {
    if (!window.confirm('Delete this deadline permanently? This cannot be undone.')) return
    await supabase.from('brewery_deadlines').delete().eq('id', deadline.id)
    setSelectedDeadline(null)
    await loadAll()
  }

  // ── Filtering ────────────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0]

  const filtered = useMemo(() => {
    let list = deadlines

    if (catFilter !== 'all') {
      list = list.filter(d => getDeadlineCategory(d) === catFilter)
    }

    if (statusFilter !== 'all') {
      list = list.filter(d => {
        const date = getDueDate(d)
        if (statusFilter === 'completed') return d.is_complete
        if (d.is_complete)                return false
        if (statusFilter === 'overdue')   return date && date < today
        if (statusFilter === 'upcoming')  return !date || date >= today
        if (statusFilter === 'due_soon') {
          const days = daysUntilDue(date)
          return days !== null && days >= 0 && days <= 14
        }
        return true
      })
    }

    // Month filter only applies in list view. In calendar view the grid itself
    // limits visible dates to the displayed month — applying monthFilter here
    // would strip deadlines from other months out of the byDate map, causing
    // dots to disappear whenever the user navigates away from the filtered month.
    if (view !== 'calendar' && monthFilter !== 'all') {
      list = list.filter(d => getDueDate(d)?.slice(0, 7) === monthFilter)
    }

    return list
  }, [deadlines, catFilter, statusFilter, monthFilter, view, today])

  // Build the unique month options for the month filter dropdown
  const monthOptions = useMemo(() => {
    const seen = new Set()
    deadlines.forEach(d => {
      const date = getDueDate(d)
      if (date) seen.add(date.slice(0, 7))
    })
    return Array.from(seen).sort()
  }, [deadlines])

  // ── Export ───────────────────────────────────────────────────────────────────

  function exportCSV() {
    const header = ['Deadline Name', 'Category', 'Due Date', 'Status', 'Notes']
    const rows   = filtered.map(d => {
      const date   = getDueDate(d) ?? ''
      const status = d.is_complete ? 'Complete' : (date && date < today ? 'Overdue' : 'Upcoming')
      return [getDeadlineName(d), getDeadlineCategory(d), date, status, d.notes ?? '']
    })
    const csv = '﻿' + [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a   = document.createElement('a')
    a.href = url; a.download = 'compliance-calendar.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Calendar month navigation ────────────────────────────────────────────────

  function handleMonthChange(newYear, newMonth) {
    setCalYear(newYear)
    setCalMonth(newMonth)
  }

  // ── Add modal open/close ─────────────────────────────────────────────────────

  function openAdd() { setShowAddModal(true) }
  function closeAdd() {
    addDraft.clearDraft()
    setShowAddModal(false)
  }
  function onAddSuccess() {
    addDraft.clearDraft()
    setShowAddModal(false)
    loadAll()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner message="Loading compliance calendar…" />

  const profileIncomplete = !brewery?.state

  return (
    <div className="space-y-4">

      <DismissibleDisclaimer
        storageKey="disclaimer_compliance_dismissed"
        text="Reference only — Compliance deadlines are for general reference and may not reflect your specific jurisdiction or circumstances. Requirements change frequently. Always verify with your state licensing authority before taking action."
      />

      {/* ── Auto-load success banner ── */}
      {autoLoadedBanner && (
        <div className="bg-green-50 border border-success rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-green-700">
            ✅ We loaded your personalized compliance deadlines based on your state and license types. Review and edit them as needed.
          </p>
          <button onClick={() => setAutoLoadedBanner(false)} className="text-green-500 hover:text-green-700 text-lg leading-none flex-shrink-0">×</button>
        </div>
      )}

      {/* ── Incomplete profile banner ── */}
      {profileIncomplete && (
        <Link to="/account"
          className="block rounded-lg px-4 py-3 bg-amber/10 border border-amber hover:bg-amber/20 transition-colors">
          <p className="text-sm font-semibold text-amber-dark">
            ⚠️ Complete your brewery profile to get personalized compliance deadlines for your state and license types.{' '}
            <span className="underline">Go to Account Settings →</span>
          </p>
        </Link>
      )}

      {loadError && (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">{loadError}</div>
      )}

      {/* ── Draft notice bar for Add Deadline ── */}
      {addDraft.hasDraft && !showAddModal && (
        <DraftNoticeBar
          onContinue={() => setShowAddModal(true)}
          onDiscard={() => addDraft.clearDraft()}
        />
      )}

      {/* ── Page header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">Compliance Calendar</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setView('calendar')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'calendar' ? 'bg-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>📅 Calendar</button>
            <button onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>☰ List</button>
          </div>

          <button onClick={exportCSV}
            className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            Export CSV
          </button>

          {/* Add Deadline button — shows amber dot when a draft exists */}
          <button onClick={openAdd}
            className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            {addDraft.hasDraft && <span className="w-2 h-2 rounded-full bg-white opacity-80" />}
            {addDraft.hasDraft ? 'Continue Draft' : '+ Add Deadline'}
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-2">
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="Custom">Custom</option>
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber">
          <option value="all">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="due_soon">Due Soon (≤14 days)</option>
          <option value="overdue">Overdue</option>
          <option value="completed">Completed</option>
        </select>

        {/* Month filter only shown in list view — calendar navigates month via its own arrows */}
        {view === 'list' && (
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber">
            <option value="all">All Months</option>
            {monthOptions.map(ym => {
              const [y, m] = ym.split('-')
              const label  = new Date(parseInt(y), parseInt(m) - 1, 1)
                .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              return <option key={ym} value={ym}>{label}</option>
            })}
          </select>
        )}

        {(catFilter !== 'all' || statusFilter !== 'all' || (view === 'list' && monthFilter !== 'all')) && (
          <button onClick={() => { setCatFilter('all'); setStatusFilter('all'); setMonthFilter('all') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 underline">
            Clear filters
          </button>
        )}
      </div>

      {/* ── Main content ── */}
      {view === 'calendar' ? (
        <CalendarView
          deadlines={filtered}
          year={calYear}
          month={calMonth}
          onMonthChange={handleMonthChange}
          onDeadlineClick={dl => setSelectedDeadline(dl)}
        />
      ) : (
        <ListView
          deadlines={filtered}
          onCheck={handleCheck}
          onEdit={dl => setSelectedDeadline(dl)}
          onDelete={handleDelete}
          onReset={handleReset}
        />
      )}

      {/* ── Modals & panels ── */}
      <AddDeadlineModal
        isOpen={showAddModal}
        onClose={closeAdd}
        onSuccess={onAddSuccess}
        breweryId={brewery?.id}
        documents={documents}
      />

      {selectedDeadline && (
        <DeadlineDetailPanel
          deadline={deadlines.find(d => d.id === selectedDeadline.id) ?? selectedDeadline}
          documents={documents}
          onClose={() => setSelectedDeadline(null)}
          onUpdated={loadAll}
          onDeleted={() => { setSelectedDeadline(null); loadAll() }}
        />
      )}
    </div>
  )
}
