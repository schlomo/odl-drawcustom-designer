// Fake host page for the embeddable designer (issue #20). Loads the library
// build from the same directory (see vite.lib.config.ts publicDir wiring),
// mounts the designer, pushes fake states/capabilities/targets and receives
// Save requests — the same integration surface a real host (e.g. the
// OpenDisplay HA integration panel) uses. Serve with:
//   npm run build:lib && python3 -m http.server -d dist-lib
//
// Also pushes a self-mutating `sensor.demo_clock` state once per second
// (issue #119, ADR-018) — the living example of the `setStates()` push
// channel, not just a one-time seed. The friendly_name row's template
// concatenates it onto the existing element so the demo payload keeps its
// element count (3) that other e2e specs assert against; see
// tests/e2e/embed-host-live-ticker.spec.ts for the ticking proof.
import { mount } from './odl-drawcustom-designer.js'

const PAYLOAD = `- type: text
  value: "{{ states('sensor.demo_temperature') }} °C"
  x: 10
  y: 10
  size: 24
- type: text
  value: "{{ state_attr('sensor.demo_temperature', 'friendly_name') }} · {{ states('sensor.demo_clock') }}"
  x: 10
  y: 44
  size: 16
- type: rectangle
  x_start: 4
  y_start: 4
  x_end: 200
  y_end: 70
  outline: red
  width: 2
`

const WARM_STATES = {
  'sensor.demo_temperature': {
    state: '21.5',
    attributes: { friendly_name: 'Living room', unit_of_measurement: '°C' },
  },
}

const COLD_STATES = {
  'sensor.demo_temperature': {
    state: '3.2',
    attributes: { friendly_name: 'Balcony', unit_of_measurement: '°C' },
  },
}

// Ownership contract (docs/embedding.md#states — issue #110): a pushed
// `states` object is an immutable snapshot, diffed by value against the
// last-applied push. Mutate-and-repush is invisible to that diff, so this
// constructs a fresh object every tick instead of mutating a cached one.
function currentClockState() {
  const time = new Date().toTimeString().slice(0, 8) // "HH:MM:SS"
  return {
    'sensor.demo_clock': {
      state: time,
      attributes: { friendly_name: 'Demo clock' },
    },
  }
}

// Measured panel palette (issue #68): the red hex is deliberately NOT the
// canonical #ff0000 — the designer preview must visibly adopt it.
const CAPABILITIES_296X128_BWR = {
  pixel_width: 296,
  pixel_height: 128,
  rotation_degrees: 0,
  render_width: 296,
  render_height: 128,
  color_scheme: 0x01,
  accent_color: 'red',
  available_colors: ['black', 'white', 'red'],
  color_map: { black: '#000000', white: '#ffffff', red: '#c53929' },
  palette_measured: true,
}

// Display targets (issue #106, ADR-018): the displays this fake host "knows
// about". Ids are opaque to the designer — it echoes them back through
// `onTargetSelected` and `onAction`'s context and never interprets them. Each
// carries the same capabilities payload shape the `capabilities` channel takes,
// so picking one resizes and re-palettes the canvas through the same mapping.
const CAPABILITIES_400X300_BW = {
  render_width: 400,
  render_height: 300,
  color_scheme: 0x00,
  available_colors: ['black', 'white'],
}

const CAPABILITIES_800X480_BWRY = {
  render_width: 800,
  render_height: 480,
  color_scheme: 0x03,
  available_colors: ['black', 'white', 'red', 'yellow'],
}

const CAPABILITIES_152X152_BW = {
  pixel_width: 152,
  pixel_height: 152,
  color_scheme: 0x00,
}

const INITIAL_TARGETS = [
  {
    id: 'display.kitchen',
    label: 'Kitchen tag (296×128 BWR)',
    capabilities: CAPABILITIES_296X128_BWR,
  },
  { id: 'display.office', label: 'Office display (400×300 BW)', capabilities: CAPABILITIES_400X300_BW },
  { id: 'display.hallway', label: 'Hallway 7.5" (800×480 BWRY)', capabilities: CAPABILITIES_800X480_BWRY },
]

// The display this host "discovers" later — the hot-update demo.
const LATE_TARGET = {
  id: 'display.garage',
  label: 'Garage tag (152×152 BW)',
  capabilities: CAPABILITIES_152X152_BW,
}

const savedPayload = document.getElementById('saved-payload')
const actionLog = document.getElementById('action-log')
const targetLog = document.getElementById('target-log')

// Host-registered actions (issue #108, ADR-018): the host owns what each
// button means — this page fakes a display transmission and a payload check.
// `severity: 'caution'` is the reference case: Send drives real hardware.
// `icon` takes any Material Design Icon name — the same vocabulary a payload
// icon element accepts, so `monitor-dashboard` needs no special casing.
function buildActions(displayOnline) {
  return [
    {
      id: 'send',
      label: 'Send to display',
      icon: 'send',
      severity: 'caution',
      disabledReason: displayOnline ? undefined : 'Display offline — reconnect to send',
    },
    { id: 'validate', label: 'Validate', icon: 'check' },
    // Host-side UI that never reads the design: `needsPayload: false` keeps
    // it clickable even while the YAML editor is blocked by a syntax error.
    { id: 'settings', label: 'Display settings', icon: 'monitor-dashboard', needsPayload: false },
  ]
}

let displayOnline = true

