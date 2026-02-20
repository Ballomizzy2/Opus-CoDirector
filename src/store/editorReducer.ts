import type { EditorState, Timeline, Clip, Op } from './types'
import { createInitialTimeline } from './demoData'

// ─── Helpers ────────────────────────────────────────────────

let nextIdCounter = 100

function uid(prefix = 'c') {
  return `${prefix}${++nextIdCounter}`
}

function calcEffective(clip: Clip): number {
  return (clip.duration - clip.trimStart - clip.trimEnd) / clip.speed
}

function recalcTimeline(timeline: Timeline): Timeline {
  const clips = timeline.clips.map(c => ({
    ...c,
    effectiveDuration: calcEffective(c),
  }))
  const duration = clips.reduce((sum, c) => sum + c.effectiveDuration, 0)
  return { ...timeline, clips, duration }
}

function deepCloneTimeline(t: Timeline): Timeline {
  return {
    ...t,
    clips: t.clips.map(c => ({
      ...c,
      captions: c.captions.map(cap => ({ ...cap })),
      transitions: c.transitions.map(tr => ({ ...tr })),
      effects: [...c.effects],
    })),
    tracks: t.tracks.map(tr => ({ ...tr })),
  }
}

function getClipStartTime(clips: Clip[], index: number): number {
  let t = 0
  for (let i = 0; i < index; i++) t += clips[i].effectiveDuration
  return t
}

// ─── Operation Appliers ─────────────────────────────────────

function applyCut(timeline: Timeline, clipId: string, at: number): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const clipStart = getClipStartTime(timeline.clips, idx)
  const relativeTime = at - clipStart

  if (relativeTime < 0.3 || relativeTime > clip.effectiveDuration - 0.3) {
    return 'Cut position too close to clip edge (min 0.3s from either side)'
  }

  const rawCutPoint = clip.trimStart + relativeTime * clip.speed

  const clipA: Clip = {
    ...clip, id: uid(), label: clip.label + ' (A)',
    trimEnd: clip.duration - rawCutPoint,
    effectiveDuration: 0, captions: [], transitions: [], effects: [...clip.effects],
  }
  clipA.effectiveDuration = calcEffective(clipA)

  const clipB: Clip = {
    ...clip, id: uid(), label: clip.label + ' (B)',
    trimStart: rawCutPoint,
    effectiveDuration: 0, captions: [], transitions: [], effects: [...clip.effects],
  }
  clipB.effectiveDuration = calcEffective(clipB)

  const newClips = [...timeline.clips]
  newClips.splice(idx, 1, clipA, clipB)
  return recalcTimeline({ ...timeline, clips: newClips })
}

function applyDelete(timeline: Timeline, clipId: string): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const newClips = timeline.clips.filter(c => c.id !== clipId)
  const selected = timeline.selectedClipId === clipId ? null : timeline.selectedClipId
  return recalcTimeline({ ...timeline, clips: newClips, selectedClipId: selected })
}

function applyDeleteBatch(timeline: Timeline, clipIds: string[]): Timeline | string {
  const missing = clipIds.filter(id => !timeline.clips.find(c => c.id === id))
  if (missing.length > 0) return `Clips not found: ${missing.join(', ')}`
  const idSet = new Set(clipIds)
  const newClips = timeline.clips.filter(c => !idSet.has(c.id))
  const selected = timeline.selectedClipId && idSet.has(timeline.selectedClipId) ? null : timeline.selectedClipId
  return recalcTimeline({ ...timeline, clips: newClips, selectedClipId: selected })
}

function applyTrimStart(timeline: Timeline, clipId: string, amount: number): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const newTrimStart = clip.trimStart + amount
  const remaining = (clip.duration - newTrimStart - clip.trimEnd) / clip.speed
  if (remaining < 0.5) return 'Trim would leave less than 0.5s remaining'
  const newClip = { ...clip, trimStart: newTrimStart, effectiveDuration: remaining }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return recalcTimeline({ ...timeline, clips: newClips })
}

function applyTrimEnd(timeline: Timeline, clipId: string, amount: number): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const newTrimEnd = clip.trimEnd + amount
  const remaining = (clip.duration - clip.trimStart - newTrimEnd) / clip.speed
  if (remaining < 0.5) return 'Trim would leave less than 0.5s remaining'
  const newClip = { ...clip, trimEnd: newTrimEnd, effectiveDuration: remaining }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return recalcTimeline({ ...timeline, clips: newClips })
}

function applySpeed(timeline: Timeline, clipId: string, speed: number): Timeline | string {
  if (speed < 0.25 || speed > 4.0) return 'Speed must be between 0.25x and 4.0x'
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const newClip = { ...clip, speed }
  newClip.effectiveDuration = calcEffective(newClip)
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return recalcTimeline({ ...timeline, clips: newClips })
}

function applyMove(timeline: Timeline, clipId: string, toIndex: number): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  if (toIndex < 0 || toIndex >= timeline.clips.length) return 'Target index out of bounds'
  const newClips = [...timeline.clips]
  const [clip] = newClips.splice(idx, 1)
  newClips.splice(toIndex, 0, clip)
  return recalcTimeline({ ...timeline, clips: newClips })
}

