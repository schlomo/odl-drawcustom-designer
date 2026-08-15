# ADR-018: Host UI seam — targets, state catalog, actions, preview provider

## Status

Accepted — maintainer ruling 2026-08-15, from upstream
[PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)
collaboration with @jonasniesner. Extends [ADR-017](ADR-017-host-adapter-seam.md)
(host-adapter seam) and [ADR-010](ADR-010-ha-embed-mode.md) (embed mode).

## Context

[PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)
is the first external consumer to embed the designer (v1.0.2) into a real
host. Its author hand-built a host-side toolbar (vanilla JS, untested) on top
of today's mount API — a display picker, a "Copy YAML" button, a "Send"
button hardcoding service options the embed contract has no seam for. Drift
showed up immediately: the host toolbar's Copy YAML and the designer's own
Copy YAML button quote YAML differently, so the two visibly disagree on the
same payload.

The upstream author's request: move these top-bar functions **into** the
designer — entity autocomplete, missing-entity highlighting, a dry-run
preview overlay — and delete the host toolbar entirely, rather than
converging on a shared vanilla-JS chrome. Both maintainers agree: the
designer owns UI, the host provides data and callbacks. A **chromeless**
mode (designer supplies no chrome, host builds all of it) was considered and
rejected — it is the status quo that produced the drift, just formalized.

Four gaps surfaced concretely from PR #100:

1. **Save button silently hangs.** [`MountHandle`](../../src/embed/types.ts)
   has no way to read the current payload, so PR #100 DOM-scrapes the
   designer's shadow root for the Save button and simulates a click
   (`_clickSave()`). When a YAML error disables Save
   ([`src/ui/App.tsx`](../../src/ui/App.tsx), `disabled={yamlBlocked}`), the
   scrape still *finds* the button, but `click()` on a disabled button emits
   no callback — the host reports "Saving…" and hangs. The fix is read access
   to the payload (`getPayload()`), not better button discoverability.
2. **Send hardcodes service options.** `onSaveRequest` yields element YAML
   only; PR #100's Send hardcodes `background: 'white'` and
   `dither: 'ordered'` because it has no seam to carry the options the
   payload actually needs (their service default is `burkes`, not
   `ordered`) — designs transmit differently than they preview.
