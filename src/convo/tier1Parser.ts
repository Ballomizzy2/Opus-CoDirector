import type { Op, Timeline, ConvoContext } from '../store/types'
import { resolveClipReference, resolveTrackReference } from './clipResolver'

export interface ParseResult {
  ops: Op[]
  confidence: number
  explanation: string
  escalate: boolean
}

function extractNumber(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s\b)/i)
  if (m) return parseFloat(m[1])
  const m2 = text.match(/(\d+(?:\.\d+)?)\s*x/i)
  if (m2) return parseFloat(m2[1])
  const m3 = text.match(/\b(\d+(?:\.\d+)?)\b/)
  if (m3) return parseFloat(m3[1])
  return null
}

function extractSpeedValue(text: string): number | null {
  const lower = text.toLowerCase()
  if (/\bdouble\b/.test(lower)) return 2
  if (/\bhalf\b/.test(lower)) return 0.5
  if (/\btriple\b/.test(lower)) return 3
  const m = lower.match(/(\d+(?:\.\d+)?)\s*x/)
  if (m) return parseFloat(m[1])
  const m2 = lower.match(/to\s+(\d+(?:\.\d+)?)/)
  if (m2) return parseFloat(m2[1])
  return null
}

function extractPercentage(text: string): number | null {
  const m = text.match(/(\d+)\s*%/)
  if (m) return parseInt(m[1]) / 100
  return null
}

