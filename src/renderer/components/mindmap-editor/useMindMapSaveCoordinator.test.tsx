import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MindMapData } from '@shared/knowledge-types'
import { useMindMapSaveCoordinator } from './useMindMapSaveCoordinator'

function Harness({ onSave }: { onSave: (data: MindMapData) => Promise<void> }) {
  const coordinator = useMindMapSaveCoordinator({
    isOpen: true,
    getData: () => ({ nodeData: { id: 'root', topic: '中心主题' } }),
    onSave,
    onClose: vi.fn(),
    onError: vi.fn(),
  })
  useEffect(() => {
    coordinator.reset()
    coordinator.ready()
  // The harness intentionally initializes one save session once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div>
    <output data-phase="">{coordinator.phase}</output>
    <output data-version="">{coordinator.dirtyVersion}</output>
    <button type="button" data-app-action="" onClick={() => {
      void coordinator.runApplicationAction(() => {
        coordinator.recordOperation({ name: 'reshapeNode' })
        coordinator.recordOperation({ name: 'reshapeNode' })
      })
    }}>应用动作</button>
    <button type="button" data-native-action="" onClick={() => coordinator.recordOperation({ name: 'finishEdit' })}>原生动作</button>
    <button type="button" data-view-action="" onClick={() => coordinator.recordOperation({ name: 'beginEdit' })}>视图动作</button>
  </div>
}

describe('useMindMapSaveCoordinator', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('aggregates multiple engine operations in one application action into one save version', async () => {
    const onSave = vi.fn(async () => undefined)
    await act(async () => root.render(<Harness onSave={onSave} />))
    act(() => host.querySelector<HTMLButtonElement>('[data-view-action]')!.click())
    expect(host.querySelector('[data-phase]')!.textContent).toBe('ready-clean')
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-app-action]')!.click()
      await Promise.resolve()
    })
    expect(host.querySelector('[data-phase]')!.textContent).toBe('ready-dirty')
    expect(host.querySelector('[data-version]')!.textContent).toBe('1')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)) })
    expect(onSave).toHaveBeenCalledOnce()
    expect(host.querySelector('[data-phase]')!.textContent).toBe('ready-clean')
  })

  it('keeps edits made during a save for the next version', async () => {
    let resolveFirst!: () => void
    const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveFirst = resolve }))
    await act(async () => root.render(<Harness onSave={onSave} />))
    act(() => host.querySelector<HTMLButtonElement>('[data-native-action]')!.click())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 520)) })
    expect(host.querySelector('[data-phase]')!.textContent).toBe('saving')
    act(() => host.querySelector<HTMLButtonElement>('[data-native-action]')!.click())
    await act(async () => resolveFirst())
    expect(host.querySelector('[data-phase]')!.textContent).toBe('ready-dirty')
  })
})
