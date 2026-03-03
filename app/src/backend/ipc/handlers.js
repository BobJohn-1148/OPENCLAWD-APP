const { emitEvent } = require('../eventBus/bus');
const { getLatestBrief } = require('../brief/store');
const { ensureAgentRow, setAgentConfig, getAgentConfig } = require('./settings');
const { syncOutboxOnce, getAppSetting, setAppSetting } = require('../sync/outbox');
const { id } = require('../util/ids');

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


  ipcMain.handle('db:clearAudit', async () => {
    const deleted = db.prepare('DELETE FROM audit_log').run().changes;
    registry.audit('audit.cleared', { deleted }, 'ui');
    return { ok: true, deleted };
  });

  ipcMain.handle('db:getAuditStats', async () => {
    const row = db.prepare('SELECT COUNT(*) as total, MAX(created_at) as latestTs FROM audit_log').get();
    return { total: row?.total || 0, latestTs: row?.latestTs || null };
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
      blocks: [{ kind: 'info', text: 'This is a test message from JARVIS.' }],
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



  // Task board
  ipcMain.handle('tasks:list', async () => {
    const rows = db
      .prepare(`SELECT id, title, description, status, priority, owner, created_at, updated_at, completed_at
                FROM task_board_items
                ORDER BY
                  CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
                  CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                  updated_at DESC`)
      .all();
    return rows;
  });

  ipcMain.handle('tasks:create', async (_evt, payload = {}) => {
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) throw new Error('title is required');

    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    const priority = payload.priority == null ? 'medium' : normalizePriority(payload.priority);
    const owner = typeof payload.owner === 'string' && payload.owner.trim() ? payload.owner.trim() : 'openclawd-bot';

    const ts = Date.now();
    const row = {
      id: id('task'),
      title,
      description,
      status: 'todo',
      priority,
      owner,
      created_at: ts,
      updated_at: ts,
      completed_at: null,
    };

    db.prepare(`INSERT INTO task_board_items(id, title, description, status, priority, owner, created_at, updated_at, completed_at)
                VALUES(@id, @title, @description, @status, @priority, @owner, @created_at, @updated_at, @completed_at)`).run(row);

    registry.audit('tasks.created', { id: row.id, title: row.title, priority: row.priority }, 'ui');
    return row;
  });

  ipcMain.handle('tasks:update', async (_evt, payload = {}) => {
    const id = typeof payload.id === 'string' ? payload.id : '';
    if (!id) throw new Error('id is required');

    const existing = db.prepare('SELECT * FROM task_board_items WHERE id = ?').get(id);
    if (!existing) throw new Error('task not found');

    const title = typeof payload.title === 'string' ? payload.title.trim() : existing.title;
    const description = typeof payload.description === 'string' ? payload.description.trim() : existing.description;
    const priority = payload.priority == null ? existing.priority : normalizePriority(payload.priority);
    const status = payload.status == null ? existing.status : normalizeStatus(payload.status);
    const owner = typeof payload.owner === 'string' && payload.owner.trim() ? payload.owner.trim() : existing.owner;

    const ts = Date.now();
    const completedAt = status === 'done' ? (existing.completed_at || ts) : null;

    const row = {
      id,
      title,
      description,
      status,
      priority,
      owner,
      updated_at: ts,
      completed_at: completedAt,
    };

    db.prepare(`UPDATE task_board_items
                SET title=@title, description=@description, status=@status, priority=@priority, owner=@owner, updated_at=@updated_at, completed_at=@completed_at
                WHERE id=@id`).run(row);

    registry.audit('tasks.updated', { id, status, priority }, 'ui');
    return { ...existing, ...row };
  });

  ipcMain.handle('tasks:delete', async (_evt, { id } = {}) => {
    if (typeof id !== 'string' || !id) throw new Error('id is required');

    const existing = db.prepare('SELECT id, title FROM task_board_items WHERE id = ?').get(id);
    if (!existing) return { ok: true };

    db.prepare('DELETE FROM task_board_items WHERE id = ?').run(id);
    registry.audit('tasks.deleted', { id, title: existing.title }, 'ui');
    return { ok: true };
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

function normalizeStatus(status) {
  const val = String(status || '').toLowerCase();
  if (val === 'todo' || val === 'doing' || val === 'done') return val;
  throw new Error('invalid status');
}

function normalizePriority(priority) {
  const val = String(priority || '').toLowerCase();
  if (val === 'low' || val === 'medium' || val === 'high') return val;
  throw new Error('invalid priority');
}

module.exports = { registerIpc };