export function tier1Parse(
  text: string,
  timeline: Timeline,
  context: ConvoContext,
): ParseResult {
  const lower = text.toLowerCase().trim()

  // System commands — always handle, never escalate
  if (/^(undo|undo that|go back)$/i.test(lower)) {
    return { ops: [{ type: 'undo' }], confidence: 0.98, explanation: 'Undo last action', escalate: false }
  }
  if (/^(redo|bring that back)$/i.test(lower)) {
    return { ops: [{ type: 'redo' }], confidence: 0.98, explanation: 'Redo last undone action', escalate: false }
  }
  if (/^(play|resume|start)$/i.test(lower)) {
    return { ops: [{ type: 'play' }], confidence: 0.98, explanation: 'Play', escalate: false }
  }
  if (/^(pause|stop|hold)$/i.test(lower)) {
    return { ops: [{ type: 'pause' }], confidence: 0.98, explanation: 'Pause', escalate: false }
  }

  // Delete
  if (/\b(delete|remove|get rid of|drop|kill)\b/.test(lower)) {
    // Batch delete by score
    const belowMatch = lower.match(/(?:everything|all|clips?)\s*(?:below|under|less than|<)\s*(\d+)/)
    if (belowMatch) {
      const threshold = parseInt(belowMatch[1])
      const toDelete = timeline.clips.filter(c => (c.viralityScore ?? 100) < threshold)
      if (toDelete.length > 0) {
        return {
          ops: [{ type: 'delete_batch', clipIds: toDelete.map(c => c.id) }],
          confidence: 0.92,
          explanation: `Delete ${toDelete.length} clip(s) scoring below ${threshold}`,
          escalate: false,
        }
      }
    }

    const resolved = resolveClipReference(lower.replace(/\b(delete|remove|get rid of|drop|kill)\b/, ''), timeline, context)
    if (resolved.length === 1 && resolved[0].confidence >= 0.7) {
      return {
        ops: [{ type: 'delete', clipId: resolved[0].clip.id }],
        confidence: resolved[0].confidence,
        explanation: `Delete '${resolved[0].clip.label}'`,
        escalate: false,
      }
    }
    if (resolved.length > 1) {
      const allHighConf = resolved.every(r => r.confidence >= 0.8)
      if (allHighConf) {
        return {
          ops: [{ type: 'delete_batch', clipIds: resolved.map(r => r.clip.id) }],
          confidence: 0.85,
          explanation: `Delete ${resolved.length} clips`,
          escalate: false,
        }
      }
    }
  }

  // Trim
  if (/\b(trim|shorten|tighten|cut down)\b/.test(lower)) {
    const amount = extractNumber(lower)
    const isStart = /\b(start|beginning|front|intro|off the start|off the beginning)\b/.test(lower)
    const isEnd = /\b(end|ending|back|tail|off the end)\b/.test(lower)
    const trimType = isEnd ? 'trim_end' : 'trim_start'

    const resolved = resolveClipReference(lower.replace(/\b(trim|shorten|tighten|cut down)\b/, ''), timeline, context)
    const target = resolved.length > 0 ? resolved[0] : null
    const clipId = target?.clip.id ?? timeline.selectedClipId

    if (clipId && amount) {
      return {
        ops: [{ type: trimType, clipId, amount }],
        confidence: target ? target.confidence : 0.8,
        explanation: `Trim ${amount}s off the ${isEnd ? 'end' : 'start'} of '${target?.clip.label ?? 'selected clip'}'`,
        escalate: false,
      }
    }
    if (clipId && !amount) {
      return {
        ops: [{ type: trimType, clipId, amount: 1 }],
        confidence: 0.7,
        explanation: `Trim 1s off the ${isEnd ? 'end' : 'start'} (default)`,
        escalate: false,
      }
    }
  }

  // Speed
  if (/\b(speed|faster|slower|slow down|speed up|pace|2x|1\.5x|3x|0\.5x|half speed|double speed|double the speed|triple)\b/.test(lower)) {
    const speedVal = extractSpeedValue(lower)
    const resolved = resolveClipReference(lower.replace(/\b(speed|faster|slower|slow down|speed up)\b/, ''), timeline, context)
    const target = resolved.length > 0 ? resolved[0] : null
    const clipId = target?.clip.id ?? timeline.selectedClipId

    if (clipId) {
      const speed = speedVal ?? (/\b(slow|slower)\b/.test(lower) ? 0.5 : 1.5)
      return {
        ops: [{ type: 'speed', clipId, speed }],
        confidence: speedVal ? 0.92 : 0.78,
        explanation: `Set speed to ${speed}x on '${target?.clip.label ?? 'selected clip'}'`,
        escalate: false,
      }
    }
  }

  // Move
  if (/\b(move|put|place|reorder)\b/.test(lower)) {
    const beforeMatch = lower.match(/\bbefore\s+(?:the\s+)?(.+)/)
    const afterMatch = lower.match(/\bafter\s+(?:the\s+)?(.+)/)
    if (beforeMatch || afterMatch) {
      const direction = beforeMatch ? 'before' as const : 'after' as const
      const targetText = (beforeMatch ?? afterMatch)![1]
      const sourceResolved = resolveClipReference(lower.replace(/\b(move|put|place|reorder)\b/, '').replace(/\b(before|after)\b.*/, ''), timeline, context)
      const targetResolved = resolveClipReference(targetText, timeline, context)
      if (sourceResolved.length > 0 && targetResolved.length > 0) {
        return {
          ops: [{ type: 'move_relative', clipId: sourceResolved[0].clip.id, direction, targetClipId: targetResolved[0].clip.id }],
          confidence: Math.min(sourceResolved[0].confidence, targetResolved[0].confidence),
          explanation: `Move '${sourceResolved[0].clip.label}' ${direction} '${targetResolved[0].clip.label}'`,
          escalate: false,
        }
      }
    }

    // "move X to the beginning/end"
    if (/\b(beginning|start|front)\b/.test(lower)) {
      const resolved = resolveClipReference(lower.replace(/\b(move|put|place|reorder|to the|beginning|start|front)\b/g, ''), timeline, context)
      if (resolved.length > 0) {
        return {
          ops: [{ type: 'move', clipId: resolved[0].clip.id, toIndex: 0 }],
          confidence: resolved[0].confidence,
          explanation: `Move '${resolved[0].clip.label}' to the beginning`,
          escalate: false,
        }
      }
    }
    if (/\b(end|last|back)\b/.test(lower)) {
      const resolved = resolveClipReference(lower.replace(/\b(move|put|place|reorder|to the|end|last|back)\b/g, ''), timeline, context)
      if (resolved.length > 0) {
        return {
          ops: [{ type: 'move', clipId: resolved[0].clip.id, toIndex: timeline.clips.length - 1 }],
          confidence: resolved[0].confidence,
          explanation: `Move '${resolved[0].clip.label}' to the end`,
          escalate: false,
        }
      }
    }
  }

  // Duplicate
  if (/\b(duplicate|copy|clone)\b/.test(lower)) {
    const resolved = resolveClipReference(lower.replace(/\b(duplicate|copy|clone|make a copy of)\b/, ''), timeline, context)
    const clipId = resolved.length > 0 ? resolved[0].clip.id : timeline.selectedClipId
    if (clipId) {
      const clip = timeline.clips.find(c => c.id === clipId)
      return {
        ops: [{ type: 'duplicate', clipId }],
        confidence: 0.9,
        explanation: `Duplicate '${clip?.label ?? 'selected clip'}'`,
        escalate: false,
      }
    }
  }

  // Cut / split
  if (/\b(cut|split)\b/.test(lower) && !/\b(cut down|cut to)\b/.test(lower)) {
    const resolved = resolveClipReference(lower.replace(/\b(cut|split)\b/, ''), timeline, context)
    const target = resolved.length > 0 ? resolved[0] : null
    const clipId = target?.clip.id ?? timeline.selectedClipId
    if (clipId) {
      const clip = timeline.clips.find(c => c.id === clipId)!
      const idx = timeline.clips.indexOf(clip)
      let t = 0; for (let i = 0; i < idx; i++) t += timeline.clips[i].effectiveDuration
      const midpoint = t + clip.effectiveDuration / 2

      if (/\bhalf\b/.test(lower) || !/\bat\b/.test(lower)) {
        return {
          ops: [{ type: 'cut', clipId, at: midpoint }],
          confidence: 0.85,
          explanation: `Cut '${clip.label}' in half`,
          escalate: false,
        }
      }
    }
  }

  // Select / go to
  if (/\b(select|go to|show me|focus)\b/.test(lower)) {
    const resolved = resolveClipReference(lower.replace(/\b(select|go to|show me|focus)\b/, ''), timeline, context)
    if (resolved.length > 0) {
      return {
        ops: [{ type: 'select', clipId: resolved[0].clip.id }],
        confidence: resolved[0].confidence,
        explanation: `Select '${resolved[0].clip.label}'`,
        escalate: false,
      }
    }
  }

  // Mute / unmute
  if (/\b(mute|unmute)\b/.test(lower)) {
    const muted = /\bunmute\b/.test(lower) ? false : true
    const track = resolveTrackReference(lower, timeline)
    if (track) {
      return {
        ops: [{ type: 'track_mute', trackId: track.id, muted }],
        confidence: 0.9,
        explanation: `${muted ? 'Mute' : 'Unmute'} '${track.label}'`,
        escalate: false,
      }
    }
  }

  // Track volume
  if (/\b(volume|turn (up|down)|louder|quieter|softer)\b/.test(lower) || /\d+\s*%/.test(lower)) {
    const track = resolveTrackReference(lower, timeline)
    const pct = extractPercentage(lower)
    if (track && pct != null) {
      return {
        ops: [{ type: 'track_volume', trackId: track.id, volume: pct }],
        confidence: 0.9,
        explanation: `Set '${track.label}' volume to ${Math.round(pct * 100)}%`,
        escalate: false,
      }
    }
    if (track) {
      const isUp = /\b(up|louder)\b/.test(lower)
      const newVol = Math.max(0, Math.min(1, track.volume + (isUp ? 0.2 : -0.2)))
      return {
        ops: [{ type: 'track_volume', trackId: track.id, volume: newVol }],
        confidence: 0.8,
        explanation: `${isUp ? 'Increase' : 'Decrease'} '${track.label}' volume`,
        escalate: false,
      }
    }
  }

  // Add effect
  if (/\b(add|apply|put)\b.*\b(effect|zoom|blur|ken|flash|shake|vignette|glitch|color)\b/.test(lower)) {
    const effects = ['zoom-in', 'zoom-out', 'ken-burns', 'blur-bg', 'flash-transition', 'shake', 'slow-zoom', 'vignette', 'color-pop', 'glitch']
    const found = effects.find(e => lower.includes(e.replace('-', ' ')) || lower.includes(e))
      ?? (lower.includes('zoom') && lower.includes('in') ? 'zoom-in' : null)
      ?? (lower.includes('zoom') && lower.includes('out') ? 'zoom-out' : null)
      ?? (lower.includes('zoom') ? 'zoom-in' : null)
      ?? (lower.includes('blur') ? 'blur-bg' : null)
      ?? (lower.includes('ken') ? 'ken-burns' : null)
      ?? (lower.includes('flash') ? 'flash-transition' : null)
      ?? (lower.includes('shake') ? 'shake' : null)
      ?? (lower.includes('glitch') ? 'glitch' : null)
      ?? (lower.includes('vignette') ? 'vignette' : null)

    if (found) {
      const resolved = resolveClipReference(lower, timeline, context)
      const clipId = resolved.length > 0 ? resolved[0].clip.id : timeline.selectedClipId
      if (clipId) {
        return {
          ops: [{ type: 'effect_add', clipId, effectId: found }],
          confidence: 0.88,
          explanation: `Add '${found}' effect`,
          escalate: false,
        }
      }
    }
  }

  // Remove effect
  if (/\b(remove|take off|delete)\b.*\b(effect|zoom|blur|ken|flash|shake|vignette|glitch|color)\b/.test(lower)) {
    const resolved = resolveClipReference(lower, timeline, context)
    const clipId = resolved.length > 0 ? resolved[0].clip.id : timeline.selectedClipId
    const clip = clipId ? timeline.clips.find(c => c.id === clipId) : null
    if (clip && clip.effects.length > 0) {
      const effectToRemove = clip.effects.find(e => lower.includes(e.replace('-', ' ')) || lower.includes(e)) ?? clip.effects[0]
      return {
        ops: [{ type: 'effect_remove', clipId: clip.id, effectId: effectToRemove }],
        confidence: 0.85,
        explanation: `Remove '${effectToRemove}' effect`,
        escalate: false,
      }
    }
  }

  // Add caption
  if (/\b(add|put|write)\b.*\b(caption|text|subtitle|overlay)\b/.test(lower) || /\bcaption\b/.test(lower)) {
    const textMatch = lower.match(/(?:says?|that says?|reading)\s+['""]?(.+?)['""]?\s*$/) ?? lower.match(/['""](.+?)['""]/)
    const captionText = textMatch?.[1] ?? 'Caption'
    const resolved = resolveClipReference(lower, timeline, context)
    const clipId = resolved.length > 0 ? resolved[0].clip.id : timeline.selectedClipId
    if (clipId) {
      return {
        ops: [{ type: 'caption_add', clipId, text: captionText }],
        confidence: 0.85,
        explanation: `Add caption '${captionText}'`,
        escalate: false,
      }
    }
  }

  // Add transition
  if (/\b(add|put)\b.*\b(transition|crossfade|wipe|fade)\b/.test(lower) || /\bcrossfade\b/.test(lower)) {
    const transType = /\bcrossfade\b/.test(lower) ? 'crossfade' as const
      : /\bwipe\b/.test(lower) ? 'wipe' as const
      : /\bzoom\b/.test(lower) ? 'zoom' as const
      : 'crossfade' as const

    const resolved = resolveClipReference(lower, timeline, context)
    const clipId = resolved.length > 0 ? resolved[0].clip.id : timeline.selectedClipId
    if (clipId) {
      return {
        ops: [{ type: 'transition_add', clipId, edge: 'out', transitionType: transType }],
        confidence: 0.85,
        explanation: `Add ${transType} transition`,
        escalate: false,
      }
    }
  }

  // Seek
  const seekMatch = lower.match(/\bgo to\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)?\b/)
  if (seekMatch) {
    return {
      ops: [{ type: 'seek', time: parseFloat(seekMatch[1]) }],
      confidence: 0.92,
      explanation: `Seek to ${seekMatch[1]}s`,
      escalate: false,
    }
  }
  if (/\b(jump to the beginning|go to the start|go to the beginning)\b/.test(lower)) {
    return {
      ops: [{ type: 'seek', time: 0 }],
      confidence: 0.95,
      explanation: 'Seek to beginning',
      escalate: false,
    }
  }

  // Fallback — escalate to Tier 3
  return { ops: [], confidence: 0, explanation: '', escalate: true }
}
