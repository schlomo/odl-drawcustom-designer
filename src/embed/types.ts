import type { DrawElement } from '../core'

/** Theme applied to the mount container (never `document.documentElement`). */
export type EmbedTheme = 'light' | 'dark'

/**
 * How prominently an action's button warns before it is clicked (issue #108,
 * ADR-018):
 *
 * - `'normal'` (default) — regular button chrome.
 * - `'caution'` — orange: the action reaches beyond the designer, e.g. the
 *   OpenDisplay integration's Send-to-display drives physical hardware.
 * - `'danger'` — red: the action destroys or overwrites something.
 *
 * Severity is *presentation only*. The designer never infers meaning from it
 * — confirmation, auth and the actual call stay host-side.
 */
export type HostActionSeverity = 'normal' | 'caution' | 'danger'

/**
 * One host-registered toolbar button (issue #108, ADR-018 actions seam).
 *
 * The host owns what the button means; the designer owns how it looks and
 * reports which one fired, with the current payload (`onAction`). This is a
 * typed, closed button list — deliberately not a plugin API: no host markup,
 * styles or components ever enter the designer's shadow root (ADR-017).
 */
export interface HostAction {
  /**
   * Opaque, host-defined identity, echoed back by `onAction`. Also the list's
   * diff key: re-pushing the same id updates that button in place rather than
   * replacing it. Must be unique within a push.
   */
  id: string
  /** Button text, shown as-is (surrounding whitespace trimmed). Also its accessible name. */
  label: string
  /**
   * Optional [Material Design Icon](https://pictogrammer.com/library/mdi/)
   * name — the same vocabulary a payload `icon` element accepts, resolved
   * the same way (`mdi:` prefix optional, e.g. `send`, `mdi:home-assistant`).
   * The designer bundles the full MDI set for the payload's icon element
   * anyway, so every one of those names is available to a host at no added
   * bundle size and with no icon dependency of its own. An unknown name is
   * rejected, not ignored.
   */
  icon?: string
  /** Button chrome; defaults to `'normal'`. */
  severity?: HostActionSeverity
  /**
   * Whether this action reads the designer's payload; defaults to `true`.
   *
   * A payload-carrying action is disabled while the YAML editor is blocked by
   * a parse/schema error — the same rule that disables Save. An action that
   * does *not* need the payload (host-side settings, a reconnect, a help
   * link) sets `false` and stays clickable throughout; it still receives the
   * last valid payload, exactly as {@link MountHandle.getPayload} documents
   * for a blocked document.
   */
  needsPayload?: boolean
  /**
   * When set, the button renders visibly disabled and this text is what the
   * user gets on hover ("Display offline", "No target selected"). Clearing it
   * in a later push re-enables the button — this is the field hosts re-push
   * as their own state changes.
   */
  disabledReason?: string
}

/**
 * Third argument of `onAction` — the opaque ids that accompany the payload.
 */
export interface HostActionContext {
  /**
   * The selected target's opaque host id (issue #106), or `undefined` when
   * the design is not pinned to one — no targets pushed, none picked yet, or
   * the user switched to the virtual display. Always the same value the last
   * {@link MountOptions.onTargetSelected} call reported.
   */
  targetId?: string
}

/**
 * Fired when the user clicks a host-registered action.
 *
 * `payload` is the current drawcustom YAML — the exact string
 * {@link MountHandle.getPayload} returns at that instant (same serializer,
 * same pending-edit flush), so a host never has to reconcile two readings of
 * the same design.
 */
export type HostActionHandler = (
  id: string,
  payload: string,
  context: HostActionContext,
) => void

/** A pushed entity state with optional attributes. */
export interface HostEntityState {
  state: string | number | boolean
  attributes?: Record<string, unknown>
}

