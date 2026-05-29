/**
 * fetch-news — Scheduled Edge Function
 *
 * Fetches RSS feeds from 8 craft brewery trade publications, parses articles,
 * deduplicates, auto-categorizes, and stores new articles in news_articles.
 *
 * Run daily at 6am UTC via pg_cron. See pg_cron setup instructions at the
 * bottom of supabase/migrations/044_news_tracker.sql.
 *
 * Deploy:
 *   supabase functions deploy fetch-news --no-verify-jwt
 *
 * Required Supabase secrets (set automatically):
 *   SUPABASE_URL              — set automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS headers for HTTP preflight ──────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── RSS feed sources ──────────────────────────────────────────────────────────
// Each feed has a display name, RSS URL, base URL, and brand colour for the UI.
const RSS_FEEDS = [
  { name: 'Brewbound',              url: 'https://www.brewbound.com/feed',                       siteUrl: 'https://www.brewbound.com',               color: '#C8871A' },
  { name: 'Craft Brewing Business', url: 'https://www.craftbrewingbusiness.com/feed',             siteUrl: 'https://www.craftbrewingbusiness.com',     color: '#1A2744' },
  { name: 'Brewer Magazine',        url: 'https://www.brewermagazine.com/feed',                   siteUrl: 'https://www.brewermagazine.com',           color: '#0D9488' },
  { name: 'Brewers Association',    url: 'https://feeds.feedburner.com/craftbeer',                siteUrl: 'https://www.brewersassociation.org',       color: '#16A34A' },
  { name: 'ProBrewer',              url: 'https://probrewer.com/feed',                            siteUrl: 'https://probrewer.com',                   color: '#7C3AED' },
  { name: 'Good Beer Hunting',      url: 'https://www.goodbeerhunting.com/feed',                  siteUrl: 'https://www.goodbeerhunting.com',         color: '#EA580C' },
  { name: 'Beer Street Journal',    url: 'https://beerstreetjournal.com/feed',                    siteUrl: 'https://beerstreetjournal.com',           color: '#DC2626' },
  { name: 'BevNet Beer',            url: 'https://www.bevnet.com/news/beer/feed',                 siteUrl: 'https://www.bevnet.com',                  color: '#2563EB' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedArticle {
  title:        string
  article_url:  string
  excerpt:      string
  published_at: string | null
}

interface ArticleRow {
  source_name:  string
  source_url:   string
  title:        string
  excerpt:      string
  article_url:  string
  published_at: string | null
  category:     string
  is_featured:  boolean
}

// ── XML parsing helpers ───────────────────────────────────────────────────────

/**
 * Extracts the text content of an XML tag from a string.
 * Handles CDATA sections, plain text, and nested tags.
 */
