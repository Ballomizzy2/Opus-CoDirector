import type { Clip, Track, Timeline, TextLayer, SfxSegment } from './types'

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

/** Clips map to Big Buck Bunny segments: hook → problem → story → demo → audience → insight → CTA */
const rawClips: Omit<Clip, 'effectiveDuration'>[] = [
  {
    id: 'c1', label: 'Hook — Here\'s what nobody tells you', duration: 3.8,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 87,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[0],
    sourceStart: 0, sourceEnd: 3.8, // Bunny wakes up
  },
  {
    id: 'c2', label: 'Problem — The funding gap', duration: 7.2,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 72,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[1],
    sourceStart: 3.8, sourceEnd: 11.0, // Bullies appear
  },
  {
    id: 'c3', label: 'Story — Almost quit three times', duration: 11.5,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 91,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[2],
    sourceStart: 11.0, sourceEnd: 22.5, // Bunny's journey
  },
  {
    id: 'c4', label: 'Demo — Product walkthrough', duration: 14.0,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 65,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[3],
    sourceStart: 22.5, sourceEnd: 36.5, // Chase/action
  },
  {
    id: 'c5', label: 'Audience reaction — Laughter', duration: 4.2,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 78,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[4],
    sourceStart: 36.5, sourceEnd: 40.7, // Comic reaction
  },
  {
    id: 'c6', label: 'Key insight — PMF moment', duration: 8.8,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 94,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[5],
    sourceStart: 40.7, sourceEnd: 49.5, // Bunny turns tables
  },
  {
    id: 'c7', label: 'CTA — Subscribe and link', duration: 3.5,
    speed: 1, trimStart: 0, trimEnd: 0, viralityScore: 60,
    captions: [], transitions: [], effects: [], color: CLIP_COLORS[6],
    sourceStart: 49.5, sourceEnd: 53.0, // Resolution/outro
  },
]

export const demoClips: Clip[] = rawClips.map(c => ({
  ...c,
  effectiveDuration: calcEffectiveDuration(c),
}))

/** Big Buck Bunny - has narrative structure matching Hook/Problem/Story/Demo/CTA flow */
export const DEMO_VIDEO_SRC = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'

/** Sample music for background track (Mixkit - CORS-friendly) */
export const DEMO_MUSIC_SRC = 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3'

export const demoTracks: Track[] = [
  {
    id: 't1', type: 'music', label: 'Background Beat',
    startTime: 0, duration: 53.0, volume: 0.6, muted: false,
    src: DEMO_MUSIC_SRC,
  },
  {
    id: 't2', type: 'sfx', label: 'SFX',
    startTime: 0, duration: 53.0, volume: 0.8, muted: false,
    segments: [
      { id: 'sfx1', startTime: 11.0, duration: 0.5, sfxType: 'whoosh' },
      { id: 'sfx2', startTime: 22.5, duration: 0.4, sfxType: 'ding' },
      { id: 'sfx3', startTime: 36.5, duration: 0.3, sfxType: 'chirp' },
      { id: 'sfx4', startTime: 40.7, duration: 0.4, sfxType: 'poof' },
      { id: 'sfx5', startTime: 49.5, duration: 0.3, sfxType: 'tick' },
    ],
  },
  {
    id: 't3', type: 'voiceover', label: 'Voice Over',
    startTime: 3.0, duration: 45.0, volume: 1.0, muted: false,
  },
]

export const demoTextLayers: TextLayer[] = [
  { id: 'tl1', text: "Here's what nobody tells you", startTime: 0, endTime: 3.8, style: 'bold', position: 'center' },
  { id: 'tl2', text: 'The funding gap', startTime: 3.8, endTime: 11.0, style: 'outline', position: 'bottom' },
  { id: 'tl3', text: 'Almost quit three times', startTime: 11.0, endTime: 22.5, style: 'bold', position: 'bottom' },
  { id: 'tl4', text: 'Product walkthrough', startTime: 22.5, endTime: 36.5, style: 'outline', position: 'center' },
  { id: 'tl5', text: 'Audience reaction', startTime: 36.5, endTime: 40.7, style: 'glow', position: 'top' },
  { id: 'tl6', text: 'Product market fit', startTime: 40.7, endTime: 49.5, style: 'glow', position: 'center' },
  { id: 'tl7', text: 'Subscribe for more', startTime: 49.5, endTime: 53.0, style: 'glow', position: 'bottom' },
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
    selectedTextLayerId: null,
    selectedTrackId: null,
    clips,
    tracks: demoTracks.map(t => ({ ...t })),
    textLayers: demoTextLayers.map(tl => ({ ...tl })),
    stateVersion: 0,
    videoSrc: DEMO_VIDEO_SRC,
  }
}
