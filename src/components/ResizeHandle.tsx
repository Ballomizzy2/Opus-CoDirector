import { useCallback, useEffect, useState } from 'react'

interface Props {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  className?: string
}

/** Draggable resize handle; direction indicates which axis the divider moves along */
export default function ResizeHandle({ direction, onResize, className = '' }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const delta = direction === 'horizontal' ? e.movementY : e.movementX
      onResize(delta)
    }
    const onUp = () => setDragging(false)

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = direction === 'horizontal' ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, direction, onResize])

  const gripClass = direction === 'horizontal'
    ? 'w-12 h-1 rounded-full'
    : 'w-1 h-12 rounded-full'

  const cursorClass = direction === 'horizontal' ? 'cursor-ns-resize' : 'cursor-ew-resize'

  return (
    <div
      className={`flex items-center justify-center shrink-0 select-none py-1 ${direction === 'vertical' ? 'px-0.5' : ''} ${className}`}
      style={{ touchAction: 'none' }}
    >
      <div
        onMouseDown={handleMouseDown}
        className={`${gripClass} bg-neutral-500/50 hover:bg-neutral-500 ${cursorClass} transition-colors ${dragging ? 'bg-neutral-400' : ''}`}
      />
    </div>
  )
}
