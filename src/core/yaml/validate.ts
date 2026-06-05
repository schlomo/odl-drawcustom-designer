import type { ZodError } from 'zod'
import type { DrawElement } from '../schema/elements'
import { payloadSchema } from '../schema/payload'
import type { ServiceOptions } from '../schema/service'
import { serviceOptionsSchema } from '../schema/service'
import { stripDesignerFieldsFromPayload } from './designer-fields'

export interface ValidationResult {
  success: true
  data: DrawElement[]
}

export interface ValidationFailure {
  success: false
  error: ZodError
  issues: string[]
}

export type PayloadValidationResult = ValidationResult | ValidationFailure

export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'payload'
    return `${path}: ${issue.message}`
  })
}

export function validatePayload(elements: unknown): PayloadValidationResult {
  const cleaned = Array.isArray(elements)
    ? stripDesignerFieldsFromPayload(elements as Record<string, unknown>[])
    : elements

  const result = payloadSchema.safeParse(cleaned)
  if (result.success) {
    return { success: true, data: result.data }
  }

  return {
    success: false,
    error: result.error,
    issues: formatZodIssues(result.error),
  }
}

export function validateServiceOptions(options: unknown):
  | { success: true; data: ServiceOptions }
  | { success: false; error: ZodError; issues: string[] } {
  const result = serviceOptionsSchema.safeParse(options)
  if (result.success) {
    return { success: true, data: result.data }
  }

  return {
    success: false,
    error: result.error,
    issues: formatZodIssues(result.error),
  }
}
