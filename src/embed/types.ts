import type { DrawElement } from '../core'

/** Theme applied to the mount container (never `document.documentElement`). */
export type EmbedTheme = 'light' | 'dark'

/** A pushed entity state with optional attributes. */
export interface HostEntityState {
  state: string | number | boolean
  attributes?: Record<string, unknown>
}

/**
 * Host-pushed entity states: entity-id -> state value or {state, attributes}.
 * When provided, this replaces the State Simulator's persisted mock source
 * for template preview (ADR-010; live HA feed is a later milestone).
 */
export type HostStates = Record<string, string | number | boolean | HostEntityState>

/**
 * Display description driving canvas setup. Mirrors the payload shape of the
 * OpenDisplay HA integration's `capabilities.py` (OpenDisplay HA PR #44) so a
 * host-side adapter can pass it through unchanged. All fields optional —
 * unknown or missing fields leave the corresponding canvas setting untouched.
 */
export interface HostCapabilities {
  /** Physical panel width in pixels (before rotation). */
  pixel_width?: number
  /** Physical panel height in pixels (before rotation). */
  pixel_height?: number
  /** Mounting rotation in degrees; only quarter turns are representable. */
  rotation_degrees?: number
  /** Drawing-surface width after rotation; preferred over pixel_width. */
  render_width?: number
  /** Drawing-surface height after rotation; preferred over pixel_height. */
  render_height?: number
  /** OpenDisplay Basic Standard colour scheme (0x00 BW … 0x04 six-color). */
  color_scheme?: number
  /** Accent color name, e.g. 'red' or 'yellow'. */
  accent_color?: string
  /** Palette color names, e.g. ['black', 'white', 'red']. */
  available_colors?: string[]
  /** Palette name -> hex map, e.g. { black: '#000000', … }. */
  color_map?: Record<string, string>
  /** Whether the palette hexes were measured on real hardware. */
  palette_measured?: boolean
}

/**
 * Options accompanying a `capabilities` push (issue #70). Kept separate from
 * `HostCapabilities` itself, which mirrors the OpenDisplay HA integration's
 * `capabilities.py` payload verbatim — `lock` is an embedding-only directive,
 * not a physical display property, so it travels alongside the capabilities
 * payload rather than inside it.
 */
export interface CapabilitiesPushOptions {
  /**
   * Whether the pushed display locks the display config controls.
   * Default `true` — unchanged behavior for hosts that never pass this.
   * `false` seeds a "virtual display": the canvas adopts the pushed values,
   * controls stay enabled, and the lock icon shows unlocked (still present,
   * so the user can lock onto the pushed values later).
   */
  lock?: boolean
}

export interface MountOptions {
  /** Initial drawcustom YAML payload (list of draw elements). */
  payload?: string
  /** Initial entity states for template preview. */
  states?: HostStates
  /** Initial display capabilities. */
  capabilities?: HostCapabilities
  /**
   * Whether the initial `capabilities` lock the display config controls.
   * Only meaningful alongside `capabilities`. Default `true`.
   */
  lock?: boolean
  /** Initial theme; defaults to 'light'. */
  theme?: EmbedTheme
  /**
   * Called with the current drawcustom YAML payload when the user hits Save.
   * The parent owns persistence in embedded mode — the designer never writes
   * the payload anywhere itself (ADR-010).
   */
  onSaveRequest?: (payload: string) => void
}

export interface MountHandle {
  /**
   * The designer build's version (issue #23, reworked 2026-07-29: git tags
   * are the sole version source, `package.json` stays pinned at `0.0.0`),
   * e.g. `'1.0.0'`. A release build bakes in the tag-derived version via the
   * `APP_VERSION` env var (`tools/autoRelease.ts` sets it, `tools/version.ts`
   * resolves it); any other build (local dev, CI `checks`) falls back to
   * `'0.0.0-dev'`, and Vitest gets the fixed string `'test'`. Same value as
   * the library's `version` export (`src/embed/index.ts`); handy when a host
   * only has the handle.
   */
  readonly version: string
  /** Unmount the designer and remove everything from the container. */
  destroy(): void
  /** Push a full replacement entity-state map for template preview. */
  setStates(states: HostStates): void
  /**
   * Push a display description; maps onto canvas size, rotation and palette.
   * `options.lock` (default `true`) controls whether this push locks the
   * display config controls (issue #70) — `false` seeds an unlocked "virtual
   * display" the user is free to change immediately.
   */
  setCapabilities(capabilities: HostCapabilities, options?: CapabilitiesPushOptions): void
  /** Replace the current payload with new drawcustom YAML (throws on invalid YAML). */
  setPayload(payload: string): void
  /** Switch the container-scoped theme. */
  setTheme(theme: EmbedTheme): void
}

/**
 * Applies host pushes to the running designer. Registered by the React shell
 * once its state exists; every method is invoked from a host event (a
 * `MountHandle` setter), the React-sanctioned place to call setState from.
 */
export interface HostPushTarget {
  applyStates(states: HostStates): void
  applyCapabilities(capabilities: HostCapabilities, options?: CapabilitiesPushOptions): void
  applyPayload(elements: DrawElement[]): void
}

/**
 * Internal bridge handed to the React shell when embedded. Initial values
 * travel in the bootstrap; later host pushes go through the registered push
 * target (mount queues pushes that arrive before registration).
 */
export interface EmbedHostBridge {
  onSaveRequest?: (payload: string) => void
  theme: EmbedTheme
  /** Returns an unregister function (called on unmount). */
  registerPushTarget(target: HostPushTarget): () => void
}
