import { useRef, useState, useMemo } from 'react'
import {
  FONT_UPLOAD_ACCEPT,
  getPropertyEditorShape,
  type AssetUploadResult,
  type DrawElement,
  DEBUG_GRID_MIN_SPACING,
  ICON_SEQUENCE_ICONS_PREVIEW,
  POLYGON_POINTS_PREVIEW,
} from '../../core'
import {
  booleanPropertyDefault,
  formatPropertyValue,
  getBooleanPropertyValue,
  getEditableProperties,
  getPropertyEffectiveValue,
  normalizePropertyValueForStorage,
  getPropertyEnumValues,
  getPropertyLabel,
  getPropertyTooltip,
  isCodeLikeStringValue,
  isFontProperty,
  isIconNameProperty,
  isImageUrlProperty,
  isMultilineStringProperty,
  isAllowNegativeNumberProperty,
  isNonNegativeNumberProperty,
  isClampedPercentProperty,
  parseCoordinatePropertyValue,
  parseNumberPropertyValue,
  TEMPLATE_EDITOR_STARTER,
} from '../lib/property-field-meta'
import { FONT_UPLOAD_OPTION } from '../lib/known-font-keys'
import { filterMdiIconNames } from '../lib/mdi-icon-names'
import {
  BooleanOrTemplateField,
  EnumOrTemplateField,
  JsonOrTemplateField,
  PropertyFieldControl,
  ScalarOrTemplateField,
  TemplateToggleButton,
} from './property-fields'
import { getScopedElementById } from '../lib/scoped-dom'
import { shell } from '../styles/shell'

