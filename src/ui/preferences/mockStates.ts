import type { HaMockContext } from '../../core'
import { readMocksFromDb, writeMocksToDb, type PersistedMockData } from '../../storage'
import { cloneShowcaseSimulator } from '../data/showcase'

/** Per-entity attribute map for the State Simulator (typed JSON values). */
export type MockEntityAttributes = Record<string, Record<string, unknown>>

/** Full mock model surfaced to the UI: entity state values + per-entity attributes. */
export interface MockData {
  states: HaMockContext['states']
  attributes: MockEntityAttributes
}

function isMockStateValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isEntityId(value: string): boolean {
  return /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(value)
}

function isAttributeMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseMockStates(raw: unknown): HaMockContext['states'] | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const states: HaMockContext['states'] = {}

  for (const [entityId, value] of Object.entries(raw)) {
    if (!isEntityId(entityId) || !isMockStateValue(value)) {
      continue
    }
    states[entityId] = value
  }

  return Object.keys(states).length > 0 ? states : null
}

export function parseMockAttributes(raw: unknown): MockEntityAttributes {
  if (!isAttributeMap(raw)) {
    return {}
  }

  const attributes: MockEntityAttributes = {}
  for (const [entityId, value] of Object.entries(raw)) {
    if (!isEntityId(entityId) || !isAttributeMap(value)) {
      continue
    }
    if (Object.keys(value).length > 0) {
      attributes[entityId] = { ...value }
    }
  }

  return attributes
}

function defaultMockData(): MockData {
  const seed = cloneShowcaseSimulator()
  return { states: seed.states, attributes: seed.attributes }
}

export async function readMockStates(): Promise<MockData> {
  const stored: PersistedMockData | null = await readMocksFromDb()
  if (!stored) {
    return defaultMockData()
  }
  return { states: stored.states, attributes: stored.attributes }
}

export async function writeMockStates(data: MockData): Promise<void> {
  await writeMocksToDb(data)
}
