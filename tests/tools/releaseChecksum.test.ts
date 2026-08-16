import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { formatChecksumLine, sha256File, writeChecksumFile } from '../../tools/releaseChecksum'

// sha256 + NOTICE + THIRD_PARTY.md release assets (issue #103): the release
// script must ship a `.sha256` checksum for the library build artifact,
// verifiable with `shasum -c`. All logic lives here (thin CI, AGENTS.md);
// the workflow only invokes tools/autoRelease.ts.

describe('sha256File', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('computes the sha256 hex digest of a file (known fixture)', () => {
    dir = mkdtempSync(join(tmpdir(), 'checksum-test-'))
    const file = join(dir, 'fixture.txt')
    writeFileSync(file, 'hello world\n')
    // Verified with: printf 'hello world\n' | shasum -a 256
    expect(sha256File(file)).toBe('a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447')
  })

  it('produces different digests for different content', () => {
    dir = mkdtempSync(join(tmpdir(), 'checksum-test-'))
    const fileA = join(dir, 'a.txt')
    const fileB = join(dir, 'b.txt')
    writeFileSync(fileA, 'content a')
    writeFileSync(fileB, 'content b')
    expect(sha256File(fileA)).not.toBe(sha256File(fileB))
  })
})

describe('formatChecksumLine', () => {
  it('formats a shasum -c compatible line: "<hex>  <filename>\\n"', () => {
    expect(formatChecksumLine('abc123', 'odl-drawcustom-designer.js')).toBe(
      'abc123  odl-drawcustom-designer.js\n',
    )
  })
})

describe('writeChecksumFile', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('writes a checksum file next to the target, verifiable by filename', () => {
    dir = mkdtempSync(join(tmpdir(), 'checksum-test-'))
    const target = join(dir, 'odl-drawcustom-designer.js')
    writeFileSync(target, 'console.log("build")')
    const checksumPath = writeChecksumFile(target)

    expect(checksumPath).toBe(join(dir, 'odl-drawcustom-designer.js.sha256'))
    const contents = readFileSync(checksumPath, 'utf8')
    expect(contents).toBe(`${sha256File(target)}  odl-drawcustom-designer.js\n`)
  })
})
