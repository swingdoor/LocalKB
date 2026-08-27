import * as path from 'path'
import type { StructureError, StructureErrorCode } from '../shared/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class DomainError extends Error {
  constructor(
    public readonly code: StructureErrorCode,
    message: string,
    public readonly contentCount?: number,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export function assertId(value: unknown, label = 'ID'): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new DomainError('INVALID_ID', `${label} 无效`)
  }
}

export function normalizeGroupName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DomainError('INVALID_NAME', '组名称无效')
  }
  const name = value.trim()
  if (!name || name.length > 100) {
    throw new DomainError('INVALID_NAME', '组名称须为 1–100 个字符')
  }
  return name
}

export function normalizeIndex(value: unknown, max: number): number {
  if (value === undefined) return max
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > max) {
    throw new DomainError('INVALID_INDEX', '目标位置无效')
  }
  return Number(value)
}

export function isPathInside(
  root: string,
  candidate: string,
  pathApi: typeof path.posix | typeof path.win32 | typeof path = path,
): boolean {
  const relative = pathApi.relative(pathApi.resolve(root), pathApi.resolve(candidate))
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relative)
  )
}

export function resolveInside(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, ...segments)
  if (isPathInside(resolvedRoot, resolved)) return resolved
  throw new DomainError('PATH_OUTSIDE_VAULT', '路径超出知识库范围')
}

export function toStructureError(error: unknown): StructureError {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      contentCount: error.contentCount,
    }
  }
  console.error(error)
  return { code: 'PERSISTENCE_ERROR', message: '保存知识库结构失败' }
}
