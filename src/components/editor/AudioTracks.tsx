import type { Track, Op } from '../../store/types'
import { Volume2, VolumeX, Music, Zap } from 'lucide-react'

const PX_PER_SEC = 14

interface Props {
  tracks: Track[]
  totalDuration: number
  dispatch: (op: Op) => void
}

export default function AudioTracks({ tracks, totalDuration, dispatch }: Props) {
  const totalWidth = Math.max(totalDuration * PX_PER_SEC + 40, 600)

  return (
    <div className="mt-1 space-y-0.5">
      {tracks.map(track => (
        <div key={track.id} className="flex items-center gap-2 h-7">
          {/* Label + icon */}
          <div className="w-28 shrink-0 flex items-center gap-1.5 text-[10px] text-neutral-300">
            {track.type === 'music' ? <Music size={10} /> : <Zap size={10} />}
            <span className="truncate">{track.label}</span>
          </div>

          {/* Track bar */}
          <div className="relative flex-1 h-5 bg-neutral-600/40 rounded overflow-hidden" style={{ minWidth: totalWidth }}>
            <div
              className={`absolute top-0 h-full rounded ${track.muted ? 'bg-neutral-500/50' : 'bg-indigo-500/25'} border ${track.muted ? 'border-neutral-500' : 'border-indigo-500/40'}`}
              style={{
                left: track.startTime * PX_PER_SEC,
                width: track.duration * PX_PER_SEC,
              }}
            >
              {/* Fake waveform */}
              <svg className="w-full h-full opacity-30" preserveAspectRatio="none">
                <path
                  d={generateWaveform(track.duration * PX_PER_SEC, 20)}
                  fill="none"
                  stroke={track.muted ? '#a3a3a3' : '#818cf8'}
                  strokeWidth="1"
                />
              </svg>
            </div>
          </div>

          {/* Volume */}
          <div className="w-8 text-[9px] text-neutral-400 text-right shrink-0">
            {Math.round(track.volume * 100)}%
          </div>

          {/* Mute toggle */}
          <button
            className={`shrink-0 p-0.5 rounded ${track.muted ? 'text-red-400' : 'text-neutral-400 hover:text-white'}`}
            onClick={() => dispatch({ type: 'track_mute', trackId: track.id, muted: !track.muted })}
          >
            {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
        </div>
      ))}
    </div>
  )
}

function generateWaveform(width: number, height: number): string {
  const points: string[] = [`M 0 ${height / 2}`]
  const step = 3
  for (let x = 0; x < width; x += step) {
    const amp = (Math.sin(x * 0.15) * 0.3 + Math.sin(x * 0.07) * 0.5 + Math.random() * 0.2) * height * 0.4
    points.push(`L ${x} ${height / 2 + amp}`)
  }
  return points.join(' ')
}
