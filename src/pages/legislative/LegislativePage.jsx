// LegislativePage — Full Suite Module: Legislative Tracker
/**
 * Manual bill tracking system with optional LegiScan integration.
 * Three tabs: Active Bills, Actions Log, Settings.
 * All data is brewery-specific — no shared bill database.
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import LoadingSpinner from '../../components/LoadingSpinner'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'
import { usePersistedTab } from '../../hooks/usePersistedTab'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES = ['Monitoring', 'Introduced', 'In Committee', 'Passed Committee', 'Floor Vote', 'Signed', 'Dead']
const PRIORITIES = ['A', 'B', 'C', 'D']
const IMPACT_AREAS = ['Taproom', 'Distribution', 'Excise Tax', 'Labeling', 'Franchise Law', 'Zoning', 'Events', 'Other']
const JURISDICTIONS = ['Federal', 'State', 'Local']
const GUILD_AWARE_OPTIONS = ['No', 'Yes', 'Notified']
const ACTION_TYPES = ['Contacted Rep', 'Testified', 'Sent Action Alert', 'Met with Lobbyist', 'Submitted Comment', 'Attended Hearing', 'Coordinated with Guild', 'Other']

const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ['DC','Washington D.C.'],
]

const PRIORITY_META = {
  A: { label: 'A — Act Now',   color: 'bg-red-100 text-red-700',    desc: 'High financial impact, short advocacy window. Full mobilization required.' },
  B: { label: 'B — Watch',     color: 'bg-amber/20 text-amber-dark', desc: 'Moderate impact or longer timeline. Prepare materials, monitor closely.' },
  C: { label: 'C — FYI',       color: 'bg-blue-100 text-blue-700',   desc: 'Low immediate impact. Track periodically, no active engagement yet.' },
  D: { label: 'D — Noise',     color: 'bg-gray-100 text-gray-500',   desc: 'Minimal relevance. Record in system, review quarterly.' },
}

const STATUS_COLORS = {
  'Monitoring':       'bg-gray-100 text-gray-600',
  'Introduced':       'bg-blue-50 text-blue-700',
  'In Committee':     'bg-indigo-100 text-indigo-700',
  'Passed Committee': 'bg-amber/20 text-amber-dark',
  'Floor Vote':       'bg-purple-100 text-purple-700',
  'Signed':           'bg-green-100 text-green-700',
  'Dead':             'bg-red-100 text-red-600',
}

const IMPACT_COLORS = {
  High:    'bg-red-100 text-red-700',
  Medium:  'bg-amber/20 text-amber-dark',
  Low:     'bg-green-100 text-green-700',
  Unknown: 'bg-gray-100 text-gray-500',
}

const EMPTY_BILL = {
  jurisdiction: 'State', state: '', bill_number: '', short_title: '',
  full_description: '', bill_url: '', legiscan_bill_id: '',
  status: 'Monitoring', priority: 'C', business_impact: 'Unknown', impact_area: 'Other',
  date_introduced: '', next_key_date: '', session_deadline: '', source: '',
  guild_aware: 'No', guild_notified_date: '', next_action: '', next_action_owner: '', notes: '',
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

// Returns "2026-PA-001" style item ID
function buildItemId(jurisdiction, state, count) {
  const year   = new Date().getFullYear()
  const prefix = jurisdiction === 'Federal' ? 'FED' : (state || 'ST')
  return `${year}-${prefix}-${String(count + 1).padStart(3, '0')}`
}

// Formats a date string as "May 29, 2026"
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Returns true if a date string is within N days of today
function withinDays(dateStr, n) {
  if (!dateStr) return false
  const diff = (new Date(dateStr + 'T00:00:00') - new Date()) / 86400000
  return diff >= 0 && diff <= n
}

// Returns true if a date string is in the past
function isPast(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr + 'T00:00:00') < new Date()
}

// Returns relative time since a timestamp ("3 days ago")
function relativeTime(ts) {
  if (!ts) return 'Never'
  const diff  = Date.now() - new Date(ts).getTime()
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(hours / 24)
  if (hours < 1)  return 'Just now'
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// Shared input / label class
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-amber/40'
const LBL   = 'block text-xs font-semibold text-gray-500 mb-1'
const SEL   = INPUT + ' bg-white'

// Exports an array of objects to a CSV download
function exportCSV(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines   = [headers, ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`))]
  const csv     = lines.map(l => l.join(',')).join('\n')
  const a       = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: filename,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── TierGate wrapper ──────────────────────────────────────────────────────────

export default function LegislativePage() {
  return (
    <TierGate
      requiredTier="full_suite"
      featureKey="legislative_tracker"
      featureName="Legislative Tracker"
      featureDescription="Monitor legislation that affects your brewery and track your advocacy actions."
    >
      <LegislativeDashboard />
    </TierGate>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

function LegislativeDashboard() {
  const { brewery, user } = useAuth()
  const [activeTab, setTab] = usePersistedTab('legislative_active_tab', 'bills')

  const [bills,   setBills]   = useState([])
  const [actions, setActions] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load all data in parallel on mount and after mutations
  const loadAll = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [billsRes, actionsRes, profileRes] = await Promise.all([
      supabase
        .from('tracked_bills')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('priority', { ascending: true })
        .order('next_key_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('bill_actions')
        .select('*, tracked_bills(bill_number, short_title)')
        .eq('brewery_id', brewery.id)
        .order('action_date', { ascending: false }),
      supabase
        .from('users')
        .select('legiscan_api_key')
        .eq('id', user?.id)
        .maybeSingle(),
    ])
    setBills(billsRes.data ?? [])
    setActions(actionsRes.data ?? [])
    setProfile(profileRes.data ?? null)
    setLoading(false)
  }, [brewery?.id, user?.id])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading && bills.length === 0) {
    return <div className="flex justify-center py-16"><LoadingSpinner message="Loading legislative tracker..." /></div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-navy">Legislative Tracker</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Monitor legislation that affects your brewery and track your advocacy actions.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'bills',    label: 'Active Bills' },
          { key: 'log',      label: 'Actions Log' },
          { key: 'settings', label: 'Settings' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === t.key ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'bills'    && <ActiveBillsTab    bills={bills}   actions={actions} brewery={brewery} profile={profile} onRefresh={loadAll} />}
      {activeTab === 'log'      && <ActionsLogTab     actions={actions} bills={bills} />}
      {activeTab === 'settings' && <SettingsTab       profile={profile} user={user} brewery={brewery} onRefresh={loadAll} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — ACTIVE BILLS
// ═══════════════════════════════════════════════════════════════════════════════

function ActiveBillsTab({ bills, actions, brewery, profile, onRefresh }) {
  const [search,        setSearch]        = useState('')
  const [filterJuris,   setFilterJuris]   = useState('All')
  const [filterState,   setFilterState]   = useState('All')
  const [filterPri,     setFilterPri]     = useState('All')
  const [filterStatus,  setFilterStatus]  = useState('All')
  const [filterImpact,  setFilterImpact]  = useState('All')
  const [sortBy,        setSortBy]        = useState('priority')
  const [viewMode,      setViewMode]      = useState(() => { try { return localStorage.getItem('legislative_view_mode') || 'table' } catch { return 'table' } })
  const [showAdd,       setShowAdd]       = useState(false)
  const [detailBill,    setDetailBill]    = useState(null)
  const [logActionBill, setLogActionBill] = useState(null)

  function handleViewMode(m) { setViewMode(m); try { localStorage.setItem('legislative_view_mode', m) } catch {} }

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    const today    = new Date().toISOString().slice(0, 10)
    const showOpen = filterStatus === 'All' || filterStatus !== 'Closed'
    return bills
      .filter(b => {
        if (filterStatus === 'Closed')  return !!b.closed_date
        if (filterStatus === 'Active')  return !b.closed_date
        if (filterStatus !== 'All')     return b.status === filterStatus && !b.closed_date
        return true
      })
      .filter(b => filterJuris === 'All' || b.jurisdiction === filterJuris)
      .filter(b => filterState === 'All' || b.state === filterState)
      .filter(b => filterPri === 'All' || b.priority === filterPri)
      .filter(b => filterImpact === 'All' || b.impact_area === filterImpact)
      .filter(b => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return b.bill_number?.toLowerCase().includes(q) || b.short_title?.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (sortBy === 'priority')     return a.priority.localeCompare(b.priority)
        if (sortBy === 'next_key_date') {
          if (!a.next_key_date && !b.next_key_date) return 0
          if (!a.next_key_date) return 1
          if (!b.next_key_date) return -1
          return a.next_key_date.localeCompare(b.next_key_date)
        }
        if (sortBy === 'date_added')   return b.created_at?.localeCompare(a.created_at ?? '') ?? 0
        if (sortBy === 'status')       return a.status.localeCompare(b.status)
        return 0
      })
  }, [bills, search, filterJuris, filterState, filterPri, filterStatus, filterImpact, sortBy])

  // Summary card counts
  const open         = bills.filter(b => !b.closed_date)
  const priA         = open.filter(b => b.priority === 'A')
  const upcoming     = open.filter(b => withinDays(b.next_key_date, 14))
  const closedCount  = bills.filter(b => !!b.closed_date).length

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard value={open.length}       label="Bills Tracked"        color="text-navy" />
        <SummaryCard value={priA.length}       label="Priority A (Act Now)" color={priA.length > 0 ? 'text-danger' : 'text-navy'} />
        <SummaryCard value={upcoming.length}   label="Deadlines in 14 Days" color={upcoming.length > 0 ? 'text-amber' : 'text-navy'} />
        <SummaryCard value={closedCount}       label="Closed This Session"  color="text-gray-400" />
      </div>

      {/* Filter bar + view toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bill number or title..."
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-amber/40"
          />
          <select value={sortBy}       onChange={e => setSortBy(e.target.value)}       className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="priority">Sort: Priority</option>
            <option value="next_key_date">Sort: Next Key Date</option>
            <option value="date_added">Sort: Date Added</option>
            <option value="status">Sort: Status</option>
          </select>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => handleViewMode('table')} className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}>⊞ Table</button>
            <button onClick={() => handleViewMode('card')}  className={`px-3 py-2 text-sm ${viewMode === 'card'  ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}>▦ Cards</button>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-amber text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber/90 transition-colors"
          >
            + Add Bill
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Jurisdiction', value: filterJuris,  set: setFilterJuris,  opts: ['All', ...JURISDICTIONS] },
            { label: 'Priority',     value: filterPri,    set: setFilterPri,    opts: ['All', ...PRIORITIES] },
            { label: 'Status',       value: filterStatus, set: setFilterStatus, opts: ['All', 'Active', 'Closed', ...STATUSES] },
            { label: 'Impact Area',  value: filterImpact, set: setFilterImpact, opts: ['All', ...IMPACT_AREAS] },
          ].map(f => (
            <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600">
              {f.opts.map(o => <option key={o}>{o}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* Bills list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-4xl mb-2">⚖️</p>
          <p className="text-sm font-medium text-navy mb-1">No bills tracked yet</p>
          <p className="text-xs">Click <strong>+ Add Bill</strong> to start monitoring legislation that affects your brewery.</p>
        </div>
      ) : viewMode === 'table' ? (
        <BillTable bills={filtered} onView={b => setDetailBill(b)} onLog={b => setLogActionBill(b)} onRefresh={onRefresh} brewery={brewery} />
      ) : (
        <BillCardGrid bills={filtered} onView={b => setDetailBill(b)} onLog={b => setLogActionBill(b)} />
      )}

      {/* Modals */}
      {showAdd && (
        <AddBillModal
          brewery={brewery}
          billCount={bills.length}
          hasLegiScan={!!profile?.legiscan_api_key}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onRefresh() }}
        />
      )}
      {detailBill && (
        <BillDetailModal
          bill={detailBill}
          actions={actions.filter(a => a.bill_id === detailBill.id)}
          hasLegiScan={!!profile?.legiscan_api_key}
          brewery={brewery}
          onClose={() => setDetailBill(null)}
          onRefresh={() => { onRefresh(); }}
        />
      )}
      {logActionBill && (
        <LogActionModal
          bill={logActionBill}
          brewery={brewery}
          onClose={() => setLogActionBill(null)}
          onSaved={() => { setLogActionBill(null); onRefresh() }}
        />
      )}
    </div>
  )
}

