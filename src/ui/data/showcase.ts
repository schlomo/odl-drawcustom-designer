import type { DrawElement, HaMockContext } from '../../core'
import { parseYamlPayload, validatePayload } from '../../core'
import type { StoredVariables } from '../../storage'
import showcaseMeta from '../../assets/showcase/showcase.json'
import showcaseYaml from '../../assets/showcase/showcase.yml?raw'
import type { DisplayConfig } from '../preferences/displayConfig'

/** Per-entity attribute map for the State Simulator (typed JSON values). */
export type ShowcaseMockAttributes = Record<string, Record<string, unknown>>

/**
 * Folder for the built-in demo bundle: payload and simulator seed. The demo's
 * `dlimg` image lives *inside* the payload as a `data:` URI (generated from
 * `showcase.png` by `tools/showcaseImage.ts`), so the designer bundles no
 * separate image and a real display send needs no file on the host.
 */
export const SHOWCASE_ASSET_DIR = 'src/assets/showcase' as const

export const SHOWCASE_YAML_PATH = `${SHOWCASE_ASSET_DIR}/showcase.yml` as const
export const SHOWCASE_JSON_PATH = `${SHOWCASE_ASSET_DIR}/showcase.json` as const

export const SHOWCASE_YAML = showcaseYaml

interface ShowcaseMeta {
  canvas: DisplayConfig
  simulator: {
    states: HaMockContext['states']
    attributes: ShowcaseMockAttributes
    variables: StoredVariables
  }
}

const meta = showcaseMeta as ShowcaseMeta

function parseShowcaseElements(source: string): DrawElement[] {
  const elements = parseYamlPayload(source)
  const validation = validatePayload(elements)
  if (!validation.success) {
    throw new Error(`Invalid ${SHOWCASE_YAML_PATH}: ${validation.issues.join('; ')}`)
  }
  return elements
}

/** Canvas for the built-in showcase (from {@link SHOWCASE_JSON_PATH}). */
export const SHOWCASE_CANVAS: DisplayConfig = meta.canvas

/** State Simulator seed for the showcase (from {@link SHOWCASE_JSON_PATH}). */
export const SHOWCASE_MOCK_STATES: HaMockContext['states'] = meta.simulator.states

export const SHOWCASE_MOCK_ATTRIBUTES: ShowcaseMockAttributes = meta.simulator.attributes

export const SHOWCASE_VARIABLES: StoredVariables = meta.simulator.variables

/**
 * Draw payload loaded from {@link SHOWCASE_YAML_PATH} — every supported element
 * type plus template features (states, typed attributes, namespace(), variables).
 * Pair with {@link SHOWCASE_MOCK_STATES} / {@link SHOWCASE_MOCK_ATTRIBUTES} /
 * {@link SHOWCASE_VARIABLES} from {@link SHOWCASE_JSON_PATH}.
 */
export const SHOWCASE_ELEMENTS: DrawElement[] = parseShowcaseElements(showcaseYaml)

/**
 * The demo image's key before it moved inline (PR #198) — resolved by a
 * designer-only bundled tier that no longer exists. Autosaved sessions and
 * `#d=` links from before still carry it.
 */
export const LEGACY_SHOWCASE_IMAGE_URL = '/local/showcase.png' as const

/** The current demo image, as the `dlimg` in `showcase.yml` carries it. */
export const SHOWCASE_IMAGE_DATA_URL: string = (() => {
  const dlimg = SHOWCASE_ELEMENTS.find((element) => element.type === 'dlimg')
  if (!dlimg?.url) {
    throw new Error(`${SHOWCASE_YAML_PATH} has no dlimg element`)
  }
  return dlimg.url
})()

/**
 * Rewrite the legacy demo image key to the current inline demo image, where a
 * payload enters from storage or a share link. Bounded to that one exact
 * string — a user's own `/local/…` names are theirs. Returns the same array
 * when nothing matches, so an untouched session stays referentially equal.
 */
export function migrateLegacyShowcaseImage(elements: DrawElement[]): DrawElement[] {
  if (!elements.some((element) => element.type === 'dlimg' && element.url === LEGACY_SHOWCASE_IMAGE_URL)) {
    return elements
  }
  return elements.map((element) =>
    element.type === 'dlimg' && element.url === LEGACY_SHOWCASE_IMAGE_URL
      ? { ...element, url: SHOWCASE_IMAGE_DATA_URL }
      : element,
  )
}

/** Fresh element copy for Load Demo (avoid shared mutation). */
export function cloneShowcaseElements(): DrawElement[] {
  return structuredClone(SHOWCASE_ELEMENTS)
}

/** Fresh simulator seed for Load Demo and first-run IndexedDB defaults. */
export function cloneShowcaseSimulator(): {
  states: HaMockContext['states']
  attributes: ShowcaseMockAttributes
  variables: StoredVariables
} {
  return {
    states: { ...SHOWCASE_MOCK_STATES },
    attributes: structuredClone(SHOWCASE_MOCK_ATTRIBUTES),
    variables: { ...SHOWCASE_VARIABLES },
  }
}
