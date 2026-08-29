import { useEffect, useState } from 'react'
import { FileText, Image as ImageIcon } from 'lucide-react'
import type { SearchHit } from '@shared/knowledge-types'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandShortcut,
} from './ui/command'

interface SearchModalProps {
  vaultId: string
  onSelect: (content: SearchHit) => void
  onClose: () => void
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</kbd>
}

function SearchModal({ vaultId, onSelect, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      const result = await window.electronAPI.knowledge.search(vaultId, query)
      if (!active) return
      setResults(result.ok ? result.data : [])
      setIsLoading(false)
    }, 200)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, vaultId])

  return (
    <CommandDialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="搜索文档和画布…"
        autoFocus
      />
      <CommandList className="max-h-96">
        <CommandEmpty>{isLoading ? '正在搜索…' : query ? '未找到匹配内容' : '暂无内容'}</CommandEmpty>
        {!isLoading && results.length > 0 && (
          <CommandGroup heading="搜索结果">
            {results.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.title} ${item.path.join(' ')} ${item.id}`}
                onSelect={() => onSelect(item)}
                className="py-3"
              >
                {item.contentType === 'canvas'
                  ? <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  : <FileText className="h-4 w-4 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.path.length ? `${item.path.join(' / ')} · ` : ''}
                    {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <CommandShortcut>Enter</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>导航</span>
        <span className="flex items-center gap-1"><Kbd>Enter</Kbd>选择</span>
        <span className="ml-auto flex items-center gap-1"><Kbd>Esc</Kbd>关闭</span>
      </div>
    </CommandDialog>
  )
}

export default SearchModal
