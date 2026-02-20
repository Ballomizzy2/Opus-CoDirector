import type { Op } from '../../store/types'
import { Play, Pause, SkipBack } from 'lucide-react'

interface Props {
  playing: boolean
  playhead: number
  duration: number
  dispatch: (op: Op) => void
}

export default function Transport({ playing, playhead, duration, dispatch }: Props) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5">
      <button
        className="p-1 rounded hover:bg-neutral-600 text-neutral-300 hover:text-white transition-colors"
        onClick={() => dispatch({ type: 'seek', time: 0 })}
      >
        <SkipBack size={14} />
      </button>

      <button
        className={`p-1.5 rounded-full transition-colors ${
          playing ? 'bg-white text-neutral-900 hover:bg-neutral-200' : 'bg-neutral-600 text-white hover:bg-neutral-500'
        }`}
        onClick={() => dispatch({ type: playing ? 'pause' : 'play' })}
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>

      <div className="text-[11px] font-mono text-neutral-300 tabular-nums">
        <span className="text-white">{formatTime(playhead)}</span>
        <span className="mx-1 text-neutral-500">/</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
