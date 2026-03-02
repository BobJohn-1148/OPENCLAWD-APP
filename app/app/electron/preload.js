const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bob', {
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),

  // Data
  getAudit: (opts) => ipcRenderer.invoke('db:getAudit', opts),

  // Brief
  requestMorningBrief: () => ipcRenderer.invoke('brief:requestMorning'),
  getLatestBrief: () => ipcRenderer.invoke('brief:getLatest'),

  // Telegram
  telegramGetConfig: () => ipcRenderer.invoke('telegram:getConfig'),
  telegramSetToken: (token) => ipcRenderer.invoke('telegram:setToken', { token }),
  telegramSendTest: () => ipcRenderer.invoke('telegram:sendTest'),
});
