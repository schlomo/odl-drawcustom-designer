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

export interface ElementScrollRequest {
  elementIndex: number
  /** Unique per canvas click, so re-clicking the same element re-scrolls. */
  token: string
}

export function createYamlScrollCommand(
  couplingEnabled: boolean,
  selectedIndex: number | null,
  selectionSource: 'ui' | 'yaml',
  elementScrollRequest: ElementScrollRequest | null = null,
): YamlScrollCommand | null {
  if (!couplingEnabled || selectedIndex == null) {
    return null
  }

  // A canvas click on the already-selected element changes neither the
  // selection nor the document, so nothing else re-issues a scroll — the
  // request's fresh per-click token does. It also outranks the
  // selectionSource === 'yaml' suppression below: that guard exists so YAML
  // *cursor* moves don't yank their own pane, but a canvas click is an
  // explicit navigation even when the selection was last set from YAML.
  // Only honored while it targets the current selection — a stale request
  // must never shadow (or re-fire after) a later navigation.
  if (elementScrollRequest && elementScrollRequest.elementIndex === selectedIndex) {
    return { kind: 'element', elementIndex: selectedIndex, token: elementScrollRequest.token }
  }

  if (selectionSource === 'yaml') {
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
