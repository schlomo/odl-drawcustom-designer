# Embedding the designer

The designer ships as an embeddable component (issue #20, [ADR-010](adr/ADR-010-ha-embed-mode.md)): a host application — the concrete target is the [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44) custom panel — mounts it into a container, pushes entity states and display capabilities, and receives the drawcustom YAML payload on Save. Styles are isolated via Shadow DOM at the mount boundary (issue #21); live HA data is a later milestone (#24).

## Library build

```bash
npm run build:lib
```

Emits **one self-contained ESM file** — React, styles, and bundled fonts included; the host provides nothing:

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

The demo page mounts the designer, pushes fake warm/cold states and a 296×128 BWR capabilities payload, switches themes, and shows every `onSaveRequest` payload in a `<pre>`. It doubles as the Playwright e2e fixture (`tests/e2e/embed-mount.spec.ts`).

The same demo is published from `main` at **<https://schlomo.github.io/odl-drawcustom-designer/embed/>** — `npm run build:site` assembles the deployed site (app at `/`, `dist-lib/` copied to `/embed/` by `tools/assembleSite.ts`); PR previews get their own `/embed/` the same way.

## Mount API

```js
import { mount } from './odl-drawcustom-designer.js'

const handle = mount(document.getElementById('designer'), {
  payload: yamlString,          // initial drawcustom YAML (list of elements)
  states: { /* see below */ },  // initial entity states for template preview
  capabilities: { /* below */ },// display description -> canvas + palette
  theme: 'dark',                // 'light' | 'dark', scoped to the container
  onSaveRequest(payload) {
    // user hit Save — persist the YAML; the designer never writes it itself
  },
})

handle.setStates(states)              // replace the entity-state map
handle.setCapabilities(capabilities)  // re-map canvas size/rotation/palette
handle.setPayload(yamlString)         // replace the payload (throws on bad YAML)
handle.setTheme('light')              // switch the container-scoped theme
handle.destroy()                      // unmount and empty the container
```

- The container needs an explicit height; the designer fills it (`height: 100%`).
- `mount()` and `setPayload()` throw synchronously on invalid YAML.
- Multiple mounts on one page are possible; each handle is independent — including per-instance light/dark themes.

### Shadow DOM at the mount boundary (issue #21)

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

`demo/isolation.html` is the hostile-host fixture proving the boundary: aggressive `!important` host CSS, Tailwind-colliding class names, and two instances with different themes on one page (`tests/e2e/embed-isolation.spec.ts`).

### Scroll containment (issue #79)

Designer-internal scrolling never scrolls the host page. The YAML editor scrolls itself programmatically — the Linked-editor sync centers the selected element's block on every canvas selection, and typing scrolls the cursor into view — and CodeMirror's default handling would walk ancestor scrollers past the mount boundary and call `window.scrollBy` on the host document whenever the editor's own scroller cannot absorb the full scroll. A designer embedded above other host content would visibly jump the page on every element selection or drag.

A [`scrollHandler`](../src/ui/editor/yamlScrollContainment.ts) contains all editor scroll-into-view requests to the editor's own scroller: hosts can place the designer anywhere on a scrolling page without defensive wrappers. Guarded by `tests/e2e/embed-host-scroll.spec.ts` against the demo host page.

## Host data contract

HA-agnostic types (`src/embed/types.ts`); an HA adapter is expected to be a thin pass-through.

### `states`

Entity-id → state value, or `{ state, attributes }`:

```js
{
  'sensor.temperature': '21.5',
  'light.desk': { state: 'on', attributes: { brightness: 128 } },
}
```

When provided, this **replaces** the State Simulator's persisted mock source for template preview (`states()`, `is_state()`, `state_attr()`, dotted access). Each push replaces the whole map. Simulator edits made inside an embedded mount stay in memory only — nothing is written to the standalone profile.

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

Mapping onto the canvas (`src/embed/hostContract.ts`):

- **Size** — `render_width`/`render_height` when both present, else `pixel_width`/`pixel_height` swapped for 90°/270° rotations.
- **Rotation** — `rotation_degrees` normalized into {0, 90, 180, 270}; other angles keep the current rotation.
- **Palette structure** — `color_scheme` (Basic Standard value) wins; else inferred from `color_map` keys / `available_colors` names; else `accent_color`.
- **Palette hexes** — the measured hex values in `color_map` re-color the active palette: preview canvas, PNG export, halftone dither tiles and the layer-list color swatches all paint the adopted hexes (one palette source of truth). Recognized names: `black`, `white`, `red`, `yellow`, `blue`, `green`; invalid hexes and unknown names are ignored. Half tones (`half_red`, `gray`, …) are re-derived as the same blends of the measured primaries. The `accent` keyword resolves through the same map, so `accent_color` participates automatically. A push without `color_map` keeps the current palette; without any push the canonical palettes apply and standalone rendering is unchanged.

Known gaps: `palette_measured` itself is informational only (the hexes apply whether or not it is set). Fractional rotations are not representable. YAML export semantics are untouched — the payload always carries color *names*, never display hexes.

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

`src/main.tsx` is a thin caller of the same machinery (`src/embed/standalone.tsx`): document-level theme, IndexedDB session bootstrap, share-hash navigation. Standalone behavior is unchanged by embedding.
