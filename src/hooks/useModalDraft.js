import { useState } from 'react'

// Persists an add-modal form to sessionStorage so a draft survives
// tab switches or accidental closes. Pass a unique storageKey per modal.
export function useModalDraft(storageKey) {
  const [draftRestored, setDraftRestored] = useState(false)

  // hasDraft is true if a draft exists in sessionStorage right now.
  // Initialized once on mount; updated whenever the draft is saved or cleared.
  const [hasDraft, setHasDraft] = useState(() => {
    try { return !!sessionStorage.getItem(storageKey) } catch { return false }
  })

  // Returns the saved draft (or null).
  // Pass showBanner=false when the user already knows about the draft (e.g. clicked
  // "Continue Draft" from the page-level notice) so the in-modal banner is skipped.
  function loadDraft(showBanner = true) {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (showBanner) setDraftRestored(true)
      return data
    } catch {
      return null
    }
  }

  function saveDraft(formState) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(formState))
      if (!hasDraft) setHasDraft(true)
    } catch {}
  }

  // Call on successful save or intentional discard
  function clearDraft() {
    sessionStorage.removeItem(storageKey)
    setDraftRestored(false)
    setHasDraft(false)
  }

  // Hides the in-modal amber banner without clearing the draft
  function dismissDraftBanner() {
    setDraftRestored(false)
  }

  return { loadDraft, saveDraft, clearDraft, draftRestored, dismissDraftBanner, hasDraft }
}
