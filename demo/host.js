// Fake host page for the embeddable designer (issue #20). Loads the library
// build from the same directory (see vite.lib.config.ts publicDir wiring),
// mounts the designer, pushes fake states/capabilities and receives Save
// requests — the same integration surface a real host (e.g. the OpenDisplay
// HA integration panel) uses. Serve with:
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

const savedPayload = document.getElementById('saved-payload')

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

const handle = mount(document.getElementById('designer'), {
  payload: PAYLOAD,
  states: { ...WARM_STATES, ...currentClockState() },
  capabilities: CAPABILITIES_296X128_BWR,
  theme: 'light',
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
