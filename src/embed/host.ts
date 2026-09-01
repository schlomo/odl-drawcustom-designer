import type { SessionWritePayload, StoredVariables } from '../storage'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import type { MockData } from '../ui/preferences/mockStates'
import type { HostAssetResolver } from '../core'
import type {
  DesignerStatus,
  EmbedTheme,
  HostAction,
  HostActionHandler,
  HostPreviewRenderer,
  HostPushTarget,
  HostStates,
  HostStatusChangeHandler,
  HostTarget,
  HostTargetSelectedHandler,
} from './types'

/**
 * Host-adapter seam (issue #72, ADR-017).
 *
 * One mount lifecycle (`mountDesigner`, ./mount.tsx) serves every runtime;
 * everything that used to be a `mode` conditional in the React shell is
 * policy declared by a **host adapter**:
 *
 * | Adapter | Module |
 * |---------|--------|
 * | Standalone SPA (GitHub Pages) | ./standaloneHost.ts |
 * | Embedded host page (`mount()` public API) | ./embeddedHost.ts |
 * | HA panel (M4, issue #25) | a third adapter — no new mode |
 *
 * This interface is **internal**: it references internal types
 * (`AppBootstrap`, storage payloads), so it is deliberately not part of the
 * published library surface (`./index.ts`). The embedded adapter is what the
 * public `mount(container, options)` API builds.
 */
