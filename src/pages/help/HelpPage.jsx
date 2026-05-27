/**
 * HelpPage — searchable FAQ with expandable accordion sections.
 * Search filters both questions and answers in real time.
 * In search mode questions render as a flat list without category grouping.
 */
import { useState, useMemo, useEffect } from 'react'

// ── FAQ data ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    items: [
      {
        q: 'What is The Craft Beer Brief Essentials and who is it for?',
        a: 'The Craft Beer Brief Essentials is a compliance and funding toolkit built specifically for small craft breweries. It helps brewery owners and staff track compliance deadlines, find grants and funding, manage TTB filing obligations, store license documents, track staff certifications, monitor insurance policies, and stay on top of local permits — all in one place. It is designed for nano breweries, microbreweries, taproom operations, and brew pubs that do not have a dedicated compliance team.',
      },
      {
        q: 'How do I set up my brewery profile?',
        a: 'Your brewery profile is set up during the onboarding process right after you create your account. You can update it at any time by going to Account Settings in the sidebar and editing the Brewery Profile section. Your profile information — especially your state and license types — is used to personalize your compliance calendar and grant finder results.',
      },
      {
        q: 'What happens during my 14 day free trial?',
        a: 'During your free trial you have full access to every feature in the app — no restrictions. Your trial starts the moment you create your account and lasts 14 days. You will see a countdown banner on your dashboard showing how many days remain. When your trial ends you will be prompted to choose a plan to continue. Nothing is automatic and you will not be charged unless you actively choose to subscribe.',
      },
      {
        q: 'Do I need a credit card to start my free trial?',
        a: 'No. Your 14 day free trial requires no credit card and no payment information. You only enter payment details if you choose to subscribe after your trial ends. You are in complete control.',
      },
      {
        q: 'How do I invite staff members to my account?',
        a: "Go to Account Settings in the sidebar and look for the Staff Invitations section. Enter the email address of the staff member you want to invite and click Send Invitation. They will receive an email with a link to create their account. Once they sign up they will have access to your brewery's account under the same subscription — no additional charge.",
      },
    ],
  },
  {
    id: 'compliance-calendar',
    label: 'Compliance Calendar',
    items: [
      {
        q: 'How does the compliance calendar get personalized to my brewery?',
        a: "When you complete your brewery profile during onboarding the app automatically loads compliance deadlines based on your state and the license types you hold. Federal deadlines that apply to all breweries — like TTB excise tax filings and Brewer's Notice renewals — are loaded for everyone. State-specific deadlines are loaded based on your state. You can review, edit, and add to these deadlines at any time.",
      },
      {
        q: 'My state is not showing the right deadlines — what should I do?',
        a: 'The pre-populated deadlines are based on general state licensing requirements and may not perfectly match your specific situation. If a deadline is wrong for your brewery you can edit it by clicking the deadline in the calendar and updating the date or details. You can also add custom deadlines for anything specific to your operation. Always verify compliance requirements directly with your state licensing authority as requirements can change.',
      },
      {
        q: 'Can I add my own custom deadlines?',
        a: 'Yes. Click the Add Deadline button on the Compliance Calendar page to add any custom deadline. You can set it as a one-time deadline or make it recurring — annually, quarterly, or monthly. Custom deadlines appear alongside your pre-populated ones and are color coded differently so you can tell them apart.',
      },
      {
        q: 'How do I mark a deadline as complete?',
        a: 'In list view click the checkbox next to any deadline to mark it complete. In calendar view click the deadline to open the detail panel and toggle the complete switch. Completed deadlines move to the completed section at the bottom of each month and their calendar dot becomes muted to show they are done.',
      },
      {
        q: 'Can I edit a pre-populated deadline if the date is wrong for my situation?',
        a: 'Yes. Click any pre-populated deadline to open the detail panel and edit the date, name, or notes. Your changes only affect your brewery — other users are not affected. Pre-populated deadlines also have a Reset to Original button if you want to restore the default date and information.',
      },
    ],
  },
  {
    id: 'grant-finder',
    label: 'Grant & Funding Finder',
    items: [
      {
        q: 'Where does the grant data come from?',
        a: 'All grants and funding programs in our database are manually researched and curated by The Craft Beer Brief team specifically for craft breweries. Our database includes federal programs (SBA, USDA, EDA), state economic development programs across all 50 states, and municipal programs in key cities. The database is reviewed and updated quarterly. Users can also submit programs they find using the Submit a Grant button — submissions are reviewed and added after verification.',
      },
      {
        q: 'How often is the grant database updated?',
        a: 'The grant database is reviewed and updated quarterly by The Craft Beer Brief team. Each program listing shows when it was last verified. When you submit a grant we review it within 48 hours. We recommend always verifying program details directly with the funding agency before applying as program availability and deadlines change frequently.',
      },
      {
        q: 'How do I find grants specific to my state?',
        a: 'The My State Only toggle at the top of the Grant Finder is turned on by default and shows only grants available in your state based on your brewery profile. Toggle it off to see all grants nationally. You can also use the Funding Type and Status filters to narrow results further.',
      },
      {
        q: 'Can I submit a grant that is not in the database?',
        a: 'Yes. Click the Submit a Grant button on the Grant Finder page to submit a grant or funding program you found. Include as much detail as possible — the program name, funding agency, eligibility requirements, application URL, and deadline. Our team reviews submissions within 48 hours and you will be notified by email when your submission is approved and added to the database.',
      },
      {
        q: 'What does the Alert Me button do on a grant?',
        a: 'The Alert Me button appears when you bookmark a grant that has an application deadline. Clicking it sets a reminder so you receive an email notification 30 days before the application deadline. This makes sure you have plenty of time to prepare your application without having to manually track the date.',
      },
    ],
  },
  {
    id: 'ttb-filing',
    label: 'TTB Filing Tracker',
    items: [
      {
        q: "What is a Brewer's Notice and do I need one?",
        a: "A Brewer's Notice is a federal registration issued by the TTB (Alcohol and Tobacco Tax and Trade Bureau) that every commercial brewery must have before producing beer for sale. It is not technically a license but a notice of intent to operate as a brewery. If you are selling beer commercially you already have one. The app asks you to confirm this during onboarding for documentation purposes only — it does not verify or submit anything to the TTB on your behalf.",
      },
      {
        q: 'What TTB filing frequency should I select?',
        a: 'Most small craft breweries file quarterly since they produce under 50,000 barrels annually. Monthly filing is only required for breweries producing over 50,000 barrels per year which is very uncommon for small operations. Annual filing is available for very small producers under specific TTB thresholds. If you are unsure check your existing TTB correspondence or verify at ttb.gov.',
      },
      {
        q: 'What is a COLA and how do I track one?',
        a: 'COLA stands for Certificate of Label Approval. The TTB requires breweries to obtain a COLA for every beer label before selling the product in interstate commerce. The COLA Tracker in the TTB section lets you log each label submission with the beer name, submission date, and status — tracking it from pending through to approved or rejected. When a COLA is approved you can record the approval number for your records.',
      },
      {
        q: 'Does this app file my TTB returns for me?',
        a: "No. This app is a tracking and record-keeping tool only. It does not file, submit, or communicate with the TTB or any government agency on your behalf. All actual filings and payments remain your sole responsibility. The app helps you organize your obligations and maintain records — always file directly through the TTB's pay.gov system or work with your accountant.",
      },
      {
        q: 'What excise tax rate should I use?',
        a: 'The current federal excise tax rate for domestic craft breweries producing under 60,000 barrels annually is $3.50 per barrel for the first 60,000 barrels removed for consumption. This rate is pre-filled in the excise tax calculator but you can edit it if rates change. Always verify the current rate at ttb.gov before filing as Congress periodically adjusts these rates.',
      },
    ],
  },
  {
    id: 'document-storage',
    label: 'Document Storage',
    items: [
      {
        q: 'How secure are my uploaded documents?',
        a: "Your documents are stored encrypted at rest using Supabase's secure cloud storage infrastructure which is SOC 2 Type II certified. All data transmission is encrypted via HTTPS. Each brewery account is completely isolated — no other brewery can access your documents. We never access, read, or share your uploaded documents for any purpose other than providing you access to them.",
      },
      {
        q: 'What file types and sizes are supported?',
        a: 'The document storage supports PDF, JPG, JPEG, PNG, DOC, and DOCX files up to 25MB per file. Most brewery license documents, insurance certificates, and permits are well under this limit. If you have a very large scanned document try saving it as a compressed PDF to reduce the file size.',
      },
      {
        q: 'Can I link a document to a compliance deadline or insurance policy?',
        a: 'Yes. When adding or editing a compliance deadline, insurance policy, local permit, or staff certification you will see a Link to Document dropdown that shows your uploaded documents. Selecting a document links it to that record so you can quickly access the relevant file from within each module.',
      },
      {
        q: 'How do I get my documents back if I cancel?',
        a: 'Your documents remain accessible for 30 days after cancellation. During that time you can download any document by clicking the Download button on each file. After 30 days your account moves to read-only mode and document downloads are still available. We recommend downloading and backing up your important documents before cancelling.',
      },
    ],
  },
  {
    id: 'staff-certifications',
    label: 'Staff & Certifications',
    items: [
      {
        q: 'What certifications should I be tracking for my taproom staff?',
        a: "The most important certifications to track for taproom staff are responsible alcohol service certifications — such as TIPS, ServSafe Alcohol, or your state's specific program. Many states require these for anyone serving alcohol. You should also track food handler cards if your taproom serves food, and any manager-level food safety certifications like ServSafe Manager. Some breweries also track Cicerone certifications for staff development purposes.",
      },
      {
        q: 'How do I add a staff member?',
        a: 'Go to Staff and Certifications in the sidebar and click the Staff Members tab. Click Add Staff Member and enter their name, role, and optional contact information. Once added you can add certifications to their profile from the Certifications tab. Staff members added here are separate from staff members who have login access to the app — to give someone login access use the invitation feature in Account Settings.',
      },
      {
        q: 'What happens to staff certification records if a staff member leaves?',
        a: 'Staff members can be deactivated rather than deleted which preserves their certification history for your records. Click the Deactivate button on their staff card. Deactivated staff members are hidden from the active list but their records are retained. You can view deactivated staff by toggling the Show Inactive Staff option.',
      },
    ],
  },
  {
    id: 'insurance-permits',
    label: 'Insurance & Local Permits',
    items: [
      {
        q: 'What types of insurance should a brewery carry?',
        a: 'Most craft breweries carry at minimum general liability insurance and liquor liability insurance. Liquor liability is particularly important as it covers incidents related to alcohol service. Other common policies include product liability (for packaged beer), commercial property, and workers compensation if you have employees. Taprooms that host events often add event liability coverage. Consult with a licensed insurance agent who specializes in alcohol beverage businesses for advice specific to your operation.',
      },
      {
        q: 'My local permit is not in the pre-populated list — can I add it?',
        a: 'Yes. The Local Permit Tracker is designed to be fully customizable since local permit requirements vary enormously by municipality. Click Add Permit and select the permit type that best matches or choose Other. Enter your permit name, issuing authority, and any relevant dates. There is no limit to how many local permits you can track.',
      },
      {
        q: 'What is an outdoor seating permit and do I need one?',
        a: 'An outdoor seating permit or patio permit allows your brewery to serve alcohol in an outdoor area. Requirements vary significantly by city and county — some municipalities require a separate permit for any outdoor seating, others include it in your existing license, and some require additional inspections or approvals for beer gardens. Check with your local ABC office or city planning department to confirm what your specific location requires.',
      },
    ],
  },
  // ── Operations tier categories ───────────────────────────────────────────────
  {
    id: 'operations-overview',
    label: 'Operations Overview',
    items: [
      {
        q: 'What is the Operations tier and what does it include?',
        a: 'The Operations tier ($14.99/month) includes everything in Essentials plus seven brewery management tools: Recipe Builder & Cost Calculator, Ingredient Inventory & Purchase Tracker, Brew Day Scheduler & Log, Fermentation Tracker, Packaging & Yield Tracking, Distribution & Taproom Profitability, and Taproom Profitability. You get a 14-day free trial of Operations when you sign up — no credit card required.',
      },
      {
        q: 'How does the Operations trial work?',
        a: 'Every new account gets a free 14-day Operations trial with full access to all Essentials and Operations features. No credit card is required. When your trial ends you can subscribe to Operations at $14.99/month, downgrade to Essentials at $9.99/month, or let your account expire. Your data is always retained.',
      },
      {
        q: 'Can I upgrade from Essentials to Operations?',
        a: 'Yes — go to Account Settings and click Upgrade Plan, or click any locked Operations feature to see upgrade options. Your existing data carries over automatically.',
      },
    ],
  },
  {
    id: 'recipe-builder',
    label: 'Recipe Builder',
    items: [
      {
        q: 'How do I build a recipe?',
        a: 'Go to Recipes in the Operations section of the sidebar. Click Add Recipe, enter your beer name and style, set your batch size and targets, then click Save. You will be taken directly to the recipe detail page where you can add ingredients organized by addition type — Mash, Boil, Whirlpool, Dry Hop, and more.',
      },
      {
        q: 'How does the cost calculator work?',
        a: 'The cost calculator pulls ingredient costs directly from your Inventory module — add ingredients to inventory with supplier pricing first. As you add ingredients to your recipe the calculator automatically shows ingredient costs, packaging costs, labor, utilities, overhead, and calculates cost per pint and suggested retail price based on your target margin.',
      },
      {
        q: 'How do I set up packaging splits?',
        a: 'In the recipe cost calculator scroll to the Packaging section. Click Add Packaging Split and select your container type (Can, Bottle, Keg, Draft) and size. Enter the volume in barrels going to each format and the system automatically calculates unit counts. You can add multiple splits — for example 60% cans, 30% kegs, 10% taproom draft.',
      },
      {
        q: 'Why does the recipe checklist show warnings?',
        a: 'The recipe checklist at the top of each recipe shows required items (mash ingredients, hops, yeast, OG/FG targets, batch size) and recommended items (ingredient costs, complete packaging splits). Required items must be completed before scheduling a brew day. Recommended items improve cost accuracy.',
      },
    ],
  },
  {
    id: 'ingredient-inventory',
    label: 'Ingredient Inventory',
    items: [
      {
        q: 'How do I add ingredients to inventory?',
        a: 'Go to Inventory in the sidebar. Click Add to Inventory for ingredients received without a purchase order — donations, transfers, or opening stock. For purchased ingredients use the Purchase Orders workflow: create a PO, submit it, then receive it in the Receive Stock tab. Receiving a PO automatically updates your inventory and records the landed cost.',
      },
      {
        q: 'What is a Purchase Order and when should I use it?',
        a: 'A Purchase Order tracks ingredients you are buying from a supplier. Create a PO in the Purchase Orders tab, add line items with quantities and costs, and submit it. When your delivery arrives go to Receive Stock, select the PO, and confirm what was received. The system automatically updates inventory levels and records the cost per unit including shipping allocation.',
      },
      {
        q: 'What is landed cost?',
        a: 'Landed cost is the true cost of an ingredient delivered to your brewery — the purchase price plus your share of the shipping and freight costs for that order. For example if you pay $45 shipping on a 55lb hop order the landed cost per pound is the base price plus $0.82/lb shipping allocation. The Recipe Builder uses landed costs for accurate cost calculations.',
      },
      {
        q: 'How do reorder alerts work?',
        a: 'When you add an ingredient set a reorder threshold — the quantity at which you want to be alerted to reorder. When stock falls to or below that threshold the ingredient shows in amber on the Inventory tab and triggers an alert in the sidebar and dashboard. The Brew Day module also warns you if you have insufficient inventory before brewing.',
      },
    ],
  },
  {
    id: 'brew-day',
    label: 'Brew Day Scheduler',
    items: [
      {
        q: 'How do I schedule a brew day?',
        a: 'Go to Brew Day and click Schedule a Brew. Link it to a recipe to auto-populate beer name, batch size, targets, and yeast strain. Set your brew date and brewer name. The system auto-suggests the next sequential batch number. After scheduling open the brew day log to record your actual measurements.',
      },
      {
        q: 'What mash types are supported?',
        a: 'The Brew Day log supports Single Infusion, Step Mash (with multiple temperature rest steps), Decoction (with individual decoction records), BIAB (Brew In A Bag), No Sparge, Turbid Mash (for lambic and wild ales), and Other with a free text description.',
      },
      {
        q: 'Does the brew day automatically update inventory?',
        a: 'Yes — when you mark a brew day as Complete the system automatically deducts all recipe ingredients from inventory based on the actual batch size brewed. It creates inventory transaction records showing what was used and links them to the batch number. You can also see inventory sufficiency warnings before brewing by clicking Check Inventory in the Recipe Builder.',
      },
      {
        q: 'What happens after I mark a brew day complete?',
        a: 'Marking a brew day complete automatically creates a fermentation record in the Fermentation Tracker with status Pending Assignment. Go to the Fermentation Tracker and assign the batch to a fermentation vessel to start tracking.',
      },
    ],
  },
  {
    id: 'fermentation',
    label: 'Fermentation Tracker',
    items: [
      {
        q: 'How do I set up fermentation vessels?',
        a: 'Go to Fermentation and click Manage Vessels. Add each vessel with its name, type (Conical Fermenter, Unitank, Bright Tank, etc.), capacity, and whether it has temperature control. The dashboard shows all vessels as visual illustrations — gray when empty, amber with bubbles when fermenting, blue when conditioning, green when ready to package.',
      },
      {
        q: 'How do I log gravity readings?',
        a: 'Click Log Reading on any active vessel card. Enter the date, gravity reading (in 1.0XX format), temperature, and any notes. The vessel card displays a mini sparkline chart showing your gravity trend over time. Hover over any data point to see the exact value and date.',
      },
      {
        q: 'How does the stage history work?',
        a: 'The fermentation detail view tracks each stage — Primary Fermentation, Conditioning, and Lagering — separately. When you move a fermentation to Conditioning or Lagering a modal asks for the temperature target, duration, and notes for that stage. The Stage History tab shows all stages with their settings and gravity readings grouped by stage.',
      },
      {
        q: 'What triggers the packaging step?',
        a: 'When you mark a fermentation as Ready to Package the system automatically creates a packaging run record in the Packaging module. Go to Packaging to complete the packaging details.',
      },
    ],
  },
  {
    id: 'packaging',
    label: 'Packaging',
    items: [
      {
        q: 'How does the Packaging module connect to Fermentation?',
        a: 'When you mark a fermentation as Ready to Package a packaging run is automatically created with the beer name, batch number, volume from fermenter, and planned packaging splits from your recipe. Open the packaging run in the Packaging module to log actual units packaged, record yield loss, add quality checks, and calculate profit impact.',
      },
      {
        q: 'What is packaging yield and why does it matter?',
        a: 'Packaging yield is the percentage of your fermented volume that makes it into finished packages. Industry average is 75-90% — the rest is lost to trub, yeast cake, line fills, and transfer losses. The Packaging module tracks your actual yield and shows how it affects your cost per unit and profit compared to your recipe plan.',
      },
      {
        q: 'How do I log a quality check?',
        a: 'In the Packaging run detail scroll to Section 4 — Quality Control and click Add Quality Check. Record clarity, carbonation level, aroma, flavor, appearance, measured ABV, and pH. Mark whether the batch passed QC. Quality check records are stored permanently with the batch.',
      },
    ],
  },
  {
    id: 'distribution',
    label: 'Distribution',
    items: [
      {
        q: 'How does distribution tracking work?',
        a: 'After completing a packaging run the system creates a distribution record automatically. Go to Distribution and click Assign Distribution to record where each package split is going — wholesale accounts, taproom, events. Set up accounts in the Accounts tab with contact info and standard pricing so sale prices auto-populate when you assign deliveries.',
      },
      {
        q: 'How do I track keg returns?',
        a: 'When assigning a keg delivery toggle Returnable Kegs on and set an expected return date. The Deliveries tab tracks all outstanding keg returns and shows overdue kegs in red. Mark kegs as returned when they come back.',
      },
      {
        q: 'How is profit per unit calculated?',
        a: 'Profit per unit = Sale price per unit minus Total production cost per unit minus Packaging material cost per unit minus Distribution/delivery cost per unit. The total production cost comes from your recipe cost calculator including ingredients, labor, utilities, and overhead divided by the actual units packaged.',
      },
    ],
  },
  {
    id: 'taproom',
    label: 'Taproom',
    items: [
      {
        q: 'How does the Taproom Profitability view work?',
        a: 'The Taproom module shows all active Draft/Taproom package splits assigned in Distribution as tap handle cards. Each card shows the beer name, days on tap, sale price per pint, cost per pint from your recipe, and gross margin. Use it to see at a glance which beers on tap generate the best margin.',
      },
      {
        q: 'How do I mark a keg as kicked?',
        a: 'On the tap handle card click Mark as Kicked. This records the date the keg finished and moves it to Historical Performance. The Taproom comparison table updates automatically.',
      },
    ],
  },
  // ── Full Suite tier categories ──────────────────────────────────────────────
  {
    id: 'full-suite-overview',
    label: 'Full Suite Overview',
    items: [
      {
        q: 'What is the Full Suite tier and what does it include?',
        a: 'The Full Suite tier ($19.99/month or $199.99/year) includes everything in Essentials and Operations plus four additional modules: Taproom Event Planner & ROI Tracker, Wholesale Account Manager, Staff Training & Development Tracker, Taproom Revenue Benchmarking Dashboard, and the complete Regulation Policy & Advocacy Playbook with 26 downloadable document templates. Full Suite is designed for breweries that want a complete management and advocacy toolkit in one place.',
      },
      {
        q: 'How is Full Suite different from Operations?',
        a: 'Operations covers your core brewery workflow from recipe to distribution. Full Suite adds business development and advocacy tools on top of that — event planning and ROI tracking, wholesale CRM, staff training management, taproom benchmarking against industry data, and the complete legislative and regulatory playbook with customizable Word document templates.',
      },
      {
        q: 'Can I upgrade from Operations to Full Suite?',
        a: 'Yes — go to Account Settings and click Upgrade Plan, or visit the upgrade page directly. Your existing data carries over automatically and you get immediate access to all Full Suite modules.',
      },
    ],
  },
  {
    id: 'taproom-events',
    label: 'Taproom Event Planner',
    items: [
      {
        q: 'How do I plan a new event?',
        a: 'Go to Taproom Events in the Full Suite section of the sidebar. Click Plan New Event and fill in the event details — name, type, date, expected attendance, ticket price if applicable, and estimated revenue and costs. The modal shows a live ROI preview as you fill in the fields so you can see the projected return before committing. You can also save events as templates to reuse for recurring events like weekly trivia or monthly live music nights.',
      },
      {
        q: 'How does event ROI tracking work?',
        a: 'After an event date passes the Actuals tab becomes available in the event detail view. Enter actual attendance, ticket sales, beer and food revenue, and actual costs. The system calculates net ROI (revenue minus costs) and ROI percentage and compares it to your planned estimates. Over time the ROI Analysis section shows which event types generate the best return for your taproom.',
      },
      {
        q: 'What are event templates?',
        a: 'Event templates save your standard event setup so you do not have to re-enter the same information for recurring events. For example save a Friday Night Live Music template with your typical band cost, expected attendance, and estimated beer revenue. Next time you schedule that event select the template and all fields pre-populate. You can adjust any field before saving.',
      },
    ],
  },
  {
    id: 'wholesale-accounts',
    label: 'Wholesale Account Manager',
    items: [
      {
        q: 'How is the Wholesale Account Manager different from the Distribution module?',
        a: 'The Distribution module tracks the logistics of getting beer to accounts — package splits, delivery dates, keg returns, and invoicing. The Wholesale Account Manager is a relationship CRM — it stores contact information, tracks follow-up dates, logs your interactions, and shows account performance pulled automatically from your Distribution data. No duplicate data entry — order history and revenue come from Distribution automatically.',
      },
      {
        q: 'How do I add a wholesale account?',
        a: 'Go to Wholesale in the sidebar and click Add Account. Enter the account name, type, contacts, address, delivery preferences, and payment terms. If this account already exists in your Distribution module you can link them together so distribution data flows in automatically. Multiple contacts per account are supported — add as many contacts as needed with their name, email, phone, and role.',
      },
      {
        q: 'What are follow-ups and how do I track them?',
        a: 'Each wholesale account has a Next Follow-up Date field. The Follow-Ups tab in the Wholesale module shows all accounts organized by urgency — overdue, due today, due this week, and upcoming. When you log a contact interaction it records the date and notes and prompts you to set the next follow-up date. This keeps your sales relationships active without requiring a dedicated CRM system.',
      },
    ],
  },
  {
    id: 'staff-training',
    label: 'Staff Training & Development',
    items: [
      {
        q: 'How do I set up training programs?',
        a: 'Go to Staff Training in the sidebar and click the Programs tab. Click Add Program to create a new training program with a name, type (Safety, Compliance, Beer Knowledge, etc.), duration, whether it is required for certain roles, and whether it needs periodic renewal. Once a program exists you can assign it to specific staff members and track completion.',
      },
      {
        q: 'How do I assign training to staff members?',
        a: 'On any program card click Assign Staff. A checklist appears showing all your staff members pulled from the Essentials Staff & Certifications module. Select the staff members who need to complete this program and set a required completion date. The compliance matrix in the Staff Records tab then tracks who has completed it and who has not.',
      },
      {
        q: 'What does the compliance matrix show?',
        a: 'The compliance matrix is a grid showing every staff member on the rows and every required training program on the columns. Each cell shows a green checkmark if the staff member has completed and is current, an amber warning if their certification expires within 60 days, a red X if expired or overdue, and a gray dash with an A if assigned but not yet completed. The Compliance tab shows your overall completion rate and lists everyone who needs attention.',
      },
    ],
  },
  {
    id: 'benchmarking',
    label: 'Taproom Revenue Benchmarking',
    items: [
      {
        q: 'Where does the benchmark data come from?',
        a: 'Benchmark ranges are sourced from Brewers Association industry data covering small to mid-size craft taprooms. The ranges show low, median, and high performance across metrics including revenue per square foot, labor as a percentage of revenue, average transaction value, and revenue per operating day. These are updated periodically as new industry data becomes available.',
      },
      {
        q: 'How do I enter my taproom metrics?',
        a: 'Go to Revenue Benchmarking in the sidebar. Select the month you want to enter data for using the month selector at the top. Fill in your taproom revenue, square footage, number of transactions, operating days, labor hours and cost, and any food or merchandise revenue. Data auto-saves as you fill in each field. Event revenue is pulled automatically from the Taproom Events module if you log events there.',
      },
      {
        q: 'What does the benchmark comparison show?',
        a: 'For each key metric the system shows a horizontal bar from the industry low to high range with your value marked as a dot on the bar. Green means you are at or above the industry median — you are performing well. Amber means you are between the low and median — room to improve. Red means you are below the industry low — this metric needs attention. The Performance Trends tab shows how your metrics change over time with 12-month trend charts.',
      },
    ],
  },
  {
    id: 'regulation-playbook',
    label: 'Regulation Playbook',
    items: [
      {
        q: 'What is included in the Regulation Playbook?',
        a: 'The Full Suite tier includes The Craft Beer Brief Legislative Playbook — a comprehensive 370-page guide to navigating regulation, policy, and advocacy for US craft breweries. It covers federal TTB compliance, state-level legislation navigation, local government and municipal laws, legislative tracking systems, impact assessment, stakeholder engagement, coalition building, and all-50-state regulatory comparisons. Full Suite subscribers can download the complete PDF directly from the Regulation Playbook page.',
      },
      {
        q: 'What are the 26 document templates?',
        a: 'The template generator creates customized Word documents based on your brewery\'s specific information. Templates are organized in six categories: Legislator Communications (meeting request letters, tour invitations, economic impact one-pagers), Testimony & Response (written committee testimony, oral testimony scripts, regulatory public comments), Op-Ed & Media (op-ed structure templates), Compliance Documents (TTB audit memos, guidance request letters, compliance checklists), Coalition Building (joint statements, partner MOUs, health assessments), and Assessment & Tracking Tools (impact assessment worksheets, legislative tracking logs, stakeholder contact logs). Fill in your brewery details and generate a professional customized document in seconds.',
      },
      {
        q: 'How do I generate a document?',
        a: 'Go to Regulation Playbook in the sidebar. Click Generate Document on any template card. A form opens with fields specific to that template — your brewery name and location auto-populate from your profile. Fill in the remaining fields and click Generate Document. A customized Word document downloads to your computer ready to use. The document contains no branding or watermarks — it looks like it came entirely from your brewery.',
      },
      {
        q: 'Is the playbook legal advice?',
        a: 'No — the playbook is an educational and strategic guide, not legal advice. It provides frameworks, templates, and information to help brewery owners understand and navigate the regulatory landscape, but it does not substitute for qualified legal counsel. Always consult a licensed alcohol beverage attorney before taking any compliance action or making legal determinations based on playbook content.',
      },
    ],
  },
  // ── AI Assistant category ─────────────────────────────────────────────────────
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    items: [
      {
        q: 'What is the Craft Brief AI Assistant?',
        a: 'The Craft Brief AI Assistant is a brewery-specific AI chat tool built into the app. It can help you navigate the app, answer TTB compliance questions, explain brewery operations concepts, help with advocacy strategy, and point you to the right features. Look for the amber ✨ button in the bottom right corner of any page. It is powered by Claude — Anthropic\'s AI — and trained with specific knowledge of The Craft Beer Brief app and the craft brewery industry.',
      },
      {
        q: 'Which plans include the AI assistant?',
        a: 'The AI assistant is available to all paying subscribers — Essentials, Operations, and Full Suite. It is not available during the free trial. Each plan includes a daily message allowance: Essentials subscribers get 20 messages per day, Operations subscribers get 40 messages per day, and Full Suite subscribers get 60 messages per day. Limits reset at midnight.',
      },
      {
        q: 'What can the AI assistant help with?',
        a: 'The AI assistant is great for app navigation (exactly where to find any feature), TTB compliance questions (excise tax rates, COLA requirements, Brewer\'s Notice, filing deadlines), brewery operations concepts (fermentation, packaging yields, cost per pint calculations), grant funding (which programs to apply for and how to find them in the app), and advocacy strategy (how to use the playbook templates, coalition building, legislative engagement). It knows the app inside and out and can walk you through any workflow step by step.',
      },
      {
        q: 'What can the AI assistant NOT do?',
        a: 'The AI assistant cannot access your actual brewery data — it does not know your specific recipes, fermentation readings, or distribution records. For those questions you need to look at your own data in the app. It also cannot provide legal advice or act as your attorney — for specific legal questions always consult a licensed alcohol beverage attorney. For specific tax advice consult a CPA. The assistant is a knowledgeable guide, not a licensed professional.',
      },
      {
        q: 'What do I do if I hit my daily message limit?',
        a: 'Your daily message limit resets at midnight in your local time zone. If you regularly hit your limit and need more messages consider upgrading to a higher tier — Operations subscribers get 40 messages per day and Full Suite subscribers get 60 messages per day. In the meantime the Help & FAQ section covers the most common questions and the search function finds answers quickly.',
      },
      {
        q: 'How do I start a new conversation?',
        a: 'Click the trash icon in the top right corner of the AI chat panel to clear the conversation and start fresh. Your conversation history is saved locally in your browser so it persists when you navigate between pages, but clearing it gives you a clean slate. Note that conversation history does not sync across different devices or browsers.',
      },
    ],
  },
  // ── Operations tool deep-dive categories ─────────────────────────────────────
  {
    id: 'batch-profitability',
    label: 'Batch Profitability Reports',
    items: [
      {
        q: 'What is the Batch Profitability Report?',
        a: 'The Batch Profitability Report connects data from your entire brewing workflow into one report per batch — brew day actuals, fermentation yield, packaging output, and distribution sales. It compares your planned profitability from the recipe cost calculator against what actually happened, so you can see exactly where margin was gained or lost on every batch.',
      },
      {
        q: 'Where do I find the Batch Profitability Report?',
        a: 'Go to the sidebar and look for Batch Profitability Reports in the Operations section. The report lists all completed batches with a summary view — planned vs actual cost per pint, total revenue, and margin. Click any batch to see the full line-by-line breakdown across brew day, fermentation, packaging, and distribution.',
      },
      {
        q: 'Do I need to enter extra data to use the Batch Profitability Report?',
        a: 'No extra data entry is needed. The report pulls automatically from data you have already logged across the app — recipe costs from the Recipe Builder, actual volumes from the Brew Day log, fermentation yield from the Fermentation Tracker, packaging units from the Packaging module, and sale prices from Distribution. If you follow the full Operations workflow, the report builds itself.',
      },
    ],
  },
  {
    id: 'excise-tax-calculator',
    label: 'TTB Excise Tax Calculator',
    items: [
      {
        q: 'Where is the Excise Tax Calculator?',
        a: 'The Excise Tax Calculator is inside the TTB Tracker module. Go to TTB Tracker in the Essentials section of the sidebar, then click the Excise Tax Calculator tab. Enter your barrels removed for the period and the calculator shows your estimated federal tax liability using the current verified rate.',
      },
      {
        q: 'What excise tax rate does the calculator use?',
        a: 'The calculator is pre-filled with the current federal reduced rate for domestic craft breweries: $3.50 per barrel for the first 60,000 barrels removed for consumption per calendar year. This rate applies to breweries producing under 2 million barrels annually. The standard rate of $16 per barrel applies above 60,000 barrels. You can edit the rate field if rates change — always verify the current rate at TTB.gov before filing.',
      },
      {
        q: 'Does the Excise Tax Calculator file my return for me?',
        a: "No. The calculator is a planning and estimation tool only — it does not file or submit anything to the TTB. All actual filings and payments must be made directly through the TTB's pay.gov system. The calculator helps you know what you owe before filing so there are no surprises. Always work with your accountant or CPA for final filing.",
      },
    ],
  },
  {
    id: 'water-chemistry',
    label: 'Water Chemistry Calculator',
    items: [
      {
        q: 'Where is the Water Chemistry Calculator?',
        a: 'The Water Chemistry Calculator is built into each recipe. Open any recipe in the Recipes module and scroll down to the Water Chemistry section — click Expand to open it. Your source water profile (the mineral levels of your brewing water) is entered once in Account Settings and reused automatically across all recipes.',
      },
      {
        q: 'How do I set up my source water profile?',
        a: "Go to Account Settings in the sidebar and look for the Source Water Profile section under Brewery Profile. Enter your water's calcium, magnesium, sodium, chloride, sulfate, and bicarbonate levels in mg/L. You can find these values in your municipal water quality report (usually on your city's website) or from a water test kit. These values carry over into every recipe automatically.",
      },
      {
        q: 'How does the Water Chemistry Calculator work?',
        a: 'Select a target style profile — Pilsner, Pale Ale, IPA, Stout, or others — and the calculator shows your source water levels alongside the target mineral ranges for that style. It then calculates the specific mineral additions needed (gypsum, calcium chloride, Epsom salt, baking soda, chalk) in grams scaled to your recipe batch size. The additions are saved with the recipe for future reference.',
      },
    ],
  },
  {
    id: 'keg-fleet',
    label: 'Keg Fleet Tracker',
    items: [
      {
        q: 'What is the Keg Fleet Tracker?',
        a: 'The Keg Fleet Tracker is a tab inside the Distribution module that helps you manage your owned keg inventory using pool-based tracking — you track kegs by type and size, not by individual serial numbers. It shows how many kegs you own per type, how many are currently out at accounts, how many are back at the brewery, and your total deposit balance outstanding across all accounts.',
      },
      {
        q: 'How do I add my kegs to the Fleet Tracker?',
        a: 'Go to Distribution in the sidebar and click the Keg Fleet tab. Click Add Keg Type to enter each keg type you own — for example Half Barrel (15.5 gal) or Sixth Barrel (5.16 gal). Enter how many you own of that type and the deposit amount you charge per keg. The tracker automatically calculates kegs currently out by matching your active distribution delivery records.',
      },
      {
        q: 'How are deposits tracked in the Keg Fleet?',
        a: 'The Keg Fleet tab includes a Deposit Ledger where you can log deposits held from each wholesale account. Enter the account name, keg type, number of kegs they currently hold, and the deposit per keg — the total deposit held calculates automatically. Update or remove the record when kegs are returned and deposits refunded. The summary cards at the top always show your running total deposits outstanding.',
      },
    ],
  },
  {
    id: 'compliance-alerts',
    label: 'Compliance Email Alerts',
    items: [
      {
        q: 'What are Compliance Email Alerts?',
        a: 'Compliance Email Alerts are automated email reminders that notify you before compliance deadlines come due. You can set an alert on any deadline in the Compliance Calendar — choose how many days in advance you want the reminder, such as 30 days before a license renewal or 14 days before a TTB filing. Alerts are sent to the email address on your account.',
      },
      {
        q: 'How do I set up a compliance deadline alert?',
        a: 'Open any deadline on the Compliance Calendar by clicking it. In the detail panel look for the Alert Me option. Turn it on and select how far in advance you want to be notified. You can set multiple reminders for the same deadline — for example 60 days out and again 14 days out. Alerts are saved automatically and you can turn them off at any time by returning to the deadline detail.',
      },
      {
        q: 'Can I set alerts for grant application deadlines too?',
        a: 'Yes. When you bookmark a grant in the Grant Finder that has a posted application deadline, the Alert Me button appears on the bookmark. Click it to receive an email reminder 30 days before the deadline. This is especially useful for competitive grant programs where early preparation matters — you will not miss a window because it slipped off your radar.',
      },
    ],
  },
  // ── Universal categories ──────────────────────────────────────────────────────
  {
    id: 'account-billing',
    label: 'Account & Billing',
    items: [
      {
        q: 'How do I upgrade after my trial ends?',
        a: 'When your trial ends you will see an upgrade prompt when you log in. Click the prompt to go to the pricing page where you can choose between the monthly plan at $9.99/month (Essentials) or $14.99/month (Operations), or save with the annual plan at $99.99/year or $149.99/year. Click Subscribe and you will be taken to a secure Stripe checkout page to enter your payment information. After completing payment you will immediately regain full access.',
      },
      {
        q: 'Can I switch between monthly and annual plans?',
        a: 'Yes. Go to Account Settings and click Manage Subscription. From there you can switch between monthly and annual billing. Switching to annual takes effect at your next billing date and you will receive a prorated credit for any remaining time on your monthly plan.',
      },
      {
        q: 'What happens to my data if I cancel my subscription?',
        a: 'Your data is never automatically deleted. When you cancel your subscription your account remains active with full access until the end of your current billing period. After that your account moves to read-only mode for 30 days — you can still log in, view everything, and download your documents and data. After 30 days your account remains in read-only mode indefinitely. If you resubscribe at any time all your data is immediately restored to full active access exactly where you left off.',
      },
      {
        q: 'How do I cancel my subscription?',
        a: 'Go to Account Settings in the sidebar and find the Subscription section. Click Cancel Subscription and confirm. Your access continues until the end of your current billing period. You will not be charged again after cancellation.',
      },
      {
        q: 'Can I get a refund?',
        a: 'We do not offer refunds for partial billing periods. If you cancel your subscription you retain access until the end of the period you paid for. If you experience a technical issue that prevented you from using the app please contact us at hello@thecraftbeerbrief.com and we will review your situation on a case by case basis.',
      },
      {
        q: 'How do I update my payment method?',
        a: 'Go to Account Settings and click Manage Subscription. You will be taken to the Stripe customer portal where you can update your credit card or payment method securely. Changes take effect immediately.',
      },
      {
        q: 'What happens if my payment fails?',
        a: 'If a payment fails you will receive an email notification at the email address associated with your account. Your access continues for a grace period while the payment is retried. If the payment cannot be processed after retries your account will be paused. Update your payment method in Account Settings to restore access immediately.',
      },
    ],
  },
  {
    id: 'technical',
    label: 'Technical',
    items: [
      {
        q: 'Does this app work on my phone?',
        a: 'Yes. The app is fully responsive and designed to work on any device — phone, tablet, or desktop. The sidebar collapses to a menu on smaller screens and all forms and tables are optimized for mobile use. No separate app download is required — just open your browser and go to craftbeerbrief-essentials.vercel.app.',
      },
      {
        q: 'Can multiple staff members use the same account?',
        a: 'Yes. One subscription covers your entire brewery team. You can invite as many staff members as you need through Account Settings. Each person gets their own login but they all share the same brewery data and subscription. There is no per-seat pricing.',
      },
      {
        q: 'How do I export my compliance data?',
        a: 'Each module has an export option. On the Compliance Calendar page click the Export button to download your deadlines as a CSV file. The TTB Tracker has a CSV export for your payment log. The Grant Finder lets you export your bookmarked grants. For documents use the Download button on each individual file.',
      },
      {
        q: 'I found a bug or something is not working — how do I report it?',
        a: 'Please email us at hello@thecraftbeerbrief.com with a description of what happened, what page you were on, and what you expected to happen versus what actually happened. Screenshots are helpful if you can include them. We take bug reports seriously and aim to respond within 24 hours.',
      },
      {
        q: 'How do I contact support?',
        a: 'Email us at hello@thecraftbeerbrief.com for any questions, feedback, or support needs. We are a small team and aim to respond within 24 business hours. For urgent billing issues you can also manage your subscription directly through the Stripe customer portal accessible from Account Settings.',
      },
    ],
  },
]

