# ADR-014: Product naming (`odl-drawcustom-designer`)

## Status

Accepted (Phase 4r — 2026-06)

## Context

The designer was scaffolded as **oepl-designer**, reflecting the OpenEPaperLink HA integration lineage. OpenDisplay Language (ODL) is the canonical name for drawcustom payload YAML. User-facing copy still referenced OpenEPaperLink/OEPL in headers and demo titles, while storage keys and IndexedDB names used `oepl-*` prefixes scattered across the codebase.

Owner decision: rebrand the **product** without renaming the GitHub repo or local workspace folder.

## Decision

### Product identifiers (`src/core/brand.ts`)

| Export | Value |
|--------|-------|
| `APP_SLUG` | `odl-drawcustom-designer` |
| `APP_TITLE` | ODL/OEPL Drawcustom Designer |
| `APP_TAGLINE` | Visual editor for OpenDisplay Language YAML — Home Assistant drawcustom compatible. |
| `INDEXEDDB_NAME` | same as `APP_SLUG` |
| `SHOWCASE_DEMO_TITLE` | ODL/OEPL drawcustom Showcase |
| `FONT_FAMILY_PREFIX` | `drawcustom-font` |
| `YAML_LINT_SOURCE` | `${APP_SLUG}-yaml` |
| `storageKey(suffix)` | `${APP_SLUG}-${suffix}` |

All localStorage keys, Dexie database name, CodeMirror lint source id, and CSS `@font-face` family prefixes derive from this module.

### Explicit exceptions (unchanged)

- **Workspace folder on disk:** `oepl-designer/`
- **GitHub repository name** (optional rename later)
- **Upstream spec references:** "OEPL spec" column labels in `docs/spec/odl-gap-report.md`, OpenEPaperLink vendor mentions in ADRs and vendored `supported_types.md`

### GH Pages default path

Build with `VITE_BASE_PATH=/odl-drawcustom-designer/` for subpath hosting (override via repo variable).

## Consequences

- One commit point for future rename tweaks (title, slug) without grep-driven migrations.
- Existing browser IndexedDB under the old name is not migrated — acceptable during v1 development (ADR-003 no-migration policy).
- Tests enforce no `oepl-designer` or bare `oepl-` literals in `src/` or `tests/` outside `brand.ts`.

## References

- `src/core/brand.ts`
- `tests/core/brand.test.ts`
- ADR-012 (ODL / drawcustom alignment)
