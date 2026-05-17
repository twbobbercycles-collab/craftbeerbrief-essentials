/**
 * WorkflowWarningBanner — collapsible warning panel for workflow step completeness.
 * Returns null when warnings array is empty.
 *
 * Props:
 *   warnings — array of { message: string, severity: 'required'|'recommended', link?: string }
 */
import { useState } from 'react'

export default function WorkflowWarningBanner({ warnings = [] }) {
  const [open, setOpen] = useState(true)

  if (!warnings || warnings.length === 0) return null

  const required    = warnings.filter(w => w.severity === 'required')
  const recommended = warnings.filter(w => w.severity === 'recommended')

  return (
    <div className="bg-amber/5 border border-amber/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-amber/10 transition-colors"
      >
        <span className="text-sm font-semibold text-amber">
          ⚠ {warnings.length} item{warnings.length !== 1 ? 's' : ''} need attention
        </span>
        <span className="text-amber text-xs ml-2 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-amber/20 pt-2">
          {required.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-danger mt-0.5 shrink-0 text-xs">●</span>
              <span className="text-gray-700 flex-1">{w.message}</span>
              {w.link && (
                <a href={w.link} className="text-amber text-xs font-medium hover:underline shrink-0">Fix →</a>
              )}
            </div>
          ))}
          {recommended.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-amber mt-0.5 shrink-0 text-xs">●</span>
              <span className="text-gray-700 flex-1">{w.message}</span>
              {w.link && (
                <a href={w.link} className="text-amber text-xs font-medium hover:underline shrink-0">Fix →</a>
              )}
            </div>
          ))}
          {required.length > 0 && (
            <p className="text-xs text-gray-400 mt-1.5">Red = required · Amber = recommended</p>
          )}
        </div>
      )}
    </div>
  )
}
