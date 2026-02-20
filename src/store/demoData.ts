import type { Clip, Track, Timeline } from './types'

function calcEffectiveDuration(clip: Pick<Clip, 'duration' | 'trimStart' | 'trimEnd' | 'speed'>) {
  return (clip.duration - clip.trimStart - clip.trimEnd) / clip.speed
}

const CLIP_COLORS = [
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
]

const rawClips: Omit<Clip, 'effectiveDuration'>[] = [
  {
    id: 'c1', label: 'Hook — Here\'s what nobody tells you', duration: 3.8,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 87,
    captions: [{ id: 'cap1', text: "Here's what nobody tells you", startOffset: 0.2, endOffset: 3.5, style: 'bold', position: 'bottom' }],
    transitions: [], effects: [], color: CLIP_COLORS[0],
  },
  {
    id: 'c2', label: 'Problem — The funding gap', duration: 7.2,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 72,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[1],
  },
  {
    id: 'c3', label: 'Story — Almost quit three times', duration: 11.5,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 91,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[2],
  },
  {
    id: 'c4', label: 'Demo — Product walkthrough', duration: 14.0,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 65,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[3],
  },
  {
    id: 'c5', label: 'Audience reaction — Laughter', duration: 4.2,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 78,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[4],
  },
  {
    id: 'c6', label: 'Key insight — PMF moment', duration: 8.8,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 94,
    captions: [{ id: 'cap2', text: 'Product-market fit', startOffset: 1.0, endOffset: 4.0, style: 'glow', position: 'center' }],
    transitions: [], effects: [], color: CLIP_COLORS[5],
  },
  {
    id: 'c7', label: 'CTA — Subscribe and link', duration: 3.5,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 60,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[6],
  },
]

export const demoClips: Clip[] = rawClips.map(c => ({
  ...c,
  effectiveDuration: calcEffectiveDuration(c),
}))

export const demoTracks: Track[] = [
  {
    id: 't1', type: 'music', label: 'Background Beat',
    startTime: 0, duration: 53.0, volume: 0.6, muted: false,
  },
  {
    id: 't2', type: 'sfx', label: 'Whoosh SFX',
    startTime: 11.0, duration: 0.5, volume: 0.8, muted: false,
  },
]

export function createInitialTimeline(): Timeline {
  const clips = demoClips.map(c => ({ ...c, captions: [...c.captions], transitions: [...c.transitions], effects: [...c.effects] }))
  const totalDuration = clips.reduce((sum, c) => sum + c.effectiveDuration, 0)
  return {
    id: 'project-1',
    playhead: 0,
    duration: totalDuration,
    playing: false,
    selectedClipId: null,
    clips,
    tracks: demoTracks.map(t => ({ ...t })),
    stateVersion: 0,
  }
}
