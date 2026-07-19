# ADR-013: Universal property templating

## Status

Accepted

## Context

Home Assistant `drawcustom` may preprocess payload YAML through Jinja before the integration parses element definitions. **Any literal** in the payload — coordinates, booleans, JSON blobs — can therefore arrive as a template string. The designer accepts, preserves, and edits those strings without coercing them to numbers, booleans, or parsed JSON on load, save, or export.

Per-type template UI in the property panel does not scale across 16 draw types and plot nested fields.

Preview remains **best-effort** when values are templated (ADR-004 evaluator scope unchanged).

## Decision

### 1. Schema — template-capable Zod unions

All element property fields use template-capable schemas in `src/core/schema/`:

| Stored shape | Schema helper | Examples |
|--------------|---------------|----------|
| Number | `numericTemplateSchema` | `size`, `progress`, `spacing`, plot axis widths |
| Boolean | `boolTemplateSchema` | `visible`, `dashed`, `show_percentage` |
| Coordinate (number, `%`, numeric string) | `coordinateTemplateSchema` | `x`, `y`, `x_start`, `max_width` |
| Enum / color alias | existing `enumOrJinjaTemplateSchema` / `colorSchema` | `direction`, `fill`, `anchor` |
| Plain string | `z.string()` (templates are strings) | `value`, `url`, `font` |
| JSON array/object **or** whole-field template | `jsonOrTemplateSchema(inner)` | `points`, `icons`, plot `data` |

**JSON fields (`points`, `icons`, plot `data`):** v1 supports **either** structured JSON **or** a single template string that HA evaluates to JSON at runtime. Per-coordinate or per-item templates inside arrays are out of scope.

### 2. Property editor metadata (core)

Central types in `src/core/schema/propertyEditorMeta.ts`:

- `PropertyEditorShape` — `number | boolean | enum | string | coordinate | json | color | font | icon`
- `isTemplateStoredValue(value)` — `hasTemplateSyntax` on stored string
- `resolveEditorMode(value, shape)` → `'scalar' | 'template'`
- `getPropertyEditorShape(elementType, property)` — drives schema, panel dispatch, and geometry lock classification

UI dispatches generic controls from shape metadata — **no per-element-type forks** in `ElementPropertyForm`.

### 3. YAML round-trip

- Template strings stored **verbatim** in element state and HA export.
- `normalizePropertyValueForStorage` must not parse template strings into numbers, booleans, or JSON.
- Scalar property inputs auto-switch to template mode when Jinja syntax is detected; revert when the user clears template delimiters.

### 4. Canvas interaction lock

Separate **move** lock from **resize** lock:

| Lock | When | Effect |
|------|------|--------|
| **Position** (`elementPositionLocked`) | `x`/`y` or bounds coords templated | Disables drag, nudge, and align |
| **Resize** (per-handle) | Size/bounds scalars templated (`radius`, `size`, `progress`, etc.) | Disables only the handles that would overwrite that field |

Examples:

- Templated `progress` on a progress bar → fill preview updates live; drag/resize bounds still work.
- Templated `end_angle` on an arc → drag still works; radius resize still works.
- Templated `x` on a circle → drag blocked; SE radius resize uses preview bounds center.
- Any templated bound on a rectangle → box resize disabled (resize would rewrite all corners).

Central helpers: `isPropertyTemplated`, `elementPositionLocked` (alias `elementGeometryLocked`), `getInteractiveResizeHandles`.

### 5. Preview clock

Template preview `now()` refreshes only when needed:

- **`off`** — no `now()` in payload (state-only templates).
- **`minute`** — `now().strftime('%H:%M')` and similar.
- **`second`** — `%S` or other sub-minute precision.

Implemented in `resolvePreviewClockInterval` + `useTemplatePreviewClock`. Never mutates YAML or undo history.

### 6. Preview limits

No expansion of Nunjucks evaluator scope (ADR-004). Templated geometry uses last-known or placeholder bounds where the renderer already supports template placeholders.

**`icon_sequence.icons` templated-list recovery (issue #56 follow-up):** Home Assistant's `Template.async_render()` preserves the NATIVE type for a template that is a single pure `{{ expr }}` expression, so `open_epaper_link.drawcustom` receives a real list directly — production never stringifies it. The designer's Nunjucks evaluator has no equivalent channel (`renderString` always stringifies), so a templated `icons` field reaches `renderIconSequence` as plain text once evaluated (e.g. `{{ ['home', 'arrow-right'] }}` → `"home,arrow-right"`, Nunjucks' default Array→String join — not Python's quoted `repr()`, and not JSON). `resolveIconSequenceIconNames` (`src/core/renderer/icon-sequence.ts`) recovers the intended list on a best-effort basis: valid JSON array first, then comma-split (safe — MDI names are plain kebab-case, never containing commas). If the string still contains unevaluated `{{ }}`/`{% %}` syntax, or recovery yields nothing, the element throws into the standard render-error placeholder (ADR-011 behavior tests) instead of silently substituting the unrelated `help-circle` preview icon — a plausible-looking wrong render is worse than an honest failure indicator (issue #10).
**`polygon.points` / `plot.data` templated-list recovery (issue #56 follow-up):** Home Assistant's `Template.async_render()` preserves the NATIVE type for a template that is a single pure `{{ expr }}` expression, so `open_epaper_link.drawcustom` receives a real list directly — production never stringifies it. The designer's Nunjucks evaluator has no equivalent channel (`renderString` always stringifies), so a templated `points`/`data` field reaches the renderer as plain text once evaluated. Recovery is per-type, by how much of the original survives stringification:

- **`polygon.points`** (`resolvePolygonPoints`, `src/core/renderer/polygon.ts`): valid JSON array of `[x, y]` pairs first; then Nunjucks' flat comma-join of a nested array (`{{ [[0,0],[60,0]] }}` → `"0,0,60,0"`) — an even-length list of finite numbers re-chunks into the exact original pairs, since numbers never contain commas.
- **`plot.data`** (`plotDataLines`, `src/core/renderer/plot.ts`): valid JSON array of series objects only. Nunjucks stringifies a list of OBJECTS to `"[object Object],…"` — the original data is gone, so nothing else is recoverable.

If recovery fails (including still-unevaluated `{{ }}`/`{% %}` text), the element throws into the standard render-error placeholder (ADR-011 behavior tests) instead of silently substituting the unrelated fixed preview triangle / preview series — a plausible-looking wrong render is worse than an honest failure indicator (issue #10). Same contract as `icon_sequence.icons` above.

## Consequences

- Paste YAML with templated `x`, `progress`, `points` → validates, property panel shows template mode
- Templated **position** locks move/align; templated **size/content** fields lock only the relevant resize handles
- YAML inline preview shows `[error] …` with a short evaluator message; hover shows the full text
- Property panel tests assert mode switching without coercion
- Toolbar chrome layout is documented separately as **ADR-016** ([toolbar-chrome-layout](ADR-016-toolbar-chrome-layout.md)).

## Alternatives considered

- **Per-type template UI in ElementPropertyForm** — rejected; duplicates metadata already implied by Zod shapes
- **Expand evaluator to resolve all templated geometry live** — rejected; preview stays best-effort
- **Per-point templates inside JSON arrays** — deferred post-v1

## References

- ADR-004 (template evaluator scope)
- ADR-011 (behavior-test policy)
- `src/core/schema/propertyEditorMeta.ts`
