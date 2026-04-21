# Agent Park

Open-source desktop editor for generating animated, lip-synced cartoon dialogue scenes — South Park-style cutout characters delivering a script you write (or an LLM writes for you), exported as MP4.

> Status: v0.1 — end-to-end pipeline working. Beautiful renders are still going to depend on the quality of the assets you bring or generate.

## How it works

```
dialogue → TTS (with timestamps) → mouth-cue timeline → composition HTML → render MP4
```

- **TTS** via [`@speech-sdk/core`](https://github.com/Jellypod-Inc/speech-sdk) — provider-agnostic (ElevenLabs, OpenAI, Gemini). Word-level timestamps come from the SDK natively when supported (ElevenLabs in 0.7+) or from OpenAI Whisper as a fallback.
- **Lip sync** via the Preston Blair 9-mouth-shape system, vowel-per-word heuristic — deterministic, no inference, regens instantly when a line changes.
- **Characters & scenes** are SVG. Bring your own, upload existing, or generate via [Recraft V4](https://fal.ai/models/fal-ai/recraft/v4/text-to-vector) on fal.ai. Mouths on uploads are auto-rigged when the heuristic detects them.
- **Composition + render** via [HyperFrames](https://github.com/heygen-com/hyperframes): vanilla HTML + GSAP timeline, paused, advanced by the player. Live preview runs the same composition file inside an iframe.

Where LLM intelligence sits in the pipeline — and where it doesn't:

- **LLM** — dialogue authoring, per-line rewrites, Recraft prompt expansion (planned).
- **Not LLM** — timestamps→cues mapping (regex on text), SVG→rigged-SVG (geometry heuristic), placement, audio, render. All deterministic.

## What's in the box

| Pane | Capability |
| --- | --- |
| Library | 2 default characters (Bill, Ted), 4 default scenes (park, backyard, street, living room). Upload SVGs or generate new ones via Recraft. |
| Stage (Editor tab) | Drop scenes & characters. Drag to reposition (normalized 0-1 coords). Corner-handle to resize. Auto z-order by y. |
| Stage (Preview tab) | Play / Pause / Restart the composition. Render MP4 to a path you choose. |
| Inspector | Show summary; per-character properties when one is selected. |
| Dialogue | Per-line speaker, voice (curated catalog across 3 providers), text. ▶ generates audio + transcript per line. ✨ rewrites a line via Sonnet 4.6. ✨ Write generates N lines via Opus 4.7 from a premise. |
| Settings | Encrypted per-key store via Electron `safeStorage`. |

## Prerequisites

- **Node.js ≥ 20** on your `PATH` (HyperFrames render is spawned via your system Node, not Electron's bundled runtime).
- **ffmpeg** on `PATH` (HyperFrames muxes the final MP4 with it).
- **Chrome** installed (HyperFrames uses it for offline rendering).

## BYO API keys

All keys are stored encrypted in the OS keychain via Electron's `safeStorage`. None ship with the app.

| Key | Used for |
| --- | --- |
| `ELEVEN_API_KEY` | ElevenLabs TTS — best voice quality, fastest path to native timestamps. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini Flash TTS. |
| `OPENAI_API_KEY` | OpenAI TTS, **and** Whisper word-level timestamps for any provider that doesn't return them natively. |
| `FAL_KEY` | Recraft character + scene generation. |
| `ANTHROPIC_API_KEY` | LLM dialogue authoring + per-line rewrites. |

The app runs in read-only "demo" mode against bundled defaults if no keys are set.

## Develop

```bash
npm install
npm start    # launches the Electron app via electron-forge + vite
```

`npm start` boots a Vite dev server for the renderer and an Electron process for main + preload, with HMR on the renderer.

## Package

```bash
npm run make    # cross-platform makers configured in forge.config.ts
```

Forge is configured to:

- Bundle `resources/defaults/` as `extraResource` (so the default characters & scenes are available in the packaged app).
- Unpack `node_modules/hyperframes/**` from the asar so the render child process can resolve the CLI entry.

## Status of the speech-sdk dependency

This repo is on `@speech-sdk/core@0.6.2` (npm latest at time of writing). Native word-level alignment is in 0.7.0 (GitHub `main`). The TTS pipeline already requests timestamps via the 0.7.0 API shape; when 0.7.0 ships to npm, run `npm install @speech-sdk/core@latest` and the alignment path will switch automatically. Until then, every line goes through OpenAI Whisper for word timing — works for every provider, requires `OPENAI_API_KEY`.

## License

MIT
