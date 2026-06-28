import type { HaMockContext } from '../core/templates/types'
import { db, ensureDbReady } from './db'
import type { StoredMock } from './types'

/** Persisted mock model — entity state values plus per-entity attribute maps. */
export interface PersistedMockData {
  states: HaMockContext['states']
  attributes: Record<string, Record<string, unknown>>
}

function isMockStateValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isAttributeMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Serializes mock writes — overlapping delete+bulkAdd caused ConstraintError on bulkAdd. */
let mockWriteChain: Promise<void> = Promise.resolve()

export async function readMocksFromDb(): Promise<PersistedMockData | null> {
  await ensureDbReady()
  const rows = await db.mocks.toArray()
  if (rows.length === 0) {
    return null
  }

  const states: HaMockContext['states'] = {}
  const attributes: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    states[row.entityId] = row.value
    // Legacy rows (pre-v4) have no `attributes`; only carry non-empty maps.
    if (isAttributeMap(row.attributes) && Object.keys(row.attributes).length > 0) {
      attributes[row.entityId] = { ...row.attributes }
    }
  }
  return { states, attributes }
}

export async function writeMocksToDb(data: PersistedMockData): Promise<void> {
  await ensureDbReady()
  const attributes = data.attributes ?? {}
  const rows: StoredMock[] = Object.entries(data.states)
    .filter((entry): entry is [string, string | number | boolean] =>
      isMockStateValue(entry[1]),
    )
    .map(([entityId, value]) => {
      const entityAttributes = attributes[entityId]
      const row: StoredMock = { entityId, value }
      if (isAttributeMap(entityAttributes) && Object.keys(entityAttributes).length > 0) {
        row.attributes = { ...entityAttributes }
      }
      return row
    })

  mockWriteChain = mockWriteChain.then(() =>
    db.transaction('rw', db.mocks, async () => {
      await db.mocks.clear()
      if (rows.length > 0) {
        await db.mocks.bulkPut(rows)
      }
    }),
  )

  return mockWriteChain
}

/** Test helper — wait until queued mock writes finish. */
export async function flushMockWrites(): Promise<void> {
  await mockWriteChain
}
