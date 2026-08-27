import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Document, StructureErrorCode } from '../shared/types'
import { StructureStore } from './structure-store'
import { DomainError, isPathInside } from './validation'

const VAULT_ID = '11111111-1111-4111-8111-111111111111'
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DOC_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function document(
  id: string,
  title: string,
  updatedAt: string,
  type: Document['type'] = 'document',
): Document {
  return { id, title, type, content: '{}', createdAt: updatedAt, updatedAt }
}

function thrownCode(action: () => unknown): StructureErrorCode | undefined {
  try {
    action()
  } catch (error) {
    return error instanceof DomainError ? error.code : undefined
  }
  return undefined
}

describe('StructureStore', () => {
  let root: string
  let vaultPath: string
  let documentsPath: string
  let store: StructureStore

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'localkb-structure-'))
    vaultPath = path.join(root, VAULT_ID)
    documentsPath = path.join(vaultPath, 'documents')
    fs.mkdirSync(documentsPath, { recursive: true })
    store = new StructureStore(() => root)
  })

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  const saveDocument = (value: Document) => {
    fs.writeFileSync(path.join(documentsPath, `${value.id}.json`), JSON.stringify(value))
  }

  it('migrates flat documents once in updated order without touching content', () => {
    saveDocument(document(DOC_A, 'older', '2025-01-01T00:00:00.000Z'))
    saveDocument(document(DOC_B, 'newer', '2026-01-01T00:00:00.000Z', 'drawing'))

    const first = store.get(VAULT_ID)
    const second = store.get(VAULT_ID)

    expect(first.entries.map((entry) => entry.id)).toEqual([DOC_B, DOC_A])
    expect(second).toEqual(first)
    expect(JSON.parse(
      fs.readFileSync(path.join(documentsPath, `${DOC_A}.json`), 'utf-8'),
    ).title).toBe('older')
  })

  it('moves mixed items, prevents cycles, and protects non-empty groups', () => {
    store.get(VAULT_ID)
    const withParent = store.createGroup(VAULT_ID, null, 'Parent')
    const parent = withParent.entries.find((entry) => entry.kind === 'group')!
    const withChild = store.createGroup(VAULT_ID, parent.id, 'Child')
    const child = withChild.entries.find(
      (entry) => entry.kind === 'group' && entry.parentId === parent.id,
    )!
    saveDocument(document(DOC_A, 'note', '2026-01-01T00:00:00.000Z'))
    store.attachDocument(VAULT_ID, DOC_A, child.id)

    expect(() => store.deleteGroup(VAULT_ID, parent.id)).toThrowError(DomainError)
    expect(store.descendantContentCount(VAULT_ID, parent.id)).toBe(1)
    expect(() => store.move(VAULT_ID, {
      kind: 'group', id: parent.id, targetParentId: child.id, index: 0,
    })).toThrowError(/后代/)

    store.move(VAULT_ID, { kind: 'document', id: DOC_A, targetParentId: null, index: 0 })
    const afterDelete = store.deleteGroup(VAULT_ID, parent.id)
    expect(afterDelete.entries.some(
      (entry) => entry.id === parent.id || entry.id === child.id,
    )).toBe(false)
    expect(afterDelete.entries[0].id).toBe(DOC_A)
  })

  it('reorders mixed siblings in both directions and rejects invalid placement', () => {
    store.get(VAULT_ID)
    for (const [id, title] of [[DOC_A, 'A'], [DOC_B, 'B'], [DOC_C, 'C']]) {
      saveDocument(document(id, title, '2026-01-01T00:00:00.000Z'))
      store.attachDocument(VAULT_ID, id, null)
    }

    let result = store.move(
      VAULT_ID,
      { kind: 'document', id: DOC_A, targetParentId: null, index: 2 },
    )
    expect(result.entries.sort((a, b) => a.order - b.order).map((entry) => entry.id))
      .toEqual([DOC_B, DOC_C, DOC_A])
    result = store.move(
      VAULT_ID,
      { kind: 'document', id: DOC_A, targetParentId: null, index: 0 },
    )
    expect(result.entries.sort((a, b) => a.order - b.order).map((entry) => entry.id))
      .toEqual([DOC_A, DOC_B, DOC_C])
    expect(thrownCode(() => store.move(VAULT_ID, {
      kind: 'document', id: DOC_B, targetParentId: DOC_A, index: 0,
    }))).toBe('INVALID_PARENT')
    expect(thrownCode(() => store.attachDocument(VAULT_ID, DOC_A, null)))
      .toBe('CORRUPT_STRUCTURE')
  })

  it('recovers orphan files and removes dangling placements', () => {
    store.get(VAULT_ID)
    saveDocument(document(DOC_A, 'orphan', '2026-01-01T00:00:00.000Z'))
    expect(store.get(VAULT_ID).entries.some((entry) => entry.id === DOC_A)).toBe(true)
    fs.unlinkSync(path.join(documentsPath, `${DOC_A}.json`))
    expect(store.get(VAULT_ID).entries.some((entry) => entry.id === DOC_A)).toBe(false)
  })

  it('does not overwrite unsupported or corrupt structures', () => {
    const structurePath = path.join(vaultPath, 'structure.json')
    fs.writeFileSync(structurePath, JSON.stringify({ version: 99, entries: [] }))
    expect(() => store.get(VAULT_ID)).toThrowError(/不支持/)
    expect(JSON.parse(fs.readFileSync(structurePath, 'utf-8')).version).toBe(99)

    fs.writeFileSync(structurePath, '{broken')
    expect(thrownCode(() => store.get(VAULT_ID))).toBe('CORRUPT_STRUCTURE')
    expect(fs.readFileSync(structurePath, 'utf-8')).toBe('{broken')
  })

  it('migrates an empty vault', () => {
    expect(store.get(VAULT_ID)).toEqual({ version: 1, entries: [] })
  })

  it('rejects traversal and evaluates both platform path formats', () => {
    expect(() => store.get('../../outside')).toThrowError(/ID/)
    expect(isPathInside('/vaults/a', '/vaults/ab/file', path.posix)).toBe(false)
    expect(isPathInside('/vaults/a', '/vaults/a/file', path.posix)).toBe(true)
    expect(isPathInside('C:\\vaults\\a', 'C:\\vaults\\ab\\file', path.win32)).toBe(false)
    expect(isPathInside('C:\\vaults\\a', 'C:\\vaults\\a\\file', path.win32)).toBe(true)
  })
})
