const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const { openDb } = require('../src/backend/db');
const { AgentRegistry } = require('../src/backend/agents/registry');
const { Dispatcher } = require('../src/backend/eventBus/dispatcher');
const { CortexAgent } = require('../src/backend/agents/cortex');
const { BriefWriterAgent } = require('../src/backend/agents/brief_writer');
const { WeatherAgent, WebSummaryAgent, CalendarAgent, EmailScanAgent } = require('../src/backend/agents/stubs');
const { registerIpc } = require('../src/backend/ipc/handlers');
const { TelegramSenderAgent } = require('../src/backend/agents/telegram_sender');
const { DailyScheduler } = require('../src/backend/scheduler/daily');
const { NoteSummarizerAgent, NoteFlashcardMakerAgent, NoteTaskExtractorAgent } = require('../src/backend/agents/note_tools');

let db;
let registry;
let dispatcher;
let dailyScheduler;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Bob Assistant',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // DB + agents bootstrap
  db = openDb(path.join(app.getPath('appData'), 'BobAssistant', 'bob.db'));
  registry = new AgentRegistry({ db });
  registry.register(CortexAgent);
  registry.register(BriefWriterAgent);
  registry.register(WeatherAgent);
  registry.register(WebSummaryAgent);
  registry.register(CalendarAgent);
  registry.register(EmailScanAgent);
  registry.register(TelegramSenderAgent);
  registry.register(NoteSummarizerAgent);
  registry.register(NoteFlashcardMakerAgent);
  registry.register(NoteTaskExtractorAgent);

  dispatcher = new Dispatcher({ db, registry, intervalMs: 300 });
  dispatcher.start();

  dailyScheduler = new DailyScheduler({ db, registry, timeZone: 'America/Chicago', hour: 7, minute: 30 });
  dailyScheduler.start();

  registerIpc({ ipcMain, db, registry });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (dailyScheduler) dailyScheduler.stop();
  if (dispatcher) dispatcher.stop();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('openExternal', async (_evt, url) => {
  await shell.openExternal(url);
  return true;
});
