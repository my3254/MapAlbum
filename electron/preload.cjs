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
  getRootFolder: () => ipcRenderer.invoke('system:getRootFolder'),
  setRootFolder: (rootFolder) => ipcRenderer.invoke('system:setRootFolder', rootFolder),
  chooseImages: () => ipcRenderer.invoke('system:chooseImages'),
  listAlbums: (rootFolder) => ipcRenderer.invoke('albums:list', rootFolder),
  getAlbumImages: (rootFolder, relativePath) => ipcRenderer.invoke('albums:images', rootFolder, relativePath),
  getTimelinePage: (rootFolder, offset, limit, refresh) => ipcRenderer.invoke('timeline:page', rootFolder, offset, limit, refresh),
  saveAlbum: (rootFolder, location, sourcePaths) => ipcRenderer.invoke('albums:save', rootFolder, location, sourcePaths),
  setAlbumCover: (rootFolder, relativePath, imageName) => ipcRenderer.invoke('albums:setCover', rootFolder, relativePath, imageName),
  setAlbumNote: (rootFolder, relativePath, note) => ipcRenderer.invoke('albums:setNote', rootFolder, relativePath, note),
  deleteAlbumImage: (rootFolder, relativePath, imageName) => ipcRenderer.invoke('albums:deleteImage', rootFolder, relativePath, imageName),
  deleteAlbum: (rootFolder, relativePath) => ipcRenderer.invoke('albums:delete', rootFolder, relativePath),
  reverseGeocodeLocation: (location) => ipcRenderer.invoke('location:reverseGeocode', location),
  startLanUpload: () => ipcRenderer.invoke('lanUpload:start'),
  stopLanUpload: () => ipcRenderer.invoke('lanUpload:stop'),
  getLanUploadState: () => ipcRenderer.invoke('lanUpload:getState'),
  consumeLanUploadBatches: () => ipcRenderer.invoke('lanUpload:consumeBatches'),
});
