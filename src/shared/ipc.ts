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

  defaultsList: () => Promise<DefaultAsset[]>;
  userAssetsList: () => Promise<DefaultAsset[]>;
  generateCharacter: (prompt: string, name: string) => Promise<DefaultAsset>;
  generateScene: (prompt: string, name: string) => Promise<DefaultAsset>;
  uploadAsset: (
    type: 'character' | 'scene',
  ) => Promise<{ asset: DefaultAsset; warning?: string } | null>;

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
  }) => Promise<{
    audioFile: string;
    words: Array<{ text: string; start: number; end: number }>;
    durationMs: number;
    cached: boolean;
    hash: string;
  }>;

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
  defaultsList: 'defaults:list',
  userAssetsList: 'assets:list',
  generateCharacter: 'assets:generateCharacter',
  generateScene: 'assets:generateScene',
  uploadAsset: 'assets:upload',
  showSave: 'show:save',
  showLoad: 'show:load',
  showList: 'show:list',
  showDelete: 'show:delete',
  ttsGenerateLine: 'tts:generateLine',
  buildComposition: 'composition:build',
  previewUrl: 'preview:url',
  llmGenerateDialogue: 'llm:generateDialogue',
  llmRewriteLine: 'llm:rewriteLine',
  renderShow: 'render:start',
  onRenderProgress: 'render:progress',
} as const satisfies Record<keyof IpcApi, string>;