export interface DesignerHost {
  /**
   * Where the designer's DOM and stylesheet live.
   *
   * - `'shadow'` — attach (or reuse) a shadow root on the container and
   *   inject the compiled stylesheet into it: host page CSS cannot reach the
   *   designer and designer CSS cannot leak out (issue #21).
   * - `'page'` — render into the container itself and rely on the page's own
   *   stylesheet (the standalone SPA's `index.html` links it). Its document
   *   must never gain a shadow boundary: the theme class lives on
   *   `document.documentElement`, which `.dark`-descendant selectors could
   *   not cross.
   */
  readonly styleScope: 'shadow' | 'page'
  /** Who decides the theme, and where it is applied. */
  readonly theme: HostThemePolicy
  /**
   * Shell height policy: `'viewport'` for a full-page app, `'container'` to
   * fill the host-sized mount container.
   */
  readonly fill: 'viewport' | 'container'
  /**
   * Whether the share-link button is offered. Standalone only: the share URL
   * is the app's own URL, which an embedding host page does not have
   * (ADR-005).
   */
  readonly shareLink: boolean
  /**
   * Autosave writers, or `null` when the host owns persistence — then the
   * designer writes no session, mocks or variables at all (ADR-010).
   */
  readonly persistence: DesignerPersistence | null
  /**
   * Host-fed states the shell paints before the first push (issue #107,
   * ADR-018 state catalog): the adapter's rendering of the `states` mount
   * option, which the seam grammar defines as an initial push. Later pushes
   * arrive through {@link HostPushTarget.applyStates}.
   *
   * Its **presence** — not its content — is what says "this host owns the
   * states": the State Simulator is off and the read-only referenced-states
   * panel takes its tab from the first painted frame, so an empty map still
   * counts as host-fed. Absent (standalone) leaves the Simulator exactly as it
   * was. The state *values* reach the shell through the bootstrap's mock maps
   * as they always have; this channel carries the policy and the friendly
   * names.
   */
  readonly states?: HostStates
  /**
   * Host action buttons the shell paints before the first push (issue #108,
   * ADR-018): the adapter's rendering of the `actions` mount option, which
   * the seam grammar defines as an initial push. Later pushes arrive through
   * {@link HostPushTarget.applyActions} and replace this wholesale.
   * Pre-validated by `normalizeHostActions`.
   */
  readonly actions?: readonly HostAction[]
  /**
   * Action channel: which button the user clicked, plus the current payload.
   * The designer's only save/send channel (ADR-018, issue #121). Absent for a
   * host that registers no actions (standalone never does).
   */
  readonly onAction?: HostActionHandler
  /**
   * Display targets the shell paints in its picker before the first push
   * (issue #106, ADR-018): the adapter's rendering of the `targets` mount
   * option, which the seam grammar defines as an initial push. Later pushes
   * arrive through {@link HostPushTarget.applyTargets} and replace this
   * wholesale. Pre-validated by `normalizeHostTargets`.
   */
  readonly targets?: readonly HostTarget[]
  /**
   * Selection channel: which target the user picked, or `null` for the
   * virtual display. Absent for a host that pushes no targets.
   */
  readonly onTargetSelected?: HostTargetSelectedHandler
  /**
   * Host-side payload renderer (issue #109, ADR-018 preview seam): present
   * only for a host that supplied `renderPreview`, and the sole reason the
   * shell paints its Display preview toggle. Not a push channel — a stable
   * closure fixed at mount, like `onAction`.
   */
  readonly renderPreview?: HostPreviewRenderer
  /**
   * Asset channel (issue #138): resolves payload asset names the designer's own
   * tiers could not (`MountOptions.resolveAsset`). The mount lifecycle installs
   * it as the last resolution tier for as long as the mount lives; absent for
   * the standalone adapter, which resolves assets locally only.
   */
  readonly resolveAsset?: HostAssetResolver
  /**
   * Status transition notifier (issue #133): present only for a host that
   * supplied `onStatusChange`. Not a push channel — a stable closure fixed at
   * mount, like `onAction`/`renderPreview`.
   */
  readonly onStatusChange?: HostStatusChangeHandler
  /**
   * Whether the designer may write to its local asset store
   * (`MountOptions.hostOwnsAssets`, ADR-002): `true` for every adapter
   * except an embedded host that declared `hostOwnsAssets`. `false` is
   * enforced at the write boundary itself (`useProjectState`'s
   * `uploadAsset`/`clearAsset`), not only in the UI — a reachable control is
   * only ever the first line of defense. The Content tab keeps listing what
   * the payload references and how each resolves either way (local map,
   * bundled, or `resolveAsset`, badged **Host**) — this flag removes write
   * affordances, not the read-only explorer.
   */
  readonly assetUploadsEnabled: boolean
  /**
   * Host-supplied replacement for the Content tab's upload instructions
   * (`MountOptions.hostOwnsAssets`'s `{ hint }` form), rendered verbatim as
   * plain text only where the upload control used to be. Meaningful only
   * when {@link assetUploadsEnabled} is `false`; the UI supplies its own
   * domain-neutral fallback sentence when this is absent.
   */
  readonly assetUploadsHint?: string
  /**
   * Initial designer state. May be async so an adapter can read IndexedDB
   * and the `#d=` share hash; a synchronous return renders in the same tick
   * (and its exceptions propagate to the `mount()` caller — the embedded
   * contract for invalid `payload` YAML).
   */
  loadBootstrap(): AppBootstrap | Promise<AppBootstrap>
  /**
   * Subscribe to host-driven re-bootstraps; returns an unsubscribe called on
   * `destroy()`. Standalone uses it for same-tab `#d=` navigation; embedded
   * hosts replace state through `MountHandle` pushes instead.
   */
  subscribeBootstrapChanges?(reload: () => void): () => void
  /**
   * Registers the appliers for host pushes. Supplied by the mount lifecycle
   * (it owns the pre-registration push queue), never by an adapter — hosts
   * that never push simply never see it invoked.
   */
  registerPushTarget?(target: HostPushTarget): () => void
  /**
   * Registers the shell's current-payload getter (issue #104): the mirror of
   * {@link registerPushTarget} for the one read the host pulls back out
   * instead of pushing in. Supplied by the mount lifecycle, never by an
   * adapter — `MountHandle.getPayload()` calls whatever was last registered,
   * or falls back to the bootstrap payload before this has ever run (ADR-018
   * seam grammar: no bidirectional shared state, just a typed read of
   * designer output).
   */
  registerPayloadSource?(getPayload: () => string): () => void
  /**
   * Registers the shell's own-PNG-export getter (`MountHandle.getPngBlob()`,
   * maintainer-ruled fix for a demo-provider bug on PR #143): the same "read,
   * don't drive the UI" shape {@link registerPayloadSource} established for
   * text — a host that wants the designer's *own* rasterization of the
   * current design (full font/renderer fidelity, no host backend of its own)
   * reads it here instead of reimplementing a renderer. Always the
   * client-side render — independent of whether Display preview is currently
   * showing a host image, so a `renderPreview` provider built on top of this
   * can never call itself. Supplied by the mount lifecycle, never by an
   * adapter, exactly like {@link registerPayloadSource}.
   */
  registerRenderSource?(getPngBlob: () => Promise<Blob>): () => void
  /**
   * Registers the shell's current-status getter (`MountHandle.getStatus()`,
   * issue #133): the same "read, don't drive the UI" shape
   * {@link registerPayloadSource} established, for the status snapshot instead
   * of the payload text. Supplied by the mount lifecycle, never by an adapter.
   */
  registerStatusSource?(getStatus: () => DesignerStatus): () => void
}

/**
 * Theme policy. `'designer'` owns a persisted user preference and applies it
 * to `document.documentElement` (standalone chrome offers the theme toggle);
 * `'host'` supplies a fixed theme that the mount scopes to its own wrapper —
 * an embedded designer never touches the host page's globals.
 */
export type HostThemePolicy = { owner: 'designer' } | { owner: 'host'; value: EmbedTheme }

/**
 * Where the designer's own state is written when the host does not own
 * persistence. Debouncing stays in the React shell; an adapter only supplies
 * the writers (the HA panel adapter will write HA storage instead).
 */
export interface DesignerPersistence {
  writeSession(payload: SessionWritePayload): void
  writeMocks(mock: MockData): void
  writeVariables(variables: StoredVariables): void
}

/** The theme the shell should paint, or `null` when the designer owns it. */
export function hostSuppliedTheme(host: DesignerHost): EmbedTheme | null {
  return host.theme.owner === 'host' ? host.theme.value : null
}
