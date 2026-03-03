const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bob', {
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),

  // Data
  getAudit: (opts) => ipcRenderer.invoke('db:getAudit', opts),
  clearAudit: () => ipcRenderer.invoke('db:clearAudit'),
  getAuditStats: () => ipcRenderer.invoke('db:getAuditStats'),

  // Brief
  requestMorningBrief: () => ipcRenderer.invoke('brief:requestMorning'),
  getLatestBrief: () => ipcRenderer.invoke('brief:getLatest'),

  // Telegram
  telegramGetConfig: () => ipcRenderer.invoke('telegram:getConfig'),
  telegramSetToken: (token) => ipcRenderer.invoke('telegram:setToken', { token }),
  telegramSendTest: () => ipcRenderer.invoke('telegram:sendTest'),

  // VPS outbox sync
  syncGetConfig: () => ipcRenderer.invoke('sync:getConfig'),
  syncSetConfig: ({ enabled, baseUrl }) => ipcRenderer.invoke('sync:setConfig', { enabled, baseUrl }),
  syncRunOnce: () => ipcRenderer.invoke('sync:runOnce'),
  outboxList: (opts) => ipcRenderer.invoke('outbox:list', opts),

  // Task board
  tasksList: () => ipcRenderer.invoke('tasks:list'),
  tasksCreate: (payload) => ipcRenderer.invoke('tasks:create', payload),
  tasksUpdate: (payload) => ipcRenderer.invoke('tasks:update', payload),
  tasksDelete: (id) => ipcRenderer.invoke('tasks:delete', { id }),
});
