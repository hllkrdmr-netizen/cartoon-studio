import { settings } from './settings';

// Map our ApiKeyId values into every env var the various SDKs check for.
// speech-sdk reads each provider's documented env var; we set both the
// canonical name and any common aliases so the SDK picks them up regardless
// of which one it ends up checking in a given version.
const ENV_MAP: Array<[string, Parameters<typeof settings.get>[0]]> = [
  ['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY'],
  ['ELEVEN_API_KEY', 'ELEVEN_API_KEY'],
  ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['OPENAI_API_KEY', 'OPENAI_API_KEY'],
  ['CARTESIA_API_KEY', 'CARTESIA_API_KEY'],
  ['DEEPGRAM_API_KEY', 'DEEPGRAM_API_KEY'],
  ['HUME_API_KEY', 'HUME_API_KEY'],
  ['FISH_AUDIO_API_KEY', 'FISH_AUDIO_API_KEY'],
  ['INWORLD_API_KEY', 'INWORLD_API_KEY'],
  ['FAL_KEY', 'FAL_KEY'],
];

export function applyKeysToEnv(): void {
  for (const [envName, keyId] of ENV_MAP) {
    const v = settings.get(keyId);
    if (v) process.env[envName] = v;
  }
}
