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
import { SAMPLE_CANVAS, SAMPLE_ELEMENTS } from '../data/sample-elements'
import type { DisplayConfig } from '../preferences/displayConfig'
import {
  DEFAULT_MOCK_ATTRIBUTES,
  DEFAULT_MOCK_STATES,
  readMockStates,
  type MockData,
} from '../preferences/mockStates'
import { allowShowcaseBundledForDemo } from '../preferences/showcaseAsset'

export type BootstrapImportSource = 'hash' | 'session' | 'default'

export interface AppBootstrap {
  sessionName: string
  elements: DrawElement[]
  canvas: DisplayConfig
  service: ServiceOptions | undefined
  mockStates: HaMockContext['states']
  mockAttributes: NonNullable<HaMockContext['attributes']>
  importSource: BootstrapImportSource
  /** Restored only for `importSource: 'session'`; cleared for hash/default loads. */
  editHistory?: PersistedEditHistory
}

/** Saved sessions with no elements fall back to the built-in sample dashboard. */
export function resolveElementsForLoad(session: SessionSnapshot | null): DrawElement[] {
  if (session && session.elements.length > 0) {
    return session.elements
  }
  return SAMPLE_ELEMENTS
}

export function resolveCanvasForLoad(session: SessionSnapshot | null): DisplayConfig {
  if (session && session.elements.length > 0) {
    return session.canvas
  }
  return SAMPLE_CANVAS
}

export function buildAppBootstrap(
  session: SessionSnapshot | null,
  mock: Partial<MockData> = {},
  importSource: BootstrapImportSource = 'session',
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
    importSource,
    editHistory: importSource === 'session' ? session?.editHistory : undefined,
  }
}

export function defaultAppBootstrap(): AppBootstrap {
  return buildAppBootstrap(
    null,
    { states: { ...DEFAULT_MOCK_STATES }, attributes: structuredClone(DEFAULT_MOCK_ATTRIBUTES) },
    'default',
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
      const mock = await readMockStates()
      if (useWindowLocation) {
        clearShareHashFromLocation()
      }
      return sharePayloadToBootstrap(payload, mock)
    }
  }

  const [session, mock] = await Promise.all([readSessionFromDb(), readMockStates()])
  return buildAppBootstrap(session, mock, session ? 'session' : 'default')
}
