const fetch = require('node-fetch');
const { nowMs } = require('../util/time');
const { ulid } = require('../util/ids');

/**
 * Syncs outbox items from VPS into local SQLite.
 *
 * Protocol (file outbox):
 * - GET {baseUrl}/outbox/index.json -> [{ id, job, createdAt, title, bodyMd, url }]
 * - Each item can be fetched by item.url (absolute or relative to baseUrl)
 */
async function syncOutboxOnce({ db, baseUrl, timeoutMs = 8000 }) {
  if (!baseUrl || typeof baseUrl !== 'string') return { ok: false, reason: 'no_base_url' };
  const base = baseUrl.replace(/\/+$/, '');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const indexUrl = `${base}/outbox/index.json`;
    const res = await fetch(indexUrl, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `index_http_${res.status}` };

    const list = await res.json();
    if (!Array.isArray(list)) return { ok: false, reason: 'index_not_array' };

    const known = new Set(
      db.prepare('SELECT id FROM outbox_items').all().map((r) => r.id)
    );

    let added = 0;

    for (const item of list) {
      const id = String(item?.id || '').trim();
      if (!id || known.has(id)) continue;

      // Fetch detail
      let detail = item;
      if (item?.url) {
        const url = String(item.url);
        const full = url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
        const r2 = await fetch(full, { signal: ctrl.signal });
        if (r2.ok) detail = await r2.json();
      }

      const createdAt = Number(detail?.createdAt || detail?.created_at || nowMs());
      const job = String(detail?.job || 'unknown');
      const title = String(detail?.title || 'Outbox item');
      const bodyMd = String(detail?.bodyMd || detail?.body_md || JSON.stringify(detail, null, 2));

      db.prepare(
        `INSERT INTO outbox_items (id, job, title, body_md, raw_json, created_at, received_at, status)
         VALUES (@id, @job, @title, @body_md, @raw_json, @created_at, @received_at, 'new')`
      ).run({
        id,
        job,
        title,
        body_md: bodyMd,
        raw_json: JSON.stringify(detail),
        created_at: createdAt,
        received_at: nowMs(),
      });

      added++;
    }

    return { ok: true, added };
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function getAppSetting(db, key) {
  const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return null;
  }
}

function setAppSetting(db, key, value) {
  const valueJson = JSON.stringify(value ?? null);
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`
  ).run(key, valueJson, nowMs());
  return value;
}

module.exports = { syncOutboxOnce, getAppSetting, setAppSetting };
