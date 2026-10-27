import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { JINJA_DELIMITER_INSERTS, jinjaDelimiterOpenTransaction } from './jinjaBracketHandling'
import { isAtJinjaTemplateStart, isAtLoneOpenBrace, isInsideJinjaTemplate } from './jinjaContext'
import type { EntityCompletionEntry } from './yamlEntityIds'

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
      // `userEvent` is required: the editor's update listener
      // (shouldReportYamlDocChange) only reports annotated transactions to
      // React, so an unannotated completion apply would leave yamlText —
      // and everything derived from it (elements sync, lint banner, the
      // #35 blocked state) — frozen at the pre-completion document.
      userEvent: 'input.complete',
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
      // `userEvent` is required: the editor's update listener
      // (shouldReportYamlDocChange) only reports annotated transactions to
      // React, so an unannotated completion apply would leave yamlText —
      // and everything derived from it (elements sync, lint banner, the
      // #35 blocked state) — frozen at the pre-completion document.
      userEvent: 'input.complete',
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
    label: 'is_state_attr',
    type: 'function',
    detail: "is_state_attr('entity_id', 'attribute', value)",
    apply: applyExpression("is_state_attr('', '', '')"),
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

export const HA_STRFTIME_FORMAT_COMPLETIONS: Completion[] = [
  { label: '%Y', type: 'constant', detail: 'year (2026)' },
  { label: '%m', type: 'constant', detail: 'month (01–12)' },
  { label: '%d', type: 'constant', detail: 'day (01–31)' },
  { label: '%H', type: 'constant', detail: 'hour (00–23)' },
  { label: '%M', type: 'constant', detail: 'minute (00–59)' },
  { label: '%S', type: 'constant', detail: 'second (00–59)' },
]

