import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import cssText from '../index.css?inline'
import {
  APP_VERSION,
  installHostAssetResolver,
  parseYamlPayload,
  serializeYamlPayload,
  type DrawElement,
} from '../core'
import { App } from '../ui/App'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import { createEmbeddedHost } from './embeddedHost'
import { hostSuppliedTheme, type DesignerHost } from './host'
import { assertActionsAreHandled, normalizeHostActions } from './hostActions'
import { assertHostStates } from './hostContract'
import { normalizeHostTargets } from './hostTargets'
import type { EmbedTheme, HostPushTarget, MountHandle, MountOptions } from './types'

const STYLE_MARKER = 'data-odl-designer-styles'

/**
 * The shadow root the designer renders into (issue #21): reuse one the host
 * already attached (the OpenDisplay HA panel pattern — a custom element
 * calling `this.attachShadow({ mode: 'open' })` and mounting into itself),
 * otherwise create it. All designer DOM and styles live inside this root,
 * so host-page CSS cannot reach the designer and designer CSS cannot leak
 * out.
 */
function resolveShadowRoot(container: HTMLElement): ShadowRoot {
  return container.shadowRoot ?? container.attachShadow({ mode: 'open' })
}

/**
 * Inject the compiled stylesheet into the mount's shadow root. Injected once
 * per root; multiple mounts share it, and destroy() intentionally leaves it
 * in place.
 */
function injectStyles(shadowRoot: ShadowRoot): void {
  if (shadowRoot.querySelector(`style[${STYLE_MARKER}]`)) {
    return
  }
  const style = shadowRoot.host.ownerDocument.createElement('style')
  style.setAttribute(STYLE_MARKER, '')
  style.textContent = cssText
  shadowRoot.appendChild(style)
}

/** Theme lives on the designer's own wrapper — never on the host document. */
function applyTheme(wrapper: HTMLElement, theme: EmbedTheme): void {
  wrapper.classList.toggle('dark', theme === 'dark')
  wrapper.dataset.theme = theme
}

/** The DOM the shell renders into, per the host's style-scope policy. */
interface RenderTarget {
  element: HTMLElement
  setTheme(theme: EmbedTheme): void
  cleanup(): void
}

function createRenderTarget(container: HTMLElement, host: DesignerHost): RenderTarget {
  // Whether a theme may be pushed is decided by theme *ownership*, not by
  // style scope: an adapter that owns the preference itself rejects the push
  // whatever its DOM looks like, so a shadow-scoped adapter with a
  // designer-owned theme (the M4 HA panel following HA's theme) is guarded by
  // construction.
  const themeSetter = (element: HTMLElement): RenderTarget['setTheme'] =>
    host.theme.owner === 'designer'
      ? () => {
          throw new Error('setTheme() is unavailable: this host owns the theme preference')
        }
      : (theme) => applyTheme(element, theme)

  if (host.styleScope === 'page') {
    // Standalone SPA: the page already links the stylesheet, and the theme
    // class belongs to `document.documentElement` (the designer's own
    // preference — see useThemePreference). Nothing to isolate, nothing to
    // scope: render into the container itself so the page DOM is unchanged.
    return {
      element: container,
      setTheme: themeSetter(container),
      cleanup() {},
    }
  }

  const shadowRoot = resolveShadowRoot(container)
  injectStyles(shadowRoot)

  const wrapper = container.ownerDocument.createElement('div')
  wrapper.style.height = '100%'
  // In-shadow anchor for designer-internal overlays (e.g. CodeMirror
  // tooltips): everything that would otherwise portal to document.body must
  // stay inside the shadow boundary to keep its styles.
  wrapper.setAttribute('data-odl-designer-root', '')
  applyTheme(wrapper, hostSuppliedTheme(host) ?? 'light')
  shadowRoot.appendChild(wrapper)

  return {
    element: wrapper,
    setTheme: themeSetter(wrapper),
    cleanup: () => wrapper.remove(),
  }
}

/**
 * The one designer mount lifecycle (issue #72, ADR-017): every runtime —
 * standalone SPA, embedded host page, the future HA panel — is a
 * {@link DesignerHost} adapter over this function. It owns DOM setup, the
 * React root, bootstrap (sync or async, plus host-driven re-bootstraps) and
 * the host push queue; the adapter owns policy.
 *
 * Internal: the public embedded API is {@link mount}.
 */
