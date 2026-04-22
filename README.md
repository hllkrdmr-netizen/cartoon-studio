# Agent Park

### Create your own 2D animated cartoon show.

An open-source desktop studio for making 2D animated cartoon shows. Write a script, pick voices, place characters, render to MP4.

![Agent Park preview](docs/hero.png)

> **Status — v0.1.** End-to-end pipeline working. Built as a desktop app (Electron) with editorial UI (Newsreader / Switzer / Departure Mono). Bring your own API keys; no telemetry, no cloud.

## How it works

```
script  →  TTS (with word timestamps)  →  vowel-shape mouth cues
                                                   ↓
                              SVG character w/ 9-shape mouth rig
                                                   ↓
                  composition HTML  →  HyperFrames render  →  .mp4
```

Three screens, three jobs:

- **Stage** — left sidebar holds the character + scene library (always visible). Main canvas is the 1920×1080 stage. Drag to position, any corner to resize, Delete to remove.
- **Dialogue** — write the script. Per-line speaker, voice (87 voices across 8 providers), and text. Press ▶ to generate a fresh take and play it inline. Press ✦ Write with AI to generate the whole script from a premise.
- **Play** — final-cut preview inside a film cabinet. Scrub, play, restart, render to MP4.

Where the model lives — and where it doesn't:

- **LLM** — script authoring (OpenAI), vision-based mouth detection on uploaded SVGs (OpenAI vision).
- **Not LLM** — TTS, word-level alignment, mouth-cue generation (deterministic vowel heuristic), placement, composition, render. The output is reproducible from the same script + voices + characters.

## Built on

Agent Park stands on four open-source pieces:

### Speech SDK · [github.com/Jellypod-Inc/speech-sdk](https://github.com/Jellypod-Inc/speech-sdk)

Provider-agnostic TypeScript TTS. One `generateSpeech({ model, voice, text })` call works across **13 providers** (ElevenLabs, OpenAI, Google Gemini, Cartesia, Deepgram, Hume, Inworld, Fish Audio, Murf, Resemble, fal, Mistral, xAI). Returns audio + word-level timestamps where the provider supports them natively, transcribes via Whisper as a fallback otherwise. Built and maintained by [Jellypod](https://jellypod.ai). The whole reason Agent Park can switch voice providers with a dropdown.

### HyperFrames · [github.com/heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)

Renders HTML compositions to MP4 via headless Chrome + GSAP timelines + ffmpeg. Agent Park writes a paused GSAP timeline (mouth `.set()` calls per cue), HyperFrames seeks it frame by frame, screenshots, and muxes audio.

### Recraft V4 · [fal.ai/models/fal-ai/recraft/v4/text-to-vector](https://fal.ai/models/fal-ai/recraft/v4/text-to-vector)

Generates SVG characters and scenes from a text prompt. We hint a flat construction-paper style and use a magenta background plate so we can reliably strip it. Mouths on generated characters get auto-rigged via geometric heuristic; uploads that fail the heuristic fall back to vision-LLM detection.

### Preston Blair lip-sync system · inspired by [Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync)

The 9 mouth shapes (X closed · A–H open variants) are the same catalog Rhubarb popularized. Agent Park doesn't bundle Rhubarb — instead it derives cues from word timestamps via a deterministic vowel-per-word heuristic, which is faster, regenerates instantly when text changes, and works without phoneme-level analysis. Rhubarb itself is excellent if you want true phoneme-driven sync; check it out.

## Install — manual (developer build)

Pre-built binaries will be linked here once they're ready. For now, run from source:

### Prerequisites

- **Node.js ≥ 20** for `npm install` (the packaged app reuses Electron's bundled Node at runtime via `ELECTRON_RUN_AS_NODE`).

That's it. `ffmpeg` and Chrome are bundled — no `brew install` / `winget install` step.

### Run

```bash
git clone https://github.com/btpod/agent-park.git
cd agent-park
npm install      # also downloads chrome-headless-shell (~190 MB) into resources/chrome
npm start
```

`npm start` boots a Vite dev server for the renderer and an Electron process for main + preload, with HMR on the renderer. The `postinstall` script downloads chrome-headless-shell once for your host platform; rerun `npm run setup:chrome` if it gets stale or you switch architectures.

### Build a binary for your machine

```bash
npm run make
```

Produces a Squirrel installer on Windows, a `.zip` containing the `.app` on macOS, and `.deb` / `.rpm` on Linux. Output lands in `out/`.

> **Note on signing.** Builds are unsigned by default. macOS users will see a Gatekeeper warning the first time they open the app — right-click → Open → confirm to bypass. Windows users will see SmartScreen — click "More info" → "Run anyway". Both go away if you sign with an Apple Developer ID / Authenticode certificate; see `forge.config.ts` for the hooks.

## Bring your own API keys

Agent Park stores nothing of yours, ships nothing of mine. Every API key lives encrypted in your OS keyring (macOS Keychain · Windows DPAPI · Linux GNOME Libsecret / KWallet) via Electron's `safeStorage`. The settings file (`settings.json` in the app's userData directory) holds only ciphertext, with file mode `0600` on Unix. The renderer process never sees plaintext keys — only a boolean "is this set" map. You can audit all of this in the **Settings → SC.SEC · Key Vault** panel.

| Key | Used for |
| --- | --- |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS — best voice quality, native word-level timestamps. |
| `OPENAI_API_KEY` | OpenAI TTS · Whisper word-level alignment for any provider without native timestamps · LLM script authoring · vision-based mouth detection on uploaded SVGs. |
| `GOOGLE_API_KEY` | Google Gemini 2.5 Flash TTS — 15 distinctive voices. |
| `CARTESIA_API_KEY` | Cartesia Sonic-3 TTS — ultra-low latency, expressive character voices. |
| `DEEPGRAM_API_KEY` | Deepgram Aura-2 TTS — natural conversational voices. |
| `HUME_API_KEY` | Hume Octave-2 TTS — emotionally intelligent, prompt-steerable. |
| `FISH_AUDIO_API_KEY` | Fish Audio S2-Pro TTS — paste reference IDs from fish.audio. |
| `INWORLD_API_KEY` | Inworld TTS-1.5-Max — character voices built for game/agent NPCs. |
| `FAL_API_KEY` | Recraft V4 character + scene generation. |

The app boots fine with no keys — you can drag the bundled default characters/scenes around, see the editor, and watch the cabinet sit empty. Every key is optional; nothing is gated. If a key isn't set when an action needs it, you get a single editorial toast with a one-click "Open Settings" shortcut.

## Project layout

```
src/
  main/        Electron main process — settings, IPC, TTS, render, composition
  preload/     contextBridge → IpcApi exposed to the renderer
  renderer/    Vanilla TS + Tailwind 4 — screens, modals, design system
    screens/   Stage / Dialogue / Play
  shared/      Types and contracts shared across processes
resources/
  defaults/    Bundled characters (Bill, Ted) and scenes (park, backyard, …)
docs/          Repo media
```

Forge is configured to:

- Bundle `resources/defaults/` as `extraResource` so default characters & scenes ship with the app.
- Unpack `node_modules/hyperframes/**` from the asar so the render child process can resolve the CLI entry.

## License

MIT — see [LICENSE](LICENSE).

---

<sub><b>Sponsored by [Jellypod](https://jellypod.ai)</b> — the team behind <a href="https://github.com/Jellypod-Inc/speech-sdk">Speech SDK</a>.</sub>
