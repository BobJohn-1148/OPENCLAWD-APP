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


  // Inbox
  inboxList: (opts) => ipcRenderer.invoke('inbox:list', opts),
  inboxSeedMock: () => ipcRenderer.invoke('inbox:seedMock'),
  inboxGenerateSummary: (payload) => ipcRenderer.invoke('inbox:generateSummary', payload),
  inboxGenerateDraft: (payload) => ipcRenderer.invoke('inbox:generateDraft', payload),

  // ChatGPT
  chatgptGetConfig: () => ipcRenderer.invoke('chatgpt:getConfig'),
  chatgptSetConfig: (payload) => ipcRenderer.invoke('chatgpt:setConfig', payload),
  chatgptAsk: (payload) => ipcRenderer.invoke('chatgpt:ask', payload),

  // Classes
  classesList: (opts) => ipcRenderer.invoke('classes:list', opts),
  classesSemesters: () => ipcRenderer.invoke('classes:semesters'),
  classesUpsert: (payload) => ipcRenderer.invoke('classes:upsert', payload),
  classesDelete: (payload) => ipcRenderer.invoke('classes:delete', payload),

  // Dashboard reminders
  dashboardReminders: () => ipcRenderer.invoke('dashboard:reminders'),

  // Calendar
  calendarList: (opts) => ipcRenderer.invoke('calendar:list', opts),
  calendarCreate: (payload) => ipcRenderer.invoke('calendar:create', payload),
  calendarDelete: (payload) => ipcRenderer.invoke('calendar:delete', payload),
  calendarDismissReminder: (payload) => ipcRenderer.invoke('calendar:dismissReminder', payload),

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
