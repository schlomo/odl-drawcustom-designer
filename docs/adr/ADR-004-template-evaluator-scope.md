# ADR-004: Template evaluator scope

## Status

Accepted (revised — research-backed)

## Context

Drawcustom payloads use Jinja2 templates (`{{ states('sensor.temp') }}`, `{% if %}…{% endif %}`, `|float`). The designer must preview templates **without** a live Home Assistant connection.

Examples from `docs/spec/supported_types.md` use a small, repeatable subset:

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

### Implication for oepl-designer

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
| `states('entity_id')` | State Simulator mock map |
| `is_state('entity_id', 'state')` | Compare mock value |
| `float` / `int` filters | Nunjucks built-ins + Jinja compat |
| `if/else`, comparisons | Nunjucks |
| Entity IDs in templates | Scanned from payload → Simulator panel |

**`parse_colors`** is handled as string pre/post-processing around template evaluation, then passed to the color pipeline.

**Testing:** fixture YAML + mock context JSON → expected strings in Vitest (Node, no browser).

**Not chosen:**

- **Swig** — unmaintained; no HA ecosystem adoption
- **Custom hand-rolled parser** — poor fidelity vs Nunjucks for conditionals/filters
- **ha-nunjucks npm package wholesale** — requires real `hass` shape + many deps; overkill for initial drawcustom scope (revisit if parity gaps appear)
- **Pyodide Python Jinja2** — exact engine but large/slow for a designer SPA

## Consequences

- Syntax aligns with what HA users write and what `ha-nunjucks` targets — not identical to Python Jinja2 in every edge case (regex, some filters, Python-only methods)
- Document known divergences; add fixture tests per spec template example
- State Simulator remains required — Nunjucks does not replace mock data entry
- Mock values persist globally in IndexedDB after Phase 4a (ADR-003); until then, per-project mocks in Dexie v1; excluded from share hash by default (ADR-005)

## Alternatives considered

See research table above. **Nunjucks + drawcustom HA globals** is the best offline compromise between bundle size and HA template compatibility.
