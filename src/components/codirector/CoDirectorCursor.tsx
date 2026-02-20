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
    case 'effect_add': case 'transition_add': return 'wand'
    case 'effect_remove': case 'transition_remove': return 'wand'
    case 'track_volume': return 'volume'
    case 'track_mute': return 'volume'
    case 'select': return 'pointer'
    case 'seek': return 'seek'
    default: return 'pointer'
  }
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

    // Find the target element on the timeline
    let targetEl: Element | undefined
    const opAny = op as Record<string, unknown>
    if (opAny.clipId) {
      const clipId = opAny.clipId as string
      document.querySelectorAll('[data-clip-id]').forEach(el => {
        if (el.getAttribute('data-clip-id') === clipId) targetEl = el
      })
    }
    if (opAny.trackId) {
      const trackId = opAny.trackId as string
      document.querySelectorAll('[data-track-id]').forEach(el => {
        if (el.getAttribute('data-track-id') === trackId) targetEl = el
      })
    }

    const rect = targetEl?.getBoundingClientRect() ?? {
      left: window.innerWidth / 2 - 50,
      top: window.innerHeight * 0.45,
      width: 100,
      height: 60,
    }

    const targetX = rect.left + rect.width / 2
    const targetY = rect.top + rect.height / 2

    // Start position: off-screen right
    const startX = window.innerWidth + 20
    const startY = targetY - 30

    const startTime = performance.now()
    const travelDuration = 400
    const holdDuration = 200
    const actionDuration = 300
    const fadeDuration = 300

    const totalDuration = travelDuration + holdDuration + actionDuration + fadeDuration

    // Show cursor at start
    setCursor({
      visible: true, x: startX, y: startY, shape: 'pointer', trail: [], label: '',
    })

    function tick(now: number) {
      const elapsed = now - startTime
      const trail = trailRef.current

      if (elapsed < travelDuration) {
        // Phase 1: Travel to target
        const t = easeOutCubic(elapsed / travelDuration)
        const x = startX + (targetX - startX) * t
        const y = startY + (targetY - startY) * t

        // Update trail
        trail.unshift({ x, y, opacity: 0.4 })
        if (trail.length > 4) trail.pop()
        trail.forEach((p, i) => { p.opacity = 0.4 - i * 0.1 })
        trailRef.current = trail

        setCursor({ visible: true, x, y, shape: 'pointer', trail: [...trail], label: '' })
      } else if (elapsed < travelDuration + holdDuration) {
        // Phase 2: Hold + morph to action shape
        const morphT = (elapsed - travelDuration) / holdDuration
        setCursor(prev => ({
          ...prev, x: targetX, y: targetY,
          shape: morphT > 0.5 ? shape : 'pointer',
          trail: trail.map(p => ({ ...p, opacity: p.opacity * 0.9 })),
        }))
      } else if (elapsed < travelDuration + holdDuration + actionDuration) {
        // Phase 3: Action animation
        const actionT = (elapsed - travelDuration - holdDuration) / actionDuration
        let x = targetX
        let y = targetY

        // Shape-specific motion
        if (shape === 'trim') {
          x = targetX + actionT * 30 // drag rightward
        } else if (shape === 'grab') {
          x = targetX + Math.sin(actionT * Math.PI) * 40
          y = targetY - actionT * 3
        } else if (shape === 'delete') {
          y = targetY + actionT * 4 // push down
        } else if (shape === 'wand') {
          // sparkle rotation
        }

        setCursor(prev => ({
          ...prev, x, y, shape,
          trail: trail.map(p => ({ ...p, opacity: p.opacity * 0.8 })),
        }))
      } else if (elapsed < totalDuration) {
        // Phase 4: Fade out
        const fadeT = (elapsed - travelDuration - holdDuration - actionDuration) / fadeDuration
        setCursor(prev => ({
          ...prev, visible: fadeT < 0.8, shape,
          trail: [],
        }))
      } else {
        // Done
        setCursor(prev => ({ ...prev, visible: false, trail: [] }))
        trailRef.current = []
        onAnimationComplete?.()
        return
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
  }, [onAnimationComplete])

  useEffect(() => {
    if (pendingOp) {
      const op = pendingOp.op
      // Skip transient ops
      if (op.type === 'play' || op.type === 'pause' || op.type === 'undo' || op.type === 'redo') {
        onAnimationComplete?.()
        return
      }
      // For batches, animate for the first op
      const animOp = op.type === 'batch' ? (op.ops[0] ?? op) : op
      animate(animOp)
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [pendingOp, animate])

  if (!cursor.visible) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Trail */}
      {cursor.trail.map((p, i) => (
        <div
          key={i}
          className="absolute w-5 h-5 rounded-full"
          style={{
            left: p.x - 10,
            top: p.y - 10,
            background: `rgba(255, 255, 255, ${p.opacity * 0.3})`,
            filter: 'blur(4px)',
            transition: 'left 30ms, top 30ms',
          }}
        />
      ))}

      {/* Main cursor */}
      <div
        className="absolute flex items-center gap-1"
        style={{
          left: cursor.x,
          top: cursor.y,
          transform: 'translate(-4px, -4px)',
          transition: 'left 16ms linear, top 16ms linear',
        }}
      >
        {/* Cursor icon */}
        <div className="relative">
          <div className="w-6 h-6 flex items-center justify-center text-white text-sm
                          drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
               style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.4))' }}>
            {SHAPE_ICONS[cursor.shape]}
          </div>
          {/* "Co" badge */}
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-white
                          flex items-center justify-center text-[5px] font-bold text-neutral-900">
            Co
          </div>
        </div>

        {/* Sparkle particles for 'wand' shape */}
        {cursor.shape === 'wand' && (
          <div className="absolute -inset-3">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white rounded-full animate-ping"
                style={{
                  left: `${30 + Math.cos(i * 1.57) * 20}%`,
                  top: `${30 + Math.sin(i * 1.57) * 20}%`,
                  animationDelay: `${i * 75}ms`,
                  animationDuration: '600ms',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
