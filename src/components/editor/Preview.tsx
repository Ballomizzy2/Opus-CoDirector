import type { Clip } from '../../store/types'
import { Sparkles, Gauge, MessageSquare } from 'lucide-react'

interface Props {
  clip: Clip | null
  playhead: number
  playing: boolean
}

function scoreColor(score: number | null) {
  if (score == null) return 'text-neutral-400'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

export default function Preview({ clip, playing }: Props) {
  if (!clip) {
    return (
      <div className="w-full h-full bg-neutral-600 rounded-xl border border-neutral-500/40 flex items-center justify-center">
        <div className="text-center px-4">
          <MessageSquare size={28} className="text-neutral-400 mx-auto mb-2" />
          <p className="text-xs text-neutral-400">Select a clip or say</p>
          <p className="text-xs text-white/70 mt-0.5">"select the hook"</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full rounded-xl border border-neutral-500/40 overflow-hidden relative"
         style={{ backgroundColor: clip.color + '22' }}>
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-b from-black/40 to-transparent z-10">
        {clip.viralityScore != null && (
          <span className={`text-xs font-bold ${scoreColor(clip.viralityScore)}`}>
            {clip.viralityScore}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {clip.speed !== 1 && (
            <span className="text-[10px] text-amber-300 flex items-center gap-0.5 bg-black/30 px-1.5 py-0.5 rounded">
              <Gauge size={10} /> {clip.speed}x
            </span>
          )}
          {clip.effects.map(e => (
            <span key={e} className="text-[10px] text-white/80 bg-black/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Sparkles size={9} /> {e}
            </span>
          ))}
        </div>
      </div>

      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
               style={{ backgroundColor: clip.color + '44', border: `2px solid ${clip.color}` }}>
            <span className="text-2xl font-bold text-white/80">
              {clip.label.charAt(0)}
            </span>
          </div>
          <p className="text-sm text-white font-medium leading-snug">{clip.label.split(' — ')[0]}</p>
          <p className="text-[11px] text-neutral-300 mt-0.5">{clip.label.split(' — ')[1] ?? ''}</p>
        </div>
      </div>

      {/* Caption overlay */}
      {clip.captions.length > 0 && (
        <div className="absolute bottom-8 inset-x-0 text-center z-10">
          {clip.captions.map(cap => (
            <p
              key={cap.id}
              className={`inline-block px-3 py-1 rounded text-sm font-bold
                ${cap.style === 'glow' ? 'text-white shadow-[0_0_12px_rgba(255,255,255,0.6)]' : ''}
                ${cap.style === 'bold' ? 'text-white' : ''}
                ${cap.style === 'karaoke' ? 'text-yellow-300' : ''}
                ${cap.style === 'outline' ? 'text-white [text-shadow:_-1px_-1px_0_#000,_1px_-1px_0_#000,_-1px_1px_0_#000,_1px_1px_0_#000]' : ''}
                bg-black/40`}
            >
              {cap.text}
            </p>
          ))}
        </div>
      )}

      {/* Playback indicator */}
      {playing && (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-neutral-500">
          <div className="h-full bg-white animate-[progress_3s_linear_infinite]" style={{ width: '60%' }} />
        </div>
      )}
    </div>
  )
}
