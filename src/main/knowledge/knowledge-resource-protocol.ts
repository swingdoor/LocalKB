import type { KnowledgeService } from './knowledge-service'

export async function handleKnowledgeResourceRequest(
  service: Pick<KnowledgeService, 'readAsset'>,
  requestUrl: string,
): Promise<Response> {
  try {
    const url = new URL(requestUrl)
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (url.protocol !== 'localkb-resource:' || url.hostname !== 'asset' || parts.length !== 2) {
      return new Response(null, { status: 404 })
    }
    const asset = await service.readAsset(parts[0], parts[1])
    const body = asset.bytes.slice().buffer as ArrayBuffer
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
