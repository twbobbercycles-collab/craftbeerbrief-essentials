-- =============================================================================
-- Seed: State-Level Brewery Funding Programs — All 50 States
-- =============================================================================
-- Manually curated state economic development, agriculture, and tourism programs
-- relevant to craft breweries. Uses WHERE NOT EXISTS on title to avoid duplicates.
-- Run AFTER migration 010_grants_improvements.sql has been applied.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================


-- =============================================================================
-- PENNSYLVANIA (3 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Pennsylvania Malt and Brewed Beverage Industry Promotion Program',
  'Supports research, promotion, and industry development for Pennsylvania''s malt and brewed beverage industry. Funds marketing initiatives, technical research, consumer education, and trade development activities that benefit Pennsylvania breweries and the broader craft beer industry. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Open to Pennsylvania licensed breweries, brewpubs, and industry associations. Projects must benefit the Pennsylvania malt and brewed beverage industry. Contact the PA Department of Agriculture for current application cycles.',
  'state_grant',
  null,
  null,
  ARRAY['PA'],
  'open',
  'https://www.agriculture.pa.gov/business_industry_consumers/food_safety/Pages/Malt-and-Brewed-Beverage.aspx',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Pennsylvania Malt and Brewed Beverage Industry Promotion Program');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Pennsylvania Small Business First Fund',
  'Low-interest loans for Pennsylvania small businesses including manufacturers and food and beverage producers. Funds can be used for working capital, machinery, equipment, and real property. A flexible gap financing tool for breweries that need supplemental capital alongside conventional financing. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Pennsylvania small businesses with fewer than 100 employees. Business must be located in Pennsylvania and demonstrate ability to repay. Breweries qualify as small manufacturers under this program.',
  'loan',
  5000,
  200000,
  ARRAY['PA'],
  'open',
  'https://dced.pa.gov/programs/small-business-first-fund/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Pennsylvania Small Business First Fund');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Pennsylvania Industrial Development Authority (PIDA) Loan Program',
  'Low-interest real estate and equipment financing through the Pennsylvania Industrial Development Authority. Breweries expanding facilities, purchasing buildings, or acquiring major equipment can access below-market rate financing through PIDA''s certified economic development organizations. Verify current program availability and terms directly with the agency as programs change frequently.',
  'For-profit businesses in Pennsylvania creating or retaining jobs. Breweries purchasing real estate or major equipment for expansion qualify. Must apply through a PIDA-certified economic development organization in your county.',
  'loan',
  null,
  2000000,
  ARRAY['PA'],
  'open',
  'https://dced.pa.gov/programs/pida/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Pennsylvania Industrial Development Authority (PIDA) Loan Program');


-- =============================================================================
-- CALIFORNIA (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'California Small Business Finance Center — Loan Guarantee Program',
  'IBank''s Small Business Finance Center provides loan guarantees to help California small businesses — including craft breweries — access financing when they might not otherwise qualify. The guarantee covers up to 80% of the loan value, making lenders more willing to extend credit. Also administers the Small Business Loan Guarantee Program for businesses impacted by natural disasters. Verify current program availability and terms directly with the agency as programs change frequently.',
  'California small businesses that are unable to qualify for conventional financing. Breweries seeking equipment loans, working capital, or real estate financing may qualify. Must apply through a participating lender; IBank does not lend directly.',
  'loan',
  null,
  20000000,
  ARRAY['CA'],
  'open',
  'https://www.ibank.ca.gov/small-business-finance-center/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'California Small Business Finance Center — Loan Guarantee Program');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'California Department of Food and Agriculture — Specialty Crop Block Grant Program',
  'California''s administration of the USDA Specialty Crop Block Grant Program funds projects that enhance the competitiveness of California specialty crops, including hops and specialty grains. Breweries partnering with California farmers on research, marketing, food safety, or promotion projects may qualify. Grants are administered by CDFA and announced annually. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Eligible applicants include growers, grower associations, agricultural organizations, and their business partners including breweries. Projects must directly benefit a California-grown specialty crop. Breweries must partner with growers or industry organizations to apply.',
  'state_grant',
  null,
  null,
  ARRAY['CA'],
  'open',
  'https://www.cdfa.ca.gov/grants/SCBGP/',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'California Department of Food and Agriculture — Specialty Crop Block Grant Program');


