import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import cssText from '../index.css?inline'
import { APP_VERSION, parseYamlPayload } from '../core'
import { App } from '../ui/App'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import { createEmbeddedHost } from './embeddedHost'
import { hostSuppliedTheme, type DesignerHost } from './host'
import type {
  CapabilitiesPushOptions,
  EmbedTheme,
  HostPushTarget,
  MountHandle,
  MountOptions,
} from './types'

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
  if (host.styleScope === 'page') {
    // Standalone SPA: the page already links the stylesheet, and the theme
    // class belongs to `document.documentElement` (the designer's own
    // preference — see useThemePreference). Nothing to isolate, nothing to
    // scope: render into the container itself so the page DOM is unchanged.
    return {
      element: container,
      setTheme() {
        throw new Error('setTheme() is unavailable: this host owns the theme preference')
      },
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
    setTheme: (theme) => applyTheme(wrapper, theme),
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
  }
  let destroyed = false
  let bootstrap: AppBootstrap | null = null
  // Bumped per bootstrap: a re-bootstrap (standalone `#d=` navigation) is a
  // fresh project, so the shell remounts instead of merging into live state.
  let generation = 0

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

  const loadAndRender = () => {
    const loaded = host.loadBootstrap()
    if (!(loaded instanceof Promise)) {
      // Synchronous hosts render in this tick, and their exceptions reach the
      // caller — `mount({ payload })` throws on invalid YAML by contract.
      bootstrap = loaded
      generation += 1
      renderApp()
      return
    }
    void loaded
      .then((next) => {
        if (destroyed) {
          return
        }
        bootstrap = next
        generation += 1
        renderApp()
      })
      .catch((error: unknown) => {
        // Keep whatever is on screen; a first-load failure is the adapter's
        // to turn into a usable fallback bootstrap.
        console.error('Designer bootstrap failed', error)
      })
  }

  loadAndRender()
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
    },
    setStates(states) {
      assertMounted()
      push((target) => target.applyStates(states))
    },
    setCapabilities(capabilities, options?: CapabilitiesPushOptions) {
      assertMounted()
      push((target) => target.applyCapabilities(capabilities, options))
    },
    setPayload(payload) {
      assertMounted()
      const elements = parseYamlPayload(payload)
      push((target) => target.applyPayload(elements))
    },
    setTheme(nextTheme) {
      assertMounted()
      // Throws for a host that owns the theme preference (standalone).
      target.setTheme(nextTheme)
      bridge = { ...bridge, theme: { owner: 'host', value: nextTheme } }
      renderApp()
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
 * persists the payload itself — it hands the current drawcustom YAML to
 * `onSaveRequest` when the user hits Save. Invalid `payload` YAML throws
 * synchronously (here and in `setPayload`).
 *
 * This is the embedded host adapter over {@link mountDesigner} (ADR-017);
 * the standalone SPA is a sibling adapter over the same lifecycle.
 */
export function mount(container: HTMLElement, options: MountOptions = {}): MountHandle {
  return mountDesigner(container, createEmbeddedHost(options))
}
