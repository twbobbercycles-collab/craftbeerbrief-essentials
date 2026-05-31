// OnboardingTour v2.2 — tier-aware steps, Full Suite section support
/**
 * OnboardingTour — a tooltip walkthrough shown once to new users.
 * Renders into document.body via a portal so it overlays all app content.
 * The caller sets localStorage 'onboarding_tour_completed' via onComplete().
 * Steps follow the sidebar top-to-bottom: welcome → main nav → ops section → ops nav
 * → (full suite nav if hasFullSuite) → help/account → finale.
 *
 * Rendering is split into two mutually exclusive paths keyed on step.target:
 *   null target  → centered modal (welcome, ops intro, finale)
 *   has target   → positioned tooltip next to the highlighted sidebar item
 * This prevents the welcome modal from bleeding through during step transitions.
 */
import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'

const TW = 320 // tooltip width in px

// Computes {left, top, arrow} for a positioned tooltip given the target's bounding rect.
// Falls back to 'below' placement if 'right' would overflow the viewport.
function computePos(rect, placement) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left, top, arrow

  if (placement === 'right') {
    left  = rect.right + 16
    top   = rect.top + rect.height / 2 - 120
    arrow = 'left'
    // Flip to below if tooltip overflows the right edge
    if (left + TW > vw - 8) {
      left  = rect.left + rect.width / 2 - TW / 2
      top   = rect.bottom + 16
      arrow = 'top'
    }
  } else {
    left  = rect.left + rect.width / 2 - TW / 2
    top   = rect.bottom + 16
    arrow = 'top'
  }

  return {
    left:  Math.max(8, Math.min(left, vw - TW - 8)),
    top:   Math.max(8, Math.min(top,  vh - 260 - 8)),
    arrow,
  }
}

