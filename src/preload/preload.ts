import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcApi } from '../shared/ipc';

const api: IpcApi = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),

  settingsGetAll: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetAll),
  settingsSet: (id, value) =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsSet, id, value),
  settingsDelete: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsDelete, id),

  defaultsList: () => ipcRenderer.invoke(IPC_CHANNELS.defaultsList),
  userAssetsList: () => ipcRenderer.invoke(IPC_CHANNELS.userAssetsList),
  generateCharacter: (prompt, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateCharacter, prompt, name),
  generateScene: (prompt, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateScene, prompt, name),

  showSave: (show) => ipcRenderer.invoke(IPC_CHANNELS.showSave, show),
  showLoad: (id) => ipcRenderer.invoke(IPC_CHANNELS.showLoad, id),
  showList: () => ipcRenderer.invoke(IPC_CHANNELS.showList),
  showDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.showDelete, id),

  ttsGenerateLine: (req) =>
    ipcRenderer.invoke(IPC_CHANNELS.ttsGenerateLine, req),

  buildComposition: (showId) =>
    ipcRenderer.invoke(IPC_CHANNELS.buildComposition, showId),

  previewUrl: (showId) => ipcRenderer.invoke(IPC_CHANNELS.previewUrl, showId),
};

contextBridge.exposeInMainWorld('api', api);
