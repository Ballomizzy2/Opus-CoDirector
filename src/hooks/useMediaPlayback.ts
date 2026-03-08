import { useRef, useEffect } from 'react'
import type { Timeline, Clip } from '../store/types'
import { sounds } from '../audio/microSounds'

function getClipAtPlayhead(clips: Clip[], playhead: number): { clip: Clip; clipStart: number } | null {
  let t = 0
  for (const clip of clips) {
    if (playhead < t + clip.effectiveDuration) {
      return { clip, clipStart: t }
    }
    t += clip.effectiveDuration
  }
  if (clips.length > 0 && playhead >= t - 0.01) {
    const last = clips[clips.length - 1]
    return { clip: last, clipStart: t - last.effectiveDuration }
  }
  return null
}

/** Compute source video time from playhead, respecting clip source ranges, trim, and speed */
function playheadToSourceTime(clips: Clip[], playhead: number): number {
  const info = getClipAtPlayhead(clips, playhead)
  if (!info) return playhead

  const { clip, clipStart } = info
  const srcStart = clip.sourceStart ?? clipStart
  const srcEnd = clip.sourceEnd ?? srcStart + clip.duration
  const offsetInClip = playhead - clipStart

  // Effective clip plays from trimStart to (duration - trimEnd) in source, at given speed
  const sourceTime = srcStart + clip.trimStart + offsetInClip * clip.speed
  return Math.max(srcStart + clip.trimStart, Math.min(srcEnd - clip.trimEnd, sourceTime))
}

/** Syncs video, audio tracks, and SFX to timeline playhead */
export function useMediaPlayback(timeline: Timeline) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const voiceoverRef = useRef<HTMLAudioElement>(null)

  const { playhead, playing, videoSrc, tracks, clips } = timeline

  // Sync video to playhead — use per-clip source ranges so edits (trim, speed) affect playback
  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoSrc) return

    const sourceTime = playheadToSourceTime(clips, playhead)
    if (Math.abs(v.currentTime - sourceTime) > 0.3) {
      v.currentTime = sourceTime
    }
  }, [playhead, videoSrc, clips])

  // Play/pause video
  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoSrc) return

    if (playing) v.play().catch(() => {})
    else v.pause()
  }, [playing, videoSrc])

  // Sync and play/pause music track
  const musicTrack = tracks.find(t => t.type === 'music' && t.src)
  useEffect(() => {
    const a = musicRef.current
    if (!a || !musicTrack?.src) return

    const inRange = playhead >= musicTrack.startTime && playhead < musicTrack.startTime + musicTrack.duration
    a.volume = musicTrack.muted ? 0 : musicTrack.volume
    if (inRange) {
      a.currentTime = playhead - musicTrack.startTime
      if (playing) a.play().catch(() => {})
    } else {
      a.pause()
    }
  }, [playhead, playing, musicTrack])

  // Sync and play/pause voiceover track
  const voiceoverTrack = tracks.find(t => t.type === 'voiceover' && t.src)
  useEffect(() => {
    const a = voiceoverRef.current
    if (!a || !voiceoverTrack?.src) return

    const inRange = playhead >= voiceoverTrack.startTime && playhead < voiceoverTrack.startTime + voiceoverTrack.duration
    a.volume = voiceoverTrack.muted ? 0 : voiceoverTrack.volume
    if (inRange) {
      a.currentTime = playhead - voiceoverTrack.startTime
      if (playing) a.play().catch(() => {})
    } else {
      a.pause()
    }
  }, [playhead, playing, voiceoverTrack])

  // Trigger SFX when playhead enters each SFX segment (one layer, multiple segments)
  const lastSfxTriggersRef = useRef<Record<string, boolean>>({})
  useEffect(() => {
    const sfxTracks = tracks.filter(t => t.type === 'sfx' && !t.src)
    sfxTracks.forEach(sfxTrack => {
      if (sfxTrack.muted) return
      const segments = sfxTrack.segments ?? []
      segments.forEach((seg: { id: string; startTime: number; duration: number; sfxType: string }) => {
        const inRegion = playhead >= seg.startTime && playhead < seg.startTime + seg.duration
        const wasInRegion = lastSfxTriggersRef.current[seg.id]
        const justEntered = inRegion && !wasInRegion
        if (justEntered) {
          const play = sounds[seg.sfxType as keyof typeof sounds]
          if (typeof play === 'function') play()
        }
        lastSfxTriggersRef.current[seg.id] = inRegion
      })
    })
  }, [playhead, tracks])

  return { videoRef, musicRef, voiceoverRef }
}