-- =============================================================================
-- COLORADO (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Colorado OEDIT Advanced Industries Accelerator Grant',
  'The Colorado Office of Economic Development and International Trade supports advanced industries companies through grant programs. Breweries developing novel brewing processes, sustainability technology, agricultural processing innovations, or food and beverage manufacturing technology may qualify under the advanced manufacturing category. Programs include proof-of-concept and early-stage capital grants. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Colorado-based companies in advanced industries including advanced manufacturing. Brewery applicants should focus on technology or process innovation rather than general operations. Multiple grant tiers available ranging from early-stage to growth.',
  'state_grant',
  null,
  250000,
  ARRAY['CO'],
  'open',
  'https://oedit.colorado.gov/advanced-industries-accelerator-grants',
  false, false, true, 'manufacturing', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Colorado OEDIT Advanced Industries Accelerator Grant');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Colorado Department of Agriculture Value-Added Grant Program',
  'Supports Colorado agricultural producers adding value to their products. Breweries sourcing Colorado-grown ingredients — including barley, hops, fruit, honey, or herbs — may qualify for funding to support processing, marketing, and business development activities. Colorado has a growing specialty grain and hop industry with dedicated state support. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Colorado agricultural producers and businesses adding value to Colorado-grown products. Brewery must demonstrate use of Colorado-grown ingredients and show how the project adds economic value to the agricultural supply chain.',
  'state_grant',
  null,
  null,
  ARRAY['CO'],
  'open',
  'https://ag.colorado.gov/grants',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Colorado Department of Agriculture Value-Added Grant Program');


-- =============================================================================
-- NEW YORK (3 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'New York Farm Brewery License — Incentive Programs',
  'New York''s Farm Brewery license provides preferential licensing, reduced fees, and access to exclusive programs for breweries using New York State-grown ingredients above the required threshold. Farm breweries can sell products at farmers markets, operate on-farm retail, and access marketing programs. Tax incentives are available for capital investments in farm brewing infrastructure. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Must hold a New York State Farm Brewery license, which requires that a specified and increasing percentage of ingredients are grown in New York State. The threshold increases annually toward 90% New York-grown. Contact the New York State Liquor Authority for current requirements.',
  'tax_incentive',
  null,
  null,
  ARRAY['NY'],
  'open',
  'https://www.agriculture.ny.gov/farming/licenses-and-certifications/farm-beverage-permits',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'New York Farm Brewery License — Incentive Programs');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Empire State Development — Business Assistance Programs',
  'Empire State Development provides grants, loans, and incentives to support New York businesses creating jobs and driving economic growth. Brewery expansions, taproom development in underserved areas, and craft beverage tourism projects have received ESD support. Programs include Excelsior Jobs tax credits, capital grants, and regional economic development funding. Verify current program availability and terms directly with the agency as programs change frequently.',
  'New York State businesses creating or retaining jobs. For most programs, the project must involve significant capital investment and demonstrate economic impact. Breweries should contact their regional ESD office to discuss eligibility for specific programs.',
  'state_grant',
  null,
  null,
  ARRAY['NY'],
  'open',
  'https://esd.ny.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Empire State Development — Business Assistance Programs');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'New York State Small Business Development Center (SBDC)',
  'The NY SBDC provides free business advising, financial analysis, and assistance identifying and applying for state and federal funding programs. SBDC advisors help New York breweries prepare loan applications, identify grant programs, and connect with economic development resources. Free advisory services available at regional centers throughout the state. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Any New York State small business is eligible for free SBDC advisory services. No minimum size or revenue requirement. Breweries at any stage from startup through expansion can access advisors who specialize in food, beverage, and manufacturing businesses.',
  'state_grant',
  null,
  null,
  ARRAY['NY'],
  'open',
  'https://www.nyssbdc.org/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'New York State Small Business Development Center (SBDC)');


-- =============================================================================
-- MICHIGAN (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Michigan Economic Development Corporation (MEDC) — Small Business Programs',
  'The MEDC offers loan programs, grants, and incentives supporting Michigan small businesses and manufacturers including craft beverage producers. Programs include the Michigan Business Development Program, Capital Access Program loan guarantees, and regional economic development grants. Michigan has one of the largest craft brewery industries in the country with dedicated state support. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Michigan-based small businesses including craft breweries. Specific eligibility varies by program — some require job creation commitments, others focus on capital investment. Contact MEDC or a local economic development organization to identify the best fit.',
  'loan',
  null,
  null,
  ARRAY['MI'],
  'open',
  'https://www.michiganbusiness.org/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Michigan Economic Development Corporation (MEDC) — Small Business Programs');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Michigan Department of Agriculture and Rural Development — Specialty Crop Block Grant',
  'Michigan''s administration of the USDA Specialty Crop Block Grant funds projects that enhance the competitiveness of Michigan specialty crops including hops and specialty grains. Michigan has an active hop-growing community, and breweries partnering with Michigan growers on research, marketing, or food safety projects may qualify for this funding. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Michigan agricultural producers, grower associations, and their business partners. Breweries using Michigan-grown hops, specialty grains, fruit, or honey may qualify in partnership with growers or industry organizations. Projects must benefit a Michigan-grown specialty crop.',
  'state_grant',
  null,
  null,
  ARRAY['MI'],
  'open',
  'https://www.michigan.gov/mdard/grants',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Michigan Department of Agriculture and Rural Development — Specialty Crop Block Grant');


-- =============================================================================
-- WASHINGTON (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Washington State Department of Commerce — Small Business Programs',
  'Washington Commerce administers multiple loan and grant programs for small businesses including craft breweries. The Small Business Flex Fund provides low-interest loans for working capital and growth. Additional programs support rural businesses, distressed communities, and manufacturers. Washington''s craft beverage industry is a designated priority sector with dedicated state support. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Washington State small businesses. Specific programs have varying requirements around number of employees, location, and intended use of funds. Breweries should contact the regional Small Business Development Center or Commerce directly to identify current program availability.',
  'loan',
  null,
  null,
  ARRAY['WA'],
  'open',
  'https://www.commerce.wa.gov/growing-the-economy/small-business/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Washington State Department of Commerce — Small Business Programs');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Washington State Department of Agriculture — Specialty Crop and Craft Beverage Programs',
  'WSDA administers federal specialty crop funds and supports Washington''s craft beverage industry, which includes the largest hop-growing region in the United States. Programs fund research, marketing, food safety, and industry development for hop growers and their brewery partners. Breweries sourcing Washington-grown hops, barley, fruit, or honey may qualify for grower partnership programs. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Washington agricultural producers, grower associations, and businesses that partner with Washington growers. Breweries must demonstrate use of Washington-grown ingredients. The hop industry has dedicated funding given Washington''s role as the primary US hop-growing state.',
  'state_grant',
  null,
  null,
  ARRAY['WA'],
  'open',
  'https://agr.wa.gov/departments/commodity-inspections-and-grading/specialty-crops',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Washington State Department of Agriculture — Specialty Crop and Craft Beverage Programs');


-- =============================================================================
-- OREGON (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Business Oregon — Oregon Business Development Fund (OBDF)',
  'Low-interest gap financing for Oregon businesses including manufacturers, food processors, and craft beverage producers. OBDF loans fill the gap between what a conventional lender will finance and what a business needs. Ideal for brewery expansions that are partially but not fully fundable through conventional channels. Funds can cover equipment, real property, and working capital. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Oregon businesses that are creating or retaining jobs. Projects must demonstrate a financing gap that the OBDF would fill alongside conventional financing. Breweries undertaking capital-intensive expansions — new facilities, major equipment purchases, property acquisition — are typical candidates.',
  'loan',
  50000,
  2000000,
  ARRAY['OR'],
  'open',
  'https://www.oregon4biz.com/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Business Oregon — Oregon Business Development Fund (OBDF)');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Oregon Department of Agriculture — Specialty Crop Block Grant Program',
  'Oregon''s USDA Specialty Crop Block Grant allocation funds projects enhancing the competitiveness of Oregon specialty crops. Oregon is a major producer of hops and specialty grains, making this program directly relevant to breweries that source Oregon-grown ingredients. Eligible projects include research, marketing, food safety, and industry development. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Oregon agricultural producers, grower organizations, and their business partners. Breweries must partner with Oregon growers or industry associations and focus the project on benefits to the specialty crop supply chain. Annual grant cycles are announced by ODA.',
  'state_grant',
  null,
  null,
  ARRAY['OR'],
  'open',
  'https://www.oregon.gov/ODA/programs/NaturalResources/SpecialtyCrops/Pages/SpecialtyCropBlockGrant.aspx',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Oregon Department of Agriculture — Specialty Crop Block Grant Program');


