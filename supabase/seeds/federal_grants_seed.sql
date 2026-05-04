-- =============================================================================
-- Seed: Federal Grants & Loans for Breweries
-- =============================================================================
-- Manually curated SBA, USDA, and EDA programs relevant to craft breweries.
-- All entries are marked is_manually_curated = true and approved = true.
-- Run AFTER migration 010_grants_improvements.sql has been applied.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

insert into grants (
  title,
  description,
  eligibility_summary,
  funding_type,
  amount_min,
  amount_max,
  states_eligible,
  status,
  application_url,
  is_federal,
  is_loan,
  is_manually_curated,
  program_category,
  contact_info,
  grant_source,
  approved,
  last_reviewed_at
) values

-- ── SBA 7(a) Loan Program ────────────────────────────────────────────────────
(
  'SBA 7(a) Loan Program',
  'The SBA''s primary lending program provides loan guarantees to small businesses including craft breweries for working capital, equipment, real estate, and business acquisition. Lenders are more willing to offer financing because the SBA guarantees a portion of the loan.',
  'Must be a for-profit small business operating in the U.S. Breweries qualify as small businesses under NAICS code 312120. Must have reasonable invested equity and demonstrate ability to repay.',
  'loan',
  50000,
  5000000,
  ARRAY['nationwide'],
  'open',
  'https://www.sba.gov/funding-programs/loans/7a-loans',
  true,
  true,
  true,
  'federal_sba',
  'Find a participating SBA lender at sba.gov/local-assistance',
  'manual',
  true,
  now()
),

-- ── SBA 504 Loan Program ─────────────────────────────────────────────────────
(
  'SBA 504 Loan Program — Fixed Asset Financing',
  'Provides long-term fixed-rate financing for major fixed assets like equipment and real estate. Ideal for brewery expansion, building purchase, canning line installation, and major equipment upgrades. Works through Certified Development Companies (CDCs).',
  'Must be a for-profit business with tangible net worth under $20 million and average net income under $6.5 million after taxes. Breweries purchasing equipment or real estate for expansion are common 504 borrowers.',
  'loan',
  125000,
  5500000,
  ARRAY['nationwide'],
  'open',
  'https://www.sba.gov/funding-programs/loans/504-loans',
  true,
  true,
  true,
  'federal_sba',
  null,
  'manual',
  true,
  now()
),

-- ── SBA Microloan Program ─────────────────────────────────────────────────────
(
  'SBA Microloan Program',
  'Provides small loans up to $50,000 through nonprofit intermediary lenders for startup and early-stage small businesses. Ideal for nano breweries and taproom startups needing working capital, inventory, equipment, or supplies.',
  'Available to small businesses and nonprofit childcare centers. No minimum credit score requirement but good character and credit history considered. Cannot be used to pay existing debts or purchase real estate.',
  'loan',
  500,
  50000,
  ARRAY['nationwide'],
  'open',
  'https://www.sba.gov/funding-programs/loans/microloans',
  true,
  true,
  true,
  'federal_sba',
  null,
  'manual',
  true,
  now()
),

-- ── USDA Value-Added Producer Grant (VAPG) ────────────────────────────────────
(
  'USDA Value-Added Producer Grant (VAPG)',
  'Helps agricultural producers enter value-added markets and increase income. Breweries using locally sourced barley, hops, fruit, honey, or other agricultural ingredients may qualify. Covers planning and working capital expenses.',
  'Independent producers, farmer cooperatives, agricultural producer groups, and majority-controlled producer-based business ventures. Brewery must use locally or regionally produced agricultural ingredients.',
  'federal_grant',
  75000,
  250000,
  ARRAY['nationwide'],
  'open',
  'https://www.rd.usda.gov/programs-services/business-programs/value-added-producer-grants',
  true,
  false,
  true,
  'federal_usda',
  null,
  'manual',
  true,
  now()
),

