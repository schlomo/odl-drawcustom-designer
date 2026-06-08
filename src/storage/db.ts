import Dexie, { type Table } from 'dexie'
import type { SessionSnapshot, StoredAsset, StoredMock } from './types'

function isRecoverableOpenError(error: unknown): boolean {
  if (!(error instanceof Dexie.DexieError)) {
    return false
  }
  const name = error.name
  return name === 'UpgradeError' || name === 'DatabaseClosedError' || name === 'VersionError'
}

export class OeplDatabase extends Dexie {
  assets!: Table<StoredAsset, string>
  mocks!: Table<StoredMock, string>
  session!: Table<SessionSnapshot, string>

  constructor(name = 'oepl-designer') {
    super(name)
    this.version(1).stores({
      assets: 'key',
      mocks: '[projectId+entityId], projectId',
      projects: 'id, updatedAt',
    })
    // Dexie cannot change a store primary key in-place — drop legacy stores first.
    this.version(2).stores({
      assets: 'key',
      mocks: null,
      projects: null,
    })
    this.version(3).stores({
      assets: 'key',
      mocks: 'entityId',
      session: 'id',
    })
  }
}

export const db = new OeplDatabase()

const readyByName = new Map<string, Promise<void>>()

/** Opens IndexedDB; on unrecoverable upgrade errors, wipes and reopens (ADR-003 no-migration policy). */
export async function ensureDbReady(database: OeplDatabase = db): Promise<void> {
  const existing = readyByName.get(database.name)
  if (existing) {
    return existing
  }

  const opening = openWithRecovery(database)
  readyByName.set(database.name, opening)
  try {
    await opening
  } catch (error) {
    readyByName.delete(database.name)
    throw error
  }
}

async function openWithRecovery(database: OeplDatabase): Promise<void> {
  try {
    await database.open()
  } catch (error) {
    if (!isRecoverableOpenError(error)) {
      throw error
    }
    readyByName.delete(database.name)
    await database.delete()
    await database.open()
    readyByName.set(database.name, Promise.resolve())
  }
}

/** Clears all stores — for tests and dev resets. */
export async function clearAllStores(): Promise<void> {
  await ensureDbReady()
  await db.assets.clear()
  await db.mocks.clear()
  await db.session.clear()
}

/** @internal Test-only — reset cached open promises. */
export function resetDbReadyForTests(name?: string): void {
  if (name) {
    readyByName.delete(name)
    return
  }
  readyByName.clear()
}
