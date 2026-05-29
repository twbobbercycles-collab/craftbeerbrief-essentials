// NewsPage — Industry News & Data
/**
 * Available to all authenticated users (trial + all paid tiers, no TierGate).
 * Three tabs:
 *   1. News Feed — RSS articles from 8 trade publications, search + category filter
 *   2. Industry Resources — curated links to key industry data sources
 *   3. By Source — 10 most recent articles per publication
 *
 * Articles come from the news_articles table populated daily by the
 * fetch-news Edge Function. Empty state shown until first fetch runs.
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import { usePersistedTab } from '../../hooks/usePersistedTab'

// ── Source colours — must match RSS_FEEDS in the Edge Function ────────────────
const SOURCE_COLORS = {
  'Brewbound':              '#C8871A',
  'Craft Brewing Business': '#1A2744',
  'Brewer Magazine':        '#0D9488',
  'Brewers Association':    '#16A34A',
  'ProBrewer':              '#7C3AED',
  'Good Beer Hunting':      '#EA580C',
  'Beer Street Journal':    '#DC2626',
  'BevNet Beer':            '#2563EB',
}

// Short description shown on the By Source tab header
const SOURCE_DESCRIPTIONS = {
  'Brewbound':              'The leading news source for the beer industry covering business, strategy, and market trends.',
  'Craft Brewing Business': 'Operational and business focused coverage for craft brewery professionals.',
  'Brewer Magazine':        'Craft brewing industry news and operational insights for brewery owners and brewers.',
  'Brewers Association':    'Official news and resources from the not-for-profit trade association for small and independent American craft brewers.',
  'ProBrewer':              'Industry news, equipment, and resources for professional brewers.',
  'Good Beer Hunting':      'Long-form journalism and analysis covering the craft beer industry.',
  'Beer Street Journal':    'Craft beer culture, business, and industry news.',
  'BevNet Beer':            'Beverage industry news covering beer business, investment, and market developments.',
}

const SOURCE_SITE_URLS = {
  'Brewbound':              'https://www.brewbound.com',
  'Craft Brewing Business': 'https://www.craftbrewingbusiness.com',
  'Brewer Magazine':        'https://www.brewermagazine.com',
  'Brewers Association':    'https://www.brewersassociation.org',
  'ProBrewer':              'https://probrewer.com',
  'Good Beer Hunting':      'https://www.goodbeerhunting.com',
  'Beer Street Journal':    'https://beerstreetjournal.com',
  'BevNet Beer':            'https://www.bevnet.com',
}

const ALL_SOURCES = Object.keys(SOURCE_COLORS)

// ── Category pill styles ──────────────────────────────────────────────────────
const CATEGORY_STYLES = {
  'Industry & Business':      { bg: '#FEF3C7', text: '#92400E' },
  'Legislation & Regulation': { bg: '#EFF6FF', text: '#1D4ED8' },
  'Operations & Brewing':     { bg: '#F0FDF4', text: '#166534' },
  'Consumer Trends':          { bg: '#FDF4FF', text: '#6B21A8' },
  'Awards & Events':          { bg: '#FFF7ED', text: '#9A3412' },
}
const ALL_CATEGORIES = ['All', ...Object.keys(CATEGORY_STYLES)]

// ── Industry resource data (hardcoded — no DB needed) ─────────────────────────
const DATA_RESOURCES = [
  {
    icon: '📊',
    title: 'Beer Institute Annual Report',
    description: 'Full annual report on the US beer industry including production, employment, and economic impact data.',
    source: 'Beer Institute',
    url: 'https://www.beerinstitute.org/about-us/annual-report/',
  },
  {
    icon: '📦',
    title: 'Beer Institute Monthly Taxable Removals',
    description: 'Monthly domestic beer shipment data tracked with TTB. Key indicator of overall beer market volume.',
    source: 'Beer Institute',
    url: 'https://www.beerinstitute.org/data-economic/taxes-paid/',
  },
  {
    icon: '🌍',
    title: 'Beer Institute Import/Export Data',
    description: 'Monthly US beer import and export volumes tracked with the US Department of Commerce.',
    source: 'Beer Institute',
    url: 'https://www.beerinstitute.org/data-economic/import-export/',
  },
  {
    icon: '🥫',
    title: 'Beer Institute Packaging Mix',
    description: 'Annual data on beer packaging trends — cans vs bottles vs draft.',
    source: 'Beer Institute',
    url: 'https://www.beerinstitute.org/data-economic/packaging-mix/',
  },
  {
    icon: '🫗',
    title: 'Beer Institute Non-Alcohol Beer Trends',
    description: 'Growth data on the non-alcoholic beer category including market share trends.',
    source: 'Beer Institute',
    url: 'https://www.beerinstitute.org/data-economic/non-alcohol-beer-growth-trends/',
  },
  {
    icon: '🍺',
    title: 'Brewers Association Production Report',
    description: 'Annual craft brewery production data, brewery count, and market share statistics.',
    source: 'Brewers Association',
    url: 'https://www.brewersassociation.org/statistics-and-data/national-beer-sales-production-data/',
  },
  {
    icon: '💼',
    title: 'Brewers Association Economic Impact',
    description: 'Economic impact of craft brewing on local and national economies.',
    source: 'Brewers Association',
    url: 'https://www.brewersassociation.org/statistics-and-data/craft-beer-industry-market-segments/',
  },
  {
    icon: '🏛️',
    title: 'TTB Beer Statistical Reports',
    description: 'Official TTB beer production and removal statistics including monthly and quarterly reports.',
    source: 'TTB',
    url: 'https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/statistics',
  },
  {
    icon: '📂',
    title: 'TTB Statistics & Data',
    description: 'All TTB statistics including beer, spirits, wine, tax collections, and processing times.',
    source: 'TTB',
    url: 'https://www.ttb.gov/statistics',
  },
  {
    icon: '📈',
    title: 'NBWA Beer Purchasers Index',
    description: 'Monthly survey of beer distributor purchasing intentions — leading indicator of market trends.',
    source: 'NBWA',
    url: 'https://www.nbwa.org/resources/beer-purchasers-index',
  },
  {
    icon: '📋',
    title: 'Brewers Association Data & Statistics',
    description: 'Annual financial benchmarking data for craft breweries including margins, labor costs, and revenue per barrel.',
    source: 'Brewers Association',
    url: 'https://www.brewersassociation.org/category/data/',
  },
]

const STATE_RESOURCES = [
  {
    icon: '🏛️',
    title: 'Your State ABC Agency',
    description: 'Find your state alcohol control agency for licensing and compliance requirements.',
    url: 'https://www.google.com/search?q=state+ABC+agency+brewery+license',
  },
  {
    icon: '🍻',
    title: 'Your State Brewery Guild',
    description: 'State guilds provide legislative advocacy, group purchasing, and networking for craft brewers.',
    url: 'https://www.brewersassociation.org/government-affairs/state-brewer-guilds/',
  },
  {
    icon: '📝',
    title: 'TTB myTTB Portal',
    description: "File your Brewer's Report of Operations, pay excise tax, and manage your Brewer's Notice.",
    url: 'https://www.ttb.gov/mytTb',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns a human-friendly relative time string ("2h ago", "Yesterday", "May 15")
function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)

  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days} days ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Returns the colour for a source name, defaulting to navy
function sourceColor(name) {
  return SOURCE_COLORS[name] ?? '#1A2744'
}

// ── Default export ────────────────────────────────────────────────────────────

export default function NewsPage() {
  return <NewsDashboard />
}

// ── Main dashboard component ──────────────────────────────────────────────────

function NewsDashboard() {
  const [activeTab, setTab] = usePersistedTab('news_active_tab', 'feed')

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-navy">Industry News & Data</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Stay current with craft brewery industry news from leading trade publications.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'feed',       label: 'News Feed' },
          { key: 'resources',  label: 'Industry Resources' },
          { key: 'by_source',  label: 'By Source' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-navy'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'feed'       && <NewsFeedTab />}
      {activeTab === 'resources'  && <IndustryResourcesTab />}
      {activeTab === 'by_source'  && <BySourceTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — NEWS FEED
// ═══════════════════════════════════════════════════════════════════════════════

function NewsFeedTab() {
  const [loading,  setLoading]  = useState(true)
  const [featured, setFeatured] = useState([])
  const [articles, setArticles] = useState([])
  const [category, setCategory] = useState('All')
  const [search,   setSearch]   = useState('')

  // Load featured articles and all articles in parallel
  const loadArticles = useCallback(async () => {
    setLoading(true)
    const [featRes, allRes] = await Promise.all([
      supabase
        .from('news_articles')
        .select('*')
        .eq('is_featured', true)
        .order('published_at', { ascending: false }),
      supabase
        .from('news_articles')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(50),
    ])
    setFeatured(featRes.data ?? [])
    setArticles(allRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadArticles() }, [loadArticles])

  // Client-side filter by category and search term
  const filteredArticles = useMemo(() => {
    const featuredIds = new Set((featured ?? []).map(a => a.id))
    return articles
      .filter(a => !featuredIds.has(a.id))                      // exclude featured from main list
      .filter(a => category === 'All' || a.category === category)
      .filter(a => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (a.title?.toLowerCase().includes(q) || a.excerpt?.toLowerCase().includes(q))
      })
  }, [articles, featured, category, search])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner message="Loading news..." />
      </div>
    )
  }

  // No articles yet — Edge Function hasn't run yet
  if (articles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-4xl mb-3">📰</p>
        <h3 className="font-semibold text-navy text-lg mb-2">News loading...</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Articles are fetched daily at 6am UTC. Check back soon — your first batch of industry news will appear here automatically.
        </p>
        <p className="text-xs text-gray-400 mt-4">
          You can also manually trigger the fetch-news Edge Function from the Supabase dashboard.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls: search + category filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search headlines and excerpts..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
        />
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                category === cat
                  ? 'bg-amber text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Featured stories — always show all 3, unaffected by filters */}
      {featured.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Featured Stories</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featured.map(article => (
              <FeaturedCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      )}

      {/* Article list */}
      {filteredArticles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-sm">No articles match your search or filter. Try clearing the search or selecting a different category.</p>
        </div>
      ) : (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            {filteredArticles.length} Articles
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredArticles.map(article => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Large featured article card
function FeaturedCard({ article }) {
  const color   = sourceColor(article.source_name)
  const catStyle = CATEGORY_STYLES[article.category] ?? CATEGORY_STYLES['Industry & Business']

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {article.source_name}
        </span>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: catStyle.bg, color: catStyle.text }}
        >
          {article.category}
        </span>
      </div>

      {/* Headline */}
      <a
        href={article.article_url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-navy text-base leading-snug hover:text-amber transition-colors line-clamp-3"
      >
        {article.title}
      </a>

      {/* Excerpt */}
      {article.excerpt && (
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
          {article.excerpt.slice(0, 200)}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">{relativeTime(article.published_at)}</span>
        <a
          href={article.article_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-amber hover:underline"
        >
          Read Full Story →
        </a>
      </div>
    </div>
  )
}

// Smaller article card for the main grid
function ArticleCard({ article }) {
  const color    = sourceColor(article.source_name)
  const catStyle = CATEGORY_STYLES[article.category] ?? CATEGORY_STYLES['Industry & Business']

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {article.source_name}
        </span>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: catStyle.bg, color: catStyle.text }}
        >
          {article.category}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto">{relativeTime(article.published_at)}</span>
      </div>

      {/* Headline */}
      <a
        href={article.article_url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-navy text-sm leading-snug hover:text-amber transition-colors line-clamp-2"
      >
        {article.title}
      </a>

      {/* Excerpt */}
      {article.excerpt && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {article.excerpt.slice(0, 150)}
        </p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — INDUSTRY RESOURCES
// ═══════════════════════════════════════════════════════════════════════════════

function IndustryResourcesTab() {
  return (
    <div className="space-y-8">

      {/* Section A — Data & Reports */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
          Industry Data & Reports
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DATA_RESOURCES.map((resource, i) => (
            <ResourceCard key={i} resource={resource} />
          ))}
        </div>
      </div>

      {/* Section B — State Resources */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
          State & Federal Resources
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STATE_RESOURCES.map((resource, i) => (
            <ResourceCard key={i} resource={resource} small />
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center border-t border-gray-100 pt-4">
        Links open external websites. The Craft Beer Brief is not affiliated with these organizations and does not control their content.
      </p>
    </div>
  )
}

// Resource link card
function ResourceCard({ resource, small = false }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow ${small ? '' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`${small ? 'text-2xl' : 'text-3xl'} shrink-0`}>{resource.icon}</span>
        <div className="min-w-0">
          <h4 className={`font-semibold text-navy ${small ? 'text-sm' : 'text-sm'} leading-snug`}>
            {resource.title}
          </h4>
          {resource.source && (
            <p className="text-[10px] text-gray-400 mt-0.5">{resource.source}</p>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed flex-1">{resource.description}</p>
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-amber hover:underline"
      >
        View Resource →
      </a>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — BY SOURCE
// ═══════════════════════════════════════════════════════════════════════════════

function BySourceTab() {
  const [activeSource, setActiveSource] = useState(ALL_SOURCES[0])
  const [loading,  setLoading]  = useState(false)
  const [articles, setArticles] = useState([])

  // Load the 10 most recent articles for the selected source
  const loadSource = useCallback(async (source) => {
    setLoading(true)
    const { data } = await supabase
      .from('news_articles')
      .select('id, title, article_url, published_at, category')
      .eq('source_name', source)
      .order('published_at', { ascending: false })
      .limit(10)
    setArticles(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadSource(activeSource) }, [activeSource, loadSource])

  const color       = sourceColor(activeSource)
  const description = SOURCE_DESCRIPTIONS[activeSource] ?? ''
  const siteUrl     = SOURCE_SITE_URLS[activeSource] ?? '#'

  return (
    <div className="space-y-4">
      {/* Horizontal scrollable source sub-tabs */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max">
          {ALL_SOURCES.map(source => (
            <button
              key={source}
              onClick={() => setActiveSource(source)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                activeSource === source
                  ? 'text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={activeSource === source ? { backgroundColor: sourceColor(source) } : {}}
            >
              {source}
            </button>
          ))}
        </div>
      </div>

      {/* Publication header */}
      <div
        className="rounded-xl p-5 flex items-start justify-between gap-4"
        style={{ backgroundColor: `${color}15`, borderLeft: `4px solid ${color}` }}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: color }}
            >
              {activeSource}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold hover:underline whitespace-nowrap"
          style={{ color }}
        >
          Visit {activeSource} →
        </a>
      </div>

      {/* Article list */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {loading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner message="Loading articles..." />
          </div>
        ) : articles.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No articles from {activeSource} yet. Check back after the next daily fetch.
          </div>
        ) : (
          articles.map(article => {
            const catStyle = CATEGORY_STYLES[article.category] ?? CATEGORY_STYLES['Industry & Business']
            return (
              <div key={article.id} className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <a
                    href={article.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-semibold text-sm text-navy hover:text-amber transition-colors leading-snug"
                  >
                    {article.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: catStyle.bg, color: catStyle.text }}
                    >
                      {article.category}
                    </span>
                    <span className="text-[10px] text-gray-400">{relativeTime(article.published_at)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