interface ElementPropertyFormProps {
  element: DrawElement
  fontKeys: string[]
  onPropertyChange: (key: string, value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
  onUploadImageForUrl: (urlKey: string, file: File) => Promise<AssetUploadResult>
  properties?: string[]
  mixedProperties?: string[]
  onBeginEdit?: () => void
  onEndEdit?: () => void
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
      <PropertyFieldControl
        label={<PropertyLabel element={element} property="font" />}
        trailing={
          <TemplateToggleButton
            active={isCodeLikeStringValue(current) && current.includes('{{')}
            onClick={() => onChange(TEMPLATE_EDITOR_STARTER)}
          />
        }
      >
        <textarea
          className={`w-full font-mono ${shell.input}`}
          rows={2}
          value={current}
          placeholder="ppb.ttf or {{ states('sensor.font') }}"
          onKeyDown={(event) => {
            if (event.key === '{') {
              event.preventDefault()
              onChange(TEMPLATE_EDITOR_STARTER)
            }
          }}
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
      </PropertyFieldControl>
    )
  }

  return (
    <PropertyFieldControl
      label={<PropertyLabel element={element} property="font" />}
      trailing={<TemplateToggleButton onClick={() => onChange(TEMPLATE_EDITOR_STARTER)} />}
    >
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
        className={`w-full ${shell.input}`}
        value={current}
        onChange={(event) => {
          const next = event.target.value
          if (next === FONT_UPLOAD_OPTION) {
            fontInputRef.current?.click()
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
      </select>
    </PropertyFieldControl>
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

function PropertyField({
  property,
  element,
  value,
  mixed = false,
  fontKeys,
  onChange,
  onUploadFont,
  onUploadImageForUrl,
  onBeginEdit,
  onEndEdit,
}: {
  property: string
  element: DrawElement
  value: unknown
  mixed?: boolean
  fontKeys: string[]
  onChange: (value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
  onUploadImageForUrl: (urlKey: string, file: File) => Promise<AssetUploadResult>
  onBeginEdit?: () => void
  onEndEdit?: () => void
}) {
  if (mixed) {
    return (
      <label className={`block text-xs ${shell.muted}`}>
        <PropertyLabel element={element} property={property} />
        <input
          type="text"
          className={`mt-1 w-full ${shell.input}`}
          value=""
          placeholder="Mixed values"
          readOnly
          onFocus={(event) => {
            onBeginEdit?.()
            event.currentTarget.readOnly = false
            event.currentTarget.placeholder = ''
            event.currentTarget.value = ''
          }}
          onBlur={onEndEdit}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      </label>
    )
  }

  const shape = getPropertyEditorShape(element.type, property)
  const label = <PropertyLabel element={element} property={property} />

  if (shape === 'boolean') {
    return (
      <BooleanOrTemplateField
        value={value}
        label={label}
        tooltip={getPropertyTooltip(element, property)}
        checked={getBooleanPropertyValue(element, property, value)}
        defaultChecked={booleanPropertyDefault(element, property)}
        onChange={onChange}
      />
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
        {label}
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
            onClick={(event) => {
              getScopedElementById(event.currentTarget, `image-upload-${property}`)?.click()
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

  if (shape === 'enum' || shape === 'color') {
    const enumValues = getPropertyEnumValues(property)
    if (enumValues) {
      return (
        <EnumOrTemplateField
          element={element}
          property={property}
          value={value}
          label={label}
          enumValues={enumValues}
          onChange={onChange}
        />
      )
    }
  }

  if (shape === 'json') {
    const samplePlotData =
      element.type === 'plot' && property === 'data'
        ? [
            { entity: 'sensor.temperature', color: 'red', width: 2, smooth: true },
            { entity: 'sensor.humidity', color: 'black', width: 1 },
          ]
        : undefined

    // These JSON fields are REQUIRED by their element schemas — leaving
    // template mode must restore a valid literal, never delete the field
    // (deleting once white-screened the app via element-list-row's
    // `.length` on the missing value).
    const literalFallback =
      property === 'points'
        ? POLYGON_POINTS_PREVIEW
        : property === 'icons'
          ? [...ICON_SEQUENCE_ICONS_PREVIEW]
          : samplePlotData

    return (
      <JsonOrTemplateField
        element={element}
        property={property}
        value={value}
        label={label}
        sampleValue={samplePlotData}
        literalFallback={literalFallback}
        onChange={onChange}
        onBeginEdit={onBeginEdit}
        onEndEdit={onEndEdit}
      />
    )
  }

  if (shape === 'number' || shape === 'coordinate') {
    return (
      <ScalarOrTemplateField
        property={property}
        value={value}
        shape={shape}
        label={label}
        typeMin={
          element.type === 'debug_grid' && property === 'spacing'
            ? DEBUG_GRID_MIN_SPACING
            : undefined
        }
        allowNegative={isAllowNegativeNumberProperty(property)}
        nonNegative={isNonNegativeNumberProperty(property)}
        clampedPercent={isClampedPercentProperty(property)}
        parseScalar={(raw) =>
          shape === 'coordinate'
            ? parseCoordinatePropertyValue(element, property, raw)
            : parseNumberPropertyValue(element, property, raw)
        }
        onChange={onChange}
        onBeginEdit={onBeginEdit}
        onEndEdit={onEndEdit}
      />
    )
  }

  if (isMultilineStringProperty(property) || isCodeLikeStringValue(value)) {
    return (
      <label className={`block text-xs ${shell.muted}`}>
        {label}
        <textarea
          className={`mt-1 w-full font-mono ${shell.input}`}
          rows={4}
          value={formatPropertyValue(value)}
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  return (
    <label className={`block text-xs ${shell.muted}`}>
      {label}
      <input
        type="text"
        className={`mt-1 w-full font-mono ${shell.input}`}
        value={formatPropertyValue(value)}
        onFocus={onBeginEdit}
        onBlur={onEndEdit}
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
  properties: propertiesOverride,
  mixedProperties = [],
  onBeginEdit,
  onEndEdit,
}: ElementPropertyFormProps) {
  const properties = propertiesOverride ?? getEditableProperties(element)
  const mixed = new Set(mixedProperties)

  return (
    <div className="space-y-3">
      {properties.map((property) => (
        <PropertyField
          key={property}
          property={property}
          element={element}
          value={
            mixed.has(property) ? undefined : getPropertyEffectiveValue(element, property)
          }
          mixed={mixed.has(property)}
          fontKeys={fontKeys}
          onChange={(next) =>
            onPropertyChange(property, normalizePropertyValueForStorage(element, property, next))
          }
          onUploadFont={onUploadFont}
          onUploadImageForUrl={onUploadImageForUrl}
          onBeginEdit={onBeginEdit}
          onEndEdit={onEndEdit}
        />
      ))}
    </div>
  )
}
