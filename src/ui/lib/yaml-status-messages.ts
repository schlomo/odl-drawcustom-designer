import {
  getYamlElementsParseIssues,
  summarizeYamlElementsParseIssues,
  type YamlElementsParseIssue,
} from '../editor/yamlElementsSync'
import type { StatusMessage } from './status-messages'

export function yamlIssuesToStatusMessages(issues: YamlElementsParseIssue[]): StatusMessage[] {
  const summary = summarizeYamlElementsParseIssues(issues)
  if (!summary) {
    return []
  }

  return [
    {
      severity: 'error',
      title: 'YAML not applied to canvas',
      summary,
      detail:
        'Fix the highlighted issue in the editor below (red underline). The canvas keeps the last valid design until validation passes.',
    },
  ]
}

export function getYamlStatusMessages(source: string): StatusMessage[] {
  return yamlIssuesToStatusMessages(getYamlElementsParseIssues(source))
}
