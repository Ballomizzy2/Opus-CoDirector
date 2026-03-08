import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import type { Timeline as TimelineType, Op, Clip, Track, TextLayer } from '../../store/types'
import { Sparkles, Gauge, Captions, Music, Zap, Volume2, VolumeX, Film, Mic, Type } from 'lucide-react'

const PX_PER_SEC = 14
const LABEL_WIDTH = 112

function scoreColor(score: number | null) {
  if (score == null) return 'bg-neutral-500'
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
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

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  timeline: TimelineType
  dispatch: (op: Op) => void
}

export default function TimelineTracks({ timeline, dispatch }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const clipPositions = useMemo(() => {
    let x = 0
    return timeline.clips.map(clip => {
      const pos = { x, width: clip.effectiveDuration * PX_PER_SEC }
      x += pos.width
      return pos
    })
  }, [timeline.clips])

  const totalWidth = useMemo(
    () => Math.max(
      timeline.clips.reduce((s, c) => s + c.effectiveDuration * PX_PER_SEC, 0) + 40,
      timeline.duration * PX_PER_SEC + 40,
      600,
    ),
    [timeline.clips, timeline.duration],
  )

  const playheadX = timeline.playhead * PX_PER_SEC

  const getTimeFromEvent = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    return Math.max(0, Math.min(x / PX_PER_SEC, timeline.duration))
  }, [timeline.duration])

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-clip-id], [data-text-layer-id]')) return
    const time = getTimeFromEvent(e)
    dispatch({ type: 'seek', time })
  }, [dispatch, getTimeFromEvent])

  // Draggable playhead
  const [isDragging, setIsDragging] = useState(false)
  const playheadRef = useRef<HTMLDivElement>(null)
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])
  const handlePlayheadTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true)
  }, [])

    useEffect(() => {
    if (!isDragging) return
    const contentLeft = LABEL_WIDTH
    const handleMove = (clientX: number) => {
      const container = scrollRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const scrollLeft = container.scrollLeft
      const contentX = clientX - rect.left + scrollLeft - contentLeft
      const time = Math.max(0, Math.min(contentX / PX_PER_SEC, timeline.duration))
      dispatch({ type: 'seek', time })
    }
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX)
    const onMouseUp = () => setIsDragging(false)
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length) handleMove(e.touches[0].clientX)
    }
    const onTouchEnd = () => setIsDragging(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [isDragging, dispatch, timeline.duration])

  const handleClipClick = useCallback((e: React.MouseEvent, clipId: string) => {
    e.stopPropagation()
    dispatch({ type: 'select', clipId })
  }, [dispatch])

  const markers = useMemo(() => {
    const result: number[] = []
    for (let t = 0; t <= timeline.duration; t += 5) result.push(t)
    return result
  }, [timeline.duration])

  return (
    <div ref={scrollRef} className="overflow-x-auto overflow-y-auto">
      <div className="relative select-none" style={{ minWidth: LABEL_WIDTH + totalWidth }}>
        {/* Time ruler — spans full width, aligns with track content */}
        <div className="flex border-b border-neutral-500/30">
          <div className="shrink-0 w-0" style={{ width: LABEL_WIDTH }} />
          <div
            data-ruler-content
            className="relative h-5 shrink-0 cursor-pointer"
            style={{ width: totalWidth }}
            onClick={handleTimelineClick}
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
        </div>

        {/* Clips track */}
        <div className="flex items-stretch border-b border-neutral-500/20">
          <div
            className="shrink-0 flex items-center gap-1.5 text-[10px] text-neutral-300 px-2 border-r border-neutral-500/30"
            style={{ width: LABEL_WIDTH, minHeight: 72 }}
          >
            <Film size={10} />
            <span>Clips</span>
          </div>
          <div
            className="relative cursor-crosshair flex-1 shrink-0"
            style={{ width: totalWidth, minHeight: 72 }}
            onClick={handleTimelineClick}
          >
            <div className="relative h-full" style={{ height: 68 }}>
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
            </div>
          </div>
        </div>

        {/* Text layer track */}
        <div className="flex items-stretch border-b border-neutral-500/20">
          <div
            className="shrink-0 flex items-center gap-1.5 text-[10px] text-neutral-300 px-2 border-r border-neutral-500/30"
            style={{ width: LABEL_WIDTH, minHeight: 40 }}
          >
            <Type size={10} />
            <span>Text</span>
          </div>
          <div
            className="relative flex-1 shrink-0 cursor-pointer"
            style={{ width: totalWidth, minHeight: 40 }}
            onClick={handleTimelineClick}
          >
            <div className="relative h-full py-1">
              {timeline.textLayers.map(tl => (
                  <div
                    key={tl.id}
                    data-text-layer-id={tl.id}
                    className={`absolute top-1 rounded cursor-pointer border transition-all
                      ${tl.id === timeline.selectedTextLayerId
                        ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.3)] z-[2]'
                        : 'border-transparent hover:border-neutral-400 z-[1]'}
                      bg-amber-500/30`}
                    style={{
                      left: tl.startTime * PX_PER_SEC,
                      width: Math.max((tl.endTime - tl.startTime) * PX_PER_SEC, 40),
                      height: 20,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      dispatch({ type: 'select_text_layer', textLayerId: tl.id })
                    }}
                  >
                    <span className="text-[9px] text-white truncate block px-1.5 py-0.5">{tl.text}</span>
                  </div>
              ))}
            </div>
          </div>
        </div>

        {/* Audio tracks — same time axis */}
        {timeline.tracks.map(track => (
          <div
            key={track.id}
            data-track-id={track.id}
            data-track-row
            className={`flex items-center gap-2 h-8 border-b border-neutral-500/10 cursor-pointer transition-colors
              ${track.id === timeline.selectedTrackId ? 'bg-white/5' : 'hover:bg-white/[0.02]'}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return
              e.stopPropagation()
              dispatch({ type: 'select_track', trackId: track.id })
            }}
          >
            <div
              className={`shrink-0 flex items-center gap-1.5 text-[10px] px-2 border-r border-neutral-500/30
                ${track.id === timeline.selectedTrackId ? 'text-white' : 'text-neutral-300'}`}
              style={{ width: LABEL_WIDTH }}
            >
              {track.type === 'music' ? <Music size={10} /> : track.type === 'voiceover' ? <Mic size={10} /> : <Zap size={10} />}
              <span className="truncate">{track.label}</span>
            </div>
            <div
              className="relative flex-1 h-5 bg-neutral-600/40 rounded overflow-hidden shrink-0 cursor-pointer"
              style={{ width: totalWidth }}
              onClick={(e) => { e.stopPropagation(); handleTimelineClick(e) }}
            >
              {track.segments?.length ? (
                track.segments.map(seg => (
                  <div
                    key={seg.id}
                    data-track-id={track.id}
                    data-segment-id={seg.id}
                    className={`absolute top-0 h-full rounded ${track.muted ? 'bg-neutral-500/50' : 'bg-indigo-500/25'} border
                      ${track.id === timeline.selectedTrackId ? 'border-white/60 ring-1 ring-white/30' : track.muted ? 'border-neutral-500' : 'border-indigo-500/40'}`}
                    style={{
                      left: seg.startTime * PX_PER_SEC,
                      width: Math.max(seg.duration * PX_PER_SEC, 12),
                    }}
                  >
                    <span className="text-[8px] text-white/70 absolute inset-0 flex items-center justify-center truncate px-0.5">
                      {seg.sfxType}
                    </span>
                  </div>
                ))
              ) : (
                <div
                  data-track-id={track.id}
                  className={`absolute top-0 h-full rounded ${track.muted ? 'bg-neutral-500/50' : 'bg-indigo-500/25'} border
                    ${track.id === timeline.selectedTrackId ? 'border-white/60 ring-1 ring-white/30' : track.muted ? 'border-neutral-500' : 'border-indigo-500/40'}`}
                  style={{
                    left: track.startTime * PX_PER_SEC,
                    width: track.duration * PX_PER_SEC,
                  }}
                >
                  <svg className="w-full h-full opacity-30" preserveAspectRatio="none">
                    <path
                      d={generateWaveform(track.duration * PX_PER_SEC, 20)}
                      fill="none"
                      stroke={track.muted ? '#a3a3a3' : '#818cf8'}
                      strokeWidth="1"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="w-12 shrink-0 flex items-center gap-1">
              <span className="text-[9px] text-neutral-400">{Math.round(track.volume * 100)}%</span>
              <button
                className={`p-0.5 rounded ${track.muted ? 'text-red-400' : 'text-neutral-400 hover:text-white'}`}
                onClick={() => dispatch({ type: 'track_mute', trackId: track.id, muted: !track.muted })}
              >
                {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
            </div>
          </div>
        ))}

        {/* Playhead — draggable, spans all tracks */}
        <div
          ref={playheadRef}
          className={`absolute top-0 bottom-0 z-[9999] cursor-ew-resize select-none touch-none
            ${isDragging ? 'w-1 -ml-0.5' : 'w-0.5'} bg-red-500
            transition-[left] duration-75`}
          style={{ left: LABEL_WIDTH + playheadX }}
          onMouseDown={handlePlayheadMouseDown}
          onTouchStart={handlePlayheadTouchStart}
        >
          <div
            className="absolute -top-1 -left-1.5 w-6 h-6 -m-1 rounded-full bg-red-500 border-2 border-red-300 shadow-[0_0_8px_rgba(239,68,68,0.7)] flex items-center justify-center cursor-ew-resize"
            style={{ touchAction: 'none' }}
          />
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
      <div className="h-1 w-full" style={{ backgroundColor: clip.color }} />
      <div className="px-1.5 py-0.5 h-full flex flex-col justify-between">
        <p className="text-[10px] text-white font-medium leading-tight truncate">
          {clip.label.split(' — ')[0]}
        </p>
        <div className="flex items-center justify-between gap-1">
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
