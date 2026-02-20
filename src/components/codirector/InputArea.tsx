import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, ArrowRight, MessageSquare } from 'lucide-react'

const EXAMPLE_COMMANDS = [
  'trim 2 seconds off the intro',
  'delete the lowest scoring clip',
  'speed up the hook to 1.5x',
  'add a zoom-in effect to clip 2',
  'cut the first clip at 3 seconds',
  'move the outro before the hook',
  'add caption "Let\'s go!" at 0s',
  'make everything 1.25x speed',
  'delete clips under 60 virality',
  'duplicate the hook',
  'help me get this under 60 seconds',
  'undo that last change',
  'mute the audio track',
  'add a fade transition between clip 1 and 2',
  'select the longest clip',
]

interface Props {
  onCommand: (text: string) => void
}

export default function InputArea({ onCommand }: Props) {
  const [mode, setMode] = useState<'voice' | 'chat'>('chat')
  const [chatText, setChatText] = useState('')
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % EXAMPLE_COMMANDS.length)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceSupported(false)
      return
    }
    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (e: any) => {
      let interimTranscript = ''
      let finalTranscript = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalTranscript += t
        else interimTranscript += t
      }
      setInterim(interimTranscript)
      if (finalTranscript.trim()) {
        onCommand(finalTranscript.trim())
        setInterim('')
      }
    }
    rec.onerror = () => { setListening(false) }
    rec.onend = () => { setListening(false) }
    recognitionRef.current = rec
  }, [onCommand])

  const toggleMic = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      try { rec.start(); setListening(true) } catch { /* already started */ }
    }
  }, [listening])

  const handleChatSend = useCallback(() => {
    const text = chatText.trim()
    if (!text) return
    setCmdHistory(h => [text, ...h].slice(0, 20))
    setHistIdx(-1)
    onCommand(text)
    setChatText('')
  }, [chatText, onCommand])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { handleChatSend(); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHistIdx(i => {
        const next = Math.min(i + 1, cmdHistory.length - 1)
        if (cmdHistory[next]) setChatText(cmdHistory[next])
        return next
      })
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHistIdx(i => {
        const next = Math.max(i - 1, -1)
        setChatText(next < 0 ? '' : cmdHistory[next] ?? '')
        return next
      })
    }
  }, [handleChatSend, cmdHistory])

  return (
    <div className="border-t border-neutral-500/30 pt-2">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <button
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors
            ${mode === 'voice' ? 'bg-white text-neutral-900' : 'text-neutral-400 hover:text-white'}`}
          onClick={() => setMode('voice')}
        >
          <Mic size={10} /> Voice
        </button>
        <button
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors
            ${mode === 'chat' ? 'bg-white text-neutral-900' : 'text-neutral-400 hover:text-white'}`}
          onClick={() => setMode('chat')}
        >
          <MessageSquare size={10} /> Chat
        </button>
      </div>

      {mode === 'voice' ? (
        <div className="flex flex-col items-center gap-2 py-2">
          {!voiceSupported ? (
            <p className="text-[10px] text-neutral-400">Voice not supported in this browser. Use Chrome.</p>
          ) : (
            <>
              <button
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
                  ${listening
                    ? 'bg-white text-neutral-900 shadow-[0_0_20px_rgba(255,255,255,0.4)] animate-pulse'
                    : 'bg-neutral-600 text-neutral-300 hover:bg-neutral-500'}`}
                onClick={toggleMic}
              >
                {listening ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              {/* Waveform visualizer placeholder */}
              <div className="flex items-center gap-px h-6">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${listening ? 'bg-white' : 'bg-neutral-600'}`}
                    style={{
                      height: listening ? `${8 + Math.random() * 16}px` : '3px',
                      animationDelay: `${i * 30}ms`,
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-neutral-400">
                {listening ? (interim || 'Listening...') : 'Tap to direct'}
              </p>
              {interim && (
                <p className="text-[11px] text-neutral-300 italic">"{interim}"</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={chatText}
            onChange={e => setChatText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Try: "${EXAMPLE_COMMANDS[placeholderIdx]}"`}
            className="w-full bg-neutral-600 border border-neutral-500 rounded-full px-4 pr-10 py-2 text-xs text-white
                       placeholder:text-neutral-400 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20"
          />
          <button
            className="absolute right-1.5 w-7 h-7 rounded-full bg-white text-neutral-900 hover:bg-neutral-200
                       flex items-center justify-center transition-all disabled:opacity-20 disabled:scale-90"
            onClick={handleChatSend}
            disabled={!chatText.trim()}
          >
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
