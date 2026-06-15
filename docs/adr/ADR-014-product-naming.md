# ADR-014: Product naming (`odl-drawcustom-designer`)

## Status

Accepted

## Context

OpenDisplay Language (ODL) is the canonical name for drawcustom payload YAML. Product slug, titles, storage keys, and build paths should use one module (`src/core/brand.ts`) so renames do not require grep-driven migrations.

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

### Paths and upstream labels

- **Workspace folder:** `odl-drawcustom-designer/`
- **GitHub repository:** `schlomo/odl-drawcustom-designer` (see `APP_GITHUB_REPO_URL` in `brand.ts`)
- **Upstream spec references:** "OEPL spec" column labels in `docs/spec/odl-gap-report.md`, OpenEPaperLink vendor mentions in ADRs and vendored `supported_types.md`

### GH Pages default path

Build with `VITE_BASE_PATH=/odl-drawcustom-designer/` for subpath hosting (override via repo variable).

## Consequences

- One commit point for title/slug tweaks via `brand.ts`.
- IndexedDB name changes are not migrated across slug renames (ADR-003 no-migration policy).

## References

- `src/core/brand.ts`
- `tests/core/brand.test.ts`
- ADR-012 (ODL / drawcustom alignment)
