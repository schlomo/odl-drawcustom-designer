import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { haJinjaCompletionSource } from './jinjaCompletions'
import { yamlEntityIdsFacet } from './yamlEntityIds'
import type { YamlCompletionContext } from './yamlCompletions'
import {
  completionsFromContext,
  inferCurrentElementType,
  resolveYamlCompletionContext,
} from './yamlCompletions'

export function lineTextBeforeCursor(context: CompletionContext): string {
  const line = context.state.doc.lineAt(context.pos)
  const offsetInLine = context.pos - line.from
  const lineBefore = line.text.slice(0, offsetInLine)

  if (lineBefore.length === 0 && offsetInLine === 0 && /^\s*-/.test(line.text)) {
    return line.text
  }

  return lineBefore
}

export function completionInsertFrom(
  context: CompletionContext,
  lineBefore: string,
  completionContext: YamlCompletionContext,
): number {
  const line = context.state.doc.lineAt(context.pos)

  if (completionContext.kind === 'element-type') {
    const typeMatch = lineBefore.match(/^(.*?\btype:\s*)(\w*)$/)
    if (typeMatch) {
      return line.from + typeMatch[1]!.length
    }
  }

  if (completionContext.kind === 'list-item-key') {
    const keyMatch = lineBefore.match(/^(-\s*)(\w*)$/)
    if (keyMatch) {
      return line.from + keyMatch[1]!.length
    }
  }

  if (completionContext.kind === 'enum') {
    const enumMatch = lineBefore.match(
      /^(\s+(?:color|fill|outline|background|line_color|label_color|bgcolor|direction|resize_method):\s*"?)(\w*)$/,
    )
    if (enumMatch) {
      return line.from + enumMatch[1]!.length
    }
  }

  const word = context.matchBefore(/[\w-]*/)
  return word?.from ?? context.pos
}

export function yamlSchemaCompletionSource(context: CompletionContext): CompletionResult | null {
  const lineBefore = lineTextBeforeCursor(context)
  const elementType = inferCurrentElementType(context.state.doc.toString(), context.pos)
  const completionContext = resolveYamlCompletionContext(lineBefore, elementType)

  if (!completionContext) {
    return null
  }

  const from = completionInsertFrom(context, lineBefore, completionContext)

  return {
    from,
    options: completionsFromContext(completionContext),
    validFor: /^[\w-]*$/,
  }
}

export function yamlEditorAutocompletion() {
  return autocompletion({
    override: [
      (context) => haJinjaCompletionSource(context.state.facet(yamlEntityIdsFacet))(context),
      yamlSchemaCompletionSource,
    ],
    activateOnTyping: true,
    aboveCursor: false,
    maxRenderedOptions: 50,
  })
}