-- =============================================================================
-- TEXAS (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Texas Enterprise Fund',
  'Governor-administered discretionary incentive fund for businesses creating significant jobs and capital investment in Texas. Large brewery or beverage manufacturing expansions with substantial employment projections may qualify for direct incentive grants. Funds are awarded as deal-closing incentives and are tied to job creation commitments with clawback provisions. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Businesses committing to create significant jobs and capital investment in Texas. Typically requires a competing offer from another state. Most suitable for large-scale brewery expansions or new facility investments rather than small businesses. Direct applications are evaluated by the Governor''s Office.',
  'state_grant',
  null,
  null,
  ARRAY['TX'],
  'open',
  'https://gov.texas.gov/business/page/texas-enterprise-fund',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Texas Enterprise Fund');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Texas Department of Agriculture — Go Texan Program',
  'Promotes Texas agricultural products and food and beverage businesses in local, national, and international markets. Craft breweries using Texas-grown ingredients can join the Go Texan certification program for marketing support, promotional opportunities at events and trade shows, and brand recognition with Texas consumers. The program provides cost-effective marketing exposure for small craft beverage producers. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Texas food, beverage, and agricultural businesses using Texas-grown or Texas-produced products. Breweries must use qualifying Texas ingredients to carry the Go Texan mark. Annual membership fees apply; marketing support value typically far exceeds membership cost.',
  'state_grant',
  null,
  null,
  ARRAY['TX'],
  'open',
  'https://www.texasagriculture.gov/gotexan',
  false, false, true, 'tourism', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Texas Department of Agriculture — Go Texan Program');


-- =============================================================================
-- FLORIDA (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Florida Department of Economic Opportunity — Quick Action Closing Fund',
  'Discretionary incentive program to attract and retain high-value businesses and create jobs in Florida. Large brewery projects creating substantial employment may qualify for direct grants through this competitive fund. Awards are tied to job creation commitments and capital investment thresholds. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Businesses creating significant jobs in Florida. Typically requires documented competing offers from other states. Most appropriate for large-scale craft beverage manufacturing investments rather than small independent breweries. Contact FloridaCommerce (formerly DEO) for current eligibility thresholds.',
  'state_grant',
  null,
  null,
  ARRAY['FL'],
  'open',
  'https://floridajobs.org/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Florida Department of Economic Opportunity — Quick Action Closing Fund');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Florida Department of Agriculture and Consumer Services — Specialty Crop Block Grant',
  'Florida''s administration of the USDA Specialty Crop Block Grant funds projects that enhance the competitiveness of Florida specialty crops. Florida breweries using locally grown citrus, tropical fruits, honey, herbs, or other specialty agricultural ingredients may qualify in partnership with Florida growers. Projects must enhance the competitiveness of the Florida specialty crop supply chain. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Florida agricultural producers, grower organizations, and their business partners. Breweries must partner with Florida growers and demonstrate how the project benefits Florida-grown specialty crops. Annual application cycles are announced by FDACS.',
  'state_grant',
  null,
  null,
  ARRAY['FL'],
  'open',
  'https://www.fdacs.gov/Agriculture-Industry/Grants',
  false, false, true, 'agriculture', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Florida Department of Agriculture and Consumer Services — Specialty Crop Block Grant');


-- =============================================================================
-- OHIO (2 programs)
-- =============================================================================

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Ohio Development Services Agency — Craft and Small Manufacturer Development Programs',
  'Ohio Development provides grants and loans for small manufacturers and craft producers across Ohio. Programs support equipment purchases, facility improvements, workforce development, and business growth. Ohio has one of the fastest-growing craft brewery industries in the Midwest with dedicated state economic development support. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Ohio small businesses and manufacturers. Breweries qualify as food and beverage manufacturers under Ohio economic development programs. Projects creating or retaining jobs and demonstrating capital investment are given priority.',
  'state_grant',
  null,
  null,
  ARRAY['OH'],
  'open',
  'https://development.ohio.gov/business',
  false, false, true, 'manufacturing', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Ohio Development Services Agency — Craft and Small Manufacturer Development Programs');

INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'JobsOhio Growth Fund',
  'JobsOhio''s loan program provides low-interest loans to Ohio businesses creating jobs and investment. Craft breweries undertaking significant expansions, purchasing facilities, or investing in major equipment upgrades may qualify. JobsOhio focuses on projects with strong job creation potential and economic impact for Ohio communities. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Ohio businesses creating or retaining jobs through capital investment. Breweries must demonstrate a clear job creation or retention commitment tied to the funded project. Applications are accepted on a rolling basis through JobsOhio regional network partners.',
  'loan',
  null,
  null,
  ARRAY['OH'],
  'open',
  'https://www.jobsohio.com/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'JobsOhio Growth Fund');


-- =============================================================================
-- REMAINING 40 STATES — alphabetical
-- =============================================================================

-- Alabama
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Alabama Department of Commerce — Small Business Loan Program',
  'The Alabama Department of Commerce and the Alabama Development Office support small businesses through loan programs and economic development incentives. Craft breweries expanding operations or creating jobs in Alabama may qualify for state financing assistance. Verify current programs at the Alabama Department of Commerce website. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Alabama small businesses creating or retaining jobs. Breweries must be located in Alabama and demonstrate financial viability. Contact the Alabama Department of Commerce for current program availability.',
  'loan',
  null,
  null,
  ARRAY['AL'],
  'open',
  'https://www.madeinalabama.com/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Alabama Department of Commerce — Small Business Loan Program');

