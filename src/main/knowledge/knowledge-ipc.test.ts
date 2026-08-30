import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { KnowledgeChangeEvent, TipTapDocument } from '../../shared/knowledge-types'
import { KnowledgeError, type KnowledgeService } from './knowledge-service'
import {
  type KnowledgeIpcRegistrar,
  type KnowledgeAssetActions,
  registerKnowledgeIpc,
} from './knowledge-ipc'
import { handleKnowledgeResourceRequest } from './knowledge-resource-protocol'

type Handler = (event: unknown, request?: unknown) => unknown

function adapter(
  serviceOverrides: Record<string, unknown> = {},
  assetActions?: KnowledgeAssetActions,
) {
  const handlers = new Map<string, Handler>()
  let listener: ((event: KnowledgeChangeEvent) => void) | undefined
  const service = {
    subscribe: vi.fn((next: (event: KnowledgeChangeEvent) => void) => {
      listener = next
      return () => { listener = undefined }
    }),
    ...serviceOverrides,
  } as unknown as KnowledgeService
  const registrar: KnowledgeIpcRegistrar = {
    handle: (channel, handler) => handlers.set(channel, handler),
  }
  const send = vi.fn()
  const unsubscribe = registerKnowledgeIpc(service, registrar, () => ({ send }), assetActions)
  return { handlers, listener: () => listener, send, unsubscribe, service }
}

describe('knowledge IPC adapter', () => {
  it('registers every v3 request channel and calls the service once with renderer origin', async () => {
    const createVault = vi.fn(async (name: string, origin: string) => ({ id: 'v', name, origin }))
    const subject = adapter({ createVault })
    const requestChannels = Object.values(IPC_CHANNELS.KNOWLEDGE).filter(
      (channel) => channel !== IPC_CHANNELS.KNOWLEDGE.CHANGED,
    )
    expect([...subject.handlers.keys()].sort()).toEqual([...requestChannels].sort())

    const result = await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.VAULT_CREATE)!(null, {
      name: 'Vault',
    })
    expect(result).toEqual({ ok: true, data: { id: 'v', name: 'Vault', origin: 'renderer' } })
    expect(createVault).toHaveBeenCalledOnce()
    expect(createVault).toHaveBeenCalledWith('Vault', 'renderer')
  })

  it('transports native JSON objects without string conversion and maps stable errors', async () => {
    const replaceDocument = vi.fn(async (
      _vaultId: string,
      _documentId: string,
      content: TipTapDocument,
    ) => ({ content }))
    const renameVault = vi.fn(async () => {
      throw new KnowledgeError('INVALID_NAME', '名称无效')
    })
    const subject = adapter({ replaceDocument, renameVault })
    const content: TipTapDocument = {
      type: 'doc', content: [{ type: 'paragraph', futureNativeField: true }],
    }
    const replaced = await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_REPLACE)!(null, {
      vaultId: 'v', documentId: 'd', content,
    })
    expect(replaced).toEqual({ ok: true, data: { content } })
    expect(replaceDocument.mock.calls[0][2]).toBe(content)
    expect(typeof replaceDocument.mock.calls[0][2]).toBe('object')

    expect(await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.VAULT_RENAME)!(null, {
      vaultId: 'v', name: '',
    })).toEqual({ ok: false, error: { code: 'INVALID_NAME', message: '名称无效' } })
  })

  it('rejects non-JSON request payloads before service invocation and forwards events safely', async () => {
    const createVault = vi.fn()
    const subject = adapter({ createVault })
    const invalid = await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.VAULT_CREATE)!(null, {
      name: undefined,
    })
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(createVault).not.toHaveBeenCalled()

    const event: KnowledgeChangeEvent = {
      vaultId: 'v',
      resourceType: 'document',
      resourceId: 'd',
      change: 'updated',
      origin: 'mcp',
      changedAt: '2026-08-27T00:00:00.000Z',
    }
    subject.listener()?.(event)
    expect(subject.send).toHaveBeenCalledWith(IPC_CHANNELS.KNOWLEDGE.CHANGED, event)
    subject.unsubscribe()
    expect(subject.listener()).toBeUndefined()
  })

  it('passes attachment metadata and invokes controlled open/save actions', async () => {
    const importAsset = vi.fn(async () => ({ id: 'asset', mimeType: 'text/plain' }))
    const open = vi.fn(async () => undefined)
    const saveAs = vi.fn(async () => true)
    const subject = adapter({ importAsset }, { open, saveAs })
    const input = {
      vaultId: 'vault', assetId: 'asset', fileName: 'notes.txt',
    }
    await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.ASSET_IMPORT)!(null, {
      vaultId: input.vaultId,
      mimeType: 'text/plain', fileName: input.fileName, bytes: [1, 2, 3],
    })
    expect(importAsset).toHaveBeenCalledWith(
      input.vaultId, 'text/plain', new Uint8Array([1, 2, 3]),
      'renderer', input.fileName,
    )
    expect(await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.ASSET_OPEN)!(null, input))
      .toEqual({ ok: true, data: undefined })
    expect(await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.ASSET_SAVE_AS)!(null, input))
      .toEqual({ ok: true, data: true })
    expect(open).toHaveBeenCalledWith(input)
    expect(saveAs).toHaveBeenCalledWith(input)
  })

  it('routes renderer-composed asset insertion through one service call', async () => {
    const insertRendererResource = vi.fn(async () => ({ resourceId: 'asset' }))
    const subject = adapter({ insertRendererResource })
    const content: TipTapDocument = { type: 'doc', content: [{ type: 'paragraph' }] }
    await subject.handlers.get(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_RESOURCE_INSERT)!(null, {
      vaultId: 'vault', documentId: 'document', content,
      resource: {
        resourceType: 'asset', resourceId: 'asset', mimeType: 'text/plain',
        fileName: 'notes.txt', bytes: [1, 2, 3],
      },
    })
    expect(insertRendererResource).toHaveBeenCalledWith(
      'vault', 'document', content,
      {
        resourceType: 'asset', resourceId: 'asset', mimeType: 'text/plain',
        fileName: 'notes.txt', bytes: new Uint8Array([1, 2, 3]),
      },
      'renderer',
    )
  })
})

describe('localkb-resource protocol adapter', () => {
  it('serves vault-scoped bytes only through KnowledgeService', async () => {
    const readAsset = vi.fn(async () => ({
      id: 'asset', fileName: 'image.png', extension: 'png', mimeType: 'image/png',
      size: 3, sha256: '0'.repeat(64), createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z', bytes: new Uint8Array([1, 2, 3]),
    }))
    const response = await handleKnowledgeResourceRequest(
      { readAsset } as Pick<KnowledgeService, 'readAsset'>,
      'localkb-resource://asset/vault/asset',
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
    expect(readAsset).toHaveBeenCalledWith('vault', 'asset')
  })

  it('returns a safe failure for forged shapes and service validation failures', async () => {
    const readAsset = vi.fn(async () => {
      throw new KnowledgeError('INVALID_ID', 'invalid')
    })
    const service = { readAsset } as Pick<KnowledgeService, 'readAsset'>
    expect((await handleKnowledgeResourceRequest(
      service, 'localkb-resource://asset/../../outside',
    )).status).toBe(404)
    expect((await handleKnowledgeResourceRequest(
      service, 'localkb-resource://asset/bad/bad/bad',
    )).status).toBe(404)
  })
})
