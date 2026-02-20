# CoDirector — Design Document v0.1

## Overview

CoDirector is a conversational editing layer that sits on top of a video editor. The user speaks ("trim 2 seconds off the intro," "speed up the demo to 2x," "move the CTA before the reaction"), and the system parses intent, resolves clip references against the current timeline state, and dispatches the corresponding edit action to the editor. Parsing uses a cascading confidence model: a regex/pattern matcher handles simple commands instantly (~5ms), a fine-tuned small model handles ambiguous commands (~80ms), and a full LLM handles complex multi-step reasoning (~800ms) — each tier either succeeds or escalates based on its confidence score.

This project has two deliverables:

**1. Mock Editor** — A simulation of Opus Pro's clip editor. Not a real video processor, but a fully interactive UI with a timeline, clip manipulation, audio tracks, effects, and a preview window. It is built from day one around three API contracts (`getState()`, `dispatch(op)`, `onStateChange(cb)`) that make it pluggable. This is the surface that proves to Opus Pro's engineering team: "here's how your editor exposes state, and here's how a conversational layer consumes it."

**2. Conversational Layer** — Voice and text input that reads editor state, parses natural language into structured edit operations, dispatches them to the editor, and confirms results back to the user. This layer owns nothing about rendering, playback, or clip storage — it only talks through the API contracts.

Both are built together, but they are **strictly separated by the API boundary**. The mock editor could be swapped for Opus Pro's real editor and the conversational layer works unchanged.

## Mock Editor — Responsibilities

The mock editor simulates Opus Pro's post-clipping editing experience. It must be interactive enough that the conversational layer demo feels real, and architecturally clean enough that the API contracts are obvious to an engineering lead reviewing the code.

### What it renders
- **Timeline** — horizontally scrollable track with ordered clips. Clips display label, duration, virality score badge, speed indicator, caption indicator. Clips are clickable (select) and visually respond to edits (animate on cut, slide on reorder, shrink on trim).
- **Audio tracks** — 1-3 tracks below the clip timeline (music, SFX, voiceover). Each shows label, waveform placeholder, volume, mute toggle. Start position is absolute (pinned to a time, not to a clip).
- **Preview window** — shows the selected clip's thumbnail placeholder, caption overlay, aspect ratio frame (9:16 vertical), applied effects as visual indicators. Does not play real video — it's a styled representation.
- **Transport controls** — play/pause, seek (click timeline), skip to start. Playhead animates across the timeline during playback.
- **Clip inspector panel** — when a clip is selected, shows its properties: duration, speed, trim values, effects list, captions, virality score. Manual edit buttons (trim, speed, delete, duplicate) for mouse-based editing.
- **Effects library** — a panel or dropdown with available effects ("zoom-in", "ken-burns", "blur-bg", "flash-transition"). Can be applied to a clip manually or by voice.

### What it exposes (API contracts)

```
EditorAPI {
  // Read the full timeline state (schema defined in Timeline State section)
  getState(): Timeline

  // Apply one or more edit operations
  // Returns result with status, what was applied, and new state
  dispatch(ops: Op | Op[]): DispatchResult

  // Subscribe to state changes from ANY source (manual click, voice, undo)
  // Callback receives the new state and what caused the change
  onStateChange(cb: (newState: Timeline, source: "manual"|"voice"|"undo") => void): unsubscribe

  // Read-only helpers for the conversational layer
  getClipAtPlayhead(): Clip | null          // which clip is the playhead sitting on
  getClipByLabel(query: string): Clip[]     // fuzzy match clips by label text
  getSelectedClip(): Clip | null            // currently selected clip
  getTrackByLabel(query: string): Track[]   // fuzzy match audio tracks
}
```

### What it owns internally (not exposed)
- Clip rendering and layout math (px positions, scroll offsets)
- Drag-and-drop interaction handling
- Preview window rendering
- Animation system (FLIP transitions on edit)
- Internal undo/redo stack (but exposes undo/redo as dispatchable ops)

### Demo data
The mock editor ships with pre-loaded content that simulates a real Opus Pro session:

```
Pre-loaded clips (7):
  "Hook — Here's what nobody tells you"        3.8s   score: 87
  "Problem — The funding gap"                   7.2s   score: 72
  "Story — Almost quit three times"            11.5s   score: 91
  "Demo — Product walkthrough"                 14.0s   score: 65
  "Audience reaction — Laughter"                4.2s   score: 78
  "Key insight — PMF moment"                    8.8s   score: 94
  "CTA — Subscribe and link"                    3.5s   score: 60

Pre-loaded tracks (2):
  "Background Beat"       music     0.0s–53.0s   volume: 0.6
  "Whoosh SFX"            sfx      11.0s–11.5s   volume: 0.8

Pre-loaded effects available:
  "zoom-in", "zoom-out", "ken-burns", "blur-bg", "flash-transition",
  "shake", "slow-zoom", "vignette", "color-pop", "glitch"
```

This data is intentionally rich enough for the conversational layer to demonstrate: clip references by name ("the demo", "the hook"), score-based commands ("delete everything below 70"), audio manipulation ("mute the background music"), and effect application ("add a zoom-in to the intro").

## Operations — `dispatch(op)`

The editor accepts a strict set of operations. Every operation is a plain object with a `type` field and operation-specific parameters. The conversational layer produces these; the editor consumes them. No operation can exist outside this schema.

### Clip Operations

```
Cut — split a clip into two at a time point
{
  type: "cut",
  clipId: string,             // which clip to split
  at: number                  // absolute timeline time (seconds) where the cut happens
}
Result: original clip replaced by two new clips (A and B) at the cut point.
Validation: `at` must be within clip bounds, at least 0.3s from either edge.
Voice examples: "cut here", "split the demo at the 15 second mark", "cut this clip in half"


Delete — remove a clip from the timeline
{
  type: "delete",
  clipId: string              // single clip
}
{
  type: "delete_batch",
  clipIds: string[]           // multiple clips
}
Result: clip(s) removed, subsequent clips shift left, audio tracks unchanged.
Validation: clipId(s) must exist. Destructive — triggers undo toast.
Voice examples: "delete the intro", "remove everything below 70", "get rid of clips 3 and 5"


Trim — remove time from start or end of a clip (non-destructive)
{
  type: "trim_start",
  clipId: string,
  amount: number              // seconds to trim off the beginning
}
{
  type: "trim_end",
  clipId: string,
  amount: number              // seconds to trim off the end
}
Result: clip.trimStart or clip.trimEnd increases, effectiveDuration shrinks, subsequent clips shift.
Validation: amount must leave at least 0.5s of effectiveDuration remaining.
Voice examples: "trim 2 seconds off the start", "shorten the end by 3 seconds", "tighten the intro"


Speed — change playback rate
{
  type: "speed",
  clipId: string,
  speed: number               // 0.25 to 4.0
}
Result: clip.speed changes, effectiveDuration recalculates, subsequent clips shift.
Validation: speed must be in [0.25, 4.0] range.
Voice examples: "speed up to 2x", "slow this down", "double speed on the demo", "make it 1.5x"


Move — reorder a clip to a new position
{
  type: "move",
  clipId: string,
  toIndex: number             // new position in the clips array (0-based)
}
{
  type: "move_relative",
  clipId: string,
  direction: "before" | "after",
  targetClipId: string        // move clipId before/after this clip
}
Result: clip is repositioned, all clips recalculate positions.
Validation: clipId must exist, toIndex must be in bounds or targetClipId must exist.
Voice examples: "move the CTA before the reaction", "put the hook at the end",
               "swap the intro and the story"
Note: "swap" produces two move operations.


Duplicate — copy a clip, insert after original
{
  type: "duplicate",
  clipId: string
}
Result: new clip with same properties, unique ID, inserted after the original.
Validation: clipId must exist.
Voice examples: "duplicate this clip", "make a copy of the hook"
```

### Caption Operations

```
Add Caption
{
  type: "caption_add",
  clipId: string,
  text: string,               // caption content
  startOffset: number,        // seconds from clip start (default: 0)
  endOffset: number,          // seconds from clip start (default: clip effectiveDuration)
  style: string,              // "bold" | "glow" | "karaoke" | "outline" (default: "bold")
  position: string            // "bottom" | "center" | "top" (default: "bottom")
}
Voice examples: "add a caption that says 'game changer'", "put text on this clip"


Edit Caption
{
  type: "caption_edit",
  clipId: string,
  captionId: string,
  updates: {                  // partial update — only provided fields change
    text?: string,
    style?: string,
    position?: string,
    startOffset?: number,
    endOffset?: number
  }
}
Voice examples: "change the caption to say 'wow'", "move the caption to the top"


Remove Caption
{
  type: "caption_remove",
  clipId: string,
  captionId: string
}
Voice examples: "remove the caption", "delete the text overlay"
```

### Effect Operations

```
Add Effect
{
  type: "effect_add",
  clipId: string,
  effectId: string            // from the available effects library
}
Voice examples: "add a zoom-in to the hook", "put a blur on the background",
               "add a glitch effect to the demo"


Remove Effect
{
  type: "effect_remove",
  clipId: string,
  effectId: string
}
Voice examples: "remove the zoom", "take off the blur effect"
```

### Track Operations

```
Track Volume
{
  type: "track_volume",
  trackId: string,
  volume: number              // 0.0 to 1.0
}
Voice examples: "turn down the music to 30%", "make the background louder"


Track Mute/Unmute
{
  type: "track_mute",
  trackId: string,
  muted: boolean
}
Voice examples: "mute the background music", "unmute the sound effects"


Track Move (reposition on timeline)
{
  type: "track_move",
  trackId: string,
  startTime: number           // new absolute start time in seconds
}
Voice examples: "move the music to start at the demo section",
               "sync the whoosh with the transition"
Note: for "sync with clip X", the convo layer reads clip X's start time from getState().
```

### Transition Operations

```
Add Transition
{
  type: "transition_add",
  clipId: string,
  edge: "in" | "out",        // transition at start or end of clip
  transitionType: string,     // "crossfade" | "cut" | "wipe" | "zoom"
  duration: number            // transition duration in seconds (default: 0.5)
}
Voice examples: "add a crossfade between the hook and the problem",
               "put a zoom transition on the intro"
Note: "between X and Y" → transition_add on X with edge:"out"


Remove Transition
{
  type: "transition_remove",
  clipId: string,
  edge: "in" | "out"
}
Voice examples: "remove the transition on the hook"
```