function applyMoveRelative(timeline: Timeline, clipId: string, direction: 'before' | 'after', targetClipId: string): Timeline | string {
  const fromIdx = timeline.clips.findIndex(c => c.id === clipId)
  if (fromIdx === -1) return 'Source clip not found'
  let targetIdx = timeline.clips.findIndex(c => c.id === targetClipId)
  if (targetIdx === -1) return 'Target clip not found'
  const newClips = [...timeline.clips]
  const [clip] = newClips.splice(fromIdx, 1)
  targetIdx = newClips.findIndex(c => c.id === targetClipId)
  const insertIdx = direction === 'before' ? targetIdx : targetIdx + 1
  newClips.splice(insertIdx, 0, clip)
  return recalcTimeline({ ...timeline, clips: newClips })
}

function applyDuplicate(timeline: Timeline, clipId: string): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const dupe: Clip = {
    ...clip,
    id: uid(),
    label: clip.label + ' (copy)',
    captions: clip.captions.map(c => ({ ...c, id: uid('cap') })),
    transitions: clip.transitions.map(t => ({ ...t })),
    effects: [...clip.effects],
  }
  const newClips = [...timeline.clips]
  newClips.splice(idx + 1, 0, dupe)
  return recalcTimeline({ ...timeline, clips: newClips })
}

function applyCaptionAdd(timeline: Timeline, clipId: string, text: string, startOffset = 0, endOffset?: number, style: 'bold' | 'glow' | 'karaoke' | 'outline' = 'bold', position: 'bottom' | 'center' | 'top' = 'bottom'): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const newCaption = { id: uid('cap'), text, startOffset, endOffset: endOffset ?? clip.effectiveDuration, style, position }
  const newClip = { ...clip, captions: [...clip.captions, newCaption] }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return { ...timeline, clips: newClips }
}

function applyCaptionEdit(timeline: Timeline, clipId: string, captionId: string, updates: Partial<Omit<import('./types').Caption, 'id'>>): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const capIdx = clip.captions.findIndex(c => c.id === captionId)
  if (capIdx === -1) return 'Caption not found'
  const newCaptions = [...clip.captions]
  newCaptions[capIdx] = { ...newCaptions[capIdx], ...updates }
  const newClips = [...timeline.clips]
  newClips[idx] = { ...clip, captions: newCaptions }
  return { ...timeline, clips: newClips }
}

function applyCaptionRemove(timeline: Timeline, clipId: string, captionId: string): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const newClip = { ...clip, captions: clip.captions.filter(c => c.id !== captionId) }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return { ...timeline, clips: newClips }
}

function applyEffectAdd(timeline: Timeline, clipId: string, effectId: string): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  if (clip.effects.includes(effectId)) return 'Effect already applied'
  const newClip = { ...clip, effects: [...clip.effects, effectId] }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return { ...timeline, clips: newClips }
}

function applyEffectRemove(timeline: Timeline, clipId: string, effectId: string): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  if (!clip.effects.includes(effectId)) return 'Effect not found on clip'
  const newClip = { ...clip, effects: clip.effects.filter(e => e !== effectId) }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return { ...timeline, clips: newClips }
}

function applyTrackVolume(timeline: Timeline, trackId: string, volume: number): Timeline | string {
  const idx = timeline.tracks.findIndex(t => t.id === trackId)
  if (idx === -1) return 'Track not found'
  if (volume < 0 || volume > 1) return 'Volume must be between 0 and 1'
  const newTracks = [...timeline.tracks]
  newTracks[idx] = { ...newTracks[idx], volume }
  return { ...timeline, tracks: newTracks }
}

function applyTrackMute(timeline: Timeline, trackId: string, muted: boolean): Timeline | string {
  const idx = timeline.tracks.findIndex(t => t.id === trackId)
  if (idx === -1) return 'Track not found'
  const newTracks = [...timeline.tracks]
  newTracks[idx] = { ...newTracks[idx], muted }
  return { ...timeline, tracks: newTracks }
}

function applyTrackMove(timeline: Timeline, trackId: string, startTime: number): Timeline | string {
  const idx = timeline.tracks.findIndex(t => t.id === trackId)
  if (idx === -1) return 'Track not found'
  if (startTime < 0) return 'Start time must be >= 0'
  const newTracks = [...timeline.tracks]
  newTracks[idx] = { ...newTracks[idx], startTime }
  return { ...timeline, tracks: newTracks }
}

function applyTransitionAdd(timeline: Timeline, clipId: string, edge: 'in' | 'out', transitionType: 'crossfade' | 'cut' | 'wipe' | 'zoom', duration = 0.5): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  if (clip.transitions.some(t => t.edge === edge)) return `Clip already has a transition on ${edge} edge`
  const newClip = { ...clip, transitions: [...clip.transitions, { type: transitionType, duration, edge }] }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return { ...timeline, clips: newClips }
}

