# Architecture audit — 2026-06-08

Architecture quality gate before major storage work (ADR-011). No product features added.

## Summary

| Gate | Result |
|------|--------|
| `src/core/` React imports | **Pass** — grep clean |
| ESLint core boundary | **Pass** — `no-restricted-imports` on `src/core/**` |
| UI → core public surface | **Partial** — 18 files import deep `src/core/*` paths (listed below); no ESLint rule yet |
| ADR-001–010 vs code | **Pass with documented drift** (storage v1, share hash, embed mode) |
| ADR-011 behavior policy | **Added** |
| Test simplification | **−8 tests, −3 files** (84 → 81 files); behavior coverage retained |
| CI | **Pass** — `npm run lint && npm test && npm run build` (547 tests, 82 files) |

---

## Part 1 — ADR audit

| ADR | Status accurate? | Drift / action |
|-----|------------------|----------------|
| **001** Core/UI separation | Yes | UI deep-imports renderer internals (canvas layer); document as allowed debt until re-exports or Phase 4 canvas refactor |
| **002** Local content map | Yes | HA-clean export tested; no `preview_data_url` in serialize |
| **003** IndexedDB schema | Yes (target) | **Implementation v1:** `projects` + per-project mocks — updated ADR with pre-4a note; Phase 4a lands `session` row |
| **004** Template scope | Yes | Updated consequence: global mocks after 4a (was "per project") |
| **005** Share hash | Yes (not built) | No `#d=pako` in `src/` yet — planned Phase 4b |
| **006** React shell | Yes | React 19 + Vite; core framework-free |
| **007** Hybrid rendering | Yes | SVG + canvas split in `src/core/renderer/` |
| **008** TDD + CI | Yes | Cross-ref ADR-011 + `docs/testing.md` added |
| **009** YamlEditor | Yes | 14 editor test files; integration test covers first-item lint |
| **010** HA embed | Yes | Accepted pending 4f; dual runtime not wired |
| **011** Behavior tests | **New** | `docs/adr/ADR-011-behavior-test-policy.md` |

---

## Part 2 — Adherence audit

### Core boundary

- `grep` for `react` / `react-dom` in `src/core/`: **0 matches**
- ESLint enforces React ban on `src/core/**` and `tests/core/**`

### UI imports bypassing `src/core/index.ts`

These files import from `src/core/<subpackage>/...` instead of the public barrel:

| File | Deep import |
|------|-------------|
| `draw-canvas-stubs.ts` | renderer/colors, dither, fonts, opentype-glyphs, types, text-anchor-draw |
| `element-geometry.ts` | renderer/anchors, qr-modules |
| `primitive-bounds.ts` | arc-geometry, types, anchors |
| `SvgPrimitive.tsx` | arc-geometry, types |
| `CanvasElementLayer.tsx` | renderer/types |
| `ElementListThumbnail.tsx` | mdi-icons |
| `element-list-row.ts` | mdi-icons |
| `font-layout-token.ts` | renderer/fonts |
| `load-font-faces.ts` | font-family-name |
| `svg-font-family.ts` | font-family-name |
| `load-asset-images.ts` | assets/mime, schema/elements |
| `guess-mime.ts` | assets/mime |
| `known-font-keys.ts` | templates/patterns |
| `sample-elements.ts` | schema/elements |

**Recommendation (Phase 4+):** Add ESLint `no-restricted-imports` for `src/ui/**` → `src/core/*` except `src/core/index.ts`, or re-export canvas-facing helpers from the barrel.

### Business logic in UI (flag only)

| Location | Concern | Verdict |
|----------|---------|---------|
| `element-geometry.ts` | Drag/resize coord mutation | **Keep in UI** — designer interaction, uses core anchors |
| `draw-canvas-stubs.ts` | Canvas preview drawing | **Keep in UI** — display adapter over core renderer |
| `dlimg-resize.ts` | Image fit math | **Candidate for core** if reused by export pipeline; OK in UI for preview-only |
| `property-field-meta.ts` | Form widget kind | **Keep in UI** — uses core schema metadata |
| `snap-to-grid.ts` | Grid snap prefs | **Keep in UI** — designer chrome |

No obvious violations moved in this phase (scope: audit only).

---

## Part 3 — Test inventory

Legend: **KEEP** = behavior; **MERGE/DEL** = removed or consolidated in 3g.

### Core (`tests/core/`) — 44 files

