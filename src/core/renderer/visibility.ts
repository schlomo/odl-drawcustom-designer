import { hasTemplateSyntax } from '../templates/patterns'

type VisibleInput = boolean | string | undefined

export function isVisible(visible: VisibleInput): boolean {
  if (visible === undefined) {
    return true
  }
  if (typeof visible === 'boolean') {
    return visible
  }
  if (hasTemplateSyntax(visible)) {
    return true
  }
  return visible.toLowerCase() === 'true'
}

export function parseBool(value: boolean | 'true' | 'false' | 'True' | 'False' | undefined): boolean {
  if (value === undefined) {
    return false
  }
  if (typeof value === 'boolean') {
    return value
  }
  return value.toLowerCase() === 'true'
}
