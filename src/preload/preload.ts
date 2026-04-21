import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcApi } from '../shared/ipc';

const api: IpcApi = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
};

contextBridge.exposeInMainWorld('api', api);
