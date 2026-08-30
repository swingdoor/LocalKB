import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MindElixirInstance } from 'mind-elixir'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MindMapNoteMarkers from './MindMapNoteMarkers'

describe('MindMapNoteMarkers', () => {
  let host: HTMLDivElement
  let portalContainer: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.body.appendChild(document.createElement('div'))
    portalContainer = host.appendChild(document.createElement('div'))
    root = createRoot(portalContainer)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('cleans up safely after Mind Elixir deletes its mutable container property', () => {
    const engineContainer = document.createElement('div')
    const instance = { container: engineContainer } as unknown as MindElixirInstance

    act(() => {
      root.render(<MindMapNoteMarkers instance={instance} portalContainer={portalContainer} revision={0} />)
    })

    // Mind Elixir destroy() removes instance fields before React disposes overlays.
    delete (instance as Partial<MindElixirInstance>).container

    expect(() => {
      act(() => {
        root.render(<MindMapNoteMarkers instance={null} portalContainer={portalContainer} revision={0} />)
      })
    }).not.toThrow()
  })
})
