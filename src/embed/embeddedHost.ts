import { parseYamlPayload } from '../core'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import { DEFAULT_DISPLAY_CONFIG } from '../ui/preferences/displayConfig'
import type { DesignerHost } from './host'
import { assertActionsAreHandled, normalizeHostActions } from './hostActions'
import { autoAdoptedHostTarget, normalizeHostTargets } from './hostTargets'
import { assertHostStates, capabilitiesToCanvas, hostStatesToMockData } from './hostContract'
import type { HostTarget, MountOptions } from './types'

function buildEmbedBootstrap(
  options: MountOptions,
  targets: readonly HostTarget[] | undefined,
): AppBootstrap {
  const mock = options.states
    ? hostStatesToMockData(options.states)
    : { states: {}, attributes: {} }
  // A single pushed display is adopted without a pick (issue #121): the mount
  // option is an initial push (ADR-018 seam grammar), so the very first painted
  // frame is already that display, locked — no host-visible window of default,
  // unlocked config, and no separate seeding option to keep in sync with it.
  const adopted = targets ? autoAdoptedHostTarget(targets) : null
  // A copy of the canonical defaults, never the shared object itself: the
  // bootstrap's canvas becomes live, mutable-by-setState designer state.
  const canvas = adopted
    ? capabilitiesToCanvas(adopted.capabilities, DEFAULT_DISPLAY_CONFIG.previewDitherMode)
    : { ...DEFAULT_DISPLAY_CONFIG }
  return {
    sessionName: 'Untitled',
    elements: options.payload ? parseYamlPayload(options.payload) : [],
    canvas,
    // Host-defined display (issue #70): presence is what enables the lock (and
    // starts locked), and re-locking returns to it.
    hostDisplay: adopted ? canvas : undefined,
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
 * payload and reads it through `getPayload()` or an action callback (ADR-010,
 * ADR-018).
 */
export function createEmbeddedHost(options: MountOptions): DesignerHost {
  // Validated eagerly, before `mount()` touches the container: a malformed
  // action list must throw out of `mount()` itself (same contract as invalid
  // `payload` YAML), not half-mount and then fail while rendering. A mount
  // option *is* an initial push (ADR-018 seam grammar), so `states` is held to
  // the same standard as a later `setStates()` — identical validation, identical
  // error (maintainer ruling 2026-08-17).
  if (options.states !== undefined) {
    assertHostStates(options.states)
  }
  const actions = options.actions ? normalizeHostActions(options.actions) : undefined
  if (actions) {
    assertActionsAreHandled(actions, options.onAction, 'mount()')
  }
  const targets = options.targets ? normalizeHostTargets(options.targets) : undefined
  // The preview provider gets the same eager contract (issue #109): a
  // non-function would otherwise surface as a TypeError from inside a render,
  // long after `mount()` returned successfully and painted its toggle.
  if (options.renderPreview != null && typeof options.renderPreview !== 'function') {
    throw new TypeError('Invalid host preview renderer: renderPreview must be a function')
  }
  return {
    styleScope: 'shadow',
    theme: { owner: 'host', value: options.theme ?? 'light' },
    fill: 'container',
    shareLink: false,
    persistence: null,
    // Presence is the host-fed-states policy (issue #107): pushing `states` at
    // mount turns the Simulator off and paints the referenced-states panel on
    // the first frame instead — an initial push, exactly like `actions` and
    // `targets` (ADR-018 seam grammar).
    states: options.states,
    actions,
    onAction: options.onAction,
    targets,
    onTargetSelected: options.onTargetSelected,
    renderPreview: options.renderPreview,
    // Last asset tier (issue #138): the mount lifecycle installs it, so the
    // very first frame can already paint host-supplied fonts and images.
    resolveAsset: options.resolveAsset,
    // Synchronous: invalid `payload` YAML must throw out of `mount()` itself.
    loadBootstrap: () => buildEmbedBootstrap(options, targets),
  }
}
