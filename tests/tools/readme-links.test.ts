import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * README unification (maintainer ruling 2026-08-16): one README.md at the
 * repo root is staged as the npm package page too (tools/stageNpmPackage.ts),
 * so every link must resolve on npmjs.com — which has no repo filesystem to
 * resolve a relative link against. Markdown link targets must be absolute
 * (`http(s)://…`) or a same-page anchor (`#…`); a bare `docs/foo.md`,
 * `./foo.md`, or `/foo.md` renders as a dead link on npmjs.com even though
 * it works fine on GitHub.
 */

const README_PATH = join(import.meta.dirname, '..', '..', 'README.md')

/** Markdown link/image targets: `[text](target)` and `![alt](target)`. */
function extractLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])
}

function isAbsoluteOrAnchor(target: string): boolean {
  return /^https?:\/\//.test(target) || target.startsWith('#')
}

describe('README.md link absoluteness', () => {
  it('flags a relative link target (proves the check can fail)', () => {
    const targets = extractLinkTargets('See [the docs](docs/embedding.md) for more.')
    expect(targets.every(isAbsoluteOrAnchor)).toBe(false)
  })

  it('every link in the real README.md is absolute or a same-page anchor', () => {
    const markdown = readFileSync(README_PATH, 'utf8')
    const targets = extractLinkTargets(markdown)
    const relative = targets.filter((target) => !isAbsoluteOrAnchor(target))
    expect(relative).toEqual([])
  })
})
