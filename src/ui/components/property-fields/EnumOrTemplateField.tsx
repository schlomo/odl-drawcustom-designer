import type { ReactNode } from 'react'
import type { DrawElement } from '../../../core'
import {
  hasTemplateSyntax,
  isTemplateStoredValue,
  resolveEditorMode,
} from '../../../core'
import {
  enumPropertyDefault,
  getEnumPropertyDisplayValue,
  isCodeLikeStringValue,
  shouldUseEnumDropdown,
} from '../../lib/property-field-meta'
import { TEMPLATE_EDITOR_STARTER } from '../../lib/property-format'
import { shell } from '../../styles/shell'
import { PropertyFieldControl, TemplateToggleButton } from './TemplateToggleButton'
import { useDeferredTemplateEdit } from './useDeferredTemplateEdit'

export interface EnumOrTemplateFieldProps {
  element: DrawElement
  property: string
  value: unknown
  label: ReactNode
  enumValues: readonly string[]
  onChange: (value: unknown) => void
}

export function EnumOrTemplateField({
  element,
  property,
  value,
  label,
  enumValues,
  onChange,
}: EnumOrTemplateFieldProps) {
  const mode = resolveEditorMode(value, 'enum')
  const storedTemplate = typeof value === 'string' && isTemplateStoredValue(value)
  const useDropdown =
    mode === 'scalar' &&
    shouldUseEnumDropdown(property, value, enumValues) &&
    !isCodeLikeStringValue(value)
  const displayValue = getEnumPropertyDisplayValue(element, property, value)

  const commitTextValue = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      onChange(undefined)
      return
    }
    if (enumValues.includes(trimmed) && !hasTemplateSyntax(trimmed)) {
      onChange(trimmed === enumPropertyDefault(element, property) ? undefined : trimmed)
      return
    }
    onChange(trimmed)
  }

  const {
    inTemplateMode,
    displayValue: templateDisplay,
    beginTemplate,
    focusTemplate,
    commitTemplateBlur,
    updateTemplateDraft,
    cancelTemplate,
  } = useDeferredTemplateEdit({ value, onChange })

  const showTemplateEditor =
    inTemplateMode || mode === 'template' || storedTemplate || !useDropdown

  if (showTemplateEditor) {
    const useDeferred = inTemplateMode || storedTemplate

    return (
      <PropertyFieldControl
        label={label}
        trailing={
          <TemplateToggleButton
            active={storedTemplate}
            literalLabel="preset"
            onClick={() => {
              if (storedTemplate) {
                cancelTemplate()
                onChange(undefined)
              } else {
                beginTemplate(TEMPLATE_EDITOR_STARTER)
              }
            }}
          />
        }
      >
        <textarea
          className={`w-full font-mono ${shell.input}`}
          rows={2}
          value={useDeferred ? templateDisplay : displayValue}
          placeholder="red, #ff0000, or {{ 'red' if … }}"
          onFocus={useDeferred ? focusTemplate : undefined}
          onBlur={
            useDeferred
              ? () => commitTemplateBlur(templateDisplay, commitTextValue)
              : undefined
          }
          onChange={(event) => {
            const raw = event.target.value
            if (useDeferred) {
              updateTemplateDraft(raw)
              return
            }
            if (!raw.trim() || !hasTemplateSyntax(raw)) {
              commitTextValue(raw)
              return
            }
            if (hasTemplateSyntax(raw)) {
              beginTemplate(raw.includes('{{') ? raw : TEMPLATE_EDITOR_STARTER)
              return
            }
            commitTextValue(raw)
          }}
        />
        {enumValues.length > 0 ? (
          <select
            className={`mt-1 w-full ${shell.input}`}
            value=""
            onChange={(event) => {
              const next = event.target.value
              if (!next) {
                return
              }
              cancelTemplate()
              if (next === enumPropertyDefault(element, property)) {
                onChange(undefined)
                return
              }
              onChange(next)
            }}
          >
            <option value="">Pick preset…</option>
            {enumValues.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : null}
      </PropertyFieldControl>
    )
  }

  const selectValue = displayValue && enumValues.includes(displayValue) ? displayValue : ''

  return (
    <PropertyFieldControl
      label={label}
      trailing={<TemplateToggleButton onClick={() => beginTemplate(TEMPLATE_EDITOR_STARTER)} />}
    >
      <select
        className={`w-full ${shell.input}`}
        value={selectValue}
        onKeyDown={(event) => {
          if (event.key === '{') {
            event.preventDefault()
            beginTemplate(TEMPLATE_EDITOR_STARTER)
          }
        }}
        onChange={(event) => {
          const next = event.target.value
          if (!next || next === enumPropertyDefault(element, property)) {
            onChange(undefined)
            return
          }
          onChange(next)
        }}
      >
        <option value="">
          default
          {enumPropertyDefault(element, property)
            ? ` (${enumPropertyDefault(element, property)})`
            : ''}
        </option>
        {enumValues.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </PropertyFieldControl>
  )
}
