import type { AssetUploadResult, DrawElement } from '../../core'
import {
  getPropertyEffectiveValue,
  getSharedEditableProperties,
  isSharedPropertyValueMixed,
} from '../lib/property-field-meta'
import { ElementPropertyForm } from './ElementPropertyForm'
import { shell } from '../styles/shell'

interface SharedPropertyFormProps {
  elements: DrawElement[]
  fontKeys: string[]
  onPropertyChange: (key: string, value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
  onUploadImageForUrl: (urlKey: string, file: File) => Promise<AssetUploadResult>
  onBeginEdit?: () => void
  onEndEdit?: () => void
}

export function SharedPropertyForm({
  elements,
  fontKeys,
  onPropertyChange,
  onUploadFont,
  onUploadImageForUrl,
  onBeginEdit,
  onEndEdit,
}: SharedPropertyFormProps) {
  const sharedProperties = getSharedEditableProperties(elements)

  if (sharedProperties.length === 0) {
    return (
      <p className={`text-sm ${shell.muted}`}>
        No shared editable fields across the selected element types. Edit one element at a time or
        align/move the selection from the canvas.
      </p>
    )
  }

  const representative = elements[0]!
  const proxyElement = {
    ...representative,
    ...Object.fromEntries(
      sharedProperties.map((property) => {
        if (isSharedPropertyValueMixed(elements, property)) {
          return [property, undefined]
        }
        return [property, getPropertyEffectiveValue(representative, property)]
      }),
    ),
  } as DrawElement

  return (
    <div className="space-y-4">
      <p className={`text-xs ${shell.muted}`}>
        Shared fields apply to all {elements.length} selected elements.
      </p>
      <ElementPropertyForm
        element={proxyElement}
        fontKeys={fontKeys}
        onPropertyChange={onPropertyChange}
        onUploadFont={onUploadFont}
        onUploadImageForUrl={onUploadImageForUrl}
        properties={sharedProperties}
        mixedProperties={sharedProperties.filter((property) =>
          isSharedPropertyValueMixed(elements, property),
        )}
        onBeginEdit={onBeginEdit}
        onEndEdit={onEndEdit}
      />
    </div>
  )
}
