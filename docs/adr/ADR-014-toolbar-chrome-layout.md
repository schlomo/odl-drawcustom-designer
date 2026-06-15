# ADR-014: Single-row responsive toolbars

## Status

Accepted

## Context

Panel chrome toolbars (add-element row, canvas header, multi-select floater) wrapped to multiple rows on typical viewports. That wasted vertical space above the canvas and pushed controls into inconsistent positions. Canvas header also mixed session-level actions (Clear all) with view-local controls.

## Decision

1. **Single row** — Primary toolbars use `flex-nowrap` and do not wrap. Implementation: `toolbarGroupsRow` / `toolbarGroupRow` in `export-action-feedback.ts`; add-element bar uses `flex-nowrap` on `ElementToolbar`.

2. **Label collapse** — When width is insufficient for icon + text on one row, hide text labels and keep icons (or short fixed labels for zoom presets). Same mechanism everywhere:
   - `toolbar-label-measure.ts` — compares header slot width to an off-screen **probe** that always renders full labels; expand uses hysteresis (`TOOLBAR_LABEL_EXPAND_BUFFER_PX`) to avoid flicker
   - `useToolbarLabels` — `ResizeObserver` on the probe + toolbar; no hard-coded per-label width tables
   - Canvas and YAML headers: title left, toolbar **right-aligned** to the workspace column (`justify-between`); slot width = header `clientWidth` − title width (`toolbar-header-slot.ts`); export actions (copy/download) are the left-most toolbar group in both panels
   - Element bar: `useElementToolbarLabels` / `data-element-toolbar`
   - Canvas header: `canvas-toolbar-layout.ts` / `data-canvas-toolbar`

3. **Multi-select floater** — `CanvasSelectionToolbar` stays one row; `max-w-[90%]` of the canvas section (`CANVAS_SELECTION_TOOLBAR_MAX_WIDTH_RATIO`).

4. **Session vs canvas chrome** — **Clear all** lives in the **page header** (`App.tsx`), not the canvas toolbar. Undo depth is not shown in the UI.

5. **Export flash styling** — `ExportIconButton` omits neutral `shell.button` surface while success/error feedback is active so green/red flash remains visible (see `surfaceClass` on `IconButton`).

6. **Shared button primitives** — Toolbar chrome reuses a small set of components/tokens rather than one-off classes:
   - `TextButton` + `shell.button` / `shell.buttonDestructive` (e.g. **Clear all**)
   - `IconButton` `variant="destructive"` + `shell.buttonDestructiveIcon` (e.g. **Delete selected** — same palette as Clear all)
   - `ToolbarChipButton` + `toolbarChipClassName` (zoom presets)
   - `FeatureToggle` + `toggleButtonClassName` (snap, dither, YAML toggles)
   - `ExportIconButton` / labeled `IconButton` for copy/download/share actions

## Consequences

- Narrow columns keep all controls reachable without vertical stacking
- Icon-only controls **must** expose the hidden text label as a tooltip via `ToolbarTooltip` (mouse enter/leave with delayed show; no CSS `focus-within`, which left tooltips stuck when moving between toolbar buttons), plus `collapsedToolbarTooltip` / `tooltip` / `textLabel` for native `title` fallback. Native `title` alone is insufficient (disabled buttons, embedded webviews). Toolbar rows use `overflow-visible` so tooltips are not clipped.
- New toolbar rows should reuse `useToolbarLabels` + layout constants rather than ad-hoc `flex-wrap`
- Tests in `tests/ui/lib/toolbar-label-measure.test.ts` and `use-toolbar-labels.test.ts` guard measured fit behavior

## Alternatives considered

- **Horizontal scroll** on wrap — rejected; icon collapse matches add-element bar UX
- **Overflow menu** — deferred; more clicks for rarely used actions
- **Separate mobile layout** — out of scope for desktop-first designer
