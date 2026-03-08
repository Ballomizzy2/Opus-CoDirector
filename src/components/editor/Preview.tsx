import type { Clip, TextLayer } from '../../store/types'
import { Sparkles, Gauge, MessageSquare } from 'lucide-react'

interface Props {
  clip: Clip | null
  playhead: number
  playing: boolean
  textLayers: TextLayer[]
  videoRef?: React.RefObject<HTMLVideoElement | null>
  videoSrc?: string
}

function scoreColor(score: number | null) {
  if (score == null) return 'text-neutral-400'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

export default function Preview({ clip, playhead, playing, textLayers, videoRef, videoSrc }: Props) {
  if (!clip) {
    return (
      <div className="w-full aspect-[9/16] max-h-full bg-neutral-600 rounded-xl border border-neutral-500/40 flex items-center justify-center">
        <div className="text-center px-4">
          <MessageSquare size={28} className="text-neutral-400 mx-auto mb-2" />
          <p className="text-xs text-neutral-400">Select a clip or say</p>
          <p className="text-xs text-white/70 mt-0.5">"select the hook"</p>
        </div>
      </div>
    )
  }

  const showVideo = videoSrc && videoRef

  return (
    <div className="w-full aspect-[9/16] max-h-full rounded-xl border border-neutral-500/40 overflow-hidden relative bg-black"
         style={!showVideo ? { backgroundColor: clip.color + '22' } : undefined}>
      {/* Video layer — 9:16 vertical frame, video contained (pillarboxed if source is 16:9) */}
      {showVideo && (
        <video
          ref={videoRef}
          src={videoSrc}
          className="absolute inset-0 w-full h-full object-contain"
          muted={false}
          playsInline
          preload="auto"
        />
      )}

      {/* Top bar overlay */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none">
        {clip.viralityScore != null && (
          <span className={`text-xs font-bold ${scoreColor(clip.viralityScore)}`}>
            {clip.viralityScore}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {clip.speed !== 1 && (
            <span className="text-[10px] text-amber-300 flex items-center gap-0.5 bg-black/40 px-1.5 py-0.5 rounded">
              <Gauge size={10} /> {clip.speed}x
            </span>
          )}
          {clip.effects.map(e => (
            <span key={e} className="text-[10px] text-white/80 bg-black/40 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Sparkles size={9} /> {e}
            </span>
          ))}
        </div>
      </div>

      {/* Center content — placeholder when no video */}
      {!showVideo && (
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
      )}

      {/* Timeline text layer overlays (visible when playhead in range) */}
      {textLayers
        .filter(tl => playhead >= tl.startTime && playhead < tl.endTime)
        .map(tl => (
          <div
            key={tl.id}
            className={`absolute inset-x-0 text-center z-10 pointer-events-none px-4
              ${tl.position === 'top' ? 'top-[10%]' : tl.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-[15%]'}`}
          >
            <p
              className={`inline-block px-3 py-1.5 rounded text-sm font-bold
                ${tl.style === 'glow' ? 'text-white shadow-[0_0_12px_rgba(255,255,255,0.6)]' : ''}
                ${tl.style === 'bold' ? 'text-white' : ''}
                ${tl.style === 'outline' ? 'text-white [text-shadow:_-1px_-1px_0_#000,_1px_-1px_0_#000,_-1px_1px_0_#000,_1px_1px_0_#000]' : ''}
                bg-black/50`}
            >
              {tl.text}
            </p>
          </div>
        ))}

      {/* Playback indicator */}
      {playing && (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-neutral-500 z-10">
          <div className="h-full bg-white animate-[progress_3s_linear_infinite]" style={{ width: '60%' }} />
        </div>
      )}
    </div>
  )
}
