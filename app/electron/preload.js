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

  // VPS outbox sync
  syncGetConfig: () => ipcRenderer.invoke('sync:getConfig'),
  syncSetConfig: ({ enabled, baseUrl }) => ipcRenderer.invoke('sync:setConfig', { enabled, baseUrl }),
  syncRunOnce: () => ipcRenderer.invoke('sync:runOnce'),
  outboxList: (opts) => ipcRenderer.invoke('outbox:list', opts),

  // Notes
  notesList: (opts) => ipcRenderer.invoke('notes:list', opts),
  notesClasses: () => ipcRenderer.invoke('notes:classes'),
  notesDashboard: () => ipcRenderer.invoke('notes:dashboard'),
  notesUpsert: (payload) => ipcRenderer.invoke('notes:upsert', payload),
  notesObsidianGetConfig: () => ipcRenderer.invoke('notes:obsidianGetConfig'),
  notesObsidianSetConfig: (payload) => ipcRenderer.invoke('notes:obsidianSetConfig', payload),
  notesObsidianImport: (payload) => ipcRenderer.invoke('notes:obsidianImport', payload),
  notesAiAction: (payload) => ipcRenderer.invoke('notes:aiAction', payload),
});
