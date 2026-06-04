import { useState } from 'react'
import {
  createDefaultTextElement,
  describeTextElement,
  updateTextValue,
  type TextElement,
} from '../core/elements/text'
import { CanvasPlaceholder } from './components/CanvasPlaceholder'
import { TextPropertyForm } from './components/TextPropertyForm'

export function App() {
  const [element, setElement] = useState<TextElement>(createDefaultTextElement)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-700 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">OEPL Designer</h1>
        <p className="mt-1 text-sm text-slate-400">
          Phase 0 shell — canvas and property form wired to core stubs
        </p>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-2">
        <CanvasPlaceholder summary={describeTextElement(element)} />
        <TextPropertyForm
          element={element}
          onChange={(value) => setElement(updateTextValue(element, value))}
        />
      </main>
    </div>
  )
}
