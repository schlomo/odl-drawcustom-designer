import { linter, type Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { parseYamlPayload, validatePayload } from '../../core'
import { locateParseErrorInYaml, locateZodIssueInYaml } from './yamlIssueRanges'

export interface YamlLintDiagnostic {
  from: number
  to: number
  severity: Diagnostic['severity']
  message: string
}

function formatIssueMessage(path: PropertyKey[], message: string): string {
  const label = path.length > 0 ? path.join('.') : 'payload'
  return `${label}: ${message}`
}

export function lintYamlDocument(doc: string): YamlLintDiagnostic[] {
  if (!doc.trim()) {
    return []
  }

  let parsed: unknown
  try {
    parsed = parseYamlPayload(doc)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML'
    const range = locateParseErrorInYaml(doc, message)
    return [{ ...range, severity: 'error', message }]
  }

  const result = validatePayload(parsed)
  if (result.success) {
    return []
  }

  return result.error.issues.map((issue) => {
    const range = locateZodIssueInYaml(doc, issue)
    return {
      from: range.from,
      to: range.to,
      severity: 'error' as const,
      message: formatIssueMessage(issue.path, issue.message),
    }
  })
}

function diagnosticsFromSource(doc: string): Diagnostic[] {
  return lintYamlDocument(doc).map((diagnostic) => ({
    from: diagnostic.from,
    to: diagnostic.to,
    severity: diagnostic.severity,
    message: diagnostic.message,
    source: 'oepl-designer',
  }))
}

export function yamlPayloadLinter() {
  return linter((view: EditorView) => diagnosticsFromSource(view.state.doc.toString()), {
    delay: 0,
  })
}
