import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { JINJA_DELIMITER_INSERTS, jinjaDelimiterOpenTransaction } from './jinjaBracketHandling'
import { isAtJinjaTemplateStart, isAtLoneOpenBrace, isInsideJinjaTemplate } from './jinjaContext'

function applyJinjaDelimiter(open: '{{' | '{%'): Completion['apply'] {
  return (view, _completion, from, to) => {
    const spec = jinjaDelimiterOpenTransaction(from, open)
    view.dispatch({
      ...spec,
      changes: { from, to, insert: JINJA_DELIMITER_INSERTS[open] },
    })
  }
}

export const HA_DELIMITER_COMPLETIONS: Completion[] = [
  {
    label: '{{',
    type: 'keyword',
    detail: 'expression',
    apply: applyJinjaDelimiter('{{'),
  },
  {
    label: '{%',
    type: 'keyword',
    detail: 'statement',
    apply: applyJinjaDelimiter('{%'),
  },
]

function applyJinjaSnippet(insert: string): Completion['apply'] {
  return (view, _completion, from, to) => {
    view.dispatch({
      changes: { from, to, insert },
      scrollIntoView: true,
    })
  }
}

function applyExpression(insert: string): Completion['apply'] {
  return (view, _completion, from, to) => {
    const replaced = view.state.doc.sliceString(from, to)
    let value = insert
    if (/^\s$/.test(replaced)) {
      value = ` ${insert} `
    } else if (replaced.length === 0 && view.state.doc.sliceString(from, from + 1) === ' ') {
      value = ` ${insert}`
    }
    view.dispatch({
      changes: { from, to, insert: value },
      scrollIntoView: true,
    })
  }
}

export const HA_EXPRESSION_COMPLETIONS: Completion[] = [
  {
    label: 'states',
    type: 'function',
    detail: "states('entity_id')",
    apply: applyExpression("states('')"),
  },
  {
    label: 'is_state',
    type: 'function',
    detail: "is_state('entity_id', 'state')",
    apply: applyExpression("is_state('', '')"),
  },
  {
    label: 'state_attr',
    type: 'function',
    detail: "state_attr('entity_id', 'attribute')",
    apply: applyExpression("state_attr('', '')"),
  },
  {
    label: 'float',
    type: 'function',
    detail: "float(states('entity_id'), default)",
    apply: applyExpression("float(states(''), 0)"),
  },
  {
    label: 'iif',
    type: 'function',
    detail: "iif(condition, if_true, if_false)",
    apply: applyExpression("iif(is_state('', 'on'), '', '')"),
  },
  {
    label: 'now',
    type: 'function',
    detail: "now().strftime('%H:%M')",
    apply: applyExpression("now().strftime('%H:%M')"),
  },
]

/** Methods on HA `now()` supported by template preview (`HaDateTime`). */
export const HA_NOW_METHOD_COMPLETIONS: Completion[] = [
  {
    label: 'strftime',
    type: 'function',
    detail: "strftime('%H:%M') — codes: %Y %m %d %H %M %S",
    apply: applyExpression("strftime('%H:%M')"),
  },
]

export const HA_FILTER_COMPLETIONS: Completion[] = [
  { label: 'float', type: 'keyword', detail: '|float' },
  { label: 'int', type: 'keyword', detail: '|int' },
]

/** Statement tags supported inside `{% … %}` in drawcustom template strings. */
const HA_TAG_SNIPPETS: Array<{ label: string; detail: string; insert: string }> = [
  { label: 'set', detail: '{% set name = value %}', insert: ' set name = value' },
  { label: 'if', detail: '{% if condition %}', insert: ' if condition' },
  { label: 'elif', detail: '{% elif condition %}', insert: ' elif condition' },
  { label: 'else', detail: '{% else %}', insert: ' else' },
  { label: 'endif', detail: '{% endif %}', insert: ' endif' },
  { label: 'for', detail: '{% for item in items %}', insert: ' for item in items' },
  { label: 'endfor', detail: '{% endfor %}', insert: ' endfor' },
]

export const HA_TAG_COMPLETIONS: Completion[] = HA_TAG_SNIPPETS.map((entry) => ({
  label: entry.label,
  type: 'keyword',
  detail: entry.detail,
  apply: applyJinjaSnippet(entry.insert),
}))

export function buildJinjaCompletionConfig(entityIds: readonly string[]) {
  return {
    entityIds,
    expressionCompletions: HA_EXPRESSION_COMPLETIONS,
    filterCompletions: HA_FILTER_COMPLETIONS,
    tagCompletions: HA_TAG_COMPLETIONS,
  }
}

type JinjaCompletionKind = 'delimiter' | 'expression' | 'filter' | 'entity-id' | 'now-method' | 'tag'

interface ResolvedJinjaContext {
  kind: JinjaCompletionKind
  from: number
  prefix: string
}

function jinjaSliceBefore(context: CompletionContext): string {
  const doc = context.state.sliceDoc(0, context.pos)
  const open = Math.max(doc.lastIndexOf('{{'), doc.lastIndexOf('{%'))
  if (open < 0) {
    return doc
  }
  return doc.slice(open, context.pos)
}

