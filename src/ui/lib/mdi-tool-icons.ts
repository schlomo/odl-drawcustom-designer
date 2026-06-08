import {
  mdiAlignHorizontalCenter,
  mdiAlignHorizontalLeft,
  mdiAlignHorizontalRight,
  mdiAlignVerticalBottom,
  mdiAlignVerticalCenter,
  mdiAlignVerticalTop,
  mdiArrangeBringToFront,
  mdiArrangeSendToBack,
  mdiArrowDown,
  mdiArrowUp,
  mdiContentCopy,
  mdiDeleteOutline,
  mdiDownload,
  mdiFormatFontSizeDecrease,
  mdiFormatFontSizeIncrease,
  mdiLinkVariant,
  mdiLinkVariantOff,
  mdiShareVariant,
  mdiThemeLightDark,
  mdiWeatherNight,
  mdiWeatherSunny,
} from '@mdi/js'
import type { ThemeMode } from '../preferences/theme'

/** Shared MDI paths for designer chrome (toolbars, property panel, export actions). */
export const TOOL_ICONS = {
  alignBottom: mdiAlignVerticalBottom,
  alignCenter: mdiAlignHorizontalCenter,
  alignLeft: mdiAlignHorizontalLeft,
  alignMiddle: mdiAlignVerticalCenter,
  alignRight: mdiAlignHorizontalRight,
  alignTop: mdiAlignVerticalTop,
  bringToFront: mdiArrangeBringToFront,
  sendToBack: mdiArrangeSendToBack,
  layerUp: mdiArrowUp,
  layerDown: mdiArrowDown,
  copy: mdiContentCopy,
  download: mdiDownload,
  delete: mdiDeleteOutline,
  fontDecrease: mdiFormatFontSizeDecrease,
  fontIncrease: mdiFormatFontSizeIncrease,
  linkOn: mdiLinkVariant,
  linkOff: mdiLinkVariantOff,
  share: mdiShareVariant,
  themeSystem: mdiThemeLightDark,
  themeLight: mdiWeatherSunny,
  themeDark: mdiWeatherNight,
} as const

export type ToolIconId = keyof typeof TOOL_ICONS

export function toolIconPath(id: ToolIconId): string {
  return TOOL_ICONS[id]
}

export function themeIconPath(mode: ThemeMode): string {
  if (mode === 'light') {
    return TOOL_ICONS.themeLight
  }
  if (mode === 'dark') {
    return TOOL_ICONS.themeDark
  }
  return TOOL_ICONS.themeSystem
}
