-- =============================================================================
-- Migration 044 — Industry News Tracker
-- Stores RSS-fetched articles from craft brewery trade publications.
-- Written only by the fetch-news Edge Function via service role key.
-- All authenticated users can read.
-- =============================================================================


-- ── news_articles ─────────────────────────────────────────────────────────────
-- One row per article fetched from the RSS feeds.
-- The Edge Function deduplicates on article_url before inserting.

CREATE TABLE IF NOT EXISTS news_articles (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name   text          NOT NULL,                           -- e.g. 'Brewbound'
  source_url    text,                                             -- base URL of the publication
  title         text          NOT NULL,                           -- article headline
  excerpt       text,                                             -- first 300 chars of description
  article_url   text          NOT NULL UNIQUE,                    -- full URL to the article
  published_at  timestamptz,                                      -- publication date from RSS feed
  fetched_at    timestamptz   DEFAULT now(),                      -- when this row was stored
  category      text          DEFAULT 'Industry & Business',       -- auto-assigned by the Edge Function
  is_featured   boolean       DEFAULT false,                      -- top 3 most recent across all sources
  created_at    timestamptz   DEFAULT now()
);


-- ── Indexes ────────────────────────────────────────────────────────────────────
-- Fast sort by date (most common query pattern)
CREATE INDEX IF NOT EXISTS news_articles_published_at_idx
  ON news_articles (published_at DESC);

-- Fast filter by source (By Source tab)
CREATE INDEX IF NOT EXISTS news_articles_source_name_idx
  ON news_articles (source_name);

-- Fast filter by category (News Feed tab category pills)
CREATE INDEX IF NOT EXISTS news_articles_category_idx
  ON news_articles (category);

-- Fast lookup of featured articles
CREATE INDEX IF NOT EXISTS news_articles_is_featured_idx
  ON news_articles (is_featured)
  WHERE is_featured = true;


-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

-- All authenticated users (trial + all paid tiers) can read articles.
-- Inserts, updates, and deletes are performed only by the Edge Function
-- using the service role key which bypasses RLS entirely.
CREATE POLICY "news_articles: authenticated users can read"
  ON news_articles
  FOR SELECT
  TO authenticated
  USING (true);
