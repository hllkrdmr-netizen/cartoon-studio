export type ApiKeyId =
  | 'ELEVEN_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'OPENAI_API_KEY'
  | 'CARTESIA_API_KEY'
  | 'DEEPGRAM_API_KEY'
  | 'HUME_API_KEY'
  | 'FISH_AUDIO_API_KEY'
  | 'INWORLD_API_KEY'
  | 'FAL_KEY';

export type ApiKeySpec = {
  id: ApiKeyId;
  label: string;
  purpose: string;
  url: string;
};

export const API_KEYS: readonly ApiKeySpec[] = [
  {
    id: 'ELEVEN_API_KEY',
    label: 'ElevenLabs',
    purpose: 'TTS — best voice quality, native word-level timestamps.',
    url: 'https://elevenlabs.io/app/settings/api-keys',
  },
  {
    id: 'OPENAI_API_KEY',
    label: 'OpenAI',
    purpose:
      'TTS, Whisper word-level timestamps, dialogue authoring, line rewrites, and vision-based mouth detection on uploaded SVGs.',
    url: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'GOOGLE_GENERATIVE_AI_API_KEY',
    label: 'Google Gemini',
    purpose:
      'Gemini 2.5 Flash TTS — 15 distinctive voices. Needs OpenAI key for timestamp fallback.',
    url: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'CARTESIA_API_KEY',
    label: 'Cartesia',
    purpose: 'Sonic-3 TTS — ultra-low latency, expressive character voices.',
    url: 'https://play.cartesia.ai/keys',
  },
  {
    id: 'DEEPGRAM_API_KEY',
    label: 'Deepgram',
    purpose: 'Aura-2 TTS — natural conversational voices, very fast.',
    url: 'https://console.deepgram.com/api-keys',
  },
  {
    id: 'HUME_API_KEY',
    label: 'Hume Octave',
    purpose: 'Octave-2 TTS — emotionally intelligent, prompt-steerable.',
    url: 'https://platform.hume.ai/settings/keys',
  },
  {
    id: 'FISH_AUDIO_API_KEY',
    label: 'Fish Audio',
    purpose: 'S2-Pro TTS — expressive multilingual; paste reference IDs from fish.audio.',
    url: 'https://fish.audio/go-api/',
  },
  {
    id: 'INWORLD_API_KEY',
    label: 'Inworld',
    purpose: 'TTS-1.5-Max — 80+ character voices built for game/agent NPCs.',
    url: 'https://platform.inworld.ai/',
  },
  {
    id: 'FAL_KEY',
    label: 'Fal',
    purpose: 'Recraft V4 character & scene generation.',
    url: 'https://fal.ai/dashboard/keys',
  },
] as const;
