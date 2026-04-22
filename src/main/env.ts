import { settings } from './settings';

// Set the env var each SDK actually reads, per the provider's official
// docs. One mapping per provider — no aliases. Our internal ApiKeyId
// values are kept in lockstep with these env var names so there's no
// translation layer to maintain.
const ENV_MAP: Array<[string, Parameters<typeof settings.get>[0]]> = [
  ['ELEVENLABS_API_KEY', 'ELEVENLABS_API_KEY'],
  ['OPENAI_API_KEY', 'OPENAI_API_KEY'],
  ['GOOGLE_API_KEY', 'GOOGLE_API_KEY'],
  ['CARTESIA_API_KEY', 'CARTESIA_API_KEY'],
  ['DEEPGRAM_API_KEY', 'DEEPGRAM_API_KEY'],
  ['HUME_API_KEY', 'HUME_API_KEY'],
  ['FISH_AUDIO_API_KEY', 'FISH_AUDIO_API_KEY'],
  ['INWORLD_API_KEY', 'INWORLD_API_KEY'],
  ['FAL_API_KEY', 'FAL_API_KEY'],
];

export function applyKeysToEnv(): void {
  for (const [envName, keyId] of ENV_MAP) {
    const v = settings.get(keyId);
    if (v) process.env[envName] = v;
  }
}
