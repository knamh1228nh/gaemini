interface StatusIndicatorProps {
  status: string | null
}

export default function StatusIndicator({ status }: StatusIndicatorProps) {
  if (!status) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700 w-fit">
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:300ms]" />
      </span>
      {status}
    </div>
  )
}