export const HA_FILTER_COMPLETIONS: Completion[] = [
  { label: 'float', type: 'keyword', detail: '|float' },
  { label: 'int', type: 'keyword', detail: '|int' },
  { label: 'round', type: 'keyword', detail: '|round(0)' },
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

type JinjaCompletionKind =
  | 'delimiter'
  | 'expression'
  | 'filter'
  | 'entity-id'
  | 'now-method'
  | 'strftime-format'
  | 'tag'

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

/**
 * True when the cursor sits at a function-call argument boundary inside `{{ }}`
 * — immediately after `(` or a `,` (whitespace allowed). Lets expression
 * completions fire inside calls like `iif( … )` without a typed prefix.
 */
function isAtCallArgumentBoundary(slice: string): boolean {
  return /[(,]\s*$/.test(slice)
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

function matchStrftimeFormatContext(slice: string, pos: number): { from: number; prefix: string } | null {
  const strftimeMatch = slice.match(/strftime\s*\(\s*['"]([^'"]*)$/)
  if (!strftimeMatch) {
    return null
  }

  const formatTail = strftimeMatch[1] ?? ''
  const lastPercent = formatTail.lastIndexOf('%')
  if (lastPercent === -1) {
    return null
  }

  const prefix = formatTail.slice(lastPercent + 1)
  return { from: pos - prefix.length - 1, prefix }
}

/**
 * Fragment grammar inside a QUOTED entity argument: friendly-name queries
 * (issue #170) legitimately contain spaces, hyphens and non-ASCII letters
 * (`garage en` → "Garage Entrance", `kü` → "Küche Temperatur"), so the
 * fragment is any run of Unicode letters/digits plus `_ . - ` and space —
 * stopping at the quote characters, which end the argument. Bare (unquoted)
 * contexts keep the strict `[\w.]` word grammar via `context.matchBefore`.
 */
function matchEntityIdQuote(slice: string): string | null {
  const patterns = [
    /(?:states|state_attr|is_state_attr)\s*\(\s*['"]([\p{L}\p{N}_. -]*)$/u,
    /is_state\s*\(\s*['"]([\p{L}\p{N}_. -]*)$/u,
    /is_state\s*\(\s*['"][^'"]*['"]\s*,\s*['"]([\p{L}\p{N}_. -]*)$/u,
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

  const strftimeFormat = matchStrftimeFormatContext(slice, context.pos)
  if (strftimeFormat !== null) {
    return {
      kind: 'strftime-format',
      from: strftimeFormat.from,
      prefix: strftimeFormat.prefix,
    }
  }

  // Quoted entity fragments bypass the ASCII-word gate below: a friendly-name
  // query may hold spaces or non-ASCII letters that `matchBefore(/[\w.]*/)`
  // cannot see (`kü` matches no \w word at all). A non-empty fragment is
  // deliberate typing inside the argument quotes, so it completes
  // automatically; an empty one still needs an explicit request, as before.
  // `from` spans the WHOLE fragment — accepting a suggestion must replace
  // `garage en`, not leave `garage ` behind and insert the id after it.
  const entityPrefix = matchEntityIdQuote(slice)
  if (entityPrefix !== null && (entityPrefix.length > 0 || context.explicit)) {
    return { kind: 'entity-id', from: context.pos - entityPrefix.length, prefix: entityPrefix }
  }

  const word = context.matchBefore(/[\w.]*/)
  const hasWord = Boolean(word && word.text.length > 0)
  if (
    !hasWord &&
    !context.explicit &&
    !isAtJinjaTemplateStart(context) &&
    !isAtCallArgumentBoundary(slice)
  ) {
    return null
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

function filterStrftimeFormatCompletions(prefix: string): Completion[] {
  if (!prefix) {
    return HA_STRFTIME_FORMAT_COMPLETIONS
  }
  return HA_STRFTIME_FORMAT_COMPLETIONS.filter((option) => option.label.slice(1).startsWith(prefix))
}

/**
 * Best match rank of `query` inside `haystack` (both lowercased):
 * 0 = prefix, 1 = token start (after `.`/`_`/space/`-`), 2 = substring,
 * null = no match. Scans every occurrence — the first one is not always the
 * best-ranked one (`attempt_temperature` for `temp`).
 */
function entityMatchRank(haystack: string, query: string): number | null {
  let best: number | null = null
  for (let index = haystack.indexOf(query); index >= 0; index = haystack.indexOf(query, index + 1)) {
    const rank = index === 0 ? 0 : /[._\s-]/.test(haystack[index - 1]!) ? 1 : 2
    best = best === null ? rank : Math.min(best, rank)
    if (best === 0) {
      break
    }
  }
  return best
}

function bestHaystackRank(haystacks: readonly string[], needle: string): number | null {
  return haystacks
    .map((haystack) => entityMatchRank(haystack, needle))
    .reduce<number | null>(
      (best, current) =>
        current === null ? best : best === null ? current : Math.min(best, current),
      null,
    )
}

// A contiguous whole-query match always outranks a word-split one; 3 is one
// past the worst contiguous rank (2, plain mid-word substring).
const WORD_SPLIT_RANK_OFFSET = 3

/**
 * Rank one entry against the query. A contiguous substring match wins; failing
 * that, a query containing whitespace matches when EVERY word matches
 * independently, each against the id or the friendly name — `liv temp` finds
 * "Living Room Temperature" — ranked after all contiguous matches.
 */
function entityEntryRank(haystacks: readonly string[], needle: string): number | null {
  const contiguous = bestHaystackRank(haystacks, needle)
  if (contiguous !== null) {
    return contiguous
  }
  const words = needle.split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0 || (words.length === 1 && words[0] === needle)) {
    return null
  }
  let sum = 0
  for (const word of words) {
    const rank = bestHaystackRank(haystacks, word)
    if (rank === null) {
      return null
    }
    sum += rank
  }
  return WORD_SPLIT_RANK_OFFSET + sum
}

/**
 * Entity completions for a typed fragment (issue #170): substring matching,
 * case-insensitive, against the entity id AND the friendly name; ranked
 * prefix → token start → substring → word-split multi-word match, ties broken
 * alphabetically by id.
 */
export function matchEntityCompletions(
  entities: readonly EntityCompletionEntry[],
  query: string,
): Completion[] {
  const needle = query.toLowerCase()

  const ranked: Array<{ entry: EntityCompletionEntry; rank: number }> = []
  for (const entry of entities) {
    const haystacks = [entry.id.toLowerCase(), (entry.name ?? '').toLowerCase()]
    const rank = needle.length === 0 ? 0 : entityEntryRank(haystacks, needle)
    if (rank !== null) {
      ranked.push({ entry, rank })
    }
  }

  ranked.sort((a, b) => a.rank - b.rank || a.entry.id.localeCompare(b.entry.id))

  return ranked.map(({ entry }) => ({
    label: entry.id,
    type: 'variable',
    detail: entry.name ?? 'entity',
  }))
}

export function haJinjaCompletionSource(entities: readonly EntityCompletionEntry[]) {
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
        options = matchEntityCompletions(entities, resolved.prefix)
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
      case 'strftime-format':
        options = filterStrftimeFormatCompletions(resolved.prefix)
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

    if (resolved.kind === 'entity-id') {
      // Our matcher already filtered AND ranked (id + friendly name,
      // issue #170). CodeMirror's own label matcher would drop a
      // friendly-name-only match (the label is the id), so it is disabled;
      // no `validFor` means every keystroke re-runs the source for a fresh
      // ranking instead of letting CM re-filter a stale list.
      return {
        from: resolved.from,
        options,
        filter: false,
      }
    }

    const validFor =
      resolved.kind === 'delimiter'
        ? /^[%{]*$/
        : resolved.kind === 'tag'
          ? /^[\w]*$/
          : resolved.kind === 'strftime-format'
            ? /^%?[A-Za-z%]*$/
            : /^[\w.]*$/

    return {
      from: resolved.from,
      options,
      validFor,
    }
  }
}