// ── Shared inline button styles ───────────────────────────────────────────────
const BTN = {
  primary: { background: '#C8871A', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  back:    { background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer' },
  skip:    { background: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer' },
}

// CSS triangle shapes for the tooltip arrow
const ARROW_STYLES = {
  left: { position: 'absolute', left: -9, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderRight: '9px solid #fff' },
  top:  { position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderBottom: '9px solid #fff' },
}

// ── Inner card content — used by both centered and positioned renders ──────────
function TourCardInner({ step, stepIdx, total, isFirst, isLast, arrow, onNext, onBack, onSkip }) {
  return (
    <div
      className="tour-fade"
      style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', padding: '20px 20px 18px', width: '100%', maxWidth: TW, position: 'relative' }}
    >
      {/* Arrow pointing back toward the highlighted element — only for positioned tooltips */}
      {arrow && <div style={ARROW_STYLES[arrow]} />}

      {/* Step counter — hidden on welcome modal and final modal */}
      {!isFirst && !isLast && (
        <p style={{ position: 'absolute', top: 14, right: 14, color: '#9ca3af', fontSize: 11, margin: 0 }}>
          {stepIdx + 1} of {total}
        </p>
      )}

      <h3 style={{ color: '#1A2744', fontSize: (isFirst || isLast) ? 17 : 15, fontWeight: 'bold', lineHeight: 1.4, margin: '0 0 10px', paddingRight: (!isFirst && !isLast) ? 40 : 0 }}>
        {step.title}
      </h3>
      <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.7, margin: '0 0 18px' }}>
        {step.body}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: (isFirst || isLast) ? 'center' : 'space-between', gap: 8 }}>
        {isFirst ? (
          <>
            <button style={BTN.skip} onClick={onSkip}>Skip Tour</button>
            <button style={BTN.primary} onClick={onNext}>Start Tour →</button>
          </>
        ) : isLast ? (
          <button style={BTN.primary} onClick={onNext}>Go To Dashboard</button>
        ) : (
          <>
            <button style={BTN.back} onClick={onBack}>← Back</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={BTN.skip} onClick={onSkip}>Skip</button>
              <button style={BTN.primary} onClick={onNext}>Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function OnboardingTour({ onComplete }) {
  const { hasAccess, isFullSuitePaid, profile } = useAuth()
  const hasFullSuite  = hasAccess('full_suite')
  const fullSuitePaid = isFullSuitePaid()

  const STEPS = useMemo(() => {
    // ── Steps 0-16: welcome, main nav, ops intro, ops nav ────────────────────
    const baseStepsStart = [
      // Welcome modal (no target — centered overlay)
      {
        target: null,
        title: 'Welcome to The Craft Beer Brief Essentials',
        body: "Let us show you around. This quick tour walks through every tool in the sidebar so you know exactly where to go from day one.",
      },

      // Main nav — top to bottom
      {
        target: 'a[href="/dashboard"]',
        placement: 'right',
        title: 'Dashboard',
        body: "Your brewery command center. See upcoming deadlines, active fermentations, and key metrics at a glance.",
      },
      {
        target: 'a[href="/compliance"]',
        placement: 'right',
        title: 'Compliance Calendar',
        body: "Never miss a compliance deadline. All 50 states plus DC are pre-populated with color-coded deadlines by category.",
      },
      {
        target: 'a[href="/records"]',
        placement: 'right',
        title: 'Brewery Records',
        body: "Store and track all your compliance documents, insurance policies, and local permits in one place — with expiration alerts so nothing slips through the cracks.",
      },
      {
        target: 'a[href="/staff"]',
        placement: 'right',
        title: 'Staff & Certs',
        body: "Track staff certifications, alcohol service training, food handler cards, and renewal dates for your entire team.",
      },
      {
        target: 'a[href="/ttb"]',
        placement: 'right',
        title: 'TTB Tracker',
        body: "Track TTB filing deadlines, excise tax payments, COLA approvals, and Brewer's Report submissions. Includes a built-in Excise Tax Calculator with verified federal rates — $3.50/bbl on your first 60,000 barrels.",
      },
      {
        target: 'a[href="/grants"]',
        placement: 'right',
        title: 'Grant Finder',
        body: "Search 90+ verified grant and loan programs curated specifically for craft breweries. Bookmark grants and set deadline alerts.",
      },

      // Operations section intro (no target — centered overlay)
      {
        target: null,
        title: 'Operations Tools',
        body: hasFullSuite
          ? "Your subscription includes 7 Operations modules — Inventory, Recipes, Brew Day, Fermentation, Packaging, Distribution, and Taproom — plus Batch Profitability Reports, Water Chemistry tools, and Keg Fleet tracking. After Operations we will cover your Full Suite tools."
          : "Your Operations subscription includes 7 brewery management modules plus Batch Profitability Reports, an Excise Tax Calculator, Water Chemistry tools, and Keg Fleet tracking. Let us walk you through everything.",
      },

      // Operations nav — top to bottom
      {
        target: 'a[href="/inventory"]',
        placement: 'right',
        title: 'Inventory',
        body: "Manage ingredient stock levels, create purchase orders, receive deliveries, and track supplier pricing over time.",
      },
      {
        target: 'a[href="/recipes"]',
        placement: 'right',
        title: 'Recipes',
        body: "Build recipes, calculate true cost per pint, and track ingredients from inventory. Includes a Water Chemistry Calculator to hit target mineral profiles for any beer style.",
      },
      {
        target: 'a[href="/brewday"]',
        placement: 'right',
        title: 'Brew Day',
        body: "Schedule brew days, log actual vs. planned numbers, and automatically deduct ingredients from inventory when complete.",
      },
      {
        target: 'a[href="/fermentation"]',
        placement: 'right',
        title: 'Fermentation',
        body: "Track active fermentations with a visual vessel dashboard, gravity logs, temperature charts, and stage history.",
      },
      {
        target: 'a[href="/packaging"]',
        placement: 'right',
        title: 'Packaging',
        body: "Log packaging runs, track yield loss, calculate profit impact, and record quality checks.",
      },
      {
        target: 'a[href="/distribution"]',
        placement: 'right',
        title: 'Distribution',
        body: "Track wholesale accounts, assign package splits, monitor taproom margins, and manage your keg fleet with pool-based tracking. No serial numbers required.",
      },
      {
        target: 'a[href="/taproom"]',
        placement: 'right',
        title: 'Taproom',
        body: "See what is on tap, track margin per handle, and compare taproom profitability across all active beers.",
      },
      {
        target: 'a[href="/reports/batch-profitability"]',
        placement: 'right',
        title: 'Batch Profitability Reports',
        body: "See planned vs actual profitability for every batch. Connects your brew day, fermentation, packaging, and distribution data into one report — no extra data entry needed.",
      },
    ]

    // ── Full Suite steps — only included when user has full_suite access ──────
    const fullSuiteSteps = hasFullSuite ? [
      // Full Suite section intro (no target — centered overlay)
      {
        target: null,
        title: 'Full Suite — Business Growth & Advocacy Tools',
        body: fullSuitePaid
          ? 'Your Full Suite subscription includes 7 additional modules for business development and legislative advocacy — on top of everything in Essentials and Operations.'
          : 'Your trial includes access to all Full Suite modules. Upgrade to Full Suite at $19.99/month to keep access after your trial ends.',
      },
      {
        target: 'a[href="/events"]',
        placement: 'right',
        title: 'Taproom Event Planner',
        body: 'Plan events, track attendance, and calculate true ROI for every event you host. See which event types generate the best return for your taproom.',
      },
      {
        target: 'a[href="/wholesale"]',
        placement: 'right',
        title: 'Wholesale Account Manager',
        body: 'Manage wholesale relationships and track account performance. Contact info, follow-ups, and order history pulled automatically from your Distribution data.',
      },
      {
        target: 'a[href="/training"]',
        placement: 'right',
        title: 'Staff Training & Development',
        body: 'Track training programs, assign staff, and monitor certification compliance. The compliance matrix shows who is current and who needs attention at a glance.',
      },
      {
        target: 'a[href="/benchmarking"]',
        placement: 'right',
        title: 'Taproom Revenue Benchmarking',
        body: 'Enter your monthly taproom metrics and compare against Brewers Association industry benchmarks. See where you are outperforming and where you have room to grow.',
      },
      {
        target: 'a[href="/analytics"]',
        placement: 'right',
        title: 'Analytics Dashboard',
        body: 'Visualize your brewery performance across all modules. Track revenue trends, production efficiency, and key metrics over time.',
      },
      {
        target: 'a[href="/legislative"]',
        placement: 'right',
        title: 'Legislative Tracker',
        body: 'Track state and federal bills that affect your brewery. Set A/B/C/D priorities, log advocacy actions, and connect LegiScan for automatic bill updates.',
      },
      {
        target: 'a[href="/playbook"]',
        placement: 'right',
        title: 'Regulation Playbook & Templates',
        body: fullSuitePaid
          ? 'Access the complete Legislative Playbook PDF and generate all 26 customized advocacy documents for your brewery.'
          : 'Generate the Brewery Tour Invitation and Economic Impact One-Pager templates on trial. Upgrade to Full Suite to unlock all 26 templates and the PDF playbook download.',
      },
    ] : []

    // ── Finale text varies by tier ────────────────────────────────────────────
    const finaleBody = hasFullSuite && fullSuitePaid
      ? "You are ready to run a smarter, more organized, more advocacy-ready brewery. Every tool is unlocked and waiting for you."
      : hasFullSuite && !fullSuitePaid
      ? "You are ready to explore. Your trial includes full access to all modules — with 2 free advocacy templates to try. No credit card required."
      : "You are ready to brew smarter. Explore every module and reach out if you need help. Your 14-day Operations trial is active."

    // ── AI assistant step — shown to all users (trial and paid) ─────────────
    // Body text adapts based on whether the user is a paid subscriber or on trial
    const aiAssistantStep = {
      target: null,
      title: '✨ Your AI Brewery Assistant',
      body: (hasAccess('full_suite') && fullSuitePaid)
        ? `Your paid subscription includes the Craft Brief AI Assistant. Look for the amber ✨ button in the bottom right corner of every page. Ask it anything — how to use the app, TTB compliance questions, brewery operations help, or advocacy guidance. You have ${
            profile?.subscription_tier === 'full_suite' ? '60'
            : profile?.subscription_tier === 'operations' ? '40'
            : '20'
          } messages per day included with your plan.`
        : 'The Craft Brief AI Assistant is included with all paid plans — Essentials, Operations, and Full Suite. Upgrade after your trial to unlock the amber ✨ button in the bottom right corner. Ask it anything about brewery operations, TTB compliance, app navigation, and more.',
    }

    // ── Bottom nav steps + finale ─────────────────────────────────────────────
    const newsStep = {
      target: 'a[href="/news"]',
      placement: 'right',
      title: 'Industry News',
      body: 'Stay current with the latest craft beer industry news, regulatory updates, and trends — curated daily for brewery owners.',
    }

    const adminStep = profile?.email === 'twbobbercycles@gmail.com' ? {
      target: 'a[href="/admin"]',
      placement: 'right',
      title: 'Admin Panel',
      body: 'Manage grant submissions, import data, and reset the demo account for live demos.',
    } : null

    const baseStepsEnd = [
      {
        target: 'a[href="/help"]',
        placement: 'right',
        title: 'Help & FAQ',
        body: "Find answers to common questions about compliance, TTB filing, grants, and using the app.",
      },
      {
        target: 'a[href="/account"]',
        placement: 'right',
        title: 'Account Settings',
        body: "Manage your brewery profile, subscription, and team members.",
      },
      {
        target: null,
        title: 'You Are All Set',
        body: finaleBody,
      },
    ]

    return [
      ...baseStepsStart,
      ...fullSuiteSteps,
      newsStep,
      ...baseStepsEnd.slice(0, -1),
      ...(adminStep ? [adminStep] : []),
      aiAssistantStep,
      baseStepsEnd[baseStepsEnd.length - 1],
    ]
  }, [hasFullSuite, fullSuitePaid, profile?.subscription_tier])

  const [stepIdx,      setStepIdx]      = useState(0)
  const [rect,         setRect]         = useState(null)
  const [pos,          setPos]          = useState(null)
  const [mobile,       setMobile]       = useState(false)
  // readyForStep tracks which step has finished scrolling into view.
  // Using a number avoids stale state: on the first render after stepIdx changes,
  // readyForStep still holds the old index, so ready===false immediately.
  const [readyForStep, setReadyForStep] = useState(-1)
  const ready = readyForStep === stepIdx

  const step    = STEPS[stepIdx]
  const isFirst = stepIdx === 0
  const isLast  = stepIdx === STEPS.length - 1

  // Whether this step is a centered modal — determined by step data, not runtime state.
  // This is the key fix: null-target steps ALWAYS render as centered modals,
  // targeted steps ALWAYS render as positioned tooltips. Never mixed.
  const isCenteredStep = step.target === null

  // Track viewport width for mobile vs desktop layout
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // When advancing to a new step: expand sidebar sections if needed, scroll the target
  // into view, wait for the animation, then mark this step ready so the card renders.
  useEffect(() => {
    setReadyForStep(-1)
    setRect(null)
    setPos(null)

    // Step 0 = welcome modal — ensure Essentials is expanded for steps 1-8
    if (stepIdx === 0) {
      window.dispatchEvent(new CustomEvent('tour-expand-essentials'))
    }
    // Step 7 = Operations section intro — expand Operations so nav items are in the
    // DOM and scrollable for subsequent steps
    if (stepIdx === 7) {
      window.dispatchEvent(new CustomEvent('tour-expand-ops'))
    }
    // First Full Suite step — expand the Full Suite sidebar section
    if (step.target === 'a[href="/events"]') {
      window.dispatchEvent(new CustomEvent('tour-expand-fullsuite'))
    }

    if (!step.target) {
      // Centered modal steps need no scroll — mark ready immediately
      setReadyForStep(stepIdx)
      return
    }

    const el = document.querySelector(step.target)
    if (!el) {
      // Target not found — mark ready so tour never gets stuck
      setReadyForStep(stepIdx)
      return
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setReadyForStep(stepIdx), 400)
    return () => clearTimeout(timer)
  }, [stepIdx])

  // Compute position only after this step is ready — element has finished scrolling into view
  useLayoutEffect(() => {
    if (readyForStep !== stepIdx || !step.target) { setRect(null); setPos(null); return }
    const el = document.querySelector(step.target)
    if (!el) { setRect(null); setPos(null); return }
    const r = el.getBoundingClientRect()
    setRect(r)
    setPos(mobile ? null : computePos(r, step.placement ?? 'right'))
  }, [stepIdx, mobile, readyForStep])

  function next() { isLast ? onComplete() : setStepIdx(i => i + 1) }
  function back() { setStepIdx(i => Math.max(0, i - 1)) }

  const cardProps = {
    step, stepIdx, total: STEPS.length, isFirst, isLast,
    onNext: next, onBack: back, onSkip: onComplete,
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>

      {/* Keyframe animation injected once — fade + subtle scale-in */}
      <style>{`
        @keyframes tour-fade {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1);    }
        }
        .tour-fade { animation: tour-fade 0.22s ease-out both; }
      `}</style>

      {/* Semi-transparent backdrop — always visible while tour is active */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.52)' }} />

      {/* ── PATH A: Centered modal — ONLY for null-target steps (welcome, ops intro, finale) ── */}
      {ready && isCenteredStep && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 10001 }}>
          <TourCardInner key={stepIdx} {...cardProps} arrow={null} />
        </div>
      )}

      {/* ── PATH B: Positioned tooltip — ONLY for targeted steps ── */}
      {ready && !isCenteredStep && (
        <>
          {/* Amber highlight ring around the sidebar item — desktop only */}
          {rect && pos && !mobile && (
            <div style={{
              position:      'fixed',
              top:           rect.top    - 4,
              left:          rect.left   - 4,
              width:         rect.width  + 8,
              height:        rect.height + 8,
              borderRadius:  8,
              outline:       '2px solid #C8871A',
              boxShadow:     '0 0 0 5px rgba(200,135,26,0.28)',
              pointerEvents: 'none',
              zIndex:        10000,
            }} />
          )}

          {/* Tooltip positioned next to the element on desktop */}
          {pos && !mobile && (
            <div style={{ position: 'fixed', left: pos.left, top: pos.top, width: TW, zIndex: 10001 }}>
              <TourCardInner key={stepIdx} {...cardProps} arrow={pos.arrow} />
            </div>
          )}

          {/* On mobile (or if element not found and pos is null): centered fallback */}
          {!pos && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 10001 }}>
              <TourCardInner key={stepIdx} {...cardProps} arrow={null} />
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  )
}
