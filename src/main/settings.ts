import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { ApiKeyId } from '../shared/keys';

type SettingsSchema = {
  apiKeys: Record<string, string>; // id -> base64(safeStorage ciphertext)
};

const store = new Store<SettingsSchema>({
  name: 'settings',
  defaults: { apiKeys: {} },
});

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption not available on this system');
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(b64: string): string {
  return safeStorage.decryptString(Buffer.from(b64, 'base64'));
}

export const settings = {
  set(id: ApiKeyId, value: string): void {
    const apiKeys = { ...(store.get('apiKeys') ?? {}) };
    if (value.trim() === '') {
      delete apiKeys[id];
    } else {
      apiKeys[id] = encrypt(value);
    }
    store.set('apiKeys', apiKeys);
  },

  has(id: ApiKeyId): boolean {
    const apiKeys = store.get('apiKeys') ?? {};
    return Boolean(apiKeys[id]);
  },

  get(id: ApiKeyId): string | null {
    const apiKeys = store.get('apiKeys') ?? {};
    const cipher = apiKeys[id];
    if (!cipher) return null;
    try {
      return decrypt(cipher);
    } catch {
      return null;
    }
  },

  delete(id: ApiKeyId): void {
    const apiKeys = { ...(store.get('apiKeys') ?? {}) };
    delete apiKeys[id];
    store.set('apiKeys', apiKeys);
  },

  hasMap(): Record<ApiKeyId, boolean> {
    const apiKeys = store.get('apiKeys') ?? {};
    const out = {} as Record<ApiKeyId, boolean>;
    for (const k of Object.keys(apiKeys)) {
      out[k as ApiKeyId] = true;
    }
    return out;
  },
};