-- Alaska
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Alaska Industrial Development and Export Authority (AIDEA) — Business Loans',
  'AIDEA provides loans and loan participation programs for Alaska businesses including manufacturers and food and beverage producers. Breweries expanding facilities or purchasing equipment in Alaska may qualify for below-market financing. Alaska''s craft brewery industry serves both local markets and growing tourism demand. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Alaska businesses creating or retaining jobs. Must be located in Alaska and demonstrate financial viability. AIDEA participates in loans alongside conventional lenders rather than lending directly in most cases.',
  'loan',
  null,
  null,
  ARRAY['AK'],
  'open',
  'https://www.aidea.org/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Alaska Industrial Development and Export Authority (AIDEA) — Business Loans');

-- Arizona
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Arizona Commerce Authority — Small Business Programs',
  'The Arizona Commerce Authority supports small businesses and manufacturers through incentive programs, loan assistance, and economic development grants. Arizona has a growing craft brewery market with strong tourism connections. Breweries in qualified opportunity zones or rural Arizona may access additional programs. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Arizona small businesses. Specific programs vary in eligibility. Breweries creating jobs or making significant capital investments may qualify for Arizona Commerce Authority incentive programs. Contact ACA or a local small business development center.',
  'state_grant',
  null,
  null,
  ARRAY['AZ'],
  'open',
  'https://www.azcommerce.com/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Arizona Commerce Authority — Small Business Programs');

-- Arkansas
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Arkansas Economic Development Commission — Small Business and Manufacturer Programs',
  'The Arkansas Economic Development Commission supports manufacturers and small businesses through loan programs, grants, and tax incentives. Arkansas breweries creating jobs may qualify for the Consolidated Incentive Act programs including the Advantage Arkansas tax credit and Create Rebate program. Rural Arkansas breweries may access additional USDA and state rural development funds. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Arkansas businesses creating full-time jobs paying above county average wages. Breweries qualify as manufacturers under Arkansas incentive programs. Applications are reviewed by AEDC on a project-by-project basis.',
  'tax_incentive',
  null,
  null,
  ARRAY['AR'],
  'open',
  'https://www.arkansasedc.com/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Arkansas Economic Development Commission — Small Business and Manufacturer Programs');

-- Connecticut
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Connecticut Department of Economic and Community Development — Small Business Express Program',
  'DECD''s Small Business Express program provides loans and grants to help Connecticut small businesses grow and create jobs. The program has supported food and beverage manufacturers including breweries. Funds can be used for working capital, equipment, and leasehold improvements. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Connecticut small businesses with 100 or fewer employees that have been in operation for at least one year. Brewery must be located in Connecticut and demonstrate ability to create or retain jobs through the funded project.',
  'loan',
  10000,
  500000,
  ARRAY['CT'],
  'open',
  'https://portal.ct.gov/DECD/Content/Business-Development/02_Strategies_For_Growth/Small-Business/Small-Business-Express',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Connecticut Department of Economic and Community Development — Small Business Express Program');

-- Delaware
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Delaware Division of Small Business — Grants and Loan Programs',
  'Delaware supports small businesses through grants, loans, and technical assistance programs. The Delaware Strategic Fund provides grants and loans for businesses creating jobs and economic development. Delaware craft breweries benefit from the state''s growing tourism and food scene. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Delaware small businesses. Eligibility varies by program. Breweries creating jobs or making capital investments are typical candidates. Contact the Delaware Division of Small Business for current program availability.',
  'state_grant',
  null,
  null,
  ARRAY['DE'],
  'open',
  'https://business.delaware.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Delaware Division of Small Business — Grants and Loan Programs');

-- Georgia
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Georgia Department of Economic Development — Business Incentive Programs',
  'Georgia Economic Development supports businesses through investment tax credits, job tax credits, and economic development programs. Georgia craft breweries creating jobs may qualify for the Job Tax Credit program which provides annual tax credits per net new job. Breweries in less developed counties receive higher credit amounts. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Georgia businesses creating net new full-time jobs. Tax credit amounts vary by county designation. Breweries qualify as manufacturers and food and beverage producers under Georgia''s incentive programs. Contact the Georgia Department of Economic Development or a local development authority.',
  'tax_incentive',
  null,
  null,
  ARRAY['GA'],
  'open',
  'https://www.georgia.org/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Georgia Department of Economic Development — Business Incentive Programs');

-- Hawaii
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Hawaii Department of Business, Economic Development and Tourism — Small Business Programs',
  'DBEDT supports Hawaii small businesses through loan programs and economic development initiatives. Hawaii craft breweries serving the state''s significant tourism market have growth opportunities. The state''s High Technology Development Corporation and other agencies administer programs that food and beverage innovators may access. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Hawaii small businesses. Specific eligibility depends on the program. Breweries should contact DBEDT or the Hawaii Small Business Development Center for current program availability and guidance.',
  'loan',
  null,
  null,
  ARRAY['HI'],
  'open',
  'https://dbedt.hawaii.gov/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Hawaii Department of Business, Economic Development and Tourism — Small Business Programs');

-- Idaho
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Idaho Department of Commerce — Business Advantage Programs',
  'Idaho Commerce supports businesses through loan programs, tax incentives, and economic development grants. Idaho is a growing craft brewery market with access to quality hops and barley from the Pacific Northwest. Breweries creating jobs may qualify for Idaho''s Business Advantage incentive program. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Idaho businesses creating jobs. The Business Advantage program provides tax reimbursements for significant capital investments and job creation. Breweries making major facility investments and hiring should contact Idaho Commerce to evaluate eligibility.',
  'tax_incentive',
  null,
  null,
  ARRAY['ID'],
  'open',
  'https://commerce.idaho.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Idaho Department of Commerce — Business Advantage Programs');

