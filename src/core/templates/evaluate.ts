import nunjucks from 'nunjucks'
import type { HaMockContext } from './types'

let jinjaCompatInstalled = false

function ensureJinjaCompat(): void {
  if (jinjaCompatInstalled) {
    return
  }
  nunjucks.installJinjaCompat()
  jinjaCompatInstalled = true
}

function getStateValue(context: HaMockContext, entityId: string): string {
  const value = context.states[entityId]
  if (value === undefined) {
    return 'unknown'
  }
  return String(value)
}

function isEntityState(context: HaMockContext, entityId: string, state: string): boolean {
  return getStateValue(context, entityId).toLowerCase() === state.toLowerCase()
}

function createEnvironment(context: HaMockContext): nunjucks.Environment {
  ensureJinjaCompat()

  const env = new nunjucks.Environment(null, {
    autoescape: false,
    throwOnUndefined: false,
  })

  env.addGlobal('states', (entityId: string) => getStateValue(context, entityId))
  env.addGlobal('is_state', (entityId: string, state: string) =>
    isEntityState(context, entityId, state),
  )

  return env
}

export class TemplateEvaluationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'TemplateEvaluationError'
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

export function evaluateTemplate(template: string, context: HaMockContext): string {
  if (!template.includes('{{') && !template.includes('{%')) {
    return template
  }

  try {
    return createEnvironment(context).renderString(template, {})
  } catch (error) {
    throw new TemplateEvaluationError(
      error instanceof Error ? error.message : 'Template evaluation failed',
      error,
    )
  }
}
