export type ApiKeyId =
  | 'ELEVEN_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'OPENAI_API_KEY'
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
    id: 'GOOGLE_GENERATIVE_AI_API_KEY',
    label: 'Google Gemini',
    purpose: 'TTS via Gemini 3.1 Flash — needs OpenAI key for timestamp fallback.',
    url: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'OPENAI_API_KEY',
    label: 'OpenAI',
    purpose:
      'TTS, Whisper word-level timestamps, dialogue authoring, line rewrites, and vision-based mouth detection on uploaded SVGs.',
    url: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'FAL_KEY',
    label: 'fal.ai',
    purpose: 'Recraft V4 character & scene generation.',
    url: 'https://fal.ai/dashboard/keys',
  },
] as const;
