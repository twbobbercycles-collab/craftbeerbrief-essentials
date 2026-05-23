// usePersistedTab — persists active tab selection to localStorage
// Use this instead of useState for ALL tab state in the app
import { useState, useEffect } from 'react'

export function usePersistedTab(storageKey, defaultTab) {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored || defaultTab
    } catch {
      return defaultTab
    }
  })

  useEffect(() => {
    console.log(`[usePersistedTab] Restored tab: ${storageKey} = ${activeTab}`)
  }, [])

  const setTab = (tab) => {
    setActiveTab(tab)
    try {
      localStorage.setItem(storageKey, tab)
    } catch {}
  }

  return [activeTab, setTab]
}
