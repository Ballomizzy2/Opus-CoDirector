import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'

export interface Toast {
  id: string
  message: string
  destructive: boolean
  timestamp: number
}

interface Props {
  toasts: Toast[]
  onUndo: () => void
  onDismiss: (id: string) => void
}

export default function UndoToast({ toasts, onUndo, onDismiss }: Props) {
  return (
    <div className="fixed bottom-[38%] right-4 flex flex-col-reverse gap-1.5 z-50 pointer-events-none">
      {toasts.slice(0, 3).map(toast => (
        <ToastItem key={toast.id} toast={toast} onUndo={onUndo} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onUndo, onDismiss }: { toast: Toast; onUndo: () => void; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(true)
  const ttl = toast.destructive ? 8000 : 4000

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 300)
    }, ttl)
    return () => clearTimeout(timer)
  }, [toast.id, ttl, onDismiss])

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-500/40 shadow-lg
                  transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <span className="text-xs text-white">{toast.message}</span>
      <button
        className="flex items-center gap-1 text-[10px] text-white hover:text-neutral-200 font-medium"
        onClick={() => { onUndo(); onDismiss(toast.id) }}
      >
        <Undo2 size={10} /> Undo
      </button>
    </div>
  )
}
