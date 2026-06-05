import { parseYamlPayload, validatePayload, type DrawElement } from '../../core'

export function tryParseYamlElements(source: string): DrawElement[] | null {
  if (!source.trim()) {
    return []
  }

  try {
    const parsed = parseYamlPayload(source)
    const result = validatePayload(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function elementsSequenceEqual(left: DrawElement[], right: DrawElement[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every(
    (element, index) => JSON.stringify(element) === JSON.stringify(right[index]),
  )
}

export function remapSelectedIndex(
  previousElements: DrawElement[],
  nextElements: DrawElement[],
  selectedIndex: number | null,
): number | null {
  if (selectedIndex == null) {
    return null
  }

  const selected = previousElements[selectedIndex]
  if (!selected) {
    return null
  }

  const selectedJson = JSON.stringify(selected)
  const nextIndex = nextElements.findIndex((element) => JSON.stringify(element) === selectedJson)
  return nextIndex >= 0 ? nextIndex : null
}

export function shouldApplyExternalYamlSync(skipBecauseYamlEdit: boolean): boolean {
  return !skipBecauseYamlEdit
}
