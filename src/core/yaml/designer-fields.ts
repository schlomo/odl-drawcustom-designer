/** Fields stored in the designer but never exported to Home Assistant. */
export const DESIGNER_ONLY_FIELDS = ['preview_data_url', '_yaml_comments'] as const

export function isDesignerOnlyKey(key: string): boolean {
  return key.startsWith('_') || (DESIGNER_ONLY_FIELDS as readonly string[]).includes(key)
}

export function stripDesignerFields<T extends Record<string, unknown>>(element: T): T {
  const cleaned = { ...element }
  for (const key of Object.keys(cleaned)) {
    if (isDesignerOnlyKey(key)) {
      delete cleaned[key]
    }
  }
  return cleaned
}

export function stripDesignerFieldsFromPayload(
  elements: Record<string, unknown>[],
): Record<string, unknown>[] {
  return elements.map((element) => stripDesignerFields(element))
}
