import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcApi } from '../shared/ipc';

const api: IpcApi = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),

  settingsGetAll: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetAll),
  settingsSet: (id, value) =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsSet, id, value),
  settingsDelete: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsDelete, id),
  settingsStorageInfo: () =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsStorageInfo),

  defaultsList: () => ipcRenderer.invoke(IPC_CHANNELS.defaultsList),
  userAssetsList: () => ipcRenderer.invoke(IPC_CHANNELS.userAssetsList),
  generateCharacter: (prompt, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateCharacter, prompt, name),
  generateScene: (prompt, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateScene, prompt, name),
  uploadAsset: (type) => ipcRenderer.invoke(IPC_CHANNELS.uploadAsset, type),
  userAssetsDelete: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.userAssetsDelete, id),

  showSave: (show) => ipcRenderer.invoke(IPC_CHANNELS.showSave, show),
  showLoad: (id) => ipcRenderer.invoke(IPC_CHANNELS.showLoad, id),
  showList: () => ipcRenderer.invoke(IPC_CHANNELS.showList),
  showDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.showDelete, id),

  ttsGenerateLine: (req) =>
    ipcRenderer.invoke(IPC_CHANNELS.ttsGenerateLine, req),
  audioUrl: (showId, audioFile) =>
    ipcRenderer.invoke(IPC_CHANNELS.audioUrl, showId, audioFile),

  buildComposition: (showId, options) =>
    ipcRenderer.invoke(IPC_CHANNELS.buildComposition, showId, options),

  previewUrl: (showId) => ipcRenderer.invoke(IPC_CHANNELS.previewUrl, showId),

  llmGenerateDialogue: (args) =>
    ipcRenderer.invoke(IPC_CHANNELS.llmGenerateDialogue, args),
  llmRewriteLine: (args) =>
    ipcRenderer.invoke(IPC_CHANNELS.llmRewriteLine, args),

  renderShow: (showId) => ipcRenderer.invoke(IPC_CHANNELS.renderShow, showId),
  revealInFolder: (p) => ipcRenderer.invoke(IPC_CHANNELS.revealInFolder, p),
  checkForUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdate),
  onRenderProgress: (cb) => {
    const handler = (_: unknown, p: unknown) =>
      cb(p as Parameters<typeof cb>[0]);
    ipcRenderer.on(IPC_CHANNELS.onRenderProgress, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.onRenderProgress, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
