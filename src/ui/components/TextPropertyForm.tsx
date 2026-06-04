import type { TextElement } from '../../core/elements/text'

interface TextPropertyFormProps {
  element: TextElement
  onChange: (value: string) => void
}

export function TextPropertyForm({ element, onChange }: TextPropertyFormProps) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-lg">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Properties</h2>
      <label className="mt-4 block text-sm">
        <span className="text-slate-300">Text value</span>
        <input
          type="text"
          className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
          value={element.value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div>
          <dt>Font</dt>
          <dd className="text-slate-200">{element.font ?? 'ppb.ttf'}</dd>
        </div>
        <div>
          <dt>Color</dt>
          <dd className="text-slate-200">{element.color}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd className="text-slate-200">
            {element.x}, {element.y}
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd className="text-slate-200">{element.size}</dd>
        </div>
      </dl>
    </section>
  )
}
