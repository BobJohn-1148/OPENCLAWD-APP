const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const { emitEvent } = require('../eventBus/bus');
const { getLatestBrief } = require('../brief/store');
const { ensureAgentRow, setAgentConfig, getAgentConfig } = require('./settings');
const { getAppSetting, setAppSetting } = require('../sync/outbox');

function registerIpc({ ipcMain, db, registry }) {
  ensureInboxSchema(db);

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

  // Local-only mode: VPS sync disabled
  ipcMain.handle('sync:getConfig', async () => {
    return { enabled: false, baseUrl: '', mode: 'local-only' };
  });

  ipcMain.handle('sync:setConfig', async () => {
    setAppSetting(db, 'vps_sync', { enabled: false, baseUrl: '', mode: 'local-only' });
    registry.audit('sync.config.updated', { enabled: false, mode: 'local-only' }, 'ui');
    return { ok: true, mode: 'local-only' };
  });

  ipcMain.handle('sync:runOnce', async () => {
    return { ok: false, reason: 'local_only_mode' };
  });

  // Google OAuth (Gmail + Calendar)
  ipcMain.handle('google:getConfig', async () => {
    return getAppSetting(db, 'google_oauth_config') || { clientId: '' };
  });

  ipcMain.handle('google:setConfig', async (_evt, { clientId } = {}) => {
    const next = { clientId: typeof clientId === 'string' ? clientId.trim() : '' };
    setAppSetting(db, 'google_oauth_config', next);
    registry.audit('google.config.updated', { hasClientId: Boolean(next.clientId) }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('google:status', async () => {
    const cfg = getAppSetting(db, 'google_oauth_config') || { clientId: '' };
    const tok = getAppSetting(db, 'google_oauth_tokens') || null;
    return {
      connected: Boolean(tok?.refresh_token || tok?.access_token),
      hasClientId: Boolean(cfg.clientId),
      tokenExpiry: tok?.expires_at || null,
    };
  });

  ipcMain.handle('google:disconnect', async () => {
    setAppSetting(db, 'google_oauth_tokens', {});
    registry.audit('google.disconnected', {}, 'ui');
    return { ok: true };
  });

  ipcMain.handle('google:connect', async () => {
    const cfg = getAppSetting(db, 'google_oauth_config') || { clientId: '' };
    if (!cfg.clientId) throw new Error('Google client ID is required in Settings');

    const redirectUri = 'http://127.0.0.1:53682/oauth2callback';
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', cfg.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('scope', [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
    ].join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const code = await waitForGoogleAuthCode({ expectedState: state, port: 53682, urlToOpen: authUrl.toString() });

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) throw new Error(`token exchange failed: ${JSON.stringify(tokenJson)}`);

    const now = Date.now();
    const tok = {
      access_token: tokenJson.access_token || '',
      refresh_token: tokenJson.refresh_token || '',
      expires_at: now + (Number(tokenJson.expires_in || 3600) * 1000),
      scope: tokenJson.scope || '',
      token_type: tokenJson.token_type || 'Bearer',
    };
    setAppSetting(db, 'google_oauth_tokens', tok);
    registry.audit('google.connected', { hasRefreshToken: Boolean(tok.refresh_token) }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('inbox:syncGoogle', async () => {
    const accessToken = await ensureGoogleAccessToken({ db });
    if (!accessToken) return { ok: false, reason: 'not_connected' };

    const listResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:inbox', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listJson = await listResp.json();
    if (!listResp.ok) throw new Error(`gmail list failed: ${JSON.stringify(listJson)}`);

    const messages = listJson.messages || [];
    const now = Date.now();
    for (const m of messages) {
      const msgResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const msgJson = await msgResp.json();
      if (!msgResp.ok) continue;
      const headers = msgJson.payload?.headers || [];
      const getH = (name) => headers.find((h) => String(h.name).toLowerCase() == name.toLowerCase())?.value || '';
      const fromName = getH('From') || 'Unknown sender';
      const subject = getH('Subject') || '(no subject)';
      const snippet = msgJson.snippet || '';
      const received = Number(msgJson.internalDate || now);
      db.prepare(`INSERT OR REPLACE INTO inbox_messages (id, from_name, subject, body_text, triage_label, is_pinned, archived_at, received_at, created_at) VALUES (?, ?, ?, ?, COALESCE((SELECT triage_label FROM inbox_messages WHERE id = ?), ''), COALESCE((SELECT is_pinned FROM inbox_messages WHERE id = ?), 0), COALESCE((SELECT archived_at FROM inbox_messages WHERE id = ?), NULL), ?, ?)`)
        .run(`gmail_${m.id}`, fromName, subject, snippet, `gmail_${m.id}`, `gmail_${m.id}`, `gmail_${m.id}`, received, now);
    }

    registry.audit('inbox.synced.google', { count: messages.length }, 'ui');
    return { ok: true, count: messages.length };
  });

  ipcMain.handle('calendar:syncGoogle', async () => {
    const accessToken = await ensureGoogleAccessToken({ db });
    if (!accessToken) return { ok: false, reason: 'not_connected' };

    const timeMin = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
    const calResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=50&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const calJson = await calResp.json();
    if (!calResp.ok) throw new Error(`calendar sync failed: ${JSON.stringify(calJson)}`);

    const events = calJson.items || [];
    const now = Date.now();
    for (const e of events) {
      const start = Date.parse(e.start?.dateTime || e.start?.date || '');
      if (!Number.isFinite(start)) continue;
      const end = Date.parse(e.end?.dateTime || e.end?.date || '') || null;
      const reminder = Number(e.reminders?.overrides?.[0]?.minutes ?? 30);
      db.prepare('INSERT OR REPLACE INTO calendar_events (id, title, description, start_at, end_at, reminder_minutes, reminder_dismissed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
        .run(`gcal_${e.id}`, e.summary || '(untitled)', e.description || '', start, end, reminder, now, now);
    }

    registry.audit('calendar.synced.google', { count: events.length }, 'ui');
    return { ok: true, count: events.length };
  });

  // Calendar events + reminders (local now; can be synced to Google Calendar later)
  ipcMain.handle('calendar:list', async (_evt, { limit = 200 } = {}) => {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    const now = Date.now();
    const rows = db
      .prepare('SELECT id, title, description, start_at, end_at, reminder_minutes, reminder_dismissed, created_at, updated_at FROM calendar_events ORDER BY start_at ASC LIMIT ?')
      .all(safeLimit)
      .map((r) => {
        const reminderAt = r.start_at - (Number(r.reminder_minutes || 0) * 60 * 1000);
        const reminderDue = !r.reminder_dismissed && Number(r.reminder_minutes || 0) >= 0 && reminderAt <= now;
        return { ...r, reminder_due: reminderDue, reminder_at: reminderAt };
      });
    return rows;
  });

  ipcMain.handle('calendar:create', async (_evt, { title, description, startAt, endAt, reminderMinutes } = {}) => {
    const titleSafe = typeof title === 'string' ? title.trim() : '';
    if (!titleSafe) throw new Error('title is required');

    const start = Number(startAt);
    if (!Number.isFinite(start)) throw new Error('valid start time is required');
    const end = endAt == null || endAt === '' ? null : Number(endAt);
    if (end != null && (!Number.isFinite(end) || end < start)) throw new Error('end time must be after start time');

    const reminder = Math.max(0, Math.min(24 * 60, Number(reminderMinutes) || 0));
    const now = Date.now();
    const eventId = `cal_${now}_${Math.random().toString(36).slice(2, 8)}`;

    db.prepare(`
      INSERT INTO calendar_events (id, title, description, start_at, end_at, reminder_minutes, reminder_dismissed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      eventId,
      titleSafe,
      typeof description === 'string' ? description.trim() : '',
      start,
      end,
      reminder,
      now,
      now
    );

    const accessToken = await ensureGoogleAccessToken({ db });
    if (accessToken) {
      const gRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          summary: titleSafe,
          description: typeof description === 'string' ? description.trim() : '',
          start: { dateTime: new Date(start).toISOString() },
          end: end ? { dateTime: new Date(end).toISOString() } : undefined,
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: reminder }] },
        }),
      });
      const gJson = await gRes.json();
      if (gRes.ok && gJson?.id) {
        db.prepare('UPDATE calendar_events SET id = ?, updated_at = ? WHERE id = ?').run(`gcal_${gJson.id}`, Date.now(), eventId);
      }
    }

    registry.audit('calendar.event.created', { id: eventId, title: titleSafe, startAt: start, reminderMinutes: reminder }, 'ui');
    return { ok: true, id: eventId };
  });

  ipcMain.handle('calendar:delete', async (_evt, { id } = {}) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('id is required');
    const cleanId = id.trim();
    if (cleanId.startsWith('gcal_')) {
      const accessToken = await ensureGoogleAccessToken({ db });
      if (accessToken) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(cleanId.replace('gcal_', ''))}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    }
    db.prepare('DELETE FROM calendar_events WHERE id = ?').run(cleanId);
    registry.audit('calendar.event.deleted', { id: cleanId }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('calendar:dismissReminder', async (_evt, { id } = {}) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('id is required');
    db.prepare('UPDATE calendar_events SET reminder_dismissed = 1, updated_at = ? WHERE id = ?').run(Date.now(), id.trim());
    registry.audit('calendar.reminder.dismissed', { id: id.trim() }, 'ui');
    return { ok: true };
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


  // Inbox viewer + on-demand summary/draft generation
  ipcMain.handle('inbox:list', async (_evt, { limit = 200 } = {}) => {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    return db
      .prepare('SELECT id, from_name, subject, body_text, triage_label, is_pinned, archived_at, received_at, created_at FROM inbox_messages ORDER BY is_pinned DESC, received_at DESC LIMIT ?')
      .all(safeLimit);
  });



  ipcMain.handle('inbox:generateSummary', async (_evt, { messageId } = {}) => {
    const msg = db.prepare('SELECT * FROM inbox_messages WHERE id = ?').get(messageId);
    if (!msg) throw new Error('message not found');
    const text = `Summary:
• From: ${msg.from_name}
• Subject: ${msg.subject}
• Key point: ${msg.body_text.slice(0, 220)}${msg.body_text.length > 220 ? '…' : ''}`;
    const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare('INSERT INTO inbox_outputs (id, kind, target_message_id, content_text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'summary', msg.id, text, Date.now());
    registry.audit('inbox.summary.generated', { messageId: msg.id }, 'ui');
    return { ok: true, content: text };
  });

  ipcMain.handle('inbox:generateDraft', async (_evt, { messageId } = {}) => {
    const msg = db.prepare('SELECT * FROM inbox_messages WHERE id = ?').get(messageId);
    if (!msg) throw new Error('message not found');
    const draft = `Hi ${msg.from_name},

Thanks for the update regarding "${msg.subject}". I received your message and will follow up accordingly.

Best,
Jack`;
    const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare('INSERT INTO inbox_outputs (id, kind, target_message_id, content_text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'draft', msg.id, draft, Date.now());
    registry.audit('inbox.draft.generated', { messageId: msg.id }, 'ui');
    return { ok: true, content: draft };
  });

  ipcMain.handle('inbox:pin', async (_evt, { messageId, pinned } = {}) => {
    if (typeof messageId !== 'string' || !messageId.trim()) throw new Error('messageId is required');
    const nextPinned = pinned ? 1 : 0;
    db.prepare('UPDATE inbox_messages SET is_pinned = ? WHERE id = ?').run(nextPinned, messageId.trim());
    registry.audit('inbox.triage.pinned', { messageId: messageId.trim(), pinned: Boolean(nextPinned) }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('inbox:label', async (_evt, { messageId, label } = {}) => {
    if (typeof messageId !== 'string' || !messageId.trim()) throw new Error('messageId is required');
    const nextLabel = typeof label === 'string' ? label.trim().slice(0, 60) : '';
    db.prepare('UPDATE inbox_messages SET triage_label = ? WHERE id = ?').run(nextLabel, messageId.trim());
    registry.audit('inbox.triage.labeled', { messageId: messageId.trim(), label: nextLabel }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('inbox:archive', async (_evt, { messageId, archived } = {}) => {
    if (typeof messageId !== 'string' || !messageId.trim()) throw new Error('messageId is required');
    const archivedAt = archived ? Date.now() : null;
    db.prepare('UPDATE inbox_messages SET archived_at = ? WHERE id = ?').run(archivedAt, messageId.trim());
    registry.audit('inbox.triage.archived', { messageId: messageId.trim(), archived: Boolean(archivedAt) }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('inbox:aiCategorize', async (_evt, { messageId } = {}) => {
    const msg = db.prepare('SELECT * FROM inbox_messages WHERE id = ?').get(messageId);
    if (!msg) throw new Error('message not found');
    const text = `${msg.subject}
${msg.body_text}`.toLowerCase();

    let label = 'General';
    let archived = 0;
    let pinned = 0;

    if (/deadline|due|exam|assignment|quiz|hw|project/.test(text)) {
      label = 'Class';
      pinned = 1;
    } else if (/registration|billing|account|financial|policy|security/.test(text)) {
      label = 'Admin';
    } else if (/meet|meeting|schedule|calendar|invite|thursday|monday|friday/.test(text)) {
      label = 'Meeting';
    }

    if (/newsletter|promo|promotion|sale|unsubscribe/.test(text)) {
      label = 'Low Priority';
      archived = 1;
      pinned = 0;
    }

    db.prepare('UPDATE inbox_messages SET triage_label = ?, is_pinned = ?, archived_at = ? WHERE id = ?')
      .run(label, pinned, archived ? Date.now() : null, msg.id);

    const result = `AI triage applied → label: ${label}, pinned: ${pinned ? 'yes' : 'no'}, archived: ${archived ? 'yes' : 'no'}.`;
    const outId = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare('INSERT INTO inbox_outputs (id, kind, target_message_id, content_text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(outId, 'summary', msg.id, result, Date.now());

    registry.audit('inbox.triage.ai_categorized', { messageId: msg.id, label, pinned: Boolean(pinned), archived: Boolean(archived) }, 'ui');
    return { ok: true, label, pinned: Boolean(pinned), archived: Boolean(archived), content: result };
  });

  // ChatGPT configuration + ask endpoint (manual use from UI)
  ipcMain.handle('chatgpt:getConfig', async () => {
    return getAppSetting(db, 'chatgpt_config') || { apiKey: '', model: 'gpt-4o-mini', systemPrompt: '' };
  });

  ipcMain.handle('chatgpt:setConfig', async (_evt, payload = {}) => {
    const next = {
      apiKey: typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '',
      model: typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : 'gpt-4o-mini',
      systemPrompt: typeof payload.systemPrompt === 'string' ? payload.systemPrompt : '',
    };
    setAppSetting(db, 'chatgpt_config', next);
    registry.audit('chatgpt.config.updated', { hasKey: Boolean(next.apiKey), model: next.model }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('chatgpt:ask', async (_evt, { prompt } = {}) => {
    const q = typeof prompt === 'string' ? prompt.trim() : '';
    if (!q) throw new Error('prompt required');
    const cfg = getAppSetting(db, 'chatgpt_config') || { apiKey: '', model: 'gpt-4o-mini', systemPrompt: '' };
    if (!cfg.apiKey) {
      return { ok: true, content: 'ChatGPT key not configured yet. Add API key in Settings → ChatGPT first.' };
    }
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [
          ...(cfg.systemPrompt ? [{ role: 'system', content: cfg.systemPrompt }] : []),
          { role: 'user', content: q },
        ],
        temperature: 0.4,
      }),
    });
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || `OpenAI API error: ${JSON.stringify(data)}`;
    registry.audit('chatgpt.ask.completed', { model: cfg.model || 'gpt-4o-mini', ok: resp.ok }, 'ui');
    return { ok: true, content };
  });

  // Classes by semester (manual data entry)
  ipcMain.handle('classes:list', async (_evt, { semesterKey } = {}) => {
    const sem = typeof semesterKey === 'string' ? semesterKey.trim() : '';
    if (sem) {
      return db.prepare('SELECT * FROM class_profiles WHERE semester_key = ? ORDER BY class_code ASC').all(sem);
    }
    return db.prepare('SELECT * FROM class_profiles ORDER BY semester_key DESC, class_code ASC').all();
  });

  ipcMain.handle('classes:semesters', async () => {
    return db.prepare('SELECT semester_key, COUNT(*) AS class_count, MAX(updated_at) AS updated_at FROM class_profiles GROUP BY semester_key ORDER BY semester_key DESC').all();
  });

  ipcMain.handle('classes:upsert', async (_evt, payload = {}) => {
    const semesterKey = typeof payload.semesterKey === 'string' ? payload.semesterKey.trim() : '';
    const classCode = typeof payload.classCode === 'string' ? payload.classCode.trim() : '';
    const className = typeof payload.className === 'string' ? payload.className.trim() : '';
    if (!semesterKey || !classCode || !className) throw new Error('semester, class code and class name are required');
    const now = Date.now();
    const id = (typeof payload.id === 'string' && payload.id.trim()) || `class_${now}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO class_profiles (id, semester_key, class_code, class_name, instructor, meeting_schedule, location, notes_md, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        semester_key=excluded.semester_key,
        class_code=excluded.class_code,
        class_name=excluded.class_name,
        instructor=excluded.instructor,
        meeting_schedule=excluded.meeting_schedule,
        location=excluded.location,
        notes_md=excluded.notes_md,
        updated_at=excluded.updated_at
    `).run(
      id,
      semesterKey,
      classCode,
      className,
      typeof payload.instructor === 'string' ? payload.instructor.trim() : '',
      typeof payload.meetingSchedule === 'string' ? payload.meetingSchedule.trim() : '',
      typeof payload.location === 'string' ? payload.location.trim() : '',
      typeof payload.notesMd === 'string' ? payload.notesMd : '',
      now,
      now
    );
    registry.audit('classes.upserted', { id, semesterKey, classCode }, 'ui');
    return { ok: true, id };
  });

  ipcMain.handle('classes:delete', async (_evt, { id } = {}) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('id is required');
    db.prepare('DELETE FROM class_profiles WHERE id = ?').run(id.trim());
    registry.audit('classes.deleted', { id: id.trim() }, 'ui');
    return { ok: true };
  });

  ipcMain.handle('classes:seedProvided', async () => {
    const now = Date.now();
    const semesterKey = 'Spring 2026';
    const classes = [
      { classCode: 'CPSC 30000 001', className: 'Computer Organization', instructor: 'Biryukov', meetingSchedule: 'Online | Jan 20, 2026 – May 16, 2026 | TBA', location: 'Online Meeting', notesMd: 'CRN: 11054 | Credits: 3.000 | Level: UG' },
      { classCode: 'CPSC 35000 001', className: 'Operating Systems', instructor: 'Clavelli', meetingSchedule: 'TR 9:30 am - 10:45 am | Jan 20, 2026 – May 16, 2026', location: 'Academic Science Center AS 102A', notesMd: 'CRN: 11089 | Credits: 3.000 | Level: UG' },
      { classCode: 'INSY 30100 001', className: 'ISC2 Systems Security Certified Practitioner (SSCP)', instructor: 'TBA / Plass', meetingSchedule: 'F 6:00 pm - 9:00 pm and S 9:00 am - 5:00 pm | Apr 17-18, 2026', location: 'Academic Science Center AS 104A', notesMd: 'CRN: 12568 | Credits: 1.000 | Level: UG' },
      { classCode: 'INSY 35000 001', className: 'Cybersecurity Policy and Strategy', instructor: 'Plass', meetingSchedule: 'F 1:00 pm - 1:50 pm (Online) and MW 1:00 pm - 1:50 pm (In-person) | Jan 20, 2026 – May 16, 2026', location: 'Online Meeting / Academic Science Center AS 102A', notesMd: 'CRN: 11272 | Credits: 3.000 | Level: UG' },
      { classCode: 'PHIL 11200 001', className: 'Philosophy for Self Care', instructor: 'Davis', meetingSchedule: 'MWF 10:00 am - 10:50 am | Jan 20, 2026 – May 16, 2026', location: 'De La Salle DL 250', notesMd: 'CRN: 12015 | Credits: 3.000 | Level: UG' },
      { classCode: 'THEO 10000 002', className: 'Search for Faith', instructor: 'Collett', meetingSchedule: 'MWF 11:00 am - 11:50 am | Jan 20, 2026 – May 16, 2026', location: 'St Charles Borromeo SB 141', notesMd: 'CRN: 10720 | Credits: 3.000 | Level: UG' },
    ];

    for (const c of classes) {
      const id = `class_seed_${c.classCode.replace(/\s+/g, '_').toLowerCase()}`;
      db.prepare(`
        INSERT INTO class_profiles (id, semester_key, class_code, class_name, instructor, meeting_schedule, location, notes_md, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          semester_key=excluded.semester_key,
          class_code=excluded.class_code,
          class_name=excluded.class_name,
          instructor=excluded.instructor,
          meeting_schedule=excluded.meeting_schedule,
          location=excluded.location,
          notes_md=excluded.notes_md,
          updated_at=excluded.updated_at
      `).run(id, semesterKey, c.classCode, c.className, c.instructor, c.meetingSchedule, c.location, c.notesMd, now, now);
    }

    registry.audit('classes.seeded.provided', { semesterKey, count: classes.length }, 'ui');
    return { ok: true, semesterKey, count: classes.length };
  });

  ipcMain.handle('dashboard:reminders', async () => {
    const now = Date.now();
    const soon = now + 7 * 24 * 60 * 60 * 1000;
    return db
      .prepare('SELECT id, title, start_at, reminder_minutes, reminder_dismissed FROM calendar_events WHERE start_at BETWEEN ? AND ? ORDER BY start_at ASC LIMIT 30')
      .all(now, soon)
      .map((r) => {
        const reminderAt = r.start_at - Number(r.reminder_minutes || 0) * 60 * 1000;
        return { ...r, reminder_at: reminderAt, reminder_due: !r.reminder_dismissed && reminderAt <= now };
      });
  });

  ipcMain.handle('outbox:list', async (_evt, { limit = 50 } = {}) => {
    const rows = db
      .prepare('SELECT id, job, title, body_md, created_at, received_at, status FROM outbox_items ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(200, Math.max(1, limit)));
    return rows;
  });
}

function ensureInboxSchema(db) {
  const columns = db.prepare('PRAGMA table_info(inbox_messages)').all();
  const has = (name) => columns.some((c) => c.name === name);
  if (!has('triage_label')) db.prepare("ALTER TABLE inbox_messages ADD COLUMN triage_label TEXT NOT NULL DEFAULT ''").run();
  if (!has('is_pinned')) db.prepare('ALTER TABLE inbox_messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0').run();
  if (!has('archived_at')) db.prepare('ALTER TABLE inbox_messages ADD COLUMN archived_at INTEGER').run();
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


function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function waitForGoogleAuthCode({ expectedState, port, urlToOpen, timeoutMs = 180000 }) {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const done = (err, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { server.close(); } catch {}
      if (err) reject(err);
      else resolve(code);
    };

    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, `http://127.0.0.1:${port}`);
        if (u.pathname !== '/oauth2callback') {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const state = u.searchParams.get('state') || '';
        const code = u.searchParams.get('code') || '';
        if (state !== expectedState || !code) {
          res.statusCode = 400;
          res.end('Invalid OAuth response.');
          done(new Error('invalid oauth callback'));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end('<html><body style="font-family:sans-serif;padding:24px">Connected. You can close this window and return to Bob Assistant.</body></html>');
        done(null, code);
      } catch (e) {
        done(e);
      }
    });

    server.listen(port, '127.0.0.1', async () => {
      try {
        await shell.openExternal(urlToOpen);
      } catch {}
    });

    const timer = setTimeout(() => done(new Error('google auth timed out')), timeoutMs);
  });
}

async function ensureGoogleAccessToken({ db }) {
  const cfg = getAppSetting(db, 'google_oauth_config') || { clientId: '' };
  const tok = getAppSetting(db, 'google_oauth_tokens') || {};
  if (!cfg.clientId) return null;
  if (tok.access_token && Number(tok.expires_at || 0) > Date.now() + 15000) return tok.access_token;
  if (!tok.refresh_token) return tok.access_token || null;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
    }),
  });
  const json = await resp.json();
  if (!resp.ok) return null;
  const next = {
    ...tok,
    access_token: json.access_token || tok.access_token || '',
    expires_at: Date.now() + (Number(json.expires_in || 3600) * 1000),
    token_type: json.token_type || tok.token_type || 'Bearer',
  };
  setAppSetting(db, 'google_oauth_tokens', next);
  return next.access_token;
}

module.exports = { registerIpc };
