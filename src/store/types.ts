// ─── Domain Types ───────────────────────────────────────────

export interface Timeline {
  id: string
  playhead: number
  duration: number
  playing: boolean
  selectedClipId: string | null
  selectedTextLayerId: string | null
  selectedTrackId: string | null
  clips: Clip[]
  tracks: Track[]
  textLayers: TextLayer[]
  stateVersion: number
  /** Main video source for playback (clips are segments of this) */
  videoSrc?: string
}

export interface Clip {
  id: string
  label: string
  duration: number
  speed: number
  trimStart: number
  trimEnd: number
  effectiveDuration: number
  captions: Caption[]
  transitions: Transition[]
  effects: string[]
  viralityScore: number | null
  color: string
  /** Optional per-clip video override; else uses timeline.videoSrc */
  videoSrc?: string
  /** Start time in source video (seconds) — which portion of the source this clip plays */
  sourceStart?: number
  /** End time in source video (seconds) — sourceStart + raw length before trim */
  sourceEnd?: number
}

export interface Caption {
  id: string
  text: string
  startOffset: number
  endOffset: number
  style: 'bold' | 'glow' | 'karaoke' | 'outline'
  position: 'bottom' | 'center' | 'top'
}

export interface Transition {
  type: 'crossfade' | 'cut' | 'wipe' | 'zoom'
  duration: number
  edge: 'in' | 'out'
}

/** Programmatic SFX type (for tracks with type 'sfx' and no src) */
export type SfxType = 'whoosh' | 'ding' | 'tick' | 'chirp' | 'poof' | 'snip' | 'thunk'

export interface SfxSegment {
  id: string
  startTime: number
  duration: number
  sfxType: SfxType
}

export interface Track {
  id: string
  type: 'music' | 'sfx' | 'voiceover'
  label: string
  startTime: number
  duration: number
  volume: number
  muted: boolean
  /** Audio source URL for this track (music/voiceover) */
  src?: string
  /** SFX segments on one layer (sfx tracks only); when present, startTime/duration are ignored for display */
  segments?: SfxSegment[]
}

export interface TextLayer {
  id: string
  text: string
  startTime: number
  endTime: number
  style: 'bold' | 'glow' | 'outline'
  position: 'bottom' | 'center' | 'top'
}

// ─── Operations ─────────────────────────────────────────────

export type Op =
  | { type: 'cut'; clipId: string; at: number }
  | { type: 'delete'; clipId: string }
  | { type: 'delete_batch'; clipIds: string[] }
  | { type: 'trim_start'; clipId: string; amount: number }
  | { type: 'trim_end'; clipId: string; amount: number }
  | { type: 'speed'; clipId: string; speed: number }
  | { type: 'move'; clipId: string; toIndex: number }
  | { type: 'move_relative'; clipId: string; direction: 'before' | 'after'; targetClipId: string }
  | { type: 'duplicate'; clipId: string }
  | { type: 'caption_add'; clipId: string; text: string; startOffset?: number; endOffset?: number; style?: Caption['style']; position?: Caption['position'] }
  | { type: 'caption_edit'; clipId: string; captionId: string; updates: Partial<Omit<Caption, 'id'>> }
  | { type: 'caption_remove'; clipId: string; captionId: string }
  | { type: 'effect_add'; clipId: string; effectId: string }
  | { type: 'effect_remove'; clipId: string; effectId: string }
  | { type: 'track_volume'; trackId: string; volume: number }
  | { type: 'track_mute'; trackId: string; muted: boolean }
  | { type: 'track_move'; trackId: string; startTime: number }
  | { type: 'text_layer_add'; text: string; startTime?: number; endTime?: number; style?: TextLayer['style']; position?: TextLayer['position'] }
  | { type: 'text_layer_edit'; textLayerId: string; updates: Partial<Omit<TextLayer, 'id'>> }
  | { type: 'text_layer_remove'; textLayerId: string }
  | { type: 'text_layer_move'; textLayerId: string; startTime: number; endTime?: number }
  | { type: 'transition_add'; clipId: string; edge: 'in' | 'out'; transitionType: Transition['type']; duration?: number }
  | { type: 'transition_remove'; clipId: string; edge: 'in' | 'out' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; clipId: string | null }
  | { type: 'select_track'; trackId: string | null }
  | { type: 'select_text_layer'; textLayerId: string | null }
  | { type: 'seek'; time: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'batch'; ops: Op[]; label: string }

// ─── Dispatch Result ────────────────────────────────────────

export interface DispatchResult {
  requestId: string
  status: 'applied' | 'rejected' | 'partial'
  error: string | null
  appliedOps: Op[]
  failedOps: Op[]
  rollbackId: string
  newState: Timeline
  stateVersion: number
}

// ─── State Change Event ─────────────────────────────────────

export type ChangeSource = 'manual' | 'voice' | 'undo' | 'system'

export interface StateChangeEvent {
  newState: Timeline
  previousState: Timeline
  stateVersion: number
  source: ChangeSource
  ops: Op[]
  timestamp: number
}

// ─── Editor State (internal, includes undo stack) ───────────

export interface EditorState {
  timeline: Timeline
  undoStack: Timeline[]
  redoStack: Timeline[]
}

// ─── Command Log ────────────────────────────────────────────

export type CommandStatus = 'thinking' | 'applied' | 'failed' | 'undone' | 'cancelled'

export interface CommandLogEntry {
  id: string
  text: string
  explanation: string
  status: CommandStatus
  confidence: number
  ops: Op[]
  timestamp: number
  affectedClipIds: string[]
}

// ─── Conversation Context ───────────────────────────────────

export interface ConvoContext {
  lastReferencedClipId: string | null
  lastReferencedTextLayerId: string | null
  lastReferencedTrackId: string | null
  lastOperation: Op | null
  lastMentionedTime: number | null
  recentClipIds: string[]
  lastActivityTimestamp: number
}

// ─── Available Effects ──────────────────────────────────────

export const AVAILABLE_EFFECTS = [
  'zoom-in', 'zoom-out', 'ken-burns', 'blur-bg', 'flash-transition',
  'shake', 'slow-zoom', 'vignette', 'color-pop', 'glitch',
] as const

export type EffectId = typeof AVAILABLE_EFFECTS[number]
