import type { BrowserWindow } from 'electron'
import type { GeneralSettings } from '../shared/types'
import { applyWindowAppearance } from './window-appearance'

export async function saveGeneralSettingsAndSyncWindow(
  window: Pick<BrowserWindow, 'setBackgroundColor' | 'setTitleBarOverlay'>,
  patch: Partial<GeneralSettings>,
  persist: (settings: Partial<GeneralSettings>) => Promise<GeneralSettings>,
  platform: NodeJS.Platform = process.platform,
): Promise<GeneralSettings> {
  const saved = await persist(patch)
  applyWindowAppearance(window, saved.applicationTheme, platform)
  return saved
}
