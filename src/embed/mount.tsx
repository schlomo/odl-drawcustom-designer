import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import cssText from '../index.css?inline'
import { parseYamlPayload } from '../core'
import { App } from '../ui/App'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import { DEFAULT_DISPLAY_CONFIG } from '../ui/preferences/displayConfig'
import { capabilitiesToCanvas, hostStatesToMockData } from './hostContract'
import type {
  EmbedHostBridge,
  EmbedTheme,
  HostPushTarget,
  MountHandle,
  MountOptions,
} from './types'

const STYLE_MARKER = 'data-odl-designer-styles'

/**
 * Inject the compiled stylesheet next to the mount point: into the shadow
 * root when the container lives inside one (issue #21's mounting mode), into
 * `<head>` otherwise. Injected once per root; multiple mounts share it, and
 * destroy() intentionally leaves it in place.
 */
function injectStyles(container: HTMLElement): void {
  const rootNode = container.getRootNode()
  const styleParent =
    rootNode instanceof ShadowRoot ? rootNode : container.ownerDocument.head
  if (styleParent.querySelector(`style[${STYLE_MARKER}]`)) {
    return
  }
  const style = container.ownerDocument.createElement('style')
  style.setAttribute(STYLE_MARKER, '')
  style.textContent = cssText
  styleParent.appendChild(style)
}

/** Theme lives on the designer's own wrapper — never on the host document. */
function applyTheme(wrapper: HTMLElement, theme: EmbedTheme): void {
  wrapper.classList.toggle('dark', theme === 'dark')
  wrapper.dataset.theme = theme
}

function buildEmbedBootstrap(options: MountOptions): AppBootstrap {
  const mock = options.states
    ? hostStatesToMockData(options.states)
    : { states: {}, attributes: {} }
  return {
    sessionName: 'Untitled',
    elements: options.payload ? parseYamlPayload(options.payload) : [],
    canvas: capabilitiesToCanvas(options.capabilities ?? {}, { ...DEFAULT_DISPLAY_CONFIG }),
    service: undefined,
    mockStates: mock.states,
    mockAttributes: mock.attributes,
    variables: {},
    importSource: 'default',
  }
}

/**
 * Mount the designer into an arbitrary host container (issue #20, ADR-010).
 *
 * The host pushes data through the returned handle; the designer never
 * persists the payload itself — it hands the current drawcustom YAML to
 * `onSaveRequest` when the user hits Save. Invalid `payload` YAML throws
 * synchronously (here and in `setPayload`).
 */
export function mount(container: HTMLElement, options: MountOptions = {}): MountHandle {
  const theme: EmbedTheme = options.theme ?? 'light'
  const bootstrap = buildEmbedBootstrap(options)

  injectStyles(container)

  const wrapper = container.ownerDocument.createElement('div')
  wrapper.style.height = '100%'
  applyTheme(wrapper, theme)
  container.appendChild(wrapper)

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

  let bridge: EmbedHostBridge = {
    onSaveRequest: options.onSaveRequest,
    theme,
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

  const root = createRoot(wrapper)
  const renderApp = () => {
    root.render(
      <StrictMode>
        <App bootstrap={bootstrap} host={bridge} />
      </StrictMode>,
    )
  }
  renderApp()

  const assertMounted = () => {
    if (destroyed) {
      throw new Error('MountHandle used after destroy()')
    }
  }

  return {
    destroy() {
      assertMounted()
      destroyed = true
      root.unmount()
      wrapper.remove()
    },
    setStates(states) {
      assertMounted()
      push((target) => target.applyStates(states))
    },
    setCapabilities(capabilities) {
      assertMounted()
      push((target) => target.applyCapabilities(capabilities))
    },
    setPayload(payload) {
      assertMounted()
      const elements = parseYamlPayload(payload)
      push((target) => target.applyPayload(elements))
    },
    setTheme(nextTheme) {
      assertMounted()
      bridge = { ...bridge, theme: nextTheme }
      applyTheme(wrapper, nextTheme)
      renderApp()
    },
  }
}
