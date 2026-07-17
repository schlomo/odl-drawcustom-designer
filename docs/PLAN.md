# Contributor notes

Product documentation: [`README.md`](../README.md). Architecture decisions: [`docs/adr/`](adr/).

## Code map

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
| Showcase / Load Demo | `src/assets/showcase/`, `src/ui/data/showcase.ts` | ADR-015 |
| Clear demo simulator only | `src/ui/lib/clear-demo-data.ts` | ADR-015, ADR-003 |
| Simulator variables store | `src/storage/variables.ts`, `src/ui/preferences/variables.ts` | ADR-003, ADR-004 |
| Toolbar chrome | `src/ui/lib/toolbar-tooltip.ts` | ADR-016 |

**Specs:** HA drawcustom — `docs/spec/supported_types.md`; forward spec — [OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html); parity — `docs/spec/odl-gap-report.md`.

**Testing:** `docs/testing.md`, ADR-008, ADR-011. `npm test` (Vitest) is the merge gate; `npm run test:e2e` (Playwright, `tests/e2e/`) is a separate smoke layer for real browser wiring (ADR-011, revised 2026-07-15).

**Identity:** `src/core/brand.ts` (ADR-014).

## Merge gates

```bash
npm run lint && npm test && npm run build
```

**GitHub Pages:** `.github/workflows/pages.yml` — see [`docs/DEPLOYMENT.md`](DEPLOYMENT.md).
