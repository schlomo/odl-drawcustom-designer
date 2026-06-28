const MUSTACHE_BLOCK_RE = /\{\{[\s\S]*?\}\}/g
const TAG_BLOCK_RE = /\{%[\s\S]*?%\}/g
const TEMPLATE_SYNTAX_RE = /\{\{|\{%/

const ENTITY_ID_PATTERN = '[a-z_][a-z0-9_]*\\.[a-z0-9_]+'

const ATTRIBUTE_NAME_PATTERN = '[a-zA-Z_][a-zA-Z0-9_]*'

const ENTITY_HELPER_PATTERNS = [
  new RegExp(`states\\s*\\(\\s*['"](${ENTITY_ID_PATTERN})['"]`, 'g'),
  new RegExp(`is_state\\s*\\(\\s*['"](${ENTITY_ID_PATTERN})['"]`, 'g'),
  new RegExp(`state_attr\\s*\\(\\s*['"](${ENTITY_ID_PATTERN})['"]`, 'g'),
] as const

const ATTRIBUTE_REFERENCE_PATTERNS = [
  // state_attr('entity.id', 'attribute')
  new RegExp(
    `state_attr\\s*\\(\\s*['"](${ENTITY_ID_PATTERN})['"]\\s*,\\s*['"](${ATTRIBUTE_NAME_PATTERN})['"]`,
    'g',
  ),
  // states.<domain>.<object>.attributes.<attribute>
  new RegExp(
    `states\\.(${ENTITY_ID_PATTERN})\\.attributes\\.(${ATTRIBUTE_NAME_PATTERN})`,
    'g',
  ),
] as const

export interface AttributeReference {
  entityId: string
  attribute: string
}

/** HA template globals the designer registers — never user variables. */
const TEMPLATE_GLOBALS = new Set([
  'states',
  'is_state',
  'state_attr',
  'is_state_attr',
  'now',
  'float',
  'iif',
  'namespace',
])

/** Jinja/Python keywords & literals that look like identifiers but aren't variables. */
const JINJA_KEYWORDS = new Set([
  'if',
  'else',
  'elif',
  'endif',
  'for',
  'endfor',
  'in',
  'is',
  'not',
  'and',
  'or',
  'set',
  'endset',
  'none',
  'true',
  'false',
  'loop',
  'block',
  'endblock',
  'macro',
  'endmacro',
  'with',
  'endwith',
  'raw',
  'endraw',
  'filter',
  'endfilter',
  'do',
  'autoescape',
  'endautoescape',
  'recursive',
  'continue',
  'break',
  'as',
  'import',
  'from',
  'include',
  'extends',
  'call',
  'endcall',
])

const STRING_LITERAL_RE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g
const SET_TARGET_RE = /\{%-?\s*set\s+([A-Za-z_$][\w$]*)/g
const FOR_TARGET_RE = /\{%-?\s*for\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)\s+in\b/g
const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/g

export function hasTemplateSyntax(value: string): boolean {
  return TEMPLATE_SYNTAX_RE.test(value)
}

export function extractTemplateExpressions(value: string): string[] {
  const expressions: string[] = []

  for (const match of value.matchAll(MUSTACHE_BLOCK_RE)) {
    expressions.push(match[0])
  }
  for (const match of value.matchAll(TAG_BLOCK_RE)) {
    expressions.push(match[0])
  }

  return expressions
}

export function extractEntityIds(value: string): string[] {
  const entityIds = new Set<string>()

  for (const pattern of ENTITY_HELPER_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of value.matchAll(pattern)) {
      entityIds.add(match[1])
    }
  }

  return [...entityIds]
}

/**
 * Extract (entityId, attribute) pairs referenced via `state_attr('e','a')` or
 * dotted `states.<domain>.<object>.attributes.<attr>` access. Used to pre-fill
 * attribute rows in the State Simulator so users only enter values.
 */
export function extractAttributeReferences(value: string): AttributeReference[] {
  const seen = new Set<string>()
  const references: AttributeReference[] = []

  for (const pattern of ATTRIBUTE_REFERENCE_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of value.matchAll(pattern)) {
      const entityId = match[1]
      const attribute = match[2]
      const key = `${entityId}\u0000${attribute}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      references.push({ entityId, attribute })
    }
  }

  return references
}

/** Collect `{% set X %}` / `{% set X.y %}` and `{% for A, B in %}` local names. */
function collectLocalNames(value: string): Set<string> {
  const locals = new Set<string>()

  SET_TARGET_RE.lastIndex = 0
  for (const match of value.matchAll(SET_TARGET_RE)) {
    locals.add(match[1])
  }

  FOR_TARGET_RE.lastIndex = 0
  for (const match of value.matchAll(FOR_TARGET_RE)) {
    for (const name of match[1].split(',')) {
      locals.add(name.trim())
    }
  }

  return locals
}

/**
 * Extract bare variable references from a templated string — identifiers used as
 * `{{ name }}` or in expressions that are NOT HA globals, Jinja keywords,
 * function calls, filters, member/dotted access roots, entity-id string args, or
 * local `{% set %}` / `{% for %}` names within the same field. Used to pre-fill
 * empty-valued variable rows in the State Simulator (mirrors attribute pre-fill).
 */
export function extractVariableReferences(value: string): string[] {
  const locals = collectLocalNames(value)
  const found = new Set<string>()

  // Only scan inside template blocks; literal text outside {{ }}/{% %} is output.
  const blocks = [
    ...value.matchAll(MUSTACHE_BLOCK_RE),
    ...value.matchAll(TAG_BLOCK_RE),
  ].map((match) => match[0])

  for (const block of blocks) {
    // Drop string literals so entity ids / quoted text never count as variables.
    const cleaned = block.replace(STRING_LITERAL_RE, ' ')

    IDENTIFIER_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = IDENTIFIER_RE.exec(cleaned)) !== null) {
      const name = match[0]
      const start = match.index
      const end = start + name.length

      // Member access root (`a.b`) or preceded by `.` → not a scalar variable.
      const prevChar = cleaned[start - 1]
      if (prevChar === '.') {
        continue
      }
      const nextChar = cleaned[end]
      if (nextChar === '.') {
        continue
      }

      // Function call (`name(`) → a function/filter, not a variable.
      let after = end
      while (after < cleaned.length && /\s/.test(cleaned[after]!)) {
        after += 1
      }
      if (cleaned[after] === '(') {
        continue
      }

      // Filter application (`value | name`) → a filter, not a variable.
      let before = start - 1
      while (before >= 0 && /\s/.test(cleaned[before]!)) {
        before -= 1
      }
      if (cleaned[before] === '|') {
        continue
      }

      const lower = name.toLowerCase()
      if (TEMPLATE_GLOBALS.has(name) || JINJA_KEYWORDS.has(lower)) {
        continue
      }
      if (locals.has(name)) {
        continue
      }

      found.add(name)
    }
  }

  return [...found]
}

export function walkStringValues(
  value: unknown,
  path: string,
  visit: (raw: string, path: string) => void,
): void {
  if (typeof value === 'string') {
    visit(value, path)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkStringValues(item, `${path}[${index}]`, visit)
    })
    return
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = path ? `${path}.${key}` : key
      walkStringValues(nested, nestedPath, visit)
    }
  }
}
