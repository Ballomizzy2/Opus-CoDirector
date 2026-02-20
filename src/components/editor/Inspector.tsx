import type { Clip, Op, Timeline } from '../../store/types'
import { AVAILABLE_EFFECTS } from '../../store/types'
import { Trash2, Copy, Scissors, X, Plus, ChevronUp, ChevronDown } from 'lucide-react'

interface Props {
  clip: Clip
  clipStartTime: number
  dispatch: (op: Op) => void
}

export default function Inspector({ clip, clipStartTime, dispatch }: Props) {
  const speedPresets = [0.5, 1, 1.5, 2]

  return (
    <div className="flex flex-col gap-2.5 text-xs">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-white truncate">{clip.label}</h3>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400">
          <span>Original: {clip.duration.toFixed(1)}s</span>
          <span>·</span>
          <span>Effective: {clip.effectiveDuration.toFixed(1)}s</span>
        </div>
      </div>

      {/* Virality Score */}
      {clip.viralityScore != null && (
        <div className="flex items-center justify-between">
          <span className="text-neutral-300">Virality</span>
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-neutral-500 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${clip.viralityScore >= 80 ? 'bg-emerald-500' : clip.viralityScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${clip.viralityScore}%` }}
              />
            </div>
            <span className="text-white font-medium w-6 text-right">{clip.viralityScore}</span>
          </div>
        </div>
      )}

      {/* Trim */}
      <div>
        <span className="text-neutral-300 block mb-1">Trim</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-400 w-7">Start</span>
            <button className="p-0.5 rounded bg-neutral-600 hover:bg-neutral-500" onClick={() => dispatch({ type: 'trim_start', clipId: clip.id, amount: -0.5 })}>
              <ChevronDown size={10} />
            </button>
            <span className="w-7 text-center text-white">{clip.trimStart.toFixed(1)}</span>
            <button className="p-0.5 rounded bg-neutral-600 hover:bg-neutral-500" onClick={() => dispatch({ type: 'trim_start', clipId: clip.id, amount: 0.5 })}>
              <ChevronUp size={10} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-400 w-5">End</span>
            <button className="p-0.5 rounded bg-neutral-600 hover:bg-neutral-500" onClick={() => dispatch({ type: 'trim_end', clipId: clip.id, amount: -0.5 })}>
              <ChevronDown size={10} />
            </button>
            <span className="w-7 text-center text-white">{clip.trimEnd.toFixed(1)}</span>
            <button className="p-0.5 rounded bg-neutral-600 hover:bg-neutral-500" onClick={() => dispatch({ type: 'trim_end', clipId: clip.id, amount: 0.5 })}>
              <ChevronUp size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* Speed */}
      <div>
        <span className="text-neutral-300 block mb-1">Speed</span>
        <div className="flex gap-1">
          {speedPresets.map(s => (
            <button
              key={s}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
                ${clip.speed === s ? 'bg-white text-neutral-900' : 'bg-neutral-600 text-neutral-300 hover:bg-neutral-500'}`}
              onClick={() => dispatch({ type: 'speed', clipId: clip.id, speed: s })}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Effects */}
      <div>
        <span className="text-neutral-300 block mb-1">Effects</span>
        <div className="flex flex-wrap gap-1">
          {clip.effects.map(e => (
            <span key={e} className="inline-flex items-center gap-0.5 text-[10px] bg-white/10 text-white/80 px-1.5 py-0.5 rounded">
              {e}
              <button onClick={() => dispatch({ type: 'effect_remove', clipId: clip.id, effectId: e })}>
                <X size={8} />
              </button>
            </span>
          ))}
          <select
            className="text-[10px] bg-neutral-600 border border-neutral-500 rounded px-1 py-0.5 text-neutral-300"
            value=""
            onChange={e => {
              if (e.target.value) dispatch({ type: 'effect_add', clipId: clip.id, effectId: e.target.value })
            }}
          >
            <option value="">+ Add</option>
            {AVAILABLE_EFFECTS.filter(e => !clip.effects.includes(e)).map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Captions */}
      {clip.captions.length > 0 && (
        <div>
          <span className="text-neutral-300 block mb-1">Captions</span>
          {clip.captions.map(cap => (
            <div key={cap.id} className="flex items-center justify-between bg-neutral-600/50 rounded px-2 py-1 mb-0.5">
              <span className="text-white text-[10px] truncate flex-1">"{cap.text}"</span>
              <span className="text-[9px] text-neutral-400 mx-1">{cap.style}</span>
              <button className="text-neutral-400 hover:text-red-400" onClick={() => dispatch({ type: 'caption_remove', clipId: clip.id, captionId: cap.id })}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1 mt-1 pt-2 border-t border-neutral-500/30">
        <button
          className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-600 hover:bg-neutral-500 text-neutral-300 text-[10px]"
          onClick={() => dispatch({ type: 'duplicate', clipId: clip.id })}
        >
          <Copy size={10} /> Duplicate
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-600 hover:bg-neutral-500 text-neutral-300 text-[10px]"
          onClick={() => dispatch({ type: 'cut', clipId: clip.id, at: clipStartTime + clip.effectiveDuration / 2 })}
        >
          <Scissors size={10} /> Cut
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 text-[10px] ml-auto"
          onClick={() => dispatch({ type: 'delete', clipId: clip.id })}
        >
          <Trash2 size={10} /> Delete
        </button>
      </div>
    </div>
  )
}
