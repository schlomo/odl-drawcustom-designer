import type { ImportNormalization } from '../../core'
import type { StatusMessage } from './status-messages'

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

/**
 * The import notice (maintainer ruling: "we normalize y to 0 with an info").
 * An import is never silently rewritten — this names both cleanups and says
 * which of them can have moved something: the vertical coordinate can, the
 * dropped `multiline` `spacing` cannot.
 */
export function getImportNormalizationMessage(
  normalization: ImportNormalization | null,
): StatusMessage | null {
  if (!normalization) {
    return null
  }
  const { verticalCount, verticalTypes, spacingCount } = normalization
  if (verticalCount === 0 && spacingCount === 0) {
    return null
  }

  const summary: string[] = []
  const detail: string[] = []

  if (verticalCount > 0) {
    summary.push(
      `${plural(verticalCount, 'element')} had no vertical coordinate — set to 0 (${verticalTypes.join(', ')}).`,
    )
    detail.push(
      'Home Assistant would have stacked those below the element before them, using a document-flow cursor this designer deliberately does not have — so they may sit somewhere else than on the display. Check their position.',
    )
  }

  if (spacingCount > 0) {
    summary.push(`Removed spacing from ${plural(spacingCount, 'multiline element')}.`)
    detail.push(
      'Home Assistant never read spacing on a multiline — offset_y is the line advance — so dropping it changes nothing you can see.',
    )
  }

  return {
    severity: 'info',
    title: 'Imported design made explicit',
    summary: summary.join(' '),
    detail: detail.join(' '),
  }
}
