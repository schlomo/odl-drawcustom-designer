import { describe, expect, it } from 'vitest'
import { invalidConsumerSource, validConsumerSource } from '../../tools/npmTypesConsumerFixture'

// Scratch-consumer types check fixtures (issue #122): these are plain string
// builders, unit-tested here independently of the slow pack/install/tsc
// pipeline in tools/verifyNpmTypes.ts, which is exercised for real (not unit
// tested, like tools/autoRelease.ts's import.meta.main block).

describe('validConsumerSource', () => {
  it('imports mount, version and MountHandle from the given package name', () => {
    const source = validConsumerSource('@schlomo/odl-drawcustom-designer')
    expect(source).toContain("from '@schlomo/odl-drawcustom-designer'")
    expect(source).toContain('mount')
    expect(source).toContain('version')
    expect(source).toContain('MountHandle')
  })

  it('calls mount() with a correctly-typed container and options', () => {
    const source = validConsumerSource('@schlomo/odl-drawcustom-designer')
    expect(source).toContain('mount(container, {')
    expect(source).toContain('theme:')
  })
})

describe('invalidConsumerSource', () => {
  it('imports mount from the given package name', () => {
    const source = invalidConsumerSource('@schlomo/odl-drawcustom-designer')
    expect(source).toContain("from '@schlomo/odl-drawcustom-designer'")
  })

  it('passes an unknown MountOptions key (bad option name)', () => {
    expect(invalidConsumerSource('x')).toContain('bogusOption')
  })

  it('passes a wrong-typed argument to mount() (wrong argument type)', () => {
    expect(invalidConsumerSource('x')).toContain('mount(42, {})')
  })
})
