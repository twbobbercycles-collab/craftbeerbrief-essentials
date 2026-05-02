/**
 * LoadingSpinner — shown while a page is fetching data.
 * Pass a `message` prop to show a custom loading message.
 */
export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      {/* Spinning circle using Tailwind's animate-spin */}
      <div className="w-10 h-10 border-4 border-gray-200 border-t-amber rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  )
}
