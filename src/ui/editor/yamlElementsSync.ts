import { parseYamlPayload, serializeYamlPayload, validatePayload, type DrawElement } from '../../core'

/** Normalize key order / quoting via yaml round-trip so comparisons are stable. */
function canonicalPayloadYaml(elements: DrawElement[]): string {
  const yaml = serializeYamlPayload(elements)
  const parsed = tryParseYamlElements(yaml)
  return parsed ? serializeYamlPayload(parsed) : yaml
}

function canonicalElementYaml(element: DrawElement): string {
  return canonicalPayloadYaml([element])
}

function elementsAtIndexEquivalent(
  left: DrawElement[],
  right: DrawElement[],
  index: number,
): boolean {
  return canonicalElementYaml(left[index]!) === canonicalElementYaml(right[index]!)
}

export interface YamlElementsParseIssue {
  path: string
  message: string
}

export function getYamlElementsParseIssues(source: string): YamlElementsParseIssue[] {
  if (!source.trim()) {
    return []
  }

  try {
    const parsed = parseYamlPayload(source)
    const result = validatePayload(parsed)
    if (result.success) {
      return []
    }

    return result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : 'payload',
      message: issue.message,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML'
    return [{ path: 'yaml', message }]
  }
}

export function summarizeYamlElementsParseIssues(issues: YamlElementsParseIssue[]): string | null {
  if (issues.length === 0) {
    return null
  }

  const first = issues[0]!
  const label = first.path === 'payload' ? 'Payload' : first.path
  const lead = `${label}: ${first.message}`
  if (issues.length === 1) {
    return lead
  }

  return `${issues.length} validation errors — ${lead}`
}

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

  return canonicalPayloadYaml(left) === canonicalPayloadYaml(right)
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

  const selectedYaml = canonicalElementYaml(selected)
  const exactMatch = nextElements.findIndex(
    (element) => canonicalElementYaml(element) === selectedYaml,
  )
  if (exactMatch >= 0) {
    return exactMatch
  }

  // Single property edit at the selected index (canvas / property panel / YAML).
  if (nextElements.length === previousElements.length) {
    const changedIndices: number[] = []
    for (let i = 0; i < previousElements.length; i += 1) {
      if (!elementsAtIndexEquivalent(previousElements, nextElements, i)) {
        changedIndices.push(i)
      }
    }
    if (changedIndices.length === 1 && changedIndices[0] === selectedIndex) {
      return selectedIndex
    }
  }

  // Same slot and type after a yaml round-trip that only touched the selected element.
  if (
    nextElements.length === previousElements.length &&
    selectedIndex < nextElements.length &&
    nextElements[selectedIndex]?.type === selected.type
  ) {
    return selectedIndex
  }

  return null
}

export function shouldApplyExternalYamlSync(skipBecauseYamlEdit: boolean): boolean {
  return !skipBecauseYamlEdit
}
