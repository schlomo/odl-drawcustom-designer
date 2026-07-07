import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { APP_SLUG } from '../../src/core'
import { ensureDbReady, DesignerDatabase, resetDbReadyForTests } from '../../src/storage/db'
import {
  readVariablesFromDb,
  writeVariablesToDb,
  flushVariableWrites,
} from '../../src/storage'
import { SHOWCASE_VARIABLES } from '../../src/ui/data/showcase'
import {
  parseVariables,
  readVariables,
  writeVariables,
} from '../../src/ui/preferences/variables'

describe('variable storage', () => {
  it('round-trips user variables globally in IndexedDB', async () => {
    await writeVariablesToDb({ uv_fill: 'green', label: '{{ states("sensor.x") }}' })

    expect(await readVariablesFromDb()).toEqual({
      uv_fill: 'green',
      label: '{{ states("sensor.x") }}',
    })
  })

  it('replaces the full variable map on write', async () => {
    await writeVariablesToDb({ a: '1', b: '2' })
    await writeVariablesToDb({ c: '3' })

    expect(await readVariablesFromDb()).toEqual({ c: '3' })
  })

  it('returns null when no variables are stored', async () => {
    expect(await readVariablesFromDb()).toBeNull()
  })

  it('readVariables returns the seeded showcase defaults when IndexedDB is empty', async () => {
    expect(await readVariables()).toEqual(SHOWCASE_VARIABLES)
  })

  it('writeVariables persists through the UI adapter', async () => {
    await writeVariables({ door: 'open' })
    expect(await readVariables()).toEqual({ door: 'open' })
  })

  it('handles overlapping writes without ConstraintError', async () => {
    await Promise.all([
      writeVariablesToDb({ a: '1', b: '2' }),
      writeVariablesToDb({ a: '9', b: '8' }),
    ])
    await flushVariableWrites()

    expect(await readVariablesFromDb()).toEqual({ a: '9', b: '8' })
  })

  it('ignores invalid names and non-string values when parsing', () => {
    expect(
      parseVariables({
        'bad name': 'x',
        good: 'fine',
        numeric: 42,
      }),
    ).toEqual({ good: 'fine' })
  })
})

describe('variable storage — legacy migration', () => {
  let dbName = ''

  afterEach(async () => {
    resetDbReadyForTests(dbName)
    await Dexie.delete(dbName)
  })

  it('adds the variables store while preserving existing v3 mocks/assets', async () => {
    dbName = `${APP_SLUG}-vars-upgrade-${crypto.randomUUID()}`
    const v3 = new Dexie(dbName)
    v3.version(3).stores({ assets: 'key', mocks: 'entityId', session: 'id' })
    await v3.open()
    await v3.table('mocks').put({ entityId: 'sensor.temp', value: '20' })
    await v3.close()

    const upgraded = new DesignerDatabase(dbName)
    await ensureDbReady(upgraded)

    // Legacy mock survives BOTH the v4 attributes upgrade (#9, defaults
    // `attributes: {}`) and the additive v5 variables store (PR #8).
    expect(await upgraded.mocks.get('sensor.temp')).toEqual({
      entityId: 'sensor.temp',
      value: '20',
      attributes: {},
    })
    expect(await upgraded.variables.count()).toBe(0)
    await upgraded.variables.put({ name: 'uv_fill', value: 'green' })
    expect(await upgraded.variables.get('uv_fill')).toEqual({ name: 'uv_fill', value: 'green' })
    await upgraded.close()
  })
})
