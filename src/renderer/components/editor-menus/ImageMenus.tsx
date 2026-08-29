import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Check, Download, Pencil, X } from 'lucide-react'
import type { EditorInteractionCoordinator } from '../../editor/interactionContext'
import { updateNodeTargetAttrs } from '../../editor/nodeCommands'
import { AlignmentButtons, MenuButton, MenuDivider } from './MenuPrimitives'
import NodeMenuShell, { useSelectedNodeSnapshot } from './NodeMenuShell'

interface ImageMenuProps {
  editor: Editor
  interaction: EditorInteractionCoordinator
  vaultId: string
  documentId: string
}

function AltEditor({
  initialValue,
  onSave,
  onClose,
}: {
  initialValue: string
  onSave: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <>
      <input
        autoFocus
        aria-label="图片替代文字"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave(value)
          if (event.key === 'Escape') onClose()
        }}
        className="w-48 border-0 bg-transparent px-2 text-sm outline-none"
        placeholder="图片替代文字"
      />
      <MenuButton label="保存替代文字" onClick={() => onSave(value)}><Check className="h-4 w-4" /></MenuButton>
      <MenuButton label="取消" onClick={onClose}><X className="h-4 w-4" /></MenuButton>
    </>
  )
}

export function ImageMenu({ editor, interaction }: ImageMenuProps) {
  const [editingAlt, setEditingAlt] = useState(false)
  const snapshot = useSelectedNodeSnapshot(editor, 'image')
  const target = snapshot?.target ?? null
  const attrs = snapshot?.attrs
  const align = attrs?.textAlign === 'center' || attrs?.textAlign === 'right'
    ? attrs.textAlign
    : 'left'

  useEffect(() => {
    if (!snapshot) setEditingAlt(false)
  }, [snapshot])

  const replace = async () => {
    if (!target) return
    let nextAttrs: Record<string, unknown> | null = null
    interaction.setModalOpen('replace-image', true)
    try {
      const image = await window.electronAPI.file.selectImage()
      if (image?.data) nextAttrs = { src: image.data, alt: image.name ?? attrs?.alt }
    } finally {
      interaction.setModalOpen('replace-image', false)
    }
    if (nextAttrs) updateNodeTargetAttrs(editor, target, nextAttrs)
  }

  const download = async () => {
    if (!attrs?.src) return
    const src = String(attrs.src)
    if (src.startsWith('data:')) {
      await window.electronAPI.file.downloadImage(src, 'image.png')
      return
    }
    const blob = await (await fetch(src)).blob()
    const reader = new FileReader()
    reader.onloadend = () => { void window.electronAPI.file.downloadImage(String(reader.result), 'image.png') }
    reader.readAsDataURL(blob)
  }

  return (
    <NodeMenuShell editor={editor} interaction={interaction} nodeType="image" menuKind="image" pluginKey="imageNodeMenu" label="图片操作">
      {editingAlt && target ? (
        <AltEditor
          initialValue={String(attrs?.alt ?? '')}
          onClose={() => setEditingAlt(false)}
          onSave={(alt) => { updateNodeTargetAttrs(editor, target, { alt }); setEditingAlt(false) }}
        />
      ) : (
        <>
          {target && <AlignmentButtons value={align} onChange={(textAlign) => updateNodeTargetAttrs(editor, target, { textAlign })} />}
          <MenuDivider />
          <MenuButton label="替换图片" onClick={() => void replace()}><Pencil className="h-4 w-4" /></MenuButton>
          <MenuButton label="编辑替代文字" onClick={() => setEditingAlt(true)}>Alt</MenuButton>
          <MenuButton label="下载图片" onClick={() => void download()}><Download className="h-4 w-4" /></MenuButton>
        </>
      )}
    </NodeMenuShell>
  )
}

export function AssetImageMenu({ editor, interaction, vaultId, documentId }: ImageMenuProps) {
  const [editingAlt, setEditingAlt] = useState(false)
  const snapshot = useSelectedNodeSnapshot(editor, 'assetImage')
  const target = snapshot?.target ?? null
  const attrs = snapshot?.attrs
  const align = attrs?.textAlign === 'center' || attrs?.textAlign === 'right'
    ? attrs.textAlign
    : 'left'

  useEffect(() => {
    if (!snapshot) setEditingAlt(false)
  }, [snapshot])

  const replace = async () => {
    if (!target) return
    let nextAttrs: Record<string, unknown> | null = null
    interaction.setModalOpen('replace-asset-image', true)
    try {
      const image = await window.electronAPI.file.selectImage()
      if (!image) return
      const match = image.data.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) return
      const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
      const result = await window.electronAPI.knowledge.importAsset(vaultId, documentId, match[1], bytes, image.name)
      if (result.ok) nextAttrs = { assetId: result.data.id, alt: image.name ?? attrs?.alt }
    } finally {
      interaction.setModalOpen('replace-asset-image', false)
    }
    if (nextAttrs) updateNodeTargetAttrs(editor, target, nextAttrs)
  }

  return (
    <NodeMenuShell editor={editor} interaction={interaction} nodeType="assetImage" menuKind="asset-image" pluginKey="assetImageNodeMenu" label="工作区图片操作">
      {editingAlt && target ? (
        <AltEditor
          initialValue={String(attrs?.alt ?? '')}
          onClose={() => setEditingAlt(false)}
          onSave={(alt) => { updateNodeTargetAttrs(editor, target, { alt }); setEditingAlt(false) }}
        />
      ) : (
        <>
          {target && <AlignmentButtons value={align} onChange={(textAlign) => updateNodeTargetAttrs(editor, target, { textAlign })} />}
          <MenuDivider />
          <MenuButton label="替换工作区图片" onClick={() => void replace()}><Pencil className="h-4 w-4" /></MenuButton>
          <MenuButton label="编辑替代文字" onClick={() => setEditingAlt(true)}>Alt</MenuButton>
          {attrs?.assetId && (
            <MenuButton
              label="另存为"
              onClick={() => void window.electronAPI.knowledge.saveAssetAs(
                vaultId, documentId, String(attrs.assetId), String(attrs.alt ?? 'image.png'),
              )}
            ><Download className="h-4 w-4" /></MenuButton>
          )}
        </>
      )}
    </NodeMenuShell>
  )
}
