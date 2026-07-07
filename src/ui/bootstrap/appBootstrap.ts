import type { DrawElement, HaMockContext, ServiceOptions } from '../../core'
import {
  clearShareHashFromLocation,
  decodeShareHash,
  parseShareHashFromLocation,
  sharePayloadToBootstrap,
} from '../../share'
import {
  hydrateContentMapFromStorage,
  readSessionFromDb,
  type PersistedEditHistory,
  type SessionSnapshot,
} from '../../storage'
import type { StoredVariables } from '../../storage'
import {
  SHOWCASE_CANVAS,
  SHOWCASE_ELEMENTS,
  cloneShowcaseSimulator,
} from '../data/showcase'
import type { DisplayConfig } from '../preferences/displayConfig'
import { readMockStates, type MockData } from '../preferences/mockStates'
import { readVariables } from '../preferences/variables'
import { allowShowcaseBundledForDemo } from '../preferences/showcaseAsset'

export type BootstrapImportSource = 'hash' | 'session' | 'default'

export interface AppBootstrap {
  sessionName: string
  elements: DrawElement[]
  canvas: DisplayConfig
  service: ServiceOptions | undefined
  mockStates: HaMockContext['states']
  mockAttributes: NonNullable<HaMockContext['attributes']>
  variables: StoredVariables
  importSource: BootstrapImportSource
  /** Restored only for `importSource: 'session'`; cleared for hash/default loads. */
  editHistory?: PersistedEditHistory
}

/** Saved sessions with no elements fall back to the built-in sample dashboard. */
export function resolveElementsForLoad(session: SessionSnapshot | null): DrawElement[] {
  if (session && session.elements.length > 0) {
    return session.elements
  }
  return SHOWCASE_ELEMENTS
}

export function resolveCanvasForLoad(session: SessionSnapshot | null): DisplayConfig {
  if (session && session.elements.length > 0) {
    return session.canvas
  }
  return SHOWCASE_CANVAS
}

export function buildAppBootstrap(
  session: SessionSnapshot | null,
  mock: Partial<MockData> = {},
  importSource: BootstrapImportSource = 'session',
  variables: StoredVariables = {},
): AppBootstrap {
  const elements = resolveElementsForLoad(session)
  if (!session || session.elements.length === 0) {
    allowShowcaseBundledForDemo()
  }

  return {
    sessionName: session?.name ?? 'Untitled',
    elements,
    canvas: resolveCanvasForLoad(session),
    service: session?.service,
    mockStates: mock.states ?? {},
    mockAttributes: mock.attributes ?? {},
    variables,
    importSource,
    editHistory: importSource === 'session' ? session?.editHistory : undefined,
  }
}

export function defaultAppBootstrap(): AppBootstrap {
  const simulator = cloneShowcaseSimulator()
  return buildAppBootstrap(
    null,
    { states: simulator.states, attributes: simulator.attributes },
    'default',
    simulator.variables,
  )
}

export async function loadAppBootstrap(locationHash?: string): Promise<AppBootstrap> {
  await hydrateContentMapFromStorage()

  const useWindowLocation = locationHash === undefined
  const hash = locationHash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  const hashEncoded = parseShareHashFromLocation(hash)
  if (hashEncoded) {
    const payload = decodeShareHash(hashEncoded)
    if (payload) {
      const [mock, variables] = await Promise.all([readMockStates(), readVariables()])
      if (useWindowLocation) {
        clearShareHashFromLocation()
      }
      return sharePayloadToBootstrap(payload, mock, variables)
    }
  }

  const [session, mock, variables] = await Promise.all([
    readSessionFromDb(),
    readMockStates(),
    readVariables(),
  ])
  return buildAppBootstrap(session, mock, session ? 'session' : 'default', variables)
}
