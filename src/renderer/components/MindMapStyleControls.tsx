import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

export interface MindMapColorChoice {
  label: string
  value: string | undefined
}

export const MIND_MAP_TEXT_COLORS: readonly MindMapColorChoice[] = [
  { label: '默认', value: undefined }, { label: '深灰', value: '#27272a' },
  { label: '蓝色', value: '#2563eb' }, { label: '绿色', value: '#16a34a' },
  { label: '琥珀', value: '#d97706' }, { label: '红色', value: '#dc2626' },
  { label: '紫色', value: '#9333ea' },
]

export const MIND_MAP_BACKGROUND_COLORS: readonly MindMapColorChoice[] = [
  { label: '默认', value: undefined }, { label: '白色', value: '#ffffff' },
  { label: '浅蓝', value: '#eff6ff' }, { label: '浅绿', value: '#f0fdf4' },
  { label: '浅黄', value: '#fffbeb' }, { label: '浅红', value: '#fef2f2' },
  { label: '浅紫', value: '#faf5ff' },
]

export function MindMapColorSwatches({ name, value, options, onChange }: {
  name: string
  value?: string
  options: readonly MindMapColorChoice[]
  onChange: (value: string | undefined) => void
}) {
  return <div className="flex flex-wrap gap-1.5">
    {options.map((option) => {
      const selected = value === option.value
      return <button
        key={option.label}
        type="button"
        title={option.label}
        aria-label={`${name}：${option.label}`}
        aria-pressed={selected}
        className={cn(
          'relative grid h-6 w-6 place-items-center rounded-md border border-border bg-background outline-none transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring',
          !option.value && 'bg-[linear-gradient(135deg,transparent_46%,hsl(var(--muted-foreground))_47%,hsl(var(--muted-foreground))_53%,transparent_54%)]',
          selected && 'ring-2 ring-ring ring-offset-1',
        )}
        style={option.value ? { backgroundColor: option.value } : undefined}
        onClick={() => onChange(option.value)}
      >
        {selected && <Check className={cn('h-3 w-3', option.value && option.value !== '#ffffff' ? 'text-white drop-shadow' : 'text-foreground')} />}
      </button>
    })}
  </div>
}

export function MindMapPropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="min-w-0">{children}</div>
  </div>
}
