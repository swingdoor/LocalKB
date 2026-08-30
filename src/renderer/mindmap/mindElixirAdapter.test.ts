import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditableMindMap, createReadOnlyMindMap } from './mindElixirAdapter'
import { JIJIAN_MIND_MAP_THEME } from './mindElixirTheme'

const mocks = vi.hoisted(() => ({
  init: vi.fn(), changeTheme: vi.fn(), destroy: vi.fn(), clearHistory: vi.fn(),
  addListener: vi.fn(), removeListener: vi.fn(), instances: [] as Array<{ options: Record<string, unknown> }>,
}))

vi.mock('mind-elixir', () => ({
  default: class {
    static SIDE = 2
    options: Record<string, unknown>
    bus = { addListener: mocks.addListener, removeListener: mocks.removeListener }
    init = mocks.init
    changeTheme = mocks.changeTheme
    destroy = mocks.destroy
    clearHistory = mocks.clearHistory
    constructor(options: Record<string, unknown>) { this.options = options; mocks.instances.push(this) }
  },
}))

const data = { nodeData: { id: 'root', topic: 'Root' } }

describe('mindElixirAdapter', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.instances.length = 0 })

  it('configures separate editable and preview surfaces with the same theme', () => {
    const editableContainer = document.body.appendChild(document.createElement('div'))
    const previewContainer = document.body.appendChild(document.createElement('div'))
    const handler = vi.fn()
    const editable = createEditableMindMap(editableContainer, data, {
      listeners: [{ type: 'operation', handler }],
    })
    const preview = createReadOnlyMindMap(previewContainer, data)

    expect(mocks.instances[0].options).toMatchObject({
      editable: true,
      overflowHidden: false,
      toolBar: false,
      contextMenu: false,
      mouseSelectionButton: 0,
      newTopicName: '新节点',
    })
    expect(mocks.instances[1].options).toMatchObject({
      editable: false,
      overflowHidden: true,
      keypress: false,
      toolBar: false,
      contextMenu: false,
    })
    expect(mocks.changeTheme).toHaveBeenNthCalledWith(1, JIJIAN_MIND_MAP_THEME, false)
    expect(mocks.changeTheme).toHaveBeenNthCalledWith(2, JIJIAN_MIND_MAP_THEME, false)
    expect(mocks.addListener).toHaveBeenCalledTimes(1)
    expect(mocks.clearHistory).toHaveBeenCalledTimes(1)

    editable.dispose(); editable.dispose(); preview.dispose(); preview.dispose()
    expect(mocks.removeListener).toHaveBeenCalledTimes(1)
    expect(mocks.destroy).toHaveBeenCalledTimes(2)
    editableContainer.remove(); previewContainer.remove()
  })

  it('cleans up and never initializes fallback data after an initialization failure', () => {
    mocks.init.mockReturnValueOnce(new Error('invalid map'))
    const container = document.body.appendChild(document.createElement('div'))
    expect(() => createEditableMindMap(container, data)).toThrow('invalid map')
    expect(mocks.init).toHaveBeenCalledTimes(1)
    expect(mocks.init).toHaveBeenCalledWith(data)
    expect(mocks.destroy).toHaveBeenCalledTimes(1)
    expect(container.childElementCount).toBe(0)
    container.remove()
  })
})
