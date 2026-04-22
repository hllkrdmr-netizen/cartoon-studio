import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApiKeyId } from '../../shared/keys';
import type { Show } from '../../shared/show';
import { settings } from '../settings';
import { listDefaults } from '../resources';
import { saveShow, loadShow, listShows, deleteShow } from '../showStore';
import { generateLine } from '../tts';
import { buildComposition } from '../composition';
import { previewUrl, audioFileUrl } from '../previewServer';
import { listUserAssets, saveUserAsset, deleteUserAsset } from '../userAssets';
import { generateCharacter, generateScene } from '../recraft';
import { rigSvg } from '../svgRig';
import { renderSvgToPng } from '../renderSvg';
import { generateDialogue, rewriteLine, buildOpenAIClient } from '../llm';
import { rigCharacterWithVision } from '../rigPipeline';
import { renderShow } from '../render';
import { checkForUpdate } from '../updater';
import { dialog, BrowserWindow, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, () => 'pong');

  ipcMain.handle(IPC_CHANNELS.settingsGetAll, () => settings.hasMap());
  ipcMain.handle(IPC_CHANNELS.settingsSet, (_e, id: ApiKeyId, value: string) =>
    settings.set(id, value),
  );
  ipcMain.handle(IPC_CHANNELS.settingsDelete, (_e, id: ApiKeyId) =>
    settings.delete(id),
  );
  ipcMain.handle(IPC_CHANNELS.settingsStorageInfo, () => settings.storageInfo());

  ipcMain.handle(IPC_CHANNELS.defaultsList, () => listDefaults());
  ipcMain.handle(IPC_CHANNELS.userAssetsList, () => listUserAssets());
  ipcMain.handle(
    IPC_CHANNELS.generateCharacter,
    async (_e, prompt: string, name: string) => {
      const svg = await generateCharacter(prompt);
      return saveUserAsset('character', name, svg);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.generateScene,
    async (_e, prompt: string, name: string) => {
      const svg = await generateScene(prompt);
      return saveUserAsset('scene', name, svg);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.uploadAsset,
    async (e, type: 'character' | 'scene') => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const r = await dialog.showOpenDialog(win!, {
        title: type === 'character' ? 'Choose a character SVG' : 'Choose a scene SVG',
        filters: [{ name: 'SVG', extensions: ['svg'] }],
        properties: ['openFile'],
      });
      if (r.canceled || r.filePaths.length === 0) return null;
      const file = r.filePaths[0];
      const raw = await fs.readFile(file, 'utf8');
      let svg = raw;
      let warning: string | undefined;
      if (type === 'character') {
        const heur = rigSvg(raw);
        if (heur.rigged) {
          svg = heur.svg;
        } else if (settings.has('OPENAI_API_KEY')) {
          // Same vision pipeline the generate flow uses: detect mouth +
          // face bbox, geometric removal, scaled rig, optional verify-and-
          // retry when confidence is low.
          try {
            const initialRaster = await renderSvgToPng(raw, 1024);
            const result = await rigCharacterWithVision(raw, {
              initialRaster,
              rerasterize: (s) => renderSvgToPng(s, 1024),
              openai: buildOpenAIClient(),
            });
            if (result.status === 'rigged') {
              svg = result.svg;
              if (result.removedPaths === 0) {
                warning =
                  'Mouth located via LLM but no underlying path was removed; the static mouth may show through under the lip-sync animation.';
              } else if (result.reason) {
                warning = result.reason;
              }
            } else {
              warning =
                result.reason ??
                'LLM could not see a mouth on this SVG. The character will appear but lip sync will not animate.';
            }
          } catch (err) {
            warning = `LLM mouth detection failed: ${(err as Error).message}. The character will appear but lip sync will not animate.`;
          }
        } else {
          warning =
            'Could not auto-detect a mouth path on this SVG. Set OPENAI_API_KEY in Settings to enable LLM-based detection, or hand-rig the SVG.';
        }
      }
      const name = path
        .basename(file, path.extname(file))
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const asset = await saveUserAsset(type, name, svg);
      return { asset, warning };
    },
  );

  ipcMain.handle(IPC_CHANNELS.userAssetsDelete, (_e, id: string) =>
    deleteUserAsset(id),
  );

  ipcMain.handle(IPC_CHANNELS.showSave, (_e, show: Show) => saveShow(show));
  ipcMain.handle(IPC_CHANNELS.showLoad, (_e, id: string) => loadShow(id));
  ipcMain.handle(IPC_CHANNELS.showList, () => listShows());
  ipcMain.handle(IPC_CHANNELS.showDelete, (_e, id: string) => deleteShow(id));

  ipcMain.handle(IPC_CHANNELS.ttsGenerateLine, (_e, req) => generateLine(req));
  ipcMain.handle(
    IPC_CHANNELS.audioUrl,
    (_e, showId: string, audioFile: string) => audioFileUrl(showId, audioFile),
  );
  ipcMain.handle(IPC_CHANNELS.buildComposition, async (_e, showId: string) => {
    const show = await loadShow(showId);
    return buildComposition(show);
  });
  ipcMain.handle(IPC_CHANNELS.previewUrl, (_e, showId: string) =>
    previewUrl(showId),
  );

  ipcMain.handle(IPC_CHANNELS.llmGenerateDialogue, (_e, args) =>
    generateDialogue(args),
  );
  ipcMain.handle(IPC_CHANNELS.llmRewriteLine, (_e, args) => rewriteLine(args));

  ipcMain.handle(IPC_CHANNELS.renderShow, async (e, showId: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) throw new Error('no window');
    return renderShow(showId, win);
  });

  ipcMain.handle(IPC_CHANNELS.revealInFolder, (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdate, () => checkForUpdate());
}