// The temperature reading the ticker's next tick should keep pushing
// alongside the clock — updated by the warm/cold buttons below so a push
// mid-tick never clobbers the other's latest value (setStates() replaces
// the whole map, so every push must carry both).
let temperatureStates = WARM_STATES

function pushCombinedStates() {
  handle.setStates({ ...temperatureStates, ...currentClockState() })
}

// Single source of truth for "current non-clock states" (Copilot review on
// PR #128): every push driving this page — the warm/cold buttons below, or
// an e2e fixture standing in for a host push mid-drag — must go through
// here so it lands in `temperatureStates`. A push made any other way (e.g.
// straight through `designerHandle.setStates()`) is invisible to the
// ticker: the next 1s tick would re-push the stale `temperatureStates`
// snapshot from mount and silently clobber it. Routing every push through
// this updater means the ticker's next re-push always carries forward
// whatever was last set, by construction. Exposed on `window` for the e2e
// suite (tests/e2e/embed-host-push-mid-drag.spec.ts,
// tests/e2e/embed-host-live-ticker.spec.ts) and console experiments.
function demoPushStates(states) {
  temperatureStates = states
  pushCombinedStates()
}
window.demoPushStates = demoPushStates

// The host's own view of the display inventory and of what the user picked in
// the designer's picker — kept in sync through `onTargetSelected` below, which
// is the only way this page learns about a selection before an action fires.
let targets = INITIAL_TARGETS
let selectedTargetId = null

const handle = mount(document.getElementById('designer'), {
  payload: PAYLOAD,
  states: { ...WARM_STATES, ...currentClockState() },
  capabilities: CAPABILITIES_296X128_BWR,
  theme: 'light',
  targets: INITIAL_TARGETS,
  onTargetSelected(targetId) {
    // `null` = the user switched to the virtual display (or unlocked the
    // display config), so the design is no longer pinned to real hardware.
    selectedTargetId = targetId
    targetLog.textContent =
      targetId === null
        ? 'Virtual display — no target selected'
        : `Selected display: ${targetId}`
  },
  actions: buildActions(displayOnline),
  onAction(id, payload, context) {
    // The designer reports only which button fired, the current payload and
    // the opaque id of the display it is pinned to; everything below is
    // host-side meaning.
    if (id === 'send') {
      const to = context.targetId ?? 'the virtual display (no target selected)'
      actionLog.textContent = `Sent ${payload.length} bytes to ${to}:\n${payload}`
      return
    }
    if (id === 'validate') {
      const elementCount = payload.split(/^- /m).length - 1
      actionLog.textContent = `Validated ${elementCount} element(s).`
      return
    }
    if (id === 'settings') {
      actionLog.textContent = 'Opened the host-side display settings (no payload needed).'
      return
    }
    actionLog.textContent = `Unhandled action: ${id}`
  },
  onSaveRequest(payload) {
    savedPayload.textContent = payload
  },
})

// Expose for the Playwright e2e suite and for console experiments.
window.designerHandle = handle

// Ticker (issue #119): proves the live-update push channel end to end,
// not just a one-time seed. Starts right after mount (the initial states
// option above already covers the first frame); cleaned up on Destroy so a
// destroyed handle never gets an interval calling setStates() on it.
const tickerIntervalId = setInterval(pushCombinedStates, 1000)

document.getElementById('push-warm').addEventListener('click', () => {
  demoPushStates(WARM_STATES)
})
document.getElementById('push-cold').addEventListener('click', () => {
  demoPushStates(COLD_STATES)
})
document.getElementById('push-capabilities').addEventListener('click', () => {
  handle.setCapabilities(CAPABILITIES_296X128_BWR)
})
// Actions are re-pushable (ADR-018): the whole list goes back whenever host
// state changes, and the designer diffs it — here a fake connection drop
// disables Send with a reason, live.
document.getElementById('toggle-connection').addEventListener('click', (event) => {
  displayOnline = !displayOnline
  handle.setActions(buildActions(displayOnline))
  event.target.textContent = displayOnline ? 'Simulate display offline' : 'Simulate display online'
})
// Targets are hot-updateable (ADR-018): a display the host learns about later
// appears in the picker without a reload.
document.getElementById('add-display').addEventListener('click', () => {
  if (targets.some((target) => target.id === LATE_TARGET.id)) {
    targetLog.textContent = `${LATE_TARGET.label} is already in the list`
    return
  }
  targets = [...targets, LATE_TARGET]
  handle.setTargets(targets)
  targetLog.textContent = `Added ${LATE_TARGET.label} — it is in the picker now`
})
// Keep-and-mark-stale: removing the *selected* display must not switch the
// designer to another one or unlock it — it keeps the last-known display config
// and marks the selection unavailable.
document.getElementById('remove-selected-display').addEventListener('click', () => {
  if (selectedTargetId === null) {
    targetLog.textContent = 'Pick a display in the designer first'
    return
  }
  targets = targets.filter((target) => target.id !== selectedTargetId)
  handle.setTargets(targets)
  targetLog.textContent = `Removed ${selectedTargetId} — the designer keeps its last-known display config`
})
document.getElementById('theme').addEventListener('change', (event) => {
  handle.setTheme(event.target.value)
})
document.getElementById('destroy').addEventListener('click', () => {
  // Order matters: clearInterval() runs synchronously before destroy(), so
  // no queued tick can ever fire pushCombinedStates() -> handle.setStates()
  // against an already-destroyed handle (which throws — see mount.tsx).
  clearInterval(tickerIntervalId)
  handle.destroy()
})
