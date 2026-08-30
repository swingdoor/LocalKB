import type { EditorView } from '@tiptap/pm/view'
import type {
  RendererResourceInsertion,
  RendererResourceInsertionResult,
  Result,
  TipTapDocument,
} from '@shared/knowledge-types'

export async function insertManagedResourceReference(
  view: EditorView,
  vaultId: string,
  documentId: string,
  resource: RendererResourceInsertion,
  nodeType: 'canvasReference' | 'mindmapReference' | 'assetImage' | 'fileAttachment',
  attrs: Record<string, unknown>,
): Promise<Result<RendererResourceInsertionResult>> {
  const schemaType = view.state.schema.nodes[nodeType]
  if (!schemaType) {
    return { ok: false, error: { code: 'INVALID_INPUT', message: `编辑器不支持 ${nodeType} 节点` } }
  }
  const transaction = view.state.tr.replaceSelectionWith(schemaType.create({
    ...attrs,
    nodeId: crypto.randomUUID(),
  })).scrollIntoView()
  const result = await window.electronAPI.knowledge.insertRendererResource(
    vaultId,
    documentId,
    transaction.doc.toJSON() as TipTapDocument,
    resource,
  )
  if (!result.ok) return result
  if (!view.state.doc.eq(transaction.before)) {
    return {
      ok: false,
      error: {
        code: 'CONFLICT',
        message: '资源已保存，但编辑器内容已变化，请重新打开文档以显示最新内容',
      },
    }
  }
  view.dispatch(transaction)
  return result
}
