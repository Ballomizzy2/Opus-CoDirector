import type { TextLayer, Op } from '../../store/types'
import { Trash2 } from 'lucide-react'

interface Props {
  textLayer: TextLayer
  dispatch: (op: Op) => void
}

export default function TextLayerInspector({ textLayer, dispatch }: Props) {
  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div>
        <h3 className="text-sm font-semibold text-white truncate">Text Layer</h3>
        <div className="text-[10px] text-neutral-400 mt-1">
          {textLayer.startTime.toFixed(1)}s → {textLayer.endTime.toFixed(1)}s
        </div>
      </div>

      <div>
        <span className="text-neutral-300 block mb-1">Text</span>
        <input
          type="text"
          value={textLayer.text}
          onChange={e => dispatch({ type: 'text_layer_edit', textLayerId: textLayer.id, updates: { text: e.target.value } })}
          className="w-full bg-neutral-600 border border-neutral-500 rounded px-2 py-1 text-white text-[11px] focus:outline-none focus:border-white/50"
        />
      </div>

      <div>
        <span className="text-neutral-300 block mb-1">Position</span>
        <div className="flex gap-1">
          {(['top', 'center', 'bottom'] as const).map(pos => (
            <button
              key={pos}
              className={`px-2 py-0.5 rounded text-[10px] capitalize
                ${textLayer.position === pos ? 'bg-white text-neutral-900' : 'bg-neutral-600 text-neutral-300 hover:bg-neutral-500'}`}
              onClick={() => dispatch({ type: 'text_layer_edit', textLayerId: textLayer.id, updates: { position: pos } })}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 mt-1 pt-2 border-t border-neutral-500/30">
        <button
          className="flex items-center gap-1 px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 text-[10px] ml-auto"
          onClick={() => dispatch({ type: 'text_layer_remove', textLayerId: textLayer.id })}
        >
          <Trash2 size={10} /> Remove
        </button>
      </div>
    </div>
  )
}
