import { readVariablesFromDb, writeVariablesToDb, type StoredVariables } from '../../storage'
import { SHOWCASE_VARIABLES } from '../data/showcase'

/** A variable name must be a bare identifier so `{{ name }}` resolves in Jinja. */
export function isValidVariableName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name)
}

export function parseVariables(raw: unknown): StoredVariables | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const variables: StoredVariables = {}
  for (const [name, value] of Object.entries(raw)) {
    if (!isValidVariableName(name) || typeof value !== 'string') {
      continue
    }
    variables[name] = value
  }

  return Object.keys(variables).length > 0 ? variables : null
}

export async function readVariables(): Promise<StoredVariables> {
  const stored = await readVariablesFromDb()
  return stored ?? { ...SHOWCASE_VARIABLES }
}

export async function writeVariables(variables: StoredVariables): Promise<void> {
  await writeVariablesToDb(variables)
}
