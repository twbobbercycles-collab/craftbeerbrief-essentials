-- =============================================================================
-- State Compliance Deadlines — Remaining 40 States + Washington DC
-- Companion to state_compliance_deadlines.sql (which covers CA, CO, WA, MI,
-- PA, NY, OR, TX, FL, OH). Together the two files cover all 50 states + DC.
--
-- Quarterly tax entries cover Q4-2025 (due Jan 2026) through Q3-2026 (due Oct 2026).
--
-- IMPORTANT: All dates and rates are estimates for general reference only.
-- Requirements vary by license type, production volume, and filing history.
-- Always verify with your state licensing authority before taking action.
--
-- Run once in Supabase SQL Editor after state_compliance_deadlines.sql.
-- Safe to re-run — DO block skips insert if Alabama rows already exist.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from compliance_deadlines where state = 'AL' limit 1
  ) then

    insert into compliance_deadlines
      (state, license_type, deadline_name, deadline_date, category, is_federal, description)
    values

    -- =========================================================================
    -- ALABAMA
    -- =========================================================================
    ('AL', 'brewery', 'AL ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Alabama Alcoholic Beverage Control (ABC) Board Brewery license. Alabama has a tiered brewery licensing structure — separate licenses cover production, taproom sales, and wholesale distribution. Renewal date is tied to your license issuance anniversary. Apply at abc.alabama.gov. Verify exact renewal date with your AL ABC license certificate.'),

    ('AL', 'brewery', 'AL Beer Tax Return — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Alabama beer excise tax return for October–December 2025, filed with the AL Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and your filing frequency at revenue.alabama.gov.'),

    ('AL', 'brewery', 'AL Beer Tax Return — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Alabama beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.alabama.gov.'),

    ('AL', 'brewery', 'AL Beer Tax Return — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Alabama beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.alabama.gov.'),

    ('AL', 'brewery', 'AL Beer Tax Return — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Alabama beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.alabama.gov.'),

    ('AL', 'brewery', 'AL ABC Annual Operations Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Alabama ABC Board for brewery license holders. Report prior calendar year production volumes and distribution activity. Verify exact due date and current form requirements at abc.alabama.gov.'),

    -- =========================================================================
    -- ALASKA
    -- =========================================================================
    ('AK', 'brewery', 'AK AMCO Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Alaska Alcohol and Marijuana Control Office (AMCO) Brewery Manufacturing license. Renewal date is tied to your license issuance anniversary. Note: Alaska has no state income tax. Alaska has unique self-distribution rights — small breweries (generally under a production threshold) may self-distribute directly to retailers without a third-party distributor; verify current thresholds at commerce.alaska.gov/amco. Apply via the AMCO online licensing portal. Verify exact renewal date with your AK AMCO license.'),

    ('AK', 'brewery', 'AK Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Alaska beer excise tax return for October–December 2025, filed with the Alaska Department of Revenue. Monthly or quarterly returns are due by the 20th of the following month or quarter. Alaska has no state income tax. Verify current malt beverage tax rates and filing frequency at tax.alaska.gov.'),

    ('AK', 'brewery', 'AK Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Alaska beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.alaska.gov.'),

    ('AK', 'brewery', 'AK Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Alaska beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.alaska.gov.'),

    ('AK', 'brewery', 'AK Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Alaska beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.alaska.gov.'),

    ('AK', 'brewery', 'AK AMCO Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by Alaska AMCO for brewery license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at commerce.alaska.gov/amco.'),

    -- =========================================================================
    -- ARIZONA
    -- =========================================================================
    ('AZ', 'brewery', 'AZ DLLC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Arizona Department of Liquor Licenses and Control (DLLC) Series 3 Microbrewery or Series 17 Hotel/Motel/Restaurant license (or applicable series). Renewal date is tied to your license issuance anniversary. Apply via AZLiquor.gov. Verify exact renewal date with your AZ DLLC license certificate.'),

    ('AZ', 'brewery', 'AZ Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Arizona beer excise tax return for October–December 2025, filed with the AZ Department of Revenue. Monthly returns are due by the 20th of the following month. Verify current malt beverage tax rates and your filing frequency at azdor.gov.'),

    ('AZ', 'brewery', 'AZ Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Arizona beer excise tax return for January–March 2026. Verify due date and filing frequency at azdor.gov.'),

    ('AZ', 'brewery', 'AZ Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Arizona beer excise tax return for April–June 2026. Verify due date and filing frequency at azdor.gov.'),

    ('AZ', 'brewery', 'AZ Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Arizona beer excise tax return for July–September 2026. Verify due date and filing frequency at azdor.gov.'),

    ('AZ', 'brewery', 'AZ DLLC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Arizona DLLC. Report prior calendar year production volumes and distribution data. Verify exact due date and current form requirements at azliquor.gov.'),

    -- =========================================================================
    -- ARKANSAS
    -- =========================================================================
    ('AR', 'brewery', 'AR ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Arkansas Alcoholic Beverage Control (ABC) Division Small Brewery or Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the AR ABC Division at dfa.arkansas.gov/alcohol-beverage-control. Verify exact renewal date with your AR ABC license certificate.'),

    ('AR', 'brewery', 'AR Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Arkansas beer excise tax return for October–December 2025, filed with the AR Department of Finance and Administration. Monthly returns are due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at dfa.arkansas.gov.'),

    ('AR', 'brewery', 'AR Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Arkansas beer excise tax return for January–March 2026. Verify due date and filing frequency at dfa.arkansas.gov.'),

    ('AR', 'brewery', 'AR Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Arkansas beer excise tax return for April–June 2026. Verify due date and filing frequency at dfa.arkansas.gov.'),

    ('AR', 'brewery', 'AR Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Arkansas beer excise tax return for July–September 2026. Verify due date and filing frequency at dfa.arkansas.gov.'),

    ('AR', 'brewery', 'AR ABC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Arkansas ABC Division. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at dfa.arkansas.gov/alcohol-beverage-control.'),

    -- =========================================================================
    -- CONNECTICUT
    -- =========================================================================
    ('CT', 'brewery', 'CT DCP Manufacturer Permit Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Connecticut Department of Consumer Protection (DCP) Manufacturer Permit for beer. Renewal date is tied to your permit issuance anniversary. Apply via the CT DCP licensing portal at ct.gov/dcp. Verify exact renewal date with your CT DCP permit certificate.'),

    ('CT', 'brewery', 'CT Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Connecticut beer excise tax return for October–December 2025, filed with the CT Department of Revenue Services (DRS). Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at portal.ct.gov/DRS.'),

    ('CT', 'brewery', 'CT Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Connecticut beer excise tax return for January–March 2026. Verify due date and filing frequency at portal.ct.gov/DRS.'),

    ('CT', 'brewery', 'CT Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Connecticut beer excise tax return for April–June 2026. Verify due date and filing frequency at portal.ct.gov/DRS.'),

    ('CT', 'brewery', 'CT Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Connecticut beer excise tax return for July–September 2026. Verify due date and filing frequency at portal.ct.gov/DRS.'),

    ('CT', 'brewery', 'CT DCP Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Connecticut DCP for manufacturer permit holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at ct.gov/dcp.'),

    -- =========================================================================
    -- DELAWARE
    -- =========================================================================
    ('DE', 'brewery', 'DE Office of ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Delaware Office of the Commissioner of Alcoholic Beverages brewery license. Renewal date is tied to your license issuance anniversary. Apply via the DE Division of Revenue licensing portal. Verify exact renewal date with your DE ABC license certificate at revenue.delaware.gov.'),

    ('DE', 'brewery', 'DE Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Delaware beer excise tax return for October–December 2025, filed with the DE Division of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at revenue.delaware.gov.'),

    ('DE', 'brewery', 'DE Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Delaware beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.delaware.gov.'),

    ('DE', 'brewery', 'DE Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Delaware beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.delaware.gov.'),

    ('DE', 'brewery', 'DE Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Delaware beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.delaware.gov.'),

    ('DE', 'brewery', 'DE Annual Production Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report for Delaware brewery license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements with the DE Division of Revenue at revenue.delaware.gov.'),

    -- =========================================================================
    -- WASHINGTON DC
    -- =========================================================================
    ('DC', 'brewery', 'DC ABCA Brewery License Renewal', '2026-10-31',
     'License Renewal', false,
     'Annual renewal of your Washington DC Alcoholic Beverage and Cannabis Administration (ABCA) Manufacturer license for beer. DC beverage licenses commonly expire October 31 and must be renewed annually. Apply via the DC ABCA online portal at abca.dc.gov. Verify exact expiration and renewal date with your DC ABCA license.'),

    ('DC', 'brewery', 'DC Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Washington DC beer excise tax return for October–December 2025, filed with the DC Office of Tax and Revenue (OTR). Monthly or quarterly returns are generally due by the 20th of the following period. Verify current malt beverage tax rates and filing frequency at mytax.dc.gov.'),

    ('DC', 'brewery', 'DC Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Washington DC beer excise tax return for January–March 2026. Verify due date and filing frequency at mytax.dc.gov.'),

    ('DC', 'brewery', 'DC Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Washington DC beer excise tax return for April–June 2026. Verify due date and filing frequency at mytax.dc.gov.'),

    ('DC', 'brewery', 'DC Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Washington DC beer excise tax return for July–September 2026. Verify due date and filing frequency at mytax.dc.gov.'),

    ('DC', 'brewery', 'DC ABCA Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the DC Alcoholic Beverage and Cannabis Administration. Report prior calendar year production and sales data. Verify exact due date and requirements at abca.dc.gov.'),

    -- =========================================================================
    -- GEORGIA
    -- =========================================================================
    ('GA', 'brewery', 'GA DOR Brewery Manufacturer License Renewal', '2026-06-30',
     'License Renewal', false,
     'Annual renewal of your Georgia Department of Revenue Brewery Manufacturer license. Georgia state licenses run on a July 1–June 30 fiscal year and must be renewed by June 30. Note: Local retail licenses are issued separately by your county or city government and may have different renewal dates. Apply at dor.georgia.gov. Verify exact renewal requirements with your GA DOR license.'),

    ('GA', 'brewery', 'GA Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Georgia beer excise tax return for October–December 2025, filed with the GA Department of Revenue. Monthly returns are due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at dor.georgia.gov.'),

    ('GA', 'brewery', 'GA Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Georgia beer excise tax return for January–March 2026. Verify due date and filing frequency at dor.georgia.gov.'),

    ('GA', 'brewery', 'GA Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Georgia beer excise tax return for April–June 2026. Verify due date and filing frequency at dor.georgia.gov.'),

    ('GA', 'brewery', 'GA Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Georgia beer excise tax return for July–September 2026. Verify due date and filing frequency at dor.georgia.gov.'),

    ('GA', 'brewery', 'GA DOR Annual Production Report', '2026-08-31',
     'Reporting Requirement', false,
     'Annual production report required by the Georgia Department of Revenue for brewery manufacturer license holders. Reports production for the prior fiscal year ending June 30. Verify exact due date and current form requirements at dor.georgia.gov.'),

    -- =========================================================================
    -- HAWAII
    -- =========================================================================
    ('HI', 'brewery', 'HI County Liquor Commission Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Hawaii county liquor commission Manufacturer license for beer. Hawaii''s liquor licensing is administered at the county level by four liquor commissions: Honolulu, Maui, Hawaii County, and Kauai. Renewal dates vary by county and license issuance date. Note: Hawaii has unique inter-island distribution requirements — each island is a separate distribution territory and inter-island beer shipments require compliance with each county''s rules; self-distribution rights are limited. Contact your county liquor commission to verify exact renewal requirements and dates.'),

    ('HI', 'brewery', 'HI Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Hawaii beer excise tax return for October–December 2025, filed with the Hawaii Department of Taxation. Monthly returns are generally due by the 20th of the following month. Note: Hawaii also imposes a General Excise Tax (GET) on gross receipts. Verify current liquor tax rates and filing frequency at tax.hawaii.gov.'),

    ('HI', 'brewery', 'HI Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Hawaii beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.hawaii.gov.'),

    ('HI', 'brewery', 'HI Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Hawaii beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.hawaii.gov.'),

    ('HI', 'brewery', 'HI Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Hawaii beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.hawaii.gov.'),

    ('HI', 'brewery', 'HI Annual Production Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by your Hawaii county liquor commission. Contact your county commission (Honolulu, Maui, Hawaii County, or Kauai) to verify exact due date and reporting requirements.'),

    -- =========================================================================
    -- IDAHO
    -- =========================================================================
    ('ID', 'brewery', 'ID State Police ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Idaho State Police Bureau of Criminal Identification, Alcohol Beverage Control (ABC) Section Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the Idaho ABC licensing portal at isp.idaho.gov/abc. Verify exact renewal date with your ID ABC license certificate.'),

    ('ID', 'brewery', 'ID Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Idaho beer excise tax return for October–December 2025, filed with the Idaho State Tax Commission. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at tax.idaho.gov.'),

    ('ID', 'brewery', 'ID Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Idaho beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.idaho.gov.'),

    ('ID', 'brewery', 'ID Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Idaho beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.idaho.gov.'),

    ('ID', 'brewery', 'ID Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Idaho beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.idaho.gov.'),

    ('ID', 'brewery', 'ID ABC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report for Idaho brewery license holders. Verify exact due date and requirements with the Idaho State Police ABC Section at isp.idaho.gov/abc.'),

    -- =========================================================================
    -- ILLINOIS
    -- =========================================================================
    ('IL', 'brewery', 'IL Liquor Control Commission Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Illinois Liquor Control Commission (ILCC) Brewer''s License. Renewal date is tied to your license issuance anniversary. Apply via the ILCC online licensing system. Note: local municipality licenses are required separately. Verify exact renewal date with your ILCC license certificate at ilcc.illinois.gov.'),

    ('IL', 'brewery', 'IL Malt Beverage Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Illinois malt beverage tax return for October–December 2025, filed with the Illinois Department of Revenue. Monthly returns are due by the 20th of the following month. Illinois imposes a malt beverage tax on beer at a rate based on alcohol content. Verify current rates and filing frequency at tax.illinois.gov.'),

    ('IL', 'brewery', 'IL Malt Beverage Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Illinois malt beverage tax return for January–March 2026. Verify due date and filing frequency at tax.illinois.gov.'),

    ('IL', 'brewery', 'IL Malt Beverage Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Illinois malt beverage tax return for April–June 2026. Verify due date and filing frequency at tax.illinois.gov.'),

    ('IL', 'brewery', 'IL Malt Beverage Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Illinois malt beverage tax return for July–September 2026. Verify due date and filing frequency at tax.illinois.gov.'),

    ('IL', 'brewery', 'IL ILCC Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Illinois Liquor Control Commission. Report prior calendar year production volumes and distribution activity. Verify exact due date and current requirements at ilcc.illinois.gov.'),

    -- =========================================================================
    -- INDIANA
    -- =========================================================================
    ('IN', 'brewery', 'IN Alcohol and Tobacco Commission Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Indiana Alcohol and Tobacco Commission (ATC) Brewer''s Permit. Renewal date is tied to your permit issuance anniversary. Apply via the IN ATC online portal at in.gov/atc. Verify exact renewal date with your IN ATC permit certificate.'),

    ('IN', 'brewery', 'IN Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Indiana beer excise tax return for October–December 2025, filed with the Indiana Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at intime.dor.in.gov.'),

    ('IN', 'brewery', 'IN Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Indiana beer excise tax return for January–March 2026. Verify due date and filing frequency at intime.dor.in.gov.'),

    ('IN', 'brewery', 'IN Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Indiana beer excise tax return for April–June 2026. Verify due date and filing frequency at intime.dor.in.gov.'),

    ('IN', 'brewery', 'IN Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Indiana beer excise tax return for July–September 2026. Verify due date and filing frequency at intime.dor.in.gov.'),

    ('IN', 'brewery', 'IN ATC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Indiana Alcohol and Tobacco Commission. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at in.gov/atc.'),

    -- =========================================================================
    -- IOWA
    -- =========================================================================
    ('IA', 'brewery', 'IA Alcoholic Beverages Division Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Iowa Alcoholic Beverages Division (ABD) Class "C" Liquor Control License or Native Distillery/Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the Iowa ABD licensing portal at iowaabd.com. Verify exact renewal date with your IA ABD license certificate.'),

    ('IA', 'brewery', 'IA Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Iowa beer excise tax return for October–December 2025, filed with the Iowa Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at tax.iowa.gov.'),

    ('IA', 'brewery', 'IA Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Iowa beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.iowa.gov.'),

    ('IA', 'brewery', 'IA Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Iowa beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.iowa.gov.'),

    ('IA', 'brewery', 'IA Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Iowa beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.iowa.gov.'),

    ('IA', 'brewery', 'IA ABD Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Iowa Alcoholic Beverages Division. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at iowaabd.com.'),

    -- =========================================================================
    -- KANSAS
    -- =========================================================================
    ('KS', 'brewery', 'KS ABC Division Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Kansas Department of Revenue Alcoholic Beverage Control (ABC) Division Microbrewery or Drinking Establishment Manufacturer license. Renewal date is tied to your license issuance anniversary. Apply via the KS ABC licensing portal at ksrevenue.gov/abcmain.html. Verify exact renewal date with your KS ABC license.'),

    ('KS', 'brewery', 'KS Beer Excise Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'Kansas beer excise tax return for October–December 2025, filed with the Kansas Department of Revenue. Returns are generally due by the 25th of the month following the reporting period. Verify exact due date, current malt beverage tax rates, and filing frequency at ksrevenue.gov.'),

    ('KS', 'brewery', 'KS Beer Excise Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'Kansas beer excise tax return for January–March 2026. Verify due date and filing frequency at ksrevenue.gov.'),

    ('KS', 'brewery', 'KS Beer Excise Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'Kansas beer excise tax return for April–June 2026. Verify due date and filing frequency at ksrevenue.gov.'),

    ('KS', 'brewery', 'KS Beer Excise Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'Kansas beer excise tax return for July–September 2026. Verify due date and filing frequency at ksrevenue.gov.'),

    ('KS', 'brewery', 'KS ABC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Kansas ABC Division. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at ksrevenue.gov/abcmain.html.'),

    -- =========================================================================
    -- KENTUCKY
    -- =========================================================================
    ('KY', 'brewery', 'KY ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Kentucky Alcoholic Beverage Control (ABC) Department Brewer''s License. Renewal date is tied to your license issuance anniversary. Apply via the KY ABC online licensing system at abc.ky.gov. Verify exact renewal date with your KY ABC license certificate.'),

    ('KY', 'brewery', 'KY Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Kentucky beer excise tax return for October–December 2025, filed with the Kentucky Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at revenue.ky.gov.'),

    ('KY', 'brewery', 'KY Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Kentucky beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.ky.gov.'),

    ('KY', 'brewery', 'KY Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Kentucky beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.ky.gov.'),

    ('KY', 'brewery', 'KY Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Kentucky beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.ky.gov.'),

    ('KY', 'brewery', 'KY ABC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Kentucky ABC Department. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at abc.ky.gov.'),

    -- =========================================================================
    -- LOUISIANA
    -- =========================================================================
    ('LA', 'brewery', 'LA ATC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Louisiana Office of Alcohol and Tobacco Control (ATC) Manufacturer''s License for beer. Renewal date is tied to your license issuance anniversary. Apply via the LA ATC online portal at atc.louisiana.gov. Verify exact renewal date with your LA ATC license certificate.'),

    ('LA', 'brewery', 'LA Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Louisiana beer excise tax return for October–December 2025, filed with the LA Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at revenue.louisiana.gov.'),

    ('LA', 'brewery', 'LA Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Louisiana beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.louisiana.gov.'),

    ('LA', 'brewery', 'LA Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Louisiana beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.louisiana.gov.'),

    ('LA', 'brewery', 'LA Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Louisiana beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.louisiana.gov.'),

    ('LA', 'brewery', 'LA ATC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Louisiana ATC for manufacturer license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at atc.louisiana.gov.'),

    -- =========================================================================
    -- MAINE
    -- =========================================================================
    ('ME', 'brewery', 'ME BABLO Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Maine Bureau of Alcoholic Beverages and Lottery Operations (BABLO) Manufacturer license for malt liquor. Renewal date is tied to your license issuance anniversary. Apply via the ME BABLO online portal at maine.gov/dafs/bablo. Verify exact renewal date with your ME BABLO license certificate.'),

    ('ME', 'brewery', 'ME Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Maine malt liquor (beer) excise tax return for October–December 2025, filed with Maine Revenue Services. Monthly returns are generally due by the 20th of the following month. Verify current tax rates and filing frequency at maine.gov/revenue.'),

    ('ME', 'brewery', 'ME Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Maine beer excise tax return for January–March 2026. Verify due date and filing frequency at maine.gov/revenue.'),

    ('ME', 'brewery', 'ME Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Maine beer excise tax return for April–June 2026. Verify due date and filing frequency at maine.gov/revenue.'),

    ('ME', 'brewery', 'ME Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Maine beer excise tax return for July–September 2026. Verify due date and filing frequency at maine.gov/revenue.'),

    ('ME', 'brewery', 'ME BABLO Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by the Maine BABLO for manufacturer license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at maine.gov/dafs/bablo.'),

    -- =========================================================================
    -- MARYLAND
    -- =========================================================================
    ('MD', 'brewery', 'MD Local Board Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Maryland brewery license. Note: Maryland liquor licensing is administered at the county level — each of Maryland''s 23 counties and Baltimore City has its own Alcoholic Beverages Board with its own renewal dates and requirements. Contact your local board to verify exact renewal date. State alcohol tax reporting is handled by the MD Comptroller at marylandtaxes.gov.'),

    ('MD', 'brewery', 'MD Beer Excise Tax — Q4 2025', '2026-01-21',
     'Tax Filing', false,
     'Maryland beer excise tax return for October–December 2025, filed with the MD Comptroller''s Office. Monthly returns are generally due by the 21st of the following month. Verify current malt beverage tax rates and filing frequency at marylandtaxes.gov.'),

    ('MD', 'brewery', 'MD Beer Excise Tax — Q1 2026', '2026-04-21',
     'Tax Filing', false,
     'Maryland beer excise tax return for January–March 2026. Verify due date and filing frequency at marylandtaxes.gov.'),

    ('MD', 'brewery', 'MD Beer Excise Tax — Q2 2026', '2026-07-21',
     'Tax Filing', false,
     'Maryland beer excise tax return for April–June 2026. Verify due date and filing frequency at marylandtaxes.gov.'),

    ('MD', 'brewery', 'MD Beer Excise Tax — Q3 2026', '2026-10-21',
     'Tax Filing', false,
     'Maryland beer excise tax return for July–September 2026. Verify due date and filing frequency at marylandtaxes.gov.'),

    ('MD', 'brewery', 'MD Annual Production Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production report required by the Maryland Comptroller for brewery license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at marylandtaxes.gov.'),

    -- =========================================================================
    -- MASSACHUSETTS
    -- =========================================================================
    ('MA', 'brewery', 'MA ABCC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Massachusetts Alcoholic Beverages Control Commission (ABCC) Farmer-Brewer or Manufacturer license. Renewal date is tied to your license issuance anniversary. Apply via the MA ABCC eLicensing portal at abcc.state.ma.us. Verify exact renewal date with your MA ABCC license certificate.'),

    ('MA', 'brewery', 'MA Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Massachusetts malt beverage excise tax return for October–December 2025, filed with the MA Department of Revenue. Quarterly returns are generally due by the 20th of the month following the quarter end. Verify current malt beverage tax rates and filing frequency at mass.gov/dor.'),

    ('MA', 'brewery', 'MA Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Massachusetts malt beverage excise tax return for January–March 2026. Verify due date and filing frequency at mass.gov/dor.'),

    ('MA', 'brewery', 'MA Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Massachusetts malt beverage excise tax return for April–June 2026. Verify due date and filing frequency at mass.gov/dor.'),

    ('MA', 'brewery', 'MA Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Massachusetts malt beverage excise tax return for July–September 2026. Verify due date and filing frequency at mass.gov/dor.'),

    ('MA', 'brewery', 'MA ABCC Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Massachusetts ABCC for manufacturer license holders. Report prior calendar year production volumes, sales, and distribution data. Verify exact due date and requirements at abcc.state.ma.us.'),

    -- =========================================================================
    -- MINNESOTA
    -- =========================================================================
    ('MN', 'brewery', 'MN AGED Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Minnesota Alcohol and Gambling Enforcement Division (AGED) Brewer''s License. Renewal date is tied to your license issuance anniversary. Note: local city or county licenses may also be required. Apply via the MN AGED licensing portal at dps.mn.gov/divisions/age. Verify exact renewal date with your MN AGED license certificate.'),

    ('MN', 'brewery', 'MN Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Minnesota malt liquor tax return for October–December 2025, filed with the Minnesota Department of Revenue. Monthly returns are due by the 20th of the following month. Verify current malt liquor tax rates and filing frequency at revenue.state.mn.us.'),

    ('MN', 'brewery', 'MN Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Minnesota malt liquor tax return for January–March 2026. Verify due date and filing frequency at revenue.state.mn.us.'),

    ('MN', 'brewery', 'MN Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Minnesota malt liquor tax return for April–June 2026. Verify due date and filing frequency at revenue.state.mn.us.'),

    ('MN', 'brewery', 'MN Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Minnesota malt liquor tax return for July–September 2026. Verify due date and filing frequency at revenue.state.mn.us.'),

    ('MN', 'brewery', 'MN AGED Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by the Minnesota AGED for brewery license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at dps.mn.gov/divisions/age.'),

    -- =========================================================================
    -- MISSISSIPPI
    -- =========================================================================
    ('MS', 'brewery', 'MS ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Mississippi Department of Revenue Alcoholic Beverage Control (ABC) Division brewery license. Note: Mississippi has local-option alcohol laws — roughly half of the state''s counties allow alcohol sales. Verify that your county is a "wet" jurisdiction and obtain any required local permits. Apply at dor.ms.gov/alcohol-beverage-control. Verify exact renewal date with your MS ABC license.'),

    ('MS', 'brewery', 'MS Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Mississippi beer excise tax return for October–December 2025, filed with the MS Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates, local-option requirements, and filing frequency at dor.ms.gov.'),

    ('MS', 'brewery', 'MS Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Mississippi beer excise tax return for January–March 2026. Verify due date and filing frequency at dor.ms.gov.'),

    ('MS', 'brewery', 'MS Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Mississippi beer excise tax return for April–June 2026. Verify due date and filing frequency at dor.ms.gov.'),

    ('MS', 'brewery', 'MS Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Mississippi beer excise tax return for July–September 2026. Verify due date and filing frequency at dor.ms.gov.'),

    ('MS', 'brewery', 'MS ABC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Mississippi ABC Division. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at dor.ms.gov/alcohol-beverage-control.'),

    -- =========================================================================
    -- MISSOURI
    -- =========================================================================
    ('MO', 'brewery', 'MO ATC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Missouri Division of Alcohol and Tobacco Control (ATC) Microbrewery or Warehouse Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the MO ATC licensing portal at atc.dps.mo.gov. Verify exact renewal date with your MO ATC license certificate.'),

    ('MO', 'brewery', 'MO Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Missouri beer excise tax return for October–December 2025, filed with the Missouri Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at dor.mo.gov.'),

    ('MO', 'brewery', 'MO Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Missouri beer excise tax return for January–March 2026. Verify due date and filing frequency at dor.mo.gov.'),

    ('MO', 'brewery', 'MO Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Missouri beer excise tax return for April–June 2026. Verify due date and filing frequency at dor.mo.gov.'),

    ('MO', 'brewery', 'MO Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Missouri beer excise tax return for July–September 2026. Verify due date and filing frequency at dor.mo.gov.'),

    ('MO', 'brewery', 'MO ATC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Missouri ATC for brewery license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at atc.dps.mo.gov.'),

    -- =========================================================================
    -- MONTANA
    -- =========================================================================
    ('MT', 'brewery', 'MT DOR Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Montana Department of Revenue Liquor Licensing Bureau Brewery or Microbrewery license. Renewal date is tied to your license issuance anniversary. Apply via the MT DOR licensing portal at mtrevenue.gov/liquor-tobacco. Verify exact renewal date with your MT DOR license certificate.'),

    ('MT', 'brewery', 'MT Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Montana beer excise tax return for October–December 2025, filed with the Montana Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at mtrevenue.gov.'),

    ('MT', 'brewery', 'MT Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Montana beer excise tax return for January–March 2026. Verify due date and filing frequency at mtrevenue.gov.'),

    ('MT', 'brewery', 'MT Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Montana beer excise tax return for April–June 2026. Verify due date and filing frequency at mtrevenue.gov.'),

    ('MT', 'brewery', 'MT Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Montana beer excise tax return for July–September 2026. Verify due date and filing frequency at mtrevenue.gov.'),

    ('MT', 'brewery', 'MT DOR Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by the Montana Department of Revenue Liquor Licensing Bureau. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at mtrevenue.gov/liquor-tobacco.'),

    -- =========================================================================
    -- NEBRASKA
    -- =========================================================================
    ('NE', 'brewery', 'NE Liquor Control Commission Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Nebraska Liquor Control Commission (NLCC) Craft Brewery or Manufacturer license. Renewal date is tied to your license issuance anniversary. Apply via the NE NLCC online licensing portal at nlcc.nebraska.gov. Verify exact renewal date with your NE NLCC license certificate.'),

    ('NE', 'brewery', 'NE Beer Excise Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'Nebraska beer excise tax return for October–December 2025, filed with the Nebraska Department of Revenue. Returns are generally due by the 25th of the month following the reporting period. Verify current malt beverage tax rates and filing frequency at revenue.nebraska.gov.'),

    ('NE', 'brewery', 'NE Beer Excise Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'Nebraska beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.nebraska.gov.'),

    ('NE', 'brewery', 'NE Beer Excise Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'Nebraska beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.nebraska.gov.'),

    ('NE', 'brewery', 'NE Beer Excise Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'Nebraska beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.nebraska.gov.'),

    ('NE', 'brewery', 'NE NLCC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Nebraska Liquor Control Commission. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at nlcc.nebraska.gov.'),

    -- =========================================================================
    -- NEVADA
    -- =========================================================================
    ('NV', 'brewery', 'NV Department of Taxation Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Nevada Department of Taxation beer manufacturer or brew pub license. Note: Nevada has no state income tax. Local business licenses are required separately from your county or city. Renewal date is tied to your license issuance anniversary. Apply at tax.nv.gov. Verify exact renewal date with your NV license certificate.'),

    ('NV', 'brewery', 'NV Beer Excise Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'Nevada beer excise tax return for October–December 2025, filed with the Nevada Department of Taxation. Returns are generally due by the 25th of the month following the reporting period. Note: Nevada has no state income tax. Verify current malt beverage tax rates and filing frequency at tax.nv.gov.'),

    ('NV', 'brewery', 'NV Beer Excise Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'Nevada beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.nv.gov.'),

    ('NV', 'brewery', 'NV Beer Excise Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'Nevada beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.nv.gov.'),

    ('NV', 'brewery', 'NV Beer Excise Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'Nevada beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.nv.gov.'),

    ('NV', 'brewery', 'NV Annual Production Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by the Nevada Department of Taxation for beer manufacturer license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at tax.nv.gov.'),

    -- =========================================================================
    -- NEW HAMPSHIRE
    -- =========================================================================
    ('NH', 'brewery', 'NH State Liquor Commission Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your New Hampshire State Liquor Commission (NHLC) Manufacturer license for beer. Note: New Hampshire has no state income tax and no general sales tax. NH is a liquor control state for spirits, but breweries operate under a manufacturer license. Renewal date is tied to your license issuance anniversary. Apply at liquoranddinenh.com. Verify exact renewal date with your NH SLC license.'),

    ('NH', 'brewery', 'NH Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'New Hampshire beer excise tax return for October–December 2025. NH has no state income tax or general sales tax but does impose a malt beverage tax. Returns are generally due by the 20th of the following month. Verify current rates and filing frequency with the NH Department of Revenue Administration at revenue.nh.gov.'),

    ('NH', 'brewery', 'NH Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'New Hampshire beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.nh.gov.'),

    ('NH', 'brewery', 'NH Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'New Hampshire beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.nh.gov.'),

    ('NH', 'brewery', 'NH Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'New Hampshire beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.nh.gov.'),

    ('NH', 'brewery', 'NH SLC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by the New Hampshire State Liquor Commission for manufacturer license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at liquoranddinenh.com.'),

    -- =========================================================================
    -- NEW JERSEY
    -- =========================================================================
    ('NJ', 'brewery', 'NJ ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your New Jersey Division of Alcoholic Beverage Control (ABC) Plenary Brewery license or Limited Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the NJ ABC online licensing portal at nj.gov/oag/abc. Verify exact renewal date with your NJ ABC license certificate.'),

    ('NJ', 'brewery', 'NJ Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'New Jersey beer excise tax return for October–December 2025, filed with the NJ Division of Taxation. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at njtaxation.org.'),

    ('NJ', 'brewery', 'NJ Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'New Jersey beer excise tax return for January–March 2026. Verify due date and filing frequency at njtaxation.org.'),

    ('NJ', 'brewery', 'NJ Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'New Jersey beer excise tax return for April–June 2026. Verify due date and filing frequency at njtaxation.org.'),

    ('NJ', 'brewery', 'NJ Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'New Jersey beer excise tax return for July–September 2026. Verify due date and filing frequency at njtaxation.org.'),

    ('NJ', 'brewery', 'NJ ABC Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the New Jersey ABC for brewery license holders. Report prior calendar year production volumes and distribution activity. Verify exact due date and requirements at nj.gov/oag/abc.'),

    -- =========================================================================
    -- NEW MEXICO
    -- =========================================================================
    ('NM', 'brewery', 'NM Alcohol and Gaming Division Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your New Mexico Regulation and Licensing Department, Alcohol and Gaming Division (AGD) Small Brewer license. Renewal date is tied to your license issuance anniversary. Apply via the NM RLD online licensing portal at rld.nm.gov/alcohol-gaming. Verify exact renewal date with your NM AGD license certificate.'),

    ('NM', 'brewery', 'NM Beer Excise Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'New Mexico beer excise tax return for October–December 2025, filed with the NM Taxation and Revenue Department. Returns are generally due by the 25th of the month following the reporting period. Verify current malt beverage tax rates and filing frequency at tax.newmexico.gov.'),

    ('NM', 'brewery', 'NM Beer Excise Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'New Mexico beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.newmexico.gov.'),

    ('NM', 'brewery', 'NM Beer Excise Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'New Mexico beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.newmexico.gov.'),

    ('NM', 'brewery', 'NM Beer Excise Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'New Mexico beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.newmexico.gov.'),

    ('NM', 'brewery', 'NM AGD Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the New Mexico Alcohol and Gaming Division. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at rld.nm.gov/alcohol-gaming.'),

    -- =========================================================================
    -- NORTH CAROLINA
    -- =========================================================================
    ('NC', 'brewery', 'NC ABC Commission Brewery Permit Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your North Carolina Alcoholic Beverage Control Commission Brewery permit. Renewal date is tied to your permit issuance anniversary. Apply via the NC ABC Commission online portal at abc.nc.gov. Verify exact renewal date with your NC ABC permit certificate.'),

    ('NC', 'brewery', 'NC Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'North Carolina beer excise tax return for October–December 2025, filed with the NC Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at ncdor.gov.'),

    ('NC', 'brewery', 'NC Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'North Carolina beer excise tax return for January–March 2026. Verify due date and filing frequency at ncdor.gov.'),

    ('NC', 'brewery', 'NC Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'North Carolina beer excise tax return for April–June 2026. Verify due date and filing frequency at ncdor.gov.'),

    ('NC', 'brewery', 'NC Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'North Carolina beer excise tax return for July–September 2026. Verify due date and filing frequency at ncdor.gov.'),

    ('NC', 'brewery', 'NC ABC Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the North Carolina ABC Commission. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at abc.nc.gov.'),

    -- =========================================================================
    -- NORTH DAKOTA
    -- =========================================================================
    ('ND', 'brewery', 'ND Licensing Division Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your North Dakota Attorney General Licensing Division Manufacturer''s license for malt beverages. Renewal date is tied to your license issuance anniversary. Apply via the ND Attorney General licensing portal at attorneygeneral.nd.gov. Verify exact renewal date with your ND license certificate.'),

    ('ND', 'brewery', 'ND Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'North Dakota beer excise tax return for October–December 2025, filed with the ND Office of State Tax Commissioner. Monthly or quarterly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at nd.gov/tax.'),

    ('ND', 'brewery', 'ND Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'North Dakota beer excise tax return for January–March 2026. Verify due date and filing frequency at nd.gov/tax.'),

    ('ND', 'brewery', 'ND Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'North Dakota beer excise tax return for April–June 2026. Verify due date and filing frequency at nd.gov/tax.'),

    ('ND', 'brewery', 'ND Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'North Dakota beer excise tax return for July–September 2026. Verify due date and filing frequency at nd.gov/tax.'),

    ('ND', 'brewery', 'ND Annual Production Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by the North Dakota Attorney General Licensing Division for malt beverage manufacturer license holders. Verify exact due date and requirements at attorneygeneral.nd.gov.'),

    -- =========================================================================
    -- OKLAHOMA
    -- =========================================================================
    ('OK', 'brewery', 'OK ABLE Commission Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Oklahoma Alcoholic Beverage Laws Enforcement (ABLE) Commission Craft Brewer license. Renewal date is tied to your license issuance anniversary. Apply via the OK ABLE Commission online portal at ok.gov/able. Verify exact renewal date with your OK ABLE license certificate.'),

    ('OK', 'brewery', 'OK Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Oklahoma beer excise tax return for October–December 2025, filed with the Oklahoma Tax Commission. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at oktax.state.ok.us.'),

    ('OK', 'brewery', 'OK Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Oklahoma beer excise tax return for January–March 2026. Verify due date and filing frequency at oktax.state.ok.us.'),

    ('OK', 'brewery', 'OK Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Oklahoma beer excise tax return for April–June 2026. Verify due date and filing frequency at oktax.state.ok.us.'),

    ('OK', 'brewery', 'OK Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Oklahoma beer excise tax return for July–September 2026. Verify due date and filing frequency at oktax.state.ok.us.'),

    ('OK', 'brewery', 'OK ABLE Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Oklahoma ABLE Commission for craft brewer license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at ok.gov/able.'),

    -- =========================================================================
    -- RHODE ISLAND
    -- =========================================================================
    ('RI', 'brewery', 'RI DBR Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Rhode Island Department of Business Regulation (DBR), Office of Licensing, Manufacturer license for malt beverages. Renewal date is tied to your license issuance anniversary. Apply via the RI DBR online portal at dbr.ri.gov. Verify exact renewal date with your RI DBR license certificate.'),

    ('RI', 'brewery', 'RI Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Rhode Island beer excise tax return for October–December 2025, filed with the RI Division of Taxation. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at tax.ri.gov.'),

    ('RI', 'brewery', 'RI Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Rhode Island beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.ri.gov.'),

    ('RI', 'brewery', 'RI Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Rhode Island beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.ri.gov.'),

    ('RI', 'brewery', 'RI Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Rhode Island beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.ri.gov.'),

    ('RI', 'brewery', 'RI DBR Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Rhode Island DBR for manufacturer license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at dbr.ri.gov.'),

    -- =========================================================================
    -- SOUTH CAROLINA
    -- =========================================================================
    ('SC', 'brewery', 'SC DOR Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your South Carolina Department of Revenue Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the SC DOR MyDORWAY portal at mydorway.dor.sc.gov. Verify exact renewal date with your SC DOR license certificate.'),

    ('SC', 'brewery', 'SC Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'South Carolina beer excise tax return for October–December 2025, filed with the SC Department of Revenue. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at dor.sc.gov.'),

    ('SC', 'brewery', 'SC Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'South Carolina beer excise tax return for January–March 2026. Verify due date and filing frequency at dor.sc.gov.'),

    ('SC', 'brewery', 'SC Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'South Carolina beer excise tax return for April–June 2026. Verify due date and filing frequency at dor.sc.gov.'),

    ('SC', 'brewery', 'SC Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'South Carolina beer excise tax return for July–September 2026. Verify due date and filing frequency at dor.sc.gov.'),

    ('SC', 'brewery', 'SC DOR Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the South Carolina Department of Revenue for brewery license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at dor.sc.gov.'),

    -- =========================================================================
    -- SOUTH DAKOTA
    -- =========================================================================
    ('SD', 'brewery', 'SD DOR Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your South Dakota Department of Revenue Manufacturer of Beer license. Note: South Dakota has no state income tax. Renewal date is tied to your license issuance anniversary. Apply via the SD DOR online portal at dor.sd.gov. Verify exact renewal date with your SD DOR license certificate.'),

    ('SD', 'brewery', 'SD Beer Excise Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'South Dakota beer excise tax return for October–December 2025, filed with the SD Department of Revenue. Returns are generally due by the 25th of the month following the reporting period. Note: South Dakota has no state income tax. Verify current malt beverage tax rates and filing frequency at dor.sd.gov.'),

    ('SD', 'brewery', 'SD Beer Excise Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'South Dakota beer excise tax return for January–March 2026. Verify due date and filing frequency at dor.sd.gov.'),

    ('SD', 'brewery', 'SD Beer Excise Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'South Dakota beer excise tax return for April–June 2026. Verify due date and filing frequency at dor.sd.gov.'),

    ('SD', 'brewery', 'SD Beer Excise Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'South Dakota beer excise tax return for July–September 2026. Verify due date and filing frequency at dor.sd.gov.'),

    ('SD', 'brewery', 'SD DOR Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production report required by the South Dakota Department of Revenue for malt beverage manufacturer license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at dor.sd.gov.'),

    -- =========================================================================
    -- TENNESSEE
    -- =========================================================================
    ('TN', 'brewery', 'TN ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Tennessee Alcoholic Beverage Commission (ABC) Manufacturer''s license for beer. Note: Tennessee has no state income tax on wages (the Hall Income Tax on investment income was repealed effective 2021). Renewal date is tied to your license issuance anniversary. Apply via the TN ABC online portal at tn.gov/abc. Verify exact renewal date with your TN ABC license.'),

    ('TN', 'brewery', 'TN Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Tennessee beer excise tax return for October–December 2025, filed with the TN Alcoholic Beverage Commission. Monthly returns are generally due by the 20th of the following month. Note: Tennessee has no state income tax. Verify current malt beverage tax rates and filing frequency at tn.gov/abc.'),

    ('TN', 'brewery', 'TN Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Tennessee beer excise tax return for January–March 2026. Verify due date and filing frequency at tn.gov/abc.'),

    ('TN', 'brewery', 'TN Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Tennessee beer excise tax return for April–June 2026. Verify due date and filing frequency at tn.gov/abc.'),

    ('TN', 'brewery', 'TN Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Tennessee beer excise tax return for July–September 2026. Verify due date and filing frequency at tn.gov/abc.'),

    ('TN', 'brewery', 'TN ABC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Tennessee Alcoholic Beverage Commission for manufacturer license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at tn.gov/abc.'),

    -- =========================================================================
    -- UTAH
    -- =========================================================================
    ('UT', 'brewery', 'UT DABS Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Utah Department of Alcoholic Beverage Services (DABS) Brewery license. Note: Utah is a liquor control state with strict alcohol regulations. Beers exceeding 5% ABV by volume may only be sold through DABS-licensed state stores. On-premise taproom sales and lower-ABV beer distribution operate under different rules. Apply via the UT DABS licensing portal at dabs.utah.gov. Verify exact renewal date with your UT DABS license.'),

    ('UT', 'brewery', 'UT Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Utah beer excise tax return for October–December 2025, filed with the Utah State Tax Commission. Monthly returns are generally due by the 20th of the following month. Utah has a unique alcohol regulatory structure — verify current malt beverage tax rates, applicable ABV thresholds, and filing frequency at tap.utah.gov.'),

    ('UT', 'brewery', 'UT Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Utah beer excise tax return for January–March 2026. Verify due date and filing frequency at tap.utah.gov.'),

    ('UT', 'brewery', 'UT Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Utah beer excise tax return for April–June 2026. Verify due date and filing frequency at tap.utah.gov.'),

    ('UT', 'brewery', 'UT Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Utah beer excise tax return for July–September 2026. Verify due date and filing frequency at tap.utah.gov.'),

    ('UT', 'brewery', 'UT DABS Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Utah Department of Alcoholic Beverage Services. Report prior calendar year production volumes, ABV ranges, and distribution data. Verify exact due date and requirements at dabs.utah.gov.'),

    -- =========================================================================
    -- VERMONT
    -- =========================================================================
    ('VT', 'brewery', 'VT Department of Liquor and Lottery Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Vermont Department of Liquor and Lottery (DLL) First-Class Manufacturer license for malt beverages. Renewal date is tied to your license issuance anniversary. Apply via the VT DLL licensing portal at liquorandlottery.vermont.gov. Verify exact renewal date with your VT DLL license certificate.'),

    ('VT', 'brewery', 'VT Beer Excise Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'Vermont malt beverage tax return for October–December 2025, filed with the Vermont Department of Taxes. Returns are generally due by the 25th of the month following the reporting period. Verify current malt beverage tax rates and filing frequency at tax.vermont.gov.'),

    ('VT', 'brewery', 'VT Beer Excise Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'Vermont malt beverage tax return for January–March 2026. Verify due date and filing frequency at tax.vermont.gov.'),

    ('VT', 'brewery', 'VT Beer Excise Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'Vermont malt beverage tax return for April–June 2026. Verify due date and filing frequency at tax.vermont.gov.'),

    ('VT', 'brewery', 'VT Beer Excise Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'Vermont malt beverage tax return for July–September 2026. Verify due date and filing frequency at tax.vermont.gov.'),

    ('VT', 'brewery', 'VT DLL Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Vermont Department of Liquor and Lottery for manufacturer license holders. Report prior calendar year production volumes and distribution. Verify exact due date and requirements at liquorandlottery.vermont.gov.'),

    -- =========================================================================
    -- VIRGINIA
    -- =========================================================================
    ('VA', 'brewery', 'VA ABC Authority Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Virginia Alcoholic Beverage Control Authority (ABC Authority) Craft Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the VA ABC online licensing portal at abc.virginia.gov. Verify exact renewal date with your VA ABC license certificate.'),

    ('VA', 'brewery', 'VA Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Virginia beer excise tax return for October–December 2025, filed with the Virginia Alcoholic Beverage Control Authority. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at abc.virginia.gov.'),

    ('VA', 'brewery', 'VA Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Virginia beer excise tax return for January–March 2026. Verify due date and filing frequency at abc.virginia.gov.'),

    ('VA', 'brewery', 'VA Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Virginia beer excise tax return for April–June 2026. Verify due date and filing frequency at abc.virginia.gov.'),

    ('VA', 'brewery', 'VA Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Virginia beer excise tax return for July–September 2026. Verify due date and filing frequency at abc.virginia.gov.'),

    ('VA', 'brewery', 'VA ABC Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Virginia ABC Authority for craft brewery license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at abc.virginia.gov.'),

    -- =========================================================================
    -- WEST VIRGINIA
    -- =========================================================================
    ('WV', 'brewery', 'WV ABCA Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your West Virginia Alcohol Beverage Control Administration (ABCA) Brewery license. Renewal date is tied to your license issuance anniversary. Apply via the WV ABCA online portal at abca.wv.gov. Verify exact renewal date with your WV ABCA license certificate.'),

    ('WV', 'brewery', 'WV Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'West Virginia beer excise tax return for October–December 2025, filed with the WV State Tax Division. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and filing frequency at tax.wv.gov.'),

    ('WV', 'brewery', 'WV Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'West Virginia beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.wv.gov.'),

    ('WV', 'brewery', 'WV Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'West Virginia beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.wv.gov.'),

    ('WV', 'brewery', 'WV Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'West Virginia beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.wv.gov.'),

    ('WV', 'brewery', 'WV ABCA Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the West Virginia ABCA for brewery license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at abca.wv.gov.'),

    -- =========================================================================
    -- WISCONSIN
    -- =========================================================================
    ('WI', 'brewery', 'WI DOR Brewery License Renewal', '2026-06-30',
     'License Renewal', false,
     'Annual renewal of your Wisconsin Department of Revenue Brewer''s Permit. Wisconsin liquor permits run on a July 1–June 30 fiscal year — all permits expire June 30 and must be renewed annually by that date. Apply via the Wisconsin DOR My Tax Account portal at tap.revenue.wi.gov. Note: Local municipal permits may be required separately.'),

    ('WI', 'brewery', 'WI Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Wisconsin beer excise tax return for October–December 2025, filed with the Wisconsin Department of Revenue. Monthly returns are generally due by the 20th of the following month. Wisconsin has a strong brewing tradition and competitive excise rates for small brewers. Verify current malt beverage tax rates and filing frequency at revenue.wi.gov.'),

    ('WI', 'brewery', 'WI Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Wisconsin beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.wi.gov.'),

    ('WI', 'brewery', 'WI Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Wisconsin beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.wi.gov.'),

    ('WI', 'brewery', 'WI Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Wisconsin beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.wi.gov.'),

    ('WI', 'brewery', 'WI DOR Annual Production Report', '2026-08-31',
     'Reporting Requirement', false,
     'Annual production report required by the Wisconsin Department of Revenue for brewer permit holders. Reports production for the prior permit year ending June 30. Verify exact due date and current form requirements at revenue.wi.gov.'),

    -- =========================================================================
    -- WYOMING
    -- =========================================================================
    ('WY', 'brewery', 'WY Liquor Division Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Wyoming Liquor Division (Department of Revenue) Microbrewery or Manufacturer license. Note: Wyoming has no state income tax. Renewal date is tied to your license issuance anniversary. Apply via the WY Liquor Division licensing portal at revenue.wyo.gov/liquor-division. Verify exact renewal date with your WY Liquor Division license certificate.'),

    ('WY', 'brewery', 'WY Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Wyoming beer excise tax return for October–December 2025, filed with the Wyoming Department of Revenue. Monthly returns are generally due by the 20th of the following month. Note: Wyoming has no state income tax. Verify current malt beverage tax rates and filing frequency at revenue.wyo.gov.'),

    ('WY', 'brewery', 'WY Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Wyoming beer excise tax return for January–March 2026. Verify due date and filing frequency at revenue.wyo.gov.'),

    ('WY', 'brewery', 'WY Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Wyoming beer excise tax return for April–June 2026. Verify due date and filing frequency at revenue.wyo.gov.'),

    ('WY', 'brewery', 'WY Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Wyoming beer excise tax return for July–September 2026. Verify due date and filing frequency at revenue.wyo.gov.'),

    ('WY', 'brewery', 'WY Liquor Division Annual Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Wyoming Liquor Division for manufacturer license holders. Report prior calendar year production volumes and distribution data. Verify exact due date and requirements at revenue.wyo.gov/liquor-division.');

  end if;
end;
$$;

-- =============================================================================
-- Verify the insert:
-- SELECT state, COUNT(*) FROM compliance_deadlines WHERE is_federal = false GROUP BY state ORDER BY state;
-- Expected: 51 rows (41 new + 10 from state_compliance_deadlines.sql), counts of 5 or 6 per state.
-- =============================================================================
