import { useRef, useEffect } from 'react'
import type { CommandLogEntry, Op } from '../../store/types'
import { Check, X, Loader, Undo2, Ban, ArrowRight } from 'lucide-react'

interface Props {
  entries: CommandLogEntry[]
  onClickEntry?: (clipIds: string[]) => void
}

const statusIcon: Record<string, React.ReactNode> = {
  applied: <Check size={12} className="text-emerald-400" />,
  failed: <X size={12} className="text-red-400" />,
  thinking: <Loader size={12} className="text-amber-400 animate-spin" />,
  undone: <Undo2 size={12} className="text-neutral-400" />,
  cancelled: <Ban size={12} className="text-neutral-500" />,
}

function confColor(c: number) {
  if (c >= 0.8) return 'text-emerald-400'
  if (c >= 0.6) return 'text-amber-400'
  return 'text-red-400'
}

export default function CommandLog({ entries, onClickEntry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400 text-xs">
        <p>Talk to your clips like a producer</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
      {entries.map(entry => (
        <div
          key={entry.id}
          className={`flex gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-neutral-600/50 transition-colors
            ${entry.status === 'undone' ? 'opacity-40' : ''}`}
          onClick={() => onClickEntry?.(entry.affectedClipIds)}
        >
          <div className="mt-0.5 shrink-0">{statusIcon[entry.status]}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-white leading-tight">"{entry.text}"</p>
            <p className={`text-[10px] mt-0.5 leading-tight flex items-center gap-0.5 ${entry.status === 'failed' ? 'text-red-400' : 'text-cyan-400'}`}>
              {entry.status === 'failed'
                ? <><X size={9} className="shrink-0" /> {entry.explanation}</>
                : <><ArrowRight size={9} className="shrink-0" /> {entry.explanation}</>}
            </p>
          </div>
          <span className={`text-[9px] font-mono shrink-0 mt-0.5 ${confColor(entry.confidence)}`}>
            {Math.round(entry.confidence * 100)}%
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
