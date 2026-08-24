const { contextBridge, ipcRenderer } = require('electron');
const { wsServerUrl } = require('./env');

contextBridge.exposeInMainWorld('electronAPI', {
    sendStatus: (status) => ipcRenderer.send('write-status', status),
    wsServerUrl,
});
