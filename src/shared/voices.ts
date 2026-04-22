// Curated voice catalog, grouped by provider. The dialogue UI lets the user
// pick a provider first, then a voice within that provider — matches how
// speech-sdk itself is organized (model names are "<provider>/<model>").
//
// Adding voices here is the only thing required to expose them in the UI —
// the TTS call just passes provider/model/voice straight through.
//
// ElevenLabs gets a direct fetch path (with-timestamps endpoint) in
// src/main/tts.ts because the npm SDK doesn't expose native timestamps yet.
// Every other provider goes through @speech-sdk/core's generateSpeech and
// falls back to OpenAI Whisper for word-level alignment when needed.

export type Provider =
  | 'elevenlabs'
  | 'openai'
  | 'google'
  | 'cartesia'
  | 'deepgram'
  | 'hume'
  | 'fish-audio'
  | 'inworld';

export type VoiceOption = {
  provider: Provider;
  model: string;
  voice: string;
  label: string;
};

export type ProviderSpec = {
  id: Provider;
  label: string;
  // Env key that must be set in Settings for this provider to work.
  envKey:
    | 'ELEVEN_API_KEY'
    | 'OPENAI_API_KEY'
    | 'GOOGLE_GENERATIVE_AI_API_KEY'
    | 'CARTESIA_API_KEY'
    | 'DEEPGRAM_API_KEY'
    | 'HUME_API_KEY'
    | 'FISH_AUDIO_API_KEY'
    | 'INWORLD_API_KEY';
  // One-line note shown in the UI so the user knows what to expect.
  note: string;
};

export const PROVIDERS: readonly ProviderSpec[] = [
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    envKey: 'ELEVEN_API_KEY',
    note: 'Best voice quality · native word-level timestamps (no Whisper needed).',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    note: 'Cheap + fast · timestamps via Whisper fallback (same key).',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    note: 'Gemini 2.5 Flash TTS · 15 distinctive voices · Whisper fallback for timestamps.',
  },
  {
    id: 'cartesia',
    label: 'Cartesia',
    envKey: 'CARTESIA_API_KEY',
    note: 'Sonic-3 · ultra-low latency, expressive character voices.',
  },
  {
    id: 'deepgram',
    label: 'Deepgram',
    envKey: 'DEEPGRAM_API_KEY',
    note: 'Aura-2 · natural conversational voices, very fast.',
  },
  {
    id: 'hume',
    label: 'Hume Octave',
    envKey: 'HUME_API_KEY',
    note: 'Octave-2 · emotionally intelligent, prompt-steerable.',
  },
  {
    id: 'fish-audio',
    label: 'Fish Audio',
    envKey: 'FISH_AUDIO_API_KEY',
    note: 'S2-Pro · expressive multilingual TTS · paste reference IDs from fish.audio.',
  },
  {
    id: 'inworld',
    label: 'Inworld',
    envKey: 'INWORLD_API_KEY',
    note: 'TTS-1.5-Max · character voices built for game/agent NPCs.',
  },
] as const;

