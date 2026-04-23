import { safeStorage, app } from 'electron';
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import type { ApiKeyId } from '../shared/keys';

// API key storage strategy:
//
// 1. Each key is encrypted by the OS keyring via Electron's safeStorage:
//    - macOS  → Keychain (keychain_access)
//    - Windows → DPAPI (dpapi)
//    - Linux  → GNOME Libsecret or KWallet (gnome_libsecret / kwallet*)
//    The encryption key never leaves the OS keyring; we only ever hold the
//    ciphertext.
//
// 2. The ciphertext is stored as base64 inside electron-store's settings.json
//    in the user's app data directory. The file's permissions are tightened
//    to 0600 (owner read/write only) after every write so other local users
//    on a shared machine can't read it even if they can see the file.
//
// 3. On Linux without a keyring, safeStorage's fallback backend is
//    "basic_text" — which stores plaintext on disk. We REFUSE to save in
//    that mode rather than silently downgrading; users get a clear error
//    pointing at gnome-keyring/kwallet.
//
// 4. Decrypted keys live ONLY in the main process. The IPC surface only
//    exposes a Record<ApiKeyId, boolean> ("set or not") to the renderer,
//    plus the storage backend name for the security info panel — never the
//    plaintext keys themselves.

type SettingsSchema = {
  apiKeys: Record<string, string>; // id -> base64(safeStorage ciphertext)
};

const store = new Store<SettingsSchema>({
  name: 'settings',
  defaults: { apiKeys: {} },
});

const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');

export type StorageBackend =
  | 'keychain_access'
  | 'dpapi'
  | 'gnome_libsecret'
  | 'kwallet'
  | 'kwallet5'
  | 'kwallet6'
  | 'basic_text'
  | 'unknown';

function getBackend(): StorageBackend {
  // safeStorage.getSelectedStorageBackend was added in Electron 15.
  // Older builds: infer from process.platform.
  type WithBackend = typeof safeStorage & {
    getSelectedStorageBackend?: () => StorageBackend;
  };
  const ss = safeStorage as WithBackend;
  if (typeof ss.getSelectedStorageBackend === 'function') {
    return ss.getSelectedStorageBackend();
  }
  if (process.platform === 'darwin') return 'keychain_access';
  if (process.platform === 'win32') return 'dpapi';
  return 'unknown';
}

function isInsecureBackend(backend: StorageBackend): boolean {
  // basic_text: Linux fallback — safeStorage will store plaintext on disk.
  // unknown: encryption is unavailable. Refuse to store in either case.
  return backend === 'basic_text' || backend === 'unknown';
}

function encryptionUnavailableMessage(): string {
  // Platform-specific guidance for the most common reason each OS fails.
  // macOS: almost always App Translocation on unsigned/quarantined builds.
  // Windows: DPAPI issues usually mean a user-profile mismatch.
  // Linux: no keyring daemon running.
  if (process.platform === 'darwin') {
    return (
      'macOS Keychain is not accessible. If you installed from a downloaded ' +
      '.zip, the app may be running via App Translocation. Quit Cartoon Studio, ' +
      'move it to /Applications if not already there, then in Terminal run:\n\n' +
      '  xattr -cr "/Applications/Cartoon Studio.app"\n\n' +
      'and relaunch from /Applications. See the README Install section for details.'
    );
  }
  if (process.platform === 'win32') {
    return (
      'Windows credential encryption (DPAPI) is not available. Make sure ' +
      "you're signed in as the same Windows user who installed the app — DPAPI " +
      'encryption is tied to the user profile.'
    );
  }
  return (
    'OS-level encryption is not available on this system. Install a system ' +
    'keyring (gnome-keyring or kwallet on Linux) and try again — keys are ' +
    'never stored as plaintext.'
  );
}

function insecureBackendMessage(backend: StorageBackend): string {
  if (backend === 'basic_text') {
    return (
      'Your Linux session does not provide a secure keyring (basic_text ' +
      'fallback detected). Refusing to save the key as plaintext on disk. ' +
      'Install gnome-keyring or kwallet, or pass the key via environment ' +
      'variable instead.'
    );
  }
  // backend === 'unknown' — platform-aware fallback.
  return encryptionUnavailableMessage();
}

function tightenPermissions(): void {
  // 0600 = owner read/write only. electron-store writes with the default
  // umask (typically 0644 on Unix), which means anyone on the machine could
  // read the ciphertext. The ciphertext alone is useless without the OS
  // keyring, but tightening is defense-in-depth and costs nothing.
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(settingsFilePath, 0o600);
  } catch {
    /* file may not exist yet — chmod on next write */
  }
}

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(encryptionUnavailableMessage());
  }
  const backend = getBackend();
  if (isInsecureBackend(backend)) {
    throw new Error(insecureBackendMessage(backend));
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(b64: string): string {
  return safeStorage.decryptString(Buffer.from(b64, 'base64'));
}

export type StorageInfo = {
  backend: StorageBackend;
  backendLabel: string;
  available: boolean;
  insecure: boolean;
  path: string;
};

function describeBackend(b: StorageBackend): string {
  switch (b) {
    case 'keychain_access':
      return 'macOS Keychain';
    case 'dpapi':
      return 'Windows DPAPI';
    case 'gnome_libsecret':
      return 'GNOME Libsecret';
    case 'kwallet':
    case 'kwallet5':
    case 'kwallet6':
      return 'KDE KWallet';
    case 'basic_text':
      return 'Plaintext fallback (insecure)';
    case 'unknown':
    default:
      return 'Unknown';
  }
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
    tightenPermissions();
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
    tightenPermissions();
  },

  hasMap(): Record<ApiKeyId, boolean> {
    const apiKeys = store.get('apiKeys') ?? {};
    const out = {} as Record<ApiKeyId, boolean>;
    for (const k of Object.keys(apiKeys)) {
      out[k as ApiKeyId] = true;
    }
    return out;
  },

  storageInfo(): StorageInfo {
    const backend = getBackend();
    return {
      backend,
      backendLabel: describeBackend(backend),
      available: safeStorage.isEncryptionAvailable(),
      insecure: isInsecureBackend(backend),
      path: settingsFilePath,
    };
  },
};
