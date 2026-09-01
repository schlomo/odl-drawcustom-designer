import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * sha256 checksum for the release library artifact (issue #103): shipped as
 * `odl-drawcustom-designer.js.sha256` alongside the GitHub release, verifiable
 * with `shasum -a 256 -c` (bare `-c` defaults to SHA-1 and mis-verifies a
 * SHA-256 file). Pure/FS logic here, tested in
 * tests/tools/releaseChecksum.test.ts; called from tools/createRelease.ts —
 * the workflow only invokes that script (thin CI, AGENTS.md).
 */

/** Hex-encoded sha256 digest of a file's contents. */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * A `shasum -c` compatible checksum line: hex digest, two spaces, filename
 * (relative — `shasum -c` resolves it against its own working directory),
 * trailing newline.
 */
export function formatChecksumLine(hash: string, filename: string): string {
  return `${hash}  ${filename}\n`
}

/**
 * Writes `<path>.sha256` next to `path`, containing a `shasum -c` compatible
 * line naming the file by its basename (so verification works when both
 * files are copied together, regardless of original directory). Returns the
 * checksum file's path.
 */
export function writeChecksumFile(path: string): string {
  const hash = sha256File(path)
  const checksumPath = join(dirname(path), `${basename(path)}.sha256`)
  writeFileSync(checksumPath, formatChecksumLine(hash, basename(path)))
  return checksumPath
}
