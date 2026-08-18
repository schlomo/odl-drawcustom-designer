/**
 * Fixture TypeScript sources for the scratch-consumer types check (issue
 * #122's acceptance test, `tools/verifyNpmTypes.ts`): a real npm consumer
 * project, built from the freshly-`npm pack`ed staged package, type-checked
 * with `tsc --noEmit`.
 *
 * Pure string builders — no filesystem/process access — so the fixture
 * content itself is unit-tested (tests/tools/npmTypesConsumerFixture.test.ts)
 * independently of the (unavoidably slow, network/`npm`-touching)
 * pack/install/tsc pipeline in `verifyNpmTypes.ts`.
 */

/**
 * Compiles cleanly against the published `.d.ts`: exercises `mount()` and
 * `MountHandle` with a correctly-typed options object and correctly-typed
 * handle usage.
 */
export function validConsumerSource(packageName: string): string {
  return `import { mount, version, type MountHandle } from '${packageName}'

const container = document.createElement('div')

const handle: MountHandle = mount(container, {
  payload: '- type: text\\n  value: hello\\n',
  theme: 'dark',
  states: { 'sensor.demo': '21.5' },
})

handle.setTheme('light')
handle.setPayload('- type: text\\n  value: bye\\n')
const currentPayload: string = handle.getPayload()
console.log(version, handle.version, currentPayload)
`
}

/**
 * Must FAIL to compile against the published `.d.ts` — the negative half of
 * the acceptance test (a `.d.ts` that accepted everything would be as broken
 * as no `.d.ts` at all). Two independent errors, so either kind of mistake a
 * host could make is caught:
 *
 * - an unknown `MountOptions` key (`bogusOption`) — TS2353 (excess property)
 * - a wrong argument type for `mount()`'s container parameter — TS2345
 */
export function invalidConsumerSource(packageName: string): string {
  return `import { mount } from '${packageName}'

// Bad option name — MountOptions has no "bogusOption" field.
mount(document.createElement('div'), { bogusOption: true })

// Wrong argument type — mount()'s first parameter is HTMLElement, not a number.
mount(42, {})
`
}
