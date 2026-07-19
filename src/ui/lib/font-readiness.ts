import {
  collectRequiredFontKeys,
  collectTemplatedFontKeys,
  formatMissingCharacterSample,
  scanGlyphCoverageIssues,
  type DrawElement,
} from '../../core'
import type { FontLoadOutcome } from './font-load-outcome'
import type { StatusMessage } from './status-messages'

export function formatKeyList(keys: readonly string[]): string {
  if (keys.length === 0) {
    return ''
  }
  if (keys.length === 1) {
    return keys[0]!
  }
  if (keys.length === 2) {
    return `${keys[0]} and ${keys[1]}`
  }
  return `${keys.slice(0, -1).join(', ')}, and ${keys.at(-1)}`
}

export function formatElementIndexList(indices: readonly number[]): string {
  const labels = indices.map((index) => String(index + 1))
  return formatKeyList(labels)
}

function glyphCoverageToStatusMessages(
  issues: ReturnType<typeof scanGlyphCoverageIssues>,
): StatusMessage[] {
  const byFont = new Map<string, ReturnType<typeof scanGlyphCoverageIssues>>()

  for (const issue of issues) {
    const group = byFont.get(issue.fontKey) ?? []
    group.push(issue)
    byFont.set(issue.fontKey, group)
  }

  return [...byFont.entries()].map(([fontKey, fontIssues]) => {
    const missingCharacters = new Set<string>()
    for (const issue of fontIssues) {
      for (const char of issue.missingCharacters) {
        missingCharacters.add(char)
      }
    }

    const elementIndices = fontIssues.map((issue) => issue.elementIndex).sort((a, b) => a - b)
    const count = missingCharacters.size
    const sample = formatMissingCharacterSample([...missingCharacters], 8)

    return {
      severity: 'warning' as const,
      title: 'Missing glyphs',
      summary: `${fontKey} does not include ${count} character${count === 1 ? '' : 's'} used in text (element${fontIssues.length === 1 ? '' : 's'} ${formatElementIndexList(elementIndices)}): ${sample}`,
      detail:
        'Preview will show incorrect or blank glyphs. Upload a font that supports this script or change the text.',
    }
  })
}

export function getFontStatusMessages(
  elements: readonly DrawElement[],
  outcomes: ReadonlyMap<string, FontLoadOutcome>,
  fontsLoading: boolean,
): StatusMessage[] {
  const messages: StatusMessage[] = []
  const requiredKeys = collectRequiredFontKeys(elements)
  const templatedKeys = collectTemplatedFontKeys(elements)

  const loadingKeys = requiredKeys.filter((key) => outcomes.get(key)?.status === 'loading')
  const missingOutcomes = requiredKeys
    .map((key) => outcomes.get(key))
    .filter((outcome): outcome is FontLoadOutcome => outcome?.status === 'missing')
  const failedOutcomes = requiredKeys
    .map((key) => outcomes.get(key))
    .filter((outcome): outcome is FontLoadOutcome => outcome?.status === 'failed')

  if (fontsLoading || loadingKeys.length > 0) {
    const keys = loadingKeys.length > 0 ? loadingKeys : requiredKeys
    messages.push({
      severity: 'info',
      title: 'Loading fonts',
      summary: `Loading ${formatKeyList(keys)} for accurate text metrics…`,
      detail:
        'Text position, wrapping, and truncation may be approximate until fonts finish loading.',
    })
  }

  for (const outcome of missingOutcomes) {
    messages.push({
      severity: 'error',
      title: 'Font not available',
      summary: outcome.message ?? `${outcome.key} is missing.`,
      detail:
        'Upload the font in Content Manager or switch to a bundled font (ppb.ttf, rbm.ttf). Preview metrics are unreliable until this is fixed.',
    })
  }

  for (const outcome of failedOutcomes) {
    messages.push({
      severity: 'error',
      title: 'Font failed to load',
      summary: outcome.message ?? `${outcome.key} could not be loaded.`,
      detail: 'Preview text metrics and glyph shapes may not match the device.',
    })
  }

  if (templatedKeys.length > 0) {
    messages.push({
      severity: 'warning',
      title: 'Templated font',
      summary: `${formatKeyList(templatedKeys)} cannot be resolved at preview time.`,
      detail:
        'Preview uses default metrics until the template evaluates on the device. Mock the font key in State Simulator when possible.',
    })
  }

  const fontsReady =
    !fontsLoading && requiredKeys.every((key) => outcomes.get(key)?.status === 'ready')
  if (fontsReady) {
    messages.push(...glyphCoverageToStatusMessages(scanGlyphCoverageIssues(elements)))
  }

  return messages
}

export function previewFontsAreReliable(
  elements: readonly DrawElement[],
  outcomes: ReadonlyMap<string, FontLoadOutcome>,
  fontsLoading: boolean,
): boolean {
  if (fontsLoading) {
    return false
  }

  const requiredKeys = collectRequiredFontKeys(elements)
  for (const key of requiredKeys) {
    if (outcomes.get(key)?.status !== 'ready') {
      return false
    }
  }

  return true
}
