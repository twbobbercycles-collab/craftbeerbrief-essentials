/**
 * GrantsPage — Grant & Funding Finder module.
 * Loads all approved grants from Supabase, then filters and sorts them client-side.
 * Supports full-text search, type/status/amount/state/category/loan filtering,
 * bookmarking, deadline alerts, and user grant submissions with persistent draft support.
 */
import { useEffect, useState, useMemo } from 'react'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useModalDraft } from '../../hooks/useModalDraft'
import GrantCard from './GrantCard'
import SubmitGrantModal from './SubmitGrantModal'
import { getDisplayStatus, matchesAmountFilter, isAvailableInState, getStateCode, FUNDING_TYPES } from './grantsUtils'
import { useReadOnly } from '../../hooks/useReadOnly'

// ── Small helper components used only on this page ──────────────────────────

// A styled <select> element used for all filter dropdowns.
// Options with disabled:true render as unselectable separators/headings.
function FilterSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber">
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={!!o.disabled}>{o.label}</option>
      ))}
    </select>
  )
}

// Returns true when a grant should be treated as federal / nationwide.
// Used by the Source filter to distinguish federal from state-specific programs.
function isFederalOrNationwide(grant) {
  if (grant.is_federal) return true
  const states = grant.states_eligible ?? []
  if (states.length === 0) return true
  return states.some(s => {
    const lower = s.toLowerCase()
    return lower === 'nationwide' || lower === 'all states'
  })
}

