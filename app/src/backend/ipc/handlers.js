const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { emitEvent } = require('../eventBus/bus');
const { getLatestBrief } = require('../brief/store');
const { ensureAgentRow, setAgentConfig, getAgentConfig } = require('./settings');
const { syncOutboxOnce, getAppSetting, setAppSetting } = require('../sync/outbox');

function registerIpc({ ipcMain, db, registry }) {
  // Ensure important agents exist in DB
  ensureAgentRow(db, { key: 'telegram_sender', name: 'Telegram Sender' });
  ensureAgentRow(db, { key: 'note_summarizer', name: 'Note Summarizer' });
  ensureAgentRow(db, { key: 'note_flashcard_maker', name: 'Note Flashcard Maker' });
  ensureAgentRow(db, { key: 'note_task_extractor', name: 'Note Task Extractor' });

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

  ipcMain.handle('notes:dashboard', async () => {
    const totals = db.prepare('SELECT COUNT(*) AS count, MAX(updated_at) AS last_updated FROM class_notes').get();
    const classCount = db.prepare('SELECT COUNT(DISTINCT class_key) AS count FROM class_notes').get();
    const assignmentCount = db.prepare('SELECT COUNT(DISTINCT assignment_key) AS count FROM class_notes WHERE assignment_key IS NOT NULL').get();
    const topClasses = db
      .prepare('SELECT class_key, COUNT(*) AS note_count, MAX(updated_at) AS updated_at FROM class_notes GROUP BY class_key ORDER BY note_count DESC, updated_at DESC LIMIT 8')
      .all();
    return {
      totalNotes: totals?.count || 0,
      classCount: classCount?.count || 0,
      assignmentCount: assignmentCount?.count || 0,
      lastUpdated: totals?.last_updated || null,
      topClasses,
    };
  });

  ipcMain.handle('notes:obsidianGetConfig', async () => {
    return getAppSetting(db, 'obsidian_notes') || { vaultPath: '', enabled: false };
  });

  ipcMain.handle('notes:obsidianSetConfig', async (_evt, { vaultPath, enabled } = {}) => {
    const next = {
      vaultPath: typeof vaultPath === 'string' ? vaultPath.trim() : '',
      enabled: Boolean(enabled),
    };
    setAppSetting(db, 'obsidian_notes', next);
    registry.audit('notes.obsidian.config.updated', { enabled: next.enabled, hasPath: Boolean(next.vaultPath) }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('notes:obsidianImport', async (_evt, { vaultPath } = {}) => {
    const root = typeof vaultPath === 'string' && vaultPath.trim() ? vaultPath.trim() : '';
    if (!root) throw new Error('vault path is required');
    if (!fs.existsSync(root)) throw new Error('vault path does not exist');

    const files = walkMarkdown(root).slice(0, 3000);
    const now = Date.now();
    let imported = 0;
    for (const filePath of files) {
      const rel = path.relative(root, filePath);
      const parts = rel.split(path.sep).filter(Boolean);
      const classKey = parts[0] || 'Obsidian';
      const assignmentKey = parts.length > 2 ? parts[1] : null;
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.trim()) continue;
      const title = extractTitle(content) || path.basename(filePath, '.md');
      const stableId = `obs_${crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 18)}`;

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
      `).run(stableId, classKey, assignmentKey, title, content, 'obsidian', now, now);
      imported += 1;
    }

    registry.audit('notes.obsidian.imported', { imported, root }, 'ui');
    return { ok: true, imported, scanned: files.length };
  });

  ipcMain.handle('notes:aiAction', async (_evt, { action, noteId } = {}) => {
    const row = db
      .prepare('SELECT id, class_key, assignment_key, title, content_md FROM class_notes WHERE id = ?')
      .get(noteId);
    if (!row) throw new Error('note not found');

    const map = {
      summary: 'note_summarizer',
      flashcards: 'note_flashcard_maker',
      tasks: 'note_task_extractor',
    };
    const target = map[action];
    if (!target) throw new Error('invalid ai action');

    const correlationId = `notes_ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    emitEvent(db, {
      type: `notes.ai.${action}.requested`,
      source_agent_key: 'ui',
      target_agent_key: target,
      correlation_id: correlationId,
      payload: { note: row },
    });

    const started = Date.now();
    while (Date.now() - started < 4000) {
      const ev = db
        .prepare('SELECT payload_json FROM events WHERE type = ? AND correlation_id = ? ORDER BY created_at DESC LIMIT 1')
        .get('notes.ai.result', correlationId);
      if (ev?.payload_json) {
        const payload = safeJson(ev.payload_json);
        return { ok: true, payload };
      }
      await delay(120);
    }

    return { ok: false, reason: 'timeout' };
  });

  ipcMain.handle('outbox:list', async (_evt, { limit = 50 } = {}) => {
    const rows = db
      .prepare('SELECT id, job, title, body_md, created_at, received_at, status FROM outbox_items ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(200, Math.max(1, limit)));
    return rows;
  });
}

function walkMarkdown(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
    }
  }
  return out;
}

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  if (m) return String(m[1] || '').trim();
  return '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

module.exports = { registerIpc };
