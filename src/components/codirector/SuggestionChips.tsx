import { useMemo } from 'react'
import type { Timeline } from '../../store/types'

interface Props {
  timeline: Timeline
  onChipClick: (command: string) => void
}

export default function SuggestionChips({ timeline, onChipClick }: Props) {
  const chips = useMemo(() => {
    const suggestions: string[] = []
    const selected = timeline.clips.find(c => c.id === timeline.selectedClipId)

    if (selected) {
      suggestions.push(`Trim 2s off the start`)
      if (selected.speed === 1) suggestions.push(`Speed up to 1.5x`)
      if (selected.captions.length === 0) suggestions.push(`Add caption`)
      if (selected.effects.length === 0) suggestions.push(`Add zoom-in effect`)
    }

    const lowScoreClip = timeline.clips.find(c => (c.viralityScore ?? 100) < 65)
    if (lowScoreClip) {
      suggestions.push(`Delete lowest scoring clip`)
    }

    if (timeline.duration > 60) {
      suggestions.push(`Help me cut to 60s`)
    }

    if (timeline.clips.length >= 2 && !selected) {
      suggestions.push(`Select the hook`)
    }

    return suggestions.slice(0, 5)
  }, [timeline])

  if (chips.length === 0) return null

  return (
    <div className="flex gap-1 overflow-x-auto py-0.5 scrollbar-none shrink-0">
      {chips.map((chip, i) => (
        <button
          key={i}
          className="shrink-0 text-[8px] px-1.5 py-0.5 rounded-full bg-neutral-800/60 border border-neutral-700/50 text-neutral-500
                     hover:border-white/50 hover:text-white hover:bg-white/10 transition-colors"
          onClick={() => onChipClick(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  )
}
