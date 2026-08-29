import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import {
  Bold,
  Check,
  Expand,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Palette,
  Sparkles,
  Strikethrough,
  Underline,
  X,
} from 'lucide-react'
import type { EditorInteractionCoordinator, MenuFocusTarget } from '../../editor/interactionContext'
import {
  captureMenuFocusTarget,
  resolveEditorMenuContext,
  restoreMenuFocusTarget,
} from '../../editor/interactionContext'
import { MenuButton, MenuDivider, MenuSurface } from './MenuPrimitives'
import { useEditorInteractionPhase } from '../../editor/useEditorInteraction'

interface TextSelectionMenuProps {
  editor: Editor
  interaction: EditorInteractionCoordinator
  onPolish?: (text: string) => void
  onExpand?: (text: string) => void
}

const MENU_OPTIONS = { placement: 'top', offset: 8 } satisfies NonNullable<BubbleMenuProps['options']>

export default function TextSelectionMenu({
  editor,
  interaction,
  onPolish,
  onExpand,
}: TextSelectionMenuProps) {
  const phase = useEditorInteractionPhase(interaction)
  const targetRef = useRef<MenuFocusTarget | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const selectionKey = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const { selection } = currentEditor.state
      return selection instanceof TextSelection && !selection.empty
        ? `${selection.from}:${selection.to}`
        : null
    },
  })
  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      fontFamily: currentEditor.getAttributes('textStyle').fontFamily ?? '',
      fontSize: currentEditor.getAttributes('textStyle').fontSize ?? '16px',
      color: currentEditor.getAttributes('textStyle').color ?? '#000000',
      highlight: currentEditor.getAttributes('highlight').color ?? '#fef08a',
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      strike: currentEditor.isActive('strike'),
      underline: currentEditor.isActive('underline'),
      link: currentEditor.isActive('link'),
    }),
  })

  useEffect(() => {
    setDismissed(false)
    if (!selectionKey) {
      setLinkOpen(false)
      setLinkValue('')
    }
  }, [selectionKey])

  useEffect(() => {
    if (!selectionKey || phase.kind !== 'idle') return
    const dismissOutside = (event: PointerEvent) => {
      const context = resolveEditorMenuContext({
        state: editor.state,
        phase: interaction.getSnapshot(),
        editable: editor.isEditable,
      })
      if (context.kind !== 'text-range') return
      const eventTarget = event.target instanceof Node ? event.target : null
      if (!eventTarget || menuRef.current?.contains(eventTarget)) return
      setDismissed(true)
      setLinkOpen(false)
      setLinkValue('')
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [editor, interaction, phase.kind, selectionKey])

  useEffect(() => {
    if (phase.kind === 'idle') return
    setLinkOpen(false)
    setLinkValue('')
  }, [phase.kind])

  const shouldShow = useCallback<NonNullable<BubbleMenuProps['shouldShow']>>(({ state }) => {
    const context = resolveEditorMenuContext({
      state,
      phase: interaction.getSnapshot(),
      editable: editor.isEditable,
    })
    if (context.kind !== 'text-range') return false
    targetRef.current = captureMenuFocusTarget(editor)
    return true
  }, [editor, interaction])

  const run = useCallback((command: () => void) => {
    const target = targetRef.current
    if (target && !restoreMenuFocusTarget(editor, target)) return
    command()
  }, [editor])

  const selectedText = useCallback(() => {
    const target = targetRef.current
    if (target && !restoreMenuFocusTarget(editor, target)) return ''
    const { from, to } = editor.state.selection
    return editor.state.doc.textBetween(from, to, ' ')
  }, [editor])

  const applyLink = useCallback(() => {
    const href = linkValue.trim()
    run(() => {
      if (!href) editor.chain().focus().unsetLink().run()
      else editor.chain().focus().setLink({ href: /^[a-z][a-z\d+.-]*:/i.test(href) ? href : `https://${href}` }).run()
    })
    setLinkOpen(false)
    setLinkValue('')
  }, [editor, linkValue, run])

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="textSelectionMenu"
      updateDelay={0}
      options={MENU_OPTIONS}
      shouldShow={shouldShow}
    >
      <MenuSurface
        ref={menuRef}
        aria-label="文本格式"
        style={{ display: phase.kind === 'idle' && !dismissed ? 'flex' : 'none' }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || linkOpen) return
          event.preventDefault()
          event.stopPropagation()
          setDismissed(true)
        }}
      >
        {linkOpen ? (
          <>
            <input
              autoFocus
              value={linkValue}
              onChange={(event) => setLinkValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyLink()
                if (event.key === 'Escape') {
                  setLinkOpen(false)
                  if (targetRef.current) restoreMenuFocusTarget(editor, targetRef.current)
                }
              }}
              placeholder="输入链接地址"
              aria-label="链接地址"
              className="w-52 border-0 bg-transparent px-2 text-sm outline-none"
            />
            <MenuButton label="确认链接" onClick={applyLink}><Check className="h-4 w-4" /></MenuButton>
            <MenuButton label="取消" onClick={() => setLinkOpen(false)}><X className="h-4 w-4" /></MenuButton>
          </>
        ) : (
          <>
            <select
              aria-label="字体"
              title="字体"
              value={formatting.fontFamily}
              onChange={(event) => run(() => {
                if (event.target.value) editor.chain().focus().setFontFamily(event.target.value).run()
                else editor.chain().focus().unsetFontFamily().run()
              })}
              className="editor-menu-select"
            >
              <option value="">默认字体</option>
              <option value="KaiTi, serif">楷体</option>
              <option value="Xiaolai, cursive">手写</option>
            </select>
            <select
              aria-label="字号"
              title="字号"
              value={formatting.fontSize}
              onChange={(event) => run(() => editor.chain().focus().setFontSize(event.target.value).run())}
              className="editor-menu-select"
            >
              <option value="12px">小</option>
              <option value="16px">正常</option>
              <option value="20px">大</option>
              <option value="24px">特大</option>
            </select>
            <MenuDivider />
            <MenuButton label="加粗" active={formatting.bold} onClick={() => run(() => editor.chain().focus().toggleBold().run())}><Bold className="h-4 w-4" /></MenuButton>
            <MenuButton label="斜体" active={formatting.italic} onClick={() => run(() => editor.chain().focus().toggleItalic().run())}><Italic className="h-4 w-4" /></MenuButton>
            <MenuButton label="删除线" active={formatting.strike} onClick={() => run(() => editor.chain().focus().toggleStrike().run())}><Strikethrough className="h-4 w-4" /></MenuButton>
            <MenuButton label="下划线" active={formatting.underline} onClick={() => run(() => editor.chain().focus().toggleUnderline().run())}><Underline className="h-4 w-4" /></MenuButton>
            <MenuButton
              label={formatting.link ? '移除链接' : '添加链接'}
              active={formatting.link}
              onClick={() => {
                if (formatting.link) run(() => editor.chain().focus().unsetLink().run())
                else setLinkOpen(true)
              }}
            ><LinkIcon className="h-4 w-4" /></MenuButton>
            <MenuDivider />
            <label className="editor-menu-color-control" title="字体颜色">
              <Palette className="h-4 w-4" />
              <input
                type="color"
                aria-label="字体颜色"
                value={formatting.color}
                onChange={(event) => run(() => editor.chain().focus().setColor(event.target.value).run())}
              />
            </label>
            <label className="editor-menu-color-control" title="高亮颜色">
              <Highlighter className="h-4 w-4" />
              <input
                type="color"
                aria-label="高亮颜色"
                value={formatting.highlight}
                onChange={(event) => run(() => editor.chain().focus().setHighlight({ color: event.target.value }).run())}
              />
            </label>
            <MenuButton label="清除高亮" onClick={() => run(() => editor.chain().focus().unsetHighlight().run())}><X className="h-3.5 w-3.5" /></MenuButton>
            <MenuDivider />
            <MenuButton label="AI 润色" onClick={() => {
              const text = selectedText()
              if (text.trim()) onPolish?.(text)
            }}><Sparkles className="h-4 w-4" /></MenuButton>
            <MenuButton label="AI 扩写" onClick={() => {
              const text = selectedText()
              if (text.trim()) onExpand?.(text)
            }}><Expand className="h-4 w-4" /></MenuButton>
          </>
        )}
      </MenuSurface>
    </BubbleMenu>
  )
}
