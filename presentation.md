# CoDirector / VoiceEditor — Technical Presentation

A voice-driven video editor mock for Opus Pro. Speak or type commands; the system parses intent, resolves references, and dispatches edit operations to the timeline.

---

## 1. Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | React 19 |
| **Language** | TypeScript 5.9 |
| **Build** | Vite 7 |
| **Styling** | Tailwind CSS 4 |
| **Icons** | Lucide React |
| **LLM (optional)** | Anthropic Claude API (`claude-sonnet-4-6`) |

**No Redux/Zustand** — state is managed with `useReducer` in `App.tsx`.

---

## 2. Project Structure

```
VoiceEditor/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Root layout, reducer, command flow
│   ├── index.css             # Tailwind + custom styles
│   ├── store/
│   │   ├── types.ts          # Timeline, Clip, Track, Op, ConvoContext
│   │   ├── editorReducer.ts  # Op application, undo/redo
│   │   └── demoData.ts       # Initial timeline, clips, tracks
│   ├── convo/
│   │   ├── tier1Parser.ts    # Rule-based parsing (~5ms)
│   │   ├── tier3Parser.ts    # LLM parsing (Anthropic API)
│   │   ├── commandExecutor.ts # Tier orchestration, dispatch
│   │   └── clipResolver.ts   # Resolve clips, tracks, text layers
│   ├── audio/
│   │   ├── tts.ts            # Web Speech Synthesis
│   │   └── microSounds.ts    # Web Audio API SFX
│   ├── hooks/
│   │   └── useMediaPlayback.ts
│   └── components/
│       ├── editor/           # Preview, Timeline, Transport, Inspector, etc.
│       └── codirector/      # InputArea, CommandLog, CoDirectorCursor, etc.
```

---

## 3. API Contracts (Design)

The editor is built around three contracts so the conversational layer is pluggable:

```
EditorAPI {
  getState(): Timeline
  dispatch(op: Op): DispatchResult
  onStateChange(cb): unsubscribe
}
```

The mock editor could be swapped for Opus Pro's real editor without changing the conversational layer.

---

## 4. State Model

### EditorState

```ts
interface EditorState {
  timeline: Timeline
  undoStack: Timeline[]
  redoStack: Timeline[]
}
```

- Undo/redo: full timeline snapshots (max 50)
- Transient ops (play, pause, seek, select) do not push to undo stack

### Timeline

```ts
interface Timeline {
  id, playhead, duration, playing
  selectedClipId, selectedTextLayerId, selectedTrackId
  clips: Clip[]
  tracks: Track[]
  textLayers: TextLayer[]
  stateVersion: number
  videoSrc?: string
}
```

### Clip

```ts
interface Clip {
  id, label, duration, speed, trimStart, trimEnd, effectiveDuration
  captions: Caption[]
  transitions: Transition[]
  effects: string[]
  viralityScore: number | null
  color: string
  sourceStart?: number   // in source video
  sourceEnd?: number
}
```

- `effectiveDuration = (duration - trimStart - trimEnd) / speed`

### Track

```ts
interface Track {
  id, type: 'music' | 'sfx' | 'voiceover'
  label, startTime, duration, volume, muted
  src?: string           // music/voiceover
  segments?: SfxSegment[] // sfx (whoosh, ding, tick, chirp, poof, snip, thunk)
}
```

### TextLayer

```ts
interface TextLayer {
  id, text, startTime, endTime
  style: 'bold' | 'glow' | 'outline'
  position: 'bottom' | 'center' | 'top'
}
```

---

## 5. Operations (Op Union)

Discriminated union of ~30 operations:

| Category | Operations |
|----------|------------|
| **Clip** | `cut`, `delete`, `delete_batch`, `trim_start`, `trim_end`, `speed`, `move`, `move_relative`, `duplicate` |
| **Caption** | `caption_add`, `caption_edit`, `caption_remove` |
| **Effect** | `effect_add`, `effect_remove` |
| **Transition** | `transition_add`, `transition_remove` |
| **Text layer** | `text_layer_add`, `text_layer_edit`, `text_layer_remove`, `text_layer_move` |
| **Track** | `track_volume`, `track_mute`, `track_move` |
| **Selection** | `select`, `select_text_layer`, `select_track` |
| **Playback** | `seek`, `play`, `pause` |
| **System** | `undo`, `redo`, `batch` |

---

## 6. Command Pipeline

```
User Input (voice/chat)
        │
        ▼
┌───────────────────┐
│   Tier 1 (sync)   │  Regex/keyword parsing, ~5ms
│   tier1Parse()    │
└────────┬──────────┘
         │ success → dispatch
         │ fail/escalate
         ▼
┌───────────────────┐
│   Tier 3 (async)   │  Anthropic API, ~800ms
│   tier3Parse()    │  (only if API key set)
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   trackedDispatch  │  → editorReducer → Timeline
└───────────────────┘
```