### System Operations

```
Undo
{ type: "undo" }
Voice examples: "undo", "undo that", "go back"


Redo
{ type: "redo" }
Voice examples: "redo", "bring that back"


Select
{
  type: "select",
  clipId: string | null       // null to deselect
}
Voice examples: "select the demo", "go to the hook"
Note: also updates playhead to clip's start position.


Seek
{
  type: "seek",
  time: number                // absolute time in seconds
}
Voice examples: "go to 15 seconds", "jump to the beginning"


Play / Pause
{ type: "play" }
{ type: "pause" }
Voice examples: "play", "pause", "stop"
```

### Batch Operations

Any command that produces multiple operations wraps them in a batch:

```
{
  type: "batch",
  ops: Op[],                  // ordered list of operations
  label: string               // human-readable description for undo history
}
```

A batch is **atomic** — either all ops apply or none do. Undo reverts the entire batch in one step. The editor processes ops sequentially within the batch, recalculating state between each.

Voice examples that produce batches:
- "delete everything below 70" → batch of delete ops
- "trim and speed up the demo" → batch of trim + speed ops
- "make this feel like a trailer" → batch of speed + effect + transition ops
- "swap the intro and the outro" → batch of two move ops

### DispatchResult

Every `dispatch()` call returns:

```
DispatchResult {
  requestId: string           // echo back the request ID
  status: "applied"           // all ops succeeded
         | "rejected"         // none applied, see error
         | "partial"          // some ops applied, see appliedOps
  error: string | null        // reason for rejection
  appliedOps: Op[]            // which ops actually executed
  failedOps: Op[]             // which ops failed (for partial)
  rollbackId: string          // token to undo this specific dispatch
  newState: Timeline          // full timeline state after the edit
  stateVersion: number        // incremented on every state change
}
```

## State Change Notifications — `onStateChange(cb)`

The conversational layer needs to know when the editor's state changes — regardless of what caused the change. If the user manually drags a clip while the voice system is listening, the convo layer must update its understanding of the timeline. If an undo is triggered, the convo layer needs to refresh its context. This is the **editor → convo layer** feedback channel.

### Subscription

```
const unsubscribe = editor.onStateChange((event: StateChangeEvent) => {
  // update convo layer's internal state snapshot
  // update conversation context (e.g., selected clip changed)
  // potentially trigger proactive suggestions
});

// Clean up when convo layer unmounts
unsubscribe();
```

### StateChangeEvent

```
StateChangeEvent {
  newState: Timeline              // full timeline state after the change
  previousState: Timeline         // state before the change (for diffing)
  stateVersion: number            // new version counter
  source: "manual"                // user clicked/dragged in the editor UI
         | "voice"                // change came from convo layer dispatch
         | "undo"                 // undo/redo operation
         | "system"              // editor-initiated (e.g., auto-save, playhead tick)
  ops: Op[]                       // which operations caused this change
  timestamp: number               // Date.now() of when the change occurred
}
```

### Why `source` matters

The convo layer reacts differently depending on who caused the change:

```
source: "voice"
  → Convo layer ignores. It already knows — it dispatched this.
    Just update internal state snapshot.

source: "manual"
  → User did something by hand. Convo layer must:
    1. Update its state snapshot
    2. Check if any pending voice command is now stale (stale state guard)
    3. Update ConvoContext — if user selected a new clip, that becomes
       the referent for "it", "this clip"
    4. Optionally acknowledge: (silent — don't narrate manual actions)

source: "undo"
  → State reverted. Convo layer must:
    1. Update state snapshot
    2. If the undo reverted a voice command, update the command log
       (mark it as "undone" in the UI)
    3. Reset ConvoContext.lastOperation (so "undo that" doesn't double-undo)

source: "system"
  → Playhead moved, auto-save fired, etc. Convo layer must:
    1. Update playhead position in state snapshot
    2. Ignore for command log purposes
    3. Update getClipAtPlayhead() resolution
```

### State Diffing

The convo layer doesn't always need the full state — sometimes it just needs to know what changed. The `previousState` field enables efficient diffing:

```
function diffState(prev: Timeline, next: Timeline): StateDiff {
  return {
    addedClips:    next.clips.filter(c => !prev.clips.find(p => p.id === c.id)),
    removedClips:  prev.clips.filter(c => !next.clips.find(n => n.id === c.id)),
    modifiedClips: next.clips.filter(c => {
      const p = prev.clips.find(pc => pc.id === c.id);
      return p && (p.duration !== c.duration || p.speed !== c.speed ||
                   p.trimStart !== c.trimStart || p.trimEnd !== c.trimEnd ||
                   p.label !== c.label);
    }),
    reorderedClips: prev.clips.map(c => c.id).join(",") !== next.clips.map(c => c.id).join(","),
    selectedChanged: prev.selectedClipId !== next.selectedClipId,
    playheadMoved: prev.playhead !== next.playhead,
    tracksChanged: JSON.stringify(prev.tracks) !== JSON.stringify(next.tracks),
  };
}

StateDiff {
  addedClips: Clip[]          // new clips (from cut, duplicate)
  removedClips: Clip[]        // deleted clips
  modifiedClips: Clip[]       // clips with changed properties
  reorderedClips: boolean     // clip order changed
  selectedChanged: boolean    // different clip selected
  playheadMoved: boolean      // playhead position changed
  tracksChanged: boolean      // any audio track modified
}
```

The convo layer uses this diff to:
- Update `ConvoContext.lastReferencedClipId` if the selected clip changed
- Invalidate stale commands if clips were added/removed (indices shifted)
- Log what changed in the command history for transparency

### Proactive Suggestions

When the convo layer observes state changes, it can optionally surface suggestions — this is where CoDirector becomes a **co-director** rather than just a command executor.

```
Trigger: user manually selects a clip with viralityScore < 60
Suggest: "That clip scores 42 — want me to trim it down or cut it?"

Trigger: user deletes a clip, leaving two adjacent clips with no transition
Suggest: "Want me to add a crossfade between those two clips?"

Trigger: user adds a 3rd caption, and existing captions have inconsistent styles
Suggest: "Your captions are using different styles — want me to match them all to 'bold'?"

Trigger: total timeline duration exceeds 60s (typical short-form limit)
Suggest: "You're at 63 seconds. Want me to suggest what to cut to get under 60?"

Trigger: background music track ends before the last clip
Suggest: "The music cuts out 4 seconds before the end — want me to extend it or loop it?"
```

Suggestions are non-blocking. They appear in the convo panel as soft prompts, not modal dialogs. User can ignore them, dismiss them, or act on them with a click or voice ("yes do that", "no thanks").

### Rate Limiting State Change Events

The editor may fire `onStateChange` rapidly during drag operations or playhead scrubbing. The convo layer debounces:

```
DebounceConfig {
  playheadUpdates: 200ms      // only process every 200ms during playback/scrub
  manualEdits: 50ms           // batch rapid manual edits (e.g., dragging a clip)
  voiceEdits: 0ms             // process immediately — convo layer needs instant feedback
  undoRedo: 0ms               // process immediately — must update command log
}
```

This prevents the convo layer from re-serializing timeline state 60 times per second during playback while still being instantly responsive to meaningful changes.

## UI & UX

### Layout

The screen is split into two zones — the **Editor Zone** (top, ~65% of viewport height) and the **CoDirector Zone** (bottom, ~35%). This mirrors how real production works: the editor is the stage, the director sits below and speaks up.