3. **No display picker seam.** Target selection is host-only chrome bolted
   outside the designer, so it cannot participate in the existing
   [display-config lock UX](../embedding.md#display-config-lock-issue-70)
   ([ADR-017](ADR-017-host-adapter-seam.md)).
4. **No preview provider seam.** The dry-run render PR #100 wants sits
   next to the designer's client-side preview with no shared seam, and no
   path to reuse it as an [ADR-007](ADR-007-hybrid-rendering.md) parity
   reference.

## Decision

Four additive seams on the existing [`DesignerHost`](../../src/embed/host.ts)
data contract — no new lifecycle, no new adapter shape:

- **Targets** — the host pushes `targets: [{ id, label, capabilities }]`
  (`id` opaque); the designer renders a display picker inside its own
  display-config area. Selecting a target locks to its capabilities, using
  the existing lock UX unchanged — unlocking still means "virtual display,"
  it does not forget the selection. The target id round-trips opaquely
  through callbacks; the designer never learns what it names. `onAction`
  (below) carries it; the save channel grows an **additive** context
  argument — `onSaveRequest(payload, context?: { targetId? })` — so a host
  can associate a save with the selected target while existing
  payload-only hosts keep working unchanged.
- **State catalog** — states gain an optional friendly-name field; a new
  referenced-states panel shows only the states the current payload actually
  references, with host display names, as a compact visual aid. The full
  catalog remains reachable via YAML/template autocomplete, unchanged.
- **Actions** — `actions: [{ id, label, icon?, disabledReason? }]` +
  `onAction(id, payload, targetId)`. The designer renders the button list in
  its own chrome; meaning, auth, and the actual service call are entirely
  host-side. This is deliberately **not** a plugin API: a typed, closed list
  of buttons, never host-rendered UI inside the shadow root.
- **Preview provider** — `renderPreview(payload, targetId) => Promise<image>`,
  optional; when present the designer offers a server-rendered dry-run as an
  overlay/compare view next to its own client preview. The HA adapter
  implements this via drawcustom's dry-run path, and it doubles as the
  [ADR-007](ADR-007-hybrid-rendering.md) pixel-parity reference — a real
  Pillow render to diff against, not another client approximation.

### Seam grammar

Every seam above follows one shape, and any future addition must fit it:

- **Data flows in as typed pushed values** (`targets`, `states`, host-side
  `renderPreview`) — same direction as `states`/`capabilities` today.
- **Intent flows out as callbacks carrying payload plus opaque ids**
  (`onAction(id, payload, targetId)`) — same direction as `onSaveRequest`
  today.
- **No bidirectional shared state.** The host never reads designer internals
  back out except through these typed values; the designer never reaches
  into host state.
- **No host code inside the shadow root, ever.** Actions are a typed button
  list, not a slot.
- **Vocabulary stays domain-neutral.** "Target", "display", "state" —
  never "entity", "hass", "service" — in **new seam declarations**. The
  designer must stay meaningful to a non-HA host. Already-published names
  ([`HostEntityState`](../../src/embed/types.ts) and the "entity state"
  wording around `HostStates`) are explicitly grandfathered: renaming them
  is a breaking change under [`docs/releasing.md`](../releasing.md)'s semver
  policy for zero behavioral gain.

**Litmus test for any addition to this seam:** a non-HA host must be able to
implement it meaningfully, *and* the UI it drives must be testable in Vitest
against a fake adapter. Enforcement lives in the demo host page
([`demo/`](../../demo/), [`docs/embedding.md`](../embedding.md)): it implements
all four seams with mocks and is the e2e harness (`tests/e2e/embed-*.spec.ts`).
If a feature can't be expressed on the demo page, the abstraction is wrong —
fix the abstraction before adding a host-specific escape hatch.

### Simulator policy

When a host feeds live states, the State Simulator is disabled entirely — it
is a standalone/demo-adapter feature ([ADR-017](ADR-017-host-adapter-seam.md)),
not a preview layer to reconcile against live data. The referenced-states
panel above replaces it for embedded hosts; the full state catalog stays
available through YAML/template autocomplete either way. This resolves the
precedence question [issue #24](https://github.com/schlomo/odl-drawcustom-designer/issues/24)
parked between "Simulator overrides live states" and "Simulator hidden when
embedded" — the answer is the latter, plus a purpose-built replacement rather
than a hidden Simulator with no substitute.

## Consequences

- All four seams are purely additive growth on `MountOptions`/`MountHandle` —
  minor releases under the semver policy in
  [`docs/releasing.md`](../releasing.md), same as any other optional field.
- [Issue #24](https://github.com/schlomo/odl-drawcustom-designer/issues/24)'s
  open precedence question is resolved by the Simulator policy above.
- The preview provider seam becomes the [ADR-007](ADR-007-hybrid-rendering.md)
  parity reference: a real server-side render available inside the designer's
  own preview, not a separate tool.
- Host panels stay thin: a host wires typed data in and typed callbacks out,
  with no UI to build or keep in sync — cheap for the two additional hardware
  vendors already in the pipeline behind PR #100.
- [Issue #25](https://github.com/schlomo/odl-drawcustom-designer/issues/25)'s
  scope shifts from building the panel wrapper from scratch to supporting
  PR #100 through these seams (see the issue comment linking this ADR).
- The demo host page ([`demo/`](../../demo/)) grows mocks for all four seams
  and stays the e2e harness proving them.

## Alternatives rejected

- **Chromeless/headless mode** (host builds all chrome, designer stays a bare
  canvas) — rejected: this is the status quo that produced the Copy-YAML
  drift; the upstream author explicitly asked to move chrome *into* the
  designer instead. Shipping both a chromed and a chromeless variant is a
  permanent two-chrome drift class, not a fix for the one that already
  happened.
- **Generic plugin/extension API** (host registers arbitrary components or
  render slots) — rejected: unbounded surface, defeats the litmus test (no
  way to say a non-HA host "implements it meaningfully" against an open
  slot), and reopens the shadow-root isolation guarantees
  ([ADR-017](ADR-017-host-adapter-seam.md), [`docs/embedding.md`](../embedding.md#shadow-dom-at-the-mount-boundary-issue-21))
  the mount boundary exists to hold.
- **Host-rendered UI slots inside the shadow root** — rejected: breaks style
  isolation the shadow boundary guarantees, and reintroduces domain bleed
  (HA-specific markup/CSS living inside designer chrome) that the seam
  grammar's domain-neutral vocabulary rule exists to prevent.
