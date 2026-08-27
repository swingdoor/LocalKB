import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type {
  DocumentSummary,
  GroupStructureEntry,
  StructureEntry,
  StructureMoveInput,
  VaultStructure,
} from '../shared/types'
import {
  assertId,
  DomainError,
  normalizeGroupName,
  normalizeIndex,
  resolveInside,
} from './validation'

const STRUCTURE_VERSION = 1 as const

function defaultVaultsRoot(): string {
  return path.join(app.getPath('userData'), 'data', 'vaults')
}

function cloneStructure(structure: VaultStructure): VaultStructure {
  return {
    version: STRUCTURE_VERSION,
    entries: structure.entries.map((entry) => ({ ...entry })),
  }
}

export class StructureStore {
  constructor(private readonly getVaultsRoot: () => string = defaultVaultsRoot) {}

  get(vaultId: string): VaultStructure {
    return cloneStructure(this.load(vaultId))
  }

  createGroup(
    vaultId: string,
    parentId: string | null,
    name: string,
    index?: number,
  ): VaultStructure {
    const structure = this.load(vaultId)
    this.assertParent(structure, parentId)
    const group: GroupStructureEntry = {
      kind: 'group',
      id: uuidv4(),
      name: normalizeGroupName(name),
      parentId,
      order: 0,
    }
    this.insert(structure, group, parentId, index)
    return this.commit(vaultId, structure)
  }

  renameGroup(vaultId: string, groupId: string, name: string): VaultStructure {
    assertId(groupId, '组 ID')
    const structure = this.load(vaultId)
    const group = structure.entries.find(
      (entry): entry is GroupStructureEntry => entry.kind === 'group' && entry.id === groupId,
    )
    if (!group) throw new DomainError('ITEM_NOT_FOUND', '组不存在')
    group.name = normalizeGroupName(name)
    return this.commit(vaultId, structure)
  }

  move(vaultId: string, input: StructureMoveInput): VaultStructure {
    assertId(input.id, input.kind === 'group' ? '组 ID' : '文档 ID')
    const structure = this.load(vaultId)
    const entry = structure.entries.find((item) => item.id === input.id)
    if (!entry || entry.kind !== input.kind) {
      throw new DomainError('ITEM_NOT_FOUND', '要移动的项目不存在')
    }
    this.assertParent(structure, input.targetParentId)
    if (
      entry.kind === 'group' &&
      this.isDescendant(structure, entry.id, input.targetParentId)
    ) {
      throw new DomainError('GROUP_CYCLE', '组不能移动到自身或后代中')
    }

    const oldParentId = entry.parentId
    const targetSiblings = this.siblings(structure, input.targetParentId)
      .filter((item) => item.id !== entry.id)
    const targetIndex = normalizeIndex(input.index, targetSiblings.length)
    entry.parentId = input.targetParentId
    targetSiblings.splice(targetIndex, 0, entry)
    this.setSiblingOrder(targetSiblings)
    if (oldParentId !== input.targetParentId) {
      this.setSiblingOrder(this.siblings(structure, oldParentId))
    }
    return this.commit(vaultId, structure)
  }

  deleteGroup(vaultId: string, groupId: string): VaultStructure {
    assertId(groupId, '组 ID')
    const structure = this.load(vaultId)
    const group = structure.entries.find(
      (entry): entry is GroupStructureEntry => entry.kind === 'group' && entry.id === groupId,
    )
    if (!group) throw new DomainError('ITEM_NOT_FOUND', '组不存在')

    const groupIds = this.descendantGroupIds(structure, groupId)
    const contentCount = structure.entries.filter(
      (entry) => entry.kind === 'document' && entry.parentId !== null && groupIds.has(entry.parentId),
    ).length
    if (contentCount > 0) {
      throw new DomainError(
        'GROUP_NOT_EMPTY',
        `该组包含 ${contentCount} 项内容，请先移动或删除组内内容`,
        contentCount,
      )
    }

    const parentId = group.parentId
    structure.entries = structure.entries.filter(
      (entry) => !(entry.kind === 'group' && groupIds.has(entry.id)),
    )
    this.setSiblingOrder(this.siblings(structure, parentId))
    return this.commit(vaultId, structure)
  }

  attachDocument(
    vaultId: string,
    documentId: string,
    parentId: string | null,
    index?: number,
  ): VaultStructure {
    assertId(documentId, '文档 ID')
    const structure = this.load(vaultId, false)
    if (structure.entries.some((entry) => entry.id === documentId)) {
      throw new DomainError('CORRUPT_STRUCTURE', '文档已存在于结构中')
    }
    this.assertParent(structure, parentId)
    this.insert(
      structure,
      { kind: 'document', id: documentId, parentId, order: 0 },
      parentId,
      index,
    )
    return this.commit(vaultId, structure)
  }

