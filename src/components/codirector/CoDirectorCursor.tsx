import { useState, useEffect, useRef, useCallback } from 'react'
import type { Op } from '../../store/types'

type CursorShape = 'pointer' | 'scissors' | 'trim' | 'grab' | 'speed' | 'delete' | 'text' | 'wand' | 'volume' | 'seek'

interface CursorState {
  visible: boolean
  x: number
  y: number
  shape: CursorShape
  trail: { x: number; y: number; opacity: number }[]
  label: string
}

const SHAPE_ICONS: Record<CursorShape, string> = {
  pointer: '↗',
  scissors: '✂',
  trim: '┃◄',
  grab: '✊',
  speed: '⏩',
  delete: '✕',
  text: 'T',
  wand: '✦',
  volume: '🔊',
  seek: '▶|',
}

function opToShape(opType: string): CursorShape {
  switch (opType) {
    case 'cut': return 'scissors'
    case 'delete': case 'delete_batch': return 'delete'
    case 'trim_start': case 'trim_end': return 'trim'
    case 'speed': return 'speed'
    case 'move': case 'move_relative': return 'grab'
    case 'duplicate': return 'pointer'
    case 'caption_add': case 'caption_edit': return 'text'
    case 'text_layer_add': case 'text_layer_edit': case 'text_layer_remove': case 'text_layer_move': return 'text'
    case 'effect_add': case 'transition_add': return 'wand'
    case 'effect_remove': case 'transition_remove': return 'wand'
    case 'track_volume': case 'track_mute': return 'volume'
    case 'select': case 'select_text_layer': case 'select_track': return 'pointer'
    case 'seek': return 'seek'
    default: return 'pointer'
  }
}

/** Find target element for the cursor; prefer larger hit areas */
function findTargetElement(op: Op): Element | undefined {
  const opAny = op as Record<string, unknown>

  if (opAny.clipIds && Array.isArray(opAny.clipIds) && (opAny.clipIds as string[]).length > 0) {
    const clipId = (opAny.clipIds as string[])[0]
    let el: Element | undefined
    document.querySelectorAll('[data-clip-id]').forEach(e => {
      if (e.getAttribute('data-clip-id') === clipId) el = e
    })
    return el
  }
  if (opAny.clipId) {
    const clipId = opAny.clipId as string
    let el: Element | undefined
    document.querySelectorAll('[data-clip-id]').forEach(e => {
      if (e.getAttribute('data-clip-id') === clipId) el = e
    })
    return el
  }
  if (opAny.trackId) {
    const trackId = opAny.trackId as string
    const row = document.querySelector(`[data-track-row][data-track-id="${trackId}"]`)
    if (row) return row
    let el: Element | undefined
    document.querySelectorAll('[data-track-id]').forEach(e => {
      if (e.getAttribute('data-track-id') === trackId) el = e
    })
    return el
  }
  if (opAny.textLayerId) {
    const textLayerId = opAny.textLayerId as string
    let el: Element | undefined
    document.querySelectorAll('[data-text-layer-id]').forEach(e => {
      if (e.getAttribute('data-text-layer-id') === textLayerId) el = e
    })
    return el
  }
  return undefined
}

