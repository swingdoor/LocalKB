import * as path from 'path'
import { randomUUID } from 'crypto'

export interface AtomicFileSystem {
  mkdir(target: string, options?: { recursive?: boolean }): Promise<unknown>
  open(target: string, flags: string): Promise<{
    writeFile(data: string | Uint8Array): Promise<void>
    sync(): Promise<void>
    close(): Promise<void>
  }>
  rename(oldPath: string, newPath: string): Promise<void>
  rm(target: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
}

/** Commit bytes by flushing a sibling temporary file before a same-filesystem rename. */
export async function atomicCommitFile(
  fileSystem: AtomicFileSystem,
  target: string,
  value: string | Uint8Array,
): Promise<void> {
  const directory = path.dirname(target)
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  )
  let handle: Awaited<ReturnType<AtomicFileSystem['open']>> | null = null
  try {
    await fileSystem.mkdir(directory, { recursive: true })
    handle = await fileSystem.open(temporary, 'wx')
    await handle.writeFile(value)
    await handle.sync()
    await handle.close()
    handle = null
    await fileSystem.rename(temporary, target)
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    await fileSystem.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}
