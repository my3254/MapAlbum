const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...eventArgs) => listener(event, ...eventArgs));
  },
  off(...args) {
    const [channel, ...rest] = args;
    return ipcRenderer.off(channel, ...rest);
  },
  send(...args) {
    const [channel, ...rest] = args;
    return ipcRenderer.send(channel, ...rest);
  },
  invoke(...args) {
    const [channel, ...rest] = args;
    return ipcRenderer.invoke(channel, ...rest);
  },
});

contextBridge.exposeInMainWorld('api', {
  chooseRootFolder: () => ipcRenderer.invoke('system:chooseRootFolder'),
  chooseImages: () => ipcRenderer.invoke('system:chooseImages'),
  listAlbums: (rootFolder) => ipcRenderer.invoke('albums:list', rootFolder),
  getAlbumImages: (rootFolder, relativePath) => ipcRenderer.invoke('albums:images', rootFolder, relativePath),
  saveAlbum: (rootFolder, location, sourcePaths) => ipcRenderer.invoke('albums:save', rootFolder, location, sourcePaths),
  setAlbumCover: (rootFolder, relativePath, imageName) => ipcRenderer.invoke('albums:setCover', rootFolder, relativePath, imageName),
  setAlbumNote: (rootFolder, relativePath, note) => ipcRenderer.invoke('albums:setNote', rootFolder, relativePath, note),
  reverseGeocodeLocation: (location) => ipcRenderer.invoke('location:reverseGeocode', location),
  startLanUpload: () => ipcRenderer.invoke('lanUpload:start'),
  stopLanUpload: () => ipcRenderer.invoke('lanUpload:stop'),
  getLanUploadState: () => ipcRenderer.invoke('lanUpload:getState'),
  consumeLanUploadBatches: () => ipcRenderer.invoke('lanUpload:consumeBatches'),
});
