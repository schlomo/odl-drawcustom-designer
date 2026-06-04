# OEPL Designer

Visual designer for [OpenEPaperLink](https://github.com/OpenEPaperLink) `drawcustom` YAML payloads in Home Assistant.

## Status

**Phase 0** — scaffold, ADRs, golden YAML round-trip test, React shell placeholder.

## Spec

Vendored from upstream: [`docs/spec/supported_types.md`](docs/spec/supported_types.md)

## Development

```bash
npm install
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