  detachDocument(vaultId: string, documentId: string): VaultStructure {
    assertId(documentId, '文档 ID')
    const structure = this.load(vaultId)
    const entry = structure.entries.find(
      (item) => item.kind === 'document' && item.id === documentId,
    )
    if (!entry) return cloneStructure(structure)
    structure.entries = structure.entries.filter((item) => item.id !== documentId)
    this.setSiblingOrder(this.siblings(structure, entry.parentId))
    return this.commit(vaultId, structure)
  }

  descendantContentCount(vaultId: string, groupId: string): number {
    assertId(groupId, '组 ID')
    const structure = this.load(vaultId)
    if (!structure.entries.some((entry) => entry.kind === 'group' && entry.id === groupId)) {
      throw new DomainError('ITEM_NOT_FOUND', '组不存在')
    }
    const groupIds = this.descendantGroupIds(structure, groupId)
    return structure.entries.filter(
      (entry) => entry.kind === 'document' && entry.parentId !== null && groupIds.has(entry.parentId),
    ).length
  }

  private load(vaultId: string, reconcileDocuments = true): VaultStructure {
    const vaultPath = this.vaultPath(vaultId)
    if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
      throw new DomainError('ITEM_NOT_FOUND', '知识库不存在')
    }

    const structurePath = resolveInside(vaultPath, 'structure.json')
    const summaries = this.readDocumentSummaries(vaultPath)
    if (!fs.existsSync(structurePath)) {
      const migrated: VaultStructure = {
        version: STRUCTURE_VERSION,
        entries: summaries.map((document, order) => ({
          kind: 'document',
          id: document.id,
          parentId: null,
          order,
        })),
      }
      this.write(vaultPath, migrated)
      return migrated
    }

    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(structurePath, 'utf-8'))
    } catch {
      throw new DomainError('CORRUPT_STRUCTURE', '知识库结构文件损坏')
    }
    if (!raw || typeof raw !== 'object' || !('version' in raw)) {
      throw new DomainError('CORRUPT_STRUCTURE', '知识库结构格式无效')
    }
    if ((raw as { version: unknown }).version !== STRUCTURE_VERSION) {
      throw new DomainError('UNSUPPORTED_VERSION', '暂不支持此知识库结构版本')
    }
    if (!Array.isArray((raw as { entries?: unknown }).entries)) {
      throw new DomainError('CORRUPT_STRUCTURE', '知识库结构条目无效')
    }

    const structure = cloneStructure(raw as VaultStructure)
    this.validate(structure)
    if (!reconcileDocuments) return structure

    const documentIds = new Set(summaries.map((document) => document.id))
    const danglingIds = structure.entries
      .filter((entry) => entry.kind === 'document' && !documentIds.has(entry.id))
      .map((entry) => entry.id)
    if (danglingIds.length > 0) {
      console.warn(`Removed ${danglingIds.length} dangling structure reference(s) in vault ${vaultId}`)
    }

    const before = JSON.stringify(structure)
    structure.entries = structure.entries.filter(
      (entry) => entry.kind === 'group' || documentIds.has(entry.id),
    )
    const placedIds = new Set(
      structure.entries.filter((entry) => entry.kind === 'document').map((entry) => entry.id),
    )
    let nextRootOrder = this.siblings(structure, null).length
    for (const document of summaries) {
      if (!placedIds.has(document.id)) {
        structure.entries.push({
          kind: 'document',
          id: document.id,
          parentId: null,
          order: nextRootOrder++,
        })
      }
    }
    this.normalizeAllOrders(structure)
    if (JSON.stringify(structure) !== before) this.write(vaultPath, structure)
    return structure
  }

  private commit(vaultId: string, structure: VaultStructure): VaultStructure {
    this.validate(structure)
    this.normalizeAllOrders(structure)
    this.write(this.vaultPath(vaultId), structure)
    return cloneStructure(structure)
  }

  private write(vaultPath: string, structure: VaultStructure): void {
    const target = resolveInside(vaultPath, 'structure.json')
    const temp = resolveInside(vaultPath, `.structure.${process.pid}.${Date.now()}.tmp`)
    try {
      fs.writeFileSync(temp, JSON.stringify(structure, null, 2), 'utf-8')
      fs.renameSync(temp, target)
    } catch (error) {
      if (fs.existsSync(temp)) fs.unlinkSync(temp)
      throw new DomainError(
        'PERSISTENCE_ERROR',
        error instanceof Error ? error.message : '保存结构失败',
      )
    }
  }

  private readDocumentSummaries(vaultPath: string): DocumentSummary[] {
    const documentsPath = resolveInside(vaultPath, 'documents')
    if (!fs.existsSync(documentsPath)) fs.mkdirSync(documentsPath, { recursive: true })
    return fs.readdirSync(documentsPath)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file): DocumentSummary[] => {
        try {
          const document = JSON.parse(
            fs.readFileSync(resolveInside(documentsPath, file), 'utf-8'),
          ) as DocumentSummary & { content?: unknown }
          assertId(document.id, '文档 ID')
          const { content: _content, ...summary } = document
          return [summary]
        } catch (error) {
          console.error(`Failed to read document summary: ${file}`, error)
          return []
        }
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  private validate(structure: VaultStructure): void {
    const ids = new Set<string>()
    for (const entry of structure.entries) {
      if (!entry || (entry.kind !== 'group' && entry.kind !== 'document')) {
        throw new DomainError('CORRUPT_STRUCTURE', '结构条目类型无效')
      }
      assertId(entry.id, '结构 ID')
      if (ids.has(entry.id)) {
        throw new DomainError('CORRUPT_STRUCTURE', '结构中存在重复 ID')
      }
      ids.add(entry.id)
      if (entry.parentId !== null) assertId(entry.parentId, '父组 ID')
      if (!Number.isInteger(entry.order) || entry.order < 0) {
        throw new DomainError('CORRUPT_STRUCTURE', '结构顺序无效')
      }
      if (entry.kind === 'group') normalizeGroupName(entry.name)
    }

    const groupIds = new Set(
      structure.entries.filter((entry) => entry.kind === 'group').map((entry) => entry.id),
    )
    for (const entry of structure.entries) {
      if (entry.parentId !== null && !groupIds.has(entry.parentId)) {
        throw new DomainError('INVALID_PARENT', '父组不存在')
      }
      if (
        entry.kind === 'group' &&
        this.isDescendant(structure, entry.id, entry.parentId)
      ) {
        throw new DomainError('GROUP_CYCLE', '结构中存在组循环')
      }
    }
  }

  private insert(
    structure: VaultStructure,
    entry: StructureEntry,
    parentId: string | null,
    index?: number,
  ): void {
    const siblings = this.siblings(structure, parentId)
    const targetIndex = normalizeIndex(index, siblings.length)
    structure.entries.push(entry)
    siblings.splice(targetIndex, 0, entry)
    this.setSiblingOrder(siblings)
  }

  private assertParent(structure: VaultStructure, parentId: string | null): void {
    if (parentId === null) return
    assertId(parentId, '父组 ID')
    if (!structure.entries.some((entry) => entry.kind === 'group' && entry.id === parentId)) {
      throw new DomainError('INVALID_PARENT', '父组不存在')
    }
  }

  private isDescendant(
    structure: VaultStructure,
    groupId: string,
    possibleDescendant: string | null,
  ): boolean {
    let current = possibleDescendant
    const visited = new Set<string>()
    while (current !== null) {
      if (current === groupId || visited.has(current)) return true
      visited.add(current)
      const parent = structure.entries.find(
        (entry) => entry.kind === 'group' && entry.id === current,
      )
      current = parent?.parentId ?? null
    }
    return false
  }

  private descendantGroupIds(structure: VaultStructure, groupId: string): Set<string> {
    const result = new Set([groupId])
    let changed = true
    while (changed) {
      changed = false
      for (const entry of structure.entries) {
        if (
          entry.kind === 'group' &&
          entry.parentId !== null &&
          result.has(entry.parentId) &&
          !result.has(entry.id)
        ) {
          result.add(entry.id)
          changed = true
        }
      }
    }
    return result
  }

  private siblings(structure: VaultStructure, parentId: string | null): StructureEntry[] {
    return structure.entries
      .filter((entry) => entry.parentId === parentId)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  }

  private setSiblingOrder(entries: StructureEntry[]): void {
    entries.forEach((entry, order) => {
      entry.order = order
    })
  }

  private normalizeAllOrders(structure: VaultStructure): void {
    const parents = new Set<string | null>([null])
    for (const entry of structure.entries) {
      if (entry.kind === 'group') parents.add(entry.id)
    }
    for (const parentId of parents) {
      this.setSiblingOrder(this.siblings(structure, parentId))
    }
  }

  private vaultPath(vaultId: string): string {
    assertId(vaultId, '知识库 ID')
    return resolveInside(this.getVaultsRoot(), vaultId)
  }
}

export const structureStore = new StructureStore()
