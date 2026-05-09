-- =============================================================================
-- Seed: Curated Grants — First 30 records
-- Source: funding_programs_beta_import_enhanced_v2.csv
-- Records 1–12: Federal programs
-- Records 13–30: State SSBCI programs (AL through LA)
--
-- Safe to re-run: each INSERT uses WHERE NOT EXISTS on external_program_id.
-- Run in Supabase Dashboard → SQL Editor, or via: supabase db push
-- =============================================================================

-- ── Federal programs (12) ─────────────────────────────────────────────────────

-- 1. USDA REAP
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-USDA-REAP',
  'U.S. Department of Agriculture (USDA) Rural Energy for America Program (REAP) Renewable Energy Systems & Energy Efficiency Improvement Guaranteed Loans and Grants',
  'REAP; USDA',
  'REAP = Rural Energy for America Program; USDA = U.S. Department of Agriculture',
  'Loan Guarantee',
  'Federal',
  'U.S. Department of Agriculture (USDA) Rural Development',
  'Energy Efficiency / Sustainability',
  'Provides grant funding and guaranteed loan financing for rural small businesses and agricultural producers to install renewable energy systems or make energy-efficiency improvements.',
  'Potential fit for rural breweries, brewpubs, and beverage manufacturers with qualifying energy projects such as solar, refrigeration, Heating, Ventilation, and Air Conditioning (HVAC), boilers, lighting, or process efficiency.',
  4, 'High',
  NULL, NULL, 'Generally required; percentage varies by project and funding type',
  NULL, 'Pending new U.S. Department of Agriculture (USDA) guidance/regulatory changes', 'closed',
  'https://www.rd.usda.gov/programs-services/energy-programs/rural-energy-america-program-renewable-energy-systems-energy-efficiency-improvement-guaranteed-loans',
  'https://www.rd.usda.gov/programs-services/energy-programs/rural-energy-america-program-renewable-energy-systems-energy-efficiency-improvement-guaranteed-loans',
  ARRAY['nationwide'], NULL, NULL,
  NULL, true, false, true,
  'Energy-intensive small business; rural manufacturing', 'Sustainability', 'Critical',
  '2026-06-07', 'Tier 1',
  '2026 official update: U.S. Department of Agriculture (USDA) is not accepting new Rural Energy for America Program (REAP) grant applications under the rescinded Fiscal Year (FY) 2025-2027 Notice of Funding Opportunity (NOFO); guaranteed loan applications may continue. Confirm before presenting grant availability to users.',
  true, true, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-USDA-REAP');

-- 2. USDA RBDG
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-USDA-RBDG',
  'U.S. Department of Agriculture (USDA) Rural Business Development Grants (RBDG)',
  'USDA',
  'USDA = U.S. Department of Agriculture',
  'Grant',
  'Federal',
  'U.S. Department of Agriculture (USDA) Rural Development',
  'Rural Business Development',
  'Provides grant money to assist with economic development planning and/or the financing or expansion of rural businesses.',
  'Funds generally go to eligible public bodies/nonprofits/tribes rather than directly to businesses; breweries may benefit through local revolving loan funds, technical assistance, incubators, or community projects.',
  2, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Annual/State office cycle', 'open',
  'https://www.rd.usda.gov/programs-services/business-programs/rural-business-development-grants',
  'https://www.rd.usda.gov/programs-services/business-programs/rural-business-development-grants',
  ARRAY['nationwide'], NULL, NULL,
  NULL, true, false, true,
  'Rural business development', 'Rural Development', 'High',
  '2026-08-06', 'Tier 2',
  'Track state Rural Development (RD) office notices and intermediary RLFs.',
  true, false, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-USDA-RBDG');

-- 3. SBA 504 Loan Program
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-US-U-S-SMALL-BUSI-SBA-504-LOAN-PROGRAM',
  'U.S. Small Business Administration (SBA) 504 Loan Program',
  'SBA',
  'SBA = U.S. Small Business Administration',
  'Loan',
  'Federal',
  'U.S. Small Business Administration',
  'Fixed Asset Financing',
  'Long-term fixed-rate financing for major fixed assets that promote business growth and job creation.',
  'Strong fit for breweries purchasing land, buildings, construction, renovations, or large equipment through CDC/lender structure.',
  4, 'High',
  NULL, 5500000, 'Borrower contribution commonly required; structure varies',
  NULL, 'Rolling through CDCs', 'open',
  'https://www.sba.gov/funding-programs/loans/504-loans',
  'https://www.sba.gov/funding-programs/loans/504-loans',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business fixed assets; manufacturing; hospitality', 'Expansion', 'Critical',
  '2026-08-06', 'Tier 1',
  'Excellent fit for brewery buildouts, real estate, and equipment.',
  true, true, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-US-U-S-SMALL-BUSI-SBA-504-LOAN-PROGRAM');

-- 4. SBA 7(a) Loan Program
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-SBA-7A',
  'U.S. Small Business Administration (SBA) 7(a) Loan Program',
  'SBA',
  'SBA = U.S. Small Business Administration',
  'Loan / Loan Guarantee',
  'Federal',
  'U.S. Small Business Administration',
  'Small Business Financing',
  'SBA-guaranteed loans for most business purposes including working capital, equipment, expansion, real estate, and business acquisition.',
  'Broad fit for startup or existing breweries depending on lender underwriting and U.S. Small Business Administration (SBA) eligibility.',
  3, 'High',
  NULL, 5000000, 'Equity/collateral requirements vary by lender',
  NULL, 'Rolling through U.S. Small Business Administration (SBA) lenders', 'open',
  'https://www.sba.gov/funding-programs/loans',
  'https://www.sba.gov/funding-programs/loans',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business financing', 'Mixed', 'Critical',
  '2026-08-06', 'Tier 1',
  'Use as baseline national loan product.',
  true, true, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-SBA-7A');

-- 5. EDA Public Works Program
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-EDA-PUBLIC-WORKS',
  'Economic Development Administration (EDA) Public Works Program',
  'EDA',
  'EDA = Economic Development Administration',
  'Grant',
  'Federal',
  'U.S. Economic Development Administration',
  'Infrastructure / Economic Development',
  'Supports distressed communities to revitalize, expand, and upgrade physical infrastructure to attract industry, encourage expansion, and create/retain jobs.',
  'Usually applicant is public/quasi-public entity; breweries may benefit indirectly through industrial sites, downtown districts, utility upgrades, or redevelopment infrastructure.',
  2, 'High',
  NULL, NULL, 'Matching share usually required',
  NULL, 'NOFO/Competitive', 'open',
  'https://www.eda.gov/funding/programs/public-works',
  'https://www.eda.gov/funding/programs/public-works',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Infrastructure/economic development', 'Expansion', 'High',
  '2026-08-06', 'Tier 2',
  'Indirect but high value for brewery clusters and redevelopment districts.',
  true, false, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-EDA-PUBLIC-WORKS');