function applyTransitionRemove(timeline: Timeline, clipId: string, edge: 'in' | 'out'): Timeline | string {
  const idx = timeline.clips.findIndex(c => c.id === clipId)
  if (idx === -1) return 'Clip not found'
  const clip = timeline.clips[idx]
  const newClip = { ...clip, transitions: clip.transitions.filter(t => t.edge !== edge) }
  const newClips = [...timeline.clips]
  newClips[idx] = newClip
  return { ...timeline, clips: newClips }
}

// ─── Single Op Applier ──────────────────────────────────────

function applyOp(timeline: Timeline, op: Op): Timeline | string {
  switch (op.type) {
    case 'cut': return applyCut(timeline, op.clipId, op.at)
    case 'delete': return applyDelete(timeline, op.clipId)
    case 'delete_batch': return applyDeleteBatch(timeline, op.clipIds)
    case 'trim_start': return applyTrimStart(timeline, op.clipId, op.amount)
    case 'trim_end': return applyTrimEnd(timeline, op.clipId, op.amount)
    case 'speed': return applySpeed(timeline, op.clipId, op.speed)
    case 'move': return applyMove(timeline, op.clipId, op.toIndex)
    case 'move_relative': return applyMoveRelative(timeline, op.clipId, op.direction, op.targetClipId)
    case 'duplicate': return applyDuplicate(timeline, op.clipId)
    case 'caption_add': return applyCaptionAdd(timeline, op.clipId, op.text, op.startOffset, op.endOffset, op.style, op.position)
    case 'caption_edit': return applyCaptionEdit(timeline, op.clipId, op.captionId, op.updates)
    case 'caption_remove': return applyCaptionRemove(timeline, op.clipId, op.captionId)
    case 'effect_add': return applyEffectAdd(timeline, op.clipId, op.effectId)
    case 'effect_remove': return applyEffectRemove(timeline, op.clipId, op.effectId)
    case 'track_volume': return applyTrackVolume(timeline, op.trackId, op.volume)
    case 'track_mute': return applyTrackMute(timeline, op.trackId, op.muted)
    case 'track_move': return applyTrackMove(timeline, op.trackId, op.startTime)
    case 'transition_add': return applyTransitionAdd(timeline, op.clipId, op.edge, op.transitionType, op.duration)
    case 'transition_remove': return applyTransitionRemove(timeline, op.clipId, op.edge)
    case 'select': return { ...timeline, selectedClipId: op.clipId }
    case 'seek': return { ...timeline, playhead: Math.max(0, Math.min(op.time, timeline.duration)) }
    case 'play': return { ...timeline, playing: true }
    case 'pause': return { ...timeline, playing: false }
    default: return 'Unknown operation type'
  }
}

// ─── Reducer ────────────────────────────────────────────────

export type EditorAction =
  | { type: 'dispatch'; op: Op }
  | { type: 'tick'; playhead: number }

const MAX_UNDO = 50

export function createInitialState(): EditorState {
  return {
    timeline: createInitialTimeline(),
    undoStack: [],
    redoStack: [],
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === 'tick') {
    return {
      ...state,
      timeline: { ...state.timeline, playhead: action.playhead },
    }
  }

  const op = action.op

  if (op.type === 'undo') {
    if (state.undoStack.length === 0) return state
    const previous = state.undoStack[state.undoStack.length - 1]
    return {
      timeline: { ...previous, stateVersion: state.timeline.stateVersion + 1 },
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, deepCloneTimeline(state.timeline)],
    }
  }

  if (op.type === 'redo') {
    if (state.redoStack.length === 0) return state
    const next = state.redoStack[state.redoStack.length - 1]
    return {
      timeline: { ...next, stateVersion: state.timeline.stateVersion + 1 },
      undoStack: [...state.undoStack, deepCloneTimeline(state.timeline)],
      redoStack: state.redoStack.slice(0, -1),
    }
  }

  if (op.type === 'batch') {
    let current = deepCloneTimeline(state.timeline)
    for (const subOp of op.ops) {
      if (subOp.type === 'undo' || subOp.type === 'redo' || subOp.type === 'batch') continue
      const result = applyOp(current, subOp)
      if (typeof result === 'string') continue
      current = result
    }
    current.stateVersion = state.timeline.stateVersion + 1
    const undoStack = [...state.undoStack, deepCloneTimeline(state.timeline)].slice(-MAX_UNDO)
    return { timeline: current, undoStack, redoStack: [] }
  }

  // Non-undoable ops: play/pause/seek/select don't push to undo stack
  const isTransient = op.type === 'play' || op.type === 'pause' || op.type === 'seek' || op.type === 'select'

  const result = applyOp(state.timeline, op)
  if (typeof result === 'string') return state

  const newTimeline = { ...result, stateVersion: state.timeline.stateVersion + 1 }

  if (isTransient) {
    return { ...state, timeline: newTimeline }
  }

  const undoStack = [...state.undoStack, deepCloneTimeline(state.timeline)].slice(-MAX_UNDO)
  return { timeline: newTimeline, undoStack, redoStack: [] }
}

// Re-export for the API bridge
export { applyOp, deepCloneTimeline, getClipStartTime }
