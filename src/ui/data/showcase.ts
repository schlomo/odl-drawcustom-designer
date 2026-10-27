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
