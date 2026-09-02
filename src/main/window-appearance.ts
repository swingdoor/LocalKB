import type { BrowserWindow } from 'electron'
import { getApplicationTheme } from '../shared/application-themes'
import type { ApplicationTheme } from '../shared/types'

export const TITLE_BAR_OVERLAY_HEIGHT = 36

export function getWindowAppearance(theme: ApplicationTheme) {
  const definition = getApplicationTheme(theme)
  return {
    backgroundColor: definition.window.background,
    titleBarOverlay: {
      color: definition.window.background,
      symbolColor: definition.window.symbol,
      height: TITLE_BAR_OVERLAY_HEIGHT,
    },
  }
}

export function applyWindowAppearance(
  window: Pick<BrowserWindow, 'setBackgroundColor' | 'setTitleBarOverlay'>,
  theme: ApplicationTheme,
  platform: NodeJS.Platform = process.platform,
): void {
  const appearance = getWindowAppearance(theme)
  window.setBackgroundColor(appearance.backgroundColor)
  if (platform !== 'darwin') window.setTitleBarOverlay(appearance.titleBarOverlay)
}
