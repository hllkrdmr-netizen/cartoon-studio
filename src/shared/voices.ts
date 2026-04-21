// A small curated voice catalog. Per the spec we use speech-sdk's
// provider-agnostic API; model strings are passed as the `model` field,
// voice IDs as the `voice` field. Add more here as needed.

export type VoiceOption = {
  provider: 'elevenlabs' | 'google' | 'openai';
  model: string;
  voice: string;
  label: string;
};

export const VOICES: readonly VoiceOption[] = [
  // ElevenLabs — best fidelity + native word-level timestamps.
  {
    provider: 'elevenlabs',
    model: 'elevenlabs/eleven_v3',
    voice: 'JBFqnCBsd6RMkjVDRZzb',
    label: 'ElevenLabs · George',
  },
  {
    provider: 'elevenlabs',
    model: 'elevenlabs/eleven_v3',
    voice: 'XB0fDUnXU5powFXDhCwa',
    label: 'ElevenLabs · Charlotte',
  },
  {
    provider: 'elevenlabs',
    model: 'elevenlabs/eleven_v3',
    voice: 'cgSgspJ2msm6clMCkdW9',
    label: 'ElevenLabs · Jessica',
  },
  // Google Gemini Flash TTS — Whisper fallback for timestamps.
  {
    provider: 'google',
    model: 'google/gemini-3.1-flash-tts-preview',
    voice: 'Puck',
    label: 'Gemini · Puck',
  },
  {
    provider: 'google',
    model: 'google/gemini-3.1-flash-tts-preview',
    voice: 'Kore',
    label: 'Gemini · Kore',
  },
  // OpenAI gpt-4o-mini-tts — cheap, decent.
  {
    provider: 'openai',
    model: 'openai/gpt-4o-mini-tts',
    voice: 'alloy',
    label: 'OpenAI · alloy',
  },
  {
    provider: 'openai',
    model: 'openai/gpt-4o-mini-tts',
    voice: 'sage',
    label: 'OpenAI · sage',
  },
];

export function defaultVoice(): VoiceOption {
  return VOICES[0];
}

export function findVoice(model: string, voice: string): VoiceOption | null {
  return (
    VOICES.find((v) => v.model === model && v.voice === voice) ?? null
  );
}
