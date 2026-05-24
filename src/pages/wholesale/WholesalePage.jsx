// WholesalePage v1.0 — Full Suite Wholesale Account Manager
/**
 * Lightweight CRM for managing wholesale relationships.
 * Order history is pulled from distribution_records — no order creation here.
 *
 * Tabs: Accounts | Performance | Follow-ups
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { useModalDraft } from '../../hooks/useModalDraft'
import LoadingSpinner from '../../components/LoadingSpinner'

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  'Restaurant', 'Bar', 'Hotel', 'Grocery Store', 'Bottle Shop',
  'Distributor', 'Chain Account', 'Event Venue', 'Other',
]
const STATUS_OPTIONS = ['active', 'inactive', 'prospect', 'lost']
const PAYMENT_TERMS  = ['Net 15', 'Net 30', 'Net 45', 'COD', 'Prepaid']
const DELIVERY_DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Multiple','Flexible']
const DELIVERY_FREQS = ['Weekly','Bi-weekly','Monthly','As needed']

const STATUS_STYLES = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-gray-500',
  lost:     'bg-red-100 text-red-500',
}

const PIE_COLORS = ['#C8871A','#1A2744','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

// Shared CSS helpers
const INPUT  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-amber/40'
const LBL    = 'block text-xs font-semibold text-gray-500 mb-1'
const EMPTY_CONTACT = { name: '', email: '', phone: '', role: '', is_primary: false }

// Empty form state for a new account
const EMPTY_FORM = {
  account_name: '', account_type: '', status: 'active',
  contacts: [{ ...EMPTY_CONTACT, is_primary: true }],
  address: '', city: '', state: '', zip: '',
  territory: '', assigned_rep: '', account_since: '',
  payment_terms: '', credit_limit: '',
  preferred_brands: '', delivery_day: '', delivery_frequency: '',
  pricing_notes: '', relationship_notes: '',
  last_contact_date: '', next_followup_date: '',
  distribution_account_id: '',
}

// ── Utility helpers ───────────────────────────────────────────────────────────

// Formats a date string as "May 24, 2026"
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Formats a number as "$1,234.56"
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Returns today as YYYY-MM-DD
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Days between a date string and today (positive = in the future)
function daysFromToday(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000)
}

// Returns the primary contact from a contacts array, or the first contact
function primaryContact(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return null
  return contacts.find(c => c.is_primary) ?? contacts[0]
}

// Computes per-account revenue stats from distribution_records rows
function computeAccountRevenue(records) {
  const today = todayStr()
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

  const total   = records.reduce((s, r) => s + (parseFloat(r.total_sale_value) || 0), 0)
  const rev30   = records.filter(r => r.delivery_date >= d30).reduce((s, r) => s + (parseFloat(r.total_sale_value) || 0), 0)
  const rev90   = records.filter(r => r.delivery_date >= d90).reduce((s, r) => s + (parseFloat(r.total_sale_value) || 0), 0)
  const orders30 = records.filter(r => r.delivery_date >= d30).length
  const orders90 = records.filter(r => r.delivery_date >= d90).length
  const avgOrder = records.length > 0 ? total / records.length : 0
  const lastOrderDate = records.reduce((latest, r) => {
    if (!r.delivery_date) return latest
    return !latest || r.delivery_date > latest ? r.delivery_date : latest
  }, null)
  const daysSinceLast = lastOrderDate
    ? Math.floor((new Date(today) - new Date(lastOrderDate + 'T00:00:00')) / 86400000)
    : null

  // Most ordered package type
  const typeCounts = {}
  records.forEach(r => { if (r.package_type) typeCounts[r.package_type] = (typeCounts[r.package_type] || 0) + 1 })
  const mostOrdered = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return { total, rev30, rev90, orders30, orders90, avgOrder, lastOrderDate, daysSinceLast, mostOrdered }
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function WholesalePage() {
  return (
    <TierGate requiredTier="full_suite" featureKey="wholesale_manager">
      <WholesaleManager />
    </TierGate>
  )
}

// ── WholesaleManager — root component inside the gate ─────────────────────────

function WholesaleManager() {
  const { brewery } = useAuth()
  const [activeTab, setTab] = usePersistedTab('wholesale_active_tab', 'accounts')

  // All wholesale accounts for this brewery
  const [accounts, setAccounts] = useState([])
  // All distribution_records rows (used by Performance + account detail)
  const [distRecords, setDistRecords] = useState([])
  // distribution_accounts for the "link" dropdown
  const [distAccounts, setDistAccounts] = useState([])
  // Contact log entries
  const [contactLog, setContactLog] = useState([])
  const [loading, setLoading] = useState(true)

  // Which account is open in detail view (null = list)
  const [detailAccount, setDetailAccount] = useState(null)
  // Add-account modal open state
  const [addOpen, setAddOpen] = useState(false)

  // Load all data
  const loadAll = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)
    const [acctRes, distRes, distAcctRes, logRes] = await Promise.all([
      supabase
        .from('wholesale_accounts')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('account_name'),
      supabase
        .from('distribution_records')
        .select('id, account_id, account_name, package_type, quantity, delivery_date, sale_price_per_unit, total_sale_value, returnable_kegs, kegs_returned')
        .eq('brewery_id', brewery.id)
        .not('delivery_date', 'is', null),
      supabase
        .from('distribution_accounts')
        .select('id, account_name, contact_name, contact_email, contacts')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true)
        .order('account_name'),
      supabase
        .from('wholesale_contact_log')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('contact_date', { ascending: false }),
    ])
    setAccounts(acctRes.data ?? [])
    setDistRecords(distRes.data ?? [])
    setDistAccounts(distAcctRes.data ?? [])
    setContactLog(logRes.data ?? [])
    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadAll() }, [loadAll])

  // Refresh detail account from updated accounts list
  useEffect(() => {
    if (detailAccount) {
      const updated = accounts.find(a => a.id === detailAccount.id)
      if (updated) setDetailAccount(updated)
    }
  }, [accounts])

  // Attach distribution records to each account (by account_id link or matching account_name)
  const accountsWithStats = useMemo(() => {
    return accounts.map(acct => {
      const records = distRecords.filter(r =>
        (acct.distribution_account_id && r.account_id === acct.distribution_account_id) ||
        r.account_name?.toLowerCase() === acct.account_name?.toLowerCase()
      )
      return { ...acct, _records: records, _stats: computeAccountRevenue(records) }
    })
  }, [accounts, distRecords])

  if (loading) return <LoadingSpinner message="Loading wholesale accounts..." />

  // If detail view is open, show it instead of the main list
  if (detailAccount) {
    const enriched = accountsWithStats.find(a => a.id === detailAccount.id) ?? detailAccount
    return (
      <AccountDetailView
        account={enriched}
        distAccounts={distAccounts}
        contactLog={contactLog.filter(l => l.wholesale_account_id === enriched.id)}
        brewery={brewery}
        onBack={() => setDetailAccount(null)}
        onSaved={loadAll}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-navy">Wholesale Account Manager</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage your wholesale relationships and track account performance.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {['accounts','performance','follow-ups'].map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-amber text-amber'
                : 'border-transparent text-gray-500 hover:text-navy'
            }`}
          >
            {tab === 'follow-ups' ? 'Follow-ups' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'accounts' && (
        <AccountsTab
          accounts={accountsWithStats}
          distAccounts={distAccounts}
          brewery={brewery}
          onView={setDetailAccount}
          onAdded={loadAll}
          addOpen={addOpen}
          setAddOpen={setAddOpen}
        />
      )}
      {activeTab === 'performance' && (
        <PerformanceTab accounts={accountsWithStats} distRecords={distRecords} />
      )}
      {activeTab === 'follow-ups' && (
        <FollowUpsTab
          accounts={accountsWithStats}
          contactLog={contactLog}
          brewery={brewery}
          onView={setDetailAccount}
          onLogged={loadAll}
        />
      )}
    </div>
  )
}

// ── TAB 1: Accounts ───────────────────────────────────────────────────────────

function AccountsTab({ accounts, distAccounts, brewery, onView, onAdded, addOpen, setAddOpen }) {
  const [search, setSearch]       = useState('')
  const [filterStatus, setStatus] = useState('')
  const [filterType, setType]     = useState('')
  const [filterRep, setRep]       = useState('')
  const [filterDay, setDay]       = useState('')

  const today = todayStr()

  // Derive unique filter options from data
  const repOptions = [...new Set(accounts.map(a => a.assigned_rep).filter(Boolean))].sort()
  const dayOptions = [...new Set(accounts.map(a => a.delivery_day).filter(Boolean))].sort()

  // Apply all active filters to the account list
  const filtered = useMemo(() => {
    return accounts.filter(a => {
      const q = search.toLowerCase()
      if (q && !a.account_name.toLowerCase().includes(q) && !(a.city || '').toLowerCase().includes(q)) return false
      if (filterStatus && a.status !== filterStatus) return false
      if (filterType && a.account_type !== filterType) return false
      if (filterRep && a.assigned_rep !== filterRep) return false
      if (filterDay && a.delivery_day !== filterDay) return false
      return true
    })
  }, [accounts, search, filterStatus, filterType, filterRep, filterDay])

  // Summary card counts
  const activeCount   = accounts.filter(a => a.status === 'active').length
  const prospectCount = accounts.filter(a => a.status === 'prospect').length
  const followupDue   = accounts.filter(a => a.next_followup_date && a.next_followup_date <= today).length
  const totalCount    = accounts.length

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Accounts',    value: activeCount,   color: 'text-green-600' },
          { label: 'Prospects',          value: prospectCount, color: 'text-blue-600' },
          { label: 'Follow-ups Due',     value: followupDue,   color: followupDue > 0 ? 'text-amber' : 'text-navy' },
          { label: 'Total Accounts',     value: totalCount,    color: 'text-navy' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters + Add button */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search accounts…"
          className={`${INPUT} max-w-xs`}
        />
        <select value={filterStatus} onChange={e => setStatus(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
        <select value={filterType} onChange={e => setType(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="">All types</option>
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {repOptions.length > 0 && (
          <select value={filterRep} onChange={e => setRep(e.target.value)} className={`${INPUT} w-auto`}>
            <option value="">All reps</option>
            {repOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {dayOptions.length > 0 && (
          <select value={filterDay} onChange={e => setDay(e.target.value)} className={`${INPUT} w-auto`}>
            <option value="">All days</option>
            {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button
          onClick={() => setAddOpen(true)}
          className="ml-auto bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Add Account
        </button>
      </div>

      {/* Account table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">🤝</p>
          <p className="text-sm">
            {accounts.length === 0
              ? 'No wholesale accounts yet. Add your first account to get started.'
              : 'No accounts match your filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Account</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Contact</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Location</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Delivery</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Rev 30d</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Follow-up</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(acct => {
                  const pc = primaryContact(acct.contacts)
                  const fu = acct.next_followup_date
                  const fuDays = daysFromToday(fu)
                  const fuClass = fuDays != null && fuDays < 0 ? 'text-danger' : fuDays === 0 ? 'text-amber font-semibold' : 'text-gray-500'
                  return (
                    <tr key={acct.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy">{acct.account_name}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {acct.account_type && (
                            <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded">{acct.account_type}</span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[acct.status] ?? ''}`}>
                            {acct.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {pc ? (
                          <>
                            <p className="text-navy text-xs font-medium">{pc.name}</p>
                            <p className="text-gray-400 text-xs">{pc.email || pc.phone || '—'}</p>
                          </>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                        {[acct.city, acct.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">
                        {[acct.delivery_day, acct.delivery_frequency].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs font-medium text-navy">
                        {acct._stats.rev30 > 0 ? fmtMoney(acct._stats.rev30) : '—'}
                      </td>
                      <td className={`px-4 py-3 hidden md:table-cell text-xs ${fuClass}`}>
                        {fu ? fmtDate(fu) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onView(acct)}
                          className="text-amber text-xs font-semibold hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Account modal */}
      <AddAccountModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        brewery={brewery}
        distAccounts={distAccounts}
        onSaved={() => { setAddOpen(false); onAdded() }}
      />
    </div>
  )
}

// ── Add Account modal ─────────────────────────────────────────────────────────

function AddAccountModal({ isOpen, onClose, brewery, distAccounts, onSaved }) {
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner, hasDraft } = useModalDraft('modal_draft_wholesale_account')

  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [linkDist, setLinkDist] = useState(false)
  const [showDistSuggestion, setShowDistSuggestion] = useState(false)
  const [suggestedDist, setSuggestedDist] = useState(null)
  const isDirty = form.account_name !== ''

  // Restore draft when modal opens
  useEffect(() => {
    if (!isOpen) return
    const draft = loadDraft()
    if (draft) {
      setForm(draft.form ?? EMPTY_FORM)
      setLinkDist(draft.linkDist ?? false)
    }
  }, [isOpen])

  // Suggest a matching distribution_account when the name changes
  useEffect(() => {
    if (!form.account_name || form.account_name.length < 3) { setSuggestedDist(null); setShowDistSuggestion(false); return }
    const q = form.account_name.toLowerCase()
    const match = distAccounts.find(d => d.account_name.toLowerCase().includes(q) || q.includes(d.account_name.toLowerCase()))
    if (match && !form.distribution_account_id) {
      setSuggestedDist(match)
      setShowDistSuggestion(true)
    }
  }, [form.account_name])

  // Save draft on form changes
  useEffect(() => {
    if (isDirty) saveDraft({ form, linkDist })
  }, [form, linkDist])

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  // Update a specific contact field by index
  function setContact(idx, key, val) {
    setForm(prev => {
      const contacts = prev.contacts.map((c, i) => i === idx ? { ...c, [key]: val } : c)
      return { ...prev, contacts }
    })
  }

  // Set one contact as primary and clear is_primary on all others
  function setPrimary(idx) {
    setForm(prev => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => ({ ...c, is_primary: i === idx })),
    }))
  }

  // Add a blank contact row
  function addContact() {
    setForm(prev => ({ ...prev, contacts: [...prev.contacts, { ...EMPTY_CONTACT }] }))
  }

  // Remove a contact by index
  function removeContact(idx) {
    setForm(prev => {
      const contacts = prev.contacts.filter((_, i) => i !== idx)
      // Ensure one contact remains primary
      if (contacts.length > 0 && !contacts.some(c => c.is_primary)) contacts[0].is_primary = true
      return { ...prev, contacts }
    })
  }

  // Auto-populate contact info from the linked distribution account
  function applyDistSuggestion(da) {
    const contacts = []
    if (Array.isArray(da.contacts) && da.contacts.length > 0) {
      da.contacts.forEach((c, i) => contacts.push({ name: c.name || '', email: c.email || '', phone: c.phone || '', role: c.title || '', is_primary: i === 0 }))
    } else if (da.contact_name) {
      contacts.push({ name: da.contact_name, email: da.contact_email || '', phone: '', role: '', is_primary: true })
    }
    setForm(prev => ({
      ...prev,
      distribution_account_id: da.id,
      contacts: contacts.length > 0 ? contacts : prev.contacts,
    }))
    setLinkDist(true)
    setShowDistSuggestion(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.account_name.trim()) { setError('Account name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      brewery_id:   brewery.id,
      account_name: form.account_name.trim(),
      account_type: form.account_type || null,
      status:       form.status,
      contacts:     form.contacts.filter(c => c.name.trim()),
      address:      form.address || null,
      city:         form.city || null,
      state:        form.state || null,
      zip:          form.zip || null,
      territory:    form.territory || null,
      assigned_rep: form.assigned_rep || null,
      account_since:        form.account_since || null,
      payment_terms:        form.payment_terms || null,
      credit_limit:         form.credit_limit ? parseFloat(form.credit_limit) : null,
      preferred_brands:     form.preferred_brands || null,
      delivery_day:         form.delivery_day || null,
      delivery_frequency:   form.delivery_frequency || null,
      pricing_notes:        form.pricing_notes || null,
      relationship_notes:   form.relationship_notes || null,
      last_contact_date:    form.last_contact_date || null,
      next_followup_date:   form.next_followup_date || null,
      distribution_account_id: (linkDist && form.distribution_account_id) ? form.distribution_account_id : null,
    }
    const { error: err } = await supabase.from('wholesale_accounts').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    clearDraft()
    setForm(EMPTY_FORM)
    setSaving(false)
    onSaved()
  }

  function handleClose() {
    setForm(EMPTY_FORM)
    clearDraft()
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      isDirty={isDirty}
      title="Add Wholesale Account"
      draftRestored={draftRestored}
      onDismissDraft={dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSave} className="space-y-5">

        {/* Distribution account suggestion banner */}
        {showDistSuggestion && suggestedDist && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-blue-700">
              Found <strong>{suggestedDist.account_name}</strong> in your Distribution module. Link it to auto-populate contact info?
            </p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => applyDistSuggestion(suggestedDist)} className="text-xs font-semibold text-blue-700 hover:underline">Link</button>
              <button type="button" onClick={() => setShowDistSuggestion(false)} className="text-xs text-gray-400 hover:underline">Dismiss</button>
            </div>
          </div>
        )}

        {/* Core identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={LBL}>Account Name *</label>
            <input value={form.account_name} onChange={e => setField('account_name', e.target.value)} className={INPUT} placeholder="e.g. The Rusty Tap" required />
          </div>
          <div>
            <label className={LBL}>Account Type</label>
            <select value={form.account_type} onChange={e => setField('account_type', e.target.value)} className={INPUT}>
              <option value="">Select type…</option>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Status</label>
            <select value={form.status} onChange={e => setField('status', e.target.value)} className={INPUT}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Contacts */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Contacts</p>
          <div className="space-y-3">
            {form.contacts.map((c, idx) => (
              <div key={idx} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Contact {idx + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                      <input type="radio" checked={c.is_primary} onChange={() => setPrimary(idx)} className="accent-amber" />
                      Primary
                    </label>
                    {form.contacts.length > 1 && (
                      <button type="button" onClick={() => removeContact(idx)} className="text-xs text-danger hover:underline">Remove</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={c.name} onChange={e => setContact(idx, 'name', e.target.value)} placeholder="Name" className={INPUT} />
                  <input value={c.role} onChange={e => setContact(idx, 'role', e.target.value)} placeholder="Title / Role" className={INPUT} />
                  <input value={c.email} onChange={e => setContact(idx, 'email', e.target.value)} placeholder="Email" type="email" className={INPUT} />
                  <input value={c.phone} onChange={e => setContact(idx, 'phone', e.target.value)} placeholder="Phone" className={INPUT} />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addContact} className="mt-2 text-xs text-amber font-semibold hover:underline">+ Add another contact</button>
        </div>

        {/* Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={LBL}>Address</label>
            <input value={form.address} onChange={e => setField('address', e.target.value)} className={INPUT} placeholder="Street address" />
          </div>
          <div>
            <label className={LBL}>City</label>
            <input value={form.city} onChange={e => setField('city', e.target.value)} className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LBL}>State</label>
              <input value={form.state} onChange={e => setField('state', e.target.value)} className={INPUT} maxLength={2} placeholder="TX" />
            </div>
            <div>
              <label className={LBL}>ZIP</label>
              <input value={form.zip} onChange={e => setField('zip', e.target.value)} className={INPUT} maxLength={10} />
            </div>
          </div>
        </div>

        {/* Sales management */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Territory</label>
            <input value={form.territory} onChange={e => setField('territory', e.target.value)} className={INPUT} placeholder="e.g. North Austin" />
          </div>
          <div>
            <label className={LBL}>Assigned Rep</label>
            <input value={form.assigned_rep} onChange={e => setField('assigned_rep', e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Account Since</label>
            <input type="date" value={form.account_since} onChange={e => setField('account_since', e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Payment Terms</label>
            <select value={form.payment_terms} onChange={e => setField('payment_terms', e.target.value)} className={INPUT}>
              <option value="">Select…</option>
              {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Credit Limit ($)</label>
            <input type="number" min="0" value={form.credit_limit} onChange={e => setField('credit_limit', e.target.value)} className={INPUT} placeholder="Optional" />
          </div>
        </div>

        {/* Delivery preferences */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Delivery Day</label>
            <select value={form.delivery_day} onChange={e => setField('delivery_day', e.target.value)} className={INPUT}>
              <option value="">Select…</option>
              {DELIVERY_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Delivery Frequency</label>
            <select value={form.delivery_frequency} onChange={e => setField('delivery_frequency', e.target.value)} className={INPUT}>
              <option value="">Select…</option>
              {DELIVERY_FREQS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={LBL}>Preferred Brands / Beers</label>
          <textarea value={form.preferred_brands} onChange={e => setField('preferred_brands', e.target.value)} rows={2} className={INPUT} placeholder="Which of your beers does this account carry?" />
        </div>
        <div>
          <label className={LBL}>Pricing Notes</label>
          <textarea value={form.pricing_notes} onChange={e => setField('pricing_notes', e.target.value)} rows={2} className={INPUT} placeholder="Any special pricing arrangements…" />
        </div>
        <div>
          <label className={LBL}>Relationship Notes</label>
          <textarea value={form.relationship_notes} onChange={e => setField('relationship_notes', e.target.value)} rows={2} className={INPUT} />
        </div>

        {/* Follow-up */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Last Contact Date</label>
            <input type="date" value={form.last_contact_date} onChange={e => setField('last_contact_date', e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Next Follow-up Date</label>
            <input type="date" value={form.next_followup_date} onChange={e => setField('next_followup_date', e.target.value)} className={INPUT} />
          </div>
        </div>

        {/* Distribution account link */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={linkDist} onChange={e => setLinkDist(e.target.checked)} className="accent-amber" />
            Link to a Distribution module account for order history
          </label>
          {linkDist && (
            <div className="mt-2">
              <select value={form.distribution_account_id} onChange={e => setField('distribution_account_id', e.target.value)} className={INPUT}>
                <option value="">Select distribution account…</option>
                {distAccounts.map(d => <option key={d.id} value={d.id}>{d.account_name}</option>)}
              </select>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleClose} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Save Account'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Account Detail View ───────────────────────────────────────────────────────

function AccountDetailView({ account, distAccounts, contactLog, brewery, onBack, onSaved }) {
  const [activeTab, setTab] = usePersistedTab('wholesale_detail_tab', 'overview')
  const [form, setForm]     = useState({ ...account })
  const [saving, setSaving] = useState(false)

  // Auto-save a single field on blur
  async function saveField(key, val) {
    setSaving(true)
    await supabase.from('wholesale_accounts').update({ [key]: val || null }).eq('id', account.id)
    setSaving(false)
    onSaved()
  }

  function fieldProps(key) {
    return {
      value: form[key] ?? '',
      onChange: e => setForm(prev => ({ ...prev, [key]: e.target.value })),
      onBlur:   e => saveField(key, e.target.value),
    }
  }

  const pc = primaryContact(form.contacts)
  const outstandingKegs = (account._records ?? []).filter(r => r.returnable_kegs && !r.kegs_returned).length

  return (
    <div className="space-y-5">
      {/* Back button + header */}
      <div>
        <button onClick={onBack} className="text-amber text-sm hover:underline mb-2">← Back to accounts</button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-navy">{account.account_name}</h2>
            <div className="flex flex-wrap gap-2 mt-1">
              {account.account_type && <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded">{account.account_type}</span>}
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLES[account.status] ?? ''}`}>{account.status}</span>
              {saving && <span className="text-xs text-gray-400">Saving…</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Detail tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['overview','orders','contacts','follow-up'].map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab ? 'border-amber text-amber' : 'border-transparent text-gray-500 hover:text-navy'
            }`}
          >
            {tab === 'follow-up' ? 'Follow-up' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview tab — editable fields with auto-save on blur */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Account health summary from distribution_records */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-navy mb-3">Account Health</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Total Orders</p>
                <p className="text-xl font-bold text-navy">{account._records?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Revenue</p>
                <p className="text-xl font-bold text-navy">{fmtMoney(account._stats?.total)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Avg Order Value</p>
                <p className="text-xl font-bold text-navy">{fmtMoney(account._stats?.avgOrder)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Last Order</p>
                <p className="text-sm font-semibold text-navy">{fmtDate(account._stats?.lastOrderDate)}</p>
              </div>
            </div>
            {account._stats?.mostOrdered && (
              <p className="text-xs text-gray-400 mt-3">Most ordered: <span className="font-medium text-gray-600">{account._stats.mostOrdered}</span></p>
            )}
            {outstandingKegs > 0 && (
              <div className="mt-3 bg-amber/10 border border-amber rounded-lg px-3 py-2 text-xs text-amber-dark font-medium">
                ⚠ {outstandingKegs} keg{outstandingKegs > 1 ? 's' : ''} outstanding (unreturned)
              </div>
            )}
          </div>

          {/* Editable fields */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-navy">Account Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Account Name</label>
                <input {...fieldProps('account_name')} className={INPUT} />
              </div>
              <div>
                <label className={LBL}>Account Type</label>
                <select value={form.account_type ?? ''} onChange={e => setForm(p => ({...p, account_type: e.target.value}))} onBlur={e => saveField('account_type', e.target.value)} className={INPUT}>
                  <option value="">Select…</option>
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Status</label>
                <select value={form.status ?? 'active'} onChange={e => setForm(p => ({...p, status: e.target.value}))} onBlur={e => saveField('status', e.target.value)} className={INPUT}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Territory</label>
                <input {...fieldProps('territory')} className={INPUT} />
              </div>
              <div>
                <label className={LBL}>Assigned Rep</label>
                <input {...fieldProps('assigned_rep')} className={INPUT} />
              </div>
              <div>
                <label className={LBL}>Account Since</label>
                <input type="date" {...fieldProps('account_since')} className={INPUT} />
              </div>
              <div>
                <label className={LBL}>Payment Terms</label>
                <select value={form.payment_terms ?? ''} onChange={e => setForm(p => ({...p, payment_terms: e.target.value}))} onBlur={e => saveField('payment_terms', e.target.value)} className={INPUT}>
                  <option value="">Select…</option>
                  {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Credit Limit ($)</label>
                <input type="number" min="0" {...fieldProps('credit_limit')} className={INPUT} />
              </div>
              <div>
                <label className={LBL}>Delivery Day</label>
                <select value={form.delivery_day ?? ''} onChange={e => setForm(p => ({...p, delivery_day: e.target.value}))} onBlur={e => saveField('delivery_day', e.target.value)} className={INPUT}>
                  <option value="">Select…</option>
                  {DELIVERY_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Delivery Frequency</label>
                <select value={form.delivery_frequency ?? ''} onChange={e => setForm(p => ({...p, delivery_frequency: e.target.value}))} onBlur={e => saveField('delivery_frequency', e.target.value)} className={INPUT}>
                  <option value="">Select…</option>
                  {DELIVERY_FREQS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={LBL}>Address</label>
                <input {...fieldProps('address')} className={INPUT} placeholder="Street address" />
              </div>
              <div>
                <label className={LBL}>City</label>
                <input {...fieldProps('city')} className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={LBL}>State</label>
                  <input {...fieldProps('state')} className={INPUT} maxLength={2} />
                </div>
                <div>
                  <label className={LBL}>ZIP</label>
                  <input {...fieldProps('zip')} className={INPUT} maxLength={10} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={LBL}>Preferred Brands</label>
                <textarea {...fieldProps('preferred_brands')} rows={2} className={INPUT} />
              </div>
              <div className="sm:col-span-2">
                <label className={LBL}>Pricing Notes</label>
                <textarea {...fieldProps('pricing_notes')} rows={2} className={INPUT} />
              </div>
              <div className="sm:col-span-2">
                <label className={LBL}>Relationship Notes</label>
                <textarea {...fieldProps('relationship_notes')} rows={3} className={INPUT} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Orders tab — pulled from distribution_records */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy">Order History</h3>
            <Link to="/distribution" className="text-amber text-sm hover:underline">Create new order → Distribution</Link>
          </div>
          {(!account._records || account._records.length === 0) ? (
            <p className="text-sm text-gray-400 text-center py-6">No orders found. Orders are created in the <Link to="/distribution" className="text-amber hover:underline">Distribution module</Link>.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="pb-2 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Package</th>
                    <th className="pb-2 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                    <th className="pb-2 text-xs font-semibold text-gray-500 uppercase">Price/Unit</th>
                    <th className="pb-2 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...account._records].sort((a,b) => (b.delivery_date??'').localeCompare(a.delivery_date??'')).map(r => (
                    <tr key={r.id}>
                      <td className="py-2 text-gray-600">{fmtDate(r.delivery_date)}</td>
                      <td className="py-2 text-gray-600 hidden sm:table-cell">{r.package_type || '—'}</td>
                      <td className="py-2 text-gray-600">{r.quantity}</td>
                      <td className="py-2 text-gray-600">{r.sale_price_per_unit != null ? fmtMoney(r.sale_price_per_unit) : '—'}</td>
                      <td className="py-2 font-medium text-navy">{r.total_sale_value != null ? fmtMoney(r.total_sale_value) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Contacts tab */}
      {activeTab === 'contacts' && (
        <ContactsTab account={account} brewery={brewery} onSaved={onSaved} />
      )}

      {/* Follow-up tab */}
      {activeTab === 'follow-up' && (
        <FollowUpDetailTab account={account} contactLog={contactLog} brewery={brewery} onSaved={onSaved} saveField={saveField} fieldProps={fieldProps} form={form} />
      )}
    </div>
  )
}

// ── Contacts sub-tab ──────────────────────────────────────────────────────────

function ContactsTab({ account, brewery, onSaved }) {
  const [contacts, setContacts] = useState(account.contacts ?? [])
  const [saving, setSaving]     = useState(false)
  const [logOpen, setLogOpen]   = useState(false)

  // Save the full contacts array on blur of any field
  async function saveContacts(updated) {
    setSaving(true)
    await supabase.from('wholesale_accounts').update({ contacts: updated }).eq('id', account.id)
    setSaving(false)
    onSaved()
  }

  function setContact(idx, key, val) {
    const updated = contacts.map((c, i) => i === idx ? { ...c, [key]: val } : c)
    setContacts(updated)
    return updated
  }

  async function addContact() {
    const updated = [...contacts, { ...EMPTY_CONTACT }]
    setContacts(updated)
    await saveContacts(updated)
  }

  async function removeContact(idx) {
    const updated = contacts.filter((_, i) => i !== idx)
    if (updated.length > 0 && !updated.some(c => c.is_primary)) updated[0].is_primary = true
    setContacts(updated)
    await saveContacts(updated)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy">Contacts</h3>
        <div className="flex gap-2">
          <button onClick={() => setLogOpen(true)} className="text-xs text-amber font-semibold hover:underline">Log Contact</button>
          <span className="text-gray-300">|</span>
          <button onClick={addContact} className="text-xs text-amber font-semibold hover:underline">+ Add Contact</button>
        </div>
      </div>

      {saving && <p className="text-xs text-gray-400">Saving…</p>}

      {contacts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No contacts yet.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((c, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="radio"
                    checked={c.is_primary}
                    onChange={async () => {
                      const updated = contacts.map((x, i) => ({ ...x, is_primary: i === idx }))
                      setContacts(updated)
                      await saveContacts(updated)
                    }}
                    className="accent-amber"
                  />
                  Primary contact
                </label>
                <button onClick={() => removeContact(idx)} className="text-xs text-danger hover:underline">Remove</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Name</label>
                  <input
                    value={c.name}
                    onChange={e => setContact(idx, 'name', e.target.value)}
                    onBlur={() => saveContacts(contacts)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LBL}>Role / Title</label>
                  <input
                    value={c.role}
                    onChange={e => setContact(idx, 'role', e.target.value)}
                    onBlur={() => saveContacts(contacts)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LBL}>Email</label>
                  <input
                    type="email"
                    value={c.email}
                    onChange={e => setContact(idx, 'email', e.target.value)}
                    onBlur={() => saveContacts(contacts)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LBL}>Phone</label>
                  <input
                    value={c.phone}
                    onChange={e => setContact(idx, 'phone', e.target.value)}
                    onBlur={() => saveContacts(contacts)}
                    className={INPUT}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Log contact modal */}
      <LogContactModal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        account={account}
        brewery={brewery}
        onLogged={onSaved}
      />
    </div>
  )
}

// ── Follow-up sub-tab ─────────────────────────────────────────────────────────

function FollowUpDetailTab({ account, contactLog, brewery, onSaved, saveField, fieldProps, form }) {
  const [logOpen, setLogOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* Next follow-up date */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-navy">Follow-up Schedule</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Last Contact Date</label>
            <input type="date" {...fieldProps('last_contact_date')} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Next Follow-up Date</label>
            <input type="date" {...fieldProps('next_followup_date')} className={INPUT} />
          </div>
        </div>
        <div>
          <label className={LBL}>Relationship Notes</label>
          <textarea {...fieldProps('relationship_notes')} rows={3} className={INPUT} />
        </div>
        <button
          onClick={() => setLogOpen(true)}
          className="bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Log Contact
        </button>
      </div>

      {/* Contact history */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-navy mb-3">Contact History</h3>
        {contactLog.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No contact history yet.</p>
        ) : (
          <div className="space-y-3">
            {contactLog.map(entry => (
              <div key={entry.id} className="border-l-2 border-amber/30 pl-3 py-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-navy">{fmtDate(entry.contact_date)}</span>
                  {entry.contact_person && <span className="text-xs text-gray-500">· {entry.contact_person}</span>}
                  {entry.logged_by && <span className="text-xs text-gray-400">by {entry.logged_by}</span>}
                </div>
                {entry.notes && <p className="text-sm text-gray-600 mt-0.5">{entry.notes}</p>}
                {entry.next_followup_date && (
                  <p className="text-xs text-amber mt-0.5">Next follow-up set: {fmtDate(entry.next_followup_date)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <LogContactModal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        account={account}
        brewery={brewery}
        onLogged={onSaved}
      />
    </div>
  )
}

// ── Log Contact modal ─────────────────────────────────────────────────────────

function LogContactModal({ isOpen, onClose, account, brewery, onLogged }) {
  const today = todayStr()
  const [form, setForm] = useState({ contact_date: today, contact_person: '', logged_by: '', notes: '', next_followup_date: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (isOpen) setForm({ contact_date: today, contact_person: '', logged_by: '', notes: '', next_followup_date: '' }) }, [isOpen])

  const pc = primaryContact(account.contacts)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('wholesale_contact_log').insert({
      brewery_id:           brewery.id,
      wholesale_account_id: account.id,
      contact_date:         form.contact_date,
      contact_person:       form.contact_person || null,
      logged_by:            form.logged_by || null,
      notes:                form.notes || null,
      next_followup_date:   form.next_followup_date || null,
    })
    if (!error && form.next_followup_date) {
      // Update the parent account's follow-up date
      await supabase.from('wholesale_accounts').update({
        last_contact_date:  form.contact_date,
        next_followup_date: form.next_followup_date,
      }).eq('id', account.id)
    } else if (!error) {
      await supabase.from('wholesale_accounts').update({ last_contact_date: form.contact_date }).eq('id', account.id)
    }
    setSaving(false)
    if (!error) { onLogged(); onClose() }
  }

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} isDirty={!!form.notes} title={`Log Contact — ${account.account_name}`} maxWidth="max-w-md">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Date</label>
            <input type="date" value={form.contact_date} onChange={e => setForm(p => ({...p, contact_date: e.target.value}))} className={INPUT} required />
          </div>
          <div>
            <label className={LBL}>Contact Person</label>
            <input value={form.contact_person} onChange={e => setForm(p => ({...p, contact_person: e.target.value}))} className={INPUT} placeholder={pc?.name || 'Name…'} />
          </div>
        </div>
        <div>
          <label className={LBL}>Logged By</label>
          <input value={form.logged_by} onChange={e => setForm(p => ({...p, logged_by: e.target.value}))} className={INPUT} placeholder="Your name" />
        </div>
        <div>
          <label className={LBL}>Notes</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} rows={3} className={INPUT} placeholder="What was discussed?" />
        </div>
        <div>
          <label className={LBL}>Set Next Follow-up Date</label>
          <input type="date" value={form.next_followup_date} onChange={e => setForm(p => ({...p, next_followup_date: e.target.value}))} className={INPUT} />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-60">
            {saving ? 'Saving…' : 'Log Contact'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── TAB 2: Performance ────────────────────────────────────────────────────────

function PerformanceTab({ accounts, distRecords }) {
  const [timeRange, setTimeRange] = useState('all')
  const today = todayStr()

  // Filter records by selected time range
  const filteredRecords = useMemo(() => {
    if (timeRange === 'all') return distRecords
    const days = timeRange === '90d' ? 90 : timeRange === '30d' ? 30 : 365
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return distRecords.filter(r => r.delivery_date >= cutoff)
  }, [distRecords, timeRange])

  // Top 10 accounts by revenue (from filtered records)
  const topByRevenue = useMemo(() => {
    const byName = {}
    filteredRecords.forEach(r => {
      const name = r.account_name || 'Unknown'
      byName[name] = (byName[name] || 0) + (parseFloat(r.total_sale_value) || 0)
    })
    return Object.entries(byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, revenue]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, revenue: parseFloat(revenue.toFixed(2)) }))
  }, [filteredRecords])

  // Revenue by account type (from wholesale_accounts + their filtered records)
  const byType = useMemo(() => {
    const map = {}
    accounts.forEach(acct => {
      const type = acct.account_type || 'Other'
      const rev = filteredRecords
        .filter(r => r.account_name?.toLowerCase() === acct.account_name?.toLowerCase() || (acct.distribution_account_id && r.account_id === acct.distribution_account_id))
        .reduce((s, r) => s + (parseFloat(r.total_sale_value) || 0), 0)
      map[type] = (map[type] || 0) + rev
    })
    return Object.entries(map).filter(([,v]) => v > 0).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
  }, [accounts, filteredRecords])

  // Activity table with computed stats per account
  const activityRows = useMemo(() => {
    return accounts.map(acct => {
      const s = acct._stats
      return { ...acct, ...s }
    }).sort((a, b) => (b.rev30 || 0) - (a.rev30 || 0))
  }, [accounts])

  // Active accounts with no orders in 60+ days
  const atRisk = activityRows.filter(a => a.status === 'active' && (a.daysSinceLast == null || a.daysSinceLast > 60))

  return (
    <div className="space-y-5">
      {/* Time range selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Period:</span>
        {[['30d','30 days'],['90d','90 days'],['365d','1 year'],['all','All time']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTimeRange(val)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${timeRange === val ? 'bg-amber text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* At-risk accounts alert */}
      {atRisk.length > 0 && (
        <div className="bg-amber/10 border border-amber rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-dark mb-1">⚠ {atRisk.length} active account{atRisk.length > 1 ? 's' : ''} with no orders in 60+ days</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {atRisk.map(a => (
              <span key={a.id} className="text-xs bg-white border border-amber/30 text-amber-dark px-2 py-0.5 rounded">
                {a.account_name} {a.daysSinceLast != null ? `(${a.daysSinceLast}d)` : '(no orders)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top accounts bar chart */}
      {topByRevenue.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-navy mb-4">Top Accounts by Revenue</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topByRevenue} margin={{ top: 0, right: 8, left: 0, bottom: 40 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={45} />
              <Tooltip formatter={v => [`$${v.toLocaleString()}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#C8871A" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenue by type pie chart */}
      {byType.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-navy mb-4">Revenue by Account Type</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {byType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => `$${v.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Activity table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-navy">Account Activity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Account</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Orders 30d</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Rev 30d</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Rev 90d</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Avg Order</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activityRows.map(a => {
                const dsl = a.daysSinceLast
                const dslClass = dsl == null ? 'text-gray-400' : dsl <= 30 ? 'text-green-600' : dsl <= 60 ? 'text-amber' : 'text-danger'
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-navy">{a.account_name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[a.status] ?? ''}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 hidden sm:table-cell">{a.orders30}</td>
                    <td className="px-4 py-2.5 font-medium text-navy hidden sm:table-cell">{a.rev30 > 0 ? fmtMoney(a.rev30) : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 hidden md:table-cell">{a.rev90 > 0 ? fmtMoney(a.rev90) : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 hidden lg:table-cell">{a.avgOrder > 0 ? fmtMoney(a.avgOrder) : '—'}</td>
                    <td className={`px-4 py-2.5 text-xs ${dslClass}`}>
                      {dsl == null ? 'No orders' : dsl === 0 ? 'Today' : `${dsl}d ago`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── TAB 3: Follow-ups ─────────────────────────────────────────────────────────

function FollowUpsTab({ accounts, contactLog, brewery, onView, onLogged }) {
  const [logTarget, setLogTarget] = useState(null)
  const today = todayStr()
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const thirtyFromNow = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  // Partition accounts with a follow-up date into groups
  const withFollowup = accounts.filter(a => a.next_followup_date).sort((a, b) => a.next_followup_date.localeCompare(b.next_followup_date))
  const overdue  = withFollowup.filter(a => a.next_followup_date < today)
  const dueToday = withFollowup.filter(a => a.next_followup_date === today)
  const thisWeek = withFollowup.filter(a => a.next_followup_date > today && a.next_followup_date <= weekFromNow)
  const upcoming = withFollowup.filter(a => a.next_followup_date > weekFromNow && a.next_followup_date <= thirtyFromNow)
  const noDate   = accounts.filter(a => !a.next_followup_date && a.status === 'active')

  function FollowUpRow({ account, variant }) {
    const pc = primaryContact(account.contacts)
    const rowClass = variant === 'overdue' ? 'border-l-2 border-danger' : variant === 'today' ? 'border-l-2 border-amber' : 'border-l-2 border-gray-200'
    return (
      <div className={`bg-white rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${rowClass}`}>
        <div className="flex-1 min-w-0">
          <button onClick={() => onView(account)} className="font-medium text-navy hover:underline text-sm text-left">{account.account_name}</button>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
            {pc?.name && <span>{pc.name}</span>}
            <span className={variant === 'overdue' ? 'text-danger font-medium' : variant === 'today' ? 'text-amber font-medium' : ''}>
              {fmtDate(account.next_followup_date)}
              {variant === 'overdue' && ' (overdue)'}
            </span>
          </div>
          {account.relationship_notes && (
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">{account.relationship_notes}</p>
          )}
        </div>
        <button
          onClick={() => setLogTarget(account)}
          className="text-xs font-semibold text-amber border border-amber px-3 py-1.5 rounded-lg hover:bg-amber/5 transition-colors shrink-0"
        >
          Log Contact
        </button>
      </div>
    )
  }

  const empty = overdue.length + dueToday.length + thisWeek.length + upcoming.length === 0

  return (
    <div className="space-y-5">
      {empty && noDate.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm">No follow-ups scheduled. Add follow-up dates when editing accounts.</p>
        </div>
      )}

      {overdue.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-danger uppercase tracking-wide mb-2">Overdue ({overdue.length})</p>
          <div className="space-y-2">{overdue.map(a => <FollowUpRow key={a.id} account={a} variant="overdue" />)}</div>
        </div>
      )}
      {dueToday.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-2">Due Today ({dueToday.length})</p>
          <div className="space-y-2">{dueToday.map(a => <FollowUpRow key={a.id} account={a} variant="today" />)}</div>
        </div>
      )}
      {thisWeek.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-navy uppercase tracking-wide mb-2">This Week ({thisWeek.length})</p>
          <div className="space-y-2">{thisWeek.map(a => <FollowUpRow key={a.id} account={a} variant="week" />)}</div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Next 30 Days ({upcoming.length})</p>
          <div className="space-y-2">{upcoming.map(a => <FollowUpRow key={a.id} account={a} variant="upcoming" />)}</div>
        </div>
      )}
      {noDate.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Active — No Follow-up Set ({noDate.length})</p>
          <div className="space-y-2">{noDate.map(a => <FollowUpRow key={a.id} account={a} variant="none" />)}</div>
        </div>
      )}

      {logTarget && (
        <LogContactModal
          isOpen={!!logTarget}
          onClose={() => setLogTarget(null)}
          account={logTarget}
          brewery={brewery}
          onLogged={() => { setLogTarget(null); onLogged() }}
        />
      )}
    </div>
  )
}
