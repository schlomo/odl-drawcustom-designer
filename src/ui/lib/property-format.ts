export const TEMPLATE_EDITOR_STARTER = '{{ }}'

export function formatPropertyValue(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}
