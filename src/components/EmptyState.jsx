/**
 * EmptyState — shown when a module has no data yet.
 * Props:
 *   icon     — emoji or icon to display (e.g. "📋")
 *   title    — main heading
 *   message  — explanation of what to do next
 *   action   — optional button element
 */
export default function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
      <div className="text-5xl">{icon}</div>
      <h3 className="text-lg font-semibold text-navy">{title}</h3>
      <p className="text-gray-500 max-w-sm">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
