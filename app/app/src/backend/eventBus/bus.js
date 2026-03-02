const { id } = require('../util/ids');

function emitEvent(db, evt) {
  const now = Date.now();
  const row = {
    id: evt.id || id('evt'),
    type: evt.type,
    status: evt.status || 'new',
    priority: evt.priority ?? 0,
    source_agent_key: evt.source_agent_key || null,
    target_agent_key: evt.target_agent_key || null,
    correlation_id: evt.correlation_id || null,
    payload_json: JSON.stringify(evt.payload || {}),
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO events (id, type, status, priority, source_agent_key, target_agent_key, correlation_id, payload_json, created_at, updated_at)
     VALUES (@id, @type, @status, @priority, @source_agent_key, @target_agent_key, @correlation_id, @payload_json, @created_at, @updated_at)`
  ).run(row);

  return row;
}

function takeNextEvent(db, { targetAgentKey } = {}) {
  // Minimal single-process dispatcher. Later we can do row-locking.
  const where = ['status = \'new\''];
  const params = {};
  if (targetAgentKey) {
    where.push('(target_agent_key IS NULL OR target_agent_key = @targetAgentKey)');
    params.targetAgentKey = targetAgentKey;
  }

  const row = db
    .prepare(
      `SELECT * FROM events
       WHERE ${where.join(' AND ')}
       ORDER BY priority DESC, created_at ASC
       LIMIT 1`
    )
    .get(params);

  if (!row) return null;

  const now = Date.now();
  db.prepare('UPDATE events SET status = ?, updated_at = ? WHERE id = ?').run('processing', now, row.id);

  return {
    ...row,
    payload: safeJson(row.payload_json),
  };
}

function completeEvent(db, eventId, status = 'done') {
  db.prepare('UPDATE events SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), eventId);
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

module.exports = { emitEvent, takeNextEvent, completeEvent };
