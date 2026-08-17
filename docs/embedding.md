# Embedding the designer

The designer ships as an embeddable component ([issue #20](https://github.com/schlomo/odl-drawcustom-designer/issues/20), [ADR-010](adr/ADR-010-ha-embed-mode.md)): a host application mounts it into a container, pushes data in (states, displays, action buttons), and gets intent back out (which action the user clicked, which display they picked). The designer owns all of the UI; the host owns meaning, auth and persistence ([ADR-018](adr/ADR-018-host-ui-seam.md)).

Two rules describe the whole contract:

- **Data is pushed, functions are not.** Every mount option is an atomic initial push — `mount(el, { states })` is exactly `mount(el)` + `setStates(states)` applied before the first painted frame — and everything pushed at mount is re-pushable on the handle. Callbacks are stable closures fixed at mount; there is no update channel for them.
- **No host code inside the designer.** Actions are a typed, closed button list, never a render slot; styles and DOM are isolated in a shadow root at the mount boundary.

## Getting the library

**npm (primary):**

```bash
npm install @schlomo/odl-drawcustom-designer
```

```js
import { mount, version } from '@schlomo/odl-drawcustom-designer'
```

One self-contained ESM file, plus `LICENSE`/`NOTICE`/`THIRD_PARTY.md` in the package. **Known gap:** no `.d.ts` types ship yet — plain JS, with the shapes documented here and in [`src/embed/types.ts`](../src/embed/types.ts). Release procedure and semver policy: [`docs/releasing.md`](releasing.md).

**GitHub release asset (fallback):** download the tagged release's `odl-drawcustom-designer.js`, `LICENSE`, `NOTICE`, `THIRD_PARTY.md` and `odl-drawcustom-designer.js.sha256` (verify with `shasum -a 256 -c odl-drawcustom-designer.js.sha256` — `-a 256` matters, bare `shasum -c` defaults to SHA-1), and vendor the ESM as a static file.

## Library build

```bash
npm run build:lib
```

Emits **one self-contained ESM file** — React, styles, and bundled fonts included; the host provides nothing (composition and the deliberate no-code-splitting decision: [`docs/bundle-audit.md`](bundle-audit.md)):

```
dist-lib/odl-drawcustom-designer.js
```

`dist-lib/` also contains the demo host page (copied from `demo/`). Try it:

```bash
npm run build:site && npm run preview
# open the printed URL; the demo is at /embed/ (same path as production)
```

No dedicated server needed beyond that: the demo is plain static files, so any static file server works (e.g. `python3 -m http.server -d dist-lib`).

The demo page implements every seam with mocks: it mounts as a **single-display host** (one pushed display, adopted and locked without a pick), pushes its full display inventory on demand, adds and removes displays, pushes warm/cold states with friendly names plus a per-second ticking state, registers Save / Send / Validate / Display-settings actions and re-pushes them to simulate a display going offline, switches themes, and logs every fired action and display selection into a `<pre>`. It is also the Playwright e2e harness ([`tests/e2e/embed-mount.spec.ts`](../tests/e2e/embed-mount.spec.ts), [`embed-actions.spec.ts`](../tests/e2e/embed-actions.spec.ts), [`embed-targets.spec.ts`](../tests/e2e/embed-targets.spec.ts)) — if a feature cannot be expressed on that page, the abstraction is wrong (ADR-018's litmus test).

The same demo is published from `main` at **<https://schlomo.github.io/odl-drawcustom-designer/embed/>** — `npm run build:site` assembles the deployed site (app at `/`, `dist-lib/` copied to `/embed/` by [`tools/assembleSite.ts`](../tools/assembleSite.ts)); PR previews get their own `/embed/` the same way.

## Mount API

```js
import { mount } from './odl-drawcustom-designer.js'

const handle = mount(document.getElementById('designer'), {
  payload: yamlString,          // initial drawcustom YAML (list of elements)
  states: { /* see below */ },  // initial states for template preview
  theme: 'dark',                // 'light' | 'dark', scoped to the container
  targets: [ /* see below */ ], // the displays you know about
  actions: [ /* see below */ ], // your buttons in the designer toolbar
  onAction(id, payload, context) {
    // user clicked one of your buttons — do the host-side thing
  },
  onTargetSelected(targetId) {
    // user picked a display (or the virtual display: targetId === null)
  },
})

handle.setStates(states)     // replace the state map
handle.setTargets(targets)   // replace the displays the picker offers
handle.setActions(actions)   // replace your action buttons
handle.setPayload(yamlString)// replace the payload (throws on bad YAML)
handle.getPayload()          // read the current payload YAML — see below
handle.setTheme('light')     // switch the container-scoped theme
handle.destroy()             // unmount and empty the container
```

- The container needs an explicit height; the designer fills it (`height: 100%`).
- `mount()` and `setPayload()` throw synchronously on invalid YAML, and `mount()` throws on a malformed `actions`/`targets` list. A throwing `mount()` leaves the container exactly as it was — nothing rendered, nothing to clean up — so retrying into the same container is safe.
- Multiple mounts on one page are possible; each handle is independent — including per-instance light/dark themes.
- Pushes are safe from the moment `mount()` returns: a push made before the designer has rendered anything is queued and applied while it renders, so the first frame you can observe already reflects it. A host that pushes a display immediately after `mount()` never shows a frame of default, unlocked display config first ([issue #115](https://github.com/schlomo/odl-drawcustom-designer/issues/115)).
- Every handle method throws `MountHandle used after destroy()` on a destroyed mount.

### `getPayload()` ([issue #104](https://github.com/schlomo/odl-drawcustom-designer/issues/104))

`handle.getPayload()` returns the designer's current drawcustom YAML — exactly the string an [action](#actions--onaction-issue-108) callback receives at that instant. It exists so a host can *read* the payload directly rather than driving the designer's UI to get at it: a host that scraped the shadow root for a button and called `.click()` on it hung silently whenever a YAML error had disabled that button.

`getPayload()` reuses the same serialization path the action channel uses — there is no second serializer to drift out of sync with it — and resolves four edge cases so the two can never disagree:

- **Before React has committed anything** (a synchronous call right after `mount()`/`mountStandaloneApp()` returns, before the mount's internal push/read registration effect has run): reports the **bootstrap payload** — the same `elements` the shell is about to seed its state from for a synchronous host (`mount({ payload })`), or a safe empty-list default while an async bootstrap (the standalone SPA's IndexedDB/share-hash load) is still in flight. Always a string, never `undefined`.
- **Mid-keystroke, while a debounced YAML edit is still pending:** the YAML editor commits typed text to the canvas model on an 80ms debounce (or immediately on blur). `getPayload()` forces that flush before reading, so a call made moments after typing reflects the already-typed text — matching a real action click, which always blurs the editor (flushing the debounce) before the payload is read. `getPayload()` never lags behind what a click would send.
- **While the YAML editor is blocked** by a parse/schema error (payload-carrying actions are disabled): returns the **last valid payload**. The canvas model (`elements`) freezes at its last-valid state while the live document is broken — the same state the last action would have sent, and, with those actions disabled, the only way for a host to read anything at all.
- **Right after a `setPayload()` push, with an edit still pending:** the push wins. A host push is authoritative — it replaces the payload wholesale, so it also **discards** any debounced edit typed before it, and the editor is re-serialized from the pushed payload. Without that, the flush above (which `getPayload()` itself triggers) would have committed the pre-push draft over the payload the host had just pushed.

The payload read channel (`registerPayloadSource`) registers in the same commit as the push channel (`registerPushTarget`) — both are `useLayoutEffect` — so there is no window where a host push has already applied but a read still reports stale, pre-push data.

### Version

```js
import { mount, version } from './odl-drawcustom-designer.js'

console.log(version)               // e.g. '2.1.0' in a released build, '0.0.0-dev' otherwise
console.log(mount(el, {}).version) // same value, also on the handle
```

`version` is baked in at build time ([`tools/version.ts`](../tools/version.ts)) from the release script's `APP_VERSION` environment variable — git tags, not `package.json` (which stays pinned at `0.0.0`), are this project's version source. A build that isn't produced by the release workflow (local dev, this repo's own GH Pages app build) has no `APP_VERSION` set and reports `'0.0.0-dev'`. Same string as `MountHandle.version`, whichever is more convenient for a host to log or show. See [`docs/releasing.md`](releasing.md) for the release procedure and the semver policy governing this API.

### Shadow DOM at the mount boundary ([issue #21](https://github.com/schlomo/odl-drawcustom-designer/issues/21))

`mount()` renders into an **open shadow root on the container**: it reuses `container.shadowRoot` when the host already attached one, otherwise it calls `container.attachShadow({ mode: 'open' })` itself. This isolates styles in both directions:

- The compiled stylesheet (Tailwind utilities, theme variables, editor styles) is injected as a `<style>` into the shadow root — never into the host document's `<head>`. Host CSS — including `!important` rules and colliding utility class names like `.flex` — cannot restyle the designer, and designer CSS cannot restyle the host page.
- Theme variables live on `:host` (light) and the per-instance `.dark` wrapper inside the shadow root, so `setTheme()` is scoped per mount and never touches `document.documentElement`.
- The stylesheet is injected once per shadow root and intentionally left in place on `destroy()` (a later mount into the same container reuses it).
- Designer-internal overlays (e.g. CodeMirror autocomplete/lint tooltips) render inside the shadow root, and keyboard shortcuts only react to keystrokes originating inside the instance's own shadow tree.
- Fonts still register on `document.fonts` (the FontFace API is document-wide by design); font *names* are designer-scoped enough not to collide in practice.

A host custom element can attach the shadow root itself and hand over its own element:

```js
class DesignerPanel extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }) // optional — mount() would create it
    this.style.display = 'block'
    this.style.height = '100%'
    this.handle = mount(this, { /* options */ })
  }
  disconnectedCallback() {
    this.handle?.destroy()
  }
}
```

The container element must support `attachShadow` (a `<div>` or an autonomous custom element does; e.g. `<span>`-like replaced elements do not).

`demo/isolation.html` is the hostile-host fixture proving the boundary: aggressive `!important` host CSS, Tailwind-colliding class names, and two instances with different themes on one page ([`tests/e2e/embed-isolation.spec.ts`](../tests/e2e/embed-isolation.spec.ts)).

### Scroll containment ([issue #79](https://github.com/schlomo/odl-drawcustom-designer/issues/79))

Designer-internal scrolling never scrolls the host page. The YAML editor scrolls itself programmatically — the Linked-editor sync centers the selected element's block on every canvas selection, and typing scrolls the cursor into view — and CodeMirror's default handling would walk ancestor scrollers past the mount boundary and call `window.scrollBy` on the host document whenever the editor's own scroller cannot absorb the full scroll. A designer embedded above other host content would visibly jump the page on every element selection or drag.

A [`scrollHandler`](../src/ui/editor/yamlScrollContainment.ts) contains all editor scroll-into-view requests to the editor's own scroller: hosts can place the designer anywhere on a scrolling page without defensive wrappers. Guarded by [`tests/e2e/embed-host-scroll.spec.ts`](../tests/e2e/embed-host-scroll.spec.ts) against the demo host page.

## Host data contract

Domain-neutral types ([`src/embed/types.ts`](../src/embed/types.ts)): "state", "display", "target", "action". The designer never learns what a host's ids mean, so an HA adapter is a thin pass-through and a non-HA host is a first-class consumer (ADR-018).

### `states`

State key → state value, or `{ state, attributes, name }`:

```js
{
  'sensor.temperature': '21.5',
  'light.desk': { state: 'on', attributes: { brightness: 128 } },
  'sensor.living_room_temperature': {
    state: '21.5',
    name: 'Living-room temperature',        // friendly name, shown in the States panel
    attributes: { unit_of_measurement: '°C' },
  },
}
```

The keys are the host's own identifiers, opaque to the designer — they are what a payload's templates name (`states()`, `is_state()`, `state_attr()`, dotted access). Each push replaces the whole map.

#### `name` — friendly names ([issue #107](https://github.com/schlomo/odl-drawcustom-designer/issues/107))

Optional, per state: the human-readable label the designer shows instead of the raw key ("Living-room temperature", not `sensor.living_room_temperature`). Presentation only and re-pushable like every other field — templates never see it, so a payload behaves identically whether or not the host names its states. Surrounding whitespace is trimmed, a blank name counts as none, and an unnamed key simply shows as its key.

#### The State Simulator is off under host-fed states ([ADR-018](adr/ADR-018-host-ui-seam.md))

Pushing `states` at all — as a mount option or a later `setStates()`, even an empty map — hands the state catalog to the host, so the designer's own State Simulator is **disabled and replaced**, not hidden (this resolves [issue #24](https://github.com/schlomo/odl-drawcustom-designer/issues/24)): mocking values against live host data is a standalone/demo feature, not a layer to reconcile.

What the user gets in its place, in the same sidebar tab (now labelled **States**):

- **A read-only referenced-states panel** listing exactly the states *this design* reads — the friendly name, the raw key, the current value, and the referenced attributes underneath it. It follows every push live (the demo page's per-second ticker is the reference fixture).
- **An honest missing marker.** A state (or a referenced attribute) the payload names and the host does not supply reads **"not supplied"** rather than a fabricated value — the same thing template preview does with it (`unknown`), said out loud.
- **The full catalog, in autocomplete.** Nothing is hidden: every pushed state key is offered by the YAML/template autocomplete, referenced or not. That is where you go to find a key; the panel is where you check what the design reads.
- **No state-editing UI anywhere.** No add-entity row, no value inputs, no attribute editors.

With no `states` push (standalone, or an embed that pushes none) the Simulator is exactly what it always was, and no panel or States tab exists.

**Load Demo loads the payload only** under a host-fed adapter (maintainer ruling 2026-08-16): the showcase's simulator states are Simulator data, and seeding them would flash values the very next host push wholesale-overwrites to unknown. So the demo payload loads, the host stays authoritative for states, and the showcase's own states show as "not supplied" in the panel until the host supplies them. Shared *variables* are not a host channel — nothing can push or clobber them — so the demo still seeds those. Standalone Load Demo is unchanged (payload + mocks + variables).

**Ownership contract ([issue #110](https://github.com/schlomo/odl-drawcustom-designer/issues/110)):** a pushed `states` object is treated as an **immutable snapshot** at the moment `setStates()` is called. Unchanged pushes are diffed structurally against the last-applied object and skipped for cost (no re-render, no template re-evaluation) — this compares by value, not by cloning, so **mutate-and-repush is unsupported**: if a host mutates the same object in place and calls `setStates()` again with that same reference, the mutation is invisible to the diff and the push is incorrectly treated as unchanged. Construct a fresh object (or a fresh copy of the changed parts) per push instead. A host pushing its whole registry several times a second is the design case, not an abuse. [`demo/host.js`](../demo/host.js) demonstrates the pattern: a `sensor.demo_clock` state ticks every second via `setStates()`, building a fresh state object per push. The diff covers `name` too, so a rename-only push lands — the panel never shows a label the host has moved on from.

### `targets` / `onTargetSelected` ([issue #106](https://github.com/schlomo/odl-drawcustom-designer/issues/106))

The host pushes the **displays it knows about** — the designer's single display channel. The designer renders a picker inside its own display-config area, right above the resolution control ([ADR-018](adr/ADR-018-host-ui-seam.md) targets seam). No host-built display picker outside the mount.

```js
const targets = [
  {
    id: 'display.kitchen',              // opaque, host-defined; echoed back untouched
    label: 'Kitchen tag (296×128 BWR)', // picker entry text
    capabilities: { render_width: 296, render_height: 128, color_scheme: 0x01 },
  },
  { id: 'display.office', label: 'Office display', capabilities: { /* … */ } },
]

const handle = mount(el, {
  targets,
  onTargetSelected(targetId) {
    // targetId === null: the user switched to the virtual display
    handle.setActions(actions(targetId))   // e.g. disable Send without a display
  },
  onAction(id, payload, { targetId }) {
    if (id === 'send') void sendToDisplay(targetId, payload)
  },
})

// Re-push whenever your display inventory changes — this is the normal way to work:
handle.setTargets([...targets, discoveredDisplay])   // appears in the picker, no reload
```

> **The rule:** *until the user makes a display choice, the designer mirrors the host — one declared display = adopted + locked, several = open picker.*

- **One display is not a choice — it is *the* display.** A **one-element** `targets` push is adopted and locked straight away, with no pick: a single-display host mounts with `targets: [display]` and the first painted frame is already that display. Anything else (two or more, or none) only says what the user *can* pick and never moves the canvas by itself.
- **Mirroring holds for every push, not just the first.** Because a mount option *is* an initial push, both halves of the rule apply to a later `setTargets()` while the user has made no choice: pushing a different single display **re-pins** to it (and reports it), and narrowing a multi-display list down to one adopts and locks that one. Widening back to several leaves the design where it is — it is now a choice, and a choice moves nothing by itself.
- **Auto-adoption stops the moment the user chooses.** Once the user has picked a display, picked "Virtual display", or worked the lock, nothing but another pick moves the canvas — so a host may re-push its inventory on a timer, and a list that happens to narrow to one display never drags the user back onto hardware they deliberately left. Picking a display your last push no longer offers is *not* a choice — there is nothing to adopt, so it changes nothing at all and leaves mirroring live.
- **Selecting a display adopts its capabilities and locks** the display config, reusing the [display config lock](#display-config-lock-issue-70) UX: the lock icon appears, the resolution / color-mode controls follow it, and re-locking restores the **selected display's** values.
- **A display resolves from the designer's canonical defaults, not from the canvas in front of the user.** Adopting a display *is* that display, so the same target always produces the same canvas, whatever was adopted before it. What a display does not declare comes from the defaults (no rotation, canonical palette) — never from the display previously in effect, whose rotation would stand a 296×128 panel on end and whose measured `color_map` would paint one panel's red on another's tag ([ADR-007](adr/ADR-007-hybrid-rendering.md) parity). The designer-only preview dither mode is the one thing that survives an adoption, exactly as it survives the lock: it belongs to no display.
- **Re-pushing the selected display's capabilities re-applies them.** If a `setTargets()` push carries *different* capabilities for the display the design is currently pinned to, the host has re-defined that display, so the canvas follows it and stays locked. Unlocked, the user owns the canvas: the new values are stored, and re-locking applies them. A push that only *relabels* the display moves nothing. **Rotation is the one field this re-apply does not always follow** (see the lock's scope below): if the user changed rotation since the display was adopted, that rotation survives; only a rotation left untouched since then adopts what the display now declares. Adopting the display again always resets this — the freshly adopted rotation is the new baseline.
- **"Virtual display" is the picker's name for unlocked.** Picking it is identical to clicking the lock open: the controls become editable and the design is no longer pinned to real hardware. The selection is *remembered* while unlocked — re-locking (or picking the display again) returns to it — so the picker reads "Virtual display" whenever the config is unlocked, and the display again once it is not.
- **Re-pushable, and diffed.** Push the *whole* list again whenever your inventory changes; the designer compares it structurally and does nothing at all when it is unchanged. Pushed targets are copied and frozen on the way in (like [`actions`](#actions--onaction-issue-108), unlike [`states`](#states)), so mutate-and-repush works.
- **Re-pushing from inside `onTargetSelected` is safe — it does not loop.** Reacting to a selection with `setTargets()` (or `setActions()`) is the intended pattern, and a push made from inside the callback arrives while that notification is still in flight: the designer **defers** it, applies it once the notification returns, and if you make several the **last one wins** (a push replaces the whole list, so the ones it superseded are never applied and never move the canvas on their way past). No recursion, no dropped push. What the designer cannot do is out-argue you: a host that answers every notification with a *different* display keeps being followed, one display per settle — that is your own intent, not a loop the designer creates.
- **Removing the selected display keeps it** ("keep and mark stale"): the designer holds that display's last-known capabilities and lock state, marks the selection *unavailable* in the picker and says so in a visible hint. It never silently switches to another display and never unlocks — a design in progress does not silently start describing different hardware. Pushing the display back clears the marker; the remaining displays stay one pick away. The marker applies exactly while the missing display is the one in effect: unlocking to the virtual display puts the design on nothing in particular, so the picker just offers what you still have — until it is re-locked (which returns to the missing display's last-known values).
- **A stale selection reports no target id.** The designer never hands you back an id that is absent from your own current list: the moment a push drops the selected display, `onTargetSelected(null)` fires once and `onAction`'s `context.targetId` is `undefined` — including after unlocking and re-locking onto it. What stays on screen is the *label*, marked unavailable; that is for the user, so they can see what the design is still shaped for. Pushing the display back reports its id again.
- **`onTargetSelected` is optional** and fires only on change: a target id, or `null` for the virtual display (including when the user clicks the lock open, and when the selected display leaves your list). An adopted single display reports its id the same way — that is a change like any other. It is the channel to react to a selection — re-pushing `actions` with a `disabledReason: 'No display selected'`, for instance. A host that only needs the id when something happens can skip it and read `onAction`'s `context.targetId`, which carries the same value (`undefined` where this callback reports `null`).
- **Malformed lists throw** at the push that carries them (missing or duplicate `id`, missing `label`, missing `capabilities`) and leave the designer untouched; a bad list passed to `mount()` throws before the container is touched. `id` and `label` are trimmed, so incidental padding never reaches the picker or the id echoed back.
- **No targets, no picker.** A designer that is pushed no targets renders exactly the display-config area the standalone app does. Once a display has been adopted the picker stays — an emptied list leaves the "Virtual display" entry standing, because that control is how the user leaves the display they are on.

#### What a display *is* — `capabilities`

Mirrors the OpenDisplay HA integration's `capabilities.py` payload, so a host-side adapter can pass it through unchanged. Every field is optional; anything a display does not declare comes from the designer's canonical defaults.

```js
{
  pixel_width: 296, pixel_height: 128,   // physical panel, before rotation
  rotation_degrees: 0,                    // quarter turns only
  render_width: 296, render_height: 128,  // drawing surface (preferred)
  color_scheme: 0x01,                     // Basic Standard 0x00 BW … 0x04 six
  accent_color: 'red',
  available_colors: ['black', 'white', 'red'],
  color_map: { black: '#000000', white: '#ffffff', red: '#c53929' },
  palette_measured: true,
}
```

Mapping onto the canvas ([`src/embed/hostContract.ts`](../src/embed/hostContract.ts)):

- **Size** — `render_width`/`render_height` when both present, else `pixel_width`/`pixel_height` swapped for 90°/270° rotations. Either way the result is the **logical drawing surface**: the canvas the payload is authored against, which the designer then presents upright (see [Rotation](#rotation-issue-139)).
- **Rotation** — `rotation_degrees` normalized into {0, 90, 180, 270}; other angles fall back to upright. It states the orientation of that surface; it is never applied as a transform to the design.

> **Contract: `rotation_degrees` describes the orientation `render_*` is expressed in.**
> The two are adopted as **one indivisible pair** — a display's two dimensions plus which way round they go — and every later re-orientation (the user turning the canvas, a re-lock, a re-push) turns that pair as a unit. So `rotation_degrees` must be the **effective** orientation the render dimensions are already in, not a base rotation still to be applied to them. A host that pairs a base rotation with effective-swapped dimensions is out of contract: the designer cannot detect the mismatch, and the surface reads the wrong way round as soon as the user re-orients it. When you send `pixel_*` instead, send the **physical** panel dimensions — the designer swaps them for a quarter turn itself.

- **Palette structure** — `color_scheme` (Basic Standard value) wins; else inferred from `color_map` keys / `available_colors` names; else `accent_color`.
- **Palette hexes** — the measured hex values in `color_map` re-color the active palette: preview canvas, PNG export, halftone dither tiles and the layer-list color swatches all paint the adopted hexes (one palette source of truth). Recognized names: `black`, `white`, `red`, `yellow`, `blue`, `green`; invalid hexes and unknown names are ignored. Half tones (`half_red`, `gray`, …) are re-derived as the same blends of the measured primaries. The `accent` keyword resolves through the same map, so `accent_color` participates automatically. A display with no `color_map` renders the canonical palette, and standalone rendering is unchanged.

Junk field values are ignored rather than rejected — a non-quarter rotation or a zero size falls back to the defaults instead of refusing a display the host says exists. Known gaps: `palette_measured` is informational only (the hexes apply whether or not it is set), and fractional rotations are not representable. YAML export semantics are untouched — the payload always carries color *names*, never display hexes.

#### Rotation ([issue #139](https://github.com/schlomo/odl-drawcustom-designer/issues/139))

**The canvas is the logical drawing surface, and the designer always presents
it upright.** That is what upstream `imagegen` does: for a quarter turn it
creates the Pillow canvas *already swapped*, draws every element upright in
it, and rotates only the finished bitmap, once, at the very end. Percentage
coordinates resolve against that same logical surface. A payload is therefore
orientation-independent — the same 384×184 payload goes to two same-resolution
panels and only the per-device `rotate` differs (0 and 270).

Consequences for hosts:

- `render_width`/`render_height` (or the swapped `pixel_*` fallback) are the
  surface the payload is authored against — exactly what upstream's
  `capabilities.py` computes.
- The **orientation control** in the designer chooses the orientation of that
  surface: a quarter turn swaps its W/H. It never turns the editing surface,
  the elements, or the exported image. It is also the **only** control that
  does — the resolution quick-picks name a display by its *pair* of dimensions
  and are orientation-insensitive: a 128×296 canvas still reads as the
  `296×128` pick, and choosing a pick lands it in the orientation currently
  held.
- **The canvas rotation is absolute, never cumulative.** It *is* the
  orientation: seeded from the host, changed by the user, replaced outright by
  the next thing that sets it. Nothing anywhere sums it with a base rotation.
- **PNG export / Copy PNG is the upright logical canvas** — the bitmap before
  HA's own `rotate`. Do not re-rotate it before sending; HA (and, for
  OpenDisplay, the firmware) applies the panel's rotation itself.
- `rotate` is **not emitted** in the payload. The send-time value is
  per-target output metadata and travels through the service options seam
  ([issue #105](https://github.com/schlomo/odl-drawcustom-designer/issues/105)),
  never baked into the design: that seam sends the canvas rotation **as-is**
  (or a value the host computes for that target from it), never the canvas
  rotation added to something else.
- **Changing the orientation is not undoable** — like every other display-config
  change (resolution, color mode, dither), it sits outside the payload's undo
  history.
- **Sessions and share links authored before this model reopen upright.**
  Element coordinates always were logical, so nothing needs migrating: a design
  saved at 90° reopens as the same design on a surface of the same two
  dimensions.

#### Display config lock ([issue #70](https://github.com/schlomo/odl-drawcustom-designer/issues/70))

When the design is pinned to a host display, the display config is **host-owned**: a lock icon appears next to the "Display config" heading, and the resolution and color mode controls follow its state.

**Lock scope excludes rotation:** the lock covers **dimensions and color mode/palette only**. Rotation is a user choice — how the same physical display is mounted (portrait vs. landscape) — so the orientation buttons stay **enabled whether or not the display config is locked**, and changing the orientation never unlocks the display or clears the selection. What it *does* change is the orientation of the logical drawing surface, so the W/H the lock shows swap with it: the lock owns the display's two dimensions, the user owns which way round they go.

- **Locked** — the resolution and color-mode controls are disabled; rotation stays enabled. Adopting a display (a one-element `targets` push, or an explicit pick) locks.
- **Unlock** (click the lock, or pick "Virtual display") — the escape hatch: the user may configure any resolution/color mode immediately (rotation was already theirs), and the preview no longer matches a physical display. The selection is remembered, so this is reversible.
- **Re-lock** (click the lock again) — restores the last-adopted display's dimensions/color mode/palette (the designer-only preview dither setting survives too), **oriented to the rotation currently in effect**. **Rotation is left exactly as it currently is** — it was never lock-owned, so re-locking never snaps it back to whatever the host declared.
- **Load Demo while locked** loads the demo payload and simulator seed but **keeps** the host display's resolution/palette (and the rotation currently in effect). Accepted consequence: on small displays the demo layout may look bad. Unlocked, Load Demo applies the showcase display config as in standalone.
- **No display** (standalone, or an embed that never pushes targets): no lock icon, controls behave as they always have.

### `actions` / `onAction` ([issue #108](https://github.com/schlomo/odl-drawcustom-designer/issues/108))

The host registers a **typed, closed list of buttons**; the designer renders them in its own toolbar and reports back which one fired, with the current payload ([ADR-018](adr/ADR-018-host-ui-seam.md) actions seam). Meaning, auth and the actual service call stay entirely host-side — this is deliberately *not* a plugin API, and no host markup ever enters the designer's shadow root.

**This is the only save/send channel.** The designer has no save callback and renders no Save button of its own: a host that wants one registers `{ id: 'save', label: 'Save' }` and does whatever saving means for it.

```js
const actions = (displayOnline) => [
  { id: 'save', label: 'Save' },   // "Save" is an action like any other
  {
    id: 'send',                    // opaque, host-defined; echoed back to onAction
    label: 'Send to display',      // button text and accessible name
    icon: 'send',                  // optional Material Design Icon name
    severity: 'caution',           // 'normal' (default) | 'caution' | 'danger'
    disabledReason: displayOnline ? undefined : 'Display offline — reconnect to send',
  },
  { id: 'validate', label: 'Validate', icon: 'check' },
  // Host-side UI that never reads the design — stays clickable even while
  // the YAML editor is blocked.
  { id: 'settings', label: 'Display settings', icon: 'monitor-dashboard', needsPayload: false },
]

const handle = mount(el, {
  actions: actions(true),
  onAction(id, payload, context) {
    // payload === handle.getPayload() at this instant; context.targetId is the
    // selected display (see `targets` above), undefined when there is none.
    if (id === 'save') void persist(payload)
    if (id === 'send') void sendToDisplay(context.targetId, payload)
  },
})

// Re-push whenever host state changes — this is the normal way to work:
handle.setActions(actions(false))   // Send is now disabled, with its reason
handle.setActions([])               // no action buttons at all
```

- **`onAction` is required** whenever actions are registered. Because it is fixed at mount, a mount without one could never take an action — so a non-empty list at `mount()` *or* at `setActions()` throws instead of painting buttons that look live and do nothing. `setActions([])` stays legal either way.
- **Re-pushable, and diffed.** Push the *whole* list again on every host state change; the designer compares it structurally and does nothing at all when it is unchanged, so a host may re-push on a timer. Unlike [`states`](#states), the pushed actions are copied on the way in, so mutate-and-repush works too.
- **Severity is presentation only:** `normal` regular chrome, `caution` orange, `danger` red — in both themes. `caution` is the reference case for an action that reaches beyond the designer (a Send-to-display drives physical hardware). The designer never infers behavior from it: no confirmation dialog, no interception.
- **`disabledReason` disables the button** and is what the user reads when hovering it — the field hosts flip live ("Display offline", "No display selected"). Clearing it re-enables the button. It is also exposed to assistive tech as the button's description, so it is readable without hovering; the button keeps its own surface under the pointer while disabled, and toggling the reason never remounts it (focus survives).
- **`icon` is any [Material Design Icon](https://pictogrammer.com/library/mdi/) name**, resolved exactly as a payload `icon` element resolves it — the `mdi:` prefix is optional, so `send`, `mdi:send` and `home-assistant` all work. One icon vocabulary, not two: the designer already bundles the full MDI set for the payload's icon element, so every name that element accepts is available here at no added bundle size and with no icon dependency on the host side. An unknown name is rejected at the push, not ignored.
- **`needsPayload` (default `true`)** says whether the action reads the design. While the YAML editor is blocked by a parse/schema error, every action that needs the payload is disabled and says so on hover (a host `disabledReason` takes precedence over that message). A `needsPayload: false` action — host-side settings, a reconnect, a help link — stays clickable and receives the **last valid payload**, exactly what [`getPayload()`](#getpayload-issue-104) reports while blocked.
- **Malformed lists throw** at the push that carries them (unknown `icon` or `severity`, non-boolean `needsPayload`, missing or duplicate `id`, missing `label`), like invalid `payload` YAML does, and leave the designer untouched. A bad list passed to `mount()` throws before the container is touched. Text fields are trimmed, so incidental padding never reaches the button or the id echoed back to `onAction`.

### `payload`

The payload is the drawcustom **element list YAML** (what the YAML panel shows). The host owns persistence: session autosave is disabled in embedded mode, the share-link button is hidden, and the payload leaves the designer only through [`getPayload()`](#getpayload-issue-104) or an [action](#actions--onaction-issue-108) callback. The designer never writes it anywhere itself.

### `theme`

`'light' | 'dark'`, applied as a class on the designer's wrapper element inside the mount's shadow root — embedded mounts never touch `document.documentElement` or `localStorage` theme preferences. Because every instance carries its own wrapper and stylesheet, two mounts on one page can hold different themes simultaneously.

## Clipboard requires a secure context

The copy buttons (Copy PNG, Copy YAML, share link) use the async clipboard
API, which browsers only expose in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
— HTTPS or `http://localhost`. When the host page is served from a plain-http
LAN IP or `file://` — the typical local Home Assistant box
(`http://192.168.1.2:8123`, `http://homeassistant.local:8123`), so the common
case rather than an edge case:

- **Copy YAML** and the share link still work — the designer falls back to the
  legacy `document.execCommand('copy')` path for text. They carry no warning.
- **Copy PNG** has no insecure-context clipboard path, and signals that
  upfront: the button renders warning-marked (amber surface plus a corner
  badge) from first paint, and hovering or focusing it shows
  "Copy PNG needs HTTPS or localhost — use Download PNG instead". It stays
  clickable; a click still fails with the visible "Clipboard requires HTTPS
  or localhost" alert as backstop. Use Download PNG, or serve the host page
  over HTTPS/localhost to get Copy PNG back.

## Standalone SPA

The standalone GitHub Pages app is a **host adapter over the same mount lifecycle** the library exports ([issue #72](https://github.com/schlomo/odl-drawcustom-designer/issues/72), [ADR-017](adr/ADR-017-host-adapter-seam.md)): [`src/main.tsx`](../src/main.tsx) calls `mountStandaloneApp()` ([`src/embed/standalone.tsx`](../src/embed/standalone.tsx)), which mounts `createStandaloneHost()` ([`src/embed/standaloneHost.ts`](../src/embed/standaloneHost.ts)) through the internal `mountDesigner()` in [`src/embed/mount.tsx`](../src/embed/mount.tsx) — the same function the public `mount()` uses with the embedded adapter.

Standalone behavior is unaffected by embedding: page-DOM rendering (no shadow root), document-level theme, IndexedDB session/mocks/variables autosave, `#d=` share-hash bootstrap and same-tab re-bootstrap, share link and theme toggle in the chrome. Pushes on a standalone handle behave exactly as they do in an embed — one lifecycle, one push path.

### Host adapters

Everything that would otherwise be an `embedded` conditional in the React shell is policy on the `DesignerHost` adapter ([`src/embed/host.ts`](../src/embed/host.ts)):

| Policy | Standalone | Embedded (`mount()`) |
|--------|-----------|----------------------|
| `styleScope` | `page` (page's own stylesheet) | `shadow` (isolated root + injected CSS) |
| `theme` | `{ owner: 'designer' }` — persisted preference on `document.documentElement`, theme toggle shown | `{ owner: 'host', value }` — fixed, scoped to the mount wrapper |
| `fill` | `viewport` | `container` |
| `shareLink` | `true` | `false` |
| `persistence` | IndexedDB writers | `null` — the host owns the payload |
| `actions` / `onAction` | absent — no action chrome | host-registered buttons |
| `targets` / `onTargetSelected` | absent — no display picker | host-pushed displays in the picker |
| `loadBootstrap` | async: session + `#d=` hash | sync: `payload`/`states`/`targets` options |

The interface is **internal on purpose** — it references internal types, so publishing it would freeze designer internals under semver ([`docs/releasing.md`](releasing.md)). The public embedded surface is `mount`, `MountOptions`, `MountHandle` and the host data contract above.