-- Illinois
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Illinois Department of Commerce and Economic Opportunity (DCEO) — Small Business Programs',
  'DCEO administers multiple programs supporting Illinois small businesses and manufacturers including craft breweries. Programs include the Illinois Advantage program for manufacturers, the Advantage Illinois loan participation program, and community development grants. Illinois has one of the largest craft brewery industries in the Midwest. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Illinois small businesses and manufacturers. Breweries creating jobs and making capital investments are typical candidates. DCEO programs vary in eligibility — contact a regional SBDC or DCEO directly to identify the right program.',
  'loan',
  null,
  null,
  ARRAY['IL'],
  'open',
  'https://dceo.illinois.gov/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Illinois Department of Commerce and Economic Opportunity (DCEO) — Small Business Programs');

-- Indiana
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Indiana Economic Development Corporation (IEDC) — Small Business and Manufacturer Programs',
  'The IEDC supports Indiana businesses through tax credits, loans, and grants. The Hoosier Business Investment tax credit rewards capital investment, and the Economic Development for a Growing Economy (EDGE) program provides payroll tax credits for job creation. Indiana breweries making significant investments and creating jobs may access these programs. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Indiana businesses creating or retaining jobs through capital investment. Breweries qualify as food and beverage manufacturers. IEDC programs typically have minimum job creation and wage thresholds. Contact IEDC or a regional economic development organization for project-specific guidance.',
  'tax_incentive',
  null,
  null,
  ARRAY['IN'],
  'open',
  'https://iedc.in.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Indiana Economic Development Corporation (IEDC) — Small Business and Manufacturer Programs');

-- Iowa
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Iowa Economic Development Authority (IEDA) — Business Financial Assistance',
  'IEDA provides loans, grants, and tax credits to Iowa businesses creating jobs and investment. The Iowa Economic Development Fund and Iowa Industrial New Jobs Training program are key resources for manufacturers. Iowa craft breweries using Iowa-grown ingredients or located in rural communities may access additional programs. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Iowa businesses creating jobs. Most IEDA programs have minimum job creation thresholds. Breweries in smaller communities and rural areas may access Community Development Block Grant funds administered through IEDA. Contact IEDA or an Iowa SBDC advisor.',
  'loan',
  null,
  null,
  ARRAY['IA'],
  'open',
  'https://www.iowaeconomicdevelopment.com/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Iowa Economic Development Authority (IEDA) — Business Financial Assistance');

-- Kansas
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Kansas Department of Commerce — Business Development Programs',
  'Kansas Commerce supports businesses through the PEAK (Promoting Employment Across Kansas) program, the High Performance Incentive Program (HPIP), and economic development loans. Kansas breweries creating jobs and making capital investments may qualify for these incentive programs. Kansas has growing craft brewery communities in Wichita, Lawrence, and Kansas City metro. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Kansas businesses creating jobs and making capital investments above threshold amounts. Breweries qualify as manufacturers under HPIP and may qualify for PEAK payroll withholding retention. Contact Kansas Commerce for current eligibility thresholds.',
  'tax_incentive',
  null,
  null,
  ARRAY['KS'],
  'open',
  'https://www.kansascommerce.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Kansas Department of Commerce — Business Development Programs');

-- Kentucky
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Kentucky Cabinet for Economic Development — Small Business Programs',
  'Kentucky CED administers tax incentives and loan programs for manufacturers and businesses. The Kentucky Business Investment (KBI) program provides tax credits for job creation and investment. Kentucky''s craft brewery industry connects naturally with the state''s bourbon tourism brand — many breweries benefit from the growing distillery and craft beverage tourism corridors. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Kentucky businesses creating jobs and making capital investments. The KBI program requires minimum employment and investment thresholds. Breweries in rural Kentucky may access additional Rural Economic Development Incentive (REDI) benefits. Contact the Kentucky Cabinet for Economic Development.',
  'tax_incentive',
  null,
  null,
  ARRAY['KY'],
  'open',
  'https://www.thinkkentucky.com/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Kentucky Cabinet for Economic Development — Small Business Programs');

-- Louisiana
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Louisiana Economic Development (LED) — Business Incentive Programs',
  'LED administers multiple incentive programs for Louisiana businesses including the Quality Jobs program (payroll tax rebates for job creation) and the Industrial Tax Exemption Program (ITEP) for manufacturers. Louisiana breweries creating jobs and making capital investments may qualify. Louisiana''s unique food and beverage culture supports a growing craft brewery market. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Louisiana businesses creating full-time jobs above minimum wage thresholds. Breweries qualify as manufacturers under ITEP and food and beverage producers under Quality Jobs. Contact LED FastStart or a regional economic development organization for project evaluation.',
  'tax_incentive',
  null,
  null,
  ARRAY['LA'],
  'open',
  'https://www.opportunitylouisiana.com/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Louisiana Economic Development (LED) — Business Incentive Programs');

-- Maine
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Finance Authority of Maine (FAME) — Business Loan Programs',
  'FAME provides loan guarantees, direct loans, and access to capital programs for Maine businesses. Maine has one of the highest craft brewery concentrations per capita in the nation. FAME''s loan guarantee programs make it easier for Maine breweries to access conventional financing for equipment, real estate, and working capital. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Maine small businesses. FAME does not lend directly in most cases but guarantees loans made by participating banks. Breweries seeking equipment financing, building purchases, or working capital should ask their lender about FAME guarantee programs.',
  'loan',
  null,
  null,
  ARRAY['ME'],
  'open',
  'https://www.famemaine.com/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Finance Authority of Maine (FAME) — Business Loan Programs');

-- Maryland
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Maryland Department of Commerce — Small Business Programs',
  'Maryland Commerce supports small businesses through loan programs, tax credits, and economic development grants. The Maryland Small Business Development Financing Authority (MSBDFA) provides loans and guarantees. Maryland breweries benefit from proximity to the DC metro market and the state''s strong food and beverage culture. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Maryland small businesses. Specific program eligibility varies. Breweries creating jobs and making investments in Maryland facilities are typical candidates. Contact Maryland Commerce or a SBDC advisor for program guidance.',
  'loan',
  null,
  null,
  ARRAY['MD'],
  'open',
  'https://commerce.maryland.gov/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Maryland Department of Commerce — Small Business Programs');

