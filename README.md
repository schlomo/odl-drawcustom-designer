![ODL/OEPL Drawcustom Designer](src/assets/logo.webp)

# ODL/OEPL Drawcustom Designer

Visual [feature-rich](#features) editor for **[OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html)** (ODL) and [OpenEPaperLink](https://github.com/OpenDisplay/Home_Assistant_Integration/blob/main/docs/drawcustom/supported_types.md) (OEPL) drawcustom YAML. Paste exported element lists into Home Assistant’s **`drawcustom`** service (OpenEPaperLink or OpenDisplay custom integrations below).

Design layouts in the browser, preview them with realistic tag palettes and dithering, export HA-clean YAML or PNG, and share designs via URL. Simulate Home Assistant entity states for template preview. Add custom fonts and images to your designs.

![ODL/OEPL Drawcustom Designer — canvas editor with element toolbar, layers, YAML panel, and e-paper preview](docs/odl-designer-screenshot.webp)

## Home Assistant integrations (`drawcustom`)

These **custom components** (install via [HACS](https://www.hacs.xyz/)) expose a **`drawcustom`** action. Copy the designer’s YAML `payload` list into the service call.

| Integration | Service | Hardware | Install |
|-------------|---------|----------|---------|
| [**OpenEPaperLink**](https://github.com/OpenEPaperLink/Home_Assistant_Integration) | `open_epaper_link.drawcustom` | OpenEPaperLink AP and/or BLE tags ([firmware](https://github.com/OpenEPaperLink)) | [HACS: OpenEPaperLink](https://my.home-assistant.io/redirect/hacs_repository/?owner=OpenEpaperLink&repository=Home_Assistant_Integration) · [OEPL drawcustom docs](https://github.com/OpenEPaperLink/Home_Assistant_Integration/blob/main/docs/drawcustom/supported_types.md) |
| [**OpenDisplay**](https://github.com/OpenDisplay/Home_Assistant_Integration) | `opendisplay.drawcustom` | [OpenDisplay](https://github.com/OpenDisplay) boards/displays ([compatibility](https://opendisplay.org/firmware/seeed_display_compatibility.html)) | [HACS: OpenDisplay](https://my.home-assistant.io/redirect/hacs_repository/?owner=OpenDisplay&repository=Home_Assistant_Integration) · [OD drawcustom docs](https://github.com/OpenDisplay/Home_Assistant_Integration/blob/main/docs/drawcustom/supported_types.md) |

Example (OpenEPaperLink — target your display **device**, not entity):

```yaml
action: open_epaper_link.drawcustom
target:
  device_id: YOUR_DEVICE_ID
data:
  background: white
  payload:
    - type: text
      value: "Hello from the designer"
      x: 10
      y: 10
      size: 24
```

OpenDisplay uses the same payload shape with `action: opendisplay.drawcustom`.

> **Note:** The built-in [OpenDisplay core integration](https://www.home-assistant.io/integrations/opendisplay/) sends pre-rendered images via `upload_image` — it does **not** use `drawcustom`. Use the **custom** OpenDisplay integration above for YAML payloads.

## Specifications & upstream projects

| Resource | Description |
|----------|-------------|
| [OpenDisplay](https://github.com/OpenDisplay) | Open-source firmware and protocol standard for e-paper tags ([website](https://opendisplay.org/)) |
| [OpenDisplay Language (ODL)](https://opendisplay.org/protocol/open-display-language.html) | [OpenDisplay](https://github.com/OpenDisplay) spec — canonical draw payload YAML format |
| [OpenDisplay Basic Standard](https://opendisplay.org/protocol/basic-standard.html) | [OpenDisplay](https://github.com/OpenDisplay) spec — BLE/Wi‑Fi wire protocol (display announcement, image encoding); complementary to ODL |
| [OpenEPaperLink](https://github.com/OpenEPaperLink) | Open-source firmware and ecosystem for supported e-paper tags |
| [HA drawcustom — supported types](docs/spec/supported_types.md) | Vendored element reference (all 16 types) — [OpenEPaperLink upstream](https://github.com/OpenEPaperLink/Home_Assistant_Integration/blob/main/docs/drawcustom/supported_types.md) |
| [ODL gap report](docs/spec/odl-gap-report.md) | Parity audit: ODL vs vendored HA spec vs this editor |

## Features

### YAML engine & validation

- **All 16 draw element types** — `debug_grid`, `text`, `multiline`, `line`, `rectangle`, `rectangle_pattern`, `polygon`, `circle`, `ellipse`, `arc`, `icon`, `icon_sequence`, `dlimg`, `qrcode`, `plot`, `progress_bar`
- **Zod schema validation** with spec-aligned defaults and completions metadata
- **Parse / serialize round-trip** — templates and designer-only fields handled explicitly

### Visual canvas

- **Tag-faithful preview** — color modes BW, BWR, BWY, 4-color, 6-color scaffold, and RGB preview; palette clamping so named colors match what the tag can show
- **Direct manipulation** — select, drag, resize handles, keyboard nudge
- **Snap** — configurable grid snap plus edge snap to canvas bounds
- **Multi-select** — Shift+click, marquee rectangle, bulk move and nudge
- **Alignment** — align selection horizontally and vertically
- **Layer order** — bring to front, send to back, move up/down
- **Zoom** — 50%, 100%, 200%, and fit-to-panel
- **Rotation** — 0°, 90°, 180°, 270° (preview and export)
- **Designer overlays** — optional hints for hidden-on-tag elements (`visible: false`, shapes with fill or color set to `none`)
- **Dither preview** — toggle ordered dither (d=2) on the flat canvas

### YAML editor

- **CodeMirror 6** with YAML syntax and embedded **Jinja** highlighting
- **Delimiter scaffolding** — `{{ }}` and `{% %}` with HA-friendly autocomplete
- **Schema-driven completions** — element types, fields, icons, and template helpers
- **Inline diagnostics** — parse and validation errors with source ranges
- **Folded block scalars** for long single-line strings (e.g. templated multiline values)
- **Two-way coupling** — canvas edits update YAML; YAML edits update canvas and selection
- **Template preview mode** — resolve `{{ … }}` / `{% … %}` on the canvas using **mock entity states** you set in the State Simulator (no live Home Assistant connection)

### Property panel

- **Schema-driven forms** for every element type, including nested plot fields
- **Universal templating** — any property can be a literal or a Jinja template string; JSON fields (`points`, `icons`, plot `data`) accept a whole-field template or structured JSON
- **Geometry lock** — drag, resize, and nudge disabled when coordinates are templated
- **Cross-cutting `visible`** on all 16 types (ODL-aligned)

### Home Assistant templates

- **State Simulator** — add mock entities and edit their state strings so template preview can resolve `states('…')`, `is_state`, and similar patterns
- **Global mock store** — persists in IndexedDB across sessions (not included in share links)
- **Nunjucks evaluator** — `states`, `is_state`, filters, and common HA patterns (see [ADR-004](docs/adr/ADR-004-template-evaluator-scope.md))
- **Entity scan** — discover entity IDs referenced in the payload

### Assets & content manager

- **Local content map** — fonts and images keyed by exact YAML path (`/local/…`, bundled fonts)
- **Upload & verify** — decode-check fonts and images before storing
- **IndexedDB persistence** — global asset store shared across designs
- **Bundled fonts** — includes `ppb.ttf` and `rbm.ttf` as default fonts for correct text rendering

### Display configuration

- **Resolution** — common tag WxH quick-picks plus custom width/height
- **Color mode** — drives accent / half_accent preview mapping
- **Rotation (0°–270°)** — maps to drawcustom **`rotate`** service option
- **Preview dither toggle** — flat vs ordered **d=2**; maps to drawcustom **`dither`** in session and share links
- **Session persistence** — display settings restored with last design

### Session, demo & sharing

- **Auto-save** — last design, undo history, and mocks restored on reload
- **Load Demo** — one-click showcase layout covering every element type
- **Share link** — `#d=eJ…<data>` URL fragment encodes name, canvas, service options (when set), and elements (pako-deflated, base64url; assets/mocks stay local)
- **Undo / redo** — 50-step history with drag coalescing

### Export

- **PNG** — copy to clipboard or download (respects rotation and color mode)
- **YAML** — copy or download HA-ready payload from the toolbar

### Preview rendering fidelity

- **OpenType** — measured text and multiline layout with font metrics and anchors
- **MDI icons** — `@mdi/js` paths with autocomplete
- **QR codes** — live module preview
- **Plots** — axes, legends, and series from YAML `data`
- **`parse_colors`** — inline color segments in text/multiline
- **Images** — `dlimg` with local asset resolution

## Not in v1

- Embedded Home Assistant panel (load/save automation block in iframe)
- Binary OpenDisplay wire-format export
- Element copy/paste, free canvas pan, continuous zoom beyond fixed steps
- On-canvas polygon vertex editing

See `docs/adr/` for rationale (especially ADR-010, ADR-012).

## Development

```bash
npm install
npm run lint
npm test
npm run dev
npm run build
```

Local dev serves at `/`. For GitHub Pages or other subpath hosting:

```bash
VITE_BASE_PATH=/odl-drawcustom-designer/ npm run build
```

## Architecture

- `src/core/` — pure TypeScript (YAML, schema, renderer, templates); **no React** imports
- `src/core/brand.ts` — product slug, titles, IndexedDB name, storage key prefix
- `src/ui/` — React 19 application shell
- `src/storage/` — Dexie IndexedDB (assets, mocks, session)
- `docs/adr/` — architecture decision records

Start with [ADR-001](docs/adr/ADR-001-core-ui-separation.md) (core/UI boundary) and [ADR-006](docs/adr/ADR-006-ui-framework-react.md) (React shell).

## License

**ODL/OEPL Drawcustom Designer** is licensed under the **[Apache License 2.0](LICENSE)**.

Copyright © 2026 Schlomo Schapiro

Third-party and upstream attributions: [`NOTICE`](NOTICE) · [`docs/THIRD_PARTY.md`](docs/THIRD_PARTY.md) · [`docs/spec/ATTRIBUTION.md`](docs/spec/ATTRIBUTION.md)

This project is **not** affiliated with OpenEPaperLink, OpenDisplay, or Home Assistant. Upstream firmware and integrations may use **different licenses** (see third-party docs).
