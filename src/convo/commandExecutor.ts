import type { Op, Timeline, ConvoContext, CommandLogEntry } from '../store/types'
import { tier1Parse } from './tier1Parser'
import { tier3Parse } from './tier3Parser'
import { sounds, opToSound } from '../audio/microSounds'
import { speak } from '../audio/tts'

let idCounter = 0
function uid() { return `cmd-${++idCounter}-${Date.now()}` }

export interface ExecuteResult {
  logEntry: CommandLogEntry
  ops: Op[]
}

const CANCEL_SIGNALS = ['never mind', 'actually no', 'wait', 'cancel', 'scratch that', "don't", 'no no', 'actually never mind']

export function executeCommand(
  text: string,
  timeline: Timeline,
  context: ConvoContext,
  dispatch: (op: Op) => { success: boolean; error?: string },
  soundEnabled = true,
): ExecuteResult {
  const lower = text.toLowerCase().trim()

  if (CANCEL_SIGNALS.some(sig => lower.includes(sig))) {
    return {
      logEntry: {
        id: uid(), text, explanation: 'Cancelled', status: 'cancelled',
        confidence: 1, ops: [], timestamp: Date.now(), affectedClipIds: [],
      },
      ops: [],
    }
  }

  const parsed = tier1Parse(text, timeline, context)

  if (parsed.escalate || parsed.ops.length === 0) {
    if (soundEnabled) sounds.thunk()
    return {
      logEntry: {
        id: uid(), text,
        explanation: "Complex command — try typing it more specifically, or use the Tier 3 LLM with an API key.",
        status: 'failed', confidence: parsed.confidence, ops: [], timestamp: Date.now(), affectedClipIds: [],
      },
      ops: [],
    }
  }

  return dispatchParsed(parsed.ops, parsed.explanation, parsed.confidence, text, dispatch, soundEnabled)
}

export async function executeCommandAsync(
  text: string,
  timeline: Timeline,
  context: ConvoContext,
  dispatch: (op: Op) => { success: boolean; error?: string },
  apiKey?: string,
  soundEnabled = true,
): Promise<ExecuteResult> {
  const lower = text.toLowerCase().trim()

  if (CANCEL_SIGNALS.some(sig => lower.includes(sig))) {
    return {
      logEntry: {
        id: uid(), text, explanation: 'Cancelled', status: 'cancelled',
        confidence: 1, ops: [], timestamp: Date.now(), affectedClipIds: [],
      },
      ops: [],
    }
  }

  const parsed = tier1Parse(text, timeline, context)

  if (!parsed.escalate && parsed.ops.length > 0) {
    return dispatchParsed(parsed.ops, parsed.explanation, parsed.confidence, text, dispatch, soundEnabled)
  }

  // Escalate to Tier 3
  if (apiKey) {
    const tier3 = await tier3Parse(text, timeline, apiKey)
    if (tier3.ops.length > 0) {
      return dispatchParsed(tier3.ops, tier3.explanation, tier3.confidence, text, dispatch, soundEnabled)
    }
    return {
      logEntry: {
        id: uid(), text, explanation: tier3.explanation || "Couldn't understand that command.",
        status: 'failed', confidence: 0, ops: [], timestamp: Date.now(), affectedClipIds: [],
      },
      ops: [],
    }
  }

  if (soundEnabled) sounds.thunk()
  return {
    logEntry: {
      id: uid(), text,
      explanation: "I didn't understand that. Try a simpler command or add an API key for complex edits.",
      status: 'failed', confidence: 0, ops: [], timestamp: Date.now(), affectedClipIds: [],
    },
    ops: [],
  }
}

function dispatchParsed(
  ops: Op[],
  explanation: string,
  confidence: number,
  text: string,
  dispatch: (op: Op) => { success: boolean; error?: string },
  soundEnabled: boolean,
): ExecuteResult {
  const op: Op = ops.length === 1
    ? ops[0]
    : { type: 'batch', ops, label: explanation }

  const result = dispatch(op)

  if (!result.success) {
    if (soundEnabled) sounds.thunk()
    return {
      logEntry: {
        id: uid(), text, explanation: result.error ?? 'Operation failed', status: 'failed',
        confidence, ops, timestamp: Date.now(), affectedClipIds: [],
      },
      ops: [],
    }
  }

  if (soundEnabled) {
    const primaryOp = ops[0]
    const sound = opToSound(primaryOp.type)
    if (sound) sounds[sound]()
  }

  const affectedClipIds = ops
    .map(o => ('clipId' in o ? (o as { clipId: string }).clipId : null))
    .filter((id): id is string => id != null)

  if (ops.length > 2 && soundEnabled) {
    speak(explanation)
  }

  return {
    logEntry: {
      id: uid(), text, explanation, status: 'applied',
      confidence, ops, timestamp: Date.now(), affectedClipIds,
    },
    ops,
  }
}
