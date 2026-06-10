import type { ReactNode } from 'react'
import { shell } from '../../styles/shell'
import { TEMPLATE_EDITOR_STARTER } from '../../lib/property-format'
import { TemplateToggleButton } from './TemplateToggleButton'
import { useDeferredTemplateEdit } from './useDeferredTemplateEdit'

export interface BooleanOrTemplateFieldProps {
  value: unknown
  label: ReactNode
  tooltip?: string
  checked: boolean
  defaultChecked: boolean
  onChange: (value: unknown) => void
}

export function BooleanOrTemplateField({
  value,
  label,
  tooltip,
  checked,
  defaultChecked,
  onChange,
}: BooleanOrTemplateFieldProps) {
  const commitScalar = () => {
    onChange(defaultChecked ? undefined : defaultChecked)
  }

  const {
    inTemplateMode,
    displayValue,
    beginTemplate,
    focusTemplate,
    commitTemplateBlur,
    updateTemplateDraft,
    cancelTemplate,
  } = useDeferredTemplateEdit({ value, onChange })

  if (inTemplateMode) {
    return (
      <div className={`block text-xs ${shell.muted}`}>
        {label}
        <div className="mt-1 flex items-start gap-1">
          <textarea
            className={`min-w-0 flex-1 font-mono ${shell.input}`}
            rows={2}
            value={displayValue}
            placeholder="{{ is_state('input_boolean.show', 'on') }}"
            onFocus={focusTemplate}
            onBlur={() => commitTemplateBlur(displayValue, commitScalar)}
            onChange={(event) => updateTemplateDraft(event.target.value)}
          />
          <TemplateToggleButton
            active
            literalLabel="checkbox"
            onClick={() => {
              cancelTemplate()
              commitScalar()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <label
      className="flex items-center gap-2 text-xs text-[var(--shell-text)]"
      title={tooltip}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          const nextChecked = event.target.checked
          if (nextChecked === defaultChecked) {
            onChange(undefined)
            return
          }
          onChange(nextChecked)
        }}
      />
      <span className="min-w-0 flex-1">{label}</span>
      <TemplateToggleButton onClick={() => beginTemplate(TEMPLATE_EDITOR_STARTER)} />
    </label>
  )
}
