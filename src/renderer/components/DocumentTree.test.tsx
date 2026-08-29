import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentSummary, VaultTreeV2, VaultV2 } from '@shared/knowledge-types'
import { useAppStore } from '../stores/appStore'

vi.mock('react-arborist', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react')
  const flatten = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...flatten(node.children || [])])
  const Tree = ReactModule.forwardRef<any, any>((props, ref) => {
    const nodes = flatten(props.data || [])
    ReactModule.useImperativeHandle(ref, () => ({
      get: () => null,
      open: vi.fn(),
      isOpen: () => true,
      select: vi.fn(),
      scrollTo: vi.fn(),
    }))
    const Node = props.children
    return (
      <div
        role="tree"
        aria-label={props['aria-label']}
        data-dnd-root-scoped={props.dndRootElement instanceof HTMLElement ? 'true' : 'false'}
      >
        {nodes.map((data) => (
          <Node
            key={data.id}
            data-testid={`node-${data.id}`}
            node={{
              id: data.id,
              data,
              isEditing: false,
              isSelected: false,
              isOpen: true,
              isLeaf: data.kind === 'content',
              willReceiveDrop: false,
              toggle: vi.fn(),
              open: vi.fn(),
              reset: vi.fn(),
              submit: vi.fn(),
            }}
            tree={{}}
            style={{}}
            dragHandle={() => undefined}
          />
        ))}
      </div>
    )
  })
  return {
    Tree,
    adjustMoveIndex: ({ index }: { index: number }) => index,
  }
})

import DocumentTree from './DocumentTree'

function openMenu(trigger: HTMLElement) {
  act(() => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
}

const timestamp = '2026-01-01T00:00:00.000Z'
const VAULT: VaultV2 = {
  schemaVersion: 2,
  id: '11111111-1111-4111-8111-111111111111',
  name: '测试库',
  createdAt: timestamp,
}
const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SUMMARY: ContentSummary = {
  id: DOC_ID,
  title: '说明',
  contentType: 'document',
  parentId: GROUP_ID,
  order: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
}

describe('DocumentTree', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useAppStore.setState({
      currentVault: VAULT,
      currentContent: null,
      contents: [],
      structure: { schemaVersion: 2, entries: [] },
      structureLoading: false,
      structureError: null,
      expandedGroupIds: [],
      revealContentId: null,
      isSearchOpen: false,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('uses one compact labelled creation control with three choices', () => {
    act(() => root.render(<DocumentTree />))
    const add = container.querySelector<HTMLButtonElement>('button[aria-label="新建内容"]')!
    expect(add.className).toContain('h-7')
    openMenu(add)
    expect(document.body.textContent).toContain('新建组')
    expect(document.body.textContent).toContain('新建文档')
    expect(document.body.textContent).toContain('新建画布')
  })

  it('opens search from the compact content toolbar control', () => {
    act(() => root.render(<DocumentTree />))
    const search = container.querySelector<HTMLButtonElement>('button[aria-label="搜索文档"]')!
    expect(search.className).toContain('h-7')
    act(() => search.click())
    expect(useAppStore.getState().isSearchOpen).toBe(true)
  })

  it('scopes the document-tree drag backend to its own container', () => {
    useAppStore.setState({
      contents: [SUMMARY],
      structure: {
        schemaVersion: 2,
        entries: [
          { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
          {
            kind: 'content', id: DOC_ID, contentType: 'document', title: '说明',
            parentId: GROUP_ID, order: 0, createdAt: timestamp, metadataUpdatedAt: timestamp,
          },
        ],
      },
    })
    act(() => root.render(<DocumentTree />))

    expect(container.querySelector('[role="tree"]')?.getAttribute('data-dnd-root-scoped')).toBe('true')
  })

  it('shows group creation and maintenance actions in one menu', () => {
    const structure: VaultTreeV2 = {
      schemaVersion: 2,
      entries: [
        { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
      ],
    }
    useAppStore.setState({ structure })
    act(() => root.render(<DocumentTree />))
    const more = container.querySelector<HTMLButtonElement>('button[aria-label="项目 的更多操作"]')!
    openMenu(more)
    const actions = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .map((item) => item.textContent)
    expect(actions).toEqual(['新建组', '新建文档', '新建画布', '重命名', '删除组'])
    expect(document.body.textContent).not.toContain('在组内新建')
  })

  it('keeps non-empty group deletion visible, focusable, greyed, and explained', () => {
    const structure: VaultTreeV2 = {
      schemaVersion: 2,
      entries: [
        { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
        {
          kind: 'content', id: DOC_ID, contentType: 'document', title: '说明',
          parentId: GROUP_ID, order: 0, createdAt: timestamp, metadataUpdatedAt: timestamp,
        },
      ],
    }
    useAppStore.setState({ structure, contents: [SUMMARY] })
    act(() => root.render(<DocumentTree />))
    const more = container.querySelector<HTMLButtonElement>('button[aria-label="项目 的更多操作"]')!
    openMenu(more)
    const deleteItem = document.body.querySelector<HTMLButtonElement>('[role="menuitem"][aria-disabled="true"]')!
    expect(deleteItem).toBeTruthy()
    expect(deleteItem.getAttribute('aria-disabled')).toBe('true')
    expect(deleteItem.tabIndex).toBe(-1)
    expect(deleteItem.title).toContain('组内仍有内容')
    expect(deleteItem.className).toContain('opacity-50')
  })
})
