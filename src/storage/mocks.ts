import type { HaMockContext } from '../core/templates/types'
import { db, ensureDbReady } from './db'
import type { StoredMock } from './types'

function isMockStateValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/** Serializes mock writes — overlapping delete+bulkAdd caused ConstraintError on bulkAdd. */
let mockWriteChain: Promise<void> = Promise.resolve()

export async function readMocksFromDb(): Promise<HaMockContext['states'] | null> {
  await ensureDbReady()
  const rows = await db.mocks.toArray()
  if (rows.length === 0) {
    return null
  }

  const states: HaMockContext['states'] = {}
  for (const row of rows) {
    states[row.entityId] = row.value
  }
  return states
}

export async function writeMocksToDb(states: HaMockContext['states']): Promise<void> {
  await ensureDbReady()
  const rows: StoredMock[] = Object.entries(states)
    .filter((entry): entry is [string, string | number | boolean] =>
      isMockStateValue(entry[1]),
    )
    .map(([entityId, value]) => ({ entityId, value }))

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
