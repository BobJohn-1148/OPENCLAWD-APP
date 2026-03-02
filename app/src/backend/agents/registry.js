const { id } = require('../util/ids');

class AgentRegistry {
  constructor({ db }) {
    this.db = db;
    this.agents = new Map();
  }

  register(agent) {
    this.agents.set(agent.key, agent);
  }

  audit(action, details = {}, agentKey = null) {
    this.db
      .prepare('INSERT INTO audit_log(id, agent_key, action, details_json, created_at) VALUES(?,?,?,?,?)')
      .run(id('log'), agentKey, action, JSON.stringify(details), Date.now());
  }

  async handleEvent(evt) {
    // Route: if target_agent_key set, send only there. Else broadcast.
    if (evt.target_agent_key) {
      const agent = this.agents.get(evt.target_agent_key);
      if (!agent) return;
      await agent.onEvent(evt, this);
      return;
    }

    for (const agent of this.agents.values()) {
      if (agent.canHandle(evt)) {
        await agent.onEvent(evt, this);
      }
    }
  }
}

module.exports = { AgentRegistry };
