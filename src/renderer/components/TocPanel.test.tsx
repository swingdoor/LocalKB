import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TocNode } from '../utils/headingParser'
import TocPanel from './TocPanel'

const toc: TocNode[] = [{
  id: 'architecture',
  text: '技术架构',
  level: 1,
  pos: 4,
  number: '1',
  children: [{
    id: 'service',
    text: '服务层',
    level: 2,
    pos: 16,
    number: '1.1',
    children: [],
  }],
}]

describe('TocPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('navigates headings, preserves numbering, and scopes disclosure to the tree', () => {
    const onNavigate = vi.fn()
    const onToggle = vi.fn()
    act(() => root.render(
      <TocPanel toc={toc} onNavigate={onNavigate} onToggle={onToggle} showNumbers />,
    ))
    expect(container.textContent).toContain('1.1')
    act(() => Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"]'))
      .find((item) => item.textContent?.includes('服务层'))!
      .click())
    expect(onNavigate).toHaveBeenCalledWith(16, 'service')

    const disclosure = container.querySelector<HTMLButtonElement>('button[aria-label="折叠"]')!
    act(() => disclosure.click())
    expect(container.textContent).not.toContain('服务层')
    expect(onNavigate).toHaveBeenCalledTimes(1)

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="关闭目录面板"]')!.click())
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows a lightweight empty state', () => {
    act(() => root.render(<TocPanel toc={[]} onNavigate={vi.fn()} />))
    expect(container.textContent).toContain('暂无标题')
  })
})
