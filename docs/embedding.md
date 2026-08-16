# Embedding the designer

The designer ships as an embeddable component ([issue #20](https://github.com/schlomo/odl-drawcustom-designer/issues/20), [ADR-010](adr/ADR-010-ha-embed-mode.md)): a host application — the concrete target is the [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44) custom panel — mounts it into a container, pushes entity states and display capabilities, and receives the drawcustom YAML payload on Save. Styles are isolated via Shadow DOM at the mount boundary ([issue #21](https://github.com/schlomo/odl-drawcustom-designer/issues/21)); live HA data is a later milestone ([#24](https://github.com/schlomo/odl-drawcustom-designer/issues/24)).

Consumed as a **versioned GitHub-release artifact** ([issue #23](https://github.com/schlomo/odl-drawcustom-designer/issues/23)) — release procedure, semver policy, and consumer story: [`docs/releasing.md`](releasing.md).

## Library build

```bash
npm run build:lib
```

Emits **one self-contained ESM file** — React, styles, and bundled fonts included; the host provides nothing (~5.4 MiB raw, ~1.6 MiB gzip on the wire — composition and the deliberate no-code-splitting decision: [`docs/bundle-audit.md`](bundle-audit.md)):

```
dist-lib/odl-drawcustom-designer.js
```

`dist-lib/` also contains the demo host page (copied from `demo/`). Try it:

```bash
npm run build:site && npm run preview
# open the printed URL; the demo is at /embed/ (same path as production)
```

No dedicated server needed beyond that: the demo is plain static files, so any
static file server works too (e.g. `python3 -m http.server -d dist-lib`).

The demo page mounts the designer, pushes fake warm/cold states and a 296×128 BWR capabilities payload, switches themes, and shows every `onSaveRequest` payload in a `<pre>`. It doubles as the Playwright e2e fixture ([`tests/e2e/embed-mount.spec.ts`](../tests/e2e/embed-mount.spec.ts)).

The same demo is published from `main` at **<https://schlomo.github.io/odl-drawcustom-designer/embed/>** — `npm run build:site` assembles the deployed site (app at `/`, `dist-lib/` copied to `/embed/` by [`tools/assembleSite.ts`](../tools/assembleSite.ts)); PR previews get their own `/embed/` the same way.

## Mount API

```js
import { mount } from './odl-drawcustom-designer.js'

const handle = mount(document.getElementById('designer'), {
  payload: yamlString,          // initial drawcustom YAML (list of elements)
  states: { /* see below */ },  // initial entity states for template preview
  capabilities: { /* below */ },// display description -> canvas + palette
  lock: true,                   // optional, default true — see "Display config lock" below
  theme: 'dark',                // 'light' | 'dark', scoped to the container
  onSaveRequest(payload) {
    // user hit Save — persist the YAML; the designer never writes it itself
  },
})

handle.setStates(states)                              // replace the entity-state map
handle.setCapabilities(capabilities)                  // re-map canvas size/rotation/palette, re-lock
handle.setCapabilities(capabilities, { lock: false })  // same, but leaves the controls unlocked
handle.setPayload(yamlString)                         // replace the payload (throws on bad YAML)
handle.getPayload()                                   // read the current payload YAML — see below
handle.setTheme('light')                              // switch the container-scoped theme
handle.destroy()                                      // unmount and empty the container
```

- The container needs an explicit height; the designer fills it (`height: 100%`).
- `mount()` and `setPayload()` throw synchronously on invalid YAML. A throwing
  `mount()` leaves the container exactly as it was — nothing rendered, nothing
  to clean up — so retrying into the same container is safe.
- Multiple mounts on one page are possible; each handle is independent — including per-instance light/dark themes.
- Pushes are safe from the moment `mount()` returns: a push made before the
  designer has rendered anything is queued and applied while it renders, so the
  first frame you can observe already reflects it. A host that pushes
  capabilities immediately after `mount()` never shows a frame of default,
  unlocked display config first (issue #115).

### `getPayload()` (issue #104)

`handle.getPayload()` returns the designer's current drawcustom YAML —
exactly the string `onSaveRequest` would receive if the user hit Save at that
instant. It exists so a host can *read* the payload directly instead of
simulating a Save click: the upstream OpenDisplay HA integration
([PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100))
DOM-scraped the designer's shadow root for the Save button and called
`.click()` on it, which silently did nothing whenever a YAML error had
disabled the button (see [ADR-018](adr/ADR-018-host-ui-seam.md)).

`getPayload()` reuses the exact same serialization path as `onSaveRequest` —
there is no second serializer to drift out of sync with it — and resolves
four edge cases so it can never disagree with what Save would send:

- **Before React has committed anything** (a synchronous call right after
  `mount()`/`mountStandaloneApp()` returns, before the mount's internal push/read
  registration effect has run): reports the **bootstrap payload** — the same
  `elements` the shell is about to seed its state from for a synchronous host
  (`mount({ payload })`), or a safe empty-list default while an async
  bootstrap (the standalone SPA's IndexedDB/share-hash load) is still in
  flight. Always a string, never `undefined`.
- **Mid-keystroke, while a debounced YAML edit is still pending:** the YAML
  editor commits typed text to the canvas model on an 80ms debounce (or
  immediately on blur). `getPayload()` forces that flush before reading, so a
  call made moments after typing reflects the already-typed text — matching
  a real Save click, which always blurs the editor (flushing the debounce)
  before it reads the payload. `getPayload()` never lags behind what a click
  would send.
- **While the YAML editor is blocked** by a parse/schema error (Save itself
  is disabled): returns the **last valid payload**. The canvas model
  (`elements`) freezes at its last-valid state while the live document is
  broken — the same state Save would have sent last, and, with Save
  disabled, the only way for a host to read anything at all.
- **Right after a `setPayload()` push, with an edit still pending:** the push
  wins. A host push is authoritative — it replaces the payload wholesale, so
  it also **discards** any debounced edit typed before it, and the editor is
  re-serialized from the pushed payload. Without that, the flush above (which
  `getPayload()` itself triggers) would have committed the pre-push draft over
  the payload the host had just pushed.

Like every other method on the handle, `getPayload()` throws
`MountHandle used after destroy()` once the mount has been destroyed. On a
live mount it never throws.

The payload read channel (`registerPayloadSource`) registers in the same
commit as the push channel (`registerPushTarget`) — both are `useLayoutEffect`
— so there is no window where a host push has already applied but a read
still reports stale, pre-push data.

### Version

```js
import { mount, version } from './odl-drawcustom-designer.js'

console.log(version)              // e.g. '1.2.3' in a released build, '0.0.0-dev' otherwise
console.log(mount(el, {}).version) // same value, also on the handle
```

`version` is baked in at build time (`tools/version.ts`) from the release
script's `APP_VERSION` environment variable — git tags, not `package.json`
(which stays pinned at `0.0.0`), are this project's version source. A build
that isn't produced by the release workflow (local dev, this repo's own GH
Pages app build) has no `APP_VERSION` set and reports `'0.0.0-dev'`. Same
string as `MountHandle.version`, whichever is more convenient for a host to
log or report. See [`docs/releasing.md`](releasing.md) for the release
procedure and semver policy that governs this API.

`MountHandle.version` is used in production by the OpenDisplay HA panel
(status line version indicator); see their [reference host adapter](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)
(`custom_components/opendisplay/designer/`) for a live example. First-party
HA support is tracked in [#25](https://github.com/schlomo/odl-drawcustom-designer/issues/25).

### Shadow DOM at the mount boundary ([issue #21](https://github.com/schlomo/odl-drawcustom-designer/issues/21))

`mount()` renders into an **open shadow root on the container**: it reuses `container.shadowRoot` when the host already attached one, otherwise it calls `container.attachShadow({ mode: 'open' })` itself. This isolates styles in both directions:

- The compiled stylesheet (Tailwind utilities, theme variables, editor styles) is injected as a `<style>` into the shadow root — never into the host document's `<head>`. Host CSS — including `!important` rules and colliding utility class names like `.flex` — cannot restyle the designer, and designer CSS cannot restyle the host page.
- Theme variables live on `:host` (light) and the per-instance `.dark` wrapper inside the shadow root, so `setTheme()` is scoped per mount and never touches `document.documentElement`.
- The stylesheet is injected once per shadow root and intentionally left in place on `destroy()` (a later mount into the same container reuses it).
- Designer-internal overlays (e.g. CodeMirror autocomplete/lint tooltips) render inside the shadow root, and keyboard shortcuts only react to keystrokes originating inside the instance's own shadow tree.
- Fonts still register on `document.fonts` (the FontFace API is document-wide by design); font *names* are designer-scoped enough not to collide in practice.

A host custom element (the HA panel pattern) can attach the shadow root itself and hand over its own element:

```js
class DesignerPanel extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }) // optional — mount() would create it
    this.style.display = 'block'
    this.style.height = '100%'
    this.handle = mount(this, { /* options */ })
  }
  disconnectedCallback() {
    this.handle?.destroy()
  }
}
```

The container element must support `attachShadow` (a `<div>` or an autonomous custom element does; e.g. `<span>`-like replaced elements do not).

`demo/isolation.html` is the hostile-host fixture proving the boundary: aggressive `!important` host CSS, Tailwind-colliding class names, and two instances with different themes on one page ([`tests/e2e/embed-isolation.spec.ts`](../tests/e2e/embed-isolation.spec.ts)).

### Scroll containment ([issue #79](https://github.com/schlomo/odl-drawcustom-designer/issues/79))

Designer-internal scrolling never scrolls the host page. The YAML editor scrolls itself programmatically — the Linked-editor sync centers the selected element's block on every canvas selection, and typing scrolls the cursor into view — and CodeMirror's default handling would walk ancestor scrollers past the mount boundary and call `window.scrollBy` on the host document whenever the editor's own scroller cannot absorb the full scroll. A designer embedded above other host content would visibly jump the page on every element selection or drag.

A [`scrollHandler`](../src/ui/editor/yamlScrollContainment.ts) contains all editor scroll-into-view requests to the editor's own scroller: hosts can place the designer anywhere on a scrolling page without defensive wrappers. Guarded by [`tests/e2e/embed-host-scroll.spec.ts`](../tests/e2e/embed-host-scroll.spec.ts) against the demo host page.

## Host data contract

HA-agnostic types ([`src/embed/types.ts`](../src/embed/types.ts)); an HA adapter is expected to be a thin pass-through.

### `states`

Entity-id → state value, or `{ state, attributes }`:

```js
{
  'sensor.temperature': '21.5',
  'light.desk': { state: 'on', attributes: { brightness: 128 } },
}
```

When provided, this **replaces** the State Simulator's persisted mock source for template preview (`states()`, `is_state()`, `state_attr()`, dotted access). Each push replaces the whole map. Simulator edits made inside an embedded mount stay in memory only — nothing is written to the standalone profile.

**Ownership contract (issue #110):** a pushed `states` object is treated as an **immutable snapshot** at the moment `setStates()` is called. Unchanged pushes are diffed structurally against the last-applied object and skipped for cost (no re-render, no template re-evaluation) — this compares by value, not by cloning, so **mutate-and-repush is unsupported**: if a host mutates the same object in place and calls `setStates()` again with that same reference, the mutation is invisible to the diff and the push is incorrectly treated as unchanged. Construct a fresh object (or a fresh copy of the changed parts) per push instead — the reference implementation for this contract is the OpenDisplay HA integration adapter, which already builds a new object per tick rather than mutating a cached one.

### `capabilities`

Mirrors the OpenDisplay HA integration's `capabilities.py` payload:

```js
{
  pixel_width: 296, pixel_height: 128,   // physical panel, before rotation
  rotation_degrees: 0,                    // quarter turns only
  render_width: 296, render_height: 128,  // drawing surface (preferred)
  color_scheme: 0x01,                     // Basic Standard 0x00 BW … 0x04 six
  accent_color: 'red',
  available_colors: ['black', 'white', 'red'],
  color_map: { black: '#000000', white: '#ffffff', red: '#c53929' },
  palette_measured: true,
}
```

Mapping onto the canvas ([`src/embed/hostContract.ts`](../src/embed/hostContract.ts)):

- **Size** — `render_width`/`render_height` when both present, else `pixel_width`/`pixel_height` swapped for 90°/270° rotations.
- **Rotation** — `rotation_degrees` normalized into {0, 90, 180, 270}; other angles keep the current rotation.
- **Palette structure** — `color_scheme` (Basic Standard value) wins; else inferred from `color_map` keys / `available_colors` names; else `accent_color`.
- **Palette hexes** — the measured hex values in `color_map` re-color the active palette: preview canvas, PNG export, halftone dither tiles and the layer-list color swatches all paint the adopted hexes (one palette source of truth). Recognized names: `black`, `white`, `red`, `yellow`, `blue`, `green`; invalid hexes and unknown names are ignored. Half tones (`half_red`, `gray`, …) are re-derived as the same blends of the measured primaries. The `accent` keyword resolves through the same map, so `accent_color` participates automatically. A push without `color_map` keeps the current palette; without any push the canonical palettes apply and standalone rendering is unchanged.

Known gaps: `palette_measured` itself is informational only (the hexes apply whether or not it is set). Fractional rotations are not representable. YAML export semantics are untouched — the payload always carries color *names*, never display hexes.

#### Display config lock ([issue #70](https://github.com/schlomo/odl-drawcustom-designer/issues/70))

When the mount received `capabilities` — at `mount()` or via `setCapabilities()` — the display config is **host-owned**: a lock icon appears next to the "Display config" heading, and the resolution, rotation and color mode controls follow its state.

- **Locked (default)** — the controls are disabled. Both `mount({ capabilities })` and `handle.setCapabilities(capabilities)` lock **by default** (`lock` defaults to `true`), so existing hosts that never pass `lock` see unchanged behavior.
- **Unlock (`lock: false`, or clicking the lock)** — the "virtual display" escape hatch: the user may configure any resolution/rotation/color mode immediately, and the preview no longer matches the host's physical display. Pass `lock: false` to `mount()` or `setCapabilities(capabilities, { lock: false })` to *seed* a display this way — e.g. a host that wants to hand the user a starting point without pinning them to it. The pushed values still land on the canvas and the lock icon still appears (showing its unlocked state) so the user can lock onto them later.
- **Re-lock** (click the lock, whether it was unlocked by the user or seeded via `lock: false`) — restores the last-pushed host display values (the designer-only preview dither setting survives).
- **A new `setCapabilities()` push** re-asserts the host display and, by default, re-locks the controls; pass `{ lock: false }` to keep them unlocked instead.
- **Load Demo while locked** loads the demo payload and simulator seed but **keeps** the host-defined resolution/rotation/palette. Accepted consequence: on small displays the demo layout may look bad. Unlocked (including the `lock: false` seed), Load Demo applies the showcase display config as in standalone.
- **No `capabilities`** (standalone, or an embed that never pushes them): no lock icon, controls behave exactly as before.

### `payload` / `onSaveRequest`

The payload is the drawcustom **element list YAML** (what the YAML panel shows). The parent owns persistence: session autosave is disabled in embedded mode, the share-link button is hidden, and `onSaveRequest(payload)` fires only on an explicit Save click.

### `theme`

`'light' | 'dark'`, applied as a class on the designer's wrapper element inside the mount's shadow root — embedded mounts never touch `document.documentElement` or `localStorage` theme preferences. Because every instance carries its own wrapper and stylesheet, two mounts on one page can hold different themes simultaneously.

## Clipboard requires a secure context

The copy buttons (Copy PNG, Copy YAML, share link) use the async clipboard
API, which browsers only expose in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
— HTTPS or `http://localhost`. When the host page is served from a plain-http
LAN IP or `file://` — the typical local Home Assistant box
(`http://192.168.1.2:8123`, `http://homeassistant.local:8123`), so the common
case rather than an edge case:

- **Copy YAML** and the share link still work — the designer falls back to the
  legacy `document.execCommand('copy')` path for text. They carry no warning.
- **Copy PNG** has no insecure-context clipboard path, and signals that
  upfront: the button renders warning-marked (amber surface plus a corner
  badge) from first paint, and hovering or focusing it shows
  "Copy PNG needs HTTPS or localhost — use Download PNG instead". It stays
  clickable; a click still fails with the visible "Clipboard requires HTTPS
  or localhost" alert as backstop. Use Download PNG, or serve the host page
  over HTTPS/localhost to get Copy PNG back.

## Standalone SPA

The standalone GitHub Pages app is a **host adapter over the same mount lifecycle** the library exports ([issue #72](https://github.com/schlomo/odl-drawcustom-designer/issues/72), [ADR-017](adr/ADR-017-host-adapter-seam.md)): [`src/main.tsx`](../src/main.tsx) calls `mountStandaloneApp()` ([`src/embed/standalone.tsx`](../src/embed/standalone.tsx)), which mounts `createStandaloneHost()` ([`src/embed/standaloneHost.ts`](../src/embed/standaloneHost.ts)) through the internal `mountDesigner()` in [`src/embed/mount.tsx`](../src/embed/mount.tsx) — the same function the public `mount()` uses with the embedded adapter.

Standalone behavior is unchanged by embedding: page-DOM rendering (no shadow root), document-level theme, IndexedDB session/mocks/variables autosave, `#d=` share-hash bootstrap and same-tab re-bootstrap, share link and theme toggle in the chrome.

### Host adapters

Everything that used to be an `embedded` conditional in the React shell is policy on the `DesignerHost` adapter ([`src/embed/host.ts`](../src/embed/host.ts)):

| Policy | Standalone | Embedded (`mount()`) |
|--------|-----------|----------------------|
| `styleScope` | `page` (page's own stylesheet) | `shadow` (isolated root + injected CSS) |
| `theme` | `{ owner: 'designer' }` — persisted preference on `document.documentElement`, theme toggle shown | `{ owner: 'host', value }` — fixed, scoped to the mount wrapper |
| `fill` | `viewport` | `container` |
| `shareLink` | `true` | `false` |
| `persistence` | IndexedDB writers | `null` — the parent owns the payload |
| `onSaveRequest` | absent (persists continuously) | present → Save button |
| `loadBootstrap` | async: session + `#d=` hash | sync: `payload`/`states`/`capabilities` options |

The interface is **internal on purpose** — it references internal types, so publishing it would freeze designer internals under semver ([`docs/releasing.md`](releasing.md)). The public embedded surface (`mount`, `MountOptions`, `MountHandle`, the host data contract) is unchanged by the convergence. The M4 HA panel ([issue #25](https://github.com/schlomo/odl-drawcustom-designer/issues/25)) becomes a third adapter, not a third mode.
