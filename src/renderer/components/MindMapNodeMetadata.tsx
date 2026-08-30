import { useEffect, useState } from 'react'
import type { NodeObj } from 'mind-elixir'
import { Info } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Textarea } from './ui/textarea'

interface Props {
  node: NodeObj | null
  nodeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (patch: Partial<NodeObj>) => void
  portalContainer: HTMLElement | null
}

export function parseMindMapTags(value: string): string[] {
  return [...new Set(value
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean))]
}

export default function MindMapNodeMetadata({
  node, nodeId, open, onOpenChange, onSave, portalContainer,
}: Props) {
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    setLink(node?.hyperLink ?? '')
    setNote(node?.note ?? '')
    setTags(node?.tags?.map((tag) => typeof tag === 'string' ? tag : tag.text).join(', ') ?? '')
  }, [nodeId, node?.hyperLink, node?.note, node?.tags])

  const save = async () => {
    if (!node) return
    const tagValues = parseMindMapTags(tags)
    onSave({
      hyperLink: link.trim() || undefined, note: note.trim() || undefined,
      tags: tagValues.length > 0 ? tagValues : undefined,
    } as Partial<NodeObj>)
    onOpenChange(false)
  }

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={!node}><Info />节点信息</Button></PopoverTrigger>
    <PopoverContent portalContainer={portalContainer} align="start" className="w-80 space-y-4 pointer-events-auto" data-mindmap-floating-control="">
      <div><h4 className="text-sm font-medium">节点信息</h4><p className="text-xs text-muted-foreground">超链接、备注和标签属于节点内容，不影响节点样式。</p></div>
      <div className="space-y-2"><Label htmlFor="mindmap-link">超链接</Label><Input id="mindmap-link" value={link} placeholder="https://" onChange={(event) => setLink(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="mindmap-note">备注</Label><Textarea id="mindmap-note" value={note} rows={4} placeholder="添加节点备注；保存后可点击节点旁的备注图标查看" onChange={(event) => setNote(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="mindmap-tags">标签</Label><Input id="mindmap-tags" value={tags} placeholder="使用逗号分隔多个标签" onChange={(event) => setTags(event.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button><Button type="button" size="sm" onClick={() => void save()}>保存信息</Button></div>
    </PopoverContent>
  </Popover>
}
