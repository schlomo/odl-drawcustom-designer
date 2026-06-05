export interface YamlScrollCommand {
  elementIndex: number
  /** Stable id for a single UI-originated navigation; yaml edits must not retrigger scroll. */
  token: string
}

export function createYamlScrollCommand(
  couplingEnabled: boolean,
  selectedIndex: number | null,
  selectionSource: 'ui' | 'yaml',
): YamlScrollCommand | null {
  if (!couplingEnabled || selectedIndex == null || selectionSource === 'yaml') {
    return null
  }

  return { elementIndex: selectedIndex, token: `ui:${selectedIndex}` }
}

export function shouldApplyYamlScrollCommand(
  command: YamlScrollCommand,
  lastAppliedToken: string | null,
  pointerActive: boolean,
): boolean {
  if (pointerActive) {
    return false
  }
  return command.token !== lastAppliedToken
}
