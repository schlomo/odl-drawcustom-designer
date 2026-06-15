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

**Specs:** HA drawcustom — `docs/spec/supported_types.md`; forward spec — [OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html); parity — `docs/spec/odl-gap-report.md`.

**Testing:** `docs/testing.md`, ADR-008, ADR-011.

**Identity:** `src/core/brand.ts` (ADR-014).

## Merge gates

```bash
npm run lint && npm test && npm run build
```

**GitHub Pages:** `.github/workflows/pages.yml` — branch `gh-pages`; optional repo variable `VITE_BASE_PATH=/odl-drawcustom-designer/`.
