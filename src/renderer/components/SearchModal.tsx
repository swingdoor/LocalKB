import { useState, useEffect, useRef } from 'react'
import type { Document } from '@shared/types'

interface SearchModalProps {
  vaultId: string
  onSelect: (doc: Document) => void
  onClose: () => void
}

function SearchModal({ vaultId, onSelect, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Document[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 搜索
  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        // 空查询时显示所有文档
        const docs = await window.electronAPI.document.list(vaultId)
        setResults(docs)
        return
      }
      
      setIsLoading(true)
      const docs = await window.electronAPI.document.search(vaultId, query)
      setResults(docs)
      setIsLoading(false)
    }

    const debounce = setTimeout(search, 200)
    return () => clearTimeout(debounce)
  }, [query, vaultId])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev >= results.length - 1 ? 0 : prev + 1))
          break
        case 'Enter':
          e.preventDefault()
          if (results[selectedIndex]) {
            onSelect(results[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [results, selectedIndex, onSelect, onClose])

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30">
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入 */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文档..."
            className="flex-1 text-lg bg-transparent border-none outline-none placeholder-gray-400"
          />
          <kbd className="px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded">Esc</kbd>
        </div>

        {/* 搜索结果 */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-gray-400">
              <svg className="w-6 h-6 mx-auto animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          ) : results.length > 0 ? (
            <div className="py-2">
              {results.map((doc, index) => (
                <button
                  key={doc.id}
                  onClick={() => onSelect(doc)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    index === selectedIndex ? 'bg-selected' : 'hover:bg-gray-50'
                  }`}
                >
                  {doc.type === 'drawing' ? (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text truncate">{doc.title}</div>
                    <div className="text-sm text-gray-400">
                      {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  {index === selectedIndex && (
                    <kbd className="px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded">Enter</kbd>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-400">
              {query ? '未找到匹配的文档' : '暂无文档'}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-gray-50 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↓</kbd>
            <span>导航</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">Enter</kbd>
            <span>选择</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">Esc</kbd>
            <span>关闭</span>
          </span>
        </div>
      </div>
      
      {/* 点击背景关闭 */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  )
}

export default SearchModal
