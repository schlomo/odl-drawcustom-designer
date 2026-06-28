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
