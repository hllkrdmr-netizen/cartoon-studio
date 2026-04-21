import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApiKeyId } from '../../shared/keys';
import type { Show } from '../../shared/show';
import { settings } from '../settings';
import { listDefaults } from '../resources';
import { saveShow, loadShow, listShows, deleteShow } from '../showStore';
import { generateLine } from '../tts';
import { buildComposition } from '../composition';
import { previewUrl } from '../previewServer';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, () => 'pong');

  ipcMain.handle(IPC_CHANNELS.settingsGetAll, () => settings.hasMap());
  ipcMain.handle(IPC_CHANNELS.settingsSet, (_e, id: ApiKeyId, value: string) =>
    settings.set(id, value),
  );
  ipcMain.handle(IPC_CHANNELS.settingsDelete, (_e, id: ApiKeyId) =>
    settings.delete(id),
  );

  ipcMain.handle(IPC_CHANNELS.defaultsList, () => listDefaults());

  ipcMain.handle(IPC_CHANNELS.showSave, (_e, show: Show) => saveShow(show));
  ipcMain.handle(IPC_CHANNELS.showLoad, (_e, id: string) => loadShow(id));
  ipcMain.handle(IPC_CHANNELS.showList, () => listShows());
  ipcMain.handle(IPC_CHANNELS.showDelete, (_e, id: string) => deleteShow(id));

  ipcMain.handle(IPC_CHANNELS.ttsGenerateLine, (_e, req) => generateLine(req));
  ipcMain.handle(IPC_CHANNELS.buildComposition, async (_e, showId: string) => {
    const show = await loadShow(showId);
    return buildComposition(show);
  });
  ipcMain.handle(IPC_CHANNELS.previewUrl, (_e, showId: string) =>
    previewUrl(showId),
  );
}
