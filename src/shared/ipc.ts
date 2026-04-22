import type { ApiKeyId } from './keys';
import type { Show, ShowSummary } from './show';

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
  // Returns storage backend metadata (which OS keyring is in use, where the
  // ciphertext file lives) for the security panel in Settings. Never
  // returns key plaintext — that stays in the main process only.
  settingsStorageInfo: () => Promise<{
    backend: string;
    backendLabel: string;
    available: boolean;
    insecure: boolean;
    path: string;
  }>;

  defaultsList: () => Promise<DefaultAsset[]>;
  userAssetsList: () => Promise<DefaultAsset[]>;
  generateCharacter: (prompt: string, name: string) => Promise<DefaultAsset>;
  generateScene: (prompt: string, name: string) => Promise<DefaultAsset>;
  uploadAsset: (
    type: 'character' | 'scene',
  ) => Promise<{ asset: DefaultAsset; warning?: string } | null>;
  userAssetsDelete: (id: string) => Promise<void>;

  showSave: (show: Show) => Promise<Show>;
  showLoad: (id: string) => Promise<Show>;
  showList: () => Promise<ShowSummary[]>;
  showDelete: (id: string) => Promise<void>;

  ttsGenerateLine: (req: {
    showId: string;
    lineId: string;
    text: string;
    model: string;
    voice: string;
    provider: string;
    force?: boolean;
  }) => Promise<{
    audioFile: string;
    words: Array<{ text: string; start: number; end: number }>;
    durationMs: number;
    cached: boolean;
    hash: string;
  }>;

  audioUrl: (showId: string, audioFile: string) => Promise<string>;

  buildComposition: (showId: string) => Promise<{
    outDir: string;
    composition: string;
    scene: string;
    duration: number;
    missingLines: string[];
  }>;

  previewUrl: (showId: string) => Promise<string>;

  llmGenerateDialogue: (args: {
    premise: string;
    cast: Array<{ id: string; name: string }>;
    lineCount: number;
  }) => Promise<
    Array<{
      speakerId: string;
      text: string;
      provider: string;
      model: string;
      voice: string;
    }>
  >;
  llmRewriteLine: (args: {
    text: string;
    instruction: string;
    surrounding?: string;
  }) => Promise<string>;

  renderShow: (showId: string) => Promise<string>;
  revealInFolder: (path: string) => Promise<void>;
  // Polls GitHub Releases for a newer version. Returns null on any
  // failure (network, 404, parse error) — never throws.
  checkForUpdate: () => Promise<{
    latest: string;
    current: string;
    url: string;
    notes: string;
  } | null>;
  onRenderProgress: (
    cb: (
      p:
        | { type: 'start'; outputPath: string }
        | { type: 'log'; line: string }
        | { type: 'done'; outputPath: string }
        | { type: 'error'; message: string },
    ) => void,
  ) => () => void;
};

export const IPC_CHANNELS = {
  ping: 'app:ping',
  settingsGetAll: 'settings:getAll',
  settingsSet: 'settings:set',
  settingsDelete: 'settings:delete',
  settingsStorageInfo: 'settings:storageInfo',
  defaultsList: 'defaults:list',
  userAssetsList: 'assets:list',
  generateCharacter: 'assets:generateCharacter',
  generateScene: 'assets:generateScene',
  uploadAsset: 'assets:upload',
  userAssetsDelete: 'assets:deleteUser',
  showSave: 'show:save',
  showLoad: 'show:load',
  showList: 'show:list',
  showDelete: 'show:delete',
  ttsGenerateLine: 'tts:generateLine',
  audioUrl: 'tts:audioUrl',
  buildComposition: 'composition:build',
  previewUrl: 'preview:url',
  llmGenerateDialogue: 'llm:generateDialogue',
  llmRewriteLine: 'llm:rewriteLine',
  renderShow: 'render:start',
  revealInFolder: 'shell:revealInFolder',
  checkForUpdate: 'updater:check',
  onRenderProgress: 'render:progress',
} as const satisfies Record<keyof IpcApi, string>;
