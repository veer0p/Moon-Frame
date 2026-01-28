import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    selectVideo: () => ipcRenderer.invoke('select-video'),
    isElectron: true
});