-- Massachusetts
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'MassDevelopment — Business Financing Programs',
  'MassDevelopment is Massachusetts'' development finance agency, providing loans, bonds, and real estate services for businesses and nonprofits. Massachusetts breweries can access equipment loans, working capital lines, and real estate financing. The agency also helps businesses access federal New Markets Tax Credits for projects in low-income communities. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Massachusetts businesses. MassDevelopment focuses on projects that create jobs and strengthen communities. Breweries in gateway cities, rural areas, or low-income communities may access additional programs. Contact MassDevelopment directly to discuss project financing options.',
  'loan',
  null,
  null,
  ARRAY['MA'],
  'open',
  'https://www.massdevelopment.com/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'MassDevelopment — Business Financing Programs');

-- Minnesota
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Minnesota Department of Employment and Economic Development (DEED) — Business Programs',
  'DEED administers multiple programs supporting Minnesota businesses including the Minnesota Investment Fund (MIF) for manufacturers, Job Creation Fund for job-creating businesses, and loan programs through the Small Business Development Centers. Minnesota has a strong craft brewery industry with deep connections to locally grown grain and hops. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Minnesota businesses creating or retaining jobs. The Minnesota Investment Fund requires minimum job creation and wage commitments. Breweries making significant facility investments and hiring are most likely to qualify. Contact DEED or a regional SBDC.',
  'state_grant',
  null,
  null,
  ARRAY['MN'],
  'open',
  'https://mn.gov/deed/business/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Minnesota Department of Employment and Economic Development (DEED) — Business Programs');

-- Mississippi
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Mississippi Development Authority — Small Business Programs',
  'MDA supports Mississippi businesses through loan programs, tax incentives, and economic development grants. The Mississippi Small Business Loan Program and Minority Business Enterprise Loan Program provide capital access. Mississippi breweries in rural areas can also access USDA Rural Development programs through MDA coordination. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Mississippi small businesses. Eligibility varies by program. Breweries creating jobs and making investments in Mississippi are typical candidates. Contact MDA or a Mississippi SBDC advisor.',
  'loan',
  null,
  null,
  ARRAY['MS'],
  'open',
  'https://www.mississippi.org/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Mississippi Development Authority — Small Business Programs');

-- Missouri
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Missouri Department of Economic Development — Business Incentive Programs',
  'Missouri DED administers tax credits and incentive programs for manufacturers and businesses creating jobs. The Missouri Works program provides tax credits for businesses creating jobs above wage thresholds. Missouri Quality Jobs provides additional benefits for high-wage job creation. St. Louis and Kansas City metro breweries access strong craft beer markets. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Missouri businesses creating new jobs above county average wages. Breweries qualify as food and beverage manufacturers. Minimum thresholds apply — most programs require at least 2 new full-time jobs. Contact Missouri DED or a regional economic development organization.',
  'tax_incentive',
  null,
  null,
  ARRAY['MO'],
  'open',
  'https://ded.mo.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Missouri Department of Economic Development — Business Incentive Programs');

-- Montana
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Montana Department of Commerce — Business Loan Programs',
  'Montana Commerce administers loan programs including the Big Sky Economic Development Trust Fund and Business Loan Programs that support Montana businesses. Montana has a strong and growing craft brewery scene tied to outdoor recreation tourism. Rural Montana breweries can access USDA Rural Development programs in coordination with state programs. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Montana businesses creating jobs. Most Montana Commerce programs require a job creation commitment. Breweries in rural Montana may access additional resources. Contact Montana Commerce or a local economic development corporation.',
  'loan',
  null,
  null,
  ARRAY['MT'],
  'open',
  'https://commerce.mt.gov/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Montana Department of Commerce — Business Loan Programs');

-- Nebraska
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Nebraska Department of Economic Development — Business Incentive Programs',
  'NED administers the Nebraska Advantage Act providing tax incentives for job creation and investment. The program offers refundable tax credits, personal property tax exemptions, and sales tax refunds for qualifying businesses. Nebraska breweries making significant investments and creating jobs may qualify. Nebraska has strong agricultural connections supporting craft beverage ingredient sourcing. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Nebraska businesses meeting minimum investment and job creation thresholds. Breweries qualify as manufacturers. Specific tier requirements depend on investment level and job count. Contact Nebraska DED for current thresholds and application guidance.',
  'tax_incentive',
  null,
  null,
  ARRAY['NE'],
  'open',
  'https://opportunity.nebraska.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Nebraska Department of Economic Development — Business Incentive Programs');

-- Nevada
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Nevada Governor''s Office of Economic Development (GOED) — Business Programs',
  'Nevada GOED supports businesses through tax abatements, workforce training grants, and economic development incentives. The Sales and Use Tax Abatement and Modified Business Tax Abatement programs benefit Nevada manufacturers including breweries. Nevada''s growing craft brewery market is supported by strong tourism infrastructure in Las Vegas and Reno. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Nevada businesses making capital investments above threshold amounts and creating jobs. Breweries qualify as manufacturers. Tax abatement programs require meeting investment and job creation minimums over a multi-year period. Contact Nevada GOED for current program requirements.',
  'tax_incentive',
  null,
  null,
  ARRAY['NV'],
  'open',
  'https://goed.nv.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Nevada Governor''s Office of Economic Development (GOED) — Business Programs');

-- New Hampshire
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'New Hampshire Business Finance Authority (BFA) — Loan Guarantee Programs',
  'The NH BFA provides loan guarantees that help New Hampshire businesses access conventional financing they might not otherwise qualify for. Guarantees are available for working capital, equipment, and real estate. New Hampshire has a strong craft brewery industry relative to its population and benefits from New England tourism. Verify current program availability and terms directly with the agency as programs change frequently.',
  'New Hampshire small businesses. The BFA guarantees loans made by participating banks — breweries should ask their bank about BFA guarantee programs when seeking equipment or expansion financing. No direct loan applications to BFA.',
  'loan',
  null,
  null,
  ARRAY['NH'],
  'open',
  'https://www.nhbfa.com/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'New Hampshire Business Finance Authority (BFA) — Loan Guarantee Programs');