```
┌──────────────────────────────────────────────────────┐
│  Header Bar                                          │
│  [Opus Pro logo]  [project name]  [CoDirector badge] │
│  [Undo] [Redo]                    [Export] [Settings]│
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────┐  ┌────────────────────────────────┐  │
│  │            │  │                                │  │
│  │  Preview   │  │  Clip Inspector                │  │
│  │  (9:16)    │  │  - properties                  │  │
│  │            │  │  - effects                     │  │
│  │            │  │  - captions                    │  │
│  └────────────┘  └────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ [◀][▶ Play][■]           0:15.2 / 0:53.0      │  │
│  │ Timeline ═══════╤════════╤═══════╤════╤═══     │  │
│  │ Audio     ───────────────────────────────      │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  CoDirector Zone                                     │
│  ┌────────────────────────────────────────────────┐  │
│  │ Command Log (scrollable)                       │  │
│  │ ✓ "speed up the demo to 2x"                   │  │
│  │   → Sped up 'Demo — Product walkthrough' to 2x│  │
│  │ ✓ "delete the CTA"                            │  │
│  │   → Deleted 'CTA — Subscribe and link'         │  │
│  └────────────────────────────────────────────────┘  │
│  [suggestion chips ...]                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ (●) Voice ○ Chat     [🎤 Tap to direct...]    │  │
│  │ ════════ waveform visualizer ════════════      │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Editor Zone — UX Details

**Preview Window (left)**
- 9:16 vertical frame showing the selected clip as a styled placeholder (color block + label + caption overlay). Not real video — the mock simulates it.
- Shows virality score badge, speed indicator, applied effects as small icons.
- When no clip is selected: empty state with prompt "Select a clip or say 'select the hook'"
- During playback: a subtle animated progress bar at the bottom of the preview.

**Clip Inspector (right of preview)**
- Appears when a clip is selected. Shows all editable properties.
- Each property row is both a display AND a manual edit control:
  - Duration: read-only (derived from trim + speed)
  - Trim: two number inputs (start, end) with +/- steppers
  - Speed: slider (0.25–4.0) with preset buttons (0.5x, 1x, 1.5x, 2x)
  - Effects: tag chips with ✕ to remove, "+" button to add from library
  - Captions: inline text editor, style dropdown, position toggle
  - Virality Score: read-only badge (visual only, not editable)
- Manual edits here fire `dispatch()` the same way voice commands do — the editor doesn't distinguish between sources.

**Timeline**
- Horizontal scrollable track. Clips are colored blocks with:
  - Label text (truncated with ellipsis if too narrow)
  - Duration in seconds (bottom-right corner)
  - Virality score badge (bottom-left, color-coded: green ≥80, orange ≥60, red <60)
  - Speed indicator (only shown if ≠ 1x)
  - Caption indicator ("CC" badge if clip has captions)
  - Transition indicators (gradient overlaps at clip edges)
- Selected clip has a glowing purple border + subtle shadow.
- Playhead is a red vertical line with a dot handle at the top.
- Time ruler above the timeline with second markers.
- Clips animate on edit: FLIP animation on reorder, shrink/grow on trim/speed, fade on delete, split animation on cut.

**Audio Tracks (below clip timeline)**
- 1-3 horizontal bars showing music/SFX/voiceover tracks.
- Each shows: label, waveform placeholder (decorative), volume level, mute toggle.
- Positioned by absolute startTime — they DON'T move when clips reorder (unless the user explicitly commands it).

**Transport Controls**
- Minimal: skip-to-start, play/pause. No need for frame-step or jog — this is short-form, not color grading.
- Click anywhere on the timeline to seek.
- Keyboard shortcuts: Space = play/pause, Cmd+Z = undo, Cmd+Shift+Z = redo.

### CoDirector Zone — UX Details

**Command Log**
- Scrollable list of all voice/chat commands and their results.
- Each entry shows:
  - Status icon: ✓ (applied), ✕ (failed), ⟳ (processing), ↩ (undone)
  - The original voice/chat text in quotes
  - The AI's explanation of what it did (in a different color, e.g., cyan)
  - Confidence badge (percentage, color-coded: green >80%, orange >60%, red <60%)
- Failed commands show the error reason in red.
- Undone commands are visually dimmed (not removed — user can see history).
- Clicking an entry in the log selects the affected clip on the timeline (quick navigation).

**Suggestion Chips**
- A horizontal scrollable row of contextual suggestions between the log and input.
- Dynamically generated based on current state:
  - If a clip is selected: "Trim 2s off the start", "Speed up to 1.5x", "Add caption"
  - If a low-score clip exists: "Delete lowest scoring clip"
  - If timeline > 60s: "Help me cut to 60s"
  - After a delete: "Add a crossfade between the remaining clips"
- Clicking a chip executes the command instantly (same as typing/speaking it).
- Chips update after every state change.

**Input Area**
- Toggle between Voice mode and Chat mode.
- **Voice mode:**
  - Large mic button (tap to start/stop). Pulsing glow animation when active.
  - Waveform visualizer showing audio activity.
  - Interim transcript displayed in italic while user is still speaking.
  - Status line: "Listening..." / "Processing..." / "Tap to direct"
- **Chat mode:**
  - Standard text input with send button.
  - Enter key sends. Supports command history (up arrow for previous commands).
  - Placeholder text: "Type a command... e.g. 'trim 2 seconds off the intro'"
- Both modes feed into the same parsing pipeline — no difference in capability.

### Interaction Patterns

**Voice-first, keyboard-friendly, mouse-supported**
The primary interaction is voice. But every voice command can also be typed. And every edit can also be done manually in the inspector. All three paths converge at `dispatch(op)`. The user never has to use voice — but the experience is designed so that voice is the fastest path for most operations.

**Feedback loop: speak → see → confirm → adjust**
1. User speaks: "trim the intro by 2 seconds"
2. User SEES: the intro clip shrinks on the timeline (instant, optimistic)
3. User READS: command log shows "✓ Trimmed 2s off the start of 'Hook'"
4. User decides: looks good (move on) or "undo" (instant revert)

The entire loop should take under 2 seconds. No modals, no confirmation dialogs (except for destructive ops on high-score clips). The undo toast is always visible as a safety net.

**Undo toast pattern**
After every edit, a small toast appears at the bottom of the Editor Zone:
```
┌──────────────────────────────────────┐
│ Trimmed 'Hook' by 2s          [Undo]│
└──────────────────────────────────────┘
```
- Visible for 4 seconds (8 seconds for destructive ops like delete).
- Clicking "Undo" or saying "undo" reverts the operation.
- Multiple toasts stack (max 3 visible, older ones fade).
- The toast also responds to voice: "undo" while a toast is visible targets the most recent operation.

**Destructive operation confirmation**
Only triggered when:
- Deleting a clip with viralityScore > 80
- Batch deleting 3+ clips
- Trimming more than 50% of a clip's duration

Confirmation appears inline in the CoDirector zone (not a modal):
```
⚠ That clip has a 91 virality score — sure you want to delete it?
  [Yes, delete it]  [No, keep it]
```
User can respond by clicking a button, saying "yes"/"no", or typing.

**Proactive suggestions**
Appear as subtle, dismissible messages in the command log — not pop-ups, not blocking. Styled differently from commands (lighter background, suggestion icon). Examples:
- "💡 Your outro scores 42. Want me to cut it and end on the PMF moment instead?"
- "💡 The music cuts out 4 seconds before the end — extend it?"

User can act on them ("yes do that"), dismiss them (✕ button), or ignore them (they fade after 30 seconds).

### Visual Design Direction

**Dark theme, consistent with Opus Pro.** Deep navy/charcoal backgrounds, not pure black. Purple as the primary accent (matching Opus branding). Cyan for AI confirmations. Red for playhead and destructive actions. Green for success/high-score indicators.

**Typography.** System font stack. 13-14px for primary content. 10-11px for metadata. Monospace for timestamps and technical readouts. Bold for labels, regular weight for descriptions.

**Animation principles:**
- Clips animate with FLIP transitions (position + scale) — 300ms ease-out
- Deleted clips fade out over 200ms
- Cut clips split with a 250ms animation (original shrinks, new clip slides in)
- Command log entries slide up with a subtle fade-in — 200ms
- Mic button pulses gently when listening — 2s ease-in-out loop
- Suggestion chips enter with a horizontal slide — 150ms staggered

**Responsiveness.** The layout works at 1024px minimum width. Below that, the Inspector panel collapses into a bottom sheet that overlays the timeline. The CoDirector zone is always visible — it never collapses or hides. On narrow screens, Voice and Chat toggle between full-width views.

### Audio Feedback — When CoDirector Speaks Back

**Core principle: the eyes confirm routine actions, the voice only speaks when the eyes can't.**

A real producer in the room doesn't narrate every action. They say "done" with a nod, and you see the result. But if something is ambiguous, they speak up. CoDirector works the same way.

**Feedback Tiers:**

```
Tier A — Silent (visual only)                              ~75% of interactions
  When: high-confidence commands that produce visible results
  Examples: "delete the intro" → clip disappears + undo toast
            "speed up to 2x" → clip shrinks on timeline
            "trim 3 seconds" → clip visually shortens
  Feedback: timeline animation + command log entry + undo toast
  Why silent: the user SAW the edit happen. Audio would be redundant and annoying.
  Sound: a subtle UI sound (soft "tick" or "whoosh") — not speech, just tactile.
         ~100ms, low volume. Confirms "I heard you" without words.

Tier B — Short audio cue + text                            ~10% of interactions
  When: commands where the result isn't immediately visible
  Examples: "select the demo" → clip highlights, but user might be looking at preview
            "move the music to start at the demo" → audio track shifts (subtle)
            "add a caption" → caption appears in preview, but inspector might be closed
  Feedback: a distinct but brief audio cue (different from Tier A) + command log entry
  Why: the visual change is small or easy to miss. A short sound says "hey, look."
  Sound: a gentle two-tone chime — ~200ms. Still not speech.