// Tab button for "All Grants" / "Bookmarked" tab switcher
function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
        active ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
      }`}>
      {children}
    </button>
  )
}

// One animated placeholder card shown while grants are loading
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
          </div>
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <div className="h-3 w-full bg-gray-100 rounded" />
          <div className="h-3 w-5/6 bg-gray-100 rounded" />
        </div>
        <div className="h-6 w-6 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

// Renders 5 skeleton cards so the page never looks blank while loading
function SkeletonGrid() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

// ── Main page component ──────────────────────────────────────────────────────

export default function GrantsPage() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  // Draft persistence — survives tab switches and accidental closes
  const { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner, hasDraft } =
    useModalDraft('modal_draft_grant_submission')

  // All approved grants from the database
  const [grants, setGrants]       = useState([])
  // Map of grant_id → saved row — tells us which grants are bookmarked and if alert is on
  const [savedMap, setSavedMap]   = useState(new Map())
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)

  // UI state
  const [activeTab, setActiveTab]             = usePersistedTab('grants_active_tab', 'all')
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submitSuccess, setSubmitSuccess]     = useState(false)
  // Draft data to pre-fill the modal with when opening from DraftNoticeBar or the button
  const [draftDataForModal, setDraftDataForModal] = useState(null)

  // Filter + sort state
  const [searchRaw, setSearchRaw]           = useState('')   // Raw input — debounced below
  const [search, setSearch]                 = useState('')   // Debounced — used for filtering
  const [typeFilter, setTypeFilter]         = useState('all')
  const [statusFilter, setStatusFilter]     = useState('all')
  const [amountFilter, setAmountFilter]     = useState('all')
  const [loanFilter, setLoanFilter]         = useState('all')   // 'all' | 'grants_only' | 'loans_only'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [relevanceFilter, setRelevanceFilter] = useState('all') // 'all' | '4_5' | '3_plus'
  const [govLevelFilter, setGovLevelFilter]   = useState('all') // 'all' | 'federal' | 'state' | 'local'
  const [sourceFilter, setSourceFilter]     = useState(         // 'all' | 'federal_only' | 'state_only' | 'my_state_federal'
    () => localStorage.getItem('grants_source_filter') ?? 'all'
  )
  const [sortBy, setSortBy]                 = useState('relevance')
  // Read the saved preference from localStorage on mount.
  // null means no value has ever been saved (first visit) — will be set from brewery data below.
  const [myStateOnly, setMyStateOnly] = useState(() => {
    const saved = localStorage.getItem('grants_my_state_only')
    if (saved === null) return null   // First visit — initialize from brewery state in effect below
    return saved === 'true'
  })

  // Persist filter preferences to localStorage whenever they change.
  // Skip myStateOnly null — that is the "not yet initialized" sentinel, not a real user choice.
  useEffect(() => {
    if (myStateOnly === null) return
    localStorage.setItem('grants_my_state_only', String(myStateOnly))
  }, [myStateOnly])

  useEffect(() => {
    localStorage.setItem('grants_source_filter', sourceFilter)
  }, [sourceFilter])

  // On first load: fetch grants and set the toggle default for brand-new visitors
  useEffect(() => {
    if (!brewery?.id) return
    // Only set a default when there is no saved preference yet (first ever visit).
    // After the first visit the localStorage value takes full priority.
    if (myStateOnly === null) {
      setMyStateOnly(!!brewery.state)  // ON if brewery has a state, OFF if not
    }
    loadAll()
  }, [brewery?.id])

  // Debounce the search input — wait 300ms after the user stops typing before filtering
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchRaw), 300)
    return () => clearTimeout(timer)
  }, [searchRaw])

  // Loads all approved grants and this brewery's bookmarks at the same time
  async function loadAll() {
    setLoading(true)
    setLoadError(null)

    const [grantsResult, savedResult] = await Promise.all([
      supabase.from('grants').select('*').eq('approved', true).order('created_at', { ascending: false }),
      supabase.from('brewery_saved_grants').select('*').eq('brewery_id', brewery.id),
    ])

    if (grantsResult.error) {
      setLoadError('Unable to load grants. Please try refreshing the page.')
      setLoading(false)
      return
    }

    setGrants(grantsResult.data ?? [])

    // Build a Map for O(1) bookmark lookups
    const map = new Map()
    for (const row of (savedResult.data ?? [])) map.set(row.grant_id, row)
    setSavedMap(map)
    setLoading(false)
  }

  // Adds or removes the bookmark for a grant — optimistic UI update
  async function toggleBookmark(grantId) {
    const existing = savedMap.get(grantId)
    if (existing) {
      await supabase.from('brewery_saved_grants').delete().eq('id', existing.id)
      const next = new Map(savedMap)
      next.delete(grantId)
      setSavedMap(next)
    } else {
      const { data } = await supabase
        .from('brewery_saved_grants')
        .insert({ brewery_id: brewery.id, grant_id: grantId })
        .select().single()
      if (data) {
        const next = new Map(savedMap)
        next.set(grantId, data)
        setSavedMap(next)
      }
    }
  }

  // Turns the 30-day deadline email alert on or off for a bookmarked grant
  async function toggleAlert(grantId) {
    const existing = savedMap.get(grantId)
    if (!existing) return
    const newVal = !existing.alert_enabled
    await supabase.from('brewery_saved_grants').update({ alert_enabled: newVal }).eq('id', existing.id)
    const next = new Map(savedMap)
    next.set(grantId, { ...existing, alert_enabled: newVal })
    setSavedMap(next)
  }

  // Opens the submit modal and pre-fills it with any saved draft.
  // showBannerInModal=false when the user clicked "Continue Draft" in the page bar
  // (they already know about the draft, so we don't need the in-modal amber banner).
  function openSubmitModal(showBannerInModal = true) {
    const draft = hasDraft ? loadDraft(showBannerInModal) : null
    setDraftDataForModal(draft)
    setShowSubmitModal(true)
  }

  // Called when the user explicitly closes or discards the modal — clears the draft
  function handleModalClose() {
    clearDraft()
    setDraftDataForModal(null)
    setShowSubmitModal(false)
  }

  // Called after a successful grant submission — clears draft and shows page success banner
  function handleSubmitSuccess() {
    clearDraft()
    setDraftDataForModal(null)
    setShowSubmitModal(false)
    setSubmitSuccess(true)
  }

  // Most recent last_reviewed_at across all manually curated grants
  const dbLastUpdated = useMemo(() => {
    const dates = grants
      .filter(g => g.is_manually_curated)
      .map(g => g.last_reviewed_at)
      .filter(Boolean)
      .map(d => new Date(d))
    if (dates.length === 0) return null
    const maxDate = new Date(Math.max(...dates))
    return maxDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }, [grants])

  // Applies every active filter and the selected sort order to the full grants list
  const filteredGrants = useMemo(() => {
    let result = grants

    // Tab filter: bookmarked tab shows only starred grants
    if (activeTab === 'bookmarked') result = result.filter(g => savedMap.has(g.id))

    // Source filter — federal vs state separation, applied only on the All Grants tab.
    // When active it supersedes the My State Only toggle.
    // Bookmarked grants always show regardless of source — the user saved them intentionally.
    // Normalise brewery.state once — handles both 'Pennsylvania' and 'PA' stored values
    const breweryStateCode = brewery?.state ? getStateCode(brewery.state) : null

    if (activeTab === 'all' && sourceFilter !== 'all') {
      if (sourceFilter === 'federal_only') {
        result = result.filter(g => isFederalOrNationwide(g))
      } else if (sourceFilter === 'state_only') {
        result = result.filter(g => !isFederalOrNationwide(g))
      } else if (sourceFilter === 'my_state_federal') {
        result = result.filter(g =>
          isFederalOrNationwide(g) ||
          (breweryStateCode ? isAvailableInState(g, breweryStateCode) : false)
        )
      } else if (sourceFilter === 'verified') {
        result = result.filter(g => g.is_manually_curated)
      } else if (sourceFilter === 'community') {
        result = result.filter(g => g.grant_source === 'user_submitted')
      }
    } else if (activeTab === 'all' && myStateOnly && breweryStateCode) {
      // My State Only only runs when Source filter is set to All Sources
      result = result.filter(g => isAvailableInState(g, breweryStateCode))
    }

    // Funding type filter
    if (typeFilter     !== 'all') result = result.filter(g => g.funding_type === typeFilter)
    if (statusFilter   !== 'all') result = result.filter(g => getDisplayStatus(g) === statusFilter)
    if (amountFilter   !== 'all') result = result.filter(g => matchesAmountFilter(g, amountFilter))
    if (categoryFilter !== 'all') result = result.filter(g => g.program_category === categoryFilter)

    // Brewery relevance filter
    if (relevanceFilter === '4_5')    result = result.filter(g => (g.brewery_relevance_score ?? 0) >= 4)
    if (relevanceFilter === '3_plus') result = result.filter(g => (g.brewery_relevance_score ?? 0) >= 3)
    if (relevanceFilter === '2_plus') result = result.filter(g => (g.brewery_relevance_score ?? 0) >= 2)

    // Government level filter — matches exact database values
    if (govLevelFilter !== 'all') result = result.filter(g => g.government_level === govLevelFilter)

    // Loan / Grant / funding type filter
    if (loanFilter === 'grants_only')      result = result.filter(g => !g.is_loan)
    if (loanFilter === 'loans_only')       result = result.filter(g => !!g.is_loan)
    if (loanFilter === 'mixed')            result = result.filter(g => g.funding_type?.toLowerCase().includes('mixed'))
    if (loanFilter === 'technical_assist') result = result.filter(g => g.funding_type?.toLowerCase().includes('technical'))

    // Keyword search across title, description, eligibility_summary, and acronym
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(g =>
        g.title?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.eligibility_summary?.toLowerCase().includes(q) ||
        g.program_acronym?.toLowerCase().includes(q) ||
        g.funding_agency?.toLowerCase().includes(q)
      )
    }

    // Sort — always returns a new array to avoid mutating state
    return [...result].sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.application_deadline) return 1
        if (!b.application_deadline) return -1
        return new Date(a.application_deadline) - new Date(b.application_deadline)
      }
      if (sortBy === 'amount') {
        return (b.amount_max ?? b.amount_min ?? 0) - (a.amount_max ?? a.amount_min ?? 0)
      }
      if (sortBy === 'newest') {
        return new Date(b.created_at) - new Date(a.created_at)
      }
      // Default (relevance): sort by brewery_relevance_score desc, then program_priority_tier asc
      const scoreA = a.brewery_relevance_score ?? 0
      const scoreB = b.brewery_relevance_score ?? 0
      if (scoreB !== scoreA) return scoreB - scoreA
      const tierA = a.program_priority_tier ?? 'ZZZ'
      const tierB = b.program_priority_tier ?? 'ZZZ'
      return tierA.localeCompare(tierB)
    })
  }, [grants, savedMap, activeTab, myStateOnly, sourceFilter, brewery?.state, typeFilter, statusFilter, amountFilter, loanFilter, categoryFilter, relevanceFilter, govLevelFilter, search, sortBy])

  return (
    <div className="space-y-4">
      <DismissibleDisclaimer
        storageKey="disclaimer_grants_dismissed"
        text="Reference only — Grant and funding information is provided for informational purposes only. Eligibility requirements, deadlines, and program availability change frequently. Always verify details directly with the funding source before applying."
      />

      {/* Page title + Submit a Grant button */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">💰 Grant & Funding Finder</h2>
        <ReadOnlyTooltip isReadOnly={isReadOnly}>
          <button
            onClick={() => openSubmitModal(!hasDraft)}
            title={hasDraft ? 'You have an unsaved draft — click to continue where you left off' : undefined}
            className="relative bg-amber hover:bg-amber-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {/* Amber dot indicator when a draft exists */}
            {hasDraft && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
            )}
            {hasDraft ? '📝 Continue Draft' : '+ Submit a Grant'}
          </button>
        </ReadOnlyTooltip>
      </div>

      {/* Draft notice bar — shown when a draft exists and the modal is not yet open */}
      {hasDraft && !showSubmitModal && (
        <DraftNoticeBar
          onContinue={() => openSubmitModal(false)}
          onDiscard={clearDraft}
        />
      )}

      {/* Full-width search bar */}
      <input type="text" value={searchRaw} onChange={e => setSearchRaw(e.target.value)}
        placeholder="Search grants by keyword, program name, or funding agency"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber" />

      {/* Database last updated indicator */}
      {!loading && dbLastUpdated && (
        <p className="text-xs text-gray-400 -mt-2">
          Grant database last updated: {dbLastUpdated}
        </p>
      )}

      {/* Filter bar — row 1: relevance, government level, status, loan/grant */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterSelect value={relevanceFilter} onChange={setRelevanceFilter} options={[
          { value: 'all',    label: 'All Programs' },
          { value: '4_5',    label: 'Score 4–5 (Most Relevant)' },
          { value: '3_plus', label: 'Score 3 (Relevant)' },
          { value: '2_plus', label: 'Score 2 (Potentially Relevant)' },
        ]} />

        <FilterSelect value={govLevelFilter} onChange={setGovLevelFilter} options={[
          { value: 'all',                   label: 'All Levels' },
          { value: 'Federal',               label: 'Federal' },
          { value: 'Federal/State',         label: 'Federal / State' },
          { value: 'Federal/Regional',      label: 'Federal / Regional' },
          { value: 'Federal/State/Utility', label: 'Federal / State / Utility' },
          { value: 'State',                 label: 'State' },
          { value: 'Municipal',             label: 'Municipal' },
          { value: 'County',                label: 'County' },
          { value: 'Regional',              label: 'Regional' },
        ]} />

        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'all',          label: 'All Status' },
          { value: 'open',         label: 'Open Now' },
          { value: 'closing_soon', label: 'Closing Soon (30 days)' },
          { value: 'upcoming',     label: 'Upcoming' },
          { value: 'rolling',      label: 'Rolling (no deadline)' },
          { value: 'closed',       label: 'Closed' },
        ]} />

        <FilterSelect value={loanFilter} onChange={setLoanFilter} options={[
          { value: 'all',              label: 'All Funding Types' },
          { value: 'grants_only',      label: 'Grants Only' },
          { value: 'loans_only',       label: 'Loans Only' },
          { value: 'mixed',            label: 'Mixed Programs' },
          { value: 'technical_assist', label: 'Technical Assistance' },
        ]} />
      </div>

      {/* Filter bar — row 2: amount, source, category, sort, my state toggle */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterSelect value={amountFilter} onChange={setAmountFilter} options={[
          { value: 'all',        label: 'Any Amount' },
          { value: 'under_10k',  label: 'Under $10,000' },
          { value: '10k_50k',    label: '$10K – $50K' },
          { value: '50k_100k',   label: '$50K – $100K' },
          { value: '100k_500k',  label: '$100K – $500K' },
          { value: 'over_500k',  label: 'Over $500,000' },
          { value: 'no_amount',  label: 'Amount not specified' },
        ]} />

        <FilterSelect value={sourceFilter} onChange={setSourceFilter} options={[
          { value: 'all',              label: 'All Sources' },
          { value: 'federal_only',     label: 'Federal Only' },
          { value: 'state_only',       label: 'State & Local Only' },
          { value: 'my_state_federal', label: 'My State + Federal' },
          { value: 'verified',         label: 'Verified by The Craft Beer Brief' },
          { value: 'community',        label: 'Community Submissions' },
        ]} />

        <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={[
          { value: 'all', label: 'All Categories' },
          { value: '_s1', label: '── Small Business ──', disabled: true },
          { value: 'Small Business Financing',                    label: 'Small Business Financing' },
          { value: 'Small Business Support',                      label: 'Small Business Support' },
          { value: 'Small Business / Commercial Corridor',        label: 'SB / Commercial Corridor' },
          { value: 'Small Business / Downtown Development',       label: 'SB / Downtown Development' },
          { value: 'Small Business / Neighborhood Business',      label: 'SB / Neighborhood Business' },
          { value: 'Small Business / Redevelopment',              label: 'SB / Redevelopment' },
          { value: 'Small Business / Storefront',                 label: 'SB / Storefront' },
          { value: 'Small Business / Creative & Commercial Districts', label: 'SB / Creative Districts' },
          { value: '_s2', label: '── Financing & Capital ──', disabled: true },
          { value: 'Access to Capital',                           label: 'Access to Capital' },
          { value: 'Fixed Asset Financing',                       label: 'Fixed Asset Financing' },
          { value: 'Startup / Access to Capital',                 label: 'Startup / Access to Capital' },
          { value: 'Community Development Finance',               label: 'Community Development Finance' },
          { value: '_s3', label: '── Rural & Agriculture ──', disabled: true },
          { value: 'Rural Business Development',                  label: 'Rural Business Development' },
          { value: 'Rural Business Financing',                    label: 'Rural Business Financing' },
          { value: 'Building Reuse / Rural Development',          label: 'Building Reuse / Rural Dev' },
          { value: '_s4', label: '── Redevelopment ──', disabled: true },
          { value: 'Commercial Revitalization',                   label: 'Commercial Revitalization' },
          { value: 'Brownfield Redevelopment',                    label: 'Brownfield Redevelopment' },
          { value: 'Historic Preservation',                       label: 'Historic Preservation' },
          { value: 'Facade Improvement',                          label: 'Facade Improvement' },
          { value: 'Building Improvement / Commercial Corridor',  label: 'Building Improvement' },
          { value: 'Business Assistance / Redevelopment',         label: 'Business Assistance / Redevelopment' },
          { value: 'Redevelopment / Small Business Financing',    label: 'Redevelopment / SB Financing' },
          { value: 'Urban Redevelopment / Small Business Financing', label: 'Urban Redevelopment / SB' },
          { value: '_s5', label: '── Other Programs ──', disabled: true },
          { value: 'Business Expansion / Manufacturing',          label: 'Business Expansion / Mfg' },
          { value: 'Economic Development / Infrastructure',       label: 'Economic Dev / Infrastructure' },
          { value: 'Economic Development / Manufacturing',        label: 'Economic Dev / Manufacturing' },
          { value: 'Infrastructure / Economic Development',       label: 'Infrastructure / Econ Dev' },
          { value: 'Energy Efficiency / Sustainability',          label: 'Energy Efficiency' },
          { value: 'Energy Efficiency / Utility Incentives',      label: 'Utility Incentives' },
          { value: 'Export Assistance',                           label: 'Export Assistance' },
        ]} />

        <FilterSelect value={sortBy} onChange={setSortBy} options={[
          { value: 'relevance', label: 'Sort: Brewery Relevance' },
          { value: 'deadline',  label: 'Sort: Deadline (soonest)' },
          { value: 'amount',    label: 'Sort: Amount (highest)' },
          { value: 'newest',    label: 'Sort: Recently Added' },
        ]} />

        {activeTab === 'all' && sourceFilter === 'all' && (
          <button onClick={() => setMyStateOnly(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              myStateOnly
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}>
            <span className={`flex items-center justify-center w-4 h-4 rounded border-2 text-xs font-bold leading-none ${
              myStateOnly ? 'border-white bg-white text-navy' : 'border-gray-400'
            }`}>
              {myStateOnly ? '✓' : ''}
            </span>
            My State Only
          </button>
        )}
      </div>

      {/* Tab bar + results count */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
            All Grants
          </TabButton>
          <TabButton active={activeTab === 'bookmarked'} onClick={() => setActiveTab('bookmarked')}>
            Bookmarked ({savedMap.size})
          </TabButton>
        </div>
        {!loading && (
          <p className="text-xs text-gray-500">
            Showing {filteredGrants.length} of {grants.length} grants
          </p>
        )}
      </div>

      {/* Submission success message */}
      {submitSuccess && (
        <div className="bg-green-50 border border-success text-success rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>
            ✅ Thank you for your submission. Our team will review it within 48 hours.
            You will be notified by email when it is approved.
          </span>
          <button onClick={() => setSubmitSuccess(false)} className="shrink-0 text-success/50 hover:text-success leading-none">✕</button>
        </div>
      )}

      {/* Main grant list — skeleton while loading, empty states, or grant cards */}
      {loading ? (
        <SkeletonGrid />
      ) : loadError ? (
        <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
          {loadError}
        </div>
      ) : grants.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">💰</p>
          <p className="font-semibold text-navy mb-1">Grant data is being loaded</p>
          <p className="text-sm">Our database is updated daily with new federal opportunities. Check back soon!</p>
        </div>
      ) : activeTab === 'bookmarked' && filteredGrants.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">⭐</p>
          <p className="font-semibold text-navy mb-1">No bookmarked grants yet</p>
          <p className="text-sm">Star any grant to save it here for quick access.</p>
        </div>
      ) : filteredGrants.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-semibold text-navy mb-1">No grants match your filters</p>
          <p className="text-sm">
            Try adjusting your search or filters, or toggle off the My State Only filter
            to see national programs.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGrants.map(grant => (
            <GrantCard
              key={grant.id}
              grant={grant}
              saved={savedMap.get(grant.id)}
              onToggleBookmark={toggleBookmark}
              onToggleAlert={toggleAlert}
              showRemoveBookmark={activeTab === 'bookmarked'}
            />
          ))}
        </div>
      )}

      {/* Grant submission modal — receives draft props for persistence */}
      <SubmitGrantModal
        isOpen={showSubmitModal}
        onClose={handleModalClose}
        onSuccess={handleSubmitSuccess}
        initialDraft={draftDataForModal}
        draftRestored={draftRestored}
        onDismissDraft={dismissDraftBanner}
        onSaveDraft={saveDraft}
      />
    </div>
  )
}
