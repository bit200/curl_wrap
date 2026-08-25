const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendStatus: (status) => ipcRenderer.send('write-status', status)
});