Tier C — Spoken confirmation                               ~10% of interactions
  When: ambiguous input, destructive operations on important clips, or batch results
  Examples:
    Ambiguity:    "delete the reaction clip" (two clips match)
                  → TTS: "Did you mean 'Audience Reaction' or 'Host Reaction'?"
    Destructive:  "delete the key insight" (score 94)
                  → TTS: "That clip scores 94 — want me to delete it?"
    Batch result: "delete everything below 70"
                  → TTS: "Deleted 3 clips." (user can't count removed clips instantly)
    Failure:      "add a zoom to clip 9" (doesn't exist)
                  → TTS: "I couldn't find that clip."
    Complex:      "restructure for tension"
                  → TTS: "I moved 3 clips and removed 2. Take a look."
  Why: the user needs information they can't get from glancing at the timeline.
  Voice: concise, neutral tone. Never more than one sentence.

Tier D — Proactive suggestions (spoken, interruptible)     ~5% of interactions
  When: CoDirector has a suggestion based on state changes
  Examples:
    "Your timeline is 63 seconds. Want me to help cut to 60?"
    "The music ends before the last clip — should I extend it?"
  Why: the user might not have noticed the issue. Voice draws attention.
  Voice: slightly softer volume than Tier C. Phrased as a question.
  Rules:
    - Never interrupt the user while they're speaking
    - Wait 3 seconds after the last command before suggesting
    - Max 1 suggestion per 30 seconds (don't nag)
    - If user ignores, don't repeat the same suggestion
```

**TTS Implementation:**

```
TTSConfig {
  engine: "Web Speech API"         // SpeechSynthesis, zero latency to start
  fallback: "ElevenLabs stream"    // higher quality, ~200ms initial latency
  voice: neutral, slightly warm    // not robotic, not overly enthusiastic
  rate: 1.15                       // slightly faster than default — feels efficient
  maxUtteranceLength: 15 words     // hard cap — if confirmation is longer, use text only
  interruptible: true              // user speaking cancels any pending TTS immediately
  respectMute: true                // global mute toggle in settings silences all TTS
  volume: 0.7                      // not full volume — it's an assistant, not an announcer
}
```

**Latency Considerations:**

```
Scenario: "delete the intro" (high confidence, Tier 1 regex)
  Parse: 5ms → Execute: 3ms → Animate: 300ms → Sound: "tick" at 50ms
  User hears tick at 50ms, sees clip disappear at 300ms. No TTS. Total: 300ms.

Scenario: "delete the reaction" (ambiguous, two matches, Tier C)
  Parse: 5ms → Ambiguity detected: 2ms → TTS starts: ~50ms
  User hears "Did you mean Audience Reaction or Host Reaction?" at ~50ms
  Timeline: nothing changes yet (waiting for clarification)
  Total to resolution: depends on user response, but TTS fires almost instantly.

Scenario: "restructure for tension" (complex, Tier 3 LLM)
  Parse: 800ms → Execute: 10ms → Animate: 300ms → TTS: "I moved 3 clips..." at ~850ms
  User sees clips rearranging at 810ms, hears summary at 850ms. Feels simultaneous.
```

**The "tick" sound system:**

Rather than TTS for routine confirmations, CoDirector uses a vocabulary of micro-sounds:

```
Sound            When                         Duration   Character
─────────────────────────────────────────────────────────────────
"tick"           command received + executed   80ms       soft click
"whoosh"         clip moved or reordered       150ms      subtle slide
"snip"           clip cut or trimmed           100ms      crisp snap
"poof"           clip deleted                  120ms      soft dissolve
"ding"           suggestion available          200ms      gentle chime
"thunk"          command failed                100ms      low dull tap
"chirp-chirp"    waiting for clarification     250ms      two-tone question
```

These sounds create a **tactile language** that the user learns subconsciously. After a few minutes, they'll know a "snip" means their trim worked without looking at the screen. It's how video games teach players — audio cues, not voice narration.

**User Control:**

```
Settings:
  ☑ UI sounds (ticks, whooshes, snips)          default: on
  ☑ Spoken confirmations (ambiguity, errors)    default: on
  ☑ Proactive suggestions (spoken)              default: on
  ☐ Speak all confirmations                     default: off (power user override)
  Volume: [━━━━━━━●━━━] 70%
```

Most users keep all three defaults. Power users who want full audio narration can enable "Speak all confirmations." Users who find any audio distracting can mute everything and rely purely on visual feedback — the command log and timeline animations are always sufficient on their own.

### CoDirector Cursor — The AI's Hand

When CoDirector executes a voice command, a **second cursor** appears on screen and visually performs the action. It moves to the target clip, changes shape based on the operation, and executes — like watching a collaborator screen-share their edit. The user's own mouse remains fully functional during this.

**Why this matters:**
- It makes the AI's actions legible — the user can SEE what the AI is doing, not just the result
- It builds trust — "I can follow along and catch mistakes before they land"
- It teaches the UI — new users learn where things are by watching the cursor navigate
- It sells the feature in a demo — this is what makes Michael say "whoa"

**Cursor Appearance:**

The CoDirector cursor is visually distinct from the user's system cursor. It's a branded, slightly larger pointer with a subtle purple glow trail, so it never gets confused with the user's own mouse.

```
Base cursor:
  - Shape: angled pointer (like default cursor but custom-drawn)
  - Color: white with purple (#8b5cf6) outline
  - Size: 24x24px (slightly larger than system cursor)
  - Trail: 3-4 fading afterimages on movement, purple glow
  - Label: small "Co" badge floating at bottom-right of cursor (10px, rounded)

The "Co" badge makes it instantly recognizable even in peripheral vision.
When idle/not executing: cursor is hidden. It only appears during command execution.
```

**Cursor States — changes shape based on the current operation:**

```
State           Visual                  When
──────────────────────────────────────────────────────────────
pointer         default angled arrow    navigating to target, selecting
scissors        ✂ scissor icon          cutting a clip (split operation)
trim            ┃◄ edge-drag handle     trimming start or end of a clip
grab            ✊ closed hand           moving/reordering a clip
grabbing        ✊ + motion lines        actively dragging a clip to new position
speed           ⏩ fast-forward arrows    changing playback speed
delete          ✕ crossmark             hovering before delete
text            I-beam with "T"         adding or editing a caption
wand            ✦ sparkle/wand          applying an effect or transition
volume          🔊 speaker icon          adjusting track volume
mute            🔇 muted speaker        muting a track
seek            ▶| playhead marker      moving playhead / seeking
```

**Movement & Animation:**

The cursor doesn't teleport — it travels with intentional, readable motion.

```
CursorAnimation {
  // Movement
  travelSpeed: 800px/s             // fast enough to not waste time, slow enough to follow
  easing: cubic-bezier(0.4, 0, 0.2, 1)  // ease-out — fast start, gentle arrival
  pathType: "direct"               // straight line to target (no curves — feels decisive)

  // Arrival
  hoverPause: 200ms               // pause briefly on target before acting (user can read intent)
  shapeTransition: 150ms          // morph from pointer to operation cursor

  // Action
  actionAnimation: per-operation   // e.g., scissors close on cut, hand drags on move
  actionDuration: 200-400ms        // the actual "doing" animation

  // Exit
  fadeOut: 300ms                   // cursor fades after action completes
  fadeDelay: 500ms                 // stays visible briefly so user sees final position
}
```

**Cursor Choreography Per Operation:**

```
CUT — "cut the demo in half"
  1. Cursor appears at edge of screen (fade in, 150ms)
  2. Moves to "Demo" clip on timeline (pointer state)
  3. Arrives at clip center → pauses 200ms
  4. Morphs to scissors ✂
  5. Scissors close animation (200ms)
  6. Clip splits — FLIP animation plays
  7. Cursor fades out (300ms after 500ms hold)
  Audio: "snip" sound plays at step 5

DELETE — "delete the CTA"
  1. Cursor appears, moves to "CTA" clip
  2. Morphs to crossmark ✕
  3. Brief red flash on the clip (150ms)
  4. Cursor "pushes down" — slight scale-down animation
  5. Clip fades out
  6. Cursor fades
  Audio: "poof" sound at step 4

TRIM — "trim 2 seconds off the start of the intro"
  1. Cursor moves to LEFT edge of "Hook" clip
  2. Morphs to trim handle ┃◄
  3. Drags rightward by the amount being trimmed (animated over 400ms)
  4. Clip shrinks from the left, subsequent clips shift
  5. Cursor releases (morphs back to pointer), fades
  Audio: "snip" at step 3

MOVE — "move the CTA before the reaction"
  1. Cursor moves to "CTA" clip
  2. Morphs to grab ✊
  3. "Picks up" the clip — clip lifts slightly (2px up + shadow)
  4. Morphs to grabbing ✊ + motion lines
  5. Drags clip horizontally to new position (other clips part to make room)
  6. "Drops" clip — settles into place with a micro-bounce
  7. Cursor fades
  Audio: "whoosh" during step 5

SPEED — "speed up the demo to 2x"
  1. Cursor moves to "Demo" clip
  2. Morphs to speed ⏩
  3. Brief pulse animation on the clip (speed lines effect)
  4. Clip shrinks horizontally (duration halved visually)
  5. Speed badge "2x" appears on clip
  6. Cursor fades
  Audio: "tick" at step 3

CAPTION — "add a caption that says 'game changer'"
  1. Cursor moves to the preview window (not the timeline)
  2. Morphs to text I-beam
  3. Moves to bottom of preview (caption zone)
  4. Text types out character-by-character: "game changer" (50ms per char)
  5. Caption styling applies (fade in the style)
  6. Cursor fades
  Audio: soft keyboard "tapping" during step 4

EFFECT — "add a zoom-in to the hook"
  1. Cursor moves to "Hook" clip on timeline
  2. Morphs to wand ✦
  3. Sparkle particle effect radiates from cursor (4-5 particles, 300ms)
  4. Effect badge appears on the clip
  5. Preview window shows a subtle zoom animation (if visible)
  6. Cursor fades
  Audio: "ding" at step 3

TRACK VOLUME — "turn down the music to 30%"
  1. Cursor moves to the music track's volume control
  2. Morphs to volume 🔊
  3. Volume slider animates from current level to 30%
  4. Morphs to 🔉 (lower volume icon)
  5. Cursor fades
  Audio: music volume actually fades during step 3 (if mock supports it)

SELECT — "select the demo"
  1. Cursor moves to "Demo" clip
  2. Single click animation (pointer presses down briefly)
  3. Clip highlights with selection glow
  4. Inspector panel populates
  5. Cursor fades
  Audio: "tick" at step 2

BATCH — "delete everything below 70"
  1. Cursor appears, moves to first low-score clip
  2. Morphs to crossmark ✕ → deletes (clip fades)
  3. Moves to next low-score clip → deletes
  4. Repeats for each clip (accelerating — each move is 20% faster than the last)
  5. After last delete, cursor fades
  Audio: "poof" on each delete, tempo increasing
  TTS: "Deleted 3 clips." (Tier C confirmation — batch result)
```

**User Interruption:**

If the user moves their own mouse or starts speaking while the CoDirector cursor is animating:
- The CoDirector cursor instantly fades out (100ms)
- The pending operation still completes (it's already dispatched)
- But the visual choreography stops — the edit happens instantly without animation
- This prevents the AI cursor from feeling like it's "blocking" the user

**Performance:**

The cursor is a single absolutely-positioned DOM element with CSS transforms for movement and SVG swap for shape changes. No canvas, no WebGL — just CSS transitions and `requestAnimationFrame` for the trail effect. Total overhead: negligible.

```
CursorElement {
  position: fixed
  z-index: 9999                   // always on top
  pointer-events: none            // never interferes with user's mouse
  will-change: transform, opacity // GPU-accelerated
  transition: opacity 150ms       // for fade in/out
}

Trail: 3 additional elements with decreasing opacity (0.4, 0.2, 0.1)
       following the main cursor with 30ms, 60ms, 90ms delay
       Same GPU-accelerated positioning
```

**Settings:**

```
  ☑ Show CoDirector cursor               default: on
  ☑ Cursor trail effect                   default: on
  ☐ Reduced motion (cursor teleports)     default: off (accessibility option)
  Cursor speed: [━━━━━━━●━━━] Normal
```

Users who find the cursor distracting can disable it. Accessibility option for reduced motion makes the cursor appear directly at the target without traveling. Edits still apply the same way — the cursor is purely visual.

## Technical Implementation

### Tech Stack

```
Framework:       React 18 (functional components, hooks only)
State:           useReducer for editor state, useState for UI/convo state
Styling:         Tailwind CSS (utility classes only — no custom CSS build step)
Voice:           Web Speech API (SpeechRecognition) with manual fallback to text input
AI:              Anthropic API (Claude Sonnet) for Tier 3 parsing
Audio feedback:  Web Audio API (programmatic micro-sounds, no audio file dependencies)
TTS:             Web Speech API (SpeechSynthesis) for Tier C/D confirmations
Build:           Single-file React component (deployable as Claude artifact for demo)
```

No external dependencies beyond what's available in the Claude artifact environment: React, Tailwind, lucide-react icons. The entire project ships as one file.

### Division of Work — Claude Code vs Human

**Claude Code / Cursor builds:**

```
MOCK EDITOR
  ├─ EditorState reducer
  │   - Full Timeline state shape (clips, tracks, playhead, selection)
  │   - All 20 operations as reducer cases
  │   - Immutable undo/redo stack
  │   - State version counter
  │   - recalcPositions() helper (recompute clip start times after any edit)
  │
  ├─ Editor API bridge
  │   - getState() → returns current reducer state
  │   - dispatch(op) → validates + dispatches to reducer, returns DispatchResult
  │   - onStateChange(cb) → subscription system with source tagging
  │   - getClipAtPlayhead() → resolve clip under current playhead
  │   - getClipByLabel(query) → fuzzy match against clip labels
  │   - getSelectedClip() → shortcut for current selection
  │
  ├─ Timeline component
  │   - Horizontal clip blocks with labels, scores, speed badges, caption indicators
  │   - Click-to-select clips
  │   - Click-to-seek on empty timeline space
  │   - Playhead rendering + animation during playback
  │   - Time ruler with second markers
  │   - FLIP animations: clips animate position/width on edit (reorder, trim, speed, cut)
  │   - Delete fade-out animation
  │   - Cut split animation (clip divides into two)
  │
  ├─ Audio tracks display
  │   - 1-3 horizontal bars below clip timeline
  │   - Label, waveform placeholder (decorative SVG), volume indicator, mute icon
  │   - Volume and mute respond to dispatch ops
  │
  ├─ Preview window
  │   - 9:16 frame showing selected clip placeholder
  │   - Clip color, label, virality score, speed badge
  │   - Caption overlay rendering at bottom of preview
  │   - Effect indicators (icon badges)
  │   - Empty state when no clip selected
  │
  ├─ Transport controls
  │   - Play/pause button
  │   - Skip-to-start button
  │   - Playhead time display (current / total)
  │   - Playhead animation via requestAnimationFrame during playback
  │
  ├─ Clip inspector panel
  │   - Shows all properties of selected clip
  │   - Manual edit buttons: trim +/- steppers, speed presets, delete, duplicate
  │   - Effects list with remove buttons
  │   - Caption text display
  │   - Manual edits dispatch through the same API as voice commands
  │
  ├─ Demo data
  │   - 7 pre-loaded clips with labels, durations, virality scores
  │   - 2 audio tracks (background music, SFX)
  │   - 10 available effects
  │   - 2 pre-loaded captions on specific clips
  │
CONVERSATIONAL LAYER
  ├─ Voice engine
  │   - Web Speech API SpeechRecognition setup
  │   - Continuous listening mode with interim transcript display
  │   - Utterance boundary detection (1200ms silence threshold)
  │   - Cancel signal detection ("never mind", "actually no", "scratch that")
  │   - Mic toggle (start/stop)
  │   - Fallback: if SpeechRecognition unavailable, voice tab shows message,
  │     chat mode still works
  │
  ├─ Chat input
  │   - Text input with Enter-to-send
  │   - Same parsing pipeline as voice
  │   - Command history (up arrow for previous commands) — store last 20 in state
  │
  ├─ Tier 1 — Pattern matcher
  │   - Regex-based intent extraction
  │   - Verb detection: delete, cut, trim, speed, move, duplicate, undo, redo,
  │     play, pause, select, mute, unmute, add caption, add effect
  │   - Number extraction: "2 seconds" → 2, "2x" → 2, "half" → 0.5, "double" → 2
  │   - System commands (play, pause, undo, redo) always handled here, never escalate
  │   - Returns { ops, confidence, explanation } or escalates to Tier 3
  │
  ├─ Clip reference resolver
  │   - Pronoun resolution from ConvoContext ("it", "this", "that one")
  │   - Label keyword match ("the demo" → clip with "Demo" in label)
  │   - Ordinal ("the third clip" → clips[2])
  │   - Score reference ("the best clip" → highest score, "lowest" → lowest)
  │   - Relative ("the next one" → clip after selected)
  │   - Playhead proximity ("this part" → getClipAtPlayhead())
  │   - Group reference ("everything below 70" → filter by score)
  │   - Track resolution ("the music" → track with type "music" or label match)
  │
  ├─ Tier 3 — LLM parser
  │   - Builds prompt with serialized timeline state (clip IDs, labels, positions,
  │     scores, selected clip, playhead)
  │   - Sends to Claude Sonnet API
  │   - Parses JSON response into ops array
  │   - Returns { ops, confidence, explanation }
  │   - Error handling: malformed JSON, timeout, API failure
  │
  ├─ Command executor
  │   - Receives parsed ops from any tier
  │   - Pre-validates against current state (clip exists? trim amount valid?)
  │   - Calls editor.dispatch(ops)
  │   - Handles DispatchResult: applied → confirm, rejected → report error,
  │     partial → report what worked and what didn't
  │   - Updates ConvoContext after execution
  │
  ├─ Conversation context
  │   - lastReferencedClipId: updated after every command that targets a clip
  │   - lastOperation: for "do that again", "undo that"
  │   - lastMentionedTime: for "right there", "at that point"
  │   - recentClipIds: last 5 referenced clips
  │   - Resets after 60s of inactivity
  │
  ├─ Command log
  │   - Scrollable list of command entries
  │   - Each entry: status icon, original text, AI explanation, confidence badge
  │   - Status: thinking → applied / failed / undone
  │   - Click entry to select the affected clip
  │   - Auto-scroll to latest entry
  │
  ├─ Suggestion chips
  │   - Dynamic chips based on current state
  │   - Recalculate after every state change
  │   - Rules:
  │     · clip selected → offer trim, speed, caption, delete
  │     · low-score clip exists → "Delete lowest scoring clip"
  │     · timeline > 60s → "Help me cut to 60s"
  │     · after delete → "Add crossfade between remaining clips"
  │   - Click chip → execute as command
  │
  ├─ Audio feedback system
  │   - Web Audio API oscillator-based micro-sounds
  │   - "tick" (80ms, 800Hz sine, quick decay)
  │   - "snip" (100ms, 1200Hz, sharp attack)
  │   - "poof" (120ms, 400Hz, soft decay)
  │   - "whoosh" (150ms, frequency sweep 600→200Hz)
  │   - "thunk" (100ms, 200Hz, dull)
  │   - "ding" (200ms, 1000Hz sine, gentle sustain)
  │   - Map operation type → sound
  │   - Global mute toggle
  │
  ├─ TTS feedback
  │   - SpeechSynthesis for Tier C/D confirmations
  │   - Only fires for: ambiguity, destructive confirm, batch results, errors
  │   - Max 15 words per utterance
  │   - Interrupted immediately if user starts speaking
  │   - Rate 1.15, volume 0.7
  │
  ├─ Undo toast
  │   - Appears after every edit
  │   - Shows operation description + [Undo] button
  │   - 4 second timeout (8s for destructive ops)
  │   - Max 3 stacked, older ones fade
  │   - Clicking Undo or saying "undo" triggers editor.dispatch({ type: "undo" })
  │
  └─ Waveform visualizer
      - Canvas-based animated bars
      - Responds to voice activity (random amplitude when mic active)
      - Flat line when inactive
      - Purely decorative — does not analyze actual audio frequency
```

**Human / Prompter handles:**

```
BEFORE CLAUDE CODE STARTS
  ├─ Review this design doc with Claude Code
  │   - Walk through each section, confirm understanding
  │   - Clarify any ambiguities before code generation begins
  │
  ├─ Define file structure decision
  │   - Single-file artifact vs multi-file project
  │   - Recommendation: start single-file for demo, split later
  │
  └─ Prioritize feature order
      - Core editor + 5 basic ops first (cut, delete, trim, speed, undo)
      - Then voice engine + Tier 1 parser
      - Then Tier 3 (Claude API) for complex commands
      - Then audio feedback + TTS
      - Then suggestion chips + proactive suggestions
      - Then polish: animations, inspector panel, audio tracks

DURING CLAUDE CODE EXECUTION
  ├─ Test voice recognition in browser
  │   - Chrome required for Web Speech API
  │   - Grant microphone permissions
  │   - Test in quiet environment first
  │
  ├─ Verify Claude API integration
  │   - Test Tier 3 parsing with various phrasings
  │   - Check for JSON parse failures
  │   - Verify timeout handling
  │
  ├─ UI/UX review passes
  │   - Does the timeline feel responsive?
  │   - Are animations smooth (not janky)?
  │   - Is the CoDirector zone too tall / too short?
  │   - Are suggestion chips useful or noisy?
  │
  ├─ Edge case testing
  │   - Speak during playback
  │   - Click while voice command is processing
  │   - Rapid-fire 3+ commands
  │   - Ambiguous clip references
  │   - Commands that target deleted clips
  │
  └─ Prompt refinement
      - If Tier 1 regex misses common phrasings → add patterns
      - If Tier 3 LLM prompt returns wrong ops → refine system prompt
      - If TTS is too chatty or too quiet → adjust thresholds

AFTER CLAUDE CODE FINISHES
  ├─ Run through unit test checklist (see below)
  ├─ Demo rehearsal — practice the voice command flow for Michael
  ├─ Prepare 3-minute walkthrough script
  │   - "Watch me edit this entire clip sequence with just my voice"
  │   - Show: basic ops, ambiguity handling, undo, suggestions, Tier 1 speed vs Tier 3
  └─ Capture backup: if voice doesn't work in demo environment, chat mode as fallback
```

### Unit Test Checklist

Claude Code should verify each test passes before marking the build as complete. Tests are grouped by module. Each test describes the action and the expected result.

```
═══════════════════════════════════════════════════════════
EDITOR STATE — CORE OPERATIONS
═══════════════════════════════════════════════════════════

TEST-E01: Initial state loads correctly
  Action:  App mounts
  Expect:  7 clips in timeline, 2 audio tracks, playhead at 0, nothing selected

TEST-E02: Cut splits a clip into two
  Action:  dispatch({ type: "cut", clipId: "c3", at: midpoint })
  Expect:  clips.length increases by 1, two new clips with correct durations,
           positions recalculated, undo stack grows by 1

TEST-E03: Cut rejects invalid position
  Action:  dispatch({ type: "cut", clipId: "c1", at: 0.1 }) — too close to edge
  Expect:  status: "rejected", clips unchanged

TEST-E04: Delete removes a clip
  Action:  dispatch({ type: "delete", clipId: "c7" })
  Expect:  clips.length decreases by 1, "c7" gone, subsequent clips shift left,
           positions recalculated, undo stack grows

TEST-E05: Delete batch removes multiple clips
  Action:  dispatch({ type: "delete_batch", clipIds: ["c2", "c4", "c7"] })
  Expect:  3 clips removed, remaining 4 clips have correct positions

TEST-E06: Trim start reduces clip duration
  Action:  dispatch({ type: "trim_start", clipId: "c1", amount: 1.5 })
  Expect:  c1.trimStart === 1.5, c1.effectiveDuration reduced by 1.5s,
           all subsequent clip positions shift left by 1.5s

TEST-E07: Trim rejects over-trim
  Action:  dispatch({ type: "trim_end", clipId: "c1", amount: 100 })
  Expect:  status: "rejected" — would leave less than 0.5s

TEST-E08: Speed changes effective duration
  Action:  dispatch({ type: "speed", clipId: "c4", speed: 2 })
  Expect:  c4.speed === 2, c4.effectiveDuration === original / 2,
           subsequent clips shift left

TEST-E09: Speed rejects out-of-range
  Action:  dispatch({ type: "speed", clipId: "c1", speed: 10 })
  Expect:  status: "rejected" — outside [0.25, 4.0] range

TEST-E10: Move reorders clips
  Action:  dispatch({ type: "move", clipId: "c7", toIndex: 0 })
  Expect:  c7 is now first clip, all positions recalculated

TEST-E11: Move relative works
  Action:  dispatch({ type: "move_relative", clipId: "c7", direction: "before", targetClipId: "c5" })
  Expect:  c7 is directly before c5 in the array

TEST-E12: Duplicate creates a copy
  Action:  dispatch({ type: "duplicate", clipId: "c1" })
  Expect:  clips.length increases by 1, new clip after c1 with same properties
           but different id

TEST-E13: Undo reverts last operation
  Action:  dispatch delete on c7, then dispatch({ type: "undo" })
  Expect:  c7 is back, clips match pre-delete state, redo stack has 1 entry

TEST-E14: Redo re-applies undone operation
  Action:  After TEST-E13, dispatch({ type: "redo" })
  Expect:  c7 is gone again, matches post-delete state

TEST-E15: Batch undo reverts all ops in one step
  Action:  dispatch batch (trim + speed on c4), then undo
  Expect:  both trim and speed reverted in single undo

TEST-E16: Select updates selectedClipId
  Action:  dispatch({ type: "select", clipId: "c3" })
  Expect:  state.selectedClipId === "c3"

TEST-E17: Seek moves playhead
  Action:  dispatch({ type: "seek", time: 15.5 })
  Expect:  state.playhead === 15.5

TEST-E18: Play/pause toggles playing state
  Action:  dispatch({ type: "play" })
  Expect:  state.playing === true
  Action:  dispatch({ type: "pause" })
  Expect:  state.playing === false

═══════════════════════════════════════════════════════════
EDITOR STATE — CAPTIONS, EFFECTS, TRACKS
═══════════════════════════════════════════════════════════

TEST-E19: Add caption to clip
  Action:  dispatch({ type: "caption_add", clipId: "c3", text: "hello", style: "bold", position: "bottom" })
  Expect:  c3.captions.length increases by 1, caption has correct text/style/position

TEST-E20: Remove caption from clip
  Action:  After TEST-E19, dispatch caption_remove with the new caption's id
  Expect:  c3.captions.length decreases by 1

TEST-E21: Add effect to clip
  Action:  dispatch({ type: "effect_add", clipId: "c1", effectId: "zoom-in" })
  Expect:  c1.effects includes "zoom-in"

TEST-E22: Remove effect from clip
  Action:  dispatch({ type: "effect_remove", clipId: "c1", effectId: "zoom-in" })
  Expect:  c1.effects does not include "zoom-in"

TEST-E23: Track volume change
  Action:  dispatch({ type: "track_volume", trackId: "t1", volume: 0.3 })
  Expect:  track t1 volume === 0.3

TEST-E24: Track mute/unmute
  Action:  dispatch({ type: "track_mute", trackId: "t1", muted: true })
  Expect:  track t1 muted === true

TEST-E25: Track move
  Action:  dispatch({ type: "track_move", trackId: "t2", startTime: 15.0 })
  Expect:  track t2 startTime === 15.0

═══════════════════════════════════════════════════════════
EDITOR API — BRIDGE & HELPERS
═══════════════════════════════════════════════════════════

TEST-A01: getState() returns current timeline
  Action:  call getState() after initial mount
  Expect:  returns Timeline object with 7 clips, 2 tracks, playhead 0

TEST-A02: getState() reflects changes after dispatch
  Action:  dispatch delete on c1, then call getState()
  Expect:  returned state has 6 clips, c1 not present

TEST-A03: onStateChange fires on dispatch
  Action:  subscribe via onStateChange, then dispatch speed change
  Expect:  callback fires with source "voice", newState reflects speed change

TEST-A04: onStateChange fires on manual edit (click)
  Action:  subscribe, then click a clip to select it
  Expect:  callback fires with source "manual", selectedClipId updated

TEST-A05: onStateChange provides previousState for diffing
  Action:  subscribe, dispatch delete
  Expect:  event.previousState has 7 clips, event.newState has 6 clips

TEST-A06: getClipAtPlayhead resolves correctly
  Action:  seek to 12.0s (should be inside clip c3)
  Expect:  getClipAtPlayhead() returns c3

TEST-A07: getClipByLabel fuzzy matches
  Action:  getClipByLabel("demo")
  Expect:  returns array containing the "Demo — Product walkthrough" clip

TEST-A08: getClipByLabel handles no match
  Action:  getClipByLabel("nonexistent")
  Expect:  returns empty array

TEST-A09: stateVersion increments on every change
  Action:  dispatch 3 operations
  Expect:  stateVersion increases by 3

═══════════════════════════════════════════════════════════
CONVERSATIONAL LAYER — TIER 1 PATTERN MATCHER
═══════════════════════════════════════════════════════════

TEST-T01: Parses simple delete
  Input:   "delete the intro"
  Expect:  ops: [{ type: "delete", clipId: <clip with "Hook"/"Intro" in label> }]
           confidence >= 0.85

TEST-T02: Parses trim with amount
  Input:   "trim 2 seconds off the start"
  Expect:  ops: [{ type: "trim_start", amount: 2 }], confidence >= 0.85

TEST-T03: Parses speed with value
  Input:   "speed up to 2x"
  Expect:  ops: [{ type: "speed", speed: 2 }], confidence >= 0.85

TEST-T04: Parses "double speed" as 2x
  Input:   "double the speed"
  Expect:  ops: [{ type: "speed", speed: 2 }]

TEST-T05: Parses "half speed" as 0.5x
  Input:   "half speed"
  Expect:  ops: [{ type: "speed", speed: 0.5 }]

TEST-T06: System command — undo
  Input:   "undo"
  Expect:  ops: [{ type: "undo" }], confidence >= 0.95, never escalates

TEST-T07: System command — play
  Input:   "play"
  Expect:  ops: [{ type: "play" }], confidence >= 0.95

TEST-T08: System command — pause
  Input:   "pause" / "stop"
  Expect:  ops: [{ type: "pause" }], confidence >= 0.95

TEST-T09: Escalates ambiguous input
  Input:   "make it more interesting"
  Expect:  confidence < 0.85, escalates to Tier 3

TEST-T10: Escalates complex multi-step
  Input:   "restructure this so tension builds"
  Expect:  confidence < 0.85, escalates to Tier 3

═══════════════════════════════════════════════════════════
CONVERSATIONAL LAYER — CLIP REFERENCE RESOLVER
═══════════════════════════════════════════════════════════

TEST-R01: Resolves label keyword
  Input:   "the demo"
  State:   default 7 clips
  Expect:  resolves to c4 ("Demo — Product walkthrough")

TEST-R02: Resolves "this clip" to selected
  Input:   "this clip"
  State:   selectedClipId = "c3"
  Expect:  resolves to c3

TEST-R03: Resolves "it" from conversation context
  Input:   "speed it up"
  State:   ConvoContext.lastReferencedClipId = "c3"
  Expect:  resolves to c3

TEST-R04: Resolves ordinal
  Input:   "the third clip"
  State:   default 7 clips
  Expect:  resolves to clips[2] (c3)

TEST-R05: Resolves "the best clip" by score
  Input:   "the best clip"
  State:   default clips, c6 has highest score (94)
  Expect:  resolves to c6

TEST-R06: Resolves "everything below 70"
  Input:   "everything below 70"
  State:   default clips
  Expect:  resolves to array of clips with score < 70 (c4: 65, c7: 60)

TEST-R07: Resolves playhead proximity
  Input:   "this part"
  State:   playhead at 25.0s, no clip selected
  Expect:  resolves to whichever clip contains 25.0s

TEST-R08: Resolves "the music" to audio track
  Input:   "the music"
  State:   default tracks
  Expect:  resolves to track with type "music" or "Background Beat" label

TEST-R09: Returns null for unresolvable reference
  Input:   "the spaceship clip"
  State:   default clips (none match)
  Expect:  returns null, triggers ambiguity response

═══════════════════════════════════════════════════════════
CONVERSATIONAL LAYER — TIER 3 LLM PARSER
═══════════════════════════════════════════════════════════

TEST-L01: Parses complex restructure command
  Input:   "restructure so the tension builds toward the PMF moment"
  Expect:  returns multiple move ops, valid clip IDs, confidence > 0.5

TEST-L02: Parses creative command
  Input:   "make this feel like a movie trailer"
  Expect:  returns mix of speed + effect + transition ops

TEST-L03: Handles API timeout gracefully
  Action:  simulate API timeout
  Expect:  returns error, does not crash, command log shows failure

TEST-L04: Handles malformed JSON from API
  Action:  simulate API returning invalid JSON
  Expect:  caught by try/catch, returns error, does not crash

TEST-L05: Prompt includes correct state
  Action:  delete 2 clips, then send Tier 3 command
  Expect:  prompt sent to API reflects 5 clips (not original 7)

═══════════════════════════════════════════════════════════
CONVERSATIONAL LAYER — COMMAND EXECUTION
═══════════════════════════════════════════════════════════

TEST-X01: Pre-validation catches deleted clip
  Action:  delete c7, then execute command targeting c7
  Expect:  rejected before dispatch, error message shown

TEST-X02: Pre-validation catches over-trim
  Action:  execute trim_start with amount > clip duration
  Expect:  rejected, error: "trim exceeds clip duration"

TEST-X03: Cancel signal stops pending command
  Input:   "delete the intro... actually never mind"
  Expect:  no operation dispatched, log shows "Cancelled"

TEST-X04: Conversation context updates after command
  Action:  execute command targeting c3
  Expect:  ConvoContext.lastReferencedClipId === "c3"

TEST-X05: Conversation context resets after inactivity
  Action:  execute command, then wait 60s (simulated)
  Expect:  ConvoContext.lastReferencedClipId === null

═══════════════════════════════════════════════════════════
CONVERSATIONAL LAYER — STALE STATE GUARD
═══════════════════════════════════════════════════════════

TEST-S01: Stale state detected on manual edit during parse
  Action:  start Tier 3 parse (slow), manually delete a clip during parsing,
           Tier 3 returns ops referencing the deleted clip
  Expect:  dispatch rejects with "stale", error shown to user

TEST-S02: Non-stale command proceeds normally
  Action:  start Tier 3 parse, no manual edits during parse, ops target valid clips
  Expect:  dispatch applies normally

═══════════════════════════════════════════════════════════
UI — TIMELINE RENDERING
═══════════════════════════════════════════════════════════

TEST-U01: All 7 clips render on mount
  Expect:  7 visible clip blocks on the timeline

TEST-U02: Clip selection highlights correctly
  Action:  click clip c3
  Expect:  c3 has purple glow border, inspector shows c3 properties

TEST-U03: Playhead moves during playback
  Action:  click play
  Expect:  playhead animates rightward across timeline

TEST-U04: Seek by clicking timeline
  Action:  click at ~50% of timeline width
  Expect:  playhead jumps to approximately the midpoint of total duration

TEST-U05: Clip widths update after speed change
  Action:  dispatch speed 2x on c4
  Expect:  c4's visual width approximately halves, clips to the right shift left

TEST-U06: Clip deletion removes element
  Action:  dispatch delete on c7
  Expect:  c7 element no longer in DOM, remaining clips fill the space

TEST-U07: Inspector appears on selection
  Action:  click clip c1
  Expect:  inspector panel visible with c1's label, duration, score, effects

TEST-U08: Inspector updates on different selection
  Action:  click c1, then click c3
  Expect:  inspector shows c3's properties, not c1's

═══════════════════════════════════════════════════════════
UI — CODIRECTOR ZONE
═══════════════════════════════════════════════════════════

TEST-U09: Command log starts empty
  Expect:  empty state message: "Talk to your clips like a producer"

TEST-U10: Command log shows entries after commands
  Action:  execute 2 commands
  Expect:  2 entries visible with text, status, explanation

TEST-U11: Failed command shows error in log
  Action:  execute command that targets non-existent clip
  Expect:  entry with error status and red error message

TEST-U12: Suggestion chips render based on state
  Action:  select a clip
  Expect:  chips update to include clip-specific suggestions

TEST-U13: Clicking suggestion chip executes command
  Action:  click "Speed up to 1.5x" chip
  Expect:  selected clip speed changes to 1.5, command log shows entry

TEST-U14: Voice mode shows waveform
  Action:  toggle to voice mode
  Expect:  waveform visualizer visible, mic button visible

TEST-U15: Chat mode shows text input
  Action:  toggle to chat mode
  Expect:  text input visible, send button visible

TEST-U16: Chat send executes command
  Action:  type "delete the intro" in chat, press Enter
  Expect:  command executes, log entry appears, clip deleted

═══════════════════════════════════════════════════════════
UI — AUDIO FEEDBACK
═══════════════════════════════════════════════════════════

TEST-U17: Micro-sound plays on successful edit
  Action:  dispatch a trim operation
  Expect:  "snip" sound plays (no crash, no error — manual listen test)

TEST-U18: Different sounds for different operations
  Action:  dispatch delete, then move, then trim
  Expect:  "poof", "whoosh", "snip" respectively

TEST-U19: TTS fires on ambiguity
  Action:  say "delete the reaction" when two clips match
  Expect:  TTS speaks clarification question

TEST-U20: TTS does NOT fire on simple successful command
  Action:  say "delete the intro" (high confidence)
  Expect:  no TTS — only micro-sound + visual feedback

═══════════════════════════════════════════════════════════
INTEGRATION — END TO END
═══════════════════════════════════════════════════════════

TEST-I01: Voice → parse → dispatch → UI update (full loop)
  Action:  say "delete the CTA" with mic active
  Expect:  clip deleted, log entry appears, undo toast shows, timeline updates

TEST-I02: Chat → parse → dispatch → UI update (full loop)
  Action:  type "speed up the demo to 2x" and press Enter
  Expect:  c4 speed changes, visual width halves, log entry appears

TEST-I03: Manual edit → onStateChange → context update
  Action:  click to select c5 in timeline
  Expect:  ConvoContext updates, saying "speed it up" targets c5

TEST-I04: Undo toast → undo → state reverts
  Action:  delete a clip, then click [Undo] on toast
  Expect:  clip reappears, command log marks entry as "undone"

TEST-I05: Voice undo after edit
  Action:  delete a clip via voice, then say "undo"
  Expect:  clip reappears, works end-to-end through voice pipeline

TEST-I06: Rapid commands execute in order
  Action:  quickly say "delete the intro" then "speed up the demo"
  Expect:  both execute in order, final state reflects both edits

TEST-I07: Suggestion chip after state change
  Action:  delete a clip, check suggestion chips
  Expect:  chips update to reflect new state (e.g., no longer suggesting
           deleting the clip that was just removed)
```

## Conversational Layer — Cascading Intelligence

The conversational layer receives raw text (from voice STT or chat input) and must produce structured edit operations. Rather than routing every command through a large language model, parsing uses a **cascading confidence model** — always start cheap and fast, only escalate when confidence is low.

### Tier 1 — Pattern Matcher (~5ms, runs client-side)

A deterministic regex + keyword parser. No model, no network. Handles explicit, well-structured commands where the intent and parameters are directly stated.

```
Handles:
  "delete the intro"              → { type: "delete", clipRef: "intro" }
  "speed up to 2x"               → { type: "speed", target: "selected", speed: 2 }
  "trim 3 seconds off the start" → { type: "trim_start", target: "selected", amount: 3 }
  "undo"                         → { type: "undo" }
  "pause"                        → { type: "pause" }
  "play"                         → { type: "play" }

Pattern structure:
  [action verb] + [optional target] + [optional parameter]

  Action verbs:    delete|remove|cut|trim|speed|slow|move|duplicate|copy|
                   add caption|add effect|undo|redo|play|pause|mute|unmute
  Target phrases:  "the intro"|"this clip"|"the demo"|"clip 3"|"the music"|
                   "everything below 70"|"it"|"that one"
  Parameters:      "2x"|"1.5 speed"|"3 seconds"|"to the beginning"|"after the hook"

Confidence rules:
  - Action verb matched + target resolved + params extracted → confidence 0.95
  - Action verb matched + target resolved + no params needed → confidence 0.90
  - Action verb matched + target ambiguous → confidence 0.40, escalate
  - No verb match → confidence 0.00, escalate
```

Tier 1 also handles **system controls** that bypass the command queue entirely:
- "pause," "stop," "play," "undo," "redo" → execute immediately, <5ms
- These never escalate regardless of confidence

### Tier 2 — Fine-Tuned Small Model (~80ms, runs at edge or local)

A lightweight model (distilled BERT or Phi-class) trained on thousands of (voice command → edit operation) pairs. Handles ambiguity, synonyms, and implied intent that regex can't parse.

```
Handles:
  "make the middle part snappier"     → trim_start + trim_end + speed 1.25x on middle clip
  "this section drags"                → speed 1.5x on selected clip
  "the ending is weak, fix it"        → select CTA clip + suggest: delete or replace
  "tighten up the pacing"             → trim 1s off start/end of all clips > 8s
  "can we lose the reaction?"         → delete clip with "reaction" in label
  "swap the intro and the story"      → move ops to reorder two clips
  "make it feel more urgent"          → speed 1.25x + add "flash-transition" effects

Training data shape:
  {
    input: "make the middle part snappier",
    timeline_context: { clipCount: 7, selectedIndex: null, labels: [...] },
    output: {
      ops: [
        { type: "trim_start", clipId: "c3", amount: 1.5 },
        { type: "trim_end", clipId: "c3", amount: 1.5 },
        { type: "speed", clipId: "c3", speed: 1.25 }
      ],
      confidence: 0.78
    }
  }

Confidence rules:
  - Single clear intent + resolved target → confidence 0.80–0.95
  - Intent inferred but target ambiguous → confidence 0.60–0.79, execute with undo toast
  - Multiple plausible interpretations → confidence 0.40–0.59, escalate
```

### Tier 3 — Full LLM (~800ms, cloud API)

A frontier model (Claude Sonnet) with the full timeline state in context. Handles creative direction, multi-step reasoning, conditional logic, and commands that require understanding narrative structure.

```
Handles:
  "restructure so the tension builds toward the PMF moment"
      → reorder clips: hook → problem → story → demo → insight. Delete reaction + CTA.
  "delete anything that doesn't add to the story"
      → analyze labels + scores, delete low-relevance clips
  "make this feel like a movie trailer"
      → speed adjustments, add transitions between every clip, add "zoom-in" on hook,
        "slow-zoom" on insight, trim everything under 5s
  "the audio feels off, fix the music timing"
      → adjust background track startTime to align with clip boundaries,
        move SFX to transition points
  "prepare a 30-second version for TikTok"
      → select top-scoring clips that fit in 30s, reorder by narrative flow, add captions

Prompt includes:
  - Full Timeline state (serialized to ~1-2KB)
  - Conversation context (last 3 commands + results)
  - Available operations schema
  - Instruction to return structured JSON ops + explanation + confidence
```

### Cascade Flow

```
Voice/Chat input
      │
      ▼
┌─────────────┐   confidence ≥ 0.85    ┌─────────┐
│   Tier 1    │ ──────────────────────► │ Execute │
│ Regex/Rules │                         └─────────┘
└──────┬──────┘
       │ confidence < 0.85
       ▼
┌─────────────┐   confidence ≥ 0.60    ┌─────────┐
│   Tier 2    │ ──────────────────────► │ Execute │
│ Small Model │                         └─────────┘
└──────┬──────┘
       │ confidence < 0.60
       ▼
┌─────────────┐   confidence ≥ 0.40    ┌─────────┐
│   Tier 3    │ ──────────────────────► │ Execute │
│  Full LLM   │                         └─────────┘
└──────┬──────┘
       │ confidence < 0.40
       ▼
┌──────────────────────────────────────┐
│ "I didn't understand that. Could you │
│  rephrase, or try a simpler command?"│
└──────────────────────────────────────┘
```

### Expected Traffic Distribution

```
Tier 1 (regex):        ~60% of commands    avg latency: 5ms
Tier 2 (small model):  ~30% of commands    avg latency: 80ms
Tier 3 (full LLM):     ~10% of commands    avg latency: 800ms

Weighted average latency: ~30ms
```

### Clip Reference Resolution (shared across all tiers)

Before any tier attempts to parse intent, the raw text goes through a **reference resolver** that maps natural language targets to clip/track IDs using the current `getState()`.

```
Resolution priority:
  1. Exact ID match         — "clip c3"            → c3
  2. Pronoun from context   — "it", "this one"     → ConvoContext.lastReferencedClipId
  3. Label keyword match    — "the demo"           → clip with "Demo" in label
  4. Ordinal position       — "the third clip"     → clips[2]
  5. Score reference        — "the best clip"      → highest viralityScore
  6. Relative position      — "the next one"       → clip after selected
  7. Playhead proximity     — "this part"          → getClipAtPlayhead()
  8. Group reference        — "everything below 70" → filter by viralityScore < 70
```

This resolver runs once, producing a `ResolvedCommand` with concrete clip IDs that any tier can consume. This avoids duplicating resolution logic across tiers.

## Timeline State — `getState()`

```
Timeline {
  id: string                   // project identifier
  playhead: number             // current position in seconds
  duration: number             // total timeline duration in seconds
  playing: boolean             // playback state
  selectedClipId: string|null  // currently selected clip

  clips: Clip[]                // ordered array, position derived from index + durations
  tracks: Track[]              // audio/music/sfx layers
}

Clip {
  id: string                   // unique identifier
  label: string                // human-readable name ("Hook — Here's what nobody tells you")
  duration: number             // original duration in seconds
  speed: number                // playback rate (0.25–4.0, default 1.0)
  trimStart: number            // seconds trimmed from beginning
  trimEnd: number              // seconds trimmed from end
  effectiveDuration: number    // (duration - trimStart - trimEnd) / speed

  captions: Caption[]          // text overlays on this clip
  transitions: Transition[]    // in/out transitions
  effects: string[]            // applied effect IDs ("zoom-in", "blur", "ken-burns")
  viralityScore: number|null   // Opus AI score 0–100
}

Caption {
  id: string
  text: string                 // caption content
  startOffset: number          // seconds from clip start
  endOffset: number            // seconds from clip start
  style: string                // style preset ("bold", "glow", "karaoke")
  position: string             // "bottom" | "center" | "top"
}

Transition {
  type: string                 // "crossfade" | "cut" | "wipe" | "zoom"
  duration: number             // transition duration in seconds
  edge: string                 // "in" | "out"
}

Track {
  id: string
  type: string                 // "music" | "sfx" | "voiceover"
  label: string                // "Background Beat", "Whoosh SFX"
  startTime: number            // when it starts on the timeline
  duration: number             // how long it plays
  volume: number               // 0.0–1.0
  muted: boolean
}
```

This is the full context the conversational layer reads on every command. The Intent Parser serializes this into a minimal prompt payload — clip IDs, labels, positions, and the selected clip — so the AI can resolve references like "the intro," "this clip," or "the background music."

## Communication Protocol — Conversational Layer ↔ Editor

### Message Bus

The two layers communicate through an async message bus, not direct function calls. This keeps them decoupled — the editor doesn't know or care that a voice system exists, it just receives operations.

```
ConvoLayer → Editor:   bus.emit("editor:dispatch", { op, requestId, source: "voice"|"chat" })
Editor → ConvoLayer:   bus.emit("convo:ack", { requestId, status, newState })
Editor → ConvoLayer:   bus.emit("convo:stateChanged", { timeline, changeSource: "manual"|"voice" })
```

Every dispatched operation includes a `requestId` (UUID). The editor acknowledges with one of three statuses:

```
DispatchResult {
  requestId: string
  status: "applied" | "rejected" | "partial"
  error: string|null            // why it was rejected ("clip not found", "trim exceeds duration")
  appliedOps: Op[]              // what actually executed (may differ from requested)
  rollbackId: string            // token to undo this specific dispatch
  newState: Timeline            // full state after the edit
}
```

**Why `partial`?** A batch command like "delete clips 3, 5, and 7" might succeed on 3 and 5 but fail on 7 (if the user manually deleted it during parsing). The convo layer needs to know what actually happened to give accurate confirmation.

### Operation Lifecycle

```
1. VOICE INPUT      "trim 2 seconds off the intro and speed it up"
2. PARSE            → [{trim_start, clip:c1, amount:2}, {speed, clip:c1, speed:1.5}]
3. VALIDATE         convoLayer checks: does c1 exist in current getState()? is 2 < c1.effectiveDuration?
4. DISPATCH         bus.emit("editor:dispatch", { ops, requestId })
5. EDITOR APPLIES   editor applies ops to its internal state, updates UI
6. ACK              bus.emit("convo:ack", { requestId, status:"applied", newState })
7. CONFIRM          convoLayer says: "Done — trimmed 2s off the intro and sped it to 1.5x"
```

The convo layer **pre-validates** before dispatching (step 3). This catches obvious errors without bothering the editor. But the editor also validates — it's the source of truth. Double validation, single source of truth.

### Handling Pauses & Timing

**Problem: When does a voice command "end"?**

The user might say:
- "Delete the intro" → clear, single sentence
- "Delete the intro... actually..." → started to say something, paused, reconsidering
- "Delete the intro... and the outro" → mid-thought pause, command continues
- "Delete the intro. Now speed up the demo." → two separate commands

**Solution: Utterance Boundary Detection**

```
UtteranceConfig {
  silenceThreshold: 1200ms      // pause this long = end of utterance
  sentenceBoundary: true        // also split on strong punctuation from STT
  interimCancelWindow: 600ms    // if user starts speaking again within 600ms, cancel previous end-trigger
  maxUtteranceLength: 15s       // force-end after 15s to prevent runaway capture
}
```

The flow:

1. User starts speaking → interim transcripts stream in
2. User pauses → silence timer starts (1200ms)
3. If user resumes within 600ms → cancel timer, append to same utterance
4. If silence exceeds 1200ms → finalize utterance, send to parser
5. If STT detects strong sentence boundary ("Delete the intro. Now...") → split into two commands

**The "actually" problem:** User says "delete the intro... actually, never mind."

The convo layer holds a `pendingUtterance` buffer. If the finalized text contains cancel signals ("actually," "never mind," "wait," "no," "stop"), it discards the pending operation and confirms: "Okay, cancelled."

```
CANCEL_SIGNALS = ["never mind", "actually no", "wait", "cancel", "undo that",
                  "scratch that", "stop", "don't", "no no"]
```

### Edge Cases

**1. User edits manually while a voice command is in-flight**

The user says "move the CTA to the beginning," but while the LLM is parsing (~800ms), they manually drag a clip on the timeline.

```
Solution: Stale State Guard
- Every dispatch includes a `stateVersion` (incrementing counter)
- Editor checks: does dispatch.stateVersion === currentVersion?
- If not → reject with status "stale"
- ConvoLayer re-reads state, re-validates, and either:
  a) re-dispatches if the op still makes sense
  b) tells the user: "The timeline changed — still want me to move the CTA?"
```

**2. Ambiguous clip reference**

User says "delete the reaction clip" but there are two clips with "reaction" in the label.

```
Solution: Ambiguity Resolution Protocol
- Intent parser returns candidates: [{id:"c5", confidence:0.7}, {id:"c8", confidence:0.6}]
- If top candidate confidence > 0.85 → execute
- If top two are within 0.15 of each other → ask:
  "Did you mean 'Audience Reaction' (clip 5) or 'Host Reaction' (clip 8)?"
- User responds → execute on confirmed clip
- Context is preserved so the follow-up doesn't re-parse from scratch
```

**3. Destructive operation on wrong clip**

User says "delete this clip" but nothing is selected, or the wrong clip is selected.

```
Solution: Destructive Op Safeguard
- DELETE, TRIM (>50% of duration), and SPEED (>3x) are flagged as destructive
- If the op targets a clip with viralityScore > 80 → confirm first:
  "That clip has a 91 virality score — sure you want to delete it?"
- All destructive ops get a 3-second undo toast: "Deleted 'Hook'. [Undo]"
- Undo window is extended to 10s for batch deletes
```

**4. Rapid-fire commands**

User says three commands quickly: "Delete the intro. Speed up the demo. Add a caption."

```
Solution: Command Queue
- Commands enter a FIFO queue
- Each command waits for the previous ack before dispatching
- Why: each command needs the *result* of the previous one (e.g., clip indices shift after delete)
- Queue is visible in UI: "Processing 1 of 3..."
- If any command fails, queue pauses and asks: "The speed change failed — continue with the rest?"
```

**5. User speaks during playback**

Timeline is playing, user says "pause... now cut here."

```
Solution: Playback-Aware Commands
- "pause," "stop," "hold" → immediately pause playback (Tier 1 regex, <5ms)
- Playhead position at pause time becomes context for "here," "this spot," "right there"
- "play," "resume" → resume from current playhead
- These bypass the command queue — they're instant system-level controls
```

**6. Network failure mid-command (for cloud LLM tier)**

```
Solution: Graceful Degradation
- Tier 1 (regex) works fully offline — handles ~60% of commands
- Tier 2 (local model) works offline if loaded — handles ~30% more
- Only Tier 3 needs network
- If network drops during Tier 3: "I can't process complex commands right now. Try simpler instructions or use the editor directly."
- Pending commands are queued and retried on reconnect (with stale-state check)
```

**7. Pronoun chains across commands**

User says: "Select the demo." Then: "Speed it up." Then: "Now trim it."

```
Solution: Conversation Memory (short-term)
- ConvoLayer maintains a `context` object:

ConvoContext {
  lastReferencedClipId: string|null    // "it," "this," "that one"
  lastOperation: Op|null               // "do that again," "undo that"
  lastMentionedTime: number|null       // "right there," "at that point"
  recentClipIds: string[]              // last 5 referenced clips for "the other one," "go back to the first one"
}

- Pronouns resolve against this context
- Context resets after 60s of inactivity or when user says "start fresh"
```
