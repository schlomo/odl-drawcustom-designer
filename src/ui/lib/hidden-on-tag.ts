import { getPropertyEffectiveValue, isVisible, type DrawElement } from '../../core'

const ICON_FILL_NONE_TYPES = new Set<DrawElement['type']>(['icon', 'icon_sequence'])

const STROKE_OUTLINE_TYPES = new Set<DrawElement['type']>([
  'arc',
  'polygon',
  'rectangle',
  'ellipse',
  'circle',
  'rectangle_pattern',
  'progress_bar',
])

function effectiveStrokeWidth(element: DrawElement): number {
  const value = getPropertyEffectiveValue(element, 'width')
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed)
    }
  }
  return 1
}

/** Whether outline/stroke would still draw on the tag (evaluated preview value). */
function hasVisibleStrokeOnTag(element: DrawElement): boolean {
  if (!STROKE_OUTLINE_TYPES.has(element.type)) {
    return false
  }

  const outline = getPropertyEffectiveValue(element, 'outline')
  if (outline === null || outline === 'none') {
    return false
  }

  return effectiveStrokeWidth(element) > 0
}

/** Explicit `fill: none` with no other visible geometry on the tag at current preview state. */
export function isFillNoneOnTag(element: DrawElement): boolean {
  if (!('fill' in element) || element.fill !== 'none') {
    return false
  }

  if (ICON_FILL_NONE_TYPES.has(element.type)) {
    return true
  }

  if (STROKE_OUTLINE_TYPES.has(element.type)) {
    return !hasVisibleStrokeOnTag(element)
  }

  return true
}

/** Element will not appear on the tag at current preview state. */
export function isHiddenOnTag(element: DrawElement): boolean {
  if ('visible' in element && !isVisible(element.visible)) {
    return true
  }
  return isFillNoneOnTag(element)
}

export function isInvisibleElement(element: DrawElement): boolean {
  return 'visible' in element && !isVisible(element.visible)
}
