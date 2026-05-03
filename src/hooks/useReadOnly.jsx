/**
 * useReadOnly — hook and tooltip wrapper for subscription-cancelled read-only mode.
 *
 * Returns:
 *   isReadOnly       — true when the user's subscription_status is 'cancelled'
 *   ReadOnlyTooltip  — wrapper component; receives isReadOnly as a prop.
 *                      Disables children + shows a hover tooltip when true.
 *                      Renders children unchanged (no extra DOM nodes) when false.
 *
 * Design note: ReadOnlyTooltip is a plain named export defined at module scope.
 * It does NOT call useAuth() internally — it receives isReadOnly as a prop from
 * the parent component via useReadOnly(). This keeps the hook/component boundary
 * clean and avoids context reads inside a deeply nested child render, which was
 * causing blank-screen errors in strict/concurrent mode.
 */
import { useAuth } from '../context/AuthContext'

// Tooltip arrow: a CSS triangle pointing down toward the disabled button
const ARROW_STYLE = {
  position: 'absolute',
  top: '100%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 0,
  height: 0,
  borderLeft: '5px solid transparent',
  borderRight: '5px solid transparent',
  borderTop: '5px solid #1A2744',
}

/**
 * ReadOnlyTooltip — wraps a button or interactive element.
 * When isReadOnly is true:  renders a <span> wrapper that disables pointer
 *   events, reduces opacity to 50%, and shows a tooltip on hover.
 * When isReadOnly is false: returns children with no wrapper at all, so page
 *   layout is completely unaffected.
 */
export function ReadOnlyTooltip({ children, isReadOnly }) {
  // Pass-through — no extra DOM nodes when the account has full access
  if (!isReadOnly) return <>{children}</>

  return (
    <span
      className="relative inline-block group"
      style={{ cursor: 'not-allowed' }}
    >
      {/* Prevent clicks from reaching the wrapped element */}
      <span style={{ display: 'inline-block', pointerEvents: 'none', opacity: 0.5 }}>
        {children}
      </span>

      {/* Tooltip box — appears above the element on hover */}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 invisible group-hover:visible z-50"
        style={{ whiteSpace: 'nowrap' }}
      >
        <span className="block bg-navy text-white text-xs font-medium rounded-lg px-3 py-1.5 shadow-lg">
          Resubscribe to make changes
        </span>
        {/* Downward-pointing arrow toward the disabled button */}
        <span style={ARROW_STYLE} />
      </span>
    </span>
  )
}

/**
 * useReadOnly — reads subscription status from auth context and returns:
 *   isReadOnly      — boolean flag for use in conditional logic
 *   ReadOnlyTooltip — the wrapper component, pre-imported for convenience
 *
 * Usage:
 *   const { isReadOnly, ReadOnlyTooltip } = useReadOnly()
 *   <ReadOnlyTooltip isReadOnly={isReadOnly}><button>...</button></ReadOnlyTooltip>
 */
export function useReadOnly() {
  const { profile } = useAuth()
  const isReadOnly = profile?.subscription_status === 'cancelled'

  // Temporary diagnostic log — remove once read-only mode is confirmed working
  console.log('[useReadOnly] subscription_status:', profile?.subscription_status, '| isReadOnly:', isReadOnly)

  return { isReadOnly, ReadOnlyTooltip }
}
