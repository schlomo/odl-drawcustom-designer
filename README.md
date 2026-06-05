# OEPL Designer

Visual designer for [OpenEPaperLink](https://github.com/OpenEPaperLink) `drawcustom` YAML payloads in Home Assistant.

## Status

**Phase 1** — core complete (YAML engine, templates, assets, renderer stubs for all 16 types).

**Phase 2a–2c** — UI shell + YamlEditor (**committed** `84d2164`).

**Phase 2d** — Content Manager, State Simulator, live template preview on canvas (**uncommitted**): upload fonts/images by YAML path, mock HA entity states (persisted in `localStorage`), evaluated templates render on canvas while YAML stays verbatim.

**Next:** Phase **2e** — canvas drag/resize and schema-driven property forms. See [`docs/PLAN.md`](docs/PLAN.md) §7 and §16d.

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
