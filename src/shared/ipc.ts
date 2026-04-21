// IPC contract shared between main and renderer.
// Add new channels here, then implement the handler in src/main/ipc/
// and re-expose it from src/preload/preload.ts.

export type IpcApi = {
  ping: () => Promise<string>;
};

export const IPC_CHANNELS = {
  ping: 'app:ping',
} as const satisfies Record<keyof IpcApi, string>;
