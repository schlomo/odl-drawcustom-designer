import type { DrawElement } from '../../core'
import { DISPLAY_PRESETS, findPresetByDimensions } from '../data/display-presets'
import type { CanvasConfig, CanvasRotation } from '../hooks/useProjectState'
import { shell } from '../styles/shell'

interface SidebarProps {
  elements: DrawElement[]
  selectedIndex: number | null
  canvas: CanvasConfig
  onSelectElement: (index: number) => void
  onApplyPreset: (presetId: string) => void
  onCanvasSizeChange: (width: number, height: number) => void
  onRotationChange: (rotation: CanvasRotation) => void
}

const ROTATION_OPTIONS: CanvasRotation[] = [0, 90, 180, 270]

function elementLabel(element: DrawElement, index: number): string {
  const typeLabel = element.type.replace(/_/g, ' ')
  return `${index + 1}. ${typeLabel}`
}

export function Sidebar({
  elements,
  selectedIndex,
  canvas,
  onSelectElement,
  onApplyPreset,
  onCanvasSizeChange,
  onRotationChange,
}: SidebarProps) {
  const matchingPreset = findPresetByDimensions(canvas.width, canvas.height)
  const presetValue = matchingPreset?.id ?? 'custom'

  return (
    <aside className={`flex w-64 shrink-0 flex-col border-r ${shell.panelBorder} ${shell.panel}`}>
      <section className={`border-b ${shell.panelBorder} p-4`}>
        <h2 className={shell.heading}>Display config</h2>
        <label className={`mt-3 block text-xs ${shell.muted}`}>
          Tag preset
          <select
            className={`mt-1 w-full ${shell.input}`}
            value={presetValue}
            onChange={(event) => onApplyPreset(event.target.value)}
          >
            {DISPLAY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={`text-xs ${shell.muted}`}>
            Width
            <input
              type="number"
              min={1}
              className={`mt-1 w-full ${shell.input}`}
              value={canvas.width}
              onChange={(event) =>
                onCanvasSizeChange(Number(event.target.value), canvas.height)
              }
            />
          </label>
          <label className={`text-xs ${shell.muted}`}>
            Height
            <input
              type="number"
              min={1}
              className={`mt-1 w-full ${shell.input}`}
              value={canvas.height}
              onChange={(event) =>
                onCanvasSizeChange(canvas.width, Number(event.target.value))
              }
            />
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className={`text-xs ${shell.muted}`}>Visual rotation</legend>
          <div className="mt-1 flex gap-1">
            {ROTATION_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`flex-1 rounded-md border px-2 py-1 text-xs ${
                  canvas.rotation === value
                    ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)] text-white'
                    : `${shell.button} hover:bg-[var(--shell-hover)]`
                }`}
                onClick={() => onRotationChange(value)}
              >
                {value}°
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex min-h-0 flex-1 flex-col p-4">
        <h2 className={shell.heading}>Elements</h2>
        <ul className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {elements.length === 0 ? (
            <li className={`text-xs ${shell.muted}`}>No elements yet</li>
          ) : (
            elements.map((element, index) => (
              <li key={index}>
                <button
                  type="button"
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    selectedIndex === index
                      ? 'bg-[var(--shell-accent)] text-white'
                      : 'bg-[var(--shell-surface-2)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]'
                  }`}
                  onClick={() => onSelectElement(index)}
                >
                  {elementLabel(element, index)}
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </aside>
  )
}
