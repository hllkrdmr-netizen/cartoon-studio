import type { ApiKeyId } from './keys';

// IPC contract shared between main and renderer.
// Add new channels here, then implement the handler in src/main/ipc/
// and re-expose it from src/preload/preload.ts.

export type IpcApi = {
  ping: () => Promise<string>;

  settingsGetAll: () => Promise<Record<ApiKeyId, boolean>>;
  settingsSet: (id: ApiKeyId, value: string) => Promise<void>;
  settingsDelete: (id: ApiKeyId) => Promise<void>;
};

export const IPC_CHANNELS = {
  ping: 'app:ping',
  settingsGetAll: 'settings:getAll',
  settingsSet: 'settings:set',
  settingsDelete: 'settings:delete',
} as const satisfies Record<keyof IpcApi, string>;
