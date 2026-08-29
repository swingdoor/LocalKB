import { useEffect, useState } from 'react'
import { AlertTriangle, Expand, Loader2, Sparkles, WandSparkles } from 'lucide-react'
import type { AIMode, AIProcessPhase } from '../hooks/useAIProcess'
import { markdownToHtml, sanitizePastedHtml } from '../utils/richPaste'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Textarea } from './ui/textarea'

interface AIProcessModalProps {
  isOpen: boolean
  mode: AIMode
  phase: AIProcessPhase
  originalText: string
  processedText: string
  error?: string
  onSubmitInstruction: (instruction: string) => void
  onReviseInstruction: () => void
  onConfirm: () => void
  onCancel: () => void
  onOpenSettings: () => void
}

const modeConfig = {
  polish: {
    title: 'AI 润色',
    loadingText: 'AI 正在润色中…',
    resultLabel: '润色结果',
    description: '润色选中的文字，并确认是否替换原文。',
    icon: Sparkles,
  },
  expand: {
    title: 'AI 扩写',
    loadingText: 'AI 正在扩写中…',
    resultLabel: '扩写结果',
    description: '扩写选中的文字，并确认是否替换原文。',
    icon: Expand,
  },
  custom: {
    title: '自定义修改',
    loadingText: 'AI 正在按指令修改…',
    resultLabel: '自定义修改结果',
    description: '输入一条仅用于本次操作的指令，然后确认修改结果。',
    icon: WandSparkles,
  },
} as const

export default function AIProcessModal({
  isOpen,
  mode,
  phase,
  originalText,
  processedText,
  error,
  onSubmitInstruction,
  onReviseInstruction,
  onConfirm,
  onCancel,
  onOpenSettings,
}: AIProcessModalProps) {
  const [instruction, setInstruction] = useState('')
  const config = modeConfig[mode]
  const ModeIcon = config.icon

  useEffect(() => {
    if (isOpen && phase === 'instruction') setInstruction('')
  }, [isOpen, phase])

  const submitInstruction = () => {
    const value = instruction.trim()
    if (value) onSubmitInstruction(value)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ModeIcon className="h-5 w-5 text-primary" />
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <section>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">原文</h3>
            <div className="max-h-32 overflow-y-auto rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">
              {originalText}
            </div>
          </section>

          {phase === 'instruction' && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">本次修改指令</h3>
              <Textarea
                autoFocus
                aria-label="自定义修改指令"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitInstruction()
                }}
                placeholder="例如：改写得更简洁，保留所有数字和专有名词"
                className="min-h-28 resize-y"
              />
              <p className="mt-2 text-xs text-muted-foreground">该指令仅用于本次操作，不会保存。</p>
            </section>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-10">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{config.loadingText}</p>
              <p className="mt-2 text-xs text-muted-foreground">关闭窗口将终止本次操作</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center rounded-md border border-destructive/20 py-8">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <p className="mb-2 text-center text-sm text-destructive">{error}</p>
              {error?.includes('API Key') && (
                <Button type="button" variant="link" size="sm" onClick={onOpenSettings}>前往设置</Button>
              )}
            </div>
          )}

          {phase === 'result' && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">{config.resultLabel}</h3>
              <div
                className="ai-result-preview max-h-56 overflow-y-auto rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: sanitizePastedHtml(markdownToHtml(processedText)) }}
              />
            </section>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            {phase === 'loading' ? '终止并关闭' : '取消'}
          </Button>
          {phase === 'instruction' && (
            <Button type="button" disabled={!instruction.trim()} onClick={submitInstruction}>执行</Button>
          )}
          {phase === 'result' && processedText && (
            <>
              {mode === 'custom' && (
                <Button type="button" variant="secondary" onClick={onReviseInstruction}>
                  重新修改
                </Button>
              )}
              <Button type="button" onClick={onConfirm}>替换原文</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
