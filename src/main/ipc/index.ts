import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApiKeyId } from '../../shared/keys';
import { settings } from '../settings';
import { listDefaults } from '../resources';

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
}