function isFilterContext(slice: string): boolean {
  return /\|(?:\s*[\w.]*)$/.test(slice)
}

function isTagContext(context: CompletionContext): boolean {
  const doc = context.state.sliceDoc(0, context.pos)
  const tagOpen = doc.lastIndexOf('{%')
  const interpOpen = doc.lastIndexOf('{{')
  return tagOpen > interpOpen
}

function tagOpenOffset(context: CompletionContext): number {
  const doc = context.state.sliceDoc(0, context.pos)
  return doc.lastIndexOf('{%')
}

function tagCompletionFrom(context: CompletionContext, slice: string): number {
  const open = tagOpenOffset(context)
  if (open < 0) {
    return context.pos
  }

  const word = context.matchBefore(/[\w]*/)
  if (word && word.text.length > 0) {
    return word.from
  }

  const interior = slice.slice(2)
  const leadingSpace = interior.match(/^\s*/)?.[0]?.length ?? 0
  return open + 2 + leadingSpace
}

function tagKeywordPrefix(slice: string): string {
  const match = slice.match(/^\{%\s*(\w*)$/)
  return match?.[1] ?? ''
}

function matchNowMethodContext(slice: string, pos: number): { from: number; prefix: string } | null {
  const match = slice.match(/now\(\)\.(\w*)$/)
  if (!match) {
    return null
  }
  const prefix = match[1] ?? ''
  return { from: pos - prefix.length, prefix }
}

function matchEntityIdQuote(slice: string): string | null {
  const patterns = [
    /(?:states|state_attr)\s*\(\s*['"]([\w.]*)$/,
    /is_state\s*\(\s*['"]([\w.]*)$/,
    /is_state\s*\(\s*['"][^'"]*['"]\s*,\s*['"]([\w.]*)$/,
  ]

  for (const pattern of patterns) {
    const match = slice.match(pattern)
    if (match) {
      return match[1] ?? ''
    }
  }

  return null
}

export function resolveJinjaCompletionContext(context: CompletionContext): ResolvedJinjaContext | null {
  if (isAtLoneOpenBrace(context)) {
    return { kind: 'delimiter', from: context.pos, prefix: '' }
  }

  if (!isInsideJinjaTemplate(context)) {
    return null
  }

  const slice = jinjaSliceBefore(context)
  const word = context.matchBefore(/[\w.]*/)
  const hasWord = Boolean(word && word.text.length > 0)
  if (!hasWord && !context.explicit && !isAtJinjaTemplateStart(context)) {
    return null
  }

  const entityPrefix = matchEntityIdQuote(slice)
  if (entityPrefix !== null) {
    return { kind: 'entity-id', from: word?.from ?? context.pos, prefix: entityPrefix }
  }

  const nowMethod = matchNowMethodContext(slice, context.pos)
  if (nowMethod !== null) {
    return { kind: 'now-method', from: nowMethod.from, prefix: nowMethod.prefix }
  }

  if (isFilterContext(slice)) {
    return { kind: 'filter', from: word?.from ?? context.pos, prefix: word?.text ?? '' }
  }

  if (isTagContext(context)) {
    const from = tagCompletionFrom(context, slice)
    const prefix = hasWord ? (word?.text ?? '') : tagKeywordPrefix(slice)
    return { kind: 'tag', from, prefix }
  }

  return { kind: 'expression', from: word?.from ?? context.pos, prefix: word?.text ?? '' }
}

function filterByPrefix(options: Completion[], prefix: string): Completion[] {
  if (!prefix) {
    return options
  }
  return options.filter((option) => option.label.startsWith(prefix))
}

function entityIdCompletions(entityIds: readonly string[], prefix: string): Completion[] {
  return filterByPrefix(
    entityIds.map((entityId) => ({
      label: entityId,
      type: 'variable',
      detail: 'entity',
    })),
    prefix,
  )
}

export function haJinjaCompletionSource(entityIds: readonly string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const resolved = resolveJinjaCompletionContext(context)
    if (!resolved) {
      return null
    }

    let options: Completion[]
    switch (resolved.kind) {
      case 'delimiter':
        options = HA_DELIMITER_COMPLETIONS
        break
      case 'entity-id':
        options = entityIdCompletions(entityIds, resolved.prefix)
        break
      case 'filter':
        options = filterByPrefix(HA_FILTER_COMPLETIONS, resolved.prefix)
        break
      case 'tag':
        options = filterByPrefix(HA_TAG_COMPLETIONS, resolved.prefix)
        break
      case 'now-method':
        options = filterByPrefix(HA_NOW_METHOD_COMPLETIONS, resolved.prefix)
        break
      case 'expression':
        options = filterByPrefix(HA_EXPRESSION_COMPLETIONS, resolved.prefix)
        break
      default:
        options = []
    }

    if (options.length === 0) {
      return null
    }

    const validFor =
      resolved.kind === 'delimiter'
        ? /^[%{]*$/
        : resolved.kind === 'tag'
          ? /^[\w]*$/
          : /^[\w.]*$/

    return {
      from: resolved.from,
      options,
      validFor,
    }
  }
}
