import type { ApiKeyId } from './keys';

export type DefaultAsset = {
  id: string;
  name: string;
  type: 'character' | 'scene';
  svg: string;
};

// IPC contract shared between main and renderer.
// Add new channels here, then implement the handler in src/main/ipc/
// and re-expose it from src/preload/preload.ts.

export type IpcApi = {
  ping: () => Promise<string>;

  settingsGetAll: () => Promise<Record<ApiKeyId, boolean>>;
  settingsSet: (id: ApiKeyId, value: string) => Promise<void>;
  settingsDelete: (id: ApiKeyId) => Promise<void>;

  defaultsList: () => Promise<DefaultAsset[]>;
};

export const IPC_CHANNELS = {
  ping: 'app:ping',
  settingsGetAll: 'settings:getAll',
  settingsSet: 'settings:set',
  settingsDelete: 'settings:delete',
  defaultsList: 'defaults:list',
} as const satisfies Record<keyof IpcApi, string>;
