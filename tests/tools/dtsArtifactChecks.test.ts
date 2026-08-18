import { describe, expect, it } from 'vitest'
import { assertSoundDtsArtifacts, findDtsArtifactProblems } from '../../tools/dtsArtifactChecks'

// Post-emit soundness checks for the bundled library declaration file
// (issue #122 review findings, MINOR 4): a clean TypeScript compile can still
// emit a .d.ts that is empty, missing the public API, leaking an ambient
// module augmentation (MAJOR 1), or importing an undeclared external
// package. These are the pure checks vite.lib.config.ts wires into the
// dts() plugin's afterBuild hook.

const SOUND_CONTENT = `
export declare type EmbedTheme = 'light' | 'dark';
export declare function mount(container: HTMLElement, options?: MountOptions): MountHandle;
export declare interface MountOptions {}
export declare interface MountHandle {}
export {}
`

describe('findDtsArtifactProblems', () => {
  it('finds no problems in a sound, self-contained declaration file', () => {
    expect(findDtsArtifactProblems(SOUND_CONTENT)).toEqual([])
  })

  it('flags an empty file', () => {
    const problems = findDtsArtifactProblems('')
    expect(problems.some((p) => p.includes('empty'))).toBe(true)
  })

  it('flags a file missing the mount() declaration', () => {
    const problems = findDtsArtifactProblems('export declare interface MountOptions {}\nexport {}\n')
    expect(problems.some((p) => p.includes('mount()'))).toBe(true)
  })

  it('flags an ambient "declare module" (MAJOR 1 regression guard)', () => {
    const withAmbientModule = `${SOUND_CONTENT}\ndeclare module 'bidi-js' {\n  export default function bidiFactory(): unknown\n}\n`
    const problems = findDtsArtifactProblems(withAmbientModule)
    expect(problems.some((p) => p.includes('declare module'))).toBe(true)
  })

  it('flags an ambient "declare global"', () => {
    const withAmbientGlobal = `${SOUND_CONTENT}\ndeclare global {\n  interface Window {}\n}\n`
    const problems = findDtsArtifactProblems(withAmbientGlobal)
    expect(problems.some((p) => p.includes('declare module'))).toBe(true)
  })

  it('flags an external import statement (the zod-leak scenario)', () => {
    const withExternalImport = `import { z } from 'zod';\n${SOUND_CONTENT}`
    const problems = findDtsArtifactProblems(withExternalImport)
    expect(problems.some((p) => p.includes('import'))).toBe(true)
  })
})

describe('assertSoundDtsArtifacts', () => {
  it('does not throw when every emitted file is sound', () => {
    expect(() => assertSoundDtsArtifacts(new Map([['/dist-lib/odl-drawcustom-designer.d.ts', SOUND_CONTENT]]))).not.toThrow()
  })

  it('throws naming the file and the problem for an unsound emission', () => {
    const map = new Map([['/dist-lib/odl-drawcustom-designer.d.ts', '']])
    expect(() => assertSoundDtsArtifacts(map)).toThrow(/odl-drawcustom-designer\.d\.ts.*empty/s)
  })

  it('throws for an ambient module leak even when the mount() declaration is present', () => {
    const withAmbientModule = `${SOUND_CONTENT}\ndeclare module 'bidi-js' {}\n`
    const map = new Map([['/dist-lib/odl-drawcustom-designer.d.ts', withAmbientModule]])
    expect(() => assertSoundDtsArtifacts(map)).toThrow(/declare module/)
  })
})