// ── ElevenLabs ────────────────────────────────────────────────────────────
const ELEVENLABS_MODEL = 'elevenlabs/eleven_multilingual_v2';
const ELEVENLABS_VOICES: VoiceOption[] = [
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: '9BWtsMINqrJLrRacOk9x', label: 'Aria · young female (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Roger · middle-aged male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah · young female (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura · young female (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie · middle-aged male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'JBFqnCBsd6RMkjVDRZzb', label: 'George · warm British male (UK)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum · gravelly character male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam · young male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte · warm female (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice · British female (UK)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda · warm female (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'bIHbv24MWmeRgasZH58o', label: 'Will · friendly male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica · young female (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'cjVigY5qzO86Huf0OWal', label: 'Eric · middle-aged male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'iP95p4xoKVk53GoZ742B', label: 'Chris · middle-aged male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'nPczCjzI2devNBz1zQrb', label: 'Brian · deep male (US)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel · authoritative British male (UK)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily · British female (UK)' },
  { provider: 'elevenlabs', model: ELEVENLABS_MODEL, voice: 'pqHfZKP75CvOlQylNhV4', label: 'Bill · mature male (US)' },
];

// ── OpenAI ────────────────────────────────────────────────────────────────
const OPENAI_MODEL = 'openai/gpt-4o-mini-tts';
const OPENAI_VOICES: VoiceOption[] = [
  { provider: 'openai', model: OPENAI_MODEL, voice: 'alloy',   label: 'Alloy · neutral' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'ash',     label: 'Ash · warm male' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'ballad',  label: 'Ballad · mellow male' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'coral',   label: 'Coral · warm female' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'echo',    label: 'Echo · male' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'fable',   label: 'Fable · British male' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'nova',    label: 'Nova · bright female' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'onyx',    label: 'Onyx · deep male' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'sage',    label: 'Sage · calm female' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'shimmer', label: 'Shimmer · warm female' },
  { provider: 'openai', model: OPENAI_MODEL, voice: 'verse',   label: 'Verse · expressive' },
];

// ── Google Gemini ─────────────────────────────────────────────────────────
// gemini-2.5-flash-preview-tts ships ~30 named voices; we surface the 15 most
// distinctive across genders and tones. Full list:
// https://ai.google.dev/gemini-api/docs/speech-generation
const GOOGLE_MODEL = 'google/gemini-2.5-flash-preview-tts';
const GOOGLE_VOICES: VoiceOption[] = [
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Puck',      label: 'Puck · upbeat' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Kore',      label: 'Kore · firm female' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Charon',    label: 'Charon · informative male' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Fenrir',    label: 'Fenrir · excitable male' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Leda',      label: 'Leda · youthful female' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Aoede',     label: 'Aoede · breezy female' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Orus',      label: 'Orus · firm male' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Zephyr',    label: 'Zephyr · bright female' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Algenib',   label: 'Algenib · gravelly male' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Achernar',  label: 'Achernar · soft female' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Sadachbia', label: 'Sadachbia · lively' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Despina',   label: 'Despina · smooth female' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Enceladus', label: 'Enceladus · breathy male' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Gacrux',    label: 'Gacrux · mature female' },
  { provider: 'google', model: GOOGLE_MODEL, voice: 'Sulafat',   label: 'Sulafat · warm female' },
];

// ── Cartesia ──────────────────────────────────────────────────────────────
// Sonic-3 voice IDs are documented UUIDs from Cartesia's voice library.
// All English, all platform-default (work for any account).
const CARTESIA_MODEL = 'cartesia/sonic-3';
const CARTESIA_VOICES: VoiceOption[] = [
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: 'f786b574-daa5-4673-aa0c-cbe3e8534c02', label: 'Katie · stable female (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: '228fca29-3a0a-435c-8728-5cb483251068', label: 'Kiefer · expressive male (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: '694f9389-aac1-45b6-b726-9d9369183238', label: 'Sarah · conversational female (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: 'd46abd1d-2d02-43e8-819f-51fb652c1c61', label: 'Newsman · authoritative male (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: '15a9cd88-84b0-4a8b-95f2-5d583b54c72e', label: 'Reading Lady · narrator female (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: 'cd17ff2d-5ea4-4695-be8f-42193949b946', label: 'Meditation Lady · calm female (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: '34575e71-908f-4ab6-ab54-b08c95d6597d', label: 'New York Man · brash male (US-NY)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: '69267136-1bdc-412f-ad78-0caad210fb40', label: 'Friendly Reading Man · warm male (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: 'b7d50908-b17c-442d-ad8d-810c63997ed9', label: 'California Girl · young female (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: 'b043dea0-a007-4bbe-a708-769dc0d0c569', label: 'Wise Man · elder male (US)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: 'f9836c6e-a0bd-460e-9d3c-f7299fa60f94', label: 'Southern Woman · female (US-South)' },
  { provider: 'cartesia', model: CARTESIA_MODEL, voice: '2ee87190-8f84-4925-97da-e52547f9462c', label: 'Child · youth (US)' },
];

// ── Deepgram ──────────────────────────────────────────────────────────────
// Aura-2 voice IDs are stable, English-only, documented at
// developers.deepgram.com/docs/tts-models
const DEEPGRAM_MODEL = 'deepgram/aura-2';
const DEEPGRAM_VOICES: VoiceOption[] = [
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-thalia-en',    label: 'Thalia · confident female (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-andromeda-en', label: 'Andromeda · expressive female (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-helena-en',    label: 'Helena · friendly female (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-electra-en',   label: 'Electra · professional female (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-harmonia-en',  label: 'Harmonia · empathetic female (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-pandora-en',   label: 'Pandora · melodic female (UK)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-theia-en',     label: 'Theia · polite female (AU)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-apollo-en',    label: 'Apollo · confident male (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-arcas-en',     label: 'Arcas · natural male (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-mars-en',      label: 'Mars · trustworthy male (US)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-draco-en',     label: 'Draco · warm male (UK)' },
  { provider: 'deepgram', model: DEEPGRAM_MODEL, voice: 'aura-2-hyperion-en',  label: 'Hyperion · empathetic male (AU)' },
];

// ── Hume Octave ───────────────────────────────────────────────────────────
// Hume's Voice Library has 100+ voices but the names of platform defaults
// are not stably published. These five appear in Hume's official docs and
// example code; if any 404 in your account, browse the Voice Library at
// dev.hume.ai and substitute names from there.
const HUME_MODEL = 'hume/octave-2';
const HUME_VOICES: VoiceOption[] = [
  { provider: 'hume', model: HUME_MODEL, voice: 'Male English Actor',             label: 'Male English Actor · transatlantic' },
  { provider: 'hume', model: HUME_MODEL, voice: 'narrator',                       label: 'Narrator · neutral storyteller' },
  { provider: 'hume', model: HUME_MODEL, voice: 'British Romance Novel Narrator', label: 'British Romance Narrator · warm female (UK)' },
  { provider: 'hume', model: HUME_MODEL, voice: 'Film Narrator',                  label: 'Film Narrator · deep male' },
  { provider: 'hume', model: HUME_MODEL, voice: 'Male Old-School Film Actor',     label: 'Old-School Film Actor · intense male' },
];

// ── Fish Audio ────────────────────────────────────────────────────────────
// S2-Pro doesn't ship a published default-voice catalog. Calling without a
// reference_id uses Fish's internal default. To use a specific voice,
// browse fish.audio and copy the reference_id from the voice page, then
// add it manually here.
const FISH_MODEL = 'fish-audio/s2-pro';
const FISH_VOICES: VoiceOption[] = [
  { provider: 'fish-audio', model: FISH_MODEL, voice: '', label: 'Default · platform default voice' },
];

// ── Inworld ───────────────────────────────────────────────────────────────
// Inworld TTS-1.5-Max ships 80+ voices specifically built for game/agent
// NPCs. The 12 below cover a useful range.
const INWORLD_MODEL = 'inworld/inworld-tts-1.5-max';
const INWORLD_VOICES: VoiceOption[] = [
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Dennis',    label: 'Dennis · calm male (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Hades',     label: 'Hades · commanding gruff male (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Ashley',    label: 'Ashley · warm female (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Alex',      label: 'Alex · energetic male (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Edward',    label: 'Edward · fast-talking male (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Olivia',    label: 'Olivia · upbeat female (UK)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Pixie',     label: 'Pixie · high-pitched playful female (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Theodore',  label: 'Theodore · refined male (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Sophie',    label: 'Sophie · young female (UK)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Sebastian', label: 'Sebastian · suave male (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Wendy',     label: 'Wendy · cheerful female (US)' },
  { provider: 'inworld', model: INWORLD_MODEL, voice: 'Dominus',   label: 'Dominus · deep authoritative male (US)' },
];

export const VOICES: readonly VoiceOption[] = [
  ...ELEVENLABS_VOICES,
  ...OPENAI_VOICES,
  ...GOOGLE_VOICES,
  ...CARTESIA_VOICES,
  ...DEEPGRAM_VOICES,
  ...HUME_VOICES,
  ...FISH_VOICES,
  ...INWORLD_VOICES,
];

export function voicesForProvider(p: Provider): VoiceOption[] {
  return VOICES.filter((v) => v.provider === p);
}

export function defaultVoice(): VoiceOption {
  // George — warm British male on ElevenLabs. Native timestamps, works with
  // a single ELEVEN_API_KEY (no Whisper fallback needed).
  return ELEVENLABS_VOICES[5];
}

export function defaultVoiceForProvider(p: Provider): VoiceOption {
  return voicesForProvider(p)[0];
}

export function findVoice(model: string, voice: string): VoiceOption | null {
  return VOICES.find((v) => v.model === model && v.voice === voice) ?? null;
}
