import type { Clip, Track, Timeline, ConvoContext } from '../store/types'
import { getClipStartTime } from '../store/editorReducer'

export interface ResolvedClip {
  clip: Clip
  confidence: number
}

const ORDINALS: Record<string, number> = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, seventh: 6,
  eighth: 7, ninth: 8, tenth: 9, '1st': 0, '2nd': 1, '3rd': 2, '4th': 3,
  '5th': 4, '6th': 5, '7th': 6, '8th': 7, '9th': 8, '10th': 9,
}

export function resolveClipReference(
  text: string,
  timeline: Timeline,
  context: ConvoContext,
): ResolvedClip[] {
  const lower = text.toLowerCase().trim()
  const clips = timeline.clips

  // 1. Pronoun → conversation context
  if (/\b(it|this clip|this one|that one|that clip)\b/.test(lower)) {
    const id = context.lastReferencedClipId ?? timeline.selectedClipId
    const clip = id ? clips.find(c => c.id === id) : null
    if (clip) return [{ clip, confidence: 0.9 }]
  }

  // 2. "this part" → playhead proximity
  if (/\b(this part|right here|here|this section|current)\b/.test(lower)) {
    const clip = getClipAtPlayhead(timeline)
    if (clip) return [{ clip, confidence: 0.85 }]
  }

  // 3. Ordinal ("the third clip")
  for (const [word, idx] of Object.entries(ORDINALS)) {
    if (lower.includes(word) && idx < clips.length) {
      return [{ clip: clips[idx], confidence: 0.9 }]
    }
  }

  // "clip N" pattern
  const clipNumMatch = lower.match(/clip\s*(\d+)/)
  if (clipNumMatch) {
    const n = parseInt(clipNumMatch[1]) - 1
    if (n >= 0 && n < clips.length) return [{ clip: clips[n], confidence: 0.9 }]
  }

  // 4. Score-based ("the best clip", "lowest scoring", "everything below 70")
  if (/\b(best|highest[\s-]?scor)/i.test(lower)) {
    const sorted = [...clips].filter(c => c.viralityScore != null).sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0))
    if (sorted.length) return [{ clip: sorted[0], confidence: 0.88 }]
  }
  if (/\b(worst|lowest[\s-]?scor)/i.test(lower)) {
    const sorted = [...clips].filter(c => c.viralityScore != null).sort((a, b) => (a.viralityScore ?? 0) - (b.viralityScore ?? 0))
    if (sorted.length) return [{ clip: sorted[0], confidence: 0.88 }]
  }
  const belowMatch = lower.match(/(?:everything|all|clips?)\s*(?:below|under|less than|<)\s*(\d+)/)
  if (belowMatch) {
    const threshold = parseInt(belowMatch[1])
    const matches = clips.filter(c => (c.viralityScore ?? 100) < threshold)
    return matches.map(c => ({ clip: c, confidence: 0.9 }))
  }
  const aboveMatch = lower.match(/(?:everything|all|clips?)\s*(?:above|over|more than|>)\s*(\d+)/)
  if (aboveMatch) {
    const threshold = parseInt(aboveMatch[1])
    const matches = clips.filter(c => (c.viralityScore ?? 0) > threshold)
    return matches.map(c => ({ clip: c, confidence: 0.9 }))
  }

  // 5. Relative ("the next one", "previous clip")
  if (/\b(next one|next clip)\b/.test(lower)) {
    const selIdx = clips.findIndex(c => c.id === timeline.selectedClipId)
    if (selIdx >= 0 && selIdx < clips.length - 1) return [{ clip: clips[selIdx + 1], confidence: 0.85 }]
  }
  if (/\b(previous|prev|last one|one before)\b/.test(lower)) {
    const selIdx = clips.findIndex(c => c.id === timeline.selectedClipId)
    if (selIdx > 0) return [{ clip: clips[selIdx - 1], confidence: 0.85 }]
  }

  // 6. Label keyword match — fuzzy
  const labelMatches = clips
    .map(clip => {
      const labelLower = clip.label.toLowerCase()
      const keywords = lower.replace(/\b(the|a|an|this|that|clip)\b/g, '').trim().split(/\s+/).filter(Boolean)
      const matchCount = keywords.filter(kw => labelLower.includes(kw)).length
      return { clip, score: matchCount / Math.max(keywords.length, 1) }
    })
    .filter(m => m.score > 0.3)
    .sort((a, b) => b.score - a.score)

  if (labelMatches.length > 0) {
    return labelMatches.map(m => ({ clip: m.clip, confidence: Math.min(0.95, 0.5 + m.score * 0.45) }))
  }

  // 7. Common aliases
  const aliases: Record<string, string[]> = {
    intro: ['hook', 'intro', 'opening', 'start'],
    outro: ['cta', 'outro', 'ending', 'end', 'subscribe'],
    demo: ['demo', 'walkthrough', 'product'],
    story: ['story', 'quit', 'almost'],
    reaction: ['reaction', 'laughter', 'audience'],
    insight: ['insight', 'pmf', 'key', 'moment'],
    problem: ['problem', 'funding', 'gap'],
  }

  for (const [, keywords] of Object.entries(aliases)) {
    if (keywords.some(kw => lower.includes(kw))) {
      const matches = clips.filter(clip =>
        keywords.some(kw => clip.label.toLowerCase().includes(kw))
      )
      if (matches.length === 1) return [{ clip: matches[0], confidence: 0.9 }]
      if (matches.length > 1) return matches.map(c => ({ clip: c, confidence: 0.7 }))
    }
  }

  return []
}

export function resolveTrackReference(text: string, timeline: Timeline): Track | null {
  const lower = text.toLowerCase()
  if (/\b(music|background|beat|bg\s*music)\b/.test(lower)) {
    return timeline.tracks.find(t => t.type === 'music') ?? null
  }
  if (/\b(sfx|sound\s*effect|whoosh|effect)\b/.test(lower)) {
    return timeline.tracks.find(t => t.type === 'sfx') ?? null
  }
  if (/\b(voiceover|vo|narration)\b/.test(lower)) {
    return timeline.tracks.find(t => t.type === 'voiceover') ?? null
  }
  for (const track of timeline.tracks) {
    if (track.label.toLowerCase().includes(lower.replace(/\b(the|a|an)\b/g, '').trim())) {
      return track
    }
  }
  return null
}

export function getClipAtPlayhead(timeline: Timeline): Clip | null {
  let t = 0
  for (const clip of timeline.clips) {
    if (timeline.playhead >= t && timeline.playhead < t + clip.effectiveDuration) return clip
    t += clip.effectiveDuration
  }
  return timeline.clips.length > 0 ? timeline.clips[timeline.clips.length - 1] : null
}

export function getClipsByLabel(query: string, clips: Clip[]): Clip[] {
  const lower = query.toLowerCase()
  return clips.filter(c => c.label.toLowerCase().includes(lower))
}
