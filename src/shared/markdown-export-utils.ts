const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/json': 'json',
}

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function extensionForMimeType(mimeType: string, fallback = 'bin'): string {
  return MIME_EXTENSIONS[mimeType.toLowerCase()] ?? fallback
}

export function sanitizeExportFileName(value: string, fallback = 'resource'): string {
  const normalized = value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  const safe = normalized && !WINDOWS_RESERVED_NAMES.test(normalized) ? normalized : fallback
  return safe.slice(0, 180) || fallback
}

export function stableResourceSuffix(resourceId: string): string {
  const compact = resourceId.replace(/[^a-zA-Z0-9]/g, '')
  return compact.slice(0, 8) || 'resource'
}

export function appendStableSuffix(fileName: string, resourceId: string): string {
  const safe = sanitizeExportFileName(fileName)
  const dot = safe.lastIndexOf('.')
  const suffix = stableResourceSuffix(resourceId)
  if (dot <= 0) return `${safe}-${suffix}`
  return `${safe.slice(0, dot)}-${suffix}${safe.slice(dot)}`
}

export function joinPosixPath(...segments: string[]): string {
  return segments.map((segment) => segment.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')
}

export function encodeMarkdownRelativePath(relativePath: string): string {
  // Local Markdown readers do not consistently decode percent-encoded Unicode
  // file-system paths. CommonMark's angle-bracket destination keeps spaces and
  // Unicode unambiguous while still allowing the bundle to remain portable.
  const destination = `./${relativePath}`
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
  return `<${destination}>`
}

export function isSafeRelativeResourcePath(relativePath: string): boolean {
  if (!relativePath || relativePath.includes('\\') || relativePath.startsWith('/')) return false
  const segments = relativePath.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && !segment.includes('\0'))
}

export function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\\[\]])/g, '\\$1').replace(/[\r\n]+/g, ' ').trim()
}

export function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\r\n?/g, '\n'))
}

export function createMarkdownFrontmatter(metadata: {
  title: string
  createdAt: string
  updatedAt: string
}): string {
  return [
    '---',
    `title: ${yamlString(metadata.title)}`,
    `created: ${yamlString(new Date(metadata.createdAt).toISOString())}`,
    `updated: ${yamlString(new Date(metadata.updatedAt).toISOString())}`,
    '---',
    '',
  ].join('\n')
}

export function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
