import { useRef, useMemo, useCallback } from 'react'
import type { Timeline as TimelineType, Op, Clip } from '../../store/types'
import { Sparkles, Gauge, Captions } from 'lucide-react'

const PX_PER_SEC = 14

function scoreColor(score: number | null) {
  if (score == null) return 'bg-neutral-500'
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

interface Props {
  timeline: TimelineType
  dispatch: (op: Op) => void
}

export default function Timeline({ timeline, dispatch }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const clipPositions = useMemo(() => {
    let x = 0
    return timeline.clips.map(clip => {
      const pos = { x, width: clip.effectiveDuration * PX_PER_SEC }
      x += pos.width
      return pos
    })
  }, [timeline.clips])

  const totalWidth = useMemo(
    () => timeline.clips.reduce((s, c) => s + c.effectiveDuration * PX_PER_SEC, 0),
    [timeline.clips],
  )

  const playheadX = timeline.playhead * PX_PER_SEC

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left + (e.currentTarget.scrollLeft ?? 0)
    const time = x / PX_PER_SEC
    dispatch({ type: 'seek', time: Math.max(0, Math.min(time, timeline.duration)) })
  }, [dispatch, timeline.duration])

  const handleClipClick = useCallback((e: React.MouseEvent, clipId: string) => {
    e.stopPropagation()
    dispatch({ type: 'select', clipId })
  }, [dispatch])

  // Time markers
  const markers = useMemo(() => {
    const result: number[] = []
    for (let t = 0; t <= timeline.duration; t += 5) result.push(t)
    return result
  }, [timeline.duration])

  return (
    <div className="relative select-none">
      {/* Time ruler */}
      <div
        className="relative h-5 overflow-hidden border-b border-neutral-500/30"
        style={{ width: Math.max(totalWidth, 600) }}
      >
        {markers.map(t => (
          <div
            key={t}
            className="absolute top-0 text-[9px] text-neutral-400 leading-5"
            style={{ left: t * PX_PER_SEC }}
          >
            <div className="absolute left-0 bottom-0 w-px h-2 bg-neutral-500" />
            <span className="ml-1">{formatTime(t)}</span>
          </div>
        ))}
      </div>

      {/* Clip track */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto overflow-y-hidden cursor-crosshair"
        style={{ minHeight: 72 }}
        onClick={handleTimelineClick}
      >
        <div className="relative" style={{ width: Math.max(totalWidth + 40, 600), height: 68 }}>
          {timeline.clips.map((clip, i) => (
            <ClipBlock
              key={clip.id}
              clip={clip}
              x={clipPositions[i]?.x ?? 0}
              width={clipPositions[i]?.width ?? 0}
              selected={clip.id === timeline.selectedClipId}
              onClick={(e) => handleClipClick(e, clip.id)}
            />
          ))}

          {/* Playhead — inside clip container, after all clips, with highest z-index */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none transition-[left] duration-75"
            style={{ left: playheadX, zIndex: 9999 }}
          >
            <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-red-300 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ClipBlock({ clip, x, width, selected, onClick }: {
  clip: Clip; x: number; width: number; selected: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const minWidth = Math.max(width, 38)
  return (
    <div
      data-clip-id={clip.id}
      className={`absolute top-1 rounded-md cursor-pointer transition-all duration-300 ease-out
        border-2 overflow-hidden group
        ${selected
          ? 'border-white shadow-[0_0_12px_rgba(255,255,255,0.3)] z-[2]'
          : 'border-transparent hover:border-neutral-400 z-[1]'}
      `}
      style={{
        left: x,
        width: minWidth,
        height: 60,
        backgroundColor: clip.color + '33',
      }}
      onClick={onClick}
    >
      {/* Color bar at top */}
      <div className="h-1 w-full" style={{ backgroundColor: clip.color }} />

      <div className="px-1.5 py-0.5 h-full flex flex-col justify-between">
        {/* Label */}
        <p className="text-[10px] text-white font-medium leading-tight truncate">
          {clip.label.split(' — ')[0]}
        </p>

        {/* Bottom row */}
        <div className="flex items-center justify-between gap-1">
          {/* Score badge */}
          {clip.viralityScore != null && (
            <span className={`text-[8px] font-bold text-white px-1 py-px rounded ${scoreColor(clip.viralityScore)}`}>
              {clip.viralityScore}
            </span>
          )}

          <div className="flex items-center gap-0.5">
            {clip.speed !== 1 && (
              <span className="text-[8px] text-amber-300 flex items-center gap-0.5">
                <Gauge size={8} /> {clip.speed}x
              </span>
            )}
            {clip.captions.length > 0 && <Captions size={8} className="text-cyan-400" />}
            {clip.effects.length > 0 && <Sparkles size={8} className="text-white/70" />}
          </div>

          <span className="text-[8px] text-neutral-300">{clip.effectiveDuration.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  )
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
