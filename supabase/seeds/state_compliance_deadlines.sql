-- =============================================================================
-- State Compliance Deadlines — Top 10 Craft Brewery States
-- Seeds the compliance_deadlines table with state-specific deadline templates.
--
-- Quarterly tax entries cover Q4-2025 (due Jan 2026) through Q3-2026 (due Oct 2026)
-- giving a full rolling year of visibility from the time this seed is run.
--
-- IMPORTANT: All dates and rates are estimates for general reference only.
-- Requirements vary by license type, production volume, and filing history.
-- Always verify with your state licensing authority before taking action.
--
-- Run once in Supabase SQL Editor.
-- Safe to re-run — wrapped in a DO block that skips if state rows already exist.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from compliance_deadlines where is_federal = false limit 1
  ) then

    insert into compliance_deadlines
      (state, license_type, deadline_name, deadline_date, category, is_federal, description)
    values

    -- =========================================================================
    -- CALIFORNIA
    -- =========================================================================
    ('CA', 'brewery', 'CA ABC Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your California ABC brewery license (Type 01 Beer Manufacturer or Type 23 Small Beer Manufacturer). Renewal date is tied to your original license issuance date and varies by brewery — check the expiration date printed on your license. Renew online at abc.ca.gov. Verify exact renewal date with your CA ABC license.'),

    ('CA', 'brewery', 'CA Beer Excise Tax — Q4 2025', '2026-01-31',
     'Tax Filing', false,
     'California CDTFA beer manufacturer excise tax return for October–December 2025. Monthly filers report by the last day of the following month; quarterly filers by the last day of the month after the quarter ends. Standard rate is approximately $0.20/gallon; small brewer reduced rate applies to the first 60,000 barrels. Verify your filing frequency and current rates at cdtfa.ca.gov.'),

    ('CA', 'brewery', 'CA Beer Excise Tax — Q1 2026', '2026-04-30',
     'Tax Filing', false,
     'California CDTFA beer manufacturer excise tax return for January–March 2026. Verify your filing frequency (monthly vs. quarterly) and exact due date at cdtfa.ca.gov.'),

    ('CA', 'brewery', 'CA Beer Excise Tax — Q2 2026', '2026-07-31',
     'Tax Filing', false,
     'California CDTFA beer manufacturer excise tax return for April–June 2026. Verify filing frequency and exact due date at cdtfa.ca.gov.'),

    ('CA', 'brewery', 'CA Beer Excise Tax — Q3 2026', '2026-10-31',
     'Tax Filing', false,
     'California CDTFA beer manufacturer excise tax return for July–September 2026. Verify filing frequency and exact due date at cdtfa.ca.gov.'),

    -- =========================================================================
    -- COLORADO
    -- =========================================================================
    ('CO', 'brewery', 'CO Liquor Enforcement Division License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Colorado Liquor Enforcement Division (LED) Manufacturer license for fermented malt beverages or malt liquor. Renewal date is tied to your license issuance anniversary. Renew via the MyLicense Office portal at mybiz.colorado.gov. Verify exact renewal date with your CO LED license certificate.'),

    ('CO', 'brewery', 'CO Fermented Malt Beverage Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Colorado fermented malt beverage excise tax return for October–December 2025. Monthly filers report by the 20th of the following month. Rates vary by alcohol content — verify current rates and your filing frequency with the CO Liquor Enforcement Division at colorado.gov/led.'),

    ('CO', 'brewery', 'CO Fermented Malt Beverage Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Colorado fermented malt beverage excise tax return for January–March 2026. Verify filing frequency and exact due date at colorado.gov/led.'),

    ('CO', 'brewery', 'CO Fermented Malt Beverage Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Colorado fermented malt beverage excise tax return for April–June 2026. Verify filing frequency and exact due date at colorado.gov/led.'),

    ('CO', 'brewery', 'CO Fermented Malt Beverage Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Colorado fermented malt beverage excise tax return for July–September 2026. Verify filing frequency and exact due date at colorado.gov/led.'),

    ('CO', 'brewery', 'CO LED Annual Operations Report', '2026-02-01',
     'Reporting Requirement', false,
     'Annual operations report required by the Colorado Liquor Enforcement Division for manufacturer licensees. Report prior calendar year production volumes, sales, and distribution activity. Verify exact due date and current form requirements at colorado.gov/led.'),

    -- =========================================================================
    -- WASHINGTON
    -- =========================================================================
    ('WA', 'brewery', 'WA Liquor and Cannabis Board Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Washington State Liquor and Cannabis Board (WSLCB) Domestic Brewery or Microbrewery license. Renewal notice is mailed approximately 60 days before expiration; renewal date is tied to your original license issuance date. Renew online at lcb.wa.gov. Verify exact date with your WSLCB license.'),

    ('WA', 'brewery', 'WA Beer Excise Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'Washington State malt beverage excise tax return for October–December 2025, filed with the WA Department of Revenue. Monthly filers report by the 25th of the following month. Verify current rates and your filing frequency at dor.wa.gov.'),

    ('WA', 'brewery', 'WA Beer Excise Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'Washington State malt beverage excise tax return for January–March 2026. Verify filing frequency and exact due date at dor.wa.gov.'),

    ('WA', 'brewery', 'WA Beer Excise Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'Washington State malt beverage excise tax return for April–June 2026. Verify filing frequency and exact due date at dor.wa.gov.'),

    ('WA', 'brewery', 'WA Beer Excise Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'Washington State malt beverage excise tax return for July–September 2026. Verify filing frequency and exact due date at dor.wa.gov.'),

    -- =========================================================================
    -- MICHIGAN
    -- =========================================================================
    ('MI', 'brewery', 'MI Liquor Control Commission License Renewal', '2026-04-30',
     'License Renewal', false,
     'Annual renewal of your Michigan Liquor Control Commission (MLCC) Micro Brewer or Brewer license. Many Michigan brewery licenses are issued with an April 30 expiration; renewal applications are typically accepted 90 days in advance. Verify your specific renewal date on your MLCC license certificate at michigan.gov/lcc.'),

    ('MI', 'brewery', 'MI Beer Tax Return — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Michigan beer excise tax return for October–December 2025, filed with the Michigan Department of Treasury. Monthly returns are generally due by the 20th of the following month. Verify current tax rates and your filing schedule at michigan.gov/treasury.'),

    ('MI', 'brewery', 'MI Beer Tax Return — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Michigan beer excise tax return for January–March 2026. Verify due date and filing frequency at michigan.gov/treasury.'),

    ('MI', 'brewery', 'MI Beer Tax Return — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Michigan beer excise tax return for April–June 2026. Verify due date and filing frequency at michigan.gov/treasury.'),

    ('MI', 'brewery', 'MI Beer Tax Return — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Michigan beer excise tax return for July–September 2026. Verify due date and filing frequency at michigan.gov/treasury.'),

    ('MI', 'brewery', 'MI MLCC Annual Operations Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Michigan Liquor Control Commission. Report prior calendar year production volumes and distribution data. Verify exact due date and current form requirements at michigan.gov/lcc.'),

    -- =========================================================================
    -- PENNSYLVANIA
    -- =========================================================================
    ('PA', 'brewery', 'PA PLCB Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Pennsylvania Liquor Control Board (PLCB) brewery license (Limited Winery, Eating Place Malt Beverage, or Brew Pub). Renewal date is tied to your license issuance anniversary. Apply via the PLCB ATLAS licensing system at paplcb.pa.gov. Verify exact renewal date with your PLCB license certificate.'),

    ('PA', 'brewery', 'PA Malt Beverage Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Pennsylvania malt beverage tax return for October–December 2025, filed with the PA Department of Revenue. Monthly returns are due by the 20th of the following month. Verify current rates and your filing frequency at revenue.pa.gov.'),

    ('PA', 'brewery', 'PA Malt Beverage Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Pennsylvania malt beverage tax return for January–March 2026. Verify due date and filing frequency at revenue.pa.gov.'),

    ('PA', 'brewery', 'PA Malt Beverage Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Pennsylvania malt beverage tax return for April–June 2026. Verify due date and filing frequency at revenue.pa.gov.'),

    ('PA', 'brewery', 'PA Malt Beverage Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Pennsylvania malt beverage tax return for July–September 2026. Verify due date and filing frequency at revenue.pa.gov.'),

    -- =========================================================================
    -- NEW YORK
    -- =========================================================================
    ('NY', 'brewery', 'NY State Liquor Authority Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Renewal of your New York State Liquor Authority (SLA) Microbrewery or Farm Brewery license. NY SLA licenses are issued on a biennial (2-year) basis; the expiration date is printed on your license. Apply for renewal via the NY SLA e-licensing portal at sla.ny.gov at least 30 days before expiration. Verify exact renewal date with your SLA license.'),

    ('NY', 'brewery', 'NY Beer Tax Return — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'New York State beer excise tax return for October–December 2025, filed with the NY Department of Taxation and Finance. Quarterly returns are due by the 20th of the month following the quarter end. Verify current rates and whether you qualify for the small brewer credit at tax.ny.gov.'),

    ('NY', 'brewery', 'NY Beer Tax Return — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'New York State beer excise tax return for January–March 2026. Quarterly returns due by April 20. Verify at tax.ny.gov.'),

    ('NY', 'brewery', 'NY Beer Tax Return — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'New York State beer excise tax return for April–June 2026. Quarterly returns due by July 20. Verify at tax.ny.gov.'),

    ('NY', 'brewery', 'NY Beer Tax Return — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'New York State beer excise tax return for July–September 2026. Quarterly returns due by October 20. Verify at tax.ny.gov.'),

    ('NY', 'brewery', 'NY SLA Annual Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the New York State Liquor Authority for brewery license holders. Report prior calendar year barrel production, distribution channels, and ownership information. Verify exact due date and current requirements at sla.ny.gov.'),

    -- =========================================================================
    -- OREGON
    -- =========================================================================
    ('OR', 'brewery', 'OR Liquor and Cannabis Commission Brewery License Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Oregon Liquor and Cannabis Commission (OLCC) Brewery or Brewery-Public House license. Renewal date is tied to your license issuance anniversary. Renew via the OLCC licensing portal at oregon.gov/olcc. Note: Oregon has no state general sales tax; brewers instead pay a malt beverage privilege tax. Verify exact renewal date with your OLCC license.'),

    ('OR', 'brewery', 'OR Malt Beverage Privilege Tax — Q4 2025', '2026-01-25',
     'Tax Filing', false,
     'Oregon malt beverage privilege tax return for October–December 2025, filed with the OR Department of Revenue. Oregon has no general sales tax, but brewers pay a privilege tax on malt beverages sold in Oregon. Monthly filers report by the 25th of the following month. Verify current rates and filing frequency at oregon.gov/dor.'),

    ('OR', 'brewery', 'OR Malt Beverage Privilege Tax — Q1 2026', '2026-04-25',
     'Tax Filing', false,
     'Oregon malt beverage privilege tax return for January–March 2026. Verify filing frequency and exact due date at oregon.gov/dor.'),

    ('OR', 'brewery', 'OR Malt Beverage Privilege Tax — Q2 2026', '2026-07-25',
     'Tax Filing', false,
     'Oregon malt beverage privilege tax return for April–June 2026. Verify filing frequency and exact due date at oregon.gov/dor.'),

    ('OR', 'brewery', 'OR Malt Beverage Privilege Tax — Q3 2026', '2026-10-25',
     'Tax Filing', false,
     'Oregon malt beverage privilege tax return for July–September 2026. Verify filing frequency and exact due date at oregon.gov/dor.'),

    ('OR', 'brewery', 'OR OLCC Annual Report', '2026-02-01',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Oregon Liquor and Cannabis Commission. Report prior calendar year production volumes, in-state sales, and distribution data. Verify exact due date and current form requirements at oregon.gov/olcc.'),

    -- =========================================================================
    -- TEXAS
    -- =========================================================================
    ('TX', 'brewery', 'TX TABC Brewer''s Permit Renewal', '2026-01-31',
     'License Renewal', false,
     'Renewal of your Texas Alcoholic Beverage Commission (TABC) Brewer''s Permit (BE) or Brewpub License (BP). Texas TABC permits are issued for a 2-year period — the renewal date is printed on your permit. Renew at mytabc.com at least 30 days before expiration. Verify exact renewal date and current fees with your TABC permit.'),

    ('TX', 'brewery', 'TX Beer Excise Tax — Q4 2025', '2026-01-15',
     'Tax Filing', false,
     'Texas beer excise tax report for October–December 2025, filed with the TX Comptroller of Public Accounts. Monthly filers report by the 15th of the following month. Verify current rates and your reporting schedule at comptroller.texas.gov.'),

    ('TX', 'brewery', 'TX Beer Excise Tax — Q1 2026', '2026-04-15',
     'Tax Filing', false,
     'Texas beer excise tax report for January–March 2026. Monthly filers report by the 15th of the following month. Verify at comptroller.texas.gov.'),

    ('TX', 'brewery', 'TX Beer Excise Tax — Q2 2026', '2026-07-15',
     'Tax Filing', false,
     'Texas beer excise tax report for April–June 2026. Verify filing frequency and due date at comptroller.texas.gov.'),

    ('TX', 'brewery', 'TX Beer Excise Tax — Q3 2026', '2026-10-15',
     'Tax Filing', false,
     'Texas beer excise tax report for July–September 2026. Verify filing frequency and due date at comptroller.texas.gov.'),

    ('TX', 'brewery', 'TX TABC Annual Activity Report', '2026-03-01',
     'Reporting Requirement', false,
     'Annual production and distribution activity report required by the Texas Alcoholic Beverage Commission. Report prior calendar year barrel production, in-state and out-of-state sales, and distribution information. Verify exact due date and current requirements at tabc.texas.gov.'),

    -- =========================================================================
    -- FLORIDA
    -- =========================================================================
    ('FL', 'brewery', 'FL Division of ABT Craft Brewery License Renewal', '2026-10-01',
     'License Renewal', false,
     'Annual renewal of your Florida Division of Alcoholic Beverages and Tobacco (ABT) Craft Brewery license (license type CRB). Florida alcoholic beverage licenses run on a state fiscal year — all licenses expire September 30 and must be renewed by October 1. Late renewal fees apply after October 1. Renew at myfloridalicense.com.'),

    ('FL', 'brewery', 'FL Beer Excise Tax — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Florida beer excise tax return for October–December 2025. Monthly returns are generally due by the 20th of the following month. Verify current malt beverage tax rates and your filing frequency with the FL Department of Business and Professional Regulation at myfloridalicense.com.'),

    ('FL', 'brewery', 'FL Beer Excise Tax — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Florida beer excise tax return for January–March 2026. Verify due date and filing frequency with FL DBPR.'),

    ('FL', 'brewery', 'FL Beer Excise Tax — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Florida beer excise tax return for April–June 2026. Verify due date and filing frequency with FL DBPR.'),

    ('FL', 'brewery', 'FL Beer Excise Tax — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Florida beer excise tax return for July–September 2026. Verify due date and filing frequency with FL DBPR.'),

    ('FL', 'brewery', 'FL ABT Annual Production Report', '2026-10-31',
     'Reporting Requirement', false,
     'Annual production and sales report required by the Florida Division of Alcoholic Beverages and Tobacco for CRB license holders. Report total barrel production and sales for the prior state fiscal year (ending September 30). Verify exact due date and current requirements at myfloridalicense.com.'),

    -- =========================================================================
    -- OHIO
    -- =========================================================================
    ('OH', 'brewery', 'OH Division of Liquor Control Permit Renewal', '2026-01-31',
     'License Renewal', false,
     'Annual renewal of your Ohio Division of Liquor Control (DLC) A-1-A Manufacturer of Beer permit. Ohio liquor permits renew annually on the anniversary of issuance — the renewal date varies by brewery. Apply via the Ohio Business Gateway at business.ohio.gov. Verify exact renewal date with your OH DLC permit certificate.'),

    ('OH', 'brewery', 'OH Beer Tax Return — Q4 2025', '2026-01-20',
     'Tax Filing', false,
     'Ohio beer excise tax return for October–December 2025, filed with the Ohio Department of Taxation. Monthly returns are typically due by the 20th of the following month. Verify current Ohio beer tax rates and your filing frequency at tax.ohio.gov.'),

    ('OH', 'brewery', 'OH Beer Tax Return — Q1 2026', '2026-04-20',
     'Tax Filing', false,
     'Ohio beer excise tax return for January–March 2026. Verify due date and filing frequency at tax.ohio.gov.'),

    ('OH', 'brewery', 'OH Beer Tax Return — Q2 2026', '2026-07-20',
     'Tax Filing', false,
     'Ohio beer excise tax return for April–June 2026. Verify due date and filing frequency at tax.ohio.gov.'),

    ('OH', 'brewery', 'OH Beer Tax Return — Q3 2026', '2026-10-20',
     'Tax Filing', false,
     'Ohio beer excise tax return for July–September 2026. Verify due date and filing frequency at tax.ohio.gov.'),

    ('OH', 'brewery', 'OH DLC Annual Manufacturer''s Report', '2026-02-28',
     'Reporting Requirement', false,
     'Annual production and operations report required by the Ohio Division of Liquor Control for A-1-A permit holders. Report prior calendar year production volumes, distribution, and sales data. Verify exact due date and current form requirements at com.ohio.gov/divisions/liquor-control.');

  end if;
end;
$$;

-- =============================================================================
-- Verify the insert:
-- SELECT state, COUNT(*) FROM compliance_deadlines WHERE is_federal = false GROUP BY state ORDER BY state;
-- =============================================================================
