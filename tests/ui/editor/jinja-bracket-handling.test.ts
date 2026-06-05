import { describe, expect, it } from 'vitest'
import {
  HA_DELIMITER_COMPLETIONS,
  HA_EXPRESSION_COMPLETIONS,
  HA_TAG_COMPLETIONS,
} from '../../../src/ui/editor/jinjaCompletions'
import {
  JINJA_DELIMITER_INSERTS,
  YAML_AUTO_CLOSE_BRACKETS,
  jinjaDelimiterOpenTransaction,
} from '../../../src/ui/editor/jinjaBracketHandling'

describe('yamlCloseBrackets config', () => {
  it('auto-closes quotes and parens but not curly braces', () => {
    expect(YAML_AUTO_CLOSE_BRACKETS).toEqual(['(', '[', "'", '"'])
  })
})

describe('jinjaDelimiterOpenTransaction', () => {
  it('scaffolds expression delimiters with closing braces', () => {
    const pos = 8
    expect(jinjaDelimiterOpenTransaction(pos, '{{')).toEqual({
      changes: { from: pos, insert: JINJA_DELIMITER_INSERTS['{{'] },
      selection: { anchor: pos + 1 },
      scrollIntoView: true,
      userEvent: 'input.type',
    })
  })

  it('scaffolds statement delimiters with closing tag', () => {
    const pos = 8
    expect(jinjaDelimiterOpenTransaction(pos, '{%')).toEqual({
      changes: { from: pos, insert: JINJA_DELIMITER_INSERTS['{%'] },
      selection: { anchor: pos + 1 },
      scrollIntoView: true,
      userEvent: 'input.type',
    })
  })
})

describe('jinja delimiter completion apply', () => {
  function applyCompletion(
    doc: string,
    completion: { apply?: unknown },
    from: number,
    to = from,
  ): string {
    let nextDoc = doc
    ;(completion.apply as (
      view: {
        state: { doc: { sliceString: (a: number, b: number) => string } }
        dispatch: (update: {
          changes: { from: number; to: number; insert: string }
          selection?: { anchor: number }
        }) => void
      },
      value: unknown,
      from: number,
      to: number,
    ) => void)(
      {
        state: {
          doc: {
            sliceString: (start: number, end: number) => doc.slice(start, end),
          },
        },
        dispatch: (update) => {
          const { from: changeFrom, to: changeTo, insert } = update.changes
          nextDoc = doc.slice(0, changeFrom) + insert + doc.slice(changeTo)
        },
      },
      completion,
      from,
      to,
    )
    return nextDoc
  }

  it('inserts {{ }} when choosing the expression delimiter', () => {
    const doc = '  x: 10 {'
    const from = doc.length
    const expression = HA_DELIMITER_COMPLETIONS.find((entry) => entry.label === '{{')
    expect(applyCompletion(doc, expression!, from)).toBe('  x: 10 {{ }}')
  })

  it('inserts {% %} when choosing the statement delimiter', () => {
    const doc = '  x: 10 {'
    const from = doc.length
    const statement = HA_DELIMITER_COMPLETIONS.find((entry) => entry.label === '{%')
    expect(applyCompletion(doc, statement!, from)).toBe('  x: 10 {% %}')
  })
})

describe('jinja expression completion apply', () => {
  it('keeps the scaffold space before }} when replacing the placeholder', () => {
    const doc = '  x: 10 {{ }}'
    const from = doc.indexOf('{{') + 2
    const to = from + 1
    let nextDoc = doc

    const states = HA_EXPRESSION_COMPLETIONS.find((entry) => entry.label === 'states')
    ;(states?.apply as (
      view: {
        state: { doc: { sliceString: (a: number, b: number) => string } }
        dispatch: (update: { changes: { from: number; to: number; insert: string } }) => void
      },
      completion: unknown,
      from: number,
      to: number,
    ) => void)(
      {
        state: {
          doc: {
            sliceString: (start: number, end: number) => doc.slice(start, end),
          },
        },
        dispatch: (update) => {
          const { from: changeFrom, to: changeTo, insert } = update.changes
          nextDoc = doc.slice(0, changeFrom) + insert + doc.slice(changeTo)
        },
      },
      states,
      from,
      to,
    )

    expect(nextDoc).toBe("  x: 10 {{ states('') }}")
  })

  it('adds a leading space when inserting at the scaffold placeholder', () => {
    const doc = '  x: 10 {{ }}'
    const from = doc.indexOf('{{') + 2
    let nextDoc = doc

    const states = HA_EXPRESSION_COMPLETIONS.find((entry) => entry.label === 'states')
    ;(states?.apply as (
      view: {
        state: { doc: { sliceString: (a: number, b: number) => string } }
        dispatch: (update: { changes: { from: number; to: number; insert: string } }) => void
      },
      completion: unknown,
      from: number,
      to: number,
    ) => void)(
      {
        state: {
          doc: {
            sliceString: (start: number, end: number) => doc.slice(start, end),
          },
        },
        dispatch: (update) => {
          const { from: changeFrom, to: changeTo, insert } = update.changes
          nextDoc = doc.slice(0, changeFrom) + insert + doc.slice(changeTo)
        },
      },
      states,
      from,
      from,
    )

    expect(nextDoc).toBe("  x: 10 {{ states('') }}")
  })
})

describe('jinja tag completion apply', () => {
  it('inserts statement bodies without a closing tag', () => {
    const doc = '  x: 10 {% %}'
    const from = doc.indexOf('{%') + 2
    let nextDoc = doc

    const setTag = HA_TAG_COMPLETIONS.find((entry) => entry.label === 'set')
    ;(setTag?.apply as (
      view: {
        dispatch: (update: { changes: { from: number; to: number; insert: string } }) => void
      },
      completion: unknown,
      from: number,
      to: number,
    ) => void)(
      {
        dispatch: (update) => {
          const { from: changeFrom, to: changeTo, insert } = update.changes
          nextDoc = doc.slice(0, changeFrom) + insert + doc.slice(changeTo)
        },
      },
      setTag,
      from,
      from,
    )

    expect(nextDoc).toBe('  x: 10 {% set name = value %}')
  })
})