/**
 * Host-pushed entity states: entity-id -> state value or {state, attributes}.
 * When provided, this replaces the State Simulator's persisted mock source
 * for template preview (ADR-010; live HA feed is a later milestone).
 *
 * Ownership contract (issue #110): treated as an **immutable snapshot** at
 * the moment `setStates()` is called. Repeated pushes are diffed
 * structurally against the previously applied object to keep a 4x/s
 * full-registry push cheap (no re-render, no template re-evaluation when
 * nothing changed) — that diff compares by value against the retained
 * reference, not by cloning, so **mutate-and-repush is unsupported**:
 * mutating this same object in place and calling `setStates()` again with
 * that reference is invisible to the diff and silently treated as
 * "unchanged". Construct a fresh object per push instead (see
 * docs/embedding.md's `states` section).
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
 * One display the host knows about (issue #106, ADR-018 targets seam).
 *
 * The host pushes the list, the designer renders a picker inside its own
 * display-config area, and selecting an entry adopts that display's
 * capabilities behind the existing lock (issue #70). The id is **opaque**: it
 * round-trips through `onTargetSelected` and `onAction`'s context untouched,
 * and the designer never learns what it names (ADR-018: domain-neutral
 * vocabulary — "target", never "entity").
 */
export interface HostTarget {
  /**
   * Opaque, host-defined identity, echoed back by `onTargetSelected` and
   * `onAction`. Also the list's diff key: re-pushing the same id keeps a
   * selection on it. Must be unique within a push.
   */
  id: string
  /** Picker entry text, shown as-is (surrounding whitespace trimmed). */
  label: string
  /**
   * The display this target *is* — the same shape the `capabilities` channel
   * takes, mapped onto the canvas by exactly the same code. Only the
   * documented {@link HostCapabilities} fields are retained; the copy the
   * designer keeps is frozen, so mutating the pushed object afterwards
   * cannot change what the picker applies.
   */
  capabilities: HostCapabilities
}

/**
 * Called when the effective display target changes (issue #106).
 *
 * `null` means "no target": the user picked the virtual display, unlocked the
 * display config, or has not picked anything yet. Fires only on a *change*,
 * never for the initial (target-less) state, and never as a side effect of a
 * `setTargets` push — a push that removes the selected display keeps it
 * (marked stale) rather than switching, so there is nothing new to report.
 *
 * A stable closure fixed at mount: ADR-018 pushes data, never functions.
 */
