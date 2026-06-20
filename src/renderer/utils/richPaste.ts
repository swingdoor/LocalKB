import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { DOMParser as ProseMirrorDOMParser, Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  's',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
] as const

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'data-type', 'data-checked'] as const

export function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || !trimmed.includes('\n')) return false

  const lines = trimmed.split(/\r?\n/)
  let score = 0

  if (lines.some((line) => /^#{1,6}\s+\S/.test(line))) score += 2
  if (lines.filter((line) => /^\s*[-*+]\s+\S/.test(line)).length >= 2) score += 2
  if (lines.filter((line) => /^\s*\d+\.\s+\S/.test(line)).length >= 2) score += 2
  if (lines.some((line) => /^\s*[-*+]\s+\[[ xX]\]\s+\S/.test(line))) score += 2
  if (/```[\s\S]*```/.test(trimmed)) score += 3
  if (lines.some((line) => /^\s{0,3}>\s+\S/.test(line))) score += 1
  if (lines.some((line) => /^\s{0,3}---+\s*$/.test(line))) score += 1
  if (hasMarkdownTable(lines)) score += 3
  if (/\[[^\]]+\]\([^)]+\)/.test(trimmed)) score += 1
  if (/(\*\*|__)[^\n]+(\*\*|__)/.test(trimmed)) score += 1

  return score >= 2
}

export function markdownToHtml(text: string): string {
  return markdown.render(text)
}

export function sanitizePastedHtml(html: string): string {
  return DOMPurify.sanitize(normalizeHtml(html), {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
  })
}

export function handleRichPaste(view: EditorView, event: ClipboardEvent): boolean {
  const clipboard = event.clipboardData
  if (!clipboard) return false

  const html = clipboard.getData('text/html')
  const text = clipboard.getData('text/plain')

  if (html.trim()) {
    return insertHtml(view, event, sanitizePastedHtml(html))
  }

  if (looksLikeMarkdown(text)) {
    return insertHtml(view, event, sanitizePastedHtml(markdownToHtml(text)))
  }

  return false
}

function insertHtml(view: EditorView, event: ClipboardEvent, html: string): boolean {
  if (!html.trim()) return false

  const container = document.createElement('div')
  container.innerHTML = html

  const parser = ProseMirrorDOMParser.fromSchema(view.state.schema)
  const doc = parser.parse(container)
  const slice = new Slice(doc.content, 0, 0)
  const transaction = view.state.tr.replaceSelection(slice).scrollIntoView()
  view.dispatch(transaction)
  event.preventDefault()
  return true
}

function normalizeHtml(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html

  container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    const listItem = input.closest('li')
    if (!listItem) return

    const parentList = listItem.parentElement
    if (parentList?.tagName.toLowerCase() === 'ul') {
      parentList.setAttribute('data-type', 'taskList')
    }
    listItem.setAttribute('data-type', 'taskItem')
    if ((input as HTMLInputElement).checked) {
      listItem.setAttribute('data-checked', 'true')
    }
    input.remove()
  })

  container.querySelectorAll('li').forEach((listItem) => {
    const firstChild = listItem.firstChild
    if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE) return

    const match = firstChild.textContent?.match(/^\s*\[([ xX])\]\s+/)
    if (!match) return

    const parentList = listItem.parentElement
    if (parentList?.tagName.toLowerCase() === 'ul') {
      parentList.setAttribute('data-type', 'taskList')
    }
    listItem.setAttribute('data-type', 'taskItem')
    if (match[1].toLowerCase() === 'x') {
      listItem.setAttribute('data-checked', 'true')
    }
    firstChild.textContent = firstChild.textContent?.replace(/^\s*\[[ xX]\]\s+/, '') || ''
  })

  container.querySelectorAll('[style], [class]').forEach((element) => {
    element.removeAttribute('style')
    element.removeAttribute('class')
  })

  container.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || ''
    if (!/^https?:\/\//.test(href) && !/^file:\/\/\//.test(href) && !href.startsWith('#')) {
      link.removeAttribute('href')
    }
  })

  container.querySelectorAll('img[src]').forEach((image) => {
    const src = image.getAttribute('src') || ''
    if (!/^https?:\/\//.test(src) && !/^data:image\//.test(src) && !/^file:\/\/\//.test(src)) {
      image.remove()
    }
  })

  return container.innerHTML
}

function hasMarkdownTable(lines: string[]): boolean {
  return lines.some((line, index) => {
    const next = lines[index + 1]
    return Boolean(
      next &&
      /^\s*\|.+\|\s*$/.test(line) &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next),
    )
  })
}
