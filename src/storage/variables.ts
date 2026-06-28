import { db, ensureDbReady } from './db'
import type { StoredVariable } from './types'

/** User-defined template variables: name → string value (may be a template). */
export type StoredVariables = Record<string, string>

/** Serializes variable writes — overlapping clear+bulkPut races otherwise. */
let variableWriteChain: Promise<void> = Promise.resolve()

export async function readVariablesFromDb(): Promise<StoredVariables | null> {
  await ensureDbReady()
  const rows = await db.variables.toArray()
  if (rows.length === 0) {
    return null
  }

  const variables: StoredVariables = {}
  for (const row of rows) {
    if (typeof row.value === 'string') {
      variables[row.name] = row.value
    }
  }
  return variables
}

export async function writeVariablesToDb(variables: StoredVariables): Promise<void> {
  await ensureDbReady()
  const rows: StoredVariable[] = Object.entries(variables)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([name, value]) => ({ name, value }))

  variableWriteChain = variableWriteChain.then(() =>
    db.transaction('rw', db.variables, async () => {
      await db.variables.clear()
      if (rows.length > 0) {
        await db.variables.bulkPut(rows)
      }
    }),
  )

  return variableWriteChain
}

/** Test helper — wait until queued variable writes finish. */
export async function flushVariableWrites(): Promise<void> {
  await variableWriteChain
}
