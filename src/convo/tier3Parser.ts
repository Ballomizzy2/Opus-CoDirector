import type { Op, Timeline } from '../store/types'

export interface Tier3Result {
  ops: Op[]
  confidence: number
  explanation: string
}

function serializeTimeline(timeline: Timeline): string {
  const clips = timeline.clips.map((c, i) => ({
    id: c.id,
    index: i,
    label: c.label,
    duration: c.effectiveDuration.toFixed(1) + 's',
    speed: c.speed + 'x',
    score: c.viralityScore,
    effects: c.effects,
    captions: c.captions.length,
  }))
  const tracks = timeline.tracks.map(t => ({
    id: t.id,
    label: t.label,
    type: t.type,
    volume: Math.round(t.volume * 100) + '%',
    muted: t.muted,
  }))
  return JSON.stringify({
    clips,
    tracks,
    totalDuration: timeline.duration.toFixed(1) + 's',
    selectedClipId: timeline.selectedClipId,
    playhead: timeline.playhead.toFixed(1) + 's',
  }, null, 2)
}

const SYSTEM_PROMPT = `You are CoDirector, an AI video editing assistant. You receive voice commands and the current timeline state, and produce structured edit operations.

AVAILABLE OPERATIONS:
- { type: "delete", clipId: string }
- { type: "delete_batch", clipIds: string[] }
- { type: "trim_start", clipId: string, amount: number }
- { type: "trim_end", clipId: string, amount: number }
- { type: "speed", clipId: string, speed: number } // 0.25 to 4.0
- { type: "move", clipId: string, toIndex: number }
- { type: "move_relative", clipId: string, direction: "before"|"after", targetClipId: string }
- { type: "duplicate", clipId: string }
- { type: "effect_add", clipId: string, effectId: string } // zoom-in, zoom-out, ken-burns, blur-bg, flash-transition, shake, slow-zoom, vignette, color-pop, glitch
- { type: "effect_remove", clipId: string, effectId: string }
- { type: "caption_add", clipId: string, text: string }
- { type: "transition_add", clipId: string, edge: "in"|"out", transitionType: "crossfade"|"cut"|"wipe"|"zoom" }
- { type: "track_volume", trackId: string, volume: number } // 0.0 to 1.0
- { type: "track_mute", trackId: string, muted: boolean }
- { type: "select", clipId: string }

Respond with JSON only:
{
  "ops": [...operations...],
  "confidence": 0.0-1.0,
  "explanation": "Brief description of what you're doing"
}

Use actual clip IDs from the timeline state. Be creative but precise.`

export async function tier3Parse(
  text: string,
  timeline: Timeline,
  apiKey?: string,
): Promise<Tier3Result> {
  if (!apiKey) {
    return {
      ops: [],
      confidence: 0,
      explanation: 'Tier 3 requires an API key. Complex commands are not available.',
    }
  }

  const stateStr = serializeTimeline(timeline)
  const userPrompt = `TIMELINE STATE:\n${stateStr}\n\nUSER COMMAND: "${text}"\n\nProduce the edit operations.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text ?? ''

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0])
    return {
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
      explanation: parsed.explanation ?? 'Applied complex edit',
    }
  } catch (error: any) {
    return {
      ops: [],
      confidence: 0,
      explanation: `LLM error: ${error.message}`,
    }
  }
}
