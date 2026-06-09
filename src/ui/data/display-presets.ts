import type { AccentMode } from '../../core'

export interface DisplayPreset {
  id: string
  label: string
  width?: number
  height?: number
  /** BWR → red, BWY → yellow; omitted when the preset is not color-tagged. */
  accentMode?: AccentMode
}

export const CUSTOM_BWR_PRESET_ID = 'custom-bwr'
export const CUSTOM_BWY_PRESET_ID = 'custom-bwy'

export function isCustomDisplayPreset(preset: DisplayPreset): boolean {
  return preset.id === CUSTOM_BWR_PRESET_ID || preset.id === CUSTOM_BWY_PRESET_ID
}

/** Common OpenEPaperLink tag resolutions (reference designer parity). */
export const DISPLAY_PRESETS: DisplayPreset[] = [
  { id: CUSTOM_BWR_PRESET_ID, label: 'Custom BWR', accentMode: 'red' },
  { id: CUSTOM_BWY_PRESET_ID, label: 'Custom BWY', accentMode: 'yellow' },
  { id: '1.54-bwr', label: '1.54" BWR (152×152)', width: 152, height: 152, accentMode: 'red' },
  { id: '1.54-bwy', label: '1.54" BWY (152×152)', width: 152, height: 152, accentMode: 'yellow' },
  { id: '1.6-bw', label: '1.6" BW (200×200)', width: 200, height: 200 },
  { id: '2.13-bwr', label: '2.13" BWR (250×122)', width: 250, height: 122, accentMode: 'red' },
  { id: '2.13-bwy', label: '2.13" BWY (250×122)', width: 250, height: 122, accentMode: 'yellow' },
  { id: '2.2-bwr', label: '2.2" BWR (212×104)', width: 212, height: 104, accentMode: 'red' },
  { id: '2.2-bwy', label: '2.2" BWY (212×104)', width: 212, height: 104, accentMode: 'yellow' },
  { id: '2.2-160-bwr', label: '2.2" BWR (296×160)', width: 296, height: 160, accentMode: 'red' },
  { id: '2.2-160-bwy', label: '2.2" BWY (296×160)', width: 296, height: 160, accentMode: 'yellow' },
  { id: '2.6-bwr', label: '2.6" BWR (360×184)', width: 360, height: 184, accentMode: 'red' },
  { id: '2.6-bwy', label: '2.6" BWY (360×184)', width: 360, height: 184, accentMode: 'yellow' },
  { id: '2.6-alt-bwr', label: '2.6" BWR (296×152)', width: 296, height: 152, accentMode: 'red' },
  { id: '2.6-alt-bwy', label: '2.6" BWY (296×152)', width: 296, height: 152, accentMode: 'yellow' },
  { id: '2.9-bwr', label: '2.9" BWR (296×128)', width: 296, height: 128, accentMode: 'red' },
  { id: '2.9-bwy', label: '2.9" BWY (296×128)', width: 296, height: 128, accentMode: 'yellow' },
  { id: '2.9-168-bwr', label: '2.9" BWR (384×168)', width: 384, height: 168, accentMode: 'red' },
  { id: '2.9-168-bwy', label: '2.9" BWY (384×168)', width: 384, height: 168, accentMode: 'yellow' },
  { id: '2.9-184', label: '2.9" custom (384×184)', width: 384, height: 184 },
  { id: '2.9-portrait-bwr', label: '2.9" portrait BWR (168×384)', width: 168, height: 384, accentMode: 'red' },
  { id: '2.9-portrait-bwy', label: '2.9" portrait BWY (168×384)', width: 168, height: 384, accentMode: 'yellow' },
  { id: '4.2-bwr', label: '4.2" BWR (400×300)', width: 400, height: 300, accentMode: 'red' },
  { id: '4.2-bwy', label: '4.2" BWY (400×300)', width: 400, height: 300, accentMode: 'yellow' },
  { id: '4.3-bwr', label: '4.3" BWR (800×480)', width: 800, height: 480, accentMode: 'red' },
  { id: '4.3-bwy', label: '4.3" BWY (800×480)', width: 800, height: 480, accentMode: 'yellow' },
  { id: '5.8-bwr', label: '5.8" BWR (640×384)', width: 640, height: 384, accentMode: 'red' },
  { id: '5.8-bwy', label: '5.8" BWY (640×384)', width: 640, height: 384, accentMode: 'yellow' },
  { id: '6.0-bwr', label: '6.0" BWR (600×448)', width: 600, height: 448, accentMode: 'red' },
  { id: '6.0-bwy', label: '6.0" BWY (600×448)', width: 600, height: 448, accentMode: 'yellow' },
  { id: '7.5-bwr', label: '7.5" BWR (880×528)', width: 880, height: 528, accentMode: 'red' },
  { id: '7.5-bwy', label: '7.5" BWY (880×528)', width: 880, height: 528, accentMode: 'yellow' },
  { id: '9.7-bwr', label: '9.7" BWR (960×672)', width: 960, height: 672, accentMode: 'red' },
  { id: '9.7-bwy', label: '9.7" BWY (960×672)', width: 960, height: 672, accentMode: 'yellow' },
  { id: '11.6-bwr', label: '11.6" BWR (640×960)', width: 640, height: 960, accentMode: 'red' },
  { id: '11.6-bwy', label: '11.6" BWY (640×960)', width: 640, height: 960, accentMode: 'yellow' },
]

export const DEFAULT_PRESET_ID = '2.9-184'

function customPresetForAccent(accentMode: AccentMode): DisplayPreset {
  return accentMode === 'yellow'
    ? DISPLAY_PRESETS.find((preset) => preset.id === CUSTOM_BWY_PRESET_ID)!
    : DISPLAY_PRESETS.find((preset) => preset.id === CUSTOM_BWR_PRESET_ID)!
}

export function findPresetForCanvas(
  width: number,
  height: number,
  accentMode: AccentMode,
): DisplayPreset {
  const matches = DISPLAY_PRESETS.filter(
    (preset) =>
      !isCustomDisplayPreset(preset) && preset.width === width && preset.height === height,
  )
  if (matches.length === 0) {
    return customPresetForAccent(accentMode)
  }
  if (matches.length === 1) {
    return matches[0]
  }
  return matches.find((preset) => preset.accentMode === accentMode) ?? matches[0]
}
