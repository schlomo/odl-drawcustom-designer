import { jinjaLanguage } from '@codemirror/lang-jinja'
import { yamlLanguage } from '@codemirror/lang-yaml'
import { LRLanguage, LanguageSupport } from '@codemirror/language'
import { parseMixed } from '@lezer/common'

const JINJA_STRING_NODES = new Set(['QuotedLiteral', 'Literal'])

const mixedYamlParser = yamlLanguage.parser.configure({
  wrap: parseMixed((node) => {
    if (JINJA_STRING_NODES.has(node.type.name)) {
      return { parser: jinjaLanguage.parser }
    }
    return null
  }),
})

const mixedYamlLanguage = LRLanguage.define({
  name: 'yaml',
  parser: mixedYamlParser,
})

export function yamlWithJinja(): LanguageSupport {
  return new LanguageSupport(mixedYamlLanguage)
}