-- New Jersey
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'New Jersey Economic Development Authority (NJEDA) — Small Business Programs',
  'NJEDA provides loans, grants, and tax incentives to New Jersey businesses creating jobs. The Small Business Fund provides low-interest loans, and the Emerge program provides tax credits for large job creation projects. New Jersey breweries benefit from access to major metro markets and growing craft beer tourism. Verify current program availability and terms directly with the agency as programs change frequently.',
  'New Jersey small businesses. The Small Business Fund targets businesses that cannot access conventional financing. Emerge and NJ Aspire tax credit programs require larger job creation commitments. Contact NJEDA or a regional SBDC for program guidance.',
  'loan',
  null,
  null,
  ARRAY['NJ'],
  'open',
  'https://www.njeda.gov/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'New Jersey Economic Development Authority (NJEDA) — Small Business Programs');

-- New Mexico
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'New Mexico Economic Development Department — Business Loan and Incentive Programs',
  'New Mexico EDD administers loan programs and incentives for NM businesses. The Local Economic Development Act (LEDA) provides grants for businesses creating jobs, and the Job Training Incentive Program (JTIP) reimburses training costs for new hires. New Mexico breweries benefit from a strong tourism economy and unique ingredient opportunities. Verify current program availability and terms directly with the agency as programs change frequently.',
  'New Mexico businesses creating net new jobs. LEDA requires matching funds from local government entities. Breweries seeking training reimbursement for new employees may apply for JTIP directly. Contact NM EDD for current program availability.',
  'state_grant',
  null,
  null,
  ARRAY['NM'],
  'open',
  'https://edd.newmexico.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'New Mexico Economic Development Department — Business Loan and Incentive Programs');

-- North Carolina
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'North Carolina Department of Commerce — One North Carolina Fund',
  'The One NC Fund provides grants to local governments to attract and expand businesses creating jobs. North Carolina breweries expanding significantly and creating jobs may qualify for local government partnerships that leverage One NC Fund support. NC also has strong USDA rural development programs and a thriving Asheville craft brewery tourism market. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Businesses committing to create a minimum number of jobs at or above the average wage for the county. Applications are made through local governments — breweries should contact their county economic development office to initiate an application.',
  'state_grant',
  null,
  null,
  ARRAY['NC'],
  'open',
  'https://www.nccommerce.com/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'North Carolina Department of Commerce — One North Carolina Fund');

-- North Dakota
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'North Dakota Department of Commerce — Business Development Programs',
  'ND Commerce administers loan programs and incentives for North Dakota businesses. The Workforce Enhancement Tax Credit, Seed Capital Investment Tax Credit, and Bank of North Dakota loan participation programs support business growth. North Dakota is a leading barley-growing state with natural connections to the craft brewery supply chain. Verify current program availability and terms directly with the agency as programs change frequently.',
  'North Dakota businesses. The Bank of North Dakota offers business loan programs including the PACE (Partnership in Assisting Community Expansion) program for manufacturers. Breweries sourcing North Dakota-grown barley may access agricultural development programs. Contact ND Commerce.',
  'loan',
  null,
  null,
  ARRAY['ND'],
  'open',
  'https://www.commerce.nd.gov/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'North Dakota Department of Commerce — Business Development Programs');

-- Oklahoma
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Oklahoma Department of Commerce — Business Incentive Programs',
  'Oklahoma Commerce administers the Quality Jobs program providing quarterly cash payments to businesses creating jobs above wage thresholds, and the 21st Century Quality Jobs program for high-wage employers. Oklahoma breweries creating jobs may qualify for these cash incentive programs. Oklahoma City and Tulsa have growing craft brewery markets. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Oklahoma businesses creating full-time jobs at or above county average wages. The Quality Jobs program requires maintaining at least 10 full-time employees. Breweries should contact Oklahoma Commerce or a local economic development organization for current eligibility requirements.',
  'state_grant',
  null,
  null,
  ARRAY['OK'],
  'open',
  'https://www.okcommerce.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Oklahoma Department of Commerce — Business Incentive Programs');

-- Rhode Island
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Rhode Island Commerce Corporation — Business Development Programs',
  'RI Commerce provides loans, tax credits, and incentive programs for Rhode Island businesses. The Rebuild Rhode Island Tax Credit supports real estate development, and the Qualified Jobs Incentive Act provides tax credits for job creation. Rhode Island''s growing craft brewery scene benefits from strong tourism and local food culture. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Rhode Island businesses creating jobs and making capital investments. The Qualified Jobs program requires minimum wage thresholds and job counts. Breweries in enterprise zones or designated development areas may access additional incentives. Contact RI Commerce.',
  'tax_incentive',
  null,
  null,
  ARRAY['RI'],
  'open',
  'https://commerceri.com/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Rhode Island Commerce Corporation — Business Development Programs');

-- South Carolina
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'South Carolina Department of Commerce — Business Incentive Programs',
  'SC Commerce administers the Job Development Credit (JDC) and Job Tax Credit programs for businesses creating jobs. South Carolina also offers a robust set of incentives for manufacturers. The state''s growing coastal tourism market supports craft brewery growth particularly in Charleston and Greenville. Verify current program availability and terms directly with the agency as programs change frequently.',
  'South Carolina businesses creating full-time jobs. The Job Tax Credit provides an annual credit per new job for up to five years. Breweries qualify as manufacturers and may also qualify for investment tax credits on qualifying equipment. Contact SC Commerce for current program details.',
  'tax_incentive',
  null,
  null,
  ARRAY['SC'],
  'open',
  'https://sccommerce.com/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'South Carolina Department of Commerce — Business Incentive Programs');

-- South Dakota
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'South Dakota Governor''s Office of Economic Development — Business Programs',
  'South Dakota GOED provides loans and incentives for SD businesses creating jobs. The Revolving Economic Development and Initiative (REDI) Fund provides low-interest loans for expanding businesses. South Dakota has no corporate or individual income tax, making it an attractive location for brewery expansion. Verify current program availability and terms directly with the agency as programs change frequently.',
  'South Dakota businesses creating jobs. The REDI Fund targets primary sector businesses — breweries that distribute product outside South Dakota qualify as primary sector. Contact GOED or a regional economic development corporation.',
  'loan',
  null,
  null,
  ARRAY['SD'],
  'open',
  'https://governor.sd.gov/goed/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'South Dakota Governor''s Office of Economic Development — Business Programs');

