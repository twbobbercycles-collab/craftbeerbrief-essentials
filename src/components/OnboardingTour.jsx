// OnboardingTour v2.0 — auto-scroll with ready state
/**
 * OnboardingTour — a 20-step tooltip walkthrough shown once to new users.
 * Renders into document.body via a portal so it overlays all app content.
 * The caller sets localStorage 'onboarding_tour_completed' via onComplete().
 * Steps follow the sidebar top-to-bottom: welcome → main nav → ops section → ops nav → finale.
 */
import { useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

const STEPS = [
  // ── Welcome modal (no target — centered overlay) ──────────────────────────
  {
    target: null,
    title: 'Welcome to The Craft Beer Brief Essentials',
    body: "Let us show you around. This quick tour walks through every tool in the sidebar so you know exactly where to go from day one.",
  },

  // ── Main nav — top to bottom ──────────────────────────────────────────────
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
    target: 'a[href="/documents"]',
    placement: 'right',
    title: 'Documents',
    body: "Store and organize all your compliance documents with expiration alerts so nothing slips through the cracks.",
  },
  {
    target: 'a[href="/staff"]',
    placement: 'right',
    title: 'Staff & Certs',
    body: "Track staff certifications, alcohol service training, food handler cards, and renewal dates for your entire team.",
  },
  {
    target: 'a[href="/insurance"]',
    placement: 'right',
    title: 'Insurance',
    body: "Track all your insurance policies, coverage amounts, agent contacts, and renewal dates in one place.",
  },
  {
    target: 'a[href="/permits"]',
    placement: 'right',
    title: 'Local Permits',
    body: "Track municipal permits, entertainment licenses, and zoning compliance for your taproom and brewery.",
  },
  {
    target: 'a[href="/ttb"]',
    placement: 'right',
    title: 'TTB Tracker',
    body: "Track TTB filing deadlines, excise tax payments, COLA approvals, and Brewer's Report submissions.",
  },
  {
    target: 'a[href="/grants"]',
    placement: 'right',
    title: 'Grant Finder',
    body: "Search 90+ verified grant and loan programs curated specifically for craft breweries. Bookmark grants and set deadline alerts.",
  },

  // ── Operations section intro (no target — centered overlay) ───────────────
  {
    target: null,
    title: 'Operations Tools',
    body: "Your 14-day Operations trial gives you full access to all these brewery management tools — included at no charge during your trial.",
  },

  // ── Operations nav — top to bottom ───────────────────────────────────────
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
    body: "Build recipes, calculate true cost per pint, and track ingredients directly from your inventory.",
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
    body: "Track wholesale accounts, assign package splits, record deliveries, and monitor keg returns.",
  },
  {
    target: 'a[href="/taproom"]',
    placement: 'right',
    title: 'Taproom',
    body: "See what is on tap, track margin per handle, and compare taproom profitability across all active beers.",
  },

  // ── Bottom nav ────────────────────────────────────────────────────────────
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

  // ── Finale modal (no target — centered overlay) ───────────────────────────
  {
    target: null,
    title: 'You Are All Set',
    body: "You are ready to run a more organized, profitable brewery. Your 14-day Operations trial is active — explore every module and let us know what you think.",
  },
]

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

// ── Single card component handles both centered modal and positioned tooltip ──
function TourCard({ step, stepIdx, total, isFirst, isLast, pos, centered, onNext, onBack, onSkip }) {
  const card = (
    <div
      className="tour-fade"
      style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', padding: '20px 20px 18px', width: '100%', maxWidth: TW, position: 'relative' }}
    >
      {/* Arrow pointing back toward the highlighted element */}
      {!centered && pos?.arrow && <div style={ARROW_STYLES[pos.arrow]} />}

      {/* Step counter — hidden on welcome modal and final modal */}
      {!isFirst && !isLast && (
        <p style={{ position: 'absolute', top: 14, right: 14, color: '#9ca3af', fontSize: 11, margin: 0 }}>
          {stepIdx + 1} of {total}
        </p>
      )}

      <h3 style={{ color: '#1A2744', fontSize: (isFirst || isLast) ? 17 : 15, fontWeight: 'bold', marginBottom: 10, paddingRight: (!isFirst && !isLast) ? 40 : 0, lineHeight: 1.4, margin: '0 0 10px' }}>
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

  // Centered — fills the overlay and flex-centers the card
  if (centered) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 10001 }}>
        {card}
      </div>
    )
  }

  // Positioned — fixed at the computed coordinates
  return (
    <div style={{ position: 'fixed', left: pos.left, top: pos.top, width: TW, zIndex: 10001 }}>
      {card}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function OnboardingTour({ onComplete }) {
  const [stepIdx,      setStepIdx]      = useState(0)
  const [rect,         setRect]         = useState(null)
  const [pos,          setPos]          = useState(null)
  const [mobile,       setMobile]       = useState(false)
  // readyForStep tracks which step has finished scrolling into view.
  // Using a number instead of a boolean makes it immune to stale state: on the
  // first render after stepIdx changes, readyForStep still holds the old step index,
  // so ready===false immediately — no flash of the old position on the new step.
  const [readyForStep, setReadyForStep] = useState(-1)
  const ready = readyForStep === stepIdx

  const step    = STEPS[stepIdx]
  const isFirst = stepIdx === 0
  const isLast  = stepIdx === STEPS.length - 1
  // Show as centered modal until scroll completes so the card is always visible immediately
  const centered = isFirst || mobile || !pos || !ready

  // Track viewport width for mobile vs desktop layout
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // When advancing to a new step: expand sidebar sections if needed, scroll the target
  // into view, wait for the animation, then mark this step ready so the highlight renders.
  useEffect(() => {
    setReadyForStep(-1)
    setRect(null)
    setPos(null)

    // Step 0 = welcome modal — ensure Essentials is expanded for steps 1-8
    if (stepIdx === 0) {
      window.dispatchEvent(new CustomEvent('tour-expand-essentials'))
    }
    // Step 9 = Operations section intro — expand Operations so nav items are in the
    // DOM and scrollable for steps 10-16
    if (stepIdx === 9) {
      window.dispatchEvent(new CustomEvent('tour-expand-ops'))
    }

    if (!step.target) {
      // Centered modal steps need no scroll — mark ready immediately
      setReadyForStep(stepIdx)
      return
    }

    const el = document.querySelector(step.target)
    if (!el) {
      // Target not found — show card centered so tour never gets stuck
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

      {/* Semi-transparent backdrop — blocks clicks on the page behind */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.52)' }} />

      {/* Amber highlight ring — only rendered after scroll animation completes */}
      {ready && rect && !mobile && (
        <div style={{
          position:     'fixed',
          top:          rect.top    - 4,
          left:         rect.left   - 4,
          width:        rect.width  + 8,
          height:       rect.height + 8,
          borderRadius: 8,
          outline:      '2px solid #C8871A',
          boxShadow:    '0 0 0 5px rgba(200,135,26,0.28)',
          pointerEvents: 'none',
          zIndex:       10000,
        }} />
      )}

      {/* Tooltip / modal — hidden while scrolling to prevent centered-modal flash */}
      {ready && (
        <TourCard
          key={stepIdx}
          step={step}
          stepIdx={stepIdx}
          total={STEPS.length}
          isFirst={isFirst}
          isLast={isLast}
          pos={pos}
          centered={centered}
          onNext={next}
          onBack={back}
          onSkip={onComplete}
        />
      )}
    </div>,
    document.body
  )
}
