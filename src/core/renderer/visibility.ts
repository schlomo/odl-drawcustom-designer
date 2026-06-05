type VisibleInput = boolean | 'true' | 'false' | 'True' | 'False' | undefined

export function isVisible(visible: VisibleInput): boolean {
  if (visible === undefined) {
    return true
  }
  if (typeof visible === 'boolean') {
    return visible
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
