import { useRef, useMemo, useState } from 'react'
import { FONT_UPLOAD_ACCEPT, type AssetUploadResult, type DrawElement } from '../../core'
import {
  booleanPropertyDefault,
  enumPropertyDefault,
  formatPropertyValue,
  getBooleanPropertyValue,
  getEditableProperties,
  getEnumPropertyDisplayValue,
  getPropertyEffectiveValue,
  normalizePropertyValueForStorage,
  getPropertyEnumValues,
  getPropertyFieldKind,
  getPropertyLabel,
  getPropertyTooltip,
  isCodeLikeStringValue,
  isFontProperty,
  isIconNameProperty,
  isImageUrlProperty,
  isMultilineStringProperty,
  isNonNegativeNumberProperty,
  isClampedPercentProperty,
  isPositionNumberProperty,
  roundPositionNumber,
  parsePropertyInput,
  shouldUseEnumDropdown,
  TEMPLATE_EDITOR_OPTION,
  TEMPLATE_EDITOR_STARTER,
  type PropertyFieldKind,
} from '../lib/property-field-meta'
import { FONT_UPLOAD_OPTION } from '../lib/known-font-keys'
import { filterMdiIconNames } from '../lib/mdi-icon-names'
import { shell } from '../styles/shell'

interface ElementPropertyFormProps {
  element: DrawElement
  fontKeys: string[]
  onPropertyChange: (key: string, value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
  onUploadImageForUrl: (urlKey: string, file: File) => Promise<AssetUploadResult>
}

function PropertyLabel({ element, property }: { element: DrawElement; property: string }) {
  return (
    <span className={shell.muted} title={getPropertyTooltip(element, property)}>
      {getPropertyLabel(element, property)}
    </span>
  )
}

function FontPropertyField({
  element,
  value,
  fontKeys,
  onChange,
  onUploadFont,
}: {
  element: DrawElement
  value: unknown
  fontKeys: string[]
  onChange: (value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
}) {
  const fontInputRef = useRef<HTMLInputElement>(null)
  const current = typeof value === 'string' ? value : ''
  const useDropdown = current && !isCodeLikeStringValue(current) && fontKeys.includes(current)

  if (!useDropdown) {
    return (
      <div className={`block text-xs ${shell.muted}`}>
        <PropertyLabel element={element} property="font" />
        <textarea
          className={`mt-1 w-full font-mono ${shell.input}`}
          rows={2}
          value={current}
          placeholder="ppb.ttf or {{ states('sensor.font') }}"
          onChange={(event) => onChange(event.target.value || undefined)}
        />
        <select
          className={`mt-1 w-full ${shell.input}`}
          value=""
          onChange={(event) => {
            if (event.target.value) {
              onChange(event.target.value)
            }
          }}
        >
          <option value="">Pick a known font…</option>
          {fontKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className={`block text-xs ${shell.muted}`}>
      <PropertyLabel element={element} property="font" />
      <input
        ref={fontInputRef}
        type="file"
        accept={FONT_UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void onUploadFont(file).then((result) => {
              if (result.ok) {
                onChange(file.name)
              }
            })
          }
          event.target.value = ''
        }}
      />
      <select
        className={`mt-1 w-full ${shell.input}`}
        value={current}
        onChange={(event) => {
          const next = event.target.value
          if (next === FONT_UPLOAD_OPTION) {
            fontInputRef.current?.click()
            return
          }
          if (next === TEMPLATE_EDITOR_OPTION) {
            onChange(TEMPLATE_EDITOR_STARTER)
            return
          }
          onChange(next || undefined)
        }}
      >
        {fontKeys.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
        <option value={FONT_UPLOAD_OPTION}>Upload font…</option>
        <option value={TEMPLATE_EDITOR_OPTION}>Template…</option>
      </select>
    </div>
  )
}

function IconNamePropertyField({
  element,
  value,
  onChange,
}: {
  element: DrawElement
  value: unknown
  onChange: (value: unknown) => void
}) {
  const current = typeof value === 'string' ? value : ''
  const [focused, setFocused] = useState(false)
  const suggestions = useMemo(() => {
    if (!focused || isCodeLikeStringValue(current)) {
      return []
    }
    return filterMdiIconNames(current)
  }, [current, focused])

  return (
    <div className={`relative block text-xs ${shell.muted}`}>
      <PropertyLabel element={element} property="value" />
      <input
        type="text"
        className={`mt-1 w-full font-mono ${shell.input}`}
        value={current}
        placeholder="account-cowboy-hat"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
      />
      {suggestions.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--shell-border)] bg-[var(--shell-surface)] py-1 text-[var(--shell-text)] shadow-lg ring-1 ring-black/5"
          role="listbox"
        >
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left font-mono text-sm text-[var(--shell-text)] hover:bg-[var(--shell-hover)]"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(name)
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function EnumPresetPicker({
  element,
  property,
  enumValues,
  onChange,
}: {
  element: DrawElement
  property: string
  enumValues: readonly string[]
  onChange: (value: unknown) => void
}) {
  return (
    <select
      className={`mt-1 w-full ${shell.input}`}
      value=""
      onChange={(event) => {
        const next = event.target.value
        if (!next) {
          return
        }
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
  )
}

function EnumPropertyField({
  element,
  property,
  value,
  enumValues,
  onChange,
}: {
  element: DrawElement
  property: string
  value: unknown
  enumValues: readonly string[]
  onChange: (value: unknown) => void
}) {
  const useDropdown = shouldUseEnumDropdown(property, value, enumValues)
  const displayValue = getEnumPropertyDisplayValue(element, property, value)

  if (useDropdown) {
    const selectValue = displayValue && enumValues.includes(displayValue) ? displayValue : ''
    return (
      <label className={`block text-xs ${shell.muted}`}>
        <PropertyLabel element={element} property={property} />
        <select
          className={`mt-1 w-full ${shell.input}`}
          value={selectValue}
          onChange={(event) => {
            const next = event.target.value
            if (next === TEMPLATE_EDITOR_OPTION) {
              onChange(TEMPLATE_EDITOR_STARTER)
              return
            }
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
          <option value={TEMPLATE_EDITOR_OPTION}>Template…</option>
        </select>
      </label>
    )
  }

  return (
    <div className={`block text-xs ${shell.muted}`}>
      <PropertyLabel element={element} property={property} />
      <textarea
        className={`mt-1 w-full font-mono ${shell.input}`}
        rows={2}
        value={formatPropertyValue(value)}
        placeholder="Template, hex color, or custom value"
        onChange={(event) => onChange(event.target.value || undefined)}
      />
      <EnumPresetPicker
        element={element}
        property={property}
        enumValues={enumValues}
        onChange={onChange}
      />
    </div>
  )
}

function PropertyField({
  property,
  element,
  value,
  fontKeys,
  onChange,
  onUploadFont,
  onUploadImageForUrl,
}: {
  property: string
  element: DrawElement
  value: unknown
  fontKeys: string[]
  onChange: (value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
  onUploadImageForUrl: (urlKey: string, file: File) => Promise<AssetUploadResult>
}) {
  const kind: PropertyFieldKind = getPropertyFieldKind(property, value)
  const enumValues = kind === 'enum' ? getPropertyEnumValues(property) : null

  if (kind === 'boolean') {
    return (
      <label
        className="flex items-center gap-2 text-xs text-[var(--shell-text)]"
        title={getPropertyTooltip(element, property)}
      >
        <input
          type="checkbox"
          checked={getBooleanPropertyValue(element, property, value)}
          onChange={(event) => {
            const checked = event.target.checked
            if (checked === booleanPropertyDefault(element, property)) {
              onChange(undefined)
              return
            }
            onChange(checked)
          }}
        />
        <PropertyLabel element={element} property={property} />
      </label>
    )
  }

  if (isFontProperty(property)) {
    return (
      <FontPropertyField
        element={element}
        value={value}
        fontKeys={fontKeys}
        onChange={onChange}
        onUploadFont={onUploadFont}
      />
    )
  }

  if (isIconNameProperty(property, element.type) && !isCodeLikeStringValue(value)) {
    return <IconNamePropertyField element={element} value={value} onChange={onChange} />
  }

  if (isImageUrlProperty(property, element.type)) {
    const urlKey = typeof value === 'string' ? value : ''

    return (
      <div className={`block text-xs ${shell.muted}`}>
        <PropertyLabel element={element} property={property} />
        <div className="mt-1 flex gap-1">
          <textarea
            className={`min-h-[2.5rem] flex-1 font-mono ${shell.input}`}
            rows={2}
            value={urlKey}
            placeholder="/local/logo.png"
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            className={`shrink-0 self-start ${shell.button} px-2 py-1`}
            onClick={() => {
              document.getElementById(`image-upload-${property}`)?.click()
            }}
          >
            Upload
          </button>
          <input
            id={`image-upload-${property}`}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) {
                return
              }
              const key = urlKey.trim() || `/local/${file.name}`
              if (!urlKey.trim()) {
                onChange(key)
              }
              void onUploadImageForUrl(key, file)
              event.target.value = ''
            }}
          />
        </div>
      </div>
    )
  }

  if (kind === 'enum' && enumValues) {
    return (
      <EnumPropertyField
        element={element}
        property={property}
        value={value}
        enumValues={enumValues}
        onChange={onChange}
      />
    )
  }

  if (kind === 'json') {
    const samplePlotData =
      element.type === 'plot' && property === 'data'
        ? [
            { entity: 'sensor.temperature', color: 'red', width: 2, smooth: true },
            { entity: 'sensor.humidity', color: 'black', width: 1 },
          ]
        : null

    return (
      <div className={`block text-xs ${shell.muted}`}>
        <PropertyLabel element={element} property={property} />
        <textarea
          className={`mt-1 w-full font-mono ${shell.input}`}
          rows={4}
          value={formatPropertyValue(value)}
          onChange={(event) => {
            try {
              onChange(parsePropertyInput('json', event.target.value))
            } catch {
              // Keep editing until JSON is valid.
            }
          }}
          onBlur={(event) => {
            try {
              onChange(parsePropertyInput('json', event.target.value))
            } catch {
              // Revert display on invalid JSON blur.
            }
          }}
        />
        {samplePlotData ? (
          <button
            type="button"
            className={`mt-1 ${shell.button} px-2 py-1`}
            onClick={() => onChange(samplePlotData)}
          >
            Insert sample series
          </button>
        ) : null}
      </div>
    )
  }

  if (kind === 'number') {
    const nonNegative = isNonNegativeNumberProperty(property)
    const clampedPercent = isClampedPercentProperty(property)
    return (
      <label className={`block text-xs ${shell.muted}`}>
        <PropertyLabel element={element} property={property} />
        <input
          type="number"
          className={`mt-1 w-full font-mono ${shell.input}`}
          value={value == null ? '' : String(value)}
          min={nonNegative || clampedPercent ? 0 : undefined}
          max={clampedPercent ? 100 : undefined}
          onChange={(event) => {
            const parsed = parsePropertyInput('number', event.target.value)
            if (typeof parsed !== 'number') {
              onChange(parsed)
              return
            }
            let next = parsed
            if (nonNegative) {
              next = Math.max(0, next)
            }
            if (clampedPercent) {
              next = Math.min(100, Math.max(0, next))
            }
            if (isPositionNumberProperty(property)) {
              next = roundPositionNumber(property, next)
            }
            onChange(next)
          }}
        />
      </label>
    )
  }

  if (isMultilineStringProperty(property) || isCodeLikeStringValue(value)) {
    return (
      <label className={`block text-xs ${shell.muted}`}>
        <PropertyLabel element={element} property={property} />
        <textarea
          className={`mt-1 w-full font-mono ${shell.input}`}
          rows={4}
          value={formatPropertyValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  return (
    <label className={`block text-xs ${shell.muted}`}>
      <PropertyLabel element={element} property={property} />
      <input
        type="text"
        className={`mt-1 w-full font-mono ${shell.input}`}
        value={formatPropertyValue(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function ElementPropertyForm({
  element,
  fontKeys,
  onPropertyChange,
  onUploadFont,
  onUploadImageForUrl,
}: ElementPropertyFormProps) {
  const properties = getEditableProperties(element)

  return (
    <div className="space-y-3">
      {properties.map((property) => (
        <PropertyField
          key={property}
          property={property}
          element={element}
          value={getPropertyEffectiveValue(element, property)}
          fontKeys={fontKeys}
          onChange={(next) =>
            onPropertyChange(property, normalizePropertyValueForStorage(element, property, next))
          }
          onUploadFont={onUploadFont}
          onUploadImageForUrl={onUploadImageForUrl}
        />
      ))}
    </div>
  )
}
