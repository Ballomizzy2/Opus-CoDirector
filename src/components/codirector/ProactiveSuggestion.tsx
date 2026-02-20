import { useState, useEffect, useMemo } from 'react'
import type { Timeline } from '../../store/types'
import { Lightbulb, X } from 'lucide-react'

interface Props {
  timeline: Timeline
  lastCommandTime: number
  onAccept: (command: string) => void
}

export default function ProactiveSuggestion({ timeline, lastCommandTime, onAccept }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [visible, setVisible] = useState(false)

  const suggestion = useMemo(() => {
    const candidates: { key: string; text: string; command: string }[] = []

    // Timeline > 60s
    if (timeline.duration > 60) {
      candidates.push({
        key: 'over-60',
        text: `You're at ${Math.round(timeline.duration)}s. Want me to suggest what to cut to get under 60?`,
        command: 'Help me cut to 60s',
      })
    }

    // Low-score clip selected
    const selected = timeline.clips.find(c => c.id === timeline.selectedClipId)
    if (selected && (selected.viralityScore ?? 100) < 60) {
      candidates.push({
        key: `low-score-${selected.id}`,
        text: `That clip scores ${selected.viralityScore} — want me to trim it down or cut it?`,
        command: `Trim 2 seconds off the start of ${selected.label.split(' — ')[0].toLowerCase()}`,
      })
    }

    // Music ends before last clip
    const musicTrack = timeline.tracks.find(t => t.type === 'music' && !t.muted)
    if (musicTrack && musicTrack.startTime + musicTrack.duration < timeline.duration - 2) {
      const gap = Math.round(timeline.duration - (musicTrack.startTime + musicTrack.duration))
      candidates.push({
        key: 'music-short',
        text: `The music cuts out ${gap}s before the end — want me to extend it?`,
        command: 'Extend the background music',
      })
    }

    return candidates.find(c => !dismissed.has(c.key)) ?? null
  }, [timeline, dismissed])

  // Show suggestion 3s after last command
  useEffect(() => {
    if (!suggestion) { setVisible(false); return }
    const timer = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [suggestion, lastCommandTime])

  if (!visible || !suggestion) return null

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded bg-white/5 border border-white/10 animate-[fadeIn_0.3s_ease-out]">
      <Lightbulb size={12} className="text-white/70 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/60 leading-tight">{suggestion.text}</p>
        <button
          className="text-[9px] text-white hover:text-neutral-200 font-medium mt-0.5"
          onClick={() => { onAccept(suggestion.command); setDismissed(prev => new Set(prev).add(suggestion.key)) }}
        >
          Yes, do that
        </button>
      </div>
      <button
        className="text-neutral-400 hover:text-neutral-300 shrink-0"
        onClick={() => setDismissed(prev => new Set(prev).add(suggestion.key))}
      >
        <X size={10} />
      </button>
    </div>
  )
}
