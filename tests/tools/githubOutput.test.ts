import { describe, expect, it } from 'vitest'
import { formatGithubOutputLines, writeGithubOutput } from '../../tools/githubOutput'

// The one channel the release pipeline's `version` job uses to hand the
// computed version to the two publish jobs that fan out from it. Kept as
// tested code rather than an `echo` line in the workflow (thin CI,
// AGENTS.md), and a no-op off CI so the same scripts run on a laptop.

describe('formatGithubOutputLines', () => {
  it('emits a heredoc block per output, so a value can never truncate or inject another output', () => {
    const rendered = formatGithubOutputLines({ version: '3.4.0' })
    const [header, value, terminator] = rendered.trimEnd().split('\n')
    expect(header).toMatch(/^version<<\S+$/)
    expect(value).toBe('3.4.0')
    expect(terminator).toBe(header!.split('<<')[1])
  })

  it('round-trips a multi-line value intact', () => {
    const rendered = formatGithubOutputLines({ reason: 'line one\nline two' })
    expect(rendered).toContain('line one\nline two\n')
  })

  it('emits every entry', () => {
    const rendered = formatGithubOutputLines({ version: '3.4.0', tag: 'v3.4.0', 'create-release': 'true' })
    expect(rendered).toContain('version<<')
    expect(rendered).toContain('tag<<')
    expect(rendered).toContain('create-release<<')
    expect(rendered).toContain('v3.4.0')
  })

  it('refuses a value carrying the delimiter rather than writing a corrupt file', () => {
    const delimiter = formatGithubOutputLines({ k: '' }).split('<<')[1]!.split('\n')[0]!
    expect(() => formatGithubOutputLines({ k: `oops ${delimiter}` })).toThrow(/delimiter/)
  })
})

describe('writeGithubOutput', () => {
  it('is a no-op when GITHUB_OUTPUT is unset (a laptop run writes nothing)', () => {
    expect(() => writeGithubOutput({}, { version: '3.4.0' })).not.toThrow()
  })
})
