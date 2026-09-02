import React from 'react'
import ReactDOM from 'react-dom/client'
import { DEFAULT_GENERAL_SETTINGS } from '@shared/editor-fonts'
import { useAppStore } from './stores/appStore'
import { applyApplicationTheme } from './theme'

applyApplicationTheme(new URLSearchParams(window.location.search).get('theme'))

async function startApplication() {
  try {
    await useAppStore.getState().loadGeneralSettings()
  } catch (error) {
    console.error('Failed to load appearance settings:', error)
    applyApplicationTheme(DEFAULT_GENERAL_SETTINGS.applicationTheme)
  }

  await import('./styles/index.css')
  await import('@excalidraw/excalidraw/index.css')
  const { default: App } = await import('./App')

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void startApplication()
