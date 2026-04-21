import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcApi } from '../shared/ipc';

const api: IpcApi = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),

  settingsGetAll: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetAll),
  settingsSet: (id, value) =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsSet, id, value),
  settingsDelete: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsDelete, id),
};

contextBridge.exposeInMainWorld('api', api);
