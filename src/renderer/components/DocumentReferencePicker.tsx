import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Search, X } from 'lucide-react'
import type { ContentSummary } from '@shared/knowledge-types'

interface DocumentReferencePickerProps {
  documents: ContentSummary[]
  currentDocumentId: string
  onSelect: (document: ContentSummary) => void
  onClose: () => void
}

function DocumentReferencePicker({
  documents,
  currentDocumentId,
  onSelect,
  onClose,
}: DocumentReferencePickerProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return documents
      .filter((item) => item.contentType === 'document')
      .filter((item) => !normalized || item.title.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }, [documents, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (results.length === 0) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((index) => (index + 1) % results.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((index) => (index - 1 + results.length) % results.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        onSelect(results[selectedIndex] ?? results[0])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onSelect, results, selectedIndex])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-reference-picker-title"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 id="document-reference-picker-title" className="text-base font-semibold text-text">引用文档</h2>
            <p className="mt-0.5 text-xs text-gray-400">选择当前知识库中的文档</p>
          </div>
          <button type="button" aria-label="关闭" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search size={17} className="text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文档名称"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">没有匹配的文档</div>
          ) : results.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${index === selectedIndex ? 'bg-selected' : 'hover:bg-gray-50'}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => onSelect(item)}
            >
              <FileText size={18} className="flex-none text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{item.title}</span>
              {item.id === currentDocumentId && <span className="text-xs text-gray-400">当前文档</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-border bg-gray-50 px-4 py-2 text-xs text-gray-400">
          <span>↑↓ 选择</span>
          <span>Enter 确认</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}

export default DocumentReferencePicker
