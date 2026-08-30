import { createHash, timingSafeEqual } from 'crypto'
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'http'
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
  type McpHttpHandler,
} from '@modelcontextprotocol/server'
import type { McpSettings, McpStatus } from '../../shared/mcp-types'
import { KnowledgeService } from '../knowledge/knowledge-service'
import { registerMcpTools } from './tool-registry'

const HOST = '127.0.0.1'
const MAX_REQUEST_BYTES = 24 * 1024 * 1024

function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest()
  const b = createHash('sha256').update(right).digest()
  return timingSafeEqual(a, b)
}

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'DELETE') return undefined
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new Error('REQUEST_TOO_LARGE')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.byteLength
    if (size > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

function requestUrl(request: IncomingMessage, port: number): URL {
  return new URL(request.url ?? '/', `http://${HOST}:${port}`)
}

async function toWebRequest(request: IncomingMessage, port: number): Promise<Request> {
  const body = await readBody(request)
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
    else if (value !== undefined) headers.set(name, value)
  }
  return new Request(requestUrl(request, port), {
    method: request.method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  })
}

async function sendWebResponse(response: ServerResponse, web: Response): Promise<void> {
  response.statusCode = web.status
  web.headers.forEach((value, name) => response.setHeader(name, value))
  response.end(Buffer.from(await web.arrayBuffer()))
}

function sendJson(response: ServerResponse, status: number, body: object): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

async function closeServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      server.closeAllConnections()
      resolve()
    }, 2_000)
    timer.unref()
    server.close(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function authenticated(request: IncomingMessage, url: URL, token: string): boolean {
  const authorization = request.headers.authorization
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
  const candidate = bearer ?? url.searchParams.get('token') ?? ''
  return candidate.length > 0 && safeEqual(candidate, token)
}

export class McpHttpService {
  private server: HttpServer | null = null
  private handler: McpHttpHandler | null = null
  private token = ''
  private status: McpStatus = { state: 'disabled', port: 0, endpoint: '' }

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly appVersion: string,
    private readonly onError?: (message: string) => void,
  ) {}

  getStatus(): McpStatus {
    return { ...this.status }
  }

  connectionUrl(settings: McpSettings): string {
    return `http://${HOST}:${settings.port}/mcp?token=${encodeURIComponent(settings.token)}`
  }

  async apply(settings: McpSettings): Promise<McpStatus> {
    if (!settings.enabled) {
      await this.stop()
      return this.getStatus()
    }
    if (this.server?.listening && this.status.port === settings.port) {
      this.token = settings.token
      return this.getStatus()
    }
    const previousStatus = this.getStatus()
    this.status = {
      state: 'starting', port: settings.port, endpoint: `http://${HOST}:${settings.port}/mcp`,
    }
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'localkb', version: this.appVersion })
      registerMcpTools(server, this.knowledge)
      return server
    }, {
      responseMode: 'auto',
      onerror: () => this.onError?.('MCP protocol request failed'),
    })
    const candidate = createServer((request, response) => {
      void this.handle(request, response, settings.port, handler)
    })
    candidate.requestTimeout = 30_000
    candidate.headersTimeout = 10_000
    try {
      await new Promise<void>((resolve, reject) => {
        candidate.once('error', reject)
        candidate.listen(settings.port, HOST, () => {
          candidate.off('error', reject)
          resolve()
        })
      })
    } catch (error) {
      await handler.close().catch(() => undefined)
      if (candidate.listening) candidate.close()
      const message = error instanceof Error ? error.message : 'MCP 服务启动失败'
      this.status = this.server?.listening
        ? { ...previousStatus, error: message }
        : { state: 'error', port: settings.port, endpoint: '', error: message }
      throw error
    }
    const previousServer = this.server
    const previousHandler = this.handler
    this.server = candidate
    this.handler = handler
    this.token = settings.token
    this.status = {
      state: 'running', port: settings.port, endpoint: `http://${HOST}:${settings.port}/mcp`,
    }
    if (previousServer) await closeServer(previousServer)
    await previousHandler?.close().catch(() => undefined)
    return this.getStatus()
  }

  async stop(): Promise<void> {
    const server = this.server
    const handler = this.handler
    this.server = null
    this.handler = null
    this.token = ''
    if (server) await closeServer(server)
    await handler?.close().catch(() => undefined)
    this.status = { state: 'disabled', port: 0, endpoint: '' }
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
    port: number,
    handler: McpHttpHandler,
  ): Promise<void> {
    try {
      const url = requestUrl(request, port)
      if (request.method === 'GET' && url.pathname === '/healthz') {
        sendJson(response, 200, {
          status: 'ok', version: this.appVersion, endpoint: `http://${HOST}:${port}/mcp`,
        })
        return
      }
      if (url.pathname !== '/mcp') {
        sendJson(response, 404, { error: 'Not found' })
        return
      }
      if (!authenticated(request, url, this.token)) {
        sendJson(response, 401, { error: 'Unauthorized' })
        return
      }
      const webRequest = await toWebRequest(request, port)
      const rejected = hostHeaderValidationResponse(webRequest, localhostAllowedHostnames())
        ?? originValidationResponse(webRequest, localhostAllowedOrigins())
      await sendWebResponse(response, rejected ?? await handler.fetch(webRequest))
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
        sendJson(response, 413, { error: 'Request body too large' })
        return
      }
      this.onError?.(error instanceof Error ? error.message : 'MCP 请求失败')
      if (!response.headersSent) sendJson(response, 500, { error: 'Internal server error' })
      else response.end()
    }
  }
}
