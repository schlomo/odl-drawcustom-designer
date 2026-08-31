# ADR-016: Single-row responsive toolbars

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
   - **Page header** (`App.tsx` → `HeaderActionToolbar`): `header-chrome-layout.ts` / `data-header-toolbar`. This row was the last `shrink-0` toolbar with no collapse at all, which made the header — not the workspace — set the document's horizontal floor, and put a horizontal scrollbar on an embedding **host page** whenever a host registered a few actions. Its probe holds the meta row at natural width **beside** the labeled buttons, so the slot test answers "do the labels still fit before any header text has to give way?"

3. **Page-header shrink priority** (maintainer ruling 2026-08-31) — inside the header, width is given up in this order:
   1. the action buttons drop their **text labels** (icons + `ToolbarTooltip`);
   2. the meta row then drops **whole segments** in `HEADER_META_DROP_ORDER` (`header-meta-collapse.ts`): privacy note → GitHub link → branch → SHA → build identity (`v{version}` / `PR #n`), which is the last thing standing;
   3. a dropped segment is **removed from the DOM**, never ellipsed into a stub (`Client-…`, `feat/si…`) and never `visibility: hidden`. The branch name keeps a CSS ellipsis inside its own budget (PR #173) — it is the only segment allowed to degrade rather than vanish.

   A host action registered **without** an `icon` keeps its text when the row collapses: its label is its only identity. Hosts wanting narrow-panel behaviour register an icon (docs/embedding.md).

4. **Multi-select floater** — `CanvasSelectionToolbar` stays one row; `max-w-[90%]` of the canvas section (`CANVAS_SELECTION_TOOLBAR_MAX_WIDTH_RATIO`).

5. **Session vs canvas chrome** — **Clear all** lives in the **page header** (`App.tsx`), not the canvas toolbar. Undo depth is not shown in the UI.

6. **Export flash styling** — `ExportIconButton` omits neutral `shell.button` surface while success/error feedback is active so green/red flash remains visible (see `surfaceClass` on `IconButton`).

7. **Shared button primitives** — Toolbar chrome reuses a small set of components/tokens rather than one-off classes:
   - `TextButton` + `shell.button` / `shell.buttonDestructive` (host actions with no icon)
   - `IconButton` + `shell.buttonDestructiveIcon` for **Clear all** and `IconButton` for **Load Demo** — both carry an icon precisely so the page header can collapse them (a text-only button cannot go icon-only; it would just disappear)
   - `IconButton` `variant="destructive"` + `shell.buttonDestructiveIcon` (e.g. **Delete selected** — same palette as Clear all)
   - `ToolbarChipButton` + `toolbarChipClassName` (zoom presets)
   - `FeatureToggle` + `toggleButtonClassName` (snap, dither, YAML toggles)
   - `ExportIconButton` / labeled `IconButton` for copy/download/share actions

## Consequences

- Narrow columns keep all controls reachable without vertical stacking
- Icon-only controls **must** expose the hidden text label as a tooltip via `ToolbarTooltip` (mouse enter/leave with delayed show; no CSS `focus-within`, which left tooltips stuck when moving between toolbar buttons), plus `collapsedToolbarTooltip` / `tooltip` / `textLabel` for native `title` fallback. Native `title` alone is insufficient (disabled buttons, embedded webviews). Toolbar rows use `overflow-visible` so tooltips are not clipped.
- New toolbar rows should reuse `useToolbarLabels` + layout constants rather than ad-hoc `flex-wrap`
- Tests in `tests/ui/lib/toolbar-label-measure.test.ts`, `use-toolbar-labels.test.ts` and `header-meta-collapse.test.ts` guard measured fit behavior; `tests/e2e/header-horizontal-overflow.spec.ts` guards the page header against real Chromium layout (jsdom does none), standalone **and** embedded
- Below roughly 780px the **workspace** (the add-element bar squeezed into a narrow centre column) becomes the widest thing on the page; that is a separate subtree, and "no mobile layout" (below) still stands

## Alternatives considered

- **Horizontal scroll** on wrap — rejected; icon collapse matches add-element bar UX
- **Overflow menu** — deferred; more clicks for rarely used actions
- **Separate mobile layout** — out of scope for desktop-first designer
