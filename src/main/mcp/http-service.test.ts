import * as os from 'os'
import * as path from 'path'
import { createServer, request as httpRequest } from 'http'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileKnowledgeStore } from '../knowledge/file-knowledge-store'
import { KnowledgeService } from '../knowledge/knowledge-service'
import { McpHttpService } from './http-service'

async function protocolJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = text.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
    if (!data) throw new Error('SSE response has no data frame')
    return JSON.parse(data) as Record<string, unknown>
  }
  return JSON.parse(text) as Record<string, unknown>
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

async function rawStatus(port: number, pathName: string, headers: Record<string, string>): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path: pathName, method: 'POST', headers }, (response) => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    request.once('error', reject)
    request.end()
  })
}

describe('MCP HTTP service', () => {
  let root: string
  let port: number
  let service: McpHttpService
  let errors: string[]
  const token = 'test-token-with-at-least-thirty-two-characters'

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-mcp-http-'))
    port = await freePort()
    errors = []
    service = new McpHttpService(
      new KnowledgeService(new FileKnowledgeStore(root)), 'test', (message) => errors.push(message),
    )
    await service.apply({ enabled: true, port, token })
  })

  afterEach(async () => {
    await service?.stop()
    if (root) await fs.rm(root, { recursive: true, force: true })
  })

  it('binds loopback, exposes secret-free health, and enforces token/origin', async () => {
    expect(service.connectionUrl({ enabled: true, port, token }))
      .toBe(`http://127.0.0.1:${port}/mcp?token=${encodeURIComponent(token)}`)
    const health = await fetch(`http://127.0.0.1:${port}/healthz`)
    expect(await health.json()).toEqual({
      status: 'ok', version: 'test', endpoint: `http://127.0.0.1:${port}/mcp`,
    })
    expect(await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })).toMatchObject({ status: 401 })
    expect(await fetch(`http://127.0.0.1:${port}/mcp?token=${token}`, {
      method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}',
    })).toMatchObject({ status: 403 })
  })

  it('serves the legacy initialize handshake with JSON and accepts bearer auth', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      }),
    })
    expect(response.status).toBe(200)
    const body = await protocolJson(response) as { result?: { serverInfo?: { name?: string } } }
    expect(body.result?.serverInfo?.name).toBe('localkb')

    const list = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    })
    const listed = await protocolJson(list) as {
      result?: { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> }
    }
    expect(listed.result?.tools).toHaveLength(31)
    const listedTools = listed.result?.tools ?? []
    const documentInsert = listedTools.find((tool) => tool.name === 'document_insert')
    const canvasInsert = listedTools.find((tool) => tool.name === 'canvas_insert')
    const mindMapCreate = listedTools.find((tool) => tool.name === 'mindmap_create')
    expect(documentInsert?.description).toContain('paragraph/heading')
    expect(JSON.stringify(documentInsert?.inputSchema)).toContain('原生 TipTap 节点')
    expect(JSON.stringify(canvasInsert?.inputSchema)).toContain('elbowed')
    expect(JSON.stringify(canvasInsert?.inputSchema)).toContain('完整原生 ExcalidrawElement')
    expect(JSON.stringify(mindMapCreate?.inputSchema)).toContain('MindElixirData')

    const call = await fetch(`http://127.0.0.1:${port}/mcp?token=${token}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vault_list', arguments: {} },
      }),
    })
    const called = await protocolJson(call) as { result?: { structuredContent?: { ok?: boolean } } }
    expect(called.result?.structuredContent?.ok).toBe(true)
  })

  it('supports the current MCP discovery wire format', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp?token=${token}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'server/discover',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 4, method: 'server/discover', params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    })
    expect(response.status).toBe(200)
    const body = await protocolJson(response)
    expect(body).toMatchObject({ jsonrpc: '2.0', id: 4, result: { resultType: 'complete' } })
  })

  it('switches token without restarting the listener', async () => {
    const nextToken = 'replacement-token-with-at-least-thirty-two-chars'
    await service.apply({ enabled: true, port, token: nextToken })
    expect(await fetch(`http://127.0.0.1:${port}/mcp?token=${token}`, { method: 'POST' })).toMatchObject({ status: 401 })
    expect(await fetch(`http://127.0.0.1:${port}/mcp?token=${nextToken}`, { method: 'POST' })).not.toMatchObject({ status: 401 })
  })

  it('rejects malformed/oversize requests and shuts down cleanly', async () => {
    const malformed = await fetch(`http://127.0.0.1:${port}/mcp?token=${token}`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: '{',
    })
    expect(malformed.status).toBeGreaterThanOrEqual(400)
    expect(errors.join(' ')).not.toContain(token)
    expect(await rawStatus(port, `/mcp?token=${token}`, {
      'content-type': 'application/json', 'content-length': String(24 * 1024 * 1024 + 1),
    })).toBe(413)

    await service.stop()
    await expect(fetch(`http://127.0.0.1:${port}/healthz`)).rejects.toThrow()
  })

  it('preserves the old listener when a new port is unavailable', async () => {
    const blockedPort = await freePort()
    const blocker = createServer()
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(blockedPort, '127.0.0.1', () => resolve())
    })
    try {
      await expect(service.apply({ enabled: true, port: blockedPort, token }))
        .rejects.toMatchObject({ code: 'EADDRINUSE' })
      expect(service.getStatus()).toMatchObject({ state: 'running', port })
      expect(await fetch(`http://127.0.0.1:${port}/healthz`)).toMatchObject({ status: 200 })
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    }
  })
})
