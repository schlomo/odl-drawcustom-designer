import type { DrawElement, HaMockContext, ServiceOptions } from '../../core'
import { hydrateContentMapFromStorage, readSessionFromDb, type SessionSnapshot } from '../../storage'
import { SAMPLE_CANVAS, SAMPLE_ELEMENTS } from '../data/sample-elements'
import type { DisplayConfig } from '../preferences/displayConfig'
import { DEFAULT_MOCK_STATES, readMockStates } from '../preferences/mockStates'
import { allowShowcaseBundledForDemo } from '../preferences/showcaseAsset'

export interface AppBootstrap {
  sessionName: string
  elements: DrawElement[]
  canvas: DisplayConfig
  service: ServiceOptions | undefined
  mockStates: HaMockContext['states']
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
  mockStates: HaMockContext['states'],
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
    mockStates,
  }
}

export function defaultAppBootstrap(): AppBootstrap {
  return buildAppBootstrap(null, { ...DEFAULT_MOCK_STATES })
}

export async function loadAppBootstrap(): Promise<AppBootstrap> {
  await hydrateContentMapFromStorage()
  const [session, mockStates] = await Promise.all([readSessionFromDb(), readMockStates()])
  return buildAppBootstrap(session, mockStates)
}
