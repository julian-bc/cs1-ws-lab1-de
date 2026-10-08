const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  predict: (data) => {
    return ipcRenderer.invoke('api:predict', data);
  }
});
