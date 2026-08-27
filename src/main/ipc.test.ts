import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc-channels'

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  userData: '',
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      electronMock.handlers.set(channel, handler),
  },
  app: {
    getPath: (name: string) => name === 'userData' ? electronMock.userData : os.tmpdir(),
  },
  dialog: {},
  BrowserWindow: class {},
}))

const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
  const handler = electronMock.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return await handler({}, ...args) as T
}

describe('structure IPC integration', () => {
  let root: string
  let vaultId: string

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'localkb-ipc-'))
    electronMock.userData = root
    const { setupIpcHandlers } = await import('./ipc')
    setupIpcHandlers({ isDestroyed: () => false } as Electron.BrowserWindow)
    const vault = await invoke<{ id: string }>(IPC_CHANNELS.VAULT.CREATE, 'IPC test')
    vaultId = vault.id
  })

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('coordinates group and document lifecycle through registered handlers', async () => {
    const createdGroup = await invoke<any>(
      IPC_CHANNELS.STRUCTURE.CREATE_GROUP,
      vaultId,
      null,
      '项目',
    )
    expect(createdGroup.success).toBe(true)
    const groupId = createdGroup.data.entries.find(
      (entry: { kind: string }) => entry.kind === 'group',
    ).id

    const document = await invoke<{ id: string }>(
      IPC_CHANNELS.DOCUMENT.CREATE,
      vaultId,
      '说明',
      'document',
      groupId,
      0,
    )
    const summaries = await invoke<Record<string, unknown>[]>(
      IPC_CHANNELS.DOCUMENT.LIST,
      vaultId,
    )
    expect(summaries[0]).not.toHaveProperty('content')

    const blocked = await invoke<any>(
      IPC_CHANNELS.STRUCTURE.DELETE_GROUP,
      vaultId,
      groupId,
    )
    expect(blocked).toMatchObject({
      success: false,
      error: { code: 'GROUP_NOT_EMPTY', contentCount: 1 },
    })

    expect(await invoke(
      IPC_CHANNELS.DOCUMENT.DELETE,
      vaultId,
      document.id,
    )).toBe(true)
    expect(await invoke<any>(
      IPC_CHANNELS.STRUCTURE.DELETE_GROUP,
      vaultId,
      groupId,
    )).toMatchObject({ success: true })
  })

  it('rolls back a document file when structure attachment fails', async () => {
    const before = await invoke<unknown[]>(IPC_CHANNELS.DOCUMENT.LIST, vaultId)
    await expect(invoke(
      IPC_CHANNELS.DOCUMENT.CREATE,
      vaultId,
      '不会残留',
      'document',
      '99999999-9999-4999-8999-999999999999',
      0,
    )).rejects.toThrow(/父组/)
    expect(await invoke<unknown[]>(IPC_CHANNELS.DOCUMENT.LIST, vaultId))
      .toHaveLength(before.length)
  })

  it('maps invalid structure and document requests to stable failures', async () => {
    expect(await invoke<any>(IPC_CHANNELS.STRUCTURE.GET, '../../outside'))
      .toMatchObject({ success: false, error: { code: 'INVALID_ID' } })
    expect(await invoke<any>(IPC_CHANNELS.STRUCTURE.GET, vaultId))
      .toMatchObject({ success: true })
    await expect(invoke(
      IPC_CHANNELS.DOCUMENT.GET,
      vaultId,
      '../outside',
    )).rejects.toThrow(/ID/)
  })
})