-- ── USDA Rural Business Development Grant (RBDG) ─────────────────────────────
(
  'USDA Rural Business Development Grant (RBDG)',
  'Supports targeted technical assistance, training, and other activities for small rural businesses with fewer than 50 employees and less than $1 million in gross revenue. Breweries in rural areas can use funds for equipment, real estate, training, and working capital.',
  'Business must be in a rural area (outside cities over 50,000 population). Must have fewer than 50 employees and less than $1 million gross revenue. Administered through USDA Rural Development state offices.',
  'federal_grant',
  10000,
  500000,
  ARRAY['nationwide'],
  'open',
  'https://www.rd.usda.gov/programs-services/business-programs/rural-business-development-grants',
  true,
  false,
  true,
  'federal_usda',
  null,
  'manual',
  true,
  now()
),

-- ── USDA Business and Industry Loan Guarantee (B&I) ──────────────────────────
(
  'USDA Business and Industry Loan Guarantee',
  'Improves economic conditions in rural areas by providing loan guarantees for businesses in rural communities. Breweries can use funds for real property, equipment, working capital, and refinancing. USDA guarantees up to 80% of the loan.',
  'Business must be located in a rural area. For-profit businesses, nonprofits, cooperatives, federally recognized tribes, and public bodies are eligible. Brewery must demonstrate financial viability and create or save jobs.',
  'loan',
  200000,
  25000000,
  ARRAY['nationwide'],
  'open',
  'https://www.rd.usda.gov/programs-services/business-programs/business-industry-loan-guarantees',
  true,
  true,
  true,
  'federal_usda',
  null,
  'manual',
  true,
  now()
),

-- ── USDA Specialty Crop Block Grant Program (SCBGP) ───────────────────────────
(
  'USDA Specialty Crop Block Grant Program (SCBGP)',
  'Funds projects that enhance the competitiveness of specialty crops including hops, which is defined as a specialty crop. Breweries partnering with hop growers or agricultural organizations can access these funds for research, marketing, and food safety improvements.',
  'State departments of agriculture administer these grants. Breweries typically participate in partnership with growers or through state brewery guild applications. Hops is explicitly listed as an eligible specialty crop.',
  'federal_grant',
  10000,
  100000,
  ARRAY['nationwide'],
  'open',
  'https://www.ams.usda.gov/services/grants/scbgp',
  true,
  false,
  true,
  'federal_usda',
  null,
  'manual',
  true,
  now()
),

-- ── SBA Small Business Innovation Research (SBIR) ────────────────────────────
(
  'SBA Small Business Innovation Research (SBIR) Program',
  'Funds research and development for innovative technologies. Breweries developing novel brewing processes, sustainability innovations, water treatment technologies, or agricultural applications may qualify under participating federal agencies.',
  'Must be a for-profit American small business with fewer than 500 employees. Principal researcher must be primarily employed by the business. Project must have strong commercial potential and advance scientific knowledge.',
  'federal_grant',
  50000,
  1750000,
  ARRAY['nationwide'],
  'open',
  'https://www.sbir.gov',
  true,
  false,
  true,
  'federal_sba',
  null,
  'manual',
  true,
  now()
),

-- ── EDA Public Works and Economic Development Program ────────────────────────
(
  'EDA Public Works and Economic Development Program',
  'Supports construction and rehabilitation of essential public infrastructure and facilities to attract private investment and create jobs. Brewery districts, craft beverage tourism corridors, and downtown revitalization projects involving breweries have received EDA funding.',
  'State and local governments, public and private universities, nonprofits, and Indian tribes. Breweries typically benefit as part of larger economic development projects. Direct applications from private businesses are not eligible but partnerships with eligible entities are.',
  'federal_grant',
  100000,
  10000000,
  ARRAY['nationwide'],
  'open',
  'https://www.eda.gov/funding/programs/public-works',
  true,
  false,
  true,
  'federal_other',
  null,
  'manual',
  true,
  now()
)

on conflict (external_id) do nothing;
