import { normalizeMdiIconName, resolveMdiPath } from '../core'
import type { HostAction, HostActionHandler, HostActionSeverity } from './types'

/** Shared empty list: an actions-free designer allocates nothing per render. */
export const NO_HOST_ACTIONS: readonly HostAction[] = Object.freeze([])

const SEVERITIES: readonly HostActionSeverity[] = ['normal', 'caution', 'danger']

function fail(message: string): never {
  throw new TypeError(`Invalid host actions: ${message}`)
}

/** Non-empty text, with the host's incidental padding removed. */
function requireText(value: unknown, field: string, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${where} needs a non-empty ${field} (got ${JSON.stringify(value)})`)
  }
  return value.trim()
}

/**
 * Validate and copy a host-pushed action list (issue #108).
 *
 * **Throws** rather than dropping bad entries: an unknown icon name or a
 * duplicate id is a host programming error, and a button that silently
 * disappears (or renders without the icon the host asked for) is the kind of
 * thing that ships. Same contract as `setPayload()`'s YAML parse — the push
 * that carries the mistake is where it surfaces, and a rejected push leaves
 * the designer exactly as it was.
 *
 * The returned actions are frozen copies carrying only known fields, so the
 * push-diff compares against data no host can mutate behind it (unlike
 * `states`, whose snapshot is retained by reference for cost reasons — see
 * `HostStates`).
 */
export function normalizeHostActions(actions: readonly HostAction[]): readonly HostAction[] {
  if (!Array.isArray(actions)) {
    fail(`expected an array, got ${typeof actions}`)
  }
  if (actions.length === 0) {
    return NO_HOST_ACTIONS
  }

  const seen = new Set<string>()
  // `Array.from`, not `map`: `map` skips a sparse array's holes, and a hole
  // that survives validation renders as nothing at all — the silent drop this
  // whole function exists to prevent.
  const normalized = Array.from(actions, (action, index) => {
    if (action == null || typeof action !== 'object') {
      fail(`entry ${index} is not an action object`)
    }
    const id = requireText(action.id, 'id', `entry ${index}`)
    if (seen.has(id)) {
      fail(`duplicate action id ${JSON.stringify(id)}`)
    }
    seen.add(id)

    const where = `action ${JSON.stringify(id)}`
    const normalizedAction: HostAction = {
      id,
      label: requireText(action.label, 'label', where),
    }
    if (action.icon !== undefined) {
      const icon = requireText(action.icon, 'icon', where)
      if (resolveMdiPath(icon) === null) {
        fail(
          `${where} has unknown icon ${JSON.stringify(action.icon)} — expected a Material Design Icon name, the same vocabulary a payload icon element accepts (e.g. "send", "mdi:home-assistant")`,
        )
      }
      // Store the canonical lookup key so `mdi:Send` and `send` are one value
      // to the push-diff rather than two.
      normalizedAction.icon = normalizeMdiIconName(icon)
    }
    if (action.severity !== undefined) {
      if (!SEVERITIES.includes(action.severity)) {
        fail(
          `${where} has unknown severity ${JSON.stringify(action.severity)} — known severities: ${SEVERITIES.join(', ')}`,
        )
      }
      normalizedAction.severity = action.severity
    }
    if (action.needsPayload !== undefined) {
      if (typeof action.needsPayload !== 'boolean') {
        fail(`${where} has a non-boolean needsPayload (got ${JSON.stringify(action.needsPayload)})`)
      }
      normalizedAction.needsPayload = action.needsPayload
    }
    if (action.disabledReason !== undefined) {
      normalizedAction.disabledReason = requireText(
        action.disabledReason,
        'disabledReason',
        where,
      )
    }
    return Object.freeze(normalizedAction)
  })

  return Object.freeze(normalized)
}

/**
 * Reject actions no one can hear about (Copilot review, issue #108).
 *
 * `onAction` is fixed at mount — ADR-018 pushes data, never functions — so a
 * host that registered no handler can never gain one. Buttons pushed to it
 * would render enabled and do nothing, forever; failing loudly at the push
 * (or at `mount()`) is the same contract as a malformed list. Clearing the
 * list stays legal: there is nothing left that could fire.
 */
export function assertActionsAreHandled(
  actions: readonly HostAction[],
  onAction: HostActionHandler | undefined,
  where: string,
): void {
  if (actions.length > 0 && onAction == null) {
    fail(
      `${where} was given ${actions.length} action(s) but no onAction handler — pass onAction to mount() (it is fixed there, so actions registered without it can never fire)`,
    )
  }
}

/**
 * Structural equality for two normalized action lists — the designer's diff
 * (ADR-018: "the host re-pushes the list … the designer diffs"). An unchanged
 * re-push then keeps the previous list *identity*, so React bails out of the
 * render entirely instead of re-rendering the toolbar.
 */
export function hostActionsEqual(a: readonly HostAction[], b: readonly HostAction[]): boolean {
  if (a === b) {
    return true
  }
  if (a.length !== b.length) {
    return false
  }
  return a.every((action, index) => {
    const other = b[index]!
    return (
      action.id === other.id &&
      action.label === other.label &&
      action.icon === other.icon &&
      action.severity === other.severity &&
      action.needsPayload === other.needsPayload &&
      action.disabledReason === other.disabledReason
    )
  })
}
