import { useEffect, useRef, type ReactNode } from 'react'
import type { DrawElement } from '../../../core'
import { isTemplateStoredValue, resolveEditorMode } from '../../../core'
import { parsePropertyInput } from '../../lib/property-field-meta'
import { formatPropertyValue, TEMPLATE_EDITOR_STARTER } from '../../lib/property-format'
import { shell } from '../../styles/shell'
import { PropertyFieldControl, TemplateToggleButton } from './TemplateToggleButton'
import { useDeferredTemplateEdit } from './useDeferredTemplateEdit'

export interface JsonOrTemplateFieldProps {
  element: DrawElement
  property: string
  value: unknown
  label: ReactNode
  sampleValue?: unknown[] | Record<string, unknown>
  /** Literal restored when leaving template mode with no known prior literal.
   * Every `json`-shaped field (points/icons/data) is REQUIRED by its element
   * schema — committing `undefined` deletes the field and leaves the element
   * invalid (once white-screening the whole app via element-list-row). */
  literalFallback?: unknown
  onChange: (value: unknown) => void
  onBeginEdit?: () => void
  onEndEdit?: () => void
}

export function JsonOrTemplateField({
  element,
  property,
  value,
  label,
  sampleValue,
  literalFallback,
  onChange,
  onBeginEdit,
  onEndEdit,
}: JsonOrTemplateFieldProps) {
  const isStoredTemplate =
    resolveEditorMode(value, 'json') === 'template' ||
    (typeof value === 'string' && isTemplateStoredValue(value))

  // Remember the most recent structured literal so "Back to JSON" can restore
  // it after a template was committed in this session.
  const lastLiteral = useRef<unknown>(undefined)
  useEffect(() => {
    if (typeof value !== 'string' && value !== undefined && value !== null) {
      lastLiteral.current = value
    }
  }, [value])

  const displayValue = formatPropertyValue(value)

  const commitJsonScalar = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      // Required field: an emptied textarea must not delete the value —
      // leave the stored literal in place (the display reverts on blur).
      return
    }
    onChange(parsePropertyInput('json', raw))
  }

  const {
    inTemplateMode,
    displayValue: templateDisplay,
    beginTemplate,
    focusTemplate,
    commitTemplateBlur,
    updateTemplateDraft,
    cancelTemplate,
  } = useDeferredTemplateEdit({ value, onChange, onBeginEdit, onEndEdit })

  if (isStoredTemplate || inTemplateMode) {
    return (
      <PropertyFieldControl
        label={label}
        trailing={
          <TemplateToggleButton
            active
            literalLabel="JSON"
            onClick={() => {
              cancelTemplate()
              if (isStoredTemplate) {
                onChange(lastLiteral.current ?? literalFallback)
              }
              // Pending-only template mode never committed anything — the
              // stored literal is still intact, nothing to change.
            }}
          />
        }
      >
        <textarea
          className={`w-full font-mono ${shell.input}`}
          rows={4}
          value={inTemplateMode ? templateDisplay : typeof value === 'string' ? value : displayValue}
          placeholder="{{ states('sensor.plot_data') | from_json }}"
          onFocus={focusTemplate}
          onBlur={() => {
            commitTemplateBlur(
              inTemplateMode ? templateDisplay : typeof value === 'string' ? value : displayValue,
              (raw) => {
                try {
                  commitJsonScalar(raw)
                } catch {
                  // Stay in template until valid JSON or empty.
                }
              },
            )
          }}
          onChange={(event) => updateTemplateDraft(event.target.value)}
        />
      </PropertyFieldControl>
    )
  }

  return (
    <PropertyFieldControl
      label={label}
      trailing={<TemplateToggleButton literalLabel="JSON" onClick={() => beginTemplate(TEMPLATE_EDITOR_STARTER)} />}
    >
      <textarea
        className={`w-full font-mono ${shell.input}`}
        rows={4}
        value={displayValue}
        onFocus={onBeginEdit}
        onBlur={(event) => {
          onEndEdit?.()
          try {
            commitJsonScalar(event.target.value)
          } catch {
            // Revert display on invalid JSON blur.
          }
        }}
        onChange={(event) => {
          const raw = event.target.value
          if (raw.includes('{{') || raw.includes('{%')) {
            beginTemplate(raw.includes('{{') ? raw : TEMPLATE_EDITOR_STARTER)
            return
          }
          try {
            commitJsonScalar(raw)
          } catch {
            // Keep editing until JSON is valid.
          }
        }}
      />
      {sampleValue && element.type === 'plot' && property === 'data' ? (
        <button
          type="button"
          className={`mt-1 ${shell.button} px-2 py-1`}
          onClick={() => onChange(sampleValue)}
        >
          Insert sample series
        </button>
      ) : null}
    </PropertyFieldControl>
  )
}