function getTag(xml: string, tag: string): string {
  // Try CDATA first: <tag><![CDATA[...]]></tag>
  const cdataRe = new RegExp(
    `<${tag}(?:\\s[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
    'i'
  )
  const cdataMatch = xml.match(cdataRe)
  if (cdataMatch) return cdataMatch[1].trim()

  // Plain text content: <tag>...</tag>
  const plainRe = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const plainMatch = xml.match(plainRe)
  if (plainMatch) return plainMatch[1].trim()

  return ''
}

/**
 * Extracts the article URL from an RSS item or Atom entry.
 * Handles: <link>url</link>, <link href="url"/>, and <guid isPermaLink="true">url</guid>.
 */
function getLink(itemXml: string): string {
  // RSS 2.0 plain link: <link>https://...</link>
  const rssLinkMatch = itemXml.match(/<link>(https?:\/\/[^<\s]+)<\/link>/i)
  if (rssLinkMatch) return rssLinkMatch[1].trim()

  // Atom self link: <link rel="alternate" href="https://..." />
  const atomAltMatch = itemXml.match(/<link[^>]+rel=["']alternate["'][^>]+href=["'](https?:\/\/[^"']+)["'][^>]*\/?>/i)
  if (atomAltMatch) return atomAltMatch[1].trim()

  // Atom href link (no rel): <link href="https://..."/>
  const atomHrefMatch = itemXml.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*\/?>/i)
  if (atomHrefMatch) return atomHrefMatch[1].trim()

  // RSS guid as permalink: <guid isPermaLink="true">https://...</guid>
  const guidMatch = itemXml.match(/<guid[^>]*>(https?:\/\/[^<\s]+)<\/guid>/i)
  if (guidMatch) return guidMatch[1].trim()

  return ''
}

/**
 * Splits XML text into individual <item> or <entry> blocks.
 * Works for both RSS 2.0 and Atom feeds.
 */
function splitItems(xml: string): string[] {
  const items: string[] = []
  // Detect whether this is Atom (has <entry>) or RSS (has <item>)
  const itemTag = xml.match(/<entry[\s>]/) ? 'entry' : 'item'
  const openTag = `<${itemTag}`
  const closeTag = `</${itemTag}>`

  let pos = 0
  while (true) {
    const start = xml.indexOf(openTag, pos)
    if (start === -1) break
    const end = xml.indexOf(closeTag, start)
    if (end === -1) break
    items.push(xml.slice(start, end + closeTag.length))
    pos = end + closeTag.length
  }

  return items
}

/**
 * Removes all HTML tags and decodes common HTML entities from a string.
 * Used to clean article excerpts stripped from HTML-heavy RSS descriptions.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')          // remove all HTML tags
    .replace(/\s+/g, ' ')              // collapse whitespace
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/gi, '')
    .trim()
}

/**
 * Parses all items from raw RSS/Atom XML text.
 * Returns an array of parsed articles — title, URL, excerpt, published date.
 * Skips items with missing title or URL.
 */
function parseRssXml(xml: string): ParsedArticle[] {
  const itemBlocks = splitItems(xml)
  const results: ParsedArticle[] = []

  for (const item of itemBlocks) {
    const title = stripHtml(getTag(item, 'title')).slice(0, 500)
    const url   = getLink(item)

    if (!title || !url) continue  // skip incomplete items

    // Some feeds put content in <description>, others in <summary> or <content:encoded>
    const rawDesc = getTag(item, 'content:encoded')
                 || getTag(item, 'description')
                 || getTag(item, 'summary')
                 || getTag(item, 'content')
    const excerpt = stripHtml(rawDesc).slice(0, 300)

    // RSS 2.0 uses pubDate; Atom uses published or updated
    const rawDate = getTag(item, 'pubDate')
                 || getTag(item, 'published')
                 || getTag(item, 'updated')
                 || getTag(item, 'dc:date')

    let published_at: string | null = null
    if (rawDate) {
      try {
        const d = new Date(rawDate)
        if (!isNaN(d.getTime())) published_at = d.toISOString()
      } catch { /* skip unparseable dates */ }
    }

    results.push({ title, article_url: url, excerpt, published_at })
  }

  return results
}

// ── Category classifier ───────────────────────────────────────────────────────

/**
 * Auto-assigns one of five categories based on keywords in the title and excerpt.
 * Falls back to 'Industry & Business' when no keywords match.
 */
function assignCategory(title: string, excerpt: string): string {
  const text = (title + ' ' + excerpt).toLowerCase()

  if (/ttb|excise tax|legislat|regulation|law|bill|franchise|distribution rights|abc|license|permit|compliance|senate|congress|house|governor/.test(text)) {
    return 'Legislation & Regulation'
  }
  if (/recipe|ingredient|hop|malt|yeast|ferment|equipment|packaging|sustainab|water|efficiency|brewing process|barrel/.test(text)) {
    return 'Operations & Brewing'
  }
  if (/consumer|trend|market|survey|data|sales|demand|ipa|lager|style|non-alcohol|na beer|hard seltzer|rtd|ready-to-drink/.test(text)) {
    return 'Consumer Trends'
  }
  if (/award|competition|festival|conference|cbc|gabf|medal|winner|world beer cup/.test(text)) {
    return 'Awards & Events'
  }
  return 'Industry & Business'
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Allow CORS preflight requests
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Create a service-role Supabase client that can bypass RLS to write articles.
  // Never expose the service role key to the browser.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')              ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let totalNewArticles = 0
  let successfulFeeds  = 0

  // ── Step 1: fetch and parse each RSS feed ──────────────────────────────────
  for (const feed of RSS_FEEDS) {
    try {
      console.log(`Fetching ${feed.name}: ${feed.url}`)

      // Fetch the RSS XML — set a browser-like User-Agent since some feeds
      // block requests without one
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CraftBeerBrief/1.0; +https://thecraftbeerbrief.com)',
          'Accept':     'application/rss+xml, application/atom+xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(15000), // 15-second timeout per feed
      })

      if (!res.ok) {
        console.warn(`${feed.name}: HTTP ${res.status} — skipping`)
        continue
      }

      const xml      = await res.text()
      const articles = parseRssXml(xml)

      if (articles.length === 0) {
        console.warn(`${feed.name}: parsed 0 items — XML may have changed format`)
        continue
      }

      console.log(`${feed.name}: parsed ${articles.length} items`)

      // Build full row objects ready to insert
      const rows: ArticleRow[] = articles.map(a => ({
        source_name:  feed.name,
        source_url:   feed.siteUrl,
        title:        a.title,
        excerpt:      a.excerpt,
        article_url:  a.article_url,
        published_at: a.published_at,
        category:     assignCategory(a.title, a.excerpt),
        is_featured:  false,
      }))

      // Upsert all rows — article_url has a UNIQUE constraint so duplicates are
      // silently ignored via ignoreDuplicates. Only genuinely new articles land.
      const { data: inserted, error: upsertErr } = await supabase
        .from('news_articles')
        .upsert(rows, { onConflict: 'article_url', ignoreDuplicates: true })
        .select('id')

      if (upsertErr) {
        console.error(`${feed.name}: upsert error — ${upsertErr.message}`)
        continue
      }

      const newCount = inserted?.length ?? 0
      totalNewArticles += newCount
      successfulFeeds++
      console.log(`${feed.name}: inserted ${newCount} new articles`)

    } catch (err) {
      // One bad feed should never stop the others
      console.error(`${feed.name}: unexpected error — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Step 2: mark the 3 most recent articles as featured ───────────────────
  // Reset all first, then flag the top 3 across all sources
  await supabase
    .from('news_articles')
    .update({ is_featured: false })
    .neq('id', '00000000-0000-0000-0000-000000000000') // update every row

  const { data: topThree } = await supabase
    .from('news_articles')
    .select('id')
    .order('published_at', { ascending: false })
    .limit(3)

  if (topThree && topThree.length > 0) {
    await supabase
      .from('news_articles')
      .update({ is_featured: true })
      .in('id', topThree.map(r => r.id))
  }

  // ── Step 3: purge articles older than 90 days to keep the table lean ──────
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  const { error: deleteErr } = await supabase
    .from('news_articles')
    .delete()
    .lt('published_at', cutoff.toISOString())

  if (deleteErr) {
    console.warn(`Cleanup error: ${deleteErr.message}`)
  }

  // ── Step 4: report total articles in DB ────────────────────────────────────
  const { count: totalCount } = await supabase
    .from('news_articles')
    .select('id', { count: 'exact', head: true })

  const summary = {
    message:          `Fetched ${totalNewArticles} new articles from ${successfulFeeds} sources. Total articles in DB: ${totalCount ?? 0}.`,
    new_articles:     totalNewArticles,
    successful_feeds: successfulFeeds,
    total_in_db:      totalCount ?? 0,
  }

  console.log(summary.message)

  return new Response(JSON.stringify(summary), {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
