import { lintYamlDocument, type YamlLintDiagnostic } from '../editor/yamlLint'
import type { StatusMessage } from './status-messages'

export function yamlLintDiagnosticsToStatusMessages(
  diagnostics: readonly YamlLintDiagnostic[],
): StatusMessage[] {
  if (diagnostics.length === 0) {
    return []
  }

  const first = diagnostics[0]!
  const summary =
    diagnostics.length === 1
      ? first.message
      : `${diagnostics.length} validation errors — ${first.message}`

  return [
    {
      severity: 'error',
      title: 'YAML not applied to canvas',
      summary,
      detail:
        'Fix the highlighted issue in the YAML editor (red underline). The canvas keeps the last valid design until validation passes.',
    },
  ]
}

export function getYamlStatusMessages(source: string): StatusMessage[] {
  return yamlLintDiagnosticsToStatusMessages(lintYamlDocument(source))
}
