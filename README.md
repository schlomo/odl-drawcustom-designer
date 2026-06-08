# OEPL Designer

Visual designer for [OpenEPaperLink](https://github.com/OpenEPaperLink) `drawcustom` YAML payloads in Home Assistant.

## Status

**Phase 1** — core complete (YAML engine, templates, assets, renderer stubs for all 16 types).

**Phase 2** — complete (YamlEditor, Content Manager, State Simulator, canvas interaction, schema-driven property forms).

**Phase 3a** — IndexedDB (**committed** `9d58839`).

**Phase 3b** — opentype text/multiline (**committed** `23d12b5`).

**Phase 3c** — MDI icons + icon_sequence (**committed** `7deb2fd`).

**Phase 3d** — QR + plot preview (**committed** `3b75953`).

**Phase 3e** — parse_colors + ordered dither (**committed** `ce99de5`).

**Phase 3f** — canvas interaction polish (**committed** `1b629ff`).

**Phase 3g** — architecture gate (**committed** `e8ff378`).

**Phase 4a** — global storage + session restore (**committed** `5ad7e6f`).

**Phase 4b** — export bars, zoom, hash share (**committed** `0bac3b6`).

**Next:** Phase **4c** — multi-select + alignment (§18c). Map: [`docs/PLAN.md`](docs/PLAN.md) §7 and §18.

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
- `src/storage/` — Dexie IndexedDB (assets, global mocks, session) — Phase 4a ✅
- `docs/adr/` — architecture decision records

See ADR-001 and ADR-006 for core/UI separation.

## License

TBD
