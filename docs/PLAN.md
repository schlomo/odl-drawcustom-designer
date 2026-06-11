# Internal development notes

> **Not shipped with releases.** Product documentation lives in `README.md` and `docs/adr/`. This file is a short internal snapshot for contributors.

## Product

**ODL/OEPL Drawcustom Designer** (`odl-drawcustom-designer`) — browser editor for [OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html) drawcustom YAML. Targets HA `drawcustom` via [OpenEPaperLink](https://github.com/OpenEPaperLink/Home_Assistant_Integration) (`open_epaper_link.drawcustom`) and [OpenDisplay](https://github.com/OpenDisplay/Home_Assistant_Integration) (`opendisplay.drawcustom`) custom integrations.

Identity constants: `src/core/brand.ts` (ADR-014).

## Architecture

| Area | Location | ADR |
|------|----------|-----|
| Pure logic (no React) | `src/core/` | ADR-001 |
| React shell | `src/ui/` | ADR-006 |
| IndexedDB | `src/storage/` | ADR-003 |
| YAML + Jinja editor | `src/ui/editor/` | ADR-009 |
| Templates | `src/core/templates/` | ADR-004 |
| Share hash | `src/share/` | ADR-005 |
| Rendering | `src/core/renderer/` | ADR-007 |
| ODL / drawcustom alignment | `docs/spec/odl-gap-report.md` | ADR-012 |
| Universal templating | `src/core/schema/propertyEditorMeta.ts` | ADR-013 |

**Specs:** HA drawcustom — `docs/spec/supported_types.md` ([upstream](https://github.com/OpenEPaperLink/Home_Assistant_Integration/blob/main/docs/drawcustom/supported_types.md)); forward spec — [OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html); parity — `docs/spec/odl-gap-report.md`.

**Testing:** `docs/testing.md`, ADR-008, ADR-011.

## Shipped (v1 scope)

- All **16 draw types** — schema, preview renderer, property forms, YAML round-trip
- **Canvas** — drag, resize, grid + edge snap, multi-select, marquee, align, layer order, keyboard nudge, zoom 50/100/200/fit, undo/redo (50 steps)
- **YAML panel** — CodeMirror 6, Jinja scaffolding, schema autocomplete, inline lint, block scalars, YAML↔canvas coupling
- **Templates** — Nunjucks preview, State Simulator, global mock entities (IndexedDB)
- **Content manager** — font/image upload; local content map by exact YAML path
- **Display config** — resolution quick-picks + custom WxH, tag color modes (BW/BWR/BWY/4/6/RGB preview), rotation, WYSIWYG palette clamp
- **Export & share** — PNG/YAML copy/download, `#d=eJ…` share link, last-session restore, Load Demo showcase
- **Templating** — every property field can be scalar or template string; geometry locked on canvas when templated
- **ODL alignment** — `visible` on all 16 types; gap report maintained

## Post-v1 / not planned for v1

| Item | Notes |
|------|--------|
| HA panel embed | ADR-010 — blocked on maintainer contract |
| `background`, `ttl`, `dry-run` service fields | No dedicated controls yet — `rotate`/`dither` via display + canvas UI |
| Wire-format / Basic Standard encoder | Mapping documented in ADR-012 only |
| Element copy/paste, free pan, continuous zoom | Deferred |
| Polygon vertex handles on canvas | JSON `points` editor today |
| Asset bundle zip, PWA, history diff | Cut or deferred |
| Playwright E2E | Optional smoke at ship; Vitest is primary gate |

## Repo layout

```
src/core/       # YAML engine, schema, renderer, templates
src/ui/         # React app
src/storage/    # Dexie (assets, mocks, session)
tests/          # Vitest — core, ui, storage
docs/adr/       # Architecture decisions
docs/spec/      # Vendored drawcustom spec + ODL gap report
```

Local workspace folder may still be named `oepl-designer/` on disk; product slug is `odl-drawcustom-designer`.

## Gates before merge

```bash
npm run lint && npm test && npm run build
```

GH Pages: set repo variable `VITE_BASE_PATH=/odl-drawcustom-designer/` when deploying to a subpath.
