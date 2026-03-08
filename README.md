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

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS
- Anthropic Claude (Tier 3 commands)

## Sample Use
Voice - "Cut clip in half"
Editor - Cuts selected clip in half...
<img width="1843" height="903" alt="image" src="https://github.com/user-attachments/assets/205c3ad5-042f-4750-9ecb-7792c67816ab" />

