import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import {
  Bold,
  Check,
  ChevronDown,
  Expand,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Palette,
  Sparkles,
  Strikethrough,
  Underline,
  WandSparkles,
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
  onCustom?: (text: string) => void
}

const MENU_OPTIONS = { placement: 'top', offset: 8 } satisfies NonNullable<BubbleMenuProps['options']>

const FONT_COLORS = [
  { label: '深灰', value: '#334155' },
  { label: '红色', value: '#dc2626' },
  { label: '橙色', value: '#ea580c' },
  { label: '绿色', value: '#16a34a' },
  { label: '蓝色', value: '#2563eb' },
  { label: '紫色', value: '#9333ea' },
] as const

const HIGHLIGHT_COLORS = [
  { label: '浅黄', value: '#fef3c7' },
  { label: '浅橙', value: '#ffedd5' },
  { label: '浅红', value: '#fee2e2' },
  { label: '浅绿', value: '#dcfce7' },
  { label: '浅蓝', value: '#dbeafe' },
  { label: '浅紫', value: '#f3e8ff' },
] as const

interface ChoiceOption {
  label: string
  value: string
}

type TextDropdown = 'fontSize' | 'fontColor' | 'background'

function ChoiceMenu({
  label,
  value,
  options,
  onSelect,
  open,
  onOpenChange,
}: {
  label: string
  value: string
  options: readonly ChoiceOption[]
  onSelect: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const current = options.find((option) => option.value === value) ?? options[0]
  return (
    <div className="editor-menu-inline-dropdown">
      <button
        type="button"
        className="bubble-dropdown-trigger editor-menu-choice-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onOpenChange(!open)}
      >
        <span>{current.label}</span><ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div role="menu" aria-label={`${label}选项`} className="editor-menu-inline-content min-w-32">
          {options.map((option) => (
            <button
              type="button"
              role="menuitem"
              key={option.value}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option.value)
                onOpenChange(false)
              }}
              className="editor-menu-inline-item"
            >
              <Check className={`h-4 w-4 ${option.value === value ? 'opacity-100' : 'opacity-0'}`} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ColorMenu({
  label,
  value,
  icon,
  colors,
  onSelect,
  open,
  onOpenChange,
  align = 'start',
}: {
  label: string
  value: string
  icon: ReactNode
  colors: readonly ChoiceOption[]
  onSelect: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  align?: 'start' | 'end'
}) {
  return (
    <div className="editor-menu-inline-dropdown">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="editor-menu-palette-trigger"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onOpenChange(!open)}
      >
        {icon}
        <span className="editor-menu-color-indicator" style={{ backgroundColor: value || 'transparent' }} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`${label}选项`}
          className={`editor-menu-inline-content w-48 p-2 ${align === 'end' ? 'is-end' : ''}`}
        >
          <div className="px-1 py-1 text-xs font-semibold text-muted-foreground">{label}</div>
          <button
            type="button"
            role="menuitem"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelect('')
              onOpenChange(false)
            }}
            className="editor-menu-inline-item mt-1"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-sm border bg-background">
              {!value && <Check className="h-3 w-3" />}
            </span>
            默认
          </button>
          <div role="separator" className="my-1 h-px bg-muted" />
          <div className="grid grid-cols-6 gap-1" role="group" aria-label={`${label}预设`}>
            {colors.map((color) => (
              <button
                type="button"
                role="menuitem"
                key={color.value}
                aria-label={color.label}
                title={color.label}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(color.value)
                  onOpenChange(false)
                }}
                className="relative flex h-7 w-7 items-center justify-center rounded-md border border-transparent p-0 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{ backgroundColor: color.value }}
              >
                {value.toLowerCase() === color.value && <Check className="h-4 w-4 text-slate-700" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TextSelectionMenu({
  editor,
  interaction,
  onPolish,
  onExpand,
  onCustom,
}: TextSelectionMenuProps) {
  const phase = useEditorInteractionPhase(interaction)
  const targetRef = useRef<MenuFocusTarget | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [openDropdown, setOpenDropdown] = useState<TextDropdown | null>(null)
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
      fontSize: currentEditor.getAttributes('textStyle').fontSize ?? '16px',
      color: currentEditor.getAttributes('textStyle').color ?? '',
      highlight: currentEditor.getAttributes('highlight').color ?? '',
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      strike: currentEditor.isActive('strike'),
      underline: currentEditor.isActive('underline'),
      link: currentEditor.isActive('link'),
    }),
  })

  useEffect(() => {
    setDismissed(false)
    setOpenDropdown(null)
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
      if (
        !eventTarget
        || menuRef.current?.contains(eventTarget)
        || (eventTarget instanceof Element && eventTarget.closest('[data-editor-text-menu-popup]'))
      ) return
      setDismissed(true)
      setOpenDropdown(null)
      setLinkOpen(false)
      setLinkValue('')
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [editor, interaction, phase.kind, selectionKey])

  useEffect(() => {
    if (phase.kind === 'idle') return
    setOpenDropdown(null)
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
          if (openDropdown) {
            setOpenDropdown(null)
            return
          }
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
            <ChoiceMenu
              label="字号"
              value={formatting.fontSize}
              options={[
                { label: '小', value: '12px' },
                { label: '正常', value: '16px' },
                { label: '大', value: '20px' },
                { label: '特大', value: '24px' },
              ]}
              onSelect={(value) => run(() => editor.chain().focus().setFontSize(value).run())}
              open={openDropdown === 'fontSize'}
              onOpenChange={(open) => setOpenDropdown(open ? 'fontSize' : null)}
            />
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
                else {
                  setOpenDropdown(null)
                  setLinkOpen(true)
                }
              }}
            ><LinkIcon className="h-4 w-4" /></MenuButton>
            <MenuDivider />
            <ColorMenu
              label="字体颜色"
              value={formatting.color}
              icon={<Palette className="h-4 w-4" />}
              colors={FONT_COLORS}
              onSelect={(color) => run(() => {
                if (color) editor.chain().focus().setColor(color).run()
                else editor.chain().focus().unsetColor().run()
              })}
              open={openDropdown === 'fontColor'}
              onOpenChange={(open) => setOpenDropdown(open ? 'fontColor' : null)}
            />
            <ColorMenu
              label="背景颜色"
              value={formatting.highlight}
              icon={<Highlighter className="h-4 w-4" />}
              colors={HIGHLIGHT_COLORS}
              onSelect={(color) => run(() => {
                if (color) editor.chain().focus().setHighlight({ color }).run()
                else editor.chain().focus().unsetHighlight().run()
              })}
              open={openDropdown === 'background'}
              onOpenChange={(open) => setOpenDropdown(open ? 'background' : null)}
              align="end"
            />
            <MenuDivider />
            <MenuButton label="AI 润色" onClick={() => {
              const text = selectedText()
              if (text.trim()) onPolish?.(text)
            }}><Sparkles className="h-4 w-4" /></MenuButton>
            <MenuButton label="AI 扩写" onClick={() => {
              const text = selectedText()
              if (text.trim()) onExpand?.(text)
            }}><Expand className="h-4 w-4" /></MenuButton>
            <MenuButton label="自定义修改" onClick={() => {
              const text = selectedText()
              if (text.trim()) onCustom?.(text)
            }}><WandSparkles className="h-4 w-4" /></MenuButton>
          </>
        )}
      </MenuSurface>
    </BubbleMenu>
  )
}
