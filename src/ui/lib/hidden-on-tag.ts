import { isVisible, type DrawElement } from '../../core'

/** Explicit `fill: none` on a property that supports fill (evaluated preview value). */
export function isFillNoneOnTag(element: DrawElement): boolean {
  return 'fill' in element && element.fill === 'none'
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
