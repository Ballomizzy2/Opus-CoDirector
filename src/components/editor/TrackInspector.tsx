import type { Track, Op } from '../../store/types'
import { Music, Zap, Mic, Volume2, VolumeX } from 'lucide-react'

interface Props {
  track: Track
  dispatch: (op: Op) => void
}

export default function TrackInspector({ track, dispatch }: Props) {
  const Icon = track.type === 'music' ? Music : track.type === 'voiceover' ? Mic : Zap

  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div>
        <h3 className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
          <Icon size={14} />
          {track.label}
        </h3>
        <div className="text-[10px] text-neutral-400 mt-1">
          {track.type} • {track.startTime.toFixed(1)}s → {(track.startTime + track.duration).toFixed(1)}s
        </div>
      </div>

      <div>
        <span className="text-neutral-300 block mb-1">Volume</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(track.volume * 100)}
            onChange={e => dispatch({ type: 'track_volume', trackId: track.id, volume: parseInt(e.target.value) / 100 })}
            className="flex-1 h-2 rounded-full bg-neutral-600 accent-white"
          />
          <span className="text-[10px] text-white w-10 text-right">{Math.round(track.volume * 100)}%</span>
        </div>
      </div>

      <div>
        <span className="text-neutral-300 block mb-1">Mute</span>
        <button
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] transition-colors
            ${track.muted ? 'bg-red-900/40 text-red-400' : 'bg-neutral-600 text-neutral-300 hover:bg-neutral-500'}`}
          onClick={() => dispatch({ type: 'track_mute', trackId: track.id, muted: !track.muted })}
        >
          {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          {track.muted ? 'Unmute' : 'Mute'}
        </button>
      </div>

      {!track.src && track.type !== 'sfx' && (
        <p className="text-[10px] text-neutral-500 italic">Add src in demo data for playback</p>
      )}
    </div>
  )
}
