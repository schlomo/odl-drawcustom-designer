interface CanvasPlaceholderProps {
  summary: string
}

export function CanvasPlaceholder({ summary }: CanvasPlaceholderProps) {
  return (
    <section
      className="flex min-h-64 flex-col rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-lg"
      aria-label="Canvas placeholder"
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Canvas</h2>
      <div className="mt-4 flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-600 bg-white text-slate-900">
        <p className="px-4 text-center text-sm">{summary}</p>
      </div>
    </section>
  )
}