-- 6. EDA Economic Adjustment Assistance
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-EDA-EAA',
  'Economic Development Administration (EDA) Economic Adjustment Assistance Program',
  'EDA',
  'EDA = Economic Development Administration',
  'Grant / Technical Assistance',
  'Federal',
  'U.S. Economic Development Administration',
  'Economic Development / Infrastructure',
  'Flexible Economic Development Administration (EDA) program supporting technical, planning, public works, and infrastructure assistance in regions experiencing economic changes.',
  'Indirect fit when brewery/manufacturing/tourism development is part of a regional economic recovery or redevelopment strategy.',
  2, 'High',
  NULL, NULL, 'Matching share usually required',
  NULL, 'NOFO/Competitive', 'open',
  'https://www.eda.gov/funding/programs/economic-adjustment-assistance',
  'https://www.eda.gov/funding/programs/economic-adjustment-assistance',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Regional economic development', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Important for local governments/EDOs supporting brewery-related redevelopment.',
  true, false, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-EDA-EAA');

-- 7. Federal Historic Rehabilitation Tax Credit
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-NPS-HISTORIC-TAX-CREDIT',
  'Federal Historic Rehabilitation Tax Credit',
  NULL,
  NULL,
  'Tax Credit',
  'Federal',
  'Internal Revenue Service / National Park Service',
  'Historic Preservation',
  'Federal tax incentive for rehabilitating qualifying historic income-producing buildings; generally equal to 20% of qualified rehabilitation expenses.',
  'Strong fit for breweries, brewpubs, or taprooms redeveloping certified historic industrial/commercial buildings.',
  4, 'High',
  NULL, NULL, NULL,
  NULL, 'Project-based certification', 'open',
  'https://www.irs.gov/businesses/small-businesses-self-employed/rehabilitation-credit',
  'https://www.irs.gov/businesses/small-businesses-self-employed/rehabilitation-credit',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Historic adaptive reuse', 'Expansion', 'Critical',
  '2026-08-06', 'Tier 1',
  'Often stackable with state historic credits and local redevelopment incentives; requires specialized tax counsel.',
  true, false, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-NPS-HISTORIC-TAX-CREDIT');

-- 8. EPA Brownfields Grants
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-EPA-BROWNFIELDS',
  'Environmental Protection Agency (EPA) Brownfields Multipurpose, Assessment, Cleanup, and Revolving Loan Fund Grants',
  'EPA',
  'EPA = Environmental Protection Agency',
  'Grant / Loan',
  'Federal',
  'U.S. Environmental Protection Agency',
  'Brownfield Redevelopment',
  'Supports assessment, cleanup, and revolving loan fund activity for contaminated or potentially contaminated properties.',
  'Indirect fit for breweries redeveloping former industrial sites; usually applicant is municipality, redevelopment authority, tribe, or eligible nonprofit.',
  2, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Annual/NOFO', 'open',
  'https://www.epa.gov/brownfields',
  'https://www.epa.gov/brownfields',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, NULL, true,
  'Brownfields/adaptive reuse', 'Expansion', 'High',
  '2026-08-06', 'Tier 2',
  'Track local Revolving Loan Fund (RLF) subrecipient opportunities.',
  true, true, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-EPA-BROWNFIELDS');

-- 9. SBA State Trade Expansion Program (STEP)
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-SBA-STEP',
  'State Trade Expansion Program (STEP)',
  'STEP; SBA',
  'STEP = State Trade Expansion Program; SBA = U.S. Small Business Administration',
  'Grant / Matching Funds',
  'Federal/State',
  'U.S. Small Business Administration and State Trade Offices',
  'Export Assistance',
  'Provides U.S. Small Business Administration (SBA) funds to states/territories to help small businesses enter and expand into international markets.',
  'Useful for breweries exporting beer, ingredients, services, or participating in international trade shows; state-specific application rules vary.',
  3, 'High',
  NULL, NULL, 'Match or reimbursement structure varies by state',
  NULL, 'State-specific cycle', 'open',
  'https://www.sba.gov/funding-programs/grants/state-trade-expansion-program-step',
  'https://www.sba.gov/funding-programs/grants/state-trade-expansion-program-step',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Export assistance', 'Export', 'High',
  '2026-08-06', 'Tier 2',
  'Add state-specific State Trade Expansion Program (STEP) grant pages during additional verification or detail extraction.',
  true, false, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-SBA-STEP');

-- 10. National SSBCI Capital Programs (Treasury)
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FEDER-U-S-TREASURY-A-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-CAPIT',
  'State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI',
  'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment',
  'Federal/State',
  'U.S. Treasury and State Administrators',
  'Access to Capital',
  'Nearly $10B national program supporting small businesses and entrepreneurship through state-run credit and investment programs.',
  'Potential fit for breweries needing loan participation, collateral support, loan guarantees, venture-style capital, or technical assistance; program design varies by state.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital', 'Mixed', 'Critical',
  '2026-08-06', 'Tier 1',
  'Use Treasury state program summaries as master directory; break into state-specific programs over time.',
  true, true, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FEDER-U-S-TREASURY-A-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-CAPIT');

-- 11. DSIRE Renewable Energy & Efficiency Incentive Database
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FEDER-NC-CLEAN-ENERG-DSIRE-RENEWABLE-ENERGY-AND-ENERGY-EFFICIENCY-INCEN',
  'DSIRE Renewable Energy and Energy Efficiency Incentive Database',
  NULL,
  NULL,
  'Rebate / Tax Credit / Grant / Loan',
  'Federal/State/Utility',
  'NC Clean Energy Technology Center / DOE-linked resource',
  'Energy Efficiency / Utility Incentives',
  'National database of renewable energy and efficiency incentives and policies, including financial incentives such as rebates, tax incentives, grants, and loans.',
  'Useful discovery source for brewery-specific equipment incentives: refrigeration, Heating, Ventilation, and Air Conditioning (HVAC), boilers, lighting, motors, compressed air, solar, and food-service equipment.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Rolling/Program-specific', 'open',
  'https://dsireusa.org/',
  'https://www.energy.gov/cmei/buildings/find-financing-energy-efficiency-upgrades',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Energy efficiency and renewable energy', 'Sustainability', 'Critical',
  '2026-08-06', 'Tier 1',
  'Use DSIRE as discovery source; verify each utility/state program at original provider source before final production.',
  true, true, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FEDER-NC-CLEAN-ENERG-DSIRE-RENEWABLE-ENERGY-AND-ENERGY-EFFICIENCY-INCEN');

-- 12. CDFI Fund
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-TREASURY-CDFI',
  'Community Development Financial Institution (CDFI) Fund / Community Development Financial Institutions Financing',
  'CDFI',
  'CDFI = Community Development Financial Institution',
  'Loan / Technical Assistance',
  'Federal/Regional',
  'U.S. Treasury Community Development Financial Institution (CDFI) Fund and certified CDFIs',
  'Community Development Finance',
  'Community Development Financial Institution (CDFI) ecosystem provides financing and technical assistance to underserved businesses and communities through certified lenders.',
  'Potential fit for breweries in underserved, rural, low-income, or redevelopment markets needing flexible capital when bank financing is difficult.',
  2, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'CDFI-specific', 'open',
  'https://www.cdfifund.gov/',
  'https://www.cdfifund.gov/',
  ARRAY['nationwide'], NULL, NULL,
  NULL, NULL, false, true,
  'Community development finance', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Needs CDFI-by-region enrichment for direct application links.',
  true, true, true, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-TREASURY-CDFI');

