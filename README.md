# CoDirector — Voice-Powered Video Editing

Edit video with your voice. CoDirector is an AI assistant that turns natural language commands into timeline edits.
It is a pluggable layer above editing engines as it acts has a conversational layer that gets commands from the user and turns it into ops for the editing engine.

**Live demo:** [opus-co-director.vercel.app](https://opus-co-director.vercel.app/)

---

## Getting Started

### API Key (Required for complex commands)

For simple commands (trim, delete, speed, etc.), CoDirector works out of the box. For **complex, natural-language commands** (e.g. "add a zoom effect to the third clip"), you need an Anthropic API key:

1. Open **Settings** (gear icon in the header)
2. Enter your **Anthropic API key** in the API key field
3. The key is stored locally in your browser and used for Tier 3 LLM-powered commands

Get an API key at [console.anthropic.com](https://console.anthropic.com/).

---

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Build

```bash
npm run build
```

Output is in `dist/`.

---

## Technical Overview

### Architecture

CoDirector has two layers separated by a strict API boundary:

1. **Mock Editor** — Interactive timeline UI (clips, audio tracks, preview, transport). Simulates Opus Pro's post-clipping editor. Exposes `getState()`, `dispatch(op)`, and `onStateChange(cb)`.
2. **Conversational Layer** — Voice and text input that parses natural language, resolves clip references, and dispatches edit operations. Owns nothing about rendering or playback.

The mock editor could be swapped for a real editor; the conversational layer stays unchanged.

### Cascading Intelligence

Parsing uses a confidence-based cascade — start fast and cheap, escalate only when needed:

| Tier | Latency | Handles |
|------|---------|---------|
| **Tier 1** (regex) | ~5ms | Explicit commands: "delete the intro", "trim 2 seconds", "speed up to 2x", "undo", "play" |
| **Tier 3** (Claude) | ~800ms | Complex commands: "restructure so tension builds", "make it feel like a trailer", multi-step edits |

Tier 1 handles ~60% of commands. Tier 3 requires an API key (see Settings → API key).

### Operations (`dispatch(op)`)

The editor accepts structured operations. Examples:

- **Clip:** `delete`, `delete_batch`, `trim_start`, `trim_end`, `speed`, `move`, `move_relative`, `duplicate`, `cut`
- **Effects:** `effect_add`, `effect_remove` (zoom-in, ken-burns, blur-bg, flash-transition, etc.)
- **Captions:** `caption_add`, `caption_edit`, `caption_remove`
- **Tracks:** `track_volume`, `track_mute`, `track_move`
- **Transitions:** `transition_add`, `transition_remove` (crossfade, wipe, zoom)
- **System:** `select`, `seek`, `play`, `pause`, `undo`, `redo`

### Clip Reference Resolution

Before parsing, natural language targets are resolved against the current timeline:

- **Pronouns:** "it", "this clip" → `ConvoContext.lastReferencedClipId`
- **Labels:** "the demo" → clip with "Demo" in label
- **Ordinals:** "the third clip" → `clips[2]`
- **Score:** "the best clip" → highest viralityScore; "everything below 70" → filter by score
- **Playhead:** "this part" → clip at current playhead

### State Schema

```
Timeline { clips, tracks, playhead, duration, playing, selectedClipId }
Clip    { id, label, duration, speed, trimStart, trimEnd, effects, captions, viralityScore }
Track   { id, type, label, startTime, duration, volume, muted }
```

### Demo Data

Pre-loaded: 7 clips (Hook, Problem, Story, Demo, Reaction, Key insight, CTA), 2 audio tracks (Background Beat, Whoosh SFX), and 10 effects (zoom-in, ken-burns, blur-bg, etc.).

---

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS
- Anthropic Claude (Tier 3 commands)

## Sample Use
Voice - "Cut clip in half"
Editor - Cuts selected clip in half...
<img width="1843" height="903" alt="image" src="https://github.com/user-attachments/assets/205c3ad5-042f-4750-9ecb-7792c67816ab" />

