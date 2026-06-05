import type { HaMockContext } from '../../core'
import { MOCK_STATES_STORAGE_KEY } from './keys'

export const DEFAULT_MOCK_STATES: HaMockContext['states'] = {
  'sensor.temperature': '21.5',
  'binary_sensor.door': 'off',
}

function isMockStateValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isEntityId(value: string): boolean {
  return /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(value)
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

export function readMockStates(): HaMockContext['states'] {
  try {
    const stored = localStorage.getItem(MOCK_STATES_STORAGE_KEY)
    if (!stored) {
      return { ...DEFAULT_MOCK_STATES }
    }
    const parsed = parseMockStates(JSON.parse(stored))
    return parsed ?? { ...DEFAULT_MOCK_STATES }
  } catch {
    return { ...DEFAULT_MOCK_STATES }
  }
}

export function writeMockStates(states: HaMockContext['states']): void {
  try {
    localStorage.setItem(MOCK_STATES_STORAGE_KEY, JSON.stringify(states))
  } catch {
    // ignore quota / private mode
  }
}
