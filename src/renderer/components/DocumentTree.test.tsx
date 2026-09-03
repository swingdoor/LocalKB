import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VAULT_FORMAT_VERSIONS, type ContentSummary, type VaultTreeV3, type VaultV3 } from '@shared/knowledge-types'
import { useAppStore } from '../stores/appStore'

const arboristMocks = vi.hoisted(() => ({
  editNode: vi.fn(),
  resetNode: vi.fn(),
  selectNode: vi.fn(),
  submitNode: vi.fn(),
}))

vi.mock('react-arborist', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react')
  const flatten = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...flatten(node.children || [])])
  const Tree = ReactModule.forwardRef<any, any>((props, ref) => {
    const nodes = flatten(props.data || [])
    const [editingId, setEditingId] = ReactModule.useState<string | null>(null)
    const [selectedId, setSelectedId] = ReactModule.useState<string | null>(null)
    ReactModule.useImperativeHandle(ref, () => ({
      get: (id: string) => nodes.some((node) => node.id === id)
        ? {
            select: () => {
              arboristMocks.selectNode(id)
              setSelectedId(id)
            },
            edit: () => {
              arboristMocks.editNode(id)
              setEditingId(id)
            },
          }
        : null,
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
              isEditing: editingId === data.id,
              isSelected: selectedId === data.id,
              isOpen: true,
              isLeaf: data.kind === 'content',
              willReceiveDrop: false,
              toggle: vi.fn(),
              open: vi.fn(),
              reset: () => {
                arboristMocks.resetNode(data.id)
                setEditingId(null)
              },
              submit: (value: string) => {
                arboristMocks.submitNode(data.id, value)
                void Promise.resolve(props.onRename?.({ id: data.id, name: value, node: { data } }))
                  .finally(() => setEditingId(null))
              },
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

function openContextMenu(trigger: HTMLElement) {
  act(() => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))
  })
}

const timestamp = '2026-01-01T00:00:00.000Z'
const VAULT: VaultV3 = {
  schemaVersion: 3,
  formatVersions: VAULT_FORMAT_VERSIONS,
  id: '11111111-1111-4111-8111-111111111111',
  name: '测试库',
  createdAt: timestamp,
}
const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHILD_GROUP_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
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
    arboristMocks.editNode.mockClear()
    arboristMocks.resetNode.mockClear()
    arboristMocks.selectNode.mockClear()
    arboristMocks.submitNode.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useAppStore.setState({
      currentVault: VAULT,
      currentContent: null,
      contents: [],
      structure: { schemaVersion: 3, entries: [] },
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
        schemaVersion: 3,
        entries: [
          { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
          {
            kind: 'content', id: DOC_ID, contentType: 'document', title: '说明',
            parentId: GROUP_ID, order: 0, createdAt: timestamp, updatedAt: timestamp,
          },
        ],
      },
    })
    act(() => root.render(<DocumentTree />))

    expect(container.querySelector('[role="tree"]')?.getAttribute('data-dnd-root-scoped')).toBe('true')
  })

  it('shows group creation and maintenance actions in one menu', () => {
    const structure: VaultTreeV3 = {
      schemaVersion: 3,
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

  it('starts inline editing after creating a group', async () => {
    const createGroup = vi.fn(async () => {
      useAppStore.setState({
        structure: {
          schemaVersion: 3,
          entries: [
            { kind: 'group', id: GROUP_ID, name: '新建组', parentId: null, order: 0 },
          ],
        },
      })
      return GROUP_ID
    })
    useAppStore.setState({ createGroup })
    act(() => root.render(<DocumentTree />))

    const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="新建内容"]')!
    act(() => addButton.focus())
    openMenu(addButton)
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.textContent === '新建组')!
        .click()
      await Promise.resolve()
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20))
    })

    expect(createGroup).toHaveBeenCalledWith(null)
    expect(arboristMocks.selectNode).toHaveBeenCalledWith(GROUP_ID)
    expect(arboristMocks.editNode).toHaveBeenCalledWith(GROUP_ID)
    const input = container.querySelector<HTMLInputElement>('input[aria-label="重命名"]')
    expect(input?.value).toBe('新建组')
    expect(document.activeElement).toBe(input)
  })

  it('commits a context-menu rename on blur and keeps the target selected', async () => {
    const renameGroup = vi.fn(async () => true)
    useAppStore.setState({
      structure: {
        schemaVersion: 3,
        entries: [
          { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
          { kind: 'group', id: CHILD_GROUP_ID, name: '第二组', parentId: null, order: 1 },
        ],
      },
      renameGroup,
    })
    act(() => root.render(<DocumentTree />))

    const row = container.querySelector<HTMLButtonElement>('button[aria-label="第二组 的更多操作"]')!.closest('.group')!
    openContextMenu(row)
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.textContent === '重命名')!
        .click()
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    })

    expect(arboristMocks.selectNode).toHaveBeenCalledWith(CHILD_GROUP_ID)
    expect(arboristMocks.editNode).toHaveBeenCalledWith(CHILD_GROUP_ID)
    const input = container.querySelector<HTMLInputElement>('input[aria-label="重命名"]')
    expect(input?.value).toBe('第二组')
    expect(document.activeElement).toBe(input)

    await act(async () => {
      input!.value = '已重命名'
      container.querySelector<HTMLButtonElement>('button[aria-label="搜索文档"]')!.focus()
      await Promise.resolve()
    })

    expect(arboristMocks.submitNode).toHaveBeenCalledTimes(1)
    expect(arboristMocks.submitNode).toHaveBeenCalledWith(CHILD_GROUP_ID, '已重命名')
    expect(arboristMocks.resetNode).not.toHaveBeenCalled()
    expect(renameGroup).toHaveBeenCalledWith(CHILD_GROUP_ID, '已重命名')
    expect(row.className).toContain('bg-sidebar-accent')
  })

  it('commits a rename only once when Enter is followed by focus leaving', async () => {
    const renameGroup = vi.fn(async () => true)
    useAppStore.setState({
      structure: {
        schemaVersion: 3,
        entries: [
          { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
        ],
      },
      renameGroup,
    })
    act(() => root.render(<DocumentTree />))

    const row = container.querySelector<HTMLButtonElement>('button[aria-label="项目 的更多操作"]')!.closest('.group')!
    openContextMenu(row)
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.textContent === '重命名')!
        .click()
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    })

    const input = container.querySelector<HTMLInputElement>('input[aria-label="重命名"]')!
    input.value = '回车命名'
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      container.querySelector<HTMLButtonElement>('button[aria-label="搜索文档"]')!.focus()
      await Promise.resolve()
    })

    expect(arboristMocks.submitNode).toHaveBeenCalledTimes(1)
    expect(renameGroup).toHaveBeenCalledTimes(1)
    expect(renameGroup).toHaveBeenCalledWith(GROUP_ID, '回车命名')
  })

  it('keeps non-empty group deletion visible, focusable, greyed, and explained', () => {
    const structure: VaultTreeV3 = {
      schemaVersion: 3,
      entries: [
        { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
        {
          kind: 'content', id: DOC_ID, contentType: 'document', title: '说明',
          parentId: GROUP_ID, order: 0, createdAt: timestamp, updatedAt: timestamp,
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

  it('disables deletion when a group contains only an empty child group', () => {
    const structure: VaultTreeV3 = {
      schemaVersion: 3,
      entries: [
        { kind: 'group', id: GROUP_ID, name: '项目', parentId: null, order: 0 },
        { kind: 'group', id: CHILD_GROUP_ID, name: '空子组', parentId: GROUP_ID, order: 0 },
      ],
    }
    useAppStore.setState({ structure })
    act(() => root.render(<DocumentTree />))

    openMenu(container.querySelector<HTMLButtonElement>('button[aria-label="项目 的更多操作"]')!)
    const deleteItem = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent === '删除组')!

    expect(deleteItem.getAttribute('aria-disabled')).toBe('true')
    expect(deleteItem.title).toContain('组内仍有内容')
  })

  it('restores page interaction after deleting a document from its action menu', async () => {
    const deleteContent = vi.fn(async () => undefined)
    useAppStore.setState({
      contents: [SUMMARY],
      structure: {
        schemaVersion: 3,
        entries: [{
          kind: 'content', id: DOC_ID, contentType: 'document', title: '说明',
          parentId: null, order: 0, createdAt: timestamp, updatedAt: timestamp,
        }],
      },
      deleteContent,
    })
    act(() => root.render(<DocumentTree />))

    openMenu(container.querySelector<HTMLButtonElement>('button[aria-label="说明 的更多操作"]')!)
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.textContent === '删除')!
        .click()
      await Promise.resolve()
    })
    expect(document.body.querySelector('[role="alertdialog"]')).toBeTruthy()

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent === '删除')!
        .click()
      await Promise.resolve()
    })

    expect(deleteContent).toHaveBeenCalledWith(DOC_ID)
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.body.style.pointerEvents).not.toBe('none')
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="搜索文档"]')!.click())
    expect(useAppStore.getState().isSearchOpen).toBe(true)
  })
})
