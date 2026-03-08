import { useReducer, useCallback, useRef, useEffect, useState } from 'react'
import { editorReducer, createInitialState } from './store/editorReducer'
import { useMediaPlayback } from './hooks/useMediaPlayback'
import type { Op, CommandLogEntry, ConvoContext } from './store/types'
import type { Toast } from './components/codirector/UndoToast'
import { executeCommand, executeCommandAsync } from './convo/commandExecutor'
import TimelineTracks from './components/editor/TimelineTracks'
import Preview from './components/editor/Preview'
import Inspector from './components/editor/Inspector'
import TextLayerInspector from './components/editor/TextLayerInspector'
import TrackInspector from './components/editor/TrackInspector'
import Transport from './components/editor/Transport'
import CommandLog from './components/codirector/CommandLog'
import InputArea from './components/codirector/InputArea'
import UndoToast from './components/codirector/UndoToast'
import CoDirectorCursor from './components/codirector/CoDirectorCursor'
import ProactiveSuggestion from './components/codirector/ProactiveSuggestion'
import ResizeHandle from './components/ResizeHandle'
import { Undo2, Redo2, Settings, Download, Key, X } from 'lucide-react'

export default function App() {
  const [state, reducerDispatch] = useReducer(editorReducer, null, createInitialState)
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [cursorEnabled, setCursorEnabled] = useState(true)
  const [pendingCursorOp, setPendingCursorOp] = useState<{ op: Op } | null>(null)
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('codirector-api-key') ?? '')
  const [showSettings, setShowSettings] = useState(false)
  const [convoContext, setConvoContext] = useState<ConvoContext>({
    lastReferencedClipId: null, lastReferencedTextLayerId: null, lastReferencedTrackId: null, lastOperation: null, lastMentionedTime: null,
    recentClipIds: [], lastActivityTimestamp: Date.now(),
  })
  const playInterval = useRef<number | null>(null)
  const timelineRef = useRef(state.timeline)
  timelineRef.current = state.timeline
  const contextRef = useRef(convoContext)
  contextRef.current = convoContext
  const { timeline } = state

  const { videoRef, musicRef, voiceoverRef } = useMediaPlayback(timeline)

  // Resizable panel state
  const [editorRatio, setEditorRatio] = useState(0.65)
  const [previewWidth, setPreviewWidth] = useState(192)
  const [inspectorRatio, setInspectorRatio] = useState(0.4)
  const contentRef = useRef<HTMLDivElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)

  // Playback loop
  useEffect(() => {
    if (timeline.playing) {
      const start = performance.now()
      const startPlayhead = timeline.playhead
      playInterval.current = window.setInterval(() => {
        const elapsed = (performance.now() - start) / 1000
        const newPlayhead = startPlayhead + elapsed
        if (newPlayhead >= timelineRef.current.duration) {
          reducerDispatch({ type: 'dispatch', op: { type: 'pause' } })
          reducerDispatch({ type: 'tick', playhead: 0 })
        } else {
          reducerDispatch({ type: 'tick', playhead: newPlayhead })
        }
      }, 50)
    } else if (playInterval.current) {
      clearInterval(playInterval.current)
      playInterval.current = null
    }
    return () => { if (playInterval.current) clearInterval(playInterval.current) }
  }, [timeline.playing])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.code === 'Space') { e.preventDefault(); dispatch(timelineRef.current.playing ? { type: 'pause' } : { type: 'play' }) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'undo' }) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); dispatch({ type: 'redo' }) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const dispatch = useCallback((op: Op) => {
    reducerDispatch({ type: 'dispatch', op })
    return { success: true }
  }, [])

  const trackedDispatch = useCallback((op: Op): { success: boolean; error?: string } => {
    try {
      reducerDispatch({ type: 'dispatch', op })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }, [])

  const processResult = useCallback((result: { logEntry: CommandLogEntry; ops: Op[] }) => {
    setCommandLog(prev => [...prev, result.logEntry])

    const lastClipId = result.logEntry.affectedClipIds[0]
    const lastTextLayerId = result.ops
      .map(o => ('textLayerId' in o ? (o as { textLayerId: string }).textLayerId : null))
      .find(id => id != null)
    const lastTrackId = result.ops
      .map(o => (o.type === 'select_track' && o.trackId ? o.trackId : ('trackId' in o ? (o as { trackId: string }).trackId : null)))
      .find(id => id != null)
    if (lastClipId || lastTextLayerId || lastTrackId) {
      setConvoContext(prev => ({
        ...prev,
        lastReferencedClipId: lastClipId ?? prev.lastReferencedClipId,
        lastReferencedTextLayerId: lastTextLayerId ?? prev.lastReferencedTextLayerId,
        lastReferencedTrackId: lastTrackId ?? prev.lastReferencedTrackId,
        lastOperation: result.ops[0] ?? null,
        recentClipIds: lastClipId ? [lastClipId, ...prev.recentClipIds.filter(id => id !== lastClipId)].slice(0, 5) : prev.recentClipIds,
        lastActivityTimestamp: Date.now(),
      }))
    }

    // Trigger cursor animation
    if (cursorEnabled && result.ops.length > 0 && result.logEntry.status === 'applied') {
      setPendingCursorOp({ op: result.ops[0] })
    }

    const opType = result.ops[0]?.type
    if (result.logEntry.status === 'applied' && opType && !['play', 'pause', 'seek', 'select', 'select_text_layer', 'select_track', 'undo', 'redo'].includes(opType)) {
      const isDestructive = opType === 'delete' || opType === 'delete_batch'
      setToasts(prev => [
        { id: result.logEntry.id, message: result.logEntry.explanation, destructive: isDestructive, timestamp: Date.now() },
        ...prev,
      ].slice(0, 3))
    }
  }, [cursorEnabled])

  const handleCommand = useCallback((text: string) => {
    const tl = timelineRef.current
    const ctx = contextRef.current

    // Try synchronous Tier 1 first
    const result = executeCommand(text, tl, ctx, trackedDispatch)

    if (result.logEntry.status !== 'failed') {
      processResult(result)
      return
    }

    // If Tier 1 failed and we have an API key, try Tier 3 async
    if (apiKey) {
      const thinkingEntry: CommandLogEntry = {
        id: `thinking-${Date.now()}`, text, explanation: 'Thinking...', status: 'thinking',
        confidence: 0, ops: [], timestamp: Date.now(), affectedClipIds: [],
      }
      setCommandLog(prev => [...prev, thinkingEntry])

      executeCommandAsync(text, tl, ctx, trackedDispatch, apiKey).then(asyncResult => {
        setCommandLog(prev => prev.filter(e => e.id !== thinkingEntry.id))
        processResult(asyncResult)
      })
      return
    }

    // No API key, show the Tier 1 failure
    processResult(result)
  }, [trackedDispatch, processResult, apiKey])

  const handleUndo = useCallback(() => dispatch({ type: 'undo' }), [dispatch])
  const handleDismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const selectedClip = timeline.clips.find(c => c.id === timeline.selectedClipId) ?? null
  const selectedTextLayer = timeline.textLayers.find(tl => tl.id === timeline.selectedTextLayerId) ?? null
  const selectedTrack = timeline.tracks.find(t => t.id === timeline.selectedTrackId) ?? null
  const selectedClipStart = (() => {
    if (!selectedClip) return 0
    let t = 0
    for (const c of timeline.clips) {
      if (c.id === selectedClip.id) return t
      t += c.effectiveDuration
    }
    return 0
  })()

  // Preview always follows the playhead
  const previewClip = (() => {
    let t = 0
    for (const c of timeline.clips) {
      if (timeline.playhead < t + c.effectiveDuration) return c
      t += c.effectiveDuration
    }
    return timeline.clips[timeline.clips.length - 1] ?? null
  })()

  const handleLogEntryClick = useCallback((clipIds: string[]) => {
    if (clipIds.length > 0) dispatch({ type: 'select', clipId: clipIds[0] })
  }, [dispatch])

  const handleSaveApiKey = useCallback((key: string) => {
    setApiKey(key)
    localStorage.setItem('codirector-api-key', key)
  }, [])

  const musicTrack = timeline.tracks.find(t => t.type === 'music' && t.src)
  const voiceoverTrack = timeline.tracks.find(t => t.type === 'voiceover' && t.src)

  return (
    <div className="h-screen flex flex-col bg-neutral-800 text-white overflow-hidden">
      {/* Hidden audio for music and voiceover playback */}
      {musicTrack?.src && (
        <audio ref={musicRef} src={musicTrack.src} className="hidden" />
      )}
      {voiceoverTrack?.src && (
        <audio ref={voiceoverRef} src={voiceoverTrack.src} className="hidden" />
      )}
      {/* ─── Header ─── */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-neutral-600/30 bg-neutral-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <img src="/opus-clip-social-preview.png" alt="Opus Pro" className="w-6 h-6 rounded-md object-contain" />
            <span className="text-sm font-semibold text-white">Opus Pro</span>
          </div>
          <span className="text-[10px] text-neutral-400">|</span>
          <span className="text-xs text-white/70 font-medium">CoDirector</span>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-neutral-600 text-neutral-400 hover:text-white transition-colors"
                  onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)">
            <Undo2 size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-neutral-600 text-neutral-400 hover:text-white transition-colors"
                  onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={14} />
          </button>
          <div className="w-px h-4 bg-neutral-500/40 mx-1" />
          {apiKey && (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" title="Tier 3 LLM connected" />
          )}
          <button className="p-1.5 rounded hover:bg-neutral-600 text-neutral-400 hover:text-white transition-colors"
                  onClick={() => setShowSettings(!showSettings)} title="Settings">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="shrink-0 px-4 py-3 border-b border-neutral-500/30 bg-neutral-600/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-300">Settings</span>
            <button className="text-neutral-400 hover:text-white" onClick={() => setShowSettings(false)}><X size={12} /></button>
          </div>
          <div className="flex items-center gap-2">
            <Key size={12} className="text-neutral-400 shrink-0" />
            <input
              type="password"
              placeholder="Anthropic API key (for Tier 3 complex commands)"
              value={apiKey}
              onChange={e => handleSaveApiKey(e.target.value)}
              className="flex-1 bg-neutral-600 border border-neutral-500 rounded px-2 py-1 text-[11px] text-neutral-200
                         placeholder:text-neutral-400 focus:outline-none focus:border-white/50"
            />
            {apiKey && <span className="text-[9px] text-emerald-400">Active</span>}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
            <input type="checkbox" checked={cursorEnabled} onChange={e => setCursorEnabled(e.target.checked)}
                   className="rounded bg-neutral-500 border-neutral-400" />
            Show CoDirector cursor
          </label>
        </div>
      )}

      {/* ─── Main content: Editor + CoDirector (resizable) ─── */}
      <div ref={contentRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Editor Zone */}
        <div
          className="min-h-0 flex border-b border-neutral-500/30 overflow-hidden"
          style={{ flex: `0 0 ${editorRatio * 100}%` }}
        >
          {/* Left: Preview (resizable width) */}
          <div
            className="shrink-0 p-3 border-r border-neutral-500/30 overflow-hidden flex flex-col"
            style={{ width: previewWidth }}
          >
            <div className="flex-1 min-h-0">
              <Preview
                clip={previewClip}
                playhead={timeline.playhead}
                playing={timeline.playing}
                textLayers={timeline.textLayers}
                videoRef={videoRef}
                videoSrc={timeline.videoSrc}
              />
            </div>
          </div>

          <ResizeHandle
            direction="vertical"
            onResize={delta => setPreviewWidth(w => Math.max(120, Math.min(400, w + delta)))}
          />

          {/* Right column: Inspector + Timeline (resizable) */}
          <div ref={rightColRef} className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div
              className="min-h-0 overflow-y-auto p-3 shrink-0"
              style={{ flex: `0 0 ${inspectorRatio * 100}%` }}
            >
              {selectedClip ? (
                <Inspector clip={selectedClip} clipStartTime={selectedClipStart} dispatch={dispatch} />
              ) : selectedTextLayer ? (
                <TextLayerInspector textLayer={selectedTextLayer} dispatch={dispatch} />
              ) : selectedTrack ? (
                <TrackInspector track={selectedTrack} dispatch={dispatch} />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                  <p>Select a clip, text layer, or track</p>
                </div>
              )}
            </div>

            <ResizeHandle
              direction="horizontal"
              onResize={delta => {
                const h = rightColRef.current?.clientHeight ?? 400
                setInspectorRatio(r => Math.max(0.15, Math.min(0.75, r + delta / h)))
              }}
            />

            <div className="flex-1 min-h-0 flex flex-col border-t border-neutral-500/30 overflow-hidden">
              <Transport playing={timeline.playing} playhead={timeline.playhead} duration={timeline.duration} dispatch={dispatch} />
              <div className="flex-1 min-h-0 px-3 pb-2 min-w-0 overflow-hidden flex flex-col">
                <TimelineTracks timeline={timeline} dispatch={dispatch} />
              </div>
            </div>
          </div>
        </div>

        <ResizeHandle
          direction="horizontal"
          onResize={delta => {
            const h = contentRef.current?.clientHeight ?? 500
            setEditorRatio(r => Math.max(0.25, Math.min(0.85, r + delta / h)))
          }}
        />

        {/* CoDirector Zone */}
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-2 bg-neutral-800 overflow-hidden">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center text-[7px] font-bold text-neutral-900">Co</div>
            <span className="text-[11px] font-medium text-neutral-300">CoDirector</span>
            {apiKey && <span className="text-[8px] text-emerald-500 bg-emerald-900/30 px-1.5 py-px rounded-full ml-1">Tier 3</span>}
          </div>

          <CommandLog entries={commandLog} onClickEntry={handleLogEntryClick} />
          <ProactiveSuggestion
            timeline={timeline}
            lastCommandTime={commandLog.length > 0 ? commandLog[commandLog.length - 1].timestamp : 0}
            onAccept={handleCommand}
          />
          <InputArea onCommand={handleCommand} />
        </div>
      </div>

      {/* Overlays */}
      <UndoToast toasts={toasts} onUndo={handleUndo} onDismiss={handleDismissToast} />
      {cursorEnabled && (
        <CoDirectorCursor
          pendingOp={pendingCursorOp}
          onAnimationComplete={() => setPendingCursorOp(null)}
        />
      )}
    </div>
  )
}