- **Tier 1** handles: undo/redo, play/pause, delete, trim, speed, move, duplicate, cut, select, mute, volume, effects, captions, text layers, transitions, seek
- **Tier 3** handles complex, multi-step, or ambiguous commands
- **Tier 2** (fine-tuned small model) is planned but not implemented

---

## 7. Reference Resolution

`clipResolver.ts` maps natural language to entities:

| Input | Resolution |
|-------|------------|
| "it", "this", "that" | `lastReferencedClipId` or clip at playhead |
| "the intro", "the demo" | Label keyword match |
| "first clip", "third clip" | Ordinal index |
| "the best clip" | Highest virality score |
| "everything below 70" | Clips with score < 70 |
| "the next one" | Clip after selected |

Same pattern for `resolveTrackReference` and `resolveTextLayerReference`.

---

## 8. Key Components

| Component | Responsibility |
|-----------|-----------------|
| **App** | Root layout, reducer, command handling, resizable panels |
| **Preview** | Video playback, text overlays, virality/effects badges |
| **TimelineTracks** | Clips, text layers, audio tracks, playhead, time ruler |
| **Transport** | Play/pause, seek to start, time display |
| **Inspector** | Clip trim, speed, effects, captions, duplicate/cut/delete |
| **TrackInspector** | Track volume, mute |
| **TextLayerInspector** | Text content, position, remove |
| **InputArea** | Voice (Web Speech API) vs chat input, command history |
| **CommandLog** | Command history with status (applied/failed/thinking) |
| **CoDirectorCursor** | Animated cursor to target element after command |
| **ProactiveSuggestion** | Contextual suggestions (e.g. cut to 60s) |
| **SuggestionChips** | Quick command chips |
| **UndoToast** | Toast with undo for recent edits |

---

## 9. Media & Audio

### Video

- Single `<video>` in `Preview`; `videoRef` from `useMediaPlayback`
- `playheadToSourceTime(clips, playhead)` maps timeline time to source time (trim, speed, `sourceStart`/`sourceEnd`)
- Playhead sync: `currentTime` updated when drift > 0.3s

### Audio Tracks

- **Music / voiceover:** `<audio>` elements, synced to playhead
- **SFX:** `segments` with `sfxType`; Web Audio API oscillators in `microSounds.ts` trigger when playhead enters segment

### TTS

- `speak(text)` via `SpeechSynthesisUtterance` for batch commands (3+ ops)

### Micro-sounds

- Per-op feedback: snip (cut/trim), poof (delete), whoosh (move), tick (speed/duplicate), ding (effect/transition)

---

## 10. Voice Input

- **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`)
- `continuous: true`, `interimResults: true`
- `onend` restarts recognition when user still intends to listen (avoids mic auto-off)
- Cancel phrases: "never mind", "actually no", "wait", etc.

---

## 11. Anthropic API (Tier 3)

- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Model:** `claude-sonnet-4-6`
- **Headers:** `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access`
- **Body:** Serialized timeline + user command; system prompt lists available ops and JSON schema
- **Response:** JSON with `ops`, `confidence`, `explanation`

---

## 12. Data Flow

```
User Input → handleCommand(text)
  → tier1Parse / tier3Parse
  → trackedDispatch(op)
  → editorReducer
  → Timeline state
  → useMediaPlayback (video/audio sync)
  → Preview, TimelineTracks, Inspector
```

---

## 13. Demo Data

- **Video:** Big Buck Bunny (Google sample)
- **Music:** Mixkit track
- **7 clips:** Hook → Problem → Story → Demo → Audience → Insight → CTA
- **7 text layers:** Product market fit, Subscribe for more, etc.
- **3 tracks:** Music, SFX, voiceover
- **SFX segments:** whoosh, ding, tick, chirp, poof, snip, thunk at fixed times

---

## 14. Summary Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ App (useReducer, handleCommand, processResult)                    │
├─────────────────────────────────────────────────────────────────┤
│ Editor Zone              │ CoDirector Zone                       │
│ Preview + Inspector      │ CommandLog + ProactiveSuggestion       │
│ + TimelineTracks         │ + InputArea (voice/chat)               │
│ + Transport + AudioTracks│ + SuggestionChips                      │
├─────────────────────────────────────────────────────────────────┤
│ handleCommand(text) → Tier1 → [fail] → Tier3 (API) → dispatch  │
│ useMediaPlayback → video/audio/SFX sync                          │
└─────────────────────────────────────────────────────────────────┘
```
