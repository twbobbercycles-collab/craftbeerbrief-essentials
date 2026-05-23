// RULE: ALL modals in this app must use this component. Never create a modal without ModalShell and useModalDraft.

/**
 * ModalShell — shared wrapper for all add/edit modals.
 *
 * Handles:
 * 1. Tab-switch guard — ignores overlay clicks within 300ms of tab returning
 * 2. Dirty check — X button, Escape, and overlay show an inline discard prompt
 *    when isDirty is true; Cancel buttons bypass this by calling onClose directly
 * 3. Discard confirmation — "Keep Editing" / "Discard Changes" inline panel
 * 4. Draft-restored banner — amber notice when a saved draft was reloaded
 *
 * The sticky header (banners + title + close button) never scrolls away.
 * The children (form content) scroll independently beneath it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export default function ModalShell({
  isOpen,
  onClose,
  isDirty = false,
  title,
  draftRestored = false,
  onDismissDraft,
  maxWidth = 'max-w-lg',
  children,
}) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const lastHiddenAt = useRef(0)

  // Record timestamp whenever the tab hides so overlay clicks on return are ignored
  useEffect(() => {
    if (!isOpen) return
    function onVisibilityChange() {
      if (document.hidden) lastHiddenAt.current = Date.now()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [isOpen])

  // Reset the discard panel whenever the modal opens or closes
  useEffect(() => {
    if (!isOpen) setShowDiscardConfirm(false)
  }, [isOpen])

  // If dirty: show the inline confirm; otherwise close immediately
  const tryClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }, [isDirty, onClose])

  // Escape key respects the dirty check (same as the X button)
  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') tryClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, tryClose])

  // Overlay click is ignored if: tab just returned (<300ms), or discard panel is visible
  function handleOverlayClick() {
    if (Date.now() - lastHiddenAt.current < 300) return
    if (showDiscardConfirm) return
    tryClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
      onClick={handleOverlayClick}
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${maxWidth} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header — stays visible when form content scrolls */}
        <div className="flex-shrink-0 px-6 pt-6 space-y-3">

          {/* Amber banner when a draft was restored from sessionStorage */}
          {draftRestored && (
            <div className="bg-amber/10 border border-amber rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-amber-dark font-medium">
                📝 Draft restored from your previous session.
              </p>
              <button
                type="button"
                onClick={onDismissDraft}
                className="text-xs text-amber-dark hover:text-amber font-medium underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Inline discard-confirmation panel */}
          {showDiscardConfirm && (
            <div className="bg-red-50 border border-danger rounded-lg px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-danger">Discard unsaved changes?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 border border-gray-300 text-gray-600 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-danger text-white font-semibold py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          )}

          {/* Modal title and close button */}
          <div className="flex items-center justify-between pb-3">
            <h3 className="text-lg font-bold text-navy">{title}</h3>
            <button
              type="button"
              onClick={tryClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable form content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}
