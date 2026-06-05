# OEPL Designer

Visual designer for [OpenEPaperLink](https://github.com/OpenEPaperLink) `drawcustom` YAML payloads in Home Assistant.

## Status

**Phase 1** — core complete (YAML engine, templates, assets, renderer stubs for all 16 types).

**Phase 2a** — UI shell baseline (uncommitted): app layout, canvas preview, read-only property panel (schema-driven editing in Phase 2d), and **YamlEditor** (CodeMirror 6 with schema + Jinja autocomplete, inline lint, YAML↔canvas linking). Content Manager and State Simulator UI deferred to Phase 2d.

See [`docs/PLAN.md`](docs/PLAN.md) §7 progress tracker, §2, and [`docs/adr/ADR-009-yaml-jinja-editor.md`](docs/adr/ADR-009-yaml-jinja-editor.md) for YamlEditor behavior.

## Spec

Vendored from upstream: [`docs/spec/supported_types.md`](docs/spec/supported_types.md)

## Development

```bash
npm install
npm run lint
npm test
npm run dev
npm run build
```

Local dev serves at `/`. For subpath hosting, build with `VITE_BASE_PATH` (e.g. `VITE_BASE_PATH=/tools/oepl/ npm run build`).

## Architecture

- `src/core/` — pure TypeScript (no React); TDD with Vitest
- `src/ui/` — React 19 shell
- `src/storage/` — IndexedDB adapters (Phase 3)
- `docs/adr/` — architecture decision records

See ADR-001 and ADR-006 for core/UI separation.

## License

TBD
