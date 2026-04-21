# Agent Park

Open-source desktop editor for generating animated, lip-synced cartoon dialogue scenes — South Park-style cutout characters delivering a script you write (or an LLM writes for you), exported as MP4.

> Status: early scaffolding. The pipeline is validated end-to-end in a separate prototype; this app wraps it in an editor.

## Pipeline

```
dialogue.json → TTS (with timestamps) → mouth-cue timeline → composition HTML → render MP4
```

- **TTS** via [`@speech-sdk/core`](https://github.com/Jellypod-Inc/speech-sdk) — provider-agnostic (ElevenLabs, OpenAI, Gemini, Cartesia, Hume), word-level timestamps included.
- **Lip sync** via the Preston Blair 9-mouth-shape system. Vowel-per-word heuristic by default; optional Rhubarb upgrade for higher fidelity.
- **Characters & scenes** are SVG. Bring your own, upload existing, or generate via [Recraft V4](https://fal.ai/models/fal-ai/recraft/v4/text-to-vector) on fal.ai.
- **Composition + render** via [HyperFrames](https://github.com/Jellypod-Inc/hyperframes): vanilla HTML + GSAP timeline, paused, advanced by the player.

## Prerequisites

- **Node.js ≥ 20**
- **ffmpeg** on `PATH` (used by HyperFrames for the final MP4 mux)
- **Chrome** (used by HyperFrames for offline rendering — Electron's bundled Chromium may suffice; TBD)

## BYO API keys

All keys are stored encrypted in the OS keychain via Electron's `safeStorage`. None ship with the app.

| Key | Used for |
| --- | --- |
| `ELEVEN_API_KEY` | ElevenLabs TTS (best voices, native timestamps) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini Flash TTS |
| `OPENAI_API_KEY` | OpenAI TTS, **and** Whisper fallback for timestamps when using non-native providers (Gemini, Cartesia, etc.) |
| `FAL_KEY` | Recraft character/scene generation |
| `ANTHROPIC_API_KEY` | LLM-assisted dialogue authoring (optional) |

The app runs in read-only "demo" mode against bundled defaults if no keys are set.

## Develop

```bash
npm install
npm start    # launches the Electron app via electron-forge + vite
```

## Package

```bash
npm run make    # cross-platform makers configured in forge.config.ts
```

## License

MIT
