/**
 * OnboardingTour — a 10-step tooltip walkthrough shown once to new users.
 * Renders into document.body via a portal so it overlays all app content.
 * The caller sets localStorage 'onboarding_tour_completed' via onComplete().
 */
import { useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

const STEPS = [
  {
    target: null,
    title: 'Welcome to The Craft Beer Brief Essentials',
    body: "Let us show you around. This quick tour takes less than a minute and covers everything you need to get started.",
  },
  {
    target: '[data-tour="dashboard-heading"]',
    placement: 'below',
    title: 'Your Compliance Dashboard',
    body: "This is your home base. See upcoming deadlines, TTB filing status, open grants, and any alerts that need your attention — all in one place.",
  },
  {
    target: 'a[href="/grants"]',
    placement: 'right',
    title: 'Grant & Funding Finder',
    body: "Search 90+ verified funding programs curated specifically for craft breweries. Bookmark grants and set deadline alerts so you never miss an application window.",
  },
  {
    target: 'a[href="/ttb"]',
    placement: 'right',
    title: 'TTB Filing Tracker',
    body: "Track your federal excise tax obligations, log payments, and manage your COLA label submissions. Never miss a TTB deadline again.",
  },
  {
    target: 'a[href="/compliance"]',
    placement: 'right',
    title: 'Your Compliance Calendar',
    body: "Your personalized compliance deadlines are already loaded based on your state and license types. Review them, add custom deadlines, and mark them complete as you go.",
  },
  {
    target: 'a[href="/documents"]',
    placement: 'right',
    title: 'License Document Storage',
    body: "Upload and organize all your license and permit documents in one secure place. Get expiration alerts so renewals never sneak up on you.",
  },
  {
    target: 'a[href="/staff"]',
    placement: 'right',
    title: 'Staff & Certification Tracker',
    body: "Track alcohol service certifications, food handler cards, and other staff credentials. Get reminders before certifications expire to stay compliant and protect your brewery.",
  },
  {
    target: 'a[href="/insurance"]',
    placement: 'right',
    title: 'Insurance Policy Tracker',
    body: "Keep all your insurance policies organized in one place. Track renewal dates, coverage amounts, and agent contacts so you are never caught with a lapsed policy.",
  },
  {
    target: 'a[href="/permits"]',
    placement: 'right',
    title: 'Local Permit Tracker',
    body: "Track municipal permits, zoning compliance, entertainment licenses, and other local requirements that state licensing doesn't cover. Built for the permits breweries most often overlook.",
  },
  {
    target: null,
    title: 'You Are All Set',
    body: "Your brewery compliance hub is ready. Start by reviewing your personalized compliance deadlines or searching the grant finder for funding opportunities. The Craft Beer Brief team is always here if you need help.",
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
  const [stepIdx, setStepIdx]   = useState(0)
  const [rect,    setRect]      = useState(null)
  const [pos,     setPos]       = useState(null)
  const [mobile,  setMobile]    = useState(false)

  const step    = STEPS[stepIdx]
  const isFirst = stepIdx === 0
  const isLast  = stepIdx === STEPS.length - 1
  const centered = isFirst || mobile || !pos

  // Track viewport width for mobile vs desktop layout
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Find the target element and compute tooltip position whenever the step changes
  useLayoutEffect(() => {
    if (!step.target) { setRect(null); setPos(null); return }
    const el = document.querySelector(step.target)
    if (!el) { setRect(null); setPos(null); return }
    const r = el.getBoundingClientRect()
    setRect(r)
    setPos(mobile ? null : computePos(r, step.placement ?? 'right'))
  }, [stepIdx, mobile])

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

      {/* Amber highlight ring drawn over the target element */}
      {rect && !mobile && (
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

      {/* Tooltip / modal — key forces remount (and re-animation) on each step */}
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
    </div>,
    document.body
  )
}
