import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    selectVideo: () => ipcRenderer.invoke('select-video'),
    getVideoInfo: (filePath) => ipcRenderer.invoke('get-video-info', filePath),
    toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
    onFullscreenChange: (callback) => {
        const subscription = (event, value) => callback(value);
        ipcRenderer.on('fullscreen-change', subscription);
        return () => {
            ipcRenderer.removeListener('fullscreen-change', subscription);
        };
    },
    isElectron: true
});
