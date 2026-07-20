# Embedding the designer

The designer ships as an embeddable component (issue #20, [ADR-010](adr/ADR-010-ha-embed-mode.md)): a host application — the concrete target is the [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44) custom panel — mounts it into a container, pushes entity states and display capabilities, and receives the drawcustom YAML payload on Save. Style isolation via Shadow DOM is issue #21; live HA data is a later milestone (#24).

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
npm run build:lib && python3 -m http.server -d dist-lib
# open http://localhost:8000/
```

The demo page mounts the designer, pushes fake warm/cold states and a 296×128 BWR capabilities payload, switches themes, and shows every `onSaveRequest` payload in a `<pre>`. It doubles as the Playwright e2e fixture (`tests/e2e/embed-mount.spec.ts`).

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
- The compiled stylesheet is injected once per document (or per shadow root when the container lives inside one) and left in place on destroy.
- Multiple mounts on one page are possible; each handle is independent.

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

`'light' | 'dark'`, applied as a class on the designer's wrapper element inside your container — embedded mounts never touch `document.documentElement` or `localStorage` theme preferences. Full CSS variable relocation off `:root` plus Tailwind utility isolation lands with Shadow DOM in issue #21.

## Standalone SPA

`src/main.tsx` is a thin caller of the same machinery (`src/embed/standalone.tsx`): document-level theme, IndexedDB session bootstrap, share-hash navigation. Standalone behavior is unchanged by embedding.
