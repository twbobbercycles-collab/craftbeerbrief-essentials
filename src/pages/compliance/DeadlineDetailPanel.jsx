/**
 * DeadlineDetailPanel — slide-out panel that shows full detail for a selected deadline.
 * Handles inline editing, notes auto-save (2 s debounce), complete toggle,
 * Reset to Original (pre-populated deadlines), and Delete (custom deadlines).
 * On mobile the panel covers the full screen instead of sliding in from the right.
 */
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../services/supabase'
import {
  getDeadlineName, getDeadlineDescription, getDeadlineCategory,
  getDueDate, fmtDate, CATEGORY_COLORS, CUSTOM_COLOR, CATEGORIES,
} from './complianceUtils'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber'

export default function DeadlineDetailPanel({ deadline, documents, onClose, onUpdated, onDeleted }) {
  // Local form state — loaded from the deadline prop whenever the selected deadline changes
  const [name,       setName]       = useState('')
  const [category,   setCategory]   = useState('')
  const [dueDate,    setDueDate]     = useState('')
  const [notes,      setNotes]       = useState('')
  const [docId,      setDocId]       = useState('')
  const [isDirty,     setIsDirty]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState('')
  const [notesSaved,  setNotesSaved]  = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [tempName,    setTempName]    = useState('')
  const [nameSaved,   setNameSaved]   = useState(false)

  // Timer ref for the notes auto-save debounce
  const notesTimer      = useRef(null)
  // Tracks whether the user pressed Escape to cancel a name edit (prevents blur from saving)
  const nameEscapedRef  = useRef(false)
  // Snapshot of values when the panel last loaded/saved — used to detect dirty state
  const originalValues = useRef({})

  // Re-populate local state whenever a different deadline is opened
  useEffect(() => {
    if (!deadline) return
    const n   = getDeadlineName(deadline)
    const cat = getDeadlineCategory(deadline)
    const dd  = getDueDate(deadline) ?? ''
    const no  = deadline.notes ?? ''
    const doc = deadline.document_id ?? ''
    setName(n); setCategory(cat); setDueDate(dd)
    setNotes(no); setDocId(doc)
    setIsDirty(false); setSaveMsg(''); setNotesSaved(false)
    setEditingName(false); setTempName(''); setNameSaved(false)
    originalValues.current = { name: n, category: cat, dueDate: dd, notes: no, docId: doc }
  }, [deadline?.id])

  // Update dirty flag when editable fields change (notes and name are excluded — they auto-save)
  useEffect(() => {
    if (!deadline) return
    const o = originalValues.current
    setIsDirty(dueDate !== o.dueDate || category !== o.category || docId !== o.docId)
  }, [dueDate, category, docId])

  // Auto-save notes after 2 seconds of no typing
  useEffect(() => {
    if (!deadline) return
    if (notes === (originalValues.current.notes ?? '')) return
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await supabase.from('brewery_deadlines')
        .update({ notes: notes || null })
        .eq('id', deadline.id)
      originalValues.current = { ...originalValues.current, notes }
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
      onUpdated()
    }, 2000)
    return () => clearTimeout(notesTimer.current)
  }, [notes])

  // Prompt the user if they try to close with unsaved changes
  function handleClose() {
    if (isDirty) {
      if (!window.confirm('You have unsaved changes to this deadline. Save or discard before leaving?')) return
    }
    onClose()
  }

  // Save name, due date, category, and document link changes
  async function handleSave() {
    setSaving(true)
    const updates = {
      custom_date: dueDate || null,
      document_id: docId   || null,
    }
    // Only persist category for custom deadlines; name is handled by the inline auto-save
    if (deadline.is_custom) {
      updates.category = category
    }
    const { error } = await supabase.from('brewery_deadlines').update(updates).eq('id', deadline.id)
    setSaving(false)
    if (!error) {
      originalValues.current = { ...originalValues.current, name, category, dueDate, docId }
      setIsDirty(false)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2000)
      onUpdated()
    }
  }

  // Toggle completion and record (or clear) the timestamp
  async function handleToggleComplete() {
    const nowComplete = !deadline.is_complete
    await supabase.from('brewery_deadlines').update({
      is_complete:     nowComplete,
      completion_date: nowComplete ? new Date().toISOString() : null,
    }).eq('id', deadline.id)
    onUpdated()
  }

  // Restore a pre-populated deadline to its original date, clearing user edits
  async function handleReset() {
    if (!window.confirm('Reset this deadline to its original date and clear any custom changes?')) return
    const origDate = deadline.original_date ?? deadline.compliance_deadlines?.deadline_date
    await supabase.from('brewery_deadlines').update({
      custom_date: origDate ?? null,
      notes:       null,
      document_id: null,
    }).eq('id', deadline.id)
    onUpdated()
    onClose()
  }

  // Permanently delete a custom deadline
  async function handleDelete() {
    if (!window.confirm('Delete this deadline permanently? This cannot be undone.')) return
    await supabase.from('brewery_deadlines').delete().eq('id', deadline.id)
    onDeleted()
    onClose()
  }

  // ── Inline name editing ──────────────────────────────────────────────────────

  function startEditName() {
    nameEscapedRef.current = false
    setTempName(name)
    setEditingName(true)
  }

  function cancelEditName() {
    nameEscapedRef.current = true
    setEditingName(false)
  }

  async function saveNameInline() {
    // If Escape was pressed the blur event still fires — skip the save
    if (nameEscapedRef.current) { nameEscapedRef.current = false; return }
    const trimmed = tempName.trim()
    if (!trimmed || trimmed === name) { setEditingName(false); return }
    const { error } = await supabase.from('brewery_deadlines')
      .update({ deadline_name: trimmed })
      .eq('id', deadline.id)
    if (!error) {
      setName(trimmed)
      originalValues.current = { ...originalValues.current, name: trimmed }
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
      onUpdated()
    }
    setEditingName(false)
  }

  function handleNameKeyDown(e) {
    if (e.key === 'Enter')  { e.preventDefault(); saveNameInline() }
    if (e.key === 'Escape') { cancelEditName() }
  }

  if (!deadline) return null

  const color       = deadline.is_custom ? CUSTOM_COLOR : (CATEGORY_COLORS[getDeadlineCategory(deadline)] ?? CATEGORY_COLORS['Other'])
  const origDate    = deadline.original_date
  const dateChanged = origDate && dueDate && dueDate !== origDate
  const completedAt = deadline.completion_date
    ? new Date(deadline.completion_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <>
      {/* Backdrop — tapping it closes the panel (with dirty-check) */}
      <div className="fixed inset-0 bg-black/30 z-30" onClick={handleClose} />

      {/* Panel — full screen on mobile, 420 px slide-in on sm+ */}
      <div className="fixed inset-0 sm:inset-auto sm:right-0 sm:top-0 sm:h-full sm:w-[420px] bg-white shadow-2xl z-40 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color.badge}`}>
            {getDeadlineCategory(deadline)}
          </span>
          <button onClick={handleClose} aria-label="Close"
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Notice for pre-populated deadlines */}
          {!deadline.is_custom && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 leading-relaxed">
              This deadline was pre-populated based on your state and license types. Changes you make only affect your brewery.
            </div>
          )}

          {/* Deadline name — inline editable for all deadlines */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Deadline</label>
              {nameSaved && <span className="text-xs text-success font-medium">Saved ✓</span>}
            </div>
            {editingName ? (
              <input
                autoFocus
                type="text"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                onBlur={saveNameInline}
                onKeyDown={handleNameKeyDown}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber"
              />
            ) : (
              <div
                onClick={startEditName}
                className="flex items-center gap-2 cursor-pointer group rounded-lg px-1 -mx-1 py-0.5 hover:bg-gray-50 transition-colors">
                <p className="text-base font-semibold text-navy flex-1 leading-snug">{name}</p>
                <span
                  className="text-sm flex-shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
                  title="Click to edit name">
                  ✏️
                </span>
              </div>
            )}
          </div>

          {/* Category — editable only for custom rows */}
          {deadline.is_custom && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Due date — always editable */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            {dateChanged && (
              <p className="text-xs text-gray-400 mt-1">Original date: {fmtDate(origDate)}</p>
            )}
          </div>

          {/* Description (read-only) */}
          {getDeadlineDescription(deadline) && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">About This Deadline</label>
              <p className="text-sm text-gray-600 leading-relaxed">{getDeadlineDescription(deadline)}</p>
            </div>
          )}

          {/* Notes — auto-saves 2 s after typing stops */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</label>
              {notesSaved && <span className="text-xs text-success">Auto-saved ✓</span>}
            </div>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add your own notes…" className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Notes save automatically as you type.</p>
          </div>

          {/* Document link dropdown */}
          {documents?.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Linked Document</label>
              <select value={docId} onChange={e => setDocId(e.target.value)} className={inputCls}>
                <option value="">No document linked</option>
                {documents.map(d => <option key={d.id} value={d.id}>{d.document_name}</option>)}
              </select>
            </div>
          )}

          {/* Completion toggle */}
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-navy">Mark as Complete</p>
              {completedAt && (
                <p className="text-xs text-gray-400">Completed {completedAt}</p>
              )}
            </div>
            <button onClick={handleToggleComplete} aria-label="Toggle completion"
              className={`relative w-10 h-6 rounded-full transition-colors ${deadline.is_complete ? 'bg-success' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                deadline.is_complete ? 'left-5' : 'left-1'
              }`} />
            </button>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-2 flex-shrink-0">

          {/* Save / Discard row — only shown when there are unsaved changes */}
          {isDirty && (
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : saveMsg || 'Save Changes'}
              </button>
              <button onClick={() => {
                const o = originalValues.current
                setCategory(o.category); setDueDate(o.dueDate); setDocId(o.docId)
                setIsDirty(false)
              }} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Discard
              </button>
            </div>
          )}

          {/* Reset to original — only for pre-populated deadlines */}
          {!deadline.is_custom && (
            <button onClick={handleReset}
              className="w-full border border-gray-200 text-gray-500 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Reset to Original
            </button>
          )}

          {/* Delete — only for custom deadlines */}
          {deadline.is_custom && (
            <button onClick={handleDelete}
              className="w-full border border-danger text-danger py-2 rounded-lg text-sm hover:bg-red-50 transition-colors">
              Delete This Deadline
            </button>
          )}
        </div>
      </div>
    </>
  )
}