// ── Accordion item ────────────────────────────────────────────────────────────

function AccordionItem({ question, answer, isOpen, onToggle, categoryLabel }) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start justify-between gap-3 py-3.5 px-4 hover:bg-gray-50 transition-colors rounded-lg"
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-navy leading-snug block">{question}</span>
          {categoryLabel && (
            <span className="mt-1.5 inline-block text-[10px] font-semibold text-amber bg-amber/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
              {categoryLabel}
            </span>
          )}
        </div>
        <span
          className="flex-shrink-0 text-gray-400 text-xl leading-none mt-0.5 select-none"
          style={{ transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease', display: 'inline-block' }}
        >
          +
        </span>
      </button>

      {/* CSS grid trick for smooth height animation with no JS measurement */}
      <div className={`faq-accordion-body ${isOpen ? 'faq-accordion-body--open' : ''}`}>
        <div>
          <div className="px-4 pb-4">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-sm text-gray-600 leading-relaxed">{answer}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [query, setQuery] = useState('')
  // Per-category open state: { categoryId: openIdx | null }
  const [openMap, setOpenMap] = useState({})
  // Search results open state: tracks open question text keys (allows multiple open)
  const [openSearchKeys, setOpenSearchKeys] = useState(new Set())

  const isSearching = query.trim().length > 0

  // Reset search open state whenever the query changes
  useEffect(() => {
    setOpenSearchKeys(new Set())
  }, [query])

  // Filtered flat results used in search mode
  const searchResults = useMemo(() => {
    if (!isSearching) return []
    const q = query.trim().toLowerCase()
    return CATEGORIES.flatMap((cat) =>
      cat.items
        .filter((item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q))
        .map((item) => ({ ...item, categoryLabel: cat.label }))
    )
  }, [query, isSearching])

  function toggleCategoryItem(categoryId, idx) {
    setOpenMap((prev) => ({
      ...prev,
      [categoryId]: prev[categoryId] === idx ? null : idx,
    }))
  }

  function toggleSearchItem(key) {
    setOpenSearchKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="max-w-[900px] mx-auto pb-10">
      {/* Inject accordion animation styles once */}
      <style>{`
        .faq-accordion-body {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.2s ease;
        }
        .faq-accordion-body--open {
          grid-template-rows: 1fr;
        }
        .faq-accordion-body > div {
          overflow: hidden;
        }
      `}</style>

      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-navy">Help & FAQ</h2>
        <p className="text-sm text-gray-500 mt-1">
          Answers to common questions about using The Craft Beer Brief Essentials.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search for answers..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white shadow-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Result count shown while searching */}
      {isSearching && (
        <p className="text-xs text-gray-500 mb-4">
          Showing <span className="font-semibold text-navy">{searchResults.length}</span>{' '}
          {searchResults.length === 1 ? 'result' : 'results'}
          {searchResults.length === 0 && ' — try different keywords'}
        </p>
      )}

      {/* ── Search results (flat list) ── */}
      {isSearching ? (
        searchResults.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200">
            {searchResults.map((item) => (
              <AccordionItem
                key={item.q}
                question={item.q}
                answer={item.a}
                categoryLabel={item.categoryLabel}
                isOpen={openSearchKeys.has(item.q)}
                onToggle={() => toggleSearchItem(item.q)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center">
            <p className="text-3xl mb-3">🔍</p>
            <p className="text-sm font-medium text-navy">No results found</p>
            <p className="text-xs text-gray-500 mt-1">
              Try different keywords or browse the categories below.
            </p>
            <button
              onClick={() => setQuery('')}
              className="mt-4 text-xs text-amber hover:underline"
            >
              Clear search
            </button>
          </div>
        )
      ) : (
        /* ── Category accordion sections ── */
        <div className="space-y-4">
          {CATEGORIES.map((cat) => (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-200">
              {/* Category header */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
                <h3 className="font-bold text-navy text-sm">{cat.label}</h3>
                <span className="text-[11px] font-semibold text-amber bg-amber/10 px-2 py-0.5 rounded-full">
                  {cat.items.length}
                </span>
              </div>

              {/* Questions */}
              {cat.items.map((item, idx) => (
                <AccordionItem
                  key={item.q}
                  question={item.q}
                  answer={item.a}
                  isOpen={openMap[cat.id] === idx}
                  onToggle={() => toggleCategoryItem(cat.id, idx)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Contact support card */}
      <div className="mt-8 bg-white rounded-xl border-2 border-amber/40 px-6 py-8 text-center">
        <p className="text-base font-bold text-navy mb-1">Still have questions?</p>
        <p className="text-sm text-gray-500 mb-5">We are here to help.</p>
        <a
          href="mailto:hello@thecraftbeerbrief.com"
          className="inline-block bg-amber hover:bg-amber-dark text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
        >
          Email Support
        </a>
        <p className="text-xs text-gray-400 mt-4">
          hello@thecraftbeerbrief.com &middot; We aim to respond within 24 business hours
        </p>
      </div>
    </div>
  )
}
