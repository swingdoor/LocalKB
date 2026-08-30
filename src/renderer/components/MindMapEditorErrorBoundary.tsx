import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClose: () => void
}

interface State {
  error: Error | null
}

export default class MindMapEditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[mind map editor render error]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-6">
      <div className="w-full max-w-xl space-y-4 rounded-lg border bg-background p-5 shadow-xl">
        <div>
          <h2 className="text-base font-semibold text-destructive">思维导图编辑器发生错误</h2>
          <p className="mt-1 text-sm text-muted-foreground">错误已输出到启动终端，原文档和思维导图数据未被替换。</p>
        </div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs text-destructive">{this.state.error.message}</pre>
        <div className="flex justify-end">
          <button type="button" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent" onClick={this.props.onClose}>关闭编辑器</button>
        </div>
      </div>
    </div>
  }
}
