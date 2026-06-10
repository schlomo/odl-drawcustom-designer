import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { hasTemplateSyntax, type PropertyEditorShape } from '../../../core'
import { shell } from '../../styles/shell'
import { TEMPLATE_EDITOR_STARTER } from '../../lib/property-format'
import { PropertyFieldControl, TemplateToggleButton } from './TemplateToggleButton'
import { useDeferredTemplateEdit } from './useDeferredTemplateEdit'

export interface ScalarOrTemplateFieldProps {
  property: string
  value: unknown
  shape: Extract<PropertyEditorShape, 'number' | 'coordinate'>
  label: ReactNode
  typeMin?: number
  allowNegative?: boolean
  nonNegative?: boolean
  clampedPercent?: boolean
  parseScalar: (raw: string) => unknown
  onChange: (value: unknown) => void
  onBeginEdit?: () => void
  onEndEdit?: () => void
}

export function ScalarOrTemplateField({
  value,
  shape,
  label,
  typeMin,
  allowNegative,
  nonNegative,
  clampedPercent,
  parseScalar,
  onChange,
  onBeginEdit,
  onEndEdit,
}: ScalarOrTemplateFieldProps) {
  const {
    inTemplateMode,
    displayValue,
    beginTemplate,
    focusTemplate,
    commitTemplateBlur,
    updateTemplateDraft,
    cancelTemplate,
  } = useDeferredTemplateEdit({ value, onChange, onBeginEdit, onEndEdit })

  const [scalarDraft, setScalarDraft] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const draftRef = useRef('')

  const scalarDisplay = scalarDraft ?? (value == null ? '' : String(value))

  const commitScalar = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) {
        onChange(undefined)
        return
      }
      if (hasTemplateSyntax(trimmed)) {
        beginTemplate(trimmed.includes('{{') ? trimmed : TEMPLATE_EDITOR_STARTER)
        return
      }
      onChange(parseScalar(raw))
    },
    [beginTemplate, onChange, parseScalar],
  )

  const scheduleCommit = useCallback(
    (raw: string) => {
      draftRef.current = raw
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        commitScalar(draftRef.current)
      })
    },
    [commitScalar],
  )

  useEffect(
    () => () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
      }
    },
    [],
  )

  if (inTemplateMode) {
    return (
      <PropertyFieldControl
        label={label}
        trailing={
          <TemplateToggleButton
            active
            literalLabel="number"
            onClick={() => {
              cancelTemplate()
              onChange(undefined)
            }}
          />
        }
      >
        <textarea
          className={`w-full font-mono ${shell.input}`}
          rows={2}
          value={displayValue}
          placeholder="{{ states('sensor.value') | float }}"
          onFocus={focusTemplate}
          onBlur={() => commitTemplateBlur(displayValue, commitScalar)}
          onChange={(event) => updateTemplateDraft(event.target.value)}
        />
      </PropertyFieldControl>
    )
  }

  const useTextInput =
    shape === 'coordinate' && typeof value === 'string'

  return (
    <PropertyFieldControl
      label={label}
      trailing={<TemplateToggleButton onClick={() => beginTemplate(TEMPLATE_EDITOR_STARTER)} />}
    >
      <input
        type={useTextInput ? 'text' : 'number'}
        className={`w-full font-mono ${shell.input}`}
        value={scalarDisplay}
        min={typeMin ?? (allowNegative ? -1 : nonNegative || clampedPercent ? 0 : undefined)}
        max={clampedPercent ? 100 : undefined}
        onFocus={() => {
          onBeginEdit?.()
          setScalarDraft(scalarDisplay)
        }}
        onBlur={() => {
          if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
          }
          commitScalar(scalarDraft ?? scalarDisplay)
          setScalarDraft(null)
          onEndEdit?.()
        }}
        onKeyDown={(event) => {
          if (event.key === '{') {
            event.preventDefault()
            beginTemplate(TEMPLATE_EDITOR_STARTER)
          }
        }}
        onChange={(event) => {
          const raw = event.target.value
          setScalarDraft(raw)
          scheduleCommit(raw)
        }}
      />
    </PropertyFieldControl>
  )
}
