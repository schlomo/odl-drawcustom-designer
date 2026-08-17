import type { SessionWritePayload, StoredVariables } from '../storage'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import type { MockData } from '../ui/preferences/mockStates'
import type {
  EmbedTheme,
  HostAction,
  HostActionHandler,
  HostPushTarget,
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
