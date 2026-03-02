const { id } = require('../util/ids');

function ensureAgentRow(db, { key, name }) {
  const existing = db.prepare('SELECT id FROM agents WHERE key = ?').get(key);
  const now = Date.now();
  let agentId = existing?.id;
  if (!agentId) {
    agentId = id('agt');
    db.prepare('INSERT INTO agents(id, key, name, enabled, created_at) VALUES(?,?,?,?,?)').run(agentId, key, name, 1, now);
  }

  const cfg = db.prepare('SELECT id FROM agent_configs WHERE agent_id = ?').get(agentId);
  if (!cfg) {
    db.prepare('INSERT INTO agent_configs(id, agent_id, config_json, updated_at) VALUES(?,?,?,?)').run(
      id('cfg'),
      agentId,
      '{}',
      now
    );
  }

  return agentId;
}

function setAgentConfig(db, agentKey, patch) {
  const agent = db.prepare('SELECT id FROM agents WHERE key = ?').get(agentKey);
  if (!agent) throw new Error('agent not found');
  const row = db.prepare('SELECT config_json FROM agent_configs WHERE agent_id = ?').get(agent.id);
  const current = safeJson(row?.config_json) || {};
  const next = { ...current, ...patch };
  db.prepare('UPDATE agent_configs SET config_json = ?, updated_at = ? WHERE agent_id = ?').run(
    JSON.stringify(next),
    Date.now(),
    agent.id
  );
  return next;
}

function getAgentConfig(db, agentKey) {
  const row = db
    .prepare(
      `SELECT ac.config_json AS config_json
       FROM agent_configs ac
       JOIN agents a ON a.id = ac.agent_id
       WHERE a.key = ?
       LIMIT 1`
    )
    .get(agentKey);
  return safeJson(row?.config_json) || {};
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

module.exports = { ensureAgentRow, setAgentConfig, getAgentConfig };
