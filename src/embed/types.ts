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
   * a parse/schema error. An action that does *not* need the payload
   * (host-side settings, a reconnect, a help link) sets `false` and stays
   * clickable throughout; it still receives the last valid payload, exactly
   * as {@link MountHandle.getPayload} documents for a blocked document.
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
 * Fired when the user clicks a host-registered action. Save and send are host
 * actions — the designer has no save channel of its own (ADR-018).
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

/** A pushed state value with optional attributes and an optional display name. */
export interface HostState {
  state: string | number | boolean
  attributes?: Record<string, unknown>
  /**
   * Human-readable label for this state key (issue #107, ADR-018 state
   * catalog) — what the referenced-states panel shows instead of the raw key
   * ("Living-room temperature", not `sensor.demo_temperature`).
   *
   * Presentation only, and re-pushable like every other field: templates never
   * see it (a payload reads `states()`/`state_attr()`, which are unaffected by
   * whether the host named the key), and the designer never parses meaning out
   * of it. Surrounding whitespace is trimmed; a blank name counts as none, and
   * an unnamed key shows as its key.
   */
  name?: string
}

/**
 * Host-pushed states: state key -> state value or {state, attributes, name}.
 * The keys are the host's own identifiers, opaque to the designer — they are
 * what a payload's templates name (`states('…')`, `state_attr('…', '…')`).
 *
 * When provided, this **replaces the State Simulator entirely** (issue #107,
 * ADR-018 Simulator policy): the designer shows a read-only referenced-states
 * panel instead, and the full catalog stays reachable through YAML/template
 * autocomplete.
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
export type HostStates = Record<string, string | number | boolean | HostState>

/**
 * What a display *is* — the description driving canvas setup, carried by every
 * {@link HostTarget}. Mirrors the payload shape of the OpenDisplay HA
 * integration's `capabilities.py` so a host-side adapter can pass it through
 * unchanged. All fields optional; anything a display does not declare comes
 * from the designer's canonical defaults, never from the display previously in
 * effect.
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
 * One display the host knows about (issue #106, ADR-018 targets seam) — the
 * designer's single display channel.
 *
 * The host pushes the list, the designer renders a picker inside its own
 * display-config area, and selecting an entry adopts that display's
 * capabilities behind the existing lock (issue #70). A **one-element list is
 * adopted and locked without a pick** (issue #121): that is how a
 * single-display host says "this is the display". The id is **opaque**: it
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
   * The display this target *is* ({@link HostCapabilities}) — what the canvas,
   * palette and orientation are set from when this target is adopted. Only the
   * documented fields are retained; the copy the designer keeps is frozen, so
   * mutating the pushed object afterwards cannot change what the picker
   * applies, and a re-push carrying different values is recognised as the host
   * re-defining this display.
   */
  capabilities: HostCapabilities
}

/**
 * Called when the effective display target changes (issue #106).
 *
 * `null` means "no target": the user picked the virtual display, unlocked the
 * display config, or has not picked anything yet. Fires only on a *change* —
 * including the one a single-element `targets` push makes by adopting that
 * display (issue #121) — and never as a side effect of a `setTargets` push
 * that leaves the selection alone: a push that removes the selected display
 * keeps it (marked stale) rather than switching.
 *
 * A stable closure fixed at mount: ADR-018 pushes data, never functions.
 */
export type HostTargetSelectedHandler = (targetId: string | null) => void

export interface MountOptions {
  /** Initial drawcustom YAML payload (list of draw elements). */
  payload?: string
  /**
   * Initial states for template preview. A mount option *is* an initial push
   * (ADR-018 seam grammar): identical to calling {@link MountHandle.setStates}
   * before the first painted frame, validated the same way — a malformed map
   * throws out of `mount()`, like an invalid `payload`.
   */
  states?: HostStates
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
   * Initial display targets (issue #106) — the designer's only display
   * channel. A mount option *is* an initial push (ADR-018 seam grammar):
   * identical to calling {@link MountHandle.setTargets} before the first
   * painted frame, and re-pushable from then on. A malformed list throws out
   * of `mount()`, like an invalid `payload`.
   *
   * A list the user can choose between only says what they *can* pick — it
   * never moves the canvas by itself. A **one-element** list says "this is the
   * display": it is adopted and locked straight away, so a single-display host
   * needs no pick and no seeding option (issue #121).
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
   * Push a full replacement state map for template preview. Treat the passed
   * object as an immutable snapshot — see `HostStates`'s ownership contract
   * above; mutating it and calling `setStates()` again with the same reference
   * is unsupported and gets treated as a no-op push.
   *
   * Throws on a malformed map (a non-primitive or missing `state`, a
   * non-object `attributes`, a non-string `name`, or a `states` argument that
   * is not an object) with a message naming the offending key, and **changes
   * nothing** when it does: no values, no names, no Simulator-off latch, and
   * the rejected map never becomes the last-applied push the diff compares
   * against — so the same bad map fails again rather than being deduped, and a
   * corrected one applies normally.
   */
  setStates(states: HostStates): void
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
   * A **one-element** push is adopted and locked straight away (issue #121) —
   * a single display is not a choice — but only while the user has made no
   * display choice of their own; after that, nothing but a pick moves the
   * canvas.
   *
   * Otherwise a push never moves the canvas on its own, and never overrides
   * the user: if it **removes the currently selected target**, the designer keeps that
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
   * The designer's current drawcustom YAML payload (issue #104) — exactly the
   * string an `onAction` callback receives at this instant. Same serializer,
   * same underlying elements state; there is no second source of truth.
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
   *   text already typed — the same content an action click sends (a click
   *   blurs the editor, which flushes the debounce, before the payload is
   *   read).
   * - **Never resurrects a pre-push draft.** A `setPayload()` push is
   *   authoritative: it discards any debounced edit typed before it, so the
   *   flush above can only ever commit text typed *after* the last push.
   * - **While the YAML editor is blocked** by a parse/schema error (every
   *   payload-carrying action is disabled), returns the last valid payload —
   *   the canvas model is frozen there too, so this is exactly what the last
   *   action would have sent, and the only way to read anything at all.
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
  /** Pre-validated by `assertHostStates` at the handle boundary. */
  applyStates(states: HostStates): void
  applyPayload(elements: DrawElement[]): void
  /** Pre-validated by `normalizeHostActions` at the handle boundary. */
  applyActions(actions: readonly HostAction[]): void
  /** Pre-validated by `normalizeHostTargets` at the handle boundary. */
  applyTargets(targets: readonly HostTarget[]): void
}
