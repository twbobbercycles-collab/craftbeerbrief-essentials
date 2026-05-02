// Page-level draft notice bar — shown when an unsaved add-modal draft exists in
// sessionStorage. Gives users two explicit choices before they click anything.
export default function DraftNoticeBar({ onContinue, onDiscard }) {
  return (
    <div className="bg-amber/10 border border-amber rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-amber-dark leading-relaxed">
        📝 You have an unsaved draft from your last session. Click{' '}
        <strong>Continue Draft</strong> to pick up where you left off, or discard to start fresh.
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onContinue}
          className="text-xs bg-amber text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-dark transition-colors"
        >
          Continue Draft
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="text-xs border border-gray-300 text-gray-600 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Discard Draft
        </button>
      </div>
    </div>
  )
}
