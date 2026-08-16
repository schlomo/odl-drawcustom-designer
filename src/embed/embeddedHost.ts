import { parseYamlPayload } from '../core'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import { DEFAULT_DISPLAY_CONFIG } from '../ui/preferences/displayConfig'
import type { DesignerHost } from './host'
import { assertActionsAreHandled, normalizeHostActions } from './hostActions'
import { normalizeHostTargets } from './hostTargets'
import { capabilitiesToCanvas, hostStatesToMockData } from './hostContract'
import type { MountOptions } from './types'

function buildEmbedBootstrap(options: MountOptions): AppBootstrap {
  const mock = options.states
    ? hostStatesToMockData(options.states)
    : { states: {}, attributes: {} }
  const canvas = capabilitiesToCanvas(options.capabilities ?? {}, DEFAULT_DISPLAY_CONFIG)
  return {
    sessionName: 'Untitled',
    elements: options.payload ? parseYamlPayload(options.payload) : [],
    canvas,
    // Host-defined display (issue #70): presence locks the display config
    // controls by default; `lock: false` seeds an unlocked "virtual display"
    // instead (the lock icon still shows so the user can lock onto it later).
    hostDisplay: options.capabilities ? canvas : undefined,
    hostDisplayLocked: options.lock ?? true,
    service: undefined,
    mockStates: mock.states,
    mockAttributes: mock.attributes,
    variables: {},
    importSource: 'default',
  }
}

/**
 * Embedded host adapter (issue #72, ADR-017): what the public
 * `mount(container, options)` API builds. Shadow-isolated DOM, host-supplied
 * theme scoped to the mount wrapper, no local persistence — the host owns the
 * payload and receives it through `onSaveRequest` (ADR-010).
 */
export function createEmbeddedHost(options: MountOptions): DesignerHost {
  // Validated eagerly, before `mount()` touches the container: a malformed
  // action list must throw out of `mount()` itself (same contract as invalid
  // `payload` YAML), not half-mount and then fail while rendering.
  const actions = options.actions ? normalizeHostActions(options.actions) : undefined
  if (actions) {
    assertActionsAreHandled(actions, options.onAction, 'mount()')
  }
  const targets = options.targets ? normalizeHostTargets(options.targets) : undefined
  return {
    styleScope: 'shadow',
    theme: { owner: 'host', value: options.theme ?? 'light' },
    fill: 'container',
    shareLink: false,
    persistence: null,
    onSaveRequest: options.onSaveRequest,
    actions,
    onAction: options.onAction,
    targets,
    onTargetSelected: options.onTargetSelected,
    // Synchronous: invalid `payload` YAML must throw out of `mount()` itself.
    loadBootstrap: () => buildEmbedBootstrap(options),
  }
}
