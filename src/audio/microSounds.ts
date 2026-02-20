let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, freqEnd?: number) {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration / 1000)
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration / 1000)
  } catch { /* audio not available */ }
}

export const sounds = {
  tick: () => playTone(800, 80, 'sine', 0.12),
  snip: () => playTone(1200, 100, 'square', 0.08),
  poof: () => playTone(400, 120, 'sine', 0.1),
  whoosh: () => playTone(600, 150, 'sine', 0.1, 200),
  thunk: () => playTone(200, 100, 'triangle', 0.15),
  ding: () => playTone(1000, 200, 'sine', 0.1),
  chirp: () => {
    playTone(800, 100, 'sine', 0.08)
    setTimeout(() => playTone(1100, 100, 'sine', 0.08), 130)
  },
}

export type SoundName = keyof typeof sounds

export function opToSound(opType: string): SoundName | null {
  switch (opType) {
    case 'cut': return 'snip'
    case 'delete': case 'delete_batch': return 'poof'
    case 'trim_start': case 'trim_end': return 'snip'
    case 'speed': return 'tick'
    case 'move': case 'move_relative': return 'whoosh'
    case 'duplicate': return 'tick'
    case 'effect_add': case 'transition_add': return 'ding'
    case 'select': return 'tick'
    default: return null
  }
}
