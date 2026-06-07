import Dexie, { type Table } from 'dexie'
import type { ProjectSnapshot, StoredAsset, StoredMock } from './types'

export class OeplDatabase extends Dexie {
  assets!: Table<StoredAsset, string>
  mocks!: Table<StoredMock, [string, string]>
  projects!: Table<ProjectSnapshot, string>

  constructor(name = 'oepl-designer') {
    super(name)
    this.version(1).stores({
      assets: 'key',
      mocks: '[projectId+entityId], projectId',
      projects: 'id, updatedAt',
    })
  }
}

export const db = new OeplDatabase()

/** Clears all stores — for tests and dev resets. */
export async function clearAllStores(): Promise<void> {
  await db.assets.clear()
  await db.mocks.clear()
  await db.projects.clear()
}
