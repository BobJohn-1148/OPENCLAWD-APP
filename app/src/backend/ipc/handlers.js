const { emitEvent } = require('../eventBus/bus');
const { getLatestBrief } = require('../brief/store');
const { ensureAgentRow, setAgentConfig, getAgentConfig } = require('./settings');
const { syncOutboxOnce, getAppSetting, setAppSetting } = require('../sync/outbox');
const { makeId } = require('../util/ids');
const { nowTs } = require('../util/time');

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


  // Local class notes
  ipcMain.handle('notes:list', async (_evt, { classKey, assignmentKey, limit = 200 } = {}) => {
    const classFilter = typeof classKey === 'string' ? classKey.trim() : '';
    const assignmentFilter = typeof assignmentKey === 'string' ? assignmentKey.trim() : '';
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    let rows;
    if (classFilter && assignmentFilter) {
      rows = db
        .prepare('SELECT id, class_key, assignment_key, title, content_md, source, created_at, updated_at FROM class_notes WHERE class_key = ? AND assignment_key = ? ORDER BY updated_at DESC LIMIT ?')
        .all(classFilter, assignmentFilter, safeLimit);
    } else if (classFilter) {
      rows = db
        .prepare('SELECT id, class_key, assignment_key, title, content_md, source, created_at, updated_at FROM class_notes WHERE class_key = ? ORDER BY updated_at DESC LIMIT ?')
        .all(classFilter, safeLimit);
    } else if (assignmentFilter) {
      rows = db
        .prepare('SELECT id, class_key, assignment_key, title, content_md, source, created_at, updated_at FROM class_notes WHERE assignment_key = ? ORDER BY updated_at DESC LIMIT ?')
        .all(assignmentFilter, safeLimit);
    } else {
      rows = db
        .prepare('SELECT id, class_key, assignment_key, title, content_md, source, created_at, updated_at FROM class_notes ORDER BY updated_at DESC LIMIT ?')
        .all(safeLimit);
    }
    return rows;
  });

  ipcMain.handle('notes:classes', async () => {
    const rows = db
      .prepare(`
        SELECT
          class_key,
          assignment_key,
          COUNT(*) AS note_count,
          MAX(updated_at) AS updated_at
        FROM class_notes
        GROUP BY class_key, assignment_key
        ORDER BY class_key ASC, updated_at DESC
      `)
      .all();
    return rows;
  });

  ipcMain.handle('notes:upsert', async (_evt, { id, classKey, assignmentKey, title, contentMd, source } = {}) => {
    const class_key = typeof classKey === 'string' ? classKey.trim() : '';
    const titleSafe = typeof title === 'string' && title.trim() ? title.trim() : 'Untitled note';
    const content_md = typeof contentMd === 'string' ? contentMd : '';
    if (!class_key) throw new Error('class is required');
    if (!content_md.trim()) throw new Error('note content is required');

    const now = Date.now();
    const noteId = (typeof id === 'string' && id.trim()) || `note_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const assignment_key = typeof assignmentKey === 'string' && assignmentKey.trim() ? assignmentKey.trim() : null;
    const src = typeof source === 'string' && source.trim() ? source.trim() : 'pasted';

    db.prepare(`
      INSERT INTO class_notes (id, class_key, assignment_key, title, content_md, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        class_key=excluded.class_key,
        assignment_key=excluded.assignment_key,
        title=excluded.title,
        content_md=excluded.content_md,
        source=excluded.source,
        updated_at=excluded.updated_at
    `).run(noteId, class_key, assignment_key, titleSafe, content_md, src, now, now);

    registry.audit('notes.upserted', { id: noteId, classKey: class_key, assignmentKey: assignment_key }, 'ui');
    return { ok: true, id: noteId };
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
