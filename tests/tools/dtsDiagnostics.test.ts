import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { assertNoDtsDiagnostics, dtsDiagnosticsSummary, formatDtsDiagnostic } from '../../tools/dtsDiagnostics'

// Fail-loud gate for the library declaration build (issue #122): vite-plugin-dts
// logs TypeScript diagnostics but still exits 0 on its own — these are the pure
// functions vite.lib.config.ts wires into its `afterDiagnostic` hook to turn a
// broken declaration build into an actual build failure (AGENTS.md, "fail
// early and loudly").

function fileLessDiagnostic(messageText: string): ts.Diagnostic {
  return {
    category: ts.DiagnosticCategory.Error,
    code: 9999,
    file: undefined,
    start: undefined,
    length: undefined,
    messageText,
  }
}

function fileDiagnostic(messageText: string, position: number): ts.Diagnostic {
  const file = ts.createSourceFile(
    'src/embed/types.ts',
    'export type A = 1\nexport type B = NotARealType\n',
    ts.ScriptTarget.ESNext,
    true,
  )
  return {
    category: ts.DiagnosticCategory.Error,
    code: 2304,
    file,
    start: position,
    length: 1,
    messageText,
  }
}

describe('formatDtsDiagnostic', () => {
  it('renders just the message when the diagnostic carries no source position', () => {
    expect(formatDtsDiagnostic(fileLessDiagnostic('Something went wrong'))).toBe('Something went wrong')
  })

  it('renders file:line:col - message when the diagnostic is attached to a source file', () => {
    // "NotARealType" starts at index 35 on line 2 (0-indexed line 1, column 17)
    const position = 'export type A = 1\nexport type B = '.length
    const formatted = formatDtsDiagnostic(fileDiagnostic("Cannot find name 'NotARealType'.", position))
    expect(formatted).toBe("src/embed/types.ts:2:17 - Cannot find name 'NotARealType'.")
  })
})

describe('dtsDiagnosticsSummary', () => {
  it('returns undefined for an empty diagnostics list', () => {
    expect(dtsDiagnosticsSummary([])).toBeUndefined()
  })

  it('summarizes a non-empty list, naming the count and every diagnostic', () => {
    const summary = dtsDiagnosticsSummary([fileLessDiagnostic('First problem'), fileLessDiagnostic('Second problem')])
    expect(summary).toContain('2 TypeScript diagnostic(s)')
    expect(summary).toContain('First problem')
    expect(summary).toContain('Second problem')
  })

  it('mentions failing the build, not shipping missing/wrong types', () => {
    const summary = dtsDiagnosticsSummary([fileLessDiagnostic('x')])
    expect(summary).toMatch(/fail/i)
  })
})

describe('assertNoDtsDiagnostics', () => {
  it('does not throw for an empty list', () => {
    expect(() => assertNoDtsDiagnostics([])).not.toThrow()
  })

  it('throws with the summary message for a non-empty list', () => {
    expect(() => assertNoDtsDiagnostics([fileLessDiagnostic('Boom')])).toThrow(/Boom/)
  })
})