-- ── State SSBCI programs (records 13–30) ──────────────────────────────────────
-- All share: program_acronym='SSBCI', funding_type='Loan / Loan Guarantee / Investment',
-- government_level='State', program_category='Access to Capital', relevance=3,
-- application_url = Treasury capital-program-list page,
-- source_url = Treasury capital-program-summaries page,
-- forgivable=false, stackable=true, is_loan=true, is_federal=false

-- 13. Alabama SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-AL-ALABAMA-SSBCI--ALABAMA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Alabama State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Alabama State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Alabama.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Alabama'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-AL-ALABAMA-SSBCI--ALABAMA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- 14. Alaska SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-AK-ALASKA-SSBCI-A-ALASKA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC',
  'Alaska State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Alaska State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Alaska.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Alaska'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-AK-ALASKA-SSBCI-A-ALASKA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC');

-- 15. Arizona SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-AZ-ARIZONA-SSBCI--ARIZONA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Arizona State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Arizona State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Arizona.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Arizona'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-AZ-ARIZONA-SSBCI--ARIZONA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- 16. Arkansas SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-AR-ARKANSAS-SSBCI-ARKANSAS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Arkansas State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Arkansas State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Arkansas.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Arkansas'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-AR-ARKANSAS-SSBCI-ARKANSAS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 17. California SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-CA-CALIFORNIA-SSB-CALIFORNIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-',
  'California State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'California State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in California.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['California'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-CA-CALIFORNIA-SSB-CALIFORNIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-');

-- 18. Colorado SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-CO-COLORADO-SSBCI-COLORADO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Colorado State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Colorado State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Colorado.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Colorado'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-CO-COLORADO-SSBCI-COLORADO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 19. Connecticut SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-CT-CONNECTICUT-SS-CONNECTICUT-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE',
  'Connecticut State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Connecticut State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Connecticut.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Connecticut'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-CT-CONNECTICUT-SS-CONNECTICUT-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE');

-- 20. Delaware SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-DE-DELAWARE-SSBCI-DELAWARE-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Delaware State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Delaware State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Delaware.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Delaware'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-DE-DELAWARE-SSBCI-DELAWARE-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 21. Florida SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-FL-FLORIDA-SSBCI--FLORIDA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Florida State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Florida State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Florida.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Florida'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-FL-FLORIDA-SSBCI--FLORIDA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- 22. Georgia SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-GA-GEORGIA-SSBCI--GEORGIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Georgia State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Georgia State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Georgia.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Georgia'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-GA-GEORGIA-SSBCI--GEORGIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- 23. Hawaii SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-HI-HAWAII-SSBCI-A-HAWAII-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC',
  'Hawaii State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Hawaii State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Hawaii.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Hawaii'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-HI-HAWAII-SSBCI-A-HAWAII-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC');

-- 24. Idaho SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-ID-IDAHO-SSBCI-AD-IDAHO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI',
  'Idaho State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Idaho State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Idaho.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Idaho'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-ID-IDAHO-SSBCI-AD-IDAHO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI');

-- 25. Illinois SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-IL-ILLINOIS-SSBCI-ILLINOIS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Illinois State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Illinois State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Illinois.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Illinois'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-IL-ILLINOIS-SSBCI-ILLINOIS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 26. Indiana SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-IN-INDIANA-SSBCI--INDIANA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Indiana State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Indiana State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Indiana.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Indiana'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-IN-INDIANA-SSBCI--INDIANA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- 27. Iowa SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-IA-IOWA-SSBCI-ADM-IOWA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-',
  'Iowa State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Iowa State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Iowa.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Iowa'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-IA-IOWA-SSBCI-ADM-IOWA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-');

-- 28. Kansas SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-KS-KANSAS-SSBCI-A-KANSAS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC',
  'Kansas State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Kansas State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Kansas.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Kansas'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-KS-KANSAS-SSBCI-A-KANSAS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC');

-- 29. Kentucky SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-KY-KENTUCKY-SSBCI-KENTUCKY-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Kentucky State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Kentucky State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Kentucky.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Kentucky'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-KY-KENTUCKY-SSBCI-KENTUCKY-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 30. Louisiana SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-LA-LOUISIANA-SSBC-LOUISIANA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S',
  'Louisiana State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Louisiana State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Louisiana.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Louisiana'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-LA-LOUISIANA-SSBC-LOUISIANA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S');

-- ── State SSBCI programs (continued, 31–62) ───────────────────────────────────

-- 31. Maine SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-ME-MAINE-SSBCI-AD-MAINE-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI',
  'Maine State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Maine State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Maine.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Maine'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-ME-MAINE-SSBCI-AD-MAINE-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI');

-- 32. Maryland SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-MD-MARYLAND-SSBCI-MARYLAND-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Maryland State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Maryland State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Maryland.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Maryland'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-MD-MARYLAND-SSBCI-MARYLAND-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 33. Massachusetts SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-MA-MASSACHUSETTS--MASSACHUSETTS-STATE-SMALL-BUSINESS-CREDIT-INITIATI',
  'Massachusetts State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Massachusetts State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Massachusetts.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Massachusetts'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-MA-MASSACHUSETTS--MASSACHUSETTS-STATE-SMALL-BUSINESS-CREDIT-INITIATI');

-- 34. Michigan SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-MI-MICHIGAN-SSBCI-MICHIGAN-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Michigan State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Michigan State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Michigan.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Michigan'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-MI-MICHIGAN-SSBCI-MICHIGAN-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 35. Minnesota SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-MN-MINNESOTA-SSBC-MINNESOTA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S',
  'Minnesota State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Minnesota State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Minnesota.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Minnesota'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-MN-MINNESOTA-SSBC-MINNESOTA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S');

-- 36. Mississippi SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-MS-MISSISSIPPI-SS-MISSISSIPPI-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE',
  'Mississippi State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Mississippi State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Mississippi.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Mississippi'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-MS-MISSISSIPPI-SS-MISSISSIPPI-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE');

-- 37. Missouri SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-MO-MISSOURI-SSBCI-MISSOURI-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Missouri State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Missouri State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Missouri.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Missouri'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-MO-MISSOURI-SSBCI-MISSOURI-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 38. Montana SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-MT-MONTANA-SSBCI--MONTANA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Montana State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Montana State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Montana.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Montana'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-MT-MONTANA-SSBCI--MONTANA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- 39. Nebraska SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NE-NEBRASKA-SSBCI-NEBRASKA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Nebraska State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Nebraska State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Nebraska.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Nebraska'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NE-NEBRASKA-SSBCI-NEBRASKA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 40. Nevada SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NV-NEVADA-SSBCI-A-NEVADA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC',
  'Nevada State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Nevada State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Nevada.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Nevada'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NV-NEVADA-SSBCI-A-NEVADA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC');

-- 41. New Hampshire SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NH-NEW-HAMPSHIRE--NEW-HAMPSHIRE-STATE-SMALL-BUSINESS-CREDIT-INITIATI',
  'New Hampshire State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'New Hampshire State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in New Hampshire.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['New Hampshire'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NH-NEW-HAMPSHIRE--NEW-HAMPSHIRE-STATE-SMALL-BUSINESS-CREDIT-INITIATI');

-- 42. New Jersey SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NJ-NEW-JERSEY-SSB-NEW-JERSEY-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-',
  'New Jersey State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'New Jersey State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in New Jersey.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['New Jersey'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NJ-NEW-JERSEY-SSB-NEW-JERSEY-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-');

-- 43. New Mexico SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NM-NEW-MEXICO-SSB-NEW-MEXICO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-',
  'New Mexico State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'New Mexico State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in New Mexico.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['New Mexico'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NM-NEW-MEXICO-SSB-NEW-MEXICO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-');

-- 44. New York SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NY-NEW-YORK-SSBCI-NEW-YORK-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'New York State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'New York State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in New York.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['New York'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NY-NEW-YORK-SSBCI-NEW-YORK-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 45. North Carolina SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NC-NORTH-CAROLINA-NORTH-CAROLINA-STATE-SMALL-BUSINESS-CREDIT-INITIAT',
  'North Carolina State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'North Carolina State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in North Carolina.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['North Carolina'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NC-NORTH-CAROLINA-NORTH-CAROLINA-STATE-SMALL-BUSINESS-CREDIT-INITIAT');

-- 46. North Dakota SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-ND-NORTH-DAKOTA-S-NORTH-DAKOTA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV',
  'North Dakota State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'North Dakota State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in North Dakota.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['North Dakota'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-ND-NORTH-DAKOTA-S-NORTH-DAKOTA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV');

-- 47. Ohio SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-OH-OHIO-SSBCI-ADM-OHIO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-',
  'Ohio State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Ohio State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Ohio.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Ohio'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-OH-OHIO-SSBCI-ADM-OHIO-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-');

-- 48. Oklahoma SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-OK-OKLAHOMA-SSBCI-OKLAHOMA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Oklahoma State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Oklahoma State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Oklahoma.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Oklahoma'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-OK-OKLAHOMA-SSBCI-OKLAHOMA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 49. Oregon SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-OR-OREGON-SSBCI-A-OREGON-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC',
  'Oregon State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Oregon State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Oregon.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Oregon'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-OR-OREGON-SSBCI-A-OREGON-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBC');

-- 50. Pennsylvania SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-PA-PENNSYLVANIA-S-PENNSYLVANIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV',
  'Pennsylvania State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Pennsylvania State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Pennsylvania.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Pennsylvania'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-PA-PENNSYLVANIA-S-PENNSYLVANIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV');

-- 51. Rhode Island SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-RI-RHODE-ISLAND-S-RHODE-ISLAND-STATE-SMALL-BUSINESS-CREDIT-INITIATIV',
  'Rhode Island State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Rhode Island State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Rhode Island.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Rhode Island'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-RI-RHODE-ISLAND-S-RHODE-ISLAND-STATE-SMALL-BUSINESS-CREDIT-INITIATIV');

-- 52. South Carolina SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-SC-SOUTH-CAROLINA-SOUTH-CAROLINA-STATE-SMALL-BUSINESS-CREDIT-INITIAT',
  'South Carolina State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'South Carolina State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in South Carolina.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['South Carolina'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-SC-SOUTH-CAROLINA-SOUTH-CAROLINA-STATE-SMALL-BUSINESS-CREDIT-INITIAT');

-- 53. South Dakota SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-SD-SOUTH-DAKOTA-S-SOUTH-DAKOTA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV',
  'South Dakota State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'South Dakota State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in South Dakota.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['South Dakota'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-SD-SOUTH-DAKOTA-S-SOUTH-DAKOTA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV');

-- 54. Tennessee SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-TN-TENNESSEE-SSBC-TENNESSEE-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S',
  'Tennessee State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Tennessee State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Tennessee.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Tennessee'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-TN-TENNESSEE-SSBC-TENNESSEE-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S');

-- 55. Texas SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-TX-TEXAS-SSBCI-AD-TEXAS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI',
  'Texas State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Texas State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Texas.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Texas'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-TX-TEXAS-SSBCI-AD-TEXAS-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI');

-- 56. Utah SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-UT-UTAH-SSBCI-ADM-UTAH-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-',
  'Utah State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Utah State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Utah.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Utah'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-UT-UTAH-SSBCI-ADM-UTAH-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSBCI-');

-- 57. Vermont SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-VT-VERMONT-SSBCI--VERMONT-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Vermont State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Vermont State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Vermont.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Vermont'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-VT-VERMONT-SSBCI--VERMONT-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- 58. Virginia SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-VA-VIRGINIA-SSBCI-VIRGINIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS',
  'Virginia State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Virginia State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Virginia.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Virginia'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-VA-VIRGINIA-SSBCI-VIRGINIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SS');

-- 59. Washington SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-WA-WASHINGTON-SSB-WASHINGTON-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-',
  'Washington State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Washington State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Washington.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Washington'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-WA-WASHINGTON-SSB-WASHINGTON-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-');

-- 60. West Virginia SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-WV-WEST-VIRGINIA--WEST-VIRGINIA-STATE-SMALL-BUSINESS-CREDIT-INITIATI',
  'West Virginia State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'West Virginia State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in West Virginia.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['West Virginia'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-WV-WEST-VIRGINIA--WEST-VIRGINIA-STATE-SMALL-BUSINESS-CREDIT-INITIATI');

-- 61. Wisconsin SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-WI-WISCONSIN-SSBC-WISCONSIN-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S',
  'Wisconsin State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Wisconsin State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Wisconsin.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Wisconsin'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-WI-WISCONSIN-SSBC-WISCONSIN-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-S');

-- 62. Wyoming SSBCI
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-WY-WYOMING-SSBCI--WYOMING-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB',
  'Wyoming State Small Business Credit Initiative (SSBCI) Capital Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Wyoming State Small Business Credit Initiative (SSBCI) administrator / U.S. Treasury approved programs',
  'Access to Capital',
  'State-administered State Small Business Credit Initiative (SSBCI) capital programs intended to expand access to loans, guarantees, collateral support, participation loans, or investment capital for small businesses in Wyoming.',
  'Potential fit for breweries needing startup capital, expansion financing, equipment financing, working capital, or collateral support; exact terms depend on state-approved programs and local lenders/CDFIs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'State-specific cycle', 'open',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-list-of-programs-and-contacts',
  'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci/capital-program-summaries',
  ARRAY['Wyoming'], NULL, NULL,
  NULL, NULL, false, true,
  'Small business capital; manufacturing; hospitality', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Seed row for complete 50-state coverage. additional verification or detail extraction should split state-specific loan participation, collateral support, and venture programs into separate child records.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-WY-WYOMING-SSBCI--WYOMING-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE-SSB');

-- ── State-specific detailed programs (63–73) ──────────────────────────────────

-- 63. Pennsylvania SSBCI (PA-SSBCI detail)
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-PENNSYLVANIA-D-PENNSYLVANIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV',
  'Pennsylvania State Small Business Credit Initiative (PA-SSBCI)',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee', 'State',
  'Pennsylvania Department of Community & Economic Development',
  'Access to Capital',
  'Includes programs supporting private financing for small businesses through program administrators.',
  'Strong fit for breweries seeking expansion/job-creation financing; terms vary by administrator.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Rolling/Administrator-specific', 'open',
  'https://dced.pa.gov/programs-funding/federal-funding-opportunities/pennsylvania-state-small-business-credit-initiative-pa-ssbci/',
  'https://dced.pa.gov/programs-funding/federal-funding-opportunities/pennsylvania-state-small-business-credit-initiative-pa-ssbci/',
  ARRAY['Pennsylvania'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Small business capital', 'Mixed', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-PENNSYLVANIA-D-PENNSYLVANIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIV');

-- 64. Colorado Startup Loan Fund
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-COLORADO-OFFIC-COLORADO-STARTUP-LOAN-FUND',
  'Colorado Startup Loan Fund',
  NULL, NULL,
  'Loan / Technical Assistance', 'State',
  'Colorado Office of Economic Development and International Trade',
  'Startup / Access to Capital',
  'Provides loan capital through mission-based lenders for Colorado entrepreneurs and small businesses.',
  'Good fit for startup breweries, taprooms, and small beverage businesses that need smaller or first-time loans.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Rolling through lenders', 'open',
  'https://oedit.colorado.gov/colorado-startup-loan-fund',
  'https://oedit.colorado.gov/colorado-startup-loan-fund',
  ARRAY['Colorado'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Small business startup capital', 'Startup', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-COLORADO-OFFIC-COLORADO-STARTUP-LOAN-FUND');

-- 65. Colorado CDBG Business Loan
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-COLORADO-OFFIC-COLORADO-COMMUNITY-DEVELOPMENT-BLOCK-GRANT-BUSINES',
  'Colorado Community Development Block Grant Business Loan',
  NULL, NULL,
  'Loan / Loan Guarantee', 'State',
  'Colorado Office of Economic Development and International Trade',
  'Rural Business Financing',
  'Aids businesses in rural areas by providing loans and loan guarantees.',
  'Potential fit for rural breweries and brewpubs needing equipment, renovation, expansion, or working capital support.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Rolling/Local Community Development Block Grant (CDBG) administration', 'open',
  'https://oedit.colorado.gov/community-development-block-grant-business-loan',
  'https://oedit.colorado.gov/community-development-block-grant-business-loan',
  ARRAY['Colorado'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Rural business financing', 'Rural Development', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-COLORADO-OFFIC-COLORADO-COMMUNITY-DEVELOPMENT-BLOCK-GRANT-BUSINES');

-- 66. Colorado State Trade Expansion Program Grant (STEP)
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'FED-SBA-STEP-2',
  'Colorado State Trade Expansion Program Grant',
  'STEP; SBA', 'STEP = State Trade Expansion Program; SBA = U.S. Small Business Administration',
  'Grant / Matching Funds', 'State',
  'Colorado Office of Economic Development and International Trade',
  'Export Assistance',
  'Helps Colorado small businesses expand internationally by funding international business development activities.',
  'Fit for breweries exploring export markets or international trade shows.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Annual/State cycle', 'open',
  'https://oedit.colorado.gov/state-trade-expansion-program-grant',
  'https://oedit.colorado.gov/state-trade-expansion-program-grant',
  ARRAY['Colorado'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Export assistance', 'Export', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, false, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'FED-SBA-STEP-2');

-- 67. Oregon Business Development Fund (OBDF)
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-BUSINESS-OREGO-OREGON-BUSINESS-DEVELOPMENT-FUND-OBDF',
  'Oregon Business Development Fund (OBDF)',
  NULL, NULL,
  'Loan', 'State',
  'Business Oregon',
  'Business Expansion / Manufacturing',
  'Revolving loan fund providing fixed-rate term gap financing for land, buildings, equipment, machinery, and permanent working capital.',
  'Strong brewery fit for manufacturing/processing/distribution expansion, facility improvements, equipment, and job creation/retention.',
  4, 'High',
  NULL, NULL, 'Usually paired with traditional lender',
  NULL, 'Rolling', 'open',
  'https://www.oregon.gov/biz/programs/obdf/pages/default.aspx',
  'https://www.oregon.gov/biz/programs/obdf/pages/default.aspx',
  ARRAY['Oregon'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Manufacturing/processing/distribution', 'Expansion', NULL,
  '2026-11-04', 'Tier 1', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-BUSINESS-OREGO-OREGON-BUSINESS-DEVELOPMENT-FUND-OBDF');

-- 68. Washington Access to Capital Programs
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-WASHINGTON-STA-WASHINGTON-ACCESS-TO-CAPITAL-PROGRAMS',
  'Washington Access to Capital Programs',
  NULL, NULL,
  'Loan / Loan Guarantee', 'State',
  'Washington State Department of Commerce',
  'Access to Capital',
  'State Commerce loan programs may support equipment, renovation, expansion, construction, early-stage product development, and redevelopment of abandoned/underutilized properties.',
  'Strong fit for Washington breweries needing equipment, facility renovation/expansion, or redevelopment capital.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.commerce.wa.gov/access-to-capital/',
  'https://www.commerce.wa.gov/access-to-capital/',
  ARRAY['Washington'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Small business capital/redevelopment', 'Mixed', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-WASHINGTON-STA-WASHINGTON-ACCESS-TO-CAPITAL-PROGRAMS');

-- 69. Washington Small Business Flex Fund 2
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-WASHINGTON-DEP-WASHINGTON-SMALL-BUSINESS-FLEX-FUND-2',
  'Washington Small Business Flex Fund 2',
  NULL, NULL,
  'Loan', 'State',
  'Washington Department of Commerce-approved lenders',
  'Small Business Financing',
  'Affordable loan program for small businesses and nonprofits through approved community lenders.',
  'Fit for smaller breweries/taprooms needing flexible capital; not forgivable.',
  3, 'High',
  NULL, NULL, 'No grant match; underwriting varies',
  NULL, 'Rolling', 'open',
  'https://smallbusinessflexfund.org/',
  'https://smallbusinessflexfund.org/',
  ARRAY['Washington'], NULL, NULL,
  NULL, NULL, false, NULL,
  'Small business capital', 'Mixed', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-WASHINGTON-DEP-WASHINGTON-SMALL-BUSINESS-FLEX-FUND-2');

-- 70. North Carolina Rural Building Reuse Program
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-NORTH-CAROLINA-NORTH-CAROLINA-RURAL-BUILDING-REUSE-PROGRAM',
  'North Carolina Rural Building Reuse Program',
  NULL, NULL,
  'Grant', 'State',
  'North Carolina Department of Commerce',
  'Building Reuse / Rural Development',
  'Provides grants to local governments to assist with building improvements to real property that lead to direct creation of new full-time private-sector jobs.',
  'Strong fit for rural breweries renovating vacant buildings or expanding existing facilities, typically via local government applicant.',
  4, 'High',
  NULL, NULL, 'Cash match equal to grant request amount',
  NULL, 'Rolling/Competitive', 'open',
  'https://www.commerce.nc.gov/grants-incentives/building-or-site-funds/building-reuse/building-reuse-state-rural-grants',
  'https://www.commerce.nc.gov/grants-incentives/building-or-site-funds/building-reuse/building-reuse-state-rural-grants',
  ARRAY['North Carolina'], NULL, NULL,
  NULL, true, NULL, NULL,
  'Building reuse/manufacturing/hospitality', 'Expansion', NULL,
  '2026-11-04', 'Tier 1', NULL,
  true, false, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-NORTH-CAROLINA-NORTH-CAROLINA-RURAL-BUILDING-REUSE-PROGRAM');

-- 71. New York State SSBCI Programs (Empire State Development)
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-EMPIRE-STATE-D-NEW-YORK-STATE-SSBCI-PROGRAMS',
  'New York State Small Business Credit Initiative (SSBCI) Programs',
  'SSBCI', 'SSBCI = State Small Business Credit Initiative',
  'Loan / Loan Guarantee / Investment', 'State',
  'Empire State Development',
  'Access to Capital',
  'New York State Small Business Credit Initiative (SSBCI) supports programs for small businesses including SEDI-owned and very small businesses.',
  'Potential fit for brewery startup/expansion capital; program-specific lender/partner requirements apply.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://esd.ny.gov/ssbci',
  'https://esd.ny.gov/ssbci',
  ARRAY['New York'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Small business capital', 'Mixed', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-EMPIRE-STATE-D-NEW-YORK-STATE-SSBCI-PROGRAMS');

-- 72. Georgia State Small Business Credit Initiative
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-GEORGIA-DEPART-GEORGIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE',
  'Georgia State Small Business Credit Initiative',
  NULL, NULL,
  'Loan / Loan Guarantee', 'State',
  'Georgia Department of Community Affairs',
  'Access to Capital',
  'Georgia State Small Business Credit Initiative (SSBCI) strengthens state lending programs that support small businesses and manufacturers; official page notes it is not a grant program.',
  'Potential fit for Georgia breweries and manufacturers seeking loan support, not grants.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://dca.georgia.gov/financing-tools/small-business/state-small-business-credit-initiative-ssbci',
  'https://dca.georgia.gov/financing-tools/small-business/state-small-business-credit-initiative-ssbci',
  ARRAY['Georgia'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Small business/manufacturing capital', 'Mixed', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-GEORGIA-DEPART-GEORGIA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE');

-- 73. Iowa State Small Business Credit Initiative
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'STATE-IOWA-ECONOMIC--IOWA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE',
  'Iowa State Small Business Credit Initiative',
  NULL, NULL,
  'Loan / Investment', 'State',
  'Iowa Economic Development Authority',
  'Access to Capital',
  'Iowa State Small Business Credit Initiative (SSBCI) is an investment in small businesses, startups, and manufacturers.',
  'Potential fit for Iowa breweries as small businesses/manufacturers depending on program terms.',
  3, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://opportunityiowa.gov/business/small-business-entrepreneurs/small-business-resources/state-small-business-credit-initiative-ssbci',
  'https://opportunityiowa.gov/business/small-business-entrepreneurs/small-business-resources/state-small-business-credit-initiative-ssbci',
  ARRAY['Iowa'], NULL, NULL,
  NULL, NULL, NULL, NULL,
  'Small business/startup/manufacturing capital', 'Mixed', NULL,
  '2026-11-04', 'Tier 2', NULL,
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'STATE-IOWA-ECONOMIC--IOWA-STATE-SMALL-BUSINESS-CREDIT-INITIATIVE');

-- ── Municipal / County / Regional programs (74–91) ───────────────────────────

-- 74. Philadelphia Storefront Improvement Program
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-PA-CITY-OF-PHILAD-PHILADELPHIA-STOREFRONT-IMPROVEMENT-PROGRAM',
  'Philadelphia Storefront Improvement Program',
  NULL, NULL,
  'Grant / Matching Funds', 'Municipal',
  'City of Philadelphia Department of Commerce',
  'Facade Improvement',
  'Matching reimbursement for eligible exterior improvements to commercial properties.',
  'Potential fit for brewery taprooms/brewpubs with street-facing commercial storefronts.',
  3, 'Medium',
  NULL, NULL, 'Match required',
  NULL, 'Program-specific', 'open',
  'https://www.phila.gov/programs/storefront-improvement-program/',
  'https://www.phila.gov/programs/storefront-improvement-program/',
  ARRAY['Pennsylvania'], 'Philadelphia County', 'Philadelphia',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, false, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-PA-CITY-OF-PHILAD-PHILADELPHIA-STOREFRONT-IMPROVEMENT-PROGRAM');

-- 75. Pittsburgh Urban Redevelopment Authority Business Financing Programs
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-PA-URBAN-REDEVELO-PITTSBURGH-URBAN-REDEVELOPMENT-AUTHORITY-BUSINESS-',
  'Pittsburgh Urban Redevelopment Authority Business Financing Programs',
  NULL, NULL,
  'Loan / Grant / Incentive', 'Municipal',
  'Urban Redevelopment Authority of Pittsburgh',
  'Redevelopment / Small Business Financing',
  'Municipal redevelopment authority financing and incentive programs for businesses and property redevelopment.',
  'Potential fit for breweries, brewpubs, and taprooms in Pittsburgh needing real estate, storefront, or expansion financing.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.ura.org/pages/business-support',
  'https://www.ura.org/pages/business-support',
  ARRAY['Pennsylvania'], 'Allegheny County', 'Pittsburgh',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-PA-URBAN-REDEVELO-PITTSBURGH-URBAN-REDEVELOPMENT-AUTHORITY-BUSINESS-');

-- 76. Denver Business Incentive Fund / Business Support Programs
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-CO-CITY-AND-COUNT-DENVER-BUSINESS-INCENTIVE-FUND-BUSINESS-SUPPORT-PR',
  'Denver Business Incentive Fund / Business Support Programs',
  NULL, NULL,
  'Incentive / Grant / Technical Assistance', 'Municipal',
  'City and County of Denver Economic Development & Opportunity',
  'Small Business / Redevelopment',
  'Denver business support and incentive resources for growth, retention, and neighborhood investment.',
  'Potential fit for Denver breweries/taprooms depending on location, project, and current funding rounds.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Economic-Development-Opportunity/Business-Development',
  'https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Economic-Development-Opportunity/Business-Development',
  ARRAY['Colorado'], 'Denver County', 'Denver',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, false, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-CO-CITY-AND-COUNT-DENVER-BUSINESS-INCENTIVE-FUND-BUSINESS-SUPPORT-PR');

-- 77. Boulder County Economic Development Business Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'COUNTY-CO-BOULDER-COUNTY-BOULDER-COUNTY-ECONOMIC-DEVELOPMENT-BUSINESS-RESOU',
  'Boulder County Economic Development Business Resources',
  NULL, NULL,
  'Loan / Grant / Technical Assistance', 'County',
  'Boulder County Economic Development',
  'Small Business Support',
  'County economic development resources and connections to financing, workforce, and business support.',
  'Potential fit for breweries in Boulder County; requires program-level follow-up.',
  2, 'Low',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://bouldercounty.gov/business/economic-development/',
  'https://bouldercounty.gov/business/economic-development/',
  ARRAY['Colorado'], 'Boulder County', NULL,
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 3',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'COUNTY-CO-BOULDER-COUNTY-BOULDER-COUNTY-ECONOMIC-DEVELOPMENT-BUSINESS-RESOU');

-- 78. Los Angeles Economic & Workforce Development BusinessSource / Financing Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-CA-CITY-OF-LOS-AN-LOS-ANGELES-ECONOMIC-WORKFORCE-DEVELOPMENT-BUSINES',
  'Los Angeles Economic & Workforce Development BusinessSource / Financing Resources',
  NULL, NULL,
  'Loan / Technical Assistance', 'Municipal',
  'City of Los Angeles Economic & Workforce Development Department',
  'Small Business Financing',
  'BusinessSource centers and city-linked financing/technical assistance resources for LA businesses.',
  'Potential fit for brewery startups/taprooms in Los Angeles seeking capital readiness, loans, or technical assistance.',
  2, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Rolling', 'open',
  'https://ewddlacity.com/index.php/local-business/businesssource-centers',
  'https://ewddlacity.com/index.php/local-business/businesssource-centers',
  ARRAY['California'], 'Los Angeles County', 'Los Angeles',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 3',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-CA-CITY-OF-LOS-AN-LOS-ANGELES-ECONOMIC-WORKFORCE-DEVELOPMENT-BUSINES');

-- 79. San Francisco Small Business Financing and Storefront Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-CA-SAN-FRANCISCO--SAN-FRANCISCO-SMALL-BUSINESS-FINANCING-AND-STOREFR',
  'San Francisco Small Business Financing and Storefront Resources',
  NULL, NULL,
  'Loan / Grant / Technical Assistance', 'Municipal',
  'San Francisco Office of Economic and Workforce Development',
  'Small Business / Storefront',
  'City small business resources for financing, storefront assistance, and business support.',
  'Potential fit for San Francisco breweries/taprooms; specific grants vary by cycle.',
  2, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.sf.gov/departments/office-economic-and-workforce-development',
  'https://www.sf.gov/departments/office-economic-and-workforce-development',
  ARRAY['California'], 'San Francisco County', 'San Francisco',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 3',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-CA-SAN-FRANCISCO--SAN-FRANCISCO-SMALL-BUSINESS-FINANCING-AND-STOREFR');

-- 80. Prosper Portland Business Finance and Incentives
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-OR-PROSPER-PORTLA-PROSPER-PORTLAND-BUSINESS-FINANCE-AND-INCENTIVES',
  'Prosper Portland Business Finance and Incentives',
  NULL, NULL,
  'Loan / Grant / Incentive', 'Municipal',
  'Prosper Portland',
  'Urban Redevelopment / Small Business Financing',
  'Economic development and redevelopment resources supporting Portland businesses and districts.',
  'Potential fit for Portland breweries expanding, improving storefronts, or redeveloping commercial space.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://prosperportland.us/',
  'https://prosperportland.us/',
  ARRAY['Oregon'], 'Multnomah County', 'Portland',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-OR-PROSPER-PORTLA-PROSPER-PORTLAND-BUSINESS-FINANCE-AND-INCENTIVES');

-- 81. Seattle Office of Economic Development Small Business Programs
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-WA-CITY-OF-SEATTL-SEATTLE-OFFICE-OF-ECONOMIC-DEVELOPMENT-SMALL-BUSIN',
  'Seattle Office of Economic Development Small Business Programs',
  NULL, NULL,
  'Grant / Loan / Technical Assistance', 'Municipal',
  'City of Seattle Office of Economic Development',
  'Small Business / Neighborhood Business',
  'Seattle OED programs and resources for small businesses, neighborhood business districts, and economic recovery/growth.',
  'Potential fit for Seattle breweries/taprooms depending on active funding rounds.',
  2, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.seattle.gov/office-of-economic-development',
  'https://www.seattle.gov/office-of-economic-development',
  ARRAY['Washington'], 'King County', 'Seattle',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 3',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-WA-CITY-OF-SEATTL-SEATTLE-OFFICE-OF-ECONOMIC-DEVELOPMENT-SMALL-BUSIN');

-- 82. Detroit Economic Growth Corporation Small Business / Motor City Match Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-MI-DETROIT-ECONOM-DETROIT-ECONOMIC-GROWTH-CORPORATION-SMALL-BUSINESS',
  'Detroit Economic Growth Corporation Small Business / Motor City Match Resources',
  NULL, NULL,
  'Grant / Loan / Technical Assistance', 'Municipal',
  'Detroit Economic Growth Corporation',
  'Small Business / Commercial Corridor',
  'Detroit small business and commercial corridor resources including business support and real estate assistance.',
  'Potential fit for brewery/taproom startups and expansions in Detroit commercial corridors.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.degc.org/',
  'https://www.degc.org/',
  ARRAY['Michigan'], 'Wayne County', 'Detroit',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-MI-DETROIT-ECONOM-DETROIT-ECONOMIC-GROWTH-CORPORATION-SMALL-BUSINESS');

-- 83. Milwaukee Commercial Revitalization / Business Financing Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-WI-CITY-OF-MILWAU-MILWAUKEE-COMMERCIAL-REVITALIZATION-BUSINESS-FINAN',
  'Milwaukee Commercial Revitalization / Business Financing Resources',
  NULL, NULL,
  'Loan / Grant / Incentive', 'Municipal',
  'City of Milwaukee Department of City Development',
  'Commercial Revitalization',
  'City resources for business development, commercial corridors, and redevelopment.',
  'Potential fit for breweries/taprooms in Milwaukee redevelopment areas; verify active programs.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://city.milwaukee.gov/DCD',
  'https://city.milwaukee.gov/DCD',
  ARRAY['Wisconsin'], 'Milwaukee County', 'Milwaukee',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-WI-CITY-OF-MILWAU-MILWAUKEE-COMMERCIAL-REVITALIZATION-BUSINESS-FINAN');

-- 84. Asheville-Buncombe Economic Development Coalition Business Expansion Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'REG-NC-ASHEVILLE-BUNC-ASHEVILLE-BUNCOMBE-ECONOMIC-DEVELOPMENT-COALITION-',
  'Asheville-Buncombe Economic Development Coalition Business Expansion Resources',
  NULL, NULL,
  'Loan / Grant / Technical Assistance', 'Regional',
  'Asheville-Buncombe Economic Development Coalition',
  'Economic Development / Manufacturing',
  'Regional economic development resources for business growth and site/expansion support.',
  'Potential fit for brewery-dense Asheville/Buncombe beverage manufacturers expanding operations.',
  3, 'Low',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.ashevillechamber.org/economic-development/',
  'https://www.ashevillechamber.org/economic-development/',
  ARRAY['North Carolina'], 'Buncombe County', 'Asheville',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'High',
  '2026-08-06', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'REG-NC-ASHEVILLE-BUNC-ASHEVILLE-BUNCOMBE-ECONOMIC-DEVELOPMENT-COALITION-');

-- 85. NYC Small Business Services Financing Assistance
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-NY-NYC-DEPARTMENT-NYC-SMALL-BUSINESS-SERVICES-FINANCING-ASSISTANCE',
  'NYC Small Business Services Financing Assistance',
  NULL, NULL,
  'Loan / Technical Assistance', 'Municipal',
  'NYC Department of Small Business Services',
  'Small Business Financing',
  'City assistance connecting small businesses to financing resources and technical assistance.',
  'Potential fit for NYC breweries/taprooms needing capital readiness, lender connections, or city-linked financing.',
  2, 'High',
  NULL, NULL, 'Varies',
  NULL, 'Rolling', 'open',
  'https://www.nyc.gov/site/sbs/businesses/financing-assistance.page',
  'https://www.nyc.gov/site/sbs/businesses/financing-assistance.page',
  ARRAY['New York'], 'New York City', 'New York',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 3',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-NY-NYC-DEPARTMENT-NYC-SMALL-BUSINESS-SERVICES-FINANCING-ASSISTANCE');

-- 86. Burlington Community and Economic Development Office Business Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-VT-CITY-OF-BURLIN-BURLINGTON-COMMUNITY-AND-ECONOMIC-DEVELOPMENT-OFFI',
  'Burlington Community and Economic Development Office Business Resources',
  NULL, NULL,
  'Loan / Grant / Technical Assistance', 'Municipal',
  'City of Burlington CEDO',
  'Small Business / Downtown Development',
  'Municipal economic development resources for Burlington businesses and community development.',
  'Potential fit for breweries/taprooms in Burlington; active financial programs require verification.',
  2, 'Low',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.burlingtonvt.gov/cedo',
  'https://www.burlingtonvt.gov/cedo',
  ARRAY['Vermont'], 'Chittenden County', 'Burlington',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 3',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-VT-CITY-OF-BURLIN-BURLINGTON-COMMUNITY-AND-ECONOMIC-DEVELOPMENT-OFFI');

-- 87. Austin Economic Development Small Business Resources
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-TX-CITY-OF-AUSTIN-AUSTIN-ECONOMIC-DEVELOPMENT-SMALL-BUSINESS-RESOURC',
  'Austin Economic Development Small Business Resources',
  NULL, NULL,
  'Grant / Loan / Technical Assistance', 'Municipal',
  'City of Austin Economic Development Department',
  'Small Business / Creative & Commercial Districts',
  'City small business and economic development resources, including periodic grants and support programs.',
  'Potential fit for Austin breweries/taprooms depending on active grants, districts, and eligibility.',
  2, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.austintexas.gov/department/economic-development',
  'https://www.austintexas.gov/department/economic-development',
  ARRAY['Texas'], 'Travis County', 'Austin',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 3',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-TX-CITY-OF-AUSTIN-AUSTIN-ECONOMIC-DEVELOPMENT-SMALL-BUSINESS-RESOURC');

-- 88. Cleveland Economic Development Business Assistance Programs
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-OH-CITY-OF-CLEVEL-CLEVELAND-ECONOMIC-DEVELOPMENT-BUSINESS-ASSISTANCE',
  'Cleveland Economic Development Business Assistance Programs',
  NULL, NULL,
  'Loan / Grant / Incentive', 'Municipal',
  'City of Cleveland Economic Development',
  'Business Assistance / Redevelopment',
  'City programs supporting business assistance, real estate, and neighborhood development.',
  'Potential fit for Cleveland breweries/taprooms expanding or redeveloping commercial/industrial buildings.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.clevelandohio.gov/city-hall/departments/economic-development',
  'https://www.clevelandohio.gov/city-hall/departments/economic-development',
  ARRAY['Ohio'], 'Cuyahoga County', 'Cleveland',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-OH-CITY-OF-CLEVEL-CLEVELAND-ECONOMIC-DEVELOPMENT-BUSINESS-ASSISTANCE');

-- 89. Richmond Economic Development Business Assistance Programs
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-VA-CITY-OF-RICHMO-RICHMOND-ECONOMIC-DEVELOPMENT-BUSINESS-ASSISTANCE-',
  'Richmond Economic Development Business Assistance Programs',
  NULL, NULL,
  'Loan / Grant / Incentive', 'Municipal',
  'City of Richmond Economic Development',
  'Business Assistance / Redevelopment',
  'City business assistance and economic development resources for growth, relocation, and investment.',
  'Potential fit for Richmond breweries/taprooms needing redevelopment or expansion support.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Program-specific', 'open',
  'https://www.rva.gov/economic-development',
  'https://www.rva.gov/economic-development',
  ARRAY['Virginia'], 'Richmond City', 'Richmond',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-VA-CITY-OF-RICHMO-RICHMOND-ECONOMIC-DEVELOPMENT-BUSINESS-ASSISTANCE-');

-- 90. Minneapolis Business Financing Programs
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-MN-CITY-OF-MINNEA-MINNEAPOLIS-BUSINESS-FINANCING-PROGRAMS',
  'Minneapolis Business Financing Programs',
  NULL, NULL,
  'Loan / Grant / Technical Assistance', 'Municipal',
  'City of Minneapolis Community Planning & Economic Development',
  'Small Business Financing',
  'City business financing and technical assistance resources for Minneapolis businesses.',
  'Potential fit for brewery/taproom real estate, equipment, or expansion financing depending on active loan funds.',
  3, 'Medium',
  NULL, NULL, 'Varies',
  NULL, 'Rolling/Program-specific', 'open',
  'https://www2.minneapolismn.gov/business-services/business-financing/',
  'https://www2.minneapolismn.gov/business-services/business-financing/',
  ARRAY['Minnesota'], 'Hennepin County', 'Minneapolis',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'Medium',
  '2026-11-04', 'Tier 2',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, true, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-MN-CITY-OF-MINNEA-MINNEAPOLIS-BUSINESS-FINANCING-PROGRAMS');

-- 91. Chicago Small Business Improvement Fund (SBIF)
INSERT INTO grants (
  external_program_id, title, program_acronym, acronym_definition,
  funding_type, government_level, funding_agency, program_category,
  description, eligibility_summary,
  brewery_relevance_score, confidence_level,
  amount_min, amount_max, matching_requirement,
  application_deadline, application_cycle, status,
  application_url, source_url,
  states_eligible, county, municipality,
  opportunity_zone_eligible, rural_eligible, forgivable_loan_eligible, stackable,
  industry_focus, business_stage, maintenance_priority,
  next_verification_date, program_priority_tier, data_quality_notes,
  approved, is_loan, is_federal, is_manually_curated, grant_source, last_reviewed_at
)
SELECT
  'MUNI-IL-CITY-OF-CHICAG-CHICAGO-SMALL-BUSINESS-IMPROVEMENT-FUND-SBIF',
  'Chicago Small Business Improvement Fund (SBIF)',
  NULL, NULL,
  'Grant / Matching Funds', 'Municipal',
  'City of Chicago Department of Planning and Development',
  'Building Improvement / Commercial Corridor',
  'Provides grant funding for permanent building improvements in eligible Tax Increment Financing (TIF) districts, subject to program rules and funding rounds.',
  'Strong fit for breweries/taprooms in eligible Chicago districts renovating commercial or industrial space.',
  4, 'Medium',
  NULL, NULL, 'Reimbursement/match structure varies',
  NULL, 'Periodic funding rounds', 'open',
  'https://www.chicago.gov/city/en/depts/dcd/supp_info/small_business_improvementfundsbif.html',
  'https://www.chicago.gov/city/en/depts/dcd/supp_info/small_business_improvementfundsbif.html',
  ARRAY['Illinois'], 'Cook County', 'Chicago',
  NULL, NULL, NULL, NULL,
  'Mixed small business / redevelopment', 'Mixed', 'High',
  '2026-08-06', 'Tier 1',
  'Local high-priority seed record; verify active application windows and sub-guidelines before production.',
  true, false, false, true, 'manual', now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE external_program_id = 'MUNI-IL-CITY-OF-CHICAG-CHICAGO-SMALL-BUSINESS-IMPROVEMENT-FUND-SBIF');
