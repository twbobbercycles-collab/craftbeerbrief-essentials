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
        a: 'Federal grants are automatically pulled from Simpler.Grants.gov — the official U.S. federal grants database — and updated daily. State and local grants are researched and added by The Craft Beer Brief team on a regular schedule. Community members can also submit grants they find using the Submit a Grant button, which are reviewed and added after verification.',
      },
      {
        q: 'How often is the grant database updated?',
        a: 'Federal grants are synced automatically every 24 hours from Grants.gov. State and local grants are reviewed and updated on a weekly basis by The Craft Beer Brief team. You can see when each grant listing was last updated in the expanded card details.',
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
  {
    id: 'account-billing',
    label: 'Account & Billing',
    items: [
      {
        q: 'How do I upgrade after my trial ends?',
        a: 'When your trial ends you will see an upgrade prompt when you log in. Click the prompt to go to the pricing page where you can choose between the monthly plan at $14.99/month or the annual plan at $149.99/year. Click Subscribe and you will be taken to a secure Stripe checkout page to enter your payment information. After completing payment you will immediately regain full access.',
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
