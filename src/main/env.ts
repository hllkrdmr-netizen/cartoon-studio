import { settings } from './settings';

// Map our ApiKeyId values into every env var the various SDKs check for.
const ENV_MAP: Array<[string, Parameters<typeof settings.get>[0]]> = [
  ['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY'],
  ['ELEVEN_API_KEY', 'ELEVEN_API_KEY'],
  ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['OPENAI_API_KEY', 'OPENAI_API_KEY'],
  ['FAL_KEY', 'FAL_KEY'],
];

export function applyKeysToEnv(): void {
  for (const [envName, keyId] of ENV_MAP) {
    const v = settings.get(keyId);
    if (v) process.env[envName] = v;
  }
}
