# ADR-004: Template evaluator scope

## Status

Accepted

## Context

Drawcustom payloads use Jinja2 templates (`{{ states('sensor.temp') }}`, `{% if %}…{% endif %}`, `|float`). The designer must preview templates **without** a live Home Assistant connection.

Examples from `docs/spec/supported_types.md` (HA drawcustom; aligned with [ODL](https://opendisplay.org/protocol/open-display-language.html) draw payloads) use a small, repeatable subset:

- `states('entity_id')`
- `is_state('entity_id', 'on')`
- `if/else` conditionals
- `|float` filter
- `parse_colors` markup with embedded templates

## Research: what Home Assistant actually uses

### Core HA frontend — no client-side Jinja engine

The [home-assistant/frontend](https://github.com/home-assistant/frontend) repo does **not** bundle Nunjucks, Swig, or any JS Jinja implementation. Its only Jinja-related dependency is `@codemirror/lang-jinja` — **syntax highlighting** in Developer Tools → Template.

Real template evaluation runs in **Python Jinja2 on the HA backend**:

| Mechanism | Where |
|-----------|--------|
| WebSocket `render_template` | `src/data/ws-templates.ts` → HA core `handle_render_template` |
| REST `POST /api/template` | Used by CLI tools and integrations |
| Developer Tools → Template | Same backend engine users test against |

The frontend subscribes to backend renders; it does not parse Jinja locally.

### What the HA *ecosystem* uses for client-side Jinja-like templates

When custom cards need **synchronous, in-browser** templating (no websocket round-trip per frame), the de-facto community standard is:

| Approach | Used by | Syntax | HA fidelity |
|----------|---------|--------|-------------|
| **[Nunjucks](https://mozilla.github.io/nunjucks/)** via **[ha-nunjucks](https://github.com/Nerwyn/ha-nunjucks)** | Custom Lovelace cards, HA community plugins | Jinja-like | High — implements HA template functions on a mockable `hass` object |
| **Raw JavaScript** (`[[[ return … ]]]`) | custom:button-card, kiosk-mode JS mode | JavaScript | N/A — different syntax, not Jinja |
| **Backend Jinja via websocket** | Native cards, kiosk-mode Jinja mode, ha-template | Jinja2 | Exact — requires live HA |

**Swig** is not used in HA core or major custom cards. It is largely unmaintained and has weaker Jinja2 alignment than Nunjucks. **Do not use Swig.**

### Implication for this designer

We cannot call HA's websocket (`render_template`) — the designer is intentionally offline. We need a **client-side Jinja-compatible engine**, not "whatever HA frontend imports" (there isn't one).

The closest match to HA behavior in a standalone app:

1. **Nunjucks** — same engine `ha-nunjucks` wraps; Mozilla-maintained; Jinja-inspired syntax
2. **`installJinjaCompat()`** — Nunjucks helper for `True`/`False`/`None` and other Jinja/Python literal differences ([Nunjucks FAQ](https://mozilla.github.io/nunjucks/faq.html))
3. **HA template globals** — implement `states`, `is_state`, and filters used in drawcustom, backed by the State Simulator mock map (same role `ha-nunjucks` plays with a real `hass` object)

We do **not** need the full `ha-nunjucks` package (heavy deps: `create-hash`, `python-struct`, `ts-py-datetime`, …) unless drawcustom users routinely hit advanced HA functions (`area_entities`, `device_attr`, …). Start with the **drawcustom subset**; extend globals using [ha-nunjucks](https://github.com/Nerwyn/ha-nunjucks) as a **reference implementation**, not a hard dependency.

**Optional future (out of scope now):** "Live HA mode" could call `POST /api/template` when the user supplies URL + token for 100% backend fidelity on demand.

## Decision

Use **Nunjucks** with Jinja compat mode and an injected **HA mock context**:

| HA global / pattern | Mock implementation |
|---------------------|---------------------|
| `states('entity_id')` | State Simulator mock map (returns the state **string**) |
| `states.<domain>.<object_id>` → `.state`, `.attributes.<attr>` | Subscriptable `states` global, materialized per evaluation from the mock map (dotted access alongside the callable form) |
| `is_state('entity_id', 'state')` | Compare mock value (case-insensitive) |
| `state_attr('entity_id', 'attr')` | Typed attribute value from the mock map; `None` (null) when missing |
| `is_state_attr('entity_id', 'attr', value)` | Type-sensitive equality vs the typed attribute (boolean `false` ≠ string `"false"`); missing attribute compared as `None` |
| `float` / `int` filters | Nunjucks built-ins + Jinja compat |
| `if/else`, comparisons | Nunjucks |
| Entity IDs **and attribute keys** in templates | Scanned from payload → Simulator panel (`state_attr(...)` + dotted `…attributes.<attr>` pre-fill attribute rows) |

**`parse_colors`** is handled as string pre/post-processing around template evaluation, then passed to the color pipeline.

### Entity attributes and typing

HA entity **states** are always strings (`on`/`off`/`21.5`), but entity **attributes** carry real types — booleans, numbers, `None`, lists and dicts. Treating an attribute as a string breaks HA semantics: a boolean attribute `false` stored as the string `"false"` is *truthy*, so `iif(state_attr(...))` and `is_state_attr(...)` would take the wrong branch.

The State Simulator collects attribute values from a plain text field, so we infer the intended type the same way HA/YAML scalars are parsed. The single source of truth is the pure-core helper `coerceAttributeValue` (`src/core/templates/attribute-values.ts`), applied on the trimmed input (first match wins):

| Input | Coerced value |
|-------|----------------|
| empty / `null` / `none` (case-insensitive) | `null` (HA `None`) |
| `true` / `false` (case-insensitive) | boolean |
| integer / float / scientific literal | number |
| JSON array (`[…]`) or object (`{…}`) | parsed value |
| anything else | the original string |

- **Attributes are coerced; entity states are NOT** — states stay strings to match HA. State typing is intentionally unchanged.
- `state_attr(...)` and dotted `states.<domain>.<object_id>.attributes.<attr>` both return the **typed** value.
- `is_state_attr(...)` equality is type-sensitive for scalars (identity) and structural for arrays/objects (`attributeValueEquals`).
- The State Simulator mocks **per-entity attributes** (not just state), persists them as typed JSON (ADR-003), and **pre-fills attribute keys** scanned from the payload (`state_attr('e','a')` and dotted access) so the user only enters values.

**Testing:** fixture YAML + mock context JSON → expected strings in Vitest (Node, no browser).

**Not chosen:**

- **Swig** — unmaintained; no HA ecosystem adoption
- **Custom hand-rolled parser** — poor fidelity vs Nunjucks for conditionals/filters
- **ha-nunjucks npm package wholesale** — requires real `hass` shape + many deps; overkill for initial drawcustom scope (revisit if parity gaps appear)
- **Pyodide Python Jinja2** — exact engine but large/slow for a designer SPA

## Consequences

- Syntax aligns with what HA users write and what `ha-nunjucks` targets — not identical to Python Jinja2 in every edge case (regex, some filters, Python-only methods)
- Document known divergences; add fixture tests per spec template example
- State Simulator remains required — Nunjucks does not replace mock data entry; it mocks both entity **states** and per-entity **attributes**
- Mock states (strings) and typed attribute values persist globally in IndexedDB (ADR-003); excluded from share hash by default (ADR-005)

## Per-field evaluation scope

Each templated field string is evaluated **independently**. `{% set %}` /
`namespace()` side effects **do NOT carry across element fields.** The canvas
render path (`applyTemplateContextToPayload` in
`src/core/templates/preview.ts`) deep-walks the payload and calls
`evaluateTemplate` per string; the editor inline preview
(`src/ui/editor/templatePreviewAnchors.ts`) evaluates each region
independently. Preview and render therefore agree, and both match real HA.

**Why per-field (HA behavior).** HA core wraps **each** templated string leaf as
its **own** `Template` (`config_validation.template_complex()`) and renders each
independently (`service.async_prepare_call_from_config` →
`template.render_complex()`). A `namespace()` defined in one field's `fill` is
therefore *not* visible in another field — a structured `payload:` list cannot
share `{% set %}` state across fields. Cross-field sharing in real HA happens
only when the **entire** payload is a single template string, or via
**script-level `variables:`** (see below).

**`namespace()` within a single field is supported.** Jinja `namespace()` is
usable inside one template via the `haNamespace` global plus the
`{% set obj.member = expr %}` → `__ha_setattr(...)` rewrite (whitespace-trim-marker
aware) in `src/core/templates/evaluate.ts`. Within one field,
`{% set n = namespace(...) %}{% set n.x = ... %}{{ n.x }}` and for-loop
accumulation work as in Jinja. See `tests/core/templates/evaluate.test.ts`.

## Cross-field value sharing — Simulator variables

Because state does not cross fields, the supported way to reuse a value in
multiple fields is **user-defined variables** in the State Simulator — the
designer's analog of HA **script-level `variables:`**.

- **Literal mock values (not templates).** A Simulator variable is a **literal
  mock value** — the resolved runtime value the user wants during preview,
  exactly like mock entity **states** (`on`) and typed **attributes**
  (`false`, `21.5`). It is **not** rendered as a template: a value that happens
  to contain template text (e.g. `{{ foo }}`) is emitted **as-is**, never
  resolved. This matches HA's single-pass semantics — HA renders script
  `variables:` once at the automation level and never re-parses the rendered
  output, so the simulator captures that resolved literal.
- **Typed values.** HA `variables:` are **not always strings**:
  `template.render_complex` renders each leaf with `parse_result=True`, parsing
  results into native types (`bool`, `int`, `float`, `list`, `dict`, `None`),
  and literal YAML values keep their scalar type. Those typed values flow into
  the downstream templates that reference the variable, so `{{ count + 1 }}` or
  `{{ iif(flag, …) }}` see a real number / boolean. The Simulator therefore
  infers a variable's type from the entered text using the SAME rule as mock
  attributes (`coerceAttributeValue`): `"false"`→boolean `false` (falsy),
  `"5"`→number, JSON `[…]`/`{…}`→list/dict, else string. Inference happens
  **only at injection** and never re-renders the value, so `{{ … }}`-looking
  strings (not valid number/bool/JSON) stay verbatim. Storage is a plain text
  map (no schema change).
- **Data shape:** a global `name → value` map (`HaMockContext.variables`,
  `Record<string, string>` of the raw literal text), separate from entity
  states/attributes; the type is inferred at injection. Names must be bare
  identifiers (`/^[A-Za-z_$][\w$]*$/`) and may not shadow built-in globals
  (`states`, `is_state`, `state_attr`, `is_state_attr`, `now`, `float`, `iif`,
  `namespace`).
- **Injection:** `createEnvironment` registers each valid variable as a Nunjucks
  global with its **coerced** value (`env.addGlobal(name, coerceAttributeValue(value))`),
  so a bare `{{ name }}` resolves in **every** field's evaluation. Variable
  globals and the `states(...)` function occupy different namespaces, so they
  never collide.
- **Render/preview parity:** the canvas render and the editor inline preview
  must build the evaluation context from the **same** full mock context — states,
  attributes, **and** variables. Dropping `variables` (or `attributes`) from
  either path makes the inline preview disagree with the canvas; the preview
  extension in `src/ui/editor/YamlEditor.tsx` passes the full context for this
  reason.
- **Auto-population (scan):** templates are scanned for **bare variable
  references** — identifiers used as `{{ name }}` / in expressions that are NOT
  HA globals, entity-id string args, function calls, filters, member-access
  roots (e.g. `n.c`), or local `{% set %}` / `{% for %}` names within the field
  (`extractVariableReferences` → `TemplateScanResult.variablesReferenced`).
  Discovered names surface as **empty-valued, pre-filled rows** the user just
  fills in — mirroring how referenced **attributes** are pre-filled (issue #4).
  Re-scanning follows YAML edits, so **renaming** a referenced variable
  (`something` → `something2`) drops the old name and pre-fills the new one.
- **Current/All scope (mirrors entities):** the Variables section honors the
  State Simulator's `PanelScopeToggle` exactly like the entity list —
  **current** shows only variables referenced in the current payload (a stale
  stored name left over from a rename disappears), **all** also shows every
  stored variable. Stored values still display for referenced names.
- **Immediate apply:** editing a variable's value writes through on `change`
  (`onSetVariable`), so the preview updates immediately — the same write-through
  UX as attribute edits, with no separate "commit" step.
- **Persistence:** stored globally in IndexedDB (`variables` store, **Dexie v5**,
  added **additively** on top of the v4 attributes upgrade so existing
  assets/mocks/session survive — ADR-003). Excluded from the share hash like
  mocks (ADR-005).
- **UI:** a compact "Variables" section in the State Simulator
  (`src/ui/components/StateSimulator.tsx`), wired through
  `useProjectState`/`src/ui/preferences/variables.ts`.

Real-HA equivalents to reach for when you need cross-field sharing: script-level
`variables:` (templated once at the automation level — the simulator captures
the resolved result), or collapsing the data into a single whole-payload
template string.

## Alternatives considered

See research table above. **Nunjucks + drawcustom HA globals** is the best offline compromise between bundle size and HA template compatibility.
