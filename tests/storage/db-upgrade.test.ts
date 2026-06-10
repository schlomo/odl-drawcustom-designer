import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureDbReady, DesignerDatabase, resetDbReadyForTests } from '../../src/storage/db'
import { APP_SLUG } from '../../src/core'

function legacyV1Database(name: string): Dexie {
  const legacy = new Dexie(name)
  legacy.version(1).stores({
    assets: 'key',
    mocks: '[projectId+entityId], projectId',
    projects: 'id, updatedAt',
  })
  return legacy
}

describe('Dexie schema upgrade', () => {
  let dbName = ''

  afterEach(async () => {
    resetDbReadyForTests(dbName)
    await Dexie.delete(dbName)
    vi.restoreAllMocks()
  })

  it('opens after legacy v1 schema and preserves global assets', async () => {
    dbName = `${APP_SLUG}-upgrade-${crypto.randomUUID()}`
    const legacy = legacyV1Database(dbName)
    await legacy.open()
    const blob = new Blob(['legacy-png'], { type: 'image/png' })
    await legacy.table('assets').put({
      key: '/local/legacy.png',
      blob,
      mime: 'image/png',
      updatedAt: 1,
    })
    await legacy.table('mocks').put({
      projectId: 'project-a',
      entityId: 'sensor.temp',
      value: '20',
    })
    await legacy.close()

    const upgraded = new DesignerDatabase(dbName)
    await ensureDbReady(upgraded)

    const stored = await upgraded.assets.get('/local/legacy.png')
    expect(stored?.mime).toBe('image/png')
    expect(await stored?.blob.text()).toBe('legacy-png')
    expect(await upgraded.mocks.count()).toBe(0)
    expect(upgraded.tables.map((table) => table.name).sort()).toEqual(['assets', 'mocks', 'session'])
    await upgraded.close()
  })

  it('deletes and reopens when the first open throws UpgradeError', async () => {
    dbName = `${APP_SLUG}-recover-${crypto.randomUUID()}`
    const database = new DesignerDatabase(dbName)
    let openAttempts = 0

    vi.spyOn(database, 'open').mockImplementation(function (this: DesignerDatabase, ...args) {
      openAttempts += 1
      if (openAttempts === 1) {
        return Promise.reject(new Dexie.UpgradeError('Not yet support for changing primary key'))
      }
      return Dexie.prototype.open.apply(this, args)
    })
    vi.spyOn(database, 'delete').mockImplementation(function (this: DesignerDatabase, ...args) {
      return Dexie.prototype.delete.apply(this, args)
    })

    await ensureDbReady(database)

    expect(openAttempts).toBe(2)
    expect(database.delete).toHaveBeenCalledOnce()
    await database.assets.put({
      key: '/local/recovered.png',
      blob: new Blob(['ok']),
      mime: 'image/png',
      updatedAt: Date.now(),
    })
    expect(await database.assets.get('/local/recovered.png')).toBeDefined()
    await database.close()
  })
})
