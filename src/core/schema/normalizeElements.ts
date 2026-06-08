import type { DrawElement } from './elements'

type IconElement = Extract<DrawElement, { type: 'icon' }>

/** Merge legacy `color` into `fill` for icon elements (HA accepts both). */
export function normalizeIconElement(element: IconElement): IconElement {
  const record = element as Record<string, unknown>
  if (record.color === undefined) {
    return element
  }

  const next = { ...element } as Record<string, unknown>
  if (next.fill === undefined) {
    next.fill = record.color
  }
  delete next.color
  return next as IconElement
}

export function normalizeDrawElement(element: DrawElement): DrawElement {
  if (element.type === 'icon') {
    return normalizeIconElement(element)
  }
  return element
}

export function normalizePayload(elements: DrawElement[]): DrawElement[] {
  return elements.map(normalizeDrawElement)
}