-- Tennessee
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Tennessee Department of Economic and Community Development (TNECD) — Business Programs',
  'TNECD administers the FastTrack Job Training Assistance and Economic Development Fund for businesses creating jobs in Tennessee. Tennessee breweries benefit from proximity to Nashville''s booming tourism market and Memphis''s growing craft beverage scene. Rural Tennessee breweries can access Community Development Block Grant funds and USDA programs. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Tennessee businesses creating full-time jobs. FastTrack training funds reimburse training costs for new hires. The Economic Development Fund provides infrastructure support for significant expansions. Contact TNECD or a local economic development agency.',
  'state_grant',
  null,
  null,
  ARRAY['TN'],
  'open',
  'https://www.tn.gov/ecd',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Tennessee Department of Economic and Community Development (TNECD) — Business Programs');

-- Utah
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Utah Governor''s Office of Economic Opportunity (GOEO) — Business Incentive Programs',
  'Utah GOEO administers the Economic Development Tax Increment Financing (EDTIF) program providing post-performance tax credit rebates for businesses creating high-paying jobs. Utah''s craft brewery industry has grown significantly alongside the state''s booming outdoor recreation tourism. Salt Lake City and Park City have strong craft beer markets. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Utah businesses creating a significant number of new high-paying jobs. EDTIF is a post-performance rebate — businesses earn the credit after meeting job creation commitments. Larger brewery expansions with significant hiring projections are the best candidates. Contact GOEO for current thresholds.',
  'tax_incentive',
  null,
  null,
  ARRAY['UT'],
  'open',
  'https://business.utah.gov/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Utah Governor''s Office of Economic Opportunity (GOEO) — Business Incentive Programs');

-- Vermont
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Vermont Economic Development Authority (VEDA) — Business Loan Programs',
  'VEDA provides loans and loan guarantees to Vermont businesses including manufacturers, farm businesses, and tourism enterprises. Vermont has one of the highest craft brewery concentrations per capita in the nation and strong state support for local food and beverage producers. VEDA programs cover equipment, real estate, working capital, and farm brewery infrastructure. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Vermont businesses. VEDA provides direct loans and participates alongside conventional lenders. Breweries — particularly farm breweries sourcing Vermont-grown ingredients — have strong eligibility. Contact VEDA directly to discuss financing options for your project.',
  'loan',
  null,
  null,
  ARRAY['VT'],
  'open',
  'https://www.veda.org/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Vermont Economic Development Authority (VEDA) — Business Loan Programs');

-- Virginia
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Virginia Economic Development Partnership — Business Incentive Programs',
  'Virginia administers the Virginia Jobs Investment Program (VJIP) providing customized training grants for businesses creating new jobs, and the Major Business Facility Job Tax Credit for significant expansions. Virginia has a thriving craft brewery industry particularly in Northern Virginia, Richmond, and the Shenandoah Valley wine and beer tourism corridor. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Virginia businesses creating new full-time jobs. VJIP training grants reimburse customized training costs for new hires. The Major Business Facility credit requires creating at least 50 new full-time jobs. Smaller breweries should focus on VJIP training reimbursements. Contact VEDP or a regional economic development office.',
  'state_grant',
  null,
  null,
  ARRAY['VA'],
  'open',
  'https://www.vedp.org/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Virginia Economic Development Partnership — Business Incentive Programs');

-- West Virginia
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'West Virginia Department of Economic Development — Business Programs',
  'West Virginia supports businesses through the WV Economic Development Grant program, loan participation, and tax incentives. West Virginia breweries benefit from growing outdoor recreation and tourism in the New River Gorge area. Rural WV breweries can access substantial USDA Rural Development funding. Verify current programs at the WV Department of Economic Development website. Verify current program availability and terms directly with the agency as programs change frequently.',
  'West Virginia businesses creating jobs. Programs vary in eligibility and thresholds. Breweries in rural areas have the strongest access to USDA-backed programs administered through WV economic development channels. Contact the WV Department of Economic Development.',
  'state_grant',
  null,
  null,
  ARRAY['WV'],
  'open',
  'https://westvirginia.gov/business/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'West Virginia Department of Economic Development — Business Programs');

-- Wisconsin
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Wisconsin Economic Development Corporation (WEDC) — Business Development Programs',
  'WEDC administers grants, loans, and tax credits for Wisconsin businesses. The Wisconsin Fast Forward program supports workforce training, and the Economic Development Tax Credit rewards job creation and capital investment. Wisconsin has a rich brewing heritage and one of the most active craft brewery communities in the Midwest. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Wisconsin businesses creating jobs and making capital investments. The Economic Development Tax Credit requires meeting minimum investment and job creation thresholds over a performance period. Breweries in rural Wisconsin may access additional rural development resources. Contact WEDC or a local economic development organization.',
  'tax_incentive',
  null,
  null,
  ARRAY['WI'],
  'open',
  'https://wedc.org/',
  false, false, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Wisconsin Economic Development Corporation (WEDC) — Business Development Programs');

-- Wyoming
INSERT INTO grants (title, description, eligibility_summary, funding_type, amount_min, amount_max, states_eligible, status, application_url, is_federal, is_loan, is_manually_curated, program_category, grant_source, approved, last_reviewed_at)
SELECT
  'Wyoming Business Council — Business Loan and Grant Programs',
  'The Wyoming Business Council supports Wyoming businesses through loan programs, grants, and economic development initiatives. The Business Ready Community Grant and Loan program helps communities fund infrastructure improvements that support business growth. Wyoming breweries connected to the state''s tourism economy — particularly near Yellowstone, Grand Teton, and Jackson Hole — have strong growth opportunities. Verify current program availability and terms directly with the agency as programs change frequently.',
  'Wyoming businesses and local governments creating jobs. Breweries benefit most from working with their local government to access Business Ready Community grants for infrastructure. Direct business loans are also available. Contact the Wyoming Business Council for current programs.',
  'loan',
  null,
  null,
  ARRAY['WY'],
  'open',
  'https://www.wyomingbusiness.org/',
  false, true, true, 'economic_development', 'manual', true, now()
WHERE NOT EXISTS (SELECT 1 FROM grants WHERE title = 'Wyoming Business Council — Business Loan and Grant Programs');
