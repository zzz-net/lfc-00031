import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useEditorStore } from '@/store/useEditorStore'
import type { ToastMessage } from '@/types'

const COLOR_MAP: Record<ToastMessage['type'], string> = {
  info: 'border-amberx/40 text-amberx',
  success: 'border-emeraldx/40 text-emeraldx',
  error: 'border-coral/40 text-coral',
  warning: 'border-amberx/40 text-amberx',
}

const ICON_BG: Record<ToastMessage['type'], string> = {
  info: 'bg-amberx/10',
  success: 'bg-emeraldx/10',
  error: 'bg-coral/10',
  warning: 'bg-amberx/10',
}

function ToastItem({ id, type, message }: ToastMessage) {
  const removeToast = useEditorStore((s) => s.removeToast)

  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), 4000)
    return () => clearTimeout(timer)
  }, [id, removeToast])

  return (
    <div
      className={`
        glass-panel flex items-center gap-3 rounded-lg border px-4 py-3
        animate-slideInRight min-w-[280px]
        ${COLOR_MAP[type]}
      `}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${ICON_BG[type]}`}>
        {type === 'error' ? '✕' : type === 'success' ? '✓' : type === 'warning' ? '!' : 'i'}
      </span>
      <span className="flex-1 text-sm text-abyss/90">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 rounded p-0.5 text-abyss/40 transition-colors hover:text-abyss/70"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function Toast() {
  const toasts = useEditorStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  )
}
