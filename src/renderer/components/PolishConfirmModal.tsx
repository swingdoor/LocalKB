import { markdownToHtml, sanitizePastedHtml } from '../utils/richPaste'

type AIMode = 'polish' | 'expand'

interface PolishConfirmModalProps {
  isOpen: boolean
  mode: AIMode
  originalText: string
  polishedText: string
  isLoading: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
  onOpenSettings: () => void
}

const modeConfig = {
  polish: {
    title: 'AI 润色',
    loadingText: 'AI 正在润色中...',
    resultLabel: '润色后',
    icon: (
      <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  expand: {
    title: 'AI 扩写',
    loadingText: 'AI 正在扩写中...',
    resultLabel: '扩写后',
    icon: (
      <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
      </svg>
    ),
  },
}

function PolishConfirmModal({
  isOpen,
  mode,
  originalText,
  polishedText,
  isLoading,
  error,
  onConfirm,
  onCancel,
  onOpenSettings,
}: PolishConfirmModalProps) {
  if (!isOpen) return null

  const config = modeConfig[mode]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            {config.icon}
            {config.title}
          </h2>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">{config.loadingText}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400 text-center mb-2">{error}</p>
              {error.includes('API Key') && (
                <button
                  onClick={onOpenSettings}
                  className="text-primary hover:underline text-sm"
                >
                  前往设置
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 原文 */}
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  原文
                </label>
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {originalText}
                </div>
              </div>

              {/* 结果 */}
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {config.resultLabel}
                </label>
                <div
                  className="ai-result-preview p-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-md text-gray-900 dark:text-white text-sm max-h-48 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizePastedHtml(markdownToHtml(polishedText)) }}
                />
              </div>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50"
          >
            取消
          </button>
          {!isLoading && !error && polishedText && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm text-white bg-primary hover:bg-primary/90 rounded-md"
            >
              替换原文
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PolishConfirmModal
