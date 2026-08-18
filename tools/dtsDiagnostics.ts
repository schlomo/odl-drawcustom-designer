import ts from 'typescript'

/**
 * Fail-loud gate for the library declaration build (issue #122): `vite build`
 * with `vite-plugin-dts` swallows TypeScript diagnostics by default — it logs
 * them to the console but still exits 0, which would ship a package whose
 * bundled `.d.ts` is silently wrong (or, before `bundleTypes` fixed the
 * config, silently empty). AGENTS.md's "fail early and loudly" rules that out:
 * a broken declaration build must fail the build, not degrade into a
 * missing/wrong-types package.
 *
 * `vite.lib.config.ts` wires `formatDtsDiagnostics`/`assertNoDtsDiagnostics`
 * into the `dts()` plugin's `afterDiagnostic` hook, which receives every
 * diagnostic the plugin's own TypeScript program collected
 * (`getDeclarationDiagnostics()` + `getSemanticDiagnostics()` +
 * `getSyntacticDiagnostics()`) right before it writes the bundled file.
 */

/** One `file:line:col - message` line, or just the message for a diagnostic with no source position. */
export function formatDtsDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  if (diagnostic.file && diagnostic.start !== undefined) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    return `${diagnostic.file.fileName}:${line + 1}:${character + 1} - ${message}`
  }
  return message
}

/** `undefined` when there are no diagnostics; otherwise a multi-line summary naming every one. */
export function dtsDiagnosticsSummary(diagnostics: readonly ts.Diagnostic[]): string | undefined {
  if (diagnostics.length === 0) {
    return undefined
  }
  const lines = diagnostics.map((diagnostic) => `  ${formatDtsDiagnostic(diagnostic)}`)
  return (
    `Library declaration build found ${diagnostics.length} TypeScript diagnostic(s) — failing ` +
    `the build rather than shipping a package with missing or wrong .d.ts types ` +
    `(AGENTS.md, "fail early and loudly"):\n${lines.join('\n')}`
  )
}

/** Throws when `diagnostics` is non-empty; no-op otherwise. */
export function assertNoDtsDiagnostics(diagnostics: readonly ts.Diagnostic[]): void {
  const summary = dtsDiagnosticsSummary(diagnostics)
  if (summary) {
    throw new Error(summary)
  }
}