export type HostTargetSelectedHandler = (targetId: string | null) => void

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
   * Initial host action buttons (issue #108). A mount option *is* an initial
   * push (ADR-018 seam grammar): identical to calling
   * {@link MountHandle.setActions} before the first painted frame, and
   * re-pushable from then on. A malformed list throws out of `mount()`, like
   * an invalid `payload`.
   *
   * Requires {@link MountOptions.onAction}: registering actions no one can
   * hear about is rejected rather than rendered.
   */
  actions?: readonly HostAction[]
  /**
   * Called when the user clicks one of the {@link MountOptions.actions}.
   * A stable closure — there is no update channel for it (ADR-018: data is
   * pushed, functions are not) — which is why a mount without it can never
   * take actions, at mount time or through a later `setActions()`.
   */
  onAction?: HostActionHandler
  /**
   * Initial display targets (issue #106). A mount option *is* an initial push
   * (ADR-018 seam grammar): identical to calling
   * {@link MountHandle.setTargets} before the first painted frame, and
   * re-pushable from then on. A malformed list throws out of `mount()`, like
   * an invalid `payload`.
   *
   * Pushing targets only says what the user *can* pick — it never moves the
   * canvas by itself. Seeding the display the designer starts on stays
   * {@link MountOptions.capabilities}'s job in 1.x (at 2.0 the targets seam
   * subsumes it, issue #121).
   */
  targets?: readonly HostTarget[]
  /**
   * Called when the selected display target changes, including to `null` for
   * the virtual display. Optional: a host that only needs the id when
   * something happens gets it from `onAction`'s context instead. Hosts that
   * *react* to the selection — re-pushing `actions` with a
   * `disabledReason: 'No display selected'`, say — want this.
   */
  onTargetSelected?: HostTargetSelectedHandler
  /**
   * Called with the current drawcustom YAML payload when the user hits Save.
   * The parent owns persistence in embedded mode — the designer never writes
   * the payload anywhere itself (ADR-010).
   *
   * Superseded in spirit by {@link MountOptions.actions}: the built-in Save
   * button is just an action instance, and both it and this callback are
   * removed at 2.0 (issue #121) in favour of the actions seam.
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
  /**
   * Push a full replacement entity-state map for template preview. Treat the
   * passed object as an immutable snapshot — see `HostStates`'s ownership
   * contract above; mutating it and calling `setStates()` again with the
   * same reference is unsupported and gets treated as a no-op push.
   */
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
  /**
   * Replace the host action buttons (issue #108). Everything pushed at mount
   * is re-pushable (ADR-018), and this is the channel hosts use to keep
   * labels and `disabledReason`s live: push the full list again whenever host
   * state changes (connection lost, target deselected). The designer diffs —
   * an unchanged list costs no re-render — and an empty list removes all
   * action chrome.
   *
   * Throws on a malformed list (unknown `icon` or `severity`, missing or
   * duplicate `id`, missing `label`) without changing what is on screen, and
   * on any non-empty list when `mount()` was given no `onAction` — the
   * handler is fixed at mount, so those buttons could never fire.
   */
  setActions(actions: readonly HostAction[]): void
  /**
   * Replace the display targets the picker offers (issue #106). Everything
   * pushed at mount is re-pushable (ADR-018), and targets are the channel a
   * host uses as its own display inventory changes: a display that appears
   * shows up in the picker without a reload, and the designer diffs the list
   * so an unchanged re-push costs no re-render.
   *
   * A push never moves the canvas on its own, and never overrides the user:
   * if it **removes the currently selected target**, the designer keeps that
   * display's last-known capabilities and lock state and marks the selection
   * stale ("display no longer available") instead of silently switching or
   * unlocking. Pushing the target back clears the stale marker.
   *
   * Throws on a malformed list (missing or duplicate `id`, missing `label`,
   * missing `capabilities`) without changing what is on screen.
   */
  setTargets(targets: readonly HostTarget[]): void
  /** Switch the container-scoped theme. */
  setTheme(theme: EmbedTheme): void
  /**
   * The designer's current drawcustom YAML payload (issue #104) — exactly
   * the string `onSaveRequest` would receive if the user hit Save at this
   * instant. Same serializer, same underlying elements state; there is no
   * second source of truth.
   *
   * - **Never returns `undefined`, and throws only after `destroy()`** — like
   *   every other method on this handle, it rejects a destroyed mount
   *   (`MountHandle used after destroy()`). On a live mount it always answers
   *   with a string, including in the brief window right after
   *   `mount()`/`mountStandaloneApp()` return but before React has committed
   *   and run its effects, when it reports the bootstrap payload the designer
   *   is about to render.
   * - **Never lags a pending edit.** The YAML editor commits typed text to
   *   the canvas model on an 80ms debounce (or on blur); `getPayload()`
   *   forces that flush first, so a call made mid-keystroke reflects the
   *   text already typed — the same content a real Save click would send
   *   (a click blurs the editor, which flushes the debounce, before Save
   *   reads the payload).
   * - **Never resurrects a pre-push draft.** A `setPayload()` push is
   *   authoritative: it discards any debounced edit typed before it, so the
   *   flush above can only ever commit text typed *after* the last push.
   * - **While the YAML editor is blocked** by a parse/schema error (Save is
   *   disabled), returns the last valid payload — the canvas model is frozen
   *   there too, so this is exactly what Save would have sent last, and the
   *   only way to read anything at all.
   *
   * See [`docs/embedding.md`](../../docs/embedding.md#getpayload-issue-104)
   * for the full semantics and rationale.
   */
  getPayload(): string
}

/**
 * Applies host pushes to the running designer. Registered by the React shell
 * once its state exists (through `DesignerHost.registerPushTarget`, which the
 * mount lifecycle supplies — see ./host.ts); every method is invoked from a
 * host event (a `MountHandle` setter), the React-sanctioned place to call
 * setState from.
 */
export interface HostPushTarget {
  applyStates(states: HostStates): void
  applyCapabilities(capabilities: HostCapabilities, options?: CapabilitiesPushOptions): void
  applyPayload(elements: DrawElement[]): void
  /** Pre-validated by `normalizeHostActions` at the handle boundary. */
  applyActions(actions: readonly HostAction[]): void
  /** Pre-validated by `normalizeHostTargets` at the handle boundary. */
  applyTargets(targets: readonly HostTarget[]): void
}