function SummaryCard({ value, label, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

// ── Bill Table view ───────────────────────────────────────────────────────────

function BillTable({ bills, onView, onLog, onRefresh, brewery }) {
  async function closeBill(bill) {
    if (!window.confirm(`Mark "${bill.short_title}" as closed?`)) return
    await supabase
      .from('tracked_bills')
      .update({ closed_date: new Date().toISOString().slice(0, 10) })
      .eq('id', bill.id)
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Item ID', 'Priority', 'Bill / Title', 'Jurisdiction', 'Status', 'Impact', 'Next Key Date', 'Guild', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bills.map(bill => {
              const dateClass = isPast(bill.next_key_date)
                ? 'text-danger font-semibold'
                : withinDays(bill.next_key_date, 7)
                ? 'text-amber font-semibold'
                : 'text-gray-600'
              return (
                <tr key={bill.id} className={`hover:bg-gray-50 transition-colors ${bill.closed_date ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{bill.item_id ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${PRIORITY_META[bill.priority]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                      {bill.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-semibold text-navy truncate">{bill.bill_number}</p>
                    <p className="text-xs text-gray-500 truncate">{bill.short_title}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{bill.jurisdiction}{bill.state ? ` — ${bill.state}` : ''}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[bill.status] ?? 'bg-gray-100'}`}>
                      {bill.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${IMPACT_COLORS[bill.business_impact] ?? 'bg-gray-100 text-gray-500'}`}>
                      {bill.business_impact}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs whitespace-nowrap ${dateClass}`}>{fmtDate(bill.next_key_date)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{bill.guild_aware}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 whitespace-nowrap">
                      <button onClick={() => onView(bill)}  className="text-xs text-amber hover:underline font-medium">View</button>
                      <span className="text-gray-300">·</span>
                      <button onClick={() => onLog(bill)}   className="text-xs text-navy hover:underline">Log</button>
                      {!bill.closed_date && (
                        <>
                          <span className="text-gray-300">·</span>
                          <button onClick={() => closeBill(bill)} className="text-xs text-gray-400 hover:text-danger">Close</button>
                        </>
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

// ── Bill Card Grid view ───────────────────────────────────────────────────────

function BillCardGrid({ bills, onView, onLog }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {bills.map(bill => {
        const priMeta   = PRIORITY_META[bill.priority] ?? PRIORITY_META.C
        const dateClass = isPast(bill.next_key_date) ? 'text-danger' : withinDays(bill.next_key_date, 7) ? 'text-amber' : 'text-gray-500'
        return (
          <div key={bill.id} className={`bg-white rounded-xl border-2 p-5 space-y-3 ${bill.priority === 'A' ? 'border-red-300' : bill.priority === 'B' ? 'border-amber' : 'border-gray-200'} ${bill.closed_date ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priMeta.color}`}>{priMeta.label}</span>
                <p className="font-bold text-navy mt-1">{bill.bill_number}</p>
                <p className="text-sm text-gray-600">{bill.short_title}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[bill.status]}`}>{bill.status}</span>
            </div>
            {bill.full_description && <p className="text-xs text-gray-500 line-clamp-2">{bill.full_description}</p>}
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
              <div><span className="font-medium">Impact:</span> <span className={IMPACT_COLORS[bill.business_impact]?.replace('bg-', 'text-').split(' ')[0]}>{bill.business_impact}</span></div>
              <div><span className="font-medium">Area:</span> {bill.impact_area || '—'}</div>
              {bill.next_key_date && <div className={`col-span-2 ${dateClass}`}>Next date: {fmtDate(bill.next_key_date)}</div>}
            </div>
            <div className="flex gap-3 pt-1 border-t border-gray-100">
              <button onClick={() => onView(bill)} className="text-xs font-semibold text-amber hover:underline">View Details</button>
              <button onClick={() => onLog(bill)}  className="text-xs font-medium text-navy hover:underline">Log Action</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD BILL MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function AddBillModal({ brewery, billCount, hasLegiScan, onClose, onSaved }) {
  const draft = useModalDraft('modal_draft_legislative_bill')
  const [form,    setForm]    = useState(() => draft.loadDraft() ?? { ...EMPTY_BILL })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_BILL)

  function update(field, val) {
    const next = { ...form, [field]: val }
    setForm(next)
    draft.saveDraft(next)
  }

  const wordCount = form.short_title.trim().split(/\s+/).filter(Boolean).length

  async function handleSave() {
    if (!form.bill_number.trim()) { setError('Bill number is required.'); return }
    if (!form.short_title.trim()) { setError('Short title is required.'); return }
    if (wordCount > 10) { setError('Short title must be 10 words or fewer.'); return }
    setSaving(true); setError('')
    const item_id = buildItemId(form.jurisdiction, form.state, billCount)
    const payload = {
      ...form,
      brewery_id: brewery.id,
      item_id,
      date_introduced:    form.date_introduced    || null,
      next_key_date:      form.next_key_date      || null,
      session_deadline:   form.session_deadline   || null,
      guild_notified_date: form.guild_notified_date || null,
      legiscan_bill_id:   form.legiscan_bill_id   || null,
      bill_url:           form.bill_url           || null,
    }
    const { error: err } = await supabase.from('tracked_bills').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    draft.clearDraft()
    onSaved()
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      isDirty={isDirty}
      title="Track New Bill / Regulation"
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6 pb-2">
        {error && <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-4 py-2">{error}</p>}

        {/* Section 1 — Identification */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Identification</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Jurisdiction *</label>
              <select value={form.jurisdiction} onChange={e => update('jurisdiction', e.target.value)} className={SEL}>
                {JURISDICTIONS.map(j => <option key={j}>{j}</option>)}
              </select>
            </div>
            {(form.jurisdiction === 'State' || form.jurisdiction === 'Local') && (
              <div>
                <label className={LBL}>State</label>
                <select value={form.state} onChange={e => update('state', e.target.value)} className={SEL}>
                  <option value="">— Select State —</option>
                  {US_STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={LBL}>Bill Number *</label>
              <input value={form.bill_number} onChange={e => update('bill_number', e.target.value)} placeholder="e.g. SB 412, HB 1087" className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>Short Title * <span className={`ml-1 ${wordCount > 10 ? 'text-danger' : 'text-gray-400'}`}>({wordCount}/10 words)</span></label>
              <input value={form.short_title} onChange={e => update('short_title', e.target.value)} placeholder="Plain English description — max 10 words" className={INPUT} />
            </div>
            <div>
              <label className={LBL}>Date Introduced</label>
              <input type="date" value={form.date_introduced} onChange={e => update('date_introduced', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LBL}>Session Deadline</label>
              <input type="date" value={form.session_deadline} onChange={e => update('session_deadline', e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>Source (where did you learn about this?)</label>
              <input value={form.source} onChange={e => update('source', e.target.value)} placeholder="e.g. State guild email, Brewbound, colleague" className={INPUT} />
            </div>
          </div>
        </div>

        {/* Section 2 — Description & Impact */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Description & Impact</p>
          <div className="space-y-4">
            <div>
              <label className={LBL}>Full Description (2-3 sentences)</label>
              <textarea rows={3} value={form.full_description} onChange={e => update('full_description', e.target.value)} placeholder="Summarize what this bill does and why it matters to craft breweries..." className={INPUT} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={LBL}>Business Impact</label>
                <select value={form.business_impact} onChange={e => update('business_impact', e.target.value)} className={SEL}>
                  {['High', 'Medium', 'Low', 'Unknown'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Impact Area</label>
                <select value={form.impact_area} onChange={e => update('impact_area', e.target.value)} className={SEL}>
                  {IMPACT_AREAS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Priority</label>
                <select value={form.priority} onChange={e => update('priority', e.target.value)} className={SEL}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </select>
              </div>
            </div>
            {/* Priority description */}
            <div className={`rounded-lg p-3 text-xs ${PRIORITY_META[form.priority]?.color}`}>
              <span className="font-semibold">{PRIORITY_META[form.priority]?.label}: </span>
              {PRIORITY_META[form.priority]?.desc}
            </div>
          </div>
        </div>

        {/* Section 3 — Tracking */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Tracking</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={LBL}>Bill URL (optional)</label>
              <input type="url" value={form.bill_url} onChange={e => update('bill_url', e.target.value)} placeholder="https://..." className={INPUT} />
            </div>
            {hasLegiScan && (
              <div>
                <label className={LBL}>LegiScan Bill ID (optional)</label>
                <input value={form.legiscan_bill_id} onChange={e => update('legiscan_bill_id', e.target.value)} placeholder="e.g. 1234567" className={INPUT} />
              </div>
            )}
            <div>
              <label className={LBL}>Next Key Date</label>
              <input type="date" value={form.next_key_date} onChange={e => update('next_key_date', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LBL}>Next Action</label>
              <input value={form.next_action} onChange={e => update('next_action', e.target.value)} placeholder="e.g. Call Sen. Smith's office" className={INPUT} />
            </div>
            <div>
              <label className={LBL}>Next Action Owner</label>
              <input value={form.next_action_owner} onChange={e => update('next_action_owner', e.target.value)} placeholder="Name or role" className={INPUT} />
            </div>
            <div>
              <label className={LBL}>Guild Aware</label>
              <select value={form.guild_aware} onChange={e => update('guild_aware', e.target.value)} className={SEL}>
                {GUILD_AWARE_OPTIONS.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            {form.guild_aware === 'Notified' && (
              <div>
                <label className={LBL}>Guild Notified Date</label>
                <input type="date" value={form.guild_notified_date} onChange={e => update('guild_notified_date', e.target.value)} className={INPUT} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={LBL}>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} className={INPUT} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-amber text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-amber/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Bill'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// BILL DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function BillDetailModal({ bill: initialBill, actions, hasLegiScan, brewery, onClose, onRefresh }) {
  const [detailTab, setDetailTab] = usePersistedTab('legislative_detail_tab', 'overview')
  const [bill,   setBill]   = useState(initialBill)
  const [saving, setSaving] = useState(false)
  const [showLogAction, setShowLogAction] = useState(false)

  // Save a single field on blur (for notes and impact_notes)
  async function saveField(field, value) {
    setSaving(true)
    await supabase.from('tracked_bills').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', bill.id)
    setSaving(false)
  }

  // Save the full bill state (called from overview form)
  async function saveOverview(updates) {
    setSaving(true)
    const { data } = await supabase
      .from('tracked_bills')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', bill.id)
      .select()
      .single()
    if (data) setBill(data)
    setSaving(false)
    onRefresh()
  }

  async function changeStatus(newStatus) {
    if (!window.confirm(`Change status to "${newStatus}"?`)) return
    await saveOverview({ status: newStatus })
  }

  const innerTabs = ['Overview', 'Actions', 'Impact Analysis', 'Notes']

  return (
    <ModalShell isOpen onClose={onClose} title={`${bill.bill_number} — ${bill.short_title}`} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Inner tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {innerTabs.map(t => (
            <button key={t} onClick={() => setDetailTab(t.toLowerCase().replace(' ', '_'))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${detailTab === t.toLowerCase().replace(' ', '_') ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Status quick-change row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">Status:</span>
          {STATUSES.map(s => (
            <button key={s} onClick={() => changeStatus(s)}
              className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${bill.status === s ? STATUS_COLORS[s] : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
          {saving && <span className="text-xs text-gray-400 ml-2">Saving...</span>}
        </div>

        {/* OVERVIEW TAB */}
        {detailTab === 'overview' && (
          <OverviewTab bill={bill} hasLegiScan={hasLegiScan} onSave={saveOverview} />
        )}

        {/* ACTIONS TAB */}
        {detailTab === 'actions' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold text-navy">Logged Actions ({actions.length})</h4>
              <button onClick={() => setShowLogAction(true)} className="bg-amber text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber/90">
                + Log Action
              </button>
            </div>
            {actions.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No actions logged yet for this bill.</p>
            ) : (
              <div className="space-y-2">
                {actions.map(a => (
                  <div key={a.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-navy">{fmtDate(a.action_date)}</span>
                      <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full font-medium">{a.action_type}</span>
                    </div>
                    <p className="text-sm text-gray-700">{a.description}</p>
                    {a.contact_name && <p className="text-xs text-gray-500 mt-1">Contact: {a.contact_name}</p>}
                    {a.outcome      && <p className="text-xs text-gray-500">Outcome: {a.outcome}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* IMPACT ANALYSIS TAB */}
        {detailTab === 'impact_analysis' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Business Impact</label>
                <select
                  defaultValue={bill.business_impact}
                  onChange={e => saveOverview({ business_impact: e.target.value })}
                  className={SEL}
                >
                  {['High', 'Medium', 'Low', 'Unknown'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Impact Area</label>
                <select
                  defaultValue={bill.impact_area}
                  onChange={e => saveOverview({ impact_area: e.target.value })}
                  className={SEL}
                >
                  {IMPACT_AREAS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={LBL}>Your Financial Impact Analysis (auto-saves on blur)</label>
              <textarea
                key={bill.id}
                rows={8}
                defaultValue={bill.impact_notes ?? ''}
                onBlur={e => saveField('impact_notes', e.target.value)}
                placeholder="Document your estimated financial impact here — revenue at risk, compliance costs, potential savings, affected SKUs, etc."
                className={INPUT}
              />
            </div>
            <div className="bg-amber/10 border border-amber rounded-lg p-3 text-xs text-amber-dark">
              💡 Use the Impact Assessment Worksheet in the <strong>Regulation Playbook</strong> to calculate your full BIAF score for this legislation.
            </div>
          </div>
        )}

        {/* NOTES TAB */}
        {detailTab === 'notes' && (
          <div>
            <label className={LBL}>Notes (auto-saves on blur)</label>
            <textarea
              key={bill.id}
              rows={12}
              defaultValue={bill.notes ?? ''}
              onBlur={e => saveField('notes', e.target.value)}
              placeholder="Add any notes, context, or reminders about this bill..."
              className={INPUT}
            />
          </div>
        )}
      </div>

      {showLogAction && (
        <LogActionModal
          bill={bill}
          brewery={brewery}
          onClose={() => setShowLogAction(false)}
          onSaved={() => { setShowLogAction(false); onRefresh() }}
        />
      )}
    </ModalShell>
  )
}

// Overview tab — editable form for all bill fields
function OverviewTab({ bill, hasLegiScan, onSave }) {
  const [form, setForm] = useState({ ...bill })
  const changed = JSON.stringify(form) !== JSON.stringify(bill)
  function u(f, v) { setForm(prev => ({ ...prev, [f]: v })) }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LBL}>Item ID</label>
          <p className="text-sm font-mono text-gray-500 py-2">{form.item_id ?? '—'}</p>
        </div>
        <div>
          <label className={LBL}>Priority</label>
          <select value={form.priority} onChange={e => u('priority', e.target.value)} className={SEL}>
            {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </div>
        <div>
          <label className={LBL}>Jurisdiction</label>
          <select value={form.jurisdiction} onChange={e => u('jurisdiction', e.target.value)} className={SEL}>
            {JURISDICTIONS.map(j => <option key={j}>{j}</option>)}
          </select>
        </div>
        {(form.jurisdiction === 'State' || form.jurisdiction === 'Local') && (
          <div>
            <label className={LBL}>State</label>
            <select value={form.state ?? ''} onChange={e => u('state', e.target.value)} className={SEL}>
              <option value="">—</option>
              {US_STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={LBL}>Bill Number</label>
          <input value={form.bill_number} onChange={e => u('bill_number', e.target.value)} className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label className={LBL}>Short Title</label>
          <input value={form.short_title} onChange={e => u('short_title', e.target.value)} className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label className={LBL}>Full Description</label>
          <textarea rows={3} value={form.full_description ?? ''} onChange={e => u('full_description', e.target.value)} className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label className={LBL}>Bill URL</label>
          <div className="flex gap-2">
            <input type="url" value={form.bill_url ?? ''} onChange={e => u('bill_url', e.target.value)} className={INPUT} />
            {form.bill_url && <a href={form.bill_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-amber hover:underline py-2">Open →</a>}
          </div>
        </div>
        {hasLegiScan && (
          <div>
            <label className={LBL}>LegiScan Bill ID</label>
            <input value={form.legiscan_bill_id ?? ''} onChange={e => u('legiscan_bill_id', e.target.value)} className={INPUT} />
            {bill.legiscan_last_synced && <p className="text-xs text-gray-400 mt-1">Last synced: {relativeTime(bill.legiscan_last_synced)}</p>}
          </div>
        )}
        <div>
          <label className={LBL}>Next Key Date</label>
          <input type="date" value={form.next_key_date ?? ''} onChange={e => u('next_key_date', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Date Introduced</label>
          <input type="date" value={form.date_introduced ?? ''} onChange={e => u('date_introduced', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Session Deadline</label>
          <input type="date" value={form.session_deadline ?? ''} onChange={e => u('session_deadline', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Guild Aware</label>
          <select value={form.guild_aware} onChange={e => u('guild_aware', e.target.value)} className={SEL}>
            {GUILD_AWARE_OPTIONS.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        {form.guild_aware === 'Notified' && (
          <div>
            <label className={LBL}>Guild Notified Date</label>
            <input type="date" value={form.guild_notified_date ?? ''} onChange={e => u('guild_notified_date', e.target.value)} className={INPUT} />
          </div>
        )}
        <div>
          <label className={LBL}>Next Action</label>
          <input value={form.next_action ?? ''} onChange={e => u('next_action', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Next Action Owner</label>
          <input value={form.next_action_owner ?? ''} onChange={e => u('next_action_owner', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Source</label>
          <input value={form.source ?? ''} onChange={e => u('source', e.target.value)} className={INPUT} />
        </div>
      </div>
      {changed && (
        <div className="flex justify-end">
          <button onClick={() => onSave(form)} className="bg-amber text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber/90">
            Save Changes
          </button>
        </div>
      )}
    </div>
  )
}

// ── Log Action Modal ──────────────────────────────────────────────────────────

function LogActionModal({ bill, brewery, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ action_date: today, action_type: ACTION_TYPES[0], description: '', contact_name: '', outcome: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const isDirty = form.description.trim().length > 0

  async function handleSave() {
    if (!form.description.trim()) { setError('Description is required.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('bill_actions').insert({ ...form, brewery_id: brewery.id, bill_id: bill.id })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell isOpen onClose={onClose} isDirty={isDirty} title={`Log Action — ${bill.bill_number}`} maxWidth="max-w-lg">
      <div className="space-y-4 pb-2">
        {error && <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-4 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Date</label>
            <input type="date" value={form.action_date} onChange={e => setForm(f => ({ ...f, action_date: e.target.value }))} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Action Type</label>
            <select value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))} className={SEL}>
              {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={LBL}>Description *</label>
          <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you do? What was discussed?" className={INPUT} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Contact Name (optional)</label>
            <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Rep. name, lobbyist, etc." className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Outcome (optional)</label>
            <input value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} placeholder="e.g. Committed to support" className={INPUT} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-amber text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-amber/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Log Action'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — ACTIONS LOG
// ═══════════════════════════════════════════════════════════════════════════════

function ActionsLogTab({ actions, bills }) {
  const [filterBill,   setFilterBill]   = useState('All')
  const [filterType,   setFilterType]   = useState('All')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  const filtered = useMemo(() => actions.filter(a => {
    if (filterBill !== 'All' && a.bill_id !== filterBill) return false
    if (filterType !== 'All' && a.action_type !== filterType) return false
    if (filterFrom && a.action_date < filterFrom) return false
    if (filterTo   && a.action_date > filterTo)   return false
    return true
  }), [actions, filterBill, filterType, filterFrom, filterTo])

  function doExport() {
    exportCSV(filtered.map(a => ({
      Date:         a.action_date,
      'Bill Number': a.tracked_bills?.bill_number ?? '',
      'Bill Title':  a.tracked_bills?.short_title ?? '',
      'Action Type': a.action_type,
      Description:  a.description,
      Contact:      a.contact_name ?? '',
      Outcome:      a.outcome ?? '',
    })), `advocacy-actions-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <select value={filterBill} onChange={e => setFilterBill(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600">
          <option value="All">All Bills</option>
          {bills.map(b => <option key={b.id} value={b.id}>{b.bill_number} — {b.short_title}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600">
          <option value="All">All Action Types</option>
          {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs" placeholder="From" />
        <input type="date" value={filterTo}   onChange={e => setFilterTo(e.target.value)}   className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs" placeholder="To" />
        <button onClick={doExport} disabled={filtered.length === 0} className="ml-auto text-xs font-semibold text-navy border border-navy rounded-lg px-3 py-1.5 hover:bg-navy hover:text-white transition-colors disabled:opacity-40">
          Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          No advocacy actions logged yet. Log actions from the Active Bills tab.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date', 'Bill', 'Action Type', 'Description', 'Contact', 'Outcome'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(a.action_date)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy text-xs">{a.tracked_bills?.bill_number ?? '—'}</p>
                      <p className="text-xs text-gray-400 max-w-xs truncate">{a.tracked_bills?.short_title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{a.action_type}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-sm">{a.description}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{a.contact_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{a.outcome || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">{filtered.length} action{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsTab({ profile, user, brewery, onRefresh }) {
  const [apiKey,      setApiKey]      = useState(profile?.legiscan_api_key ?? '')
  const [showKey,     setShowKey]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [syncing,     setSyncing]     = useState(false)
  const [testResult,  setTestResult]  = useState(null)  // 'ok' | 'fail' | null
  const [syncResult,  setSyncResult]  = useState(null)
  const [stepsOpen,   setStepsOpen]   = useState(!profile?.legiscan_api_key)
  const [notifPriA,   setNotifPriA]   = useState(() => { try { return localStorage.getItem('legislative_notify_pria') !== 'false' } catch { return true } })
  const [notifDeadline, setNotifDeadline] = useState(() => { try { return localStorage.getItem('legislative_notify_deadline') !== 'false' } catch { return true } })

  const isConnected = !!profile?.legiscan_api_key

  async function saveKey() {
    setSaving(true)
    await supabase.from('users').update({ legiscan_api_key: apiKey || null }).eq('id', user.id)
    setSaving(false)
    onRefresh()
  }

  async function disconnect() {
    if (!window.confirm('Disconnect LegiScan? Bill statuses will no longer auto-update.')) return
    setApiKey('')
    await supabase.from('users').update({ legiscan_api_key: null }).eq('id', user.id)
    onRefresh()
  }

  async function testConnection() {
    if (!apiKey.trim()) return
    setTesting(true); setTestResult(null)
    try {
      // Make a lightweight LegiScan API call to verify the key — getSessionList is a safe test op
      const url  = `https://api.legiscan.com/?key=${encodeURIComponent(apiKey)}&op=getSessionList&state=US`
      const res  = await fetch(url)
      const json = await res.json()
      setTestResult(json.status === 'OK' ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    }
    setTesting(false)
  }

  async function syncNow() {
    if (!isConnected) return
    setSyncing(true); setSyncResult(null)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const res  = await fetch(`${supabaseUrl}/functions/v1/legiscan-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ user_id: user.id }),
      })
      const json = await res.json()
      setSyncResult(json.message ?? 'Sync complete.')
    } catch (e) {
      setSyncResult('Sync failed. Check Supabase Edge Function logs.')
    }
    setSyncing(false)
    onRefresh()
  }

  function saveNotifPrefs() {
    try {
      localStorage.setItem('legislative_notify_pria',     String(notifPriA))
      localStorage.setItem('legislative_notify_deadline', String(notifDeadline))
    } catch {}
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* LegiScan Integration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-navy">LegiScan Integration</h3>
          {isConnected
            ? <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">Connected ✓</span>
            : <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">Not Connected</span>
          }
        </div>

        {/* Collapsible setup steps */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setStepsOpen(o => !o)}
            className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 text-sm font-semibold text-navy"
          >
            Setup Instructions
            <span>{stepsOpen ? '▾' : '▸'}</span>
          </button>
          {stepsOpen && (
            <div className="px-4 pb-4 pt-2 space-y-4 text-sm text-gray-700">
              {[
                {
                  n: 1, title: 'Create a free LegiScan account',
                  body: "Go to legiscan.com and click Sign Up. LegiScan's free tier includes 30,000 queries per month — more than enough for monitoring brewery legislation at no cost.",
                  link: { label: 'Visit LegiScan →', href: 'https://legiscan.com' },
                },
                {
                  n: 2, title: 'Get your API key',
                  body: "After signing in go to your Account page → API. Click Create Key and copy your API key. It looks like a long string of letters and numbers (e.g. a1b2c3d4e5f6...).",
                },
                {
                  n: 3, title: 'Enter your API key below',
                  body: "Paste your LegiScan API key in the field below and click Connect. Your key is stored securely and only used to fetch bill status updates for your tracked bills. We never share your key.",
                },
                {
                  n: 4, title: 'Add LegiScan Bill IDs to your tracked bills',
                  body: 'When adding a bill to track, find it on legiscan.com and copy the bill ID from the bill details page. Enter this number in the LegiScan Bill ID field when adding or editing a bill.',
                },
                {
                  n: 5, title: 'Automatic updates',
                  body: 'Once connected your bill statuses will update automatically every night at 7am UTC. You will see a Last Updated timestamp on each bill that has a LegiScan ID.',
                },
              ].map(step => (
                <div key={step.n} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-navy text-white text-xs font-bold rounded-full flex items-center justify-center">{step.n}</span>
                  <div>
                    <p className="font-semibold text-navy mb-0.5">{step.title}</p>
                    <p className="text-xs text-gray-600">{step.body}</p>
                    {step.link && (
                      <a href={step.link.href} target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5 text-xs font-semibold text-amber hover:underline">
                        {step.link.label}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API Key field */}
        <div>
          <label className={LBL}>LegiScan API Key</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste your LegiScan API key here..."
                className={INPUT}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <button onClick={saveKey} disabled={saving || !apiKey.trim()} className="bg-amber text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber/90 disabled:opacity-40 shrink-0">
              {saving ? 'Saving...' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button onClick={testConnection} disabled={testing || !apiKey.trim()} className="text-sm font-medium border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {isConnected && (
            <>
              <button onClick={syncNow} disabled={syncing} className="text-sm font-medium border border-navy text-navy px-4 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors disabled:opacity-40">
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button onClick={disconnect} className="text-sm font-medium border border-danger text-danger px-4 py-2 rounded-lg hover:bg-red-50">
                Disconnect
              </button>
            </>
          )}
        </div>

        {/* Test / sync result messages */}
        {testResult === 'ok'   && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">✓ API key is valid and connected to LegiScan.</p>}
        {testResult === 'fail' && <p className="text-sm text-danger bg-red-50 border border-danger rounded-lg px-4 py-2">✗ Connection failed. Check your API key and try again.</p>}
        {syncResult            && <p className="text-sm text-navy bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">{syncResult}</p>}
      </div>

      {/* Notification preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-navy">Notification Preferences</h3>
        <p className="text-xs text-gray-500">These preferences are stored locally on this device.</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={notifPriA} onChange={e => setNotifPriA(e.target.checked)} className="w-4 h-4 rounded accent-amber" />
          <span className="text-sm text-navy">Email me when a Priority A bill changes status</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={notifDeadline} onChange={e => setNotifDeadline(e.target.checked)} className="w-4 h-4 rounded accent-amber" />
          <span className="text-sm text-navy">Email me when a bill's next key date is within 7 days</span>
        </label>
        <button onClick={saveNotifPrefs} className="bg-navy text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-navy/90">
          Save Preferences
        </button>
      </div>

    </div>
  )
}