export function mountDesigner(container: HTMLElement, host: DesignerHost): MountHandle {
  // Resolve the first bootstrap *before* touching the container: a synchronous
  // host throws on invalid YAML (`mount({ payload })` by contract), and that
  // throw must leave the container exactly as the host handed it over —
  // otherwise every failed attempt strands a shadow root, a wrapper and a
  // React root the host can never reach to clean up.
  const initialBootstrap = host.loadBootstrap()

  // The host's asset tier goes live before the first frame is rendered (issue
  // #138): the initial payload's own fonts and images resolve through it, so a
  // host-supplied font never flashes as a render error on the way in. Torn down
  // with the mount, which also forgets everything this mount cached.
  const uninstallAssetResolver = host.resolveAsset
    ? installHostAssetResolver(host.resolveAsset)
    : undefined

  const target = createRenderTarget(container, host)

  // Pushes can arrive before React has flushed the effect that registers the
  // push target (effects flush asynchronously); queue them and replay in
  // order on registration so no host data is dropped.
  let pushTarget: HostPushTarget | null = null
  const pendingPushes: Array<(target: HostPushTarget) => void> = []

  const push = (apply: (target: HostPushTarget) => void) => {
    if (pushTarget) {
      apply(pushTarget)
      return
    }
    pendingPushes.push(apply)
  }

  // The read mirror of the push queue above (issue #104): `getPayload()`
  // calls whatever the shell last registered here. Before that registration
  // effect has run — the pre-registration window `pendingPushes` also
  // exists for — there is nothing to call, so `getPayload()` falls back to
  // the bootstrap payload via `bootstrap` below instead of queuing (a read
  // has no "later" to replay into; it must answer synchronously, right now).
  let payloadSource: (() => string) | null = null

  // The mirror of `payloadSource` for the designer's own PNG export (issue
  // #109 review, maintainer-ruled demo fix): `getPngBlob()` calls whatever
  // the shell last registered here. Unlike `payloadSource`, there is no
  // bootstrap fallback — a raster needs fonts/assets the shell only has once
  // it has rendered at least once, so a call in the brief pre-registration
  // window rejects instead of answering with something meaningless.
  let pngSource: (() => Promise<Blob>) | null = null

  // The latest `setPayload()` accepted into `pendingPushes` during the
  // pre-registration window (Copilot finding on #104): once
  // `registerPushTarget` runs, queued pushes drain in order into
  // `applyPayload`, so this is exactly the elements the designer is about to
  // adopt as its payload. The `getPayload()` fallback below must serialize
  // *this*, not the original bootstrap — no other push channel touches the
  // payload, so only `setPayload` ever updates it, and parsing already
  // happened in `setPayload` (throw semantics on invalid YAML unchanged).
  let pendingPayloadElements: DrawElement[] | null = null

  let bridge: DesignerHost = {
    ...host,
    registerPushTarget(target) {
      pushTarget = target
      for (const apply of pendingPushes.splice(0)) {
        apply(target)
      }
      return () => {
        if (pushTarget === target) {
          pushTarget = null
        }
      }
    },
    registerPayloadSource(getPayload) {
      payloadSource = getPayload
      return () => {
        if (payloadSource === getPayload) {
          payloadSource = null
        }
      }
    },
    registerRenderSource(getPngBlob) {
      pngSource = getPngBlob
      return () => {
        if (pngSource === getPngBlob) {
          pngSource = null
        }
      }
    },
  }
  let destroyed = false
  let bootstrap: AppBootstrap | null = null
  // Bumped per bootstrap: a re-bootstrap (standalone `#d=` navigation) is a
  // fresh project, so the shell remounts instead of merging into live state.
  let generation = 0
  // Bumped per *started* load: rapid `#d=` navigation can leave two async
  // bootstraps in flight, and the one that resolves last is not necessarily
  // the one the user asked for last. Only the newest load may render.
  let loadSequence = 0

  const root = createRoot(target.element)
  const renderApp = () => {
    if (!bootstrap) {
      return
    }
    root.render(
      <StrictMode>
        <App key={generation} bootstrap={bootstrap} host={bridge} />
      </StrictMode>,
    )
  }

  const applyBootstrap = (next: AppBootstrap) => {
    bootstrap = next
    generation += 1
    renderApp()
  }

  const renderLoaded = (loaded: AppBootstrap | Promise<AppBootstrap>) => {
    const sequence = (loadSequence += 1)
    if (!(loaded instanceof Promise)) {
      // A synchronous host renders in this tick; its exception already reached
      // the caller from `loadBootstrap()` — `mount({ payload })` throws on
      // invalid YAML by contract.
      applyBootstrap(loaded)
      return
    }
    void loaded
      .then((next) => {
        if (destroyed || sequence !== loadSequence) {
          // A newer bootstrap was started while this one was in flight; it
          // owns the screen even if it resolved first.
          return
        }
        applyBootstrap(next)
      })
      .catch((error: unknown) => {
        // Keep whatever is on screen; a first-load failure is the adapter's
        // to turn into a usable fallback bootstrap.
        console.error('Designer bootstrap failed', error)
      })
  }

  const loadAndRender = () => {
    renderLoaded(host.loadBootstrap())
  }

  try {
    renderLoaded(initialBootstrap)
  } catch (error) {
    // A synchronous render failure is as unrecoverable as a bootstrap one:
    // hand the container back untouched instead of half-mounted.
    root.unmount()
    target.cleanup()
    uninstallAssetResolver?.()
    throw error
  }
  const unsubscribeBootstrap = host.subscribeBootstrapChanges?.(loadAndRender)

  const assertMounted = () => {
    if (destroyed) {
      throw new Error('MountHandle used after destroy()')
    }
  }

  return {
    version: APP_VERSION,
    destroy() {
      assertMounted()
      destroyed = true
      unsubscribeBootstrap?.()
      root.unmount()
      target.cleanup()
      uninstallAssetResolver?.()
    },
    setStates(states) {
      assertMounted()
      // Validated before queueing, same reason as `setActions()`/`setTargets()`
      // below: a queued push cannot report its own failure to the host later.
      // Ordering is the point (maintainer ruling 2026-08-17) — a rejected push
      // must not latch the host-fed policy or become the retained
      // last-applied reference, or the identical re-push a ticking host makes
      // gets deduped as "unchanged" and the channel stays wedged.
      assertHostStates(states)
      push((target) => target.applyStates(states))
    },
    setPayload(payload) {
      assertMounted()
      const elements = parseYamlPayload(payload)
      if (!pushTarget) {
        pendingPayloadElements = elements
      }
      push((target) => target.applyPayload(elements))
    },
    setActions(actions) {
      assertMounted()
      // Validate before queueing, so a malformed list throws at the push that
      // carries it and leaves the designer untouched — a queued push cannot
      // report its own failure to the host later. `onAction` is fixed at
      // mount, so a host that registered none never gains one: reject the
      // push instead of painting permanently inert buttons.
      const normalized = normalizeHostActions(actions)
      assertActionsAreHandled(normalized, host.onAction, 'setActions()')
      push((target) => target.applyActions(normalized))
    },
    setTargets(targets) {
      assertMounted()
      // Validated before queueing, same reason as `setActions()` above: a
      // queued push cannot report its own failure to the host later. No
      // handler requirement here — `onTargetSelected` is optional, and a
      // selection still reaches the host through `onAction`'s context.
      const normalized = normalizeHostTargets(targets)
      push((pushTarget) => pushTarget.applyTargets(normalized))
    },
    setTheme(nextTheme) {
      assertMounted()
      // Throws for a host that owns the theme preference (standalone).
      target.setTheme(nextTheme)
      bridge = { ...bridge, theme: { owner: 'host', value: nextTheme } }
      renderApp()
    },
    getPayload() {
      assertMounted()
      if (payloadSource) {
        return payloadSource()
      }
      // Nothing registered yet (pre-registration window, or the initial
      // bootstrap load is still in flight for an async host): report the
      // latest queued `setPayload()` push if one exists — the drained queue
      // will apply it as the designer's payload the moment registration
      // happens — otherwise the bootstrap payload, rather than throwing or
      // returning nothing.
      return serializeYamlPayload(pendingPayloadElements ?? bootstrap?.elements ?? [])
    },
    getPngBlob() {
      assertMounted()
      if (!pngSource) {
        return Promise.reject(
          new Error('MountHandle.getPngBlob() called before the designer finished mounting'),
        )
      }
      return pngSource()
    },
  }
}

/**
 * Mount the designer into an arbitrary host container (issue #20, ADR-010).
 * Renders into an open shadow root on the container — created here, or
 * reused when the host attached one already (issue #21) — so styles are
 * isolated in both directions.
 *
 * The host pushes data through the returned handle; the designer never
 * persists the payload itself — the host reads the current drawcustom YAML
 * through `getPayload()`, or receives it with the action the user clicked
 * (ADR-018). Invalid `payload` YAML throws synchronously (here and in
 * `setPayload`).
 *
 * This is the embedded host adapter over {@link mountDesigner} (ADR-017);
 * the standalone SPA is a sibling adapter over the same lifecycle.
 */
export function mount(container: HTMLElement, options: MountOptions = {}): MountHandle {
  return mountDesigner(container, createEmbeddedHost(options))
}
