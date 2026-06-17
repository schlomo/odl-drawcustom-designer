import { mdiChevronDown } from '@mdi/js'
import { useEffect, useId, useRef, useState } from 'react'
import {
  CUSTOM_RESOLUTION_VALUE,
  formatResolutionLabel,
  SORTED_RESOLUTION_QUICK_PICKS,
} from '../data/resolution-picks'
import { resolutionOrientationHint } from '../lib/resolution-orientation'
import { shell } from '../styles/shell'
import { MdiIcon } from './MdiIcon'

interface ResolutionSelectProps {
  value: string
  canvasWidth: number
  canvasHeight: number
  onSelectValue: (value: string) => void
}

function triggerLabel(value: string, canvasWidth: number, canvasHeight: number): string {
  if (value === CUSTOM_RESOLUTION_VALUE) {
    return `Custom (${canvasWidth}×${canvasHeight})`
  }
  return value
}

export function ResolutionSelect({
  value,
  canvasWidth,
  canvasHeight,
  onSelectValue,
}: ResolutionSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedOptionRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    const selectedOption = selectedOptionRef.current
    if (typeof selectedOption?.scrollIntoView === 'function') {
      selectedOption.scrollIntoView({ block: 'center' })
    }
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
    }
  }, [open])

  const selectValue = (nextValue: string) => {
    setOpen(false)
    onSelectValue(nextValue)
  }

  return (
    <div ref={containerRef} className="relative mt-1">
      <button
        type="button"
        aria-label="Resolution"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={`flex w-full items-center gap-2 ${shell.input}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {triggerLabel(value, canvasWidth, canvasHeight)}
        </span>
        <MdiIcon path={mdiChevronDown} size={16} className="shrink-0 text-[var(--shell-muted)]" />
      </button>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Resolution options"
          className={`absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border ${shell.panelBorder} ${shell.panel} py-1 shadow-lg ring-1 ring-black/5`}
        >
          {SORTED_RESOLUTION_QUICK_PICKS.map((pick) => {
            const optionValue = formatResolutionLabel(pick.width, pick.height)
            const hint = resolutionOrientationHint(pick.width, pick.height)
            return (
              <li key={optionValue} role="presentation">
                <button
                  ref={value === optionValue ? selectedOptionRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={value === optionValue}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--shell-hover)] ${
                    value === optionValue ? 'bg-[var(--shell-hover)]' : ''
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectValue(optionValue)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{optionValue}</span>
                  <span className={`shrink-0 text-[10px] ${shell.muted}`}>{hint}</span>
                </button>
              </li>
            )
          })}
          <li role="presentation">
            <button
              ref={value === CUSTOM_RESOLUTION_VALUE ? selectedOptionRef : undefined}
              type="button"
              role="option"
              aria-selected={value === CUSTOM_RESOLUTION_VALUE}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--shell-hover)] ${
                value === CUSTOM_RESOLUTION_VALUE ? 'bg-[var(--shell-hover)]' : ''
              }`}
              onMouseDown={(event) => {
                event.preventDefault()
                selectValue(CUSTOM_RESOLUTION_VALUE)
              }}
            >
              <span className="flex-1">Custom</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