| File | Tag |
|------|-----|
| yaml-roundtrip.test.ts | KEEP — sweep + HA-clean |
| validate.test.ts | KEEP |
| validate-templated-dashboard.test.ts | KEEP |
| schema/elementTemplates.test.ts | KEEP |
| schema/normalize-elements.test.ts | KEEP |
| schema/plot-property-metadata.test.ts | KEEP |
| schema/propertyMetadata.test.ts | KEEP |
| schema/spec-defaults.test.ts | KEEP |
| assets/scanner.test.ts | KEEP |
| assets/resolver.test.ts | KEEP |
| assets/font-library.test.ts | KEEP |
| assets/font-requirements.test.ts | KEEP |
| assets/validate-upload.test.ts | KEEP |
| templates/scan.test.ts | KEEP |
| templates/evaluate.test.ts | KEEP |
| templates/preview.test.ts | KEEP |
| templates/ha-datetime.test.ts | KEEP |
| renderer/render-element.test.ts | KEEP — sweep |
| renderer/line.test.ts | KEEP — **DEL** duplicate fixture test |
| renderer/coordinates.test.ts | KEEP |
| renderer/colors.test.ts | KEEP |
| renderer/parse-colors.test.ts | KEEP |
| renderer/parse-colors-render.test.ts | KEEP |
| renderer/dither.test.ts | KEEP |
| renderer/visibility.test.ts | KEEP |
| renderer/text-layout.test.ts | KEEP |
| renderer/text-anchor.test.ts | KEEP |
| renderer/bidi-text.test.ts | KEEP |
| renderer/rtl-text.test.ts | KEEP |
| renderer/glyph-coverage.test.ts | KEEP |
| renderer/font-family-name.test.ts | KEEP |
| renderer/icon.test.ts | KEEP |
| renderer/icon-sequence.test.ts | KEEP |
| renderer/mdi-icons.test.ts | KEEP |
| renderer/qrcode.test.ts | KEEP |
| renderer/plot.test.ts | KEEP |
| renderer/plot-sample-data.test.ts | KEEP |
| renderer/arc-geometry.test.ts | KEEP |
| renderer/stub-preview.test.ts | KEEP — progress/grid behavior |
| renderer/renderer-defaults.test.ts | KEEP — metadata defaults |
| renderer/anchors.test.ts | KEEP |

### Storage (`tests/storage/`) — 2 files

| File | Tag |
|------|-----|
| assets.test.ts | KEEP |
| mocks.test.ts | KEEP |

### UI (`tests/ui/`) — 35 files (was 38)

| File | Tag |
|------|-----|
| lib/canvas-interaction.test.ts | KEEP — **MERGE** coordinate rounding |
| lib/canvas-keyboard.test.ts | KEEP |
| lib/canvas-resize-handles.test.ts | KEEP |
| lib/selection-remap.test.ts | KEEP |
| lib/draw-order.test.ts | KEEP — **DEL** trivial index helpers |
| lib/element-list-row.test.ts | KEEP |
| lib/font-layout-token.test.ts | KEEP |
| lib/content-asset-rows.test.ts | KEEP |
| lib/dlimg-resize.test.ts | KEEP |
| lib/load-asset-images.test.ts | KEEP |
| lib/load-font-faces.test.ts | KEEP |
| lib/load-opentype-fonts.test.ts | KEEP |
| lib/load-opentype-fonts-unsupported.test.ts | KEEP |
| lib/font-readiness.test.ts | KEEP |
| lib/known-font-keys.test.ts | KEEP |
| lib/mdi-icon-names.test.ts | KEEP |
| lib/yaml-status-messages.test.ts | KEEP |
| lib/coordinate-rounding.test.ts | **DEL** → merged |
| editor/yaml-editor-integration.test.ts | KEEP |
| editor/yaml-editor-scroll.test.ts | KEEP — **MERGE** resync map |
| editor/yaml-elements-sync.test.ts | KEEP |
| editor/yaml-selection-sample.test.ts | KEEP |
| editor/yaml-selection-helpers.test.ts | **DEL** — boolean mirrors |
| editor/yaml-resync-selection.test.ts | **DEL** → merged |
| editor/yaml-scroll-command.test.ts | KEEP |
| editor/yaml-completions.test.ts | KEEP |
| editor/jinja-completions.test.ts | KEEP |
| editor/jinja-bracket-handling.test.ts | KEEP |
| editor/jinja-context.test.ts | KEEP |
| editor/yaml-issue-ranges.test.ts | KEEP |
| editor/yaml-lint.test.ts | KEEP |
| editor/yaml-tooltip-visibility.test.ts | KEEP |
| editor/yaml-linked-element.test.ts | KEEP |
| editor/yaml-entity-ids.test.ts | KEEP |
| editor/locate-element-in-yaml.test.ts | KEEP |
| editor/locate-entity-in-yaml.test.ts | KEEP |
| preferences/*.test.ts (5) | KEEP |
| data/display-presets.test.ts | KEEP |

### Behavior gaps addressed

- Golden round-trip: all 16 types via `tests/fixtures/spec/*-minimal.yaml` + sweep ✓
- Canvas drag/resize: `canvas-interaction.test.ts` (translate, bounds, endpoints) ✓
- HA-clean export: strengthened `yaml-roundtrip.test.ts` to iterate `DESIGNER_ONLY_FIELDS` ✓

---

## Spec review

*(Against `docs/spec/supported_types.md` after test changes.)*

### Pass

- All 16 draw types have minimal fixtures, validate, round-trip, and render sweep
- HA-clean export strips `preview_data_url`, `_yaml_comments`, and `_`-prefixed keys
- Color aliases, percentage coordinates, template evaluation covered in core tests
- Canvas geometry materializes omitted coords per spec defaults on drag (19-3/19-4)
- Editor Jinja scaffolding contract preserved (ADR-009 tests retained)

### Gaps

- **Share hash (ADR-005):** not implemented — Phase 4b
- **Service options UI (4g):** schema exists; top-level `background`/`dither`/etc. not in property shell
- **Floyd-Steinberg dither (d=1):** deferred post-v1
- **IndexedDB session store:** ADR-003 target schema; v1 code still uses projects — Phase 4a

### Recommendations

- Phase 4a: land Dexie v2 before adding undo/history tests tied to project id
- Add ESLint UI→core barrel rule when re-export surface is expanded
- Phase 4h: single Playwright smoke (load + add element) per ADR-008

---

## Next

Next storage work: global IndexedDB reshape (ADR-003). Read `docs/testing.md` first.
