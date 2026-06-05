const MUSTACHE_BLOCK_RE = /\{\{[\s\S]*?\}\}/g
const TAG_BLOCK_RE = /\{%[\s\S]*?%\}/g
const TEMPLATE_SYNTAX_RE = /\{\{|\{%/

const ENTITY_ID_PATTERN = '[a-z_][a-z0-9_]*\\.[a-z0-9_]+'

const ENTITY_HELPER_PATTERNS = [
  new RegExp(`states\\s*\\(\\s*['"](${ENTITY_ID_PATTERN})['"]`, 'g'),
  new RegExp(`is_state\\s*\\(\\s*['"](${ENTITY_ID_PATTERN})['"]`, 'g'),
  new RegExp(`state_attr\\s*\\(\\s*['"](${ENTITY_ID_PATTERN})['"]`, 'g'),
] as const

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
