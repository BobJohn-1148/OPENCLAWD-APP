const { emitEvent } = require('../eventBus/bus');
const { getLatestBrief } = require('../brief/store');
const { ensureAgentRow, setAgentConfig, getAgentConfig } = require('./settings');
const { syncOutboxOnce, getAppSetting, setAppSetting } = require('../sync/outbox');

function registerIpc({ ipcMain, db, registry }) {
  // Ensure important agents exist in DB
  ensureAgentRow(db, { key: 'telegram_sender', name: 'Telegram Sender' });
  ipcMain.handle('db:getAudit', async (_evt, { limit = 200 } = {}) => {
    const rows = db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(1000, Math.max(1, limit)));
    return rows.map((r) => ({
      ...r,
      details: safeJson(r.details_json),
    }));
  });

  ipcMain.handle('brief:requestMorning', async () => {
    const evt = emitEvent(db, { type: 'brief.requested', source_agent_key: 'ui', payload: {} });
    registry.audit('ui.brief.requested', { eventId: evt.id }, 'ui');
    return { ok: true, eventId: evt.id };
  });

  ipcMain.handle('brief:getLatest', async () => {
    const row = getLatestBrief(db);
    return row?.brief || null;
  });

  // Telegram settings
  ipcMain.handle('telegram:getConfig', async () => {
    return getAgentConfig(db, 'telegram_sender');
  });

  ipcMain.handle('telegram:setToken', async (_evt, { token }) => {
    if (typeof token !== 'string' || token.trim().length < 20) throw new Error('invalid token');
    const next = setAgentConfig(db, 'telegram_sender', { token: token.trim() });
    registry.audit('telegram.config.updated', { hasToken: Boolean(next.token) }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('telegram:sendTest', async () => {
    const brief = (getLatestBrief(db)?.brief) || {
      title: 'Morning Brief (test)',
      blocks: [{ kind: 'info', text: 'This is a test message from Bob Assistant.' }],
    };
    emitEvent(db, { type: 'telegram.test_send', source_agent_key: 'ui', target_agent_key: 'telegram_sender', payload: { brief } });
    return { ok: true };
  });

  // VPS sync (outbox)
  ipcMain.handle('sync:getConfig', async () => {
    return getAppSetting(db, 'vps_sync') || { enabled: false, baseUrl: '' };
  });

  ipcMain.handle('sync:setConfig', async (_evt, { enabled, baseUrl }) => {
    const next = {
      enabled: Boolean(enabled),
      baseUrl: typeof baseUrl === 'string' ? baseUrl.trim() : '',
    };
    setAppSetting(db, 'vps_sync', next);
    registry.audit('sync.config.updated', { enabled: next.enabled, hasBaseUrl: Boolean(next.baseUrl) }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('sync:runOnce', async () => {
    const cfg = getAppSetting(db, 'vps_sync') || { enabled: false, baseUrl: '' };
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const res = await syncOutboxOnce({ db, baseUrl: cfg.baseUrl });
    registry.audit('sync.outbox.run', res, 'sync');
    return res;
  });

  ipcMain.handle('outbox:list', async (_evt, { limit = 50 } = {}) => {
    const rows = db
      .prepare('SELECT id, job, title, body_md, created_at, received_at, status FROM outbox_items ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(200, Math.max(1, limit)));
    return rows;
  });
}


function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

module.exports = { registerIpc };