function clampToViewport(x: number, y: number, padding = 60): { x: number; y: number } {
  return {
    x: Math.max(padding, Math.min(window.innerWidth - padding, x)),
    y: Math.max(padding, Math.min(window.innerHeight - padding, y)),
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

interface Props {
  pendingOp: { op: Op; targetElement?: string } | null
  onAnimationComplete?: () => void
}

export default function CoDirectorCursor({ pendingOp, onAnimationComplete }: Props) {
  const [cursor, setCursor] = useState<CursorState>({
    visible: false, x: -100, y: -100, shape: 'pointer', trail: [], label: '',
  })
  const animRef = useRef<number>(0)
  const trailRef = useRef<{ x: number; y: number; opacity: number }[]>([])

  const animate = useCallback((op: Op) => {
    const shape = opToShape(op.type)

    // Delay so React has time to update the DOM after the command
    const runAnimation = () => {
      const el = findTargetElement(op)
      const rect = el?.getBoundingClientRect() ?? {
        left: window.innerWidth / 2 - 50,
        top: window.innerHeight * 0.4,
        width: 100,
        height: 60,
      }

      let targetX = rect.left + rect.width / 2
      let targetY = rect.top + rect.height / 2
      const clamped = clampToViewport(targetX, targetY)
      targetX = clamped.x
      targetY = clamped.y

      const startX = window.innerWidth + 30
      const startY = targetY

      const startTime = performance.now()
      const travelDuration = 350
      const holdDuration = 180
      const actionDuration = 280
      const fadeDuration = 250
      const totalDuration = travelDuration + holdDuration + actionDuration + fadeDuration

      setCursor({ visible: true, x: startX, y: startY, shape: 'pointer', trail: [], label: '' })
      trailRef.current = []

      function tick(now: number) {
          const elapsed = now - startTime
          const trail = trailRef.current

          if (elapsed < travelDuration) {
            const t = easeInOutCubic(elapsed / travelDuration)
            const x = startX + (targetX - startX) * t
            const y = startY + (targetY - startY) * t

            trail.unshift({ x, y, opacity: 0.5 })
            if (trail.length > 6) trail.pop()
            trail.forEach((p, i) => { p.opacity = Math.max(0, 0.5 - i * 0.08) })
            trailRef.current = trail

            setCursor({ visible: true, x, y, shape: 'pointer', trail: [...trail], label: '' })
          } else if (elapsed < travelDuration + holdDuration) {
            const morphT = (elapsed - travelDuration) / holdDuration
            setCursor(prev => ({
              ...prev, x: targetX, y: targetY,
              shape: morphT > 0.4 ? shape : 'pointer',
              trail: trail.map(p => ({ ...p, opacity: p.opacity * 0.85 })),
            }))
          } else if (elapsed < travelDuration + holdDuration + actionDuration) {
            const actionT = (elapsed - travelDuration - holdDuration) / actionDuration
            let x = targetX
            let y = targetY

            if (shape === 'trim') {
              x = targetX + actionT * 25
            } else if (shape === 'grab') {
              x = targetX + Math.sin(actionT * Math.PI) * 35
              y = targetY - actionT * 2
            } else if (shape === 'delete') {
              y = targetY + actionT * 6
            } else if (shape === 'scissors') {
              y = targetY - Math.sin(actionT * Math.PI) * 8
            }

            setCursor(prev => ({
              ...prev, x, y, shape,
              trail: trail.map(p => ({ ...p, opacity: p.opacity * 0.7 })),
            }))
          } else if (elapsed < totalDuration) {
            const fadeT = (elapsed - travelDuration - holdDuration - actionDuration) / fadeDuration
            setCursor(prev => ({
              ...prev, visible: fadeT < 0.85, shape,
              trail: [],
            }))
          } else {
            setCursor(prev => ({ ...prev, visible: false, trail: [] }))
            trailRef.current = []
            onAnimationComplete?.()
            return
          }

          animRef.current = requestAnimationFrame(tick)
        }

      animRef.current = requestAnimationFrame(tick)
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(runAnimation)
    })
  }, [onAnimationComplete])

  useEffect(() => {
    if (pendingOp) {
      const op = pendingOp.op
      if (op.type === 'play' || op.type === 'pause' || op.type === 'seek' || op.type === 'undo' || op.type === 'redo') {
        onAnimationComplete?.()
        return
      }
      const animOp = op.type === 'batch' ? (op.ops[0] ?? op) : op
      if (animOp && animOp.type !== 'play' && animOp.type !== 'pause' && animOp.type !== 'seek') {
        animate(animOp)
      } else {
        onAnimationComplete?.()
      }
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [pendingOp, animate, onAnimationComplete])

  if (!cursor.visible) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {cursor.trail.map((p, i) => (
        <div
          key={i}
          className="absolute w-5 h-5 rounded-full"
          style={{
            left: p.x - 10,
            top: p.y - 10,
            background: `rgba(255, 255, 255, ${p.opacity * 0.35})`,
            filter: 'blur(5px)',
          }}
        />
      ))}

      <div
        className="absolute flex items-center justify-center will-change-transform"
        style={{
          left: cursor.x,
          top: cursor.y,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="relative">
          <div className="w-7 h-7 flex items-center justify-center text-white text-base
                          drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]"
               style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
            {SHAPE_ICONS[cursor.shape]}
          </div>
          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-white
                          flex items-center justify-center text-[5px] font-bold text-neutral-900 shadow-sm">
            Co
          </div>
        </div>

        {cursor.shape === 'wand' && (
          <div className="absolute -inset-4 pointer-events-none">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="absolute w-1.5 h-1.5 bg-white rounded-full animate-ping"
                style={{
                  left: `${50 + Math.cos(i * 1.57) * 25}%`,
                  top: `${50 + Math.sin(i * 1.57) * 25}%`,
                  transform: 'translate(-50%, -50%)',
                  animationDelay: `${i * 80}ms`,
                  animationDuration: '500ms',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
