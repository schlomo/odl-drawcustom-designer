export type YamlScrollCommand =
  | {
      kind: 'element'
      elementIndex: number
      /** Stable id for a single UI-originated navigation; yaml edits must not retrigger scroll. */
      token: string
    }
  | {
      kind: 'entity'
      entityId: string
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

  return { kind: 'element', elementIndex: selectedIndex, token: `ui:${selectedIndex}` }
}

export function createEntityScrollCommand(
  couplingEnabled: boolean,
  request: { entityId: string; token: string } | null,
): YamlScrollCommand | null {
  if (!couplingEnabled || !request) {
    return null
  }

  return { kind: 'entity', entityId: request.entityId, token: request.token }
}

export function mergeYamlScrollCommands(
  elementCommand: YamlScrollCommand | null,
  entityCommand: YamlScrollCommand | null,
): YamlScrollCommand | null {
  if (elementCommand) {
    return elementCommand
  }
  return entityCommand
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
